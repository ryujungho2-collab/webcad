import { validateCommand, type CadCommand } from "@agent-webcad/cad-commands";
import type { CadDocument } from "@agent-webcad/cad-document";
import type { CopilotPlan, CopilotGhost } from "./copilotPlan";

export type CopilotConnection={mode:"rules"|"gateway";endpoint:string};
export const COPILOT_CAPABILITIES=["create-drawing","create-primitive"] as const;
const MAX_BYTES=65536;

/** Credentials belong to the user's gateway. No provider key is stored in a CAD document. */
export function validateCopilotEndpoint(endpoint:string,base:string):string {
  const url=new URL(endpoint,base);
  if(!endpoint.trim()||url.username||url.password||url.hash||url.search)throw new Error("Use a gateway URL without credentials, query parameters or a fragment.");
  if(url.protocol!=="https:"&&!(url.protocol==="http:"&&["localhost","127.0.0.1","[::1]"].includes(url.hostname)))throw new Error("Use HTTPS or a local development gateway.");
  return url.href;
}

export function copilotRequest(prompt:string,document:CadDocument,selection:string[],workPlane:string){
  if(!prompt.trim()||prompt.length>4000)throw new Error("Enter a prompt of 1–4000 characters.");
  const features=new Map(Object.values(document.features).map(f=>[f.output,f]));
  const selected=[...new Set(selection)].slice(0,50).flatMap(id=>{
    const object=document.objects[id],feature=features.get(id);if(!object)return [];
    return [{id,name:object.name.slice(0,200),type:feature?.type,kind:feature?.params.kind,locked:!!document.layers[object.layerId]?.locked,inputs:feature?.inputs.slice(0,50)??[]}];
  });
  return {version:1,prompt,capabilities:COPILOT_CAPABILITIES,context:{documentId:document.id,revision:document.revision,units:"mm",workPlane,selected,selectionTruncated:selection.length>50}};
}

export function validateCopilotResponse(value:unknown):CopilotPlan {
  if(!value||typeof value!=="object")throw new Error("Gateway returned no plan. Return a version 1 command proposal.");
  const response=value as Record<string,unknown>;
  if(response.version!==1||!validateCommand(response.command))throw new Error("Gateway returned an invalid version or CAD command. Correct the proposal and Plan again.");
  const command=response.command as CadCommand,commands=command.type==="batch"?command.commands:[command];
  if(!commands.length||commands.length>20)throw new Error("A gateway plan supports 1–20 commands. Split the request into smaller steps.");
  if(!Array.isArray(response.summary)||response.summary.length>20||!response.summary.length||!response.summary.every(s=>typeof s==="string"&&s.length>0&&s.length<=500))throw new Error("Gateway must include 1–20 short review summaries.");
  const ghosts:CopilotGhost[]=commands.map((entry,index)=>{
    if(entry.type==="create-primitive")return {kind:"primitive",key:`gateway-${index}`,primitive:entry.primitive,params:entry.params,position:entry.position??[0,0,0]};
    if(entry.type==="create-drawing"&&entry.drawing!=="point"&&entry.drawing!=="infinite-line"&&entry.drawing!=="ray")return {kind:"drawing",key:`gateway-${index}`,drawing:entry.drawing,params:{...entry.params,kind:entry.drawing}};
    throw new Error(`Gateway command ${entry.type} is outside the current creation capabilities. Use manual editing for this operation.`);
  });
  // Ignore any server-supplied ghost/HTML/script fields: preview derives only from validated commands.
  return structuredClone({command,summary:response.summary as string[],ghosts});
}

export async function requestCopilotPlan(endpoint:string,body:ReturnType<typeof copilotRequest>,options:{signal:AbortSignal;baseUrl:string;fetcher?:typeof fetch;timeoutMs?:number}):Promise<CopilotPlan>{
  const url=validateCopilotEndpoint(endpoint,options.baseUrl),controller=new AbortController();
  const abort=()=>controller.abort(options.signal.reason);options.signal.throwIfAborted();options.signal.addEventListener("abort",abort,{once:true});
  const timer=setTimeout(()=>controller.abort(new Error("Gateway timed out. Check the connection and Plan again.")),options.timeoutMs??30000);
  let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
  try{
    const response=await (options.fetcher??fetch)(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),credentials:"omit",redirect:"error",signal:controller.signal});
    controller.signal.throwIfAborted();
    if(!response.ok)throw new Error(`Gateway returned HTTP ${response.status}. Check its configuration and Plan again.`);
    if(!response.headers.get("content-type")?.includes("application/json"))throw new Error("Gateway must return application/json.");
    if(Number(response.headers.get("content-length"))>MAX_BYTES)throw new Error("Gateway plan exceeds 64 KiB. Ask for a smaller operation.");
    if(!response.body)throw new Error("Gateway returned an empty response.");
    reader=response.body.getReader();let size=0,text="";const decoder=new TextDecoder();
    while(true){const chunk=await reader.read();controller.signal.throwIfAborted();if(chunk.done)break;size+=chunk.value.byteLength;if(size>MAX_BYTES)throw new Error("Gateway plan exceeds 64 KiB. Ask for a smaller operation.");text+=decoder.decode(chunk.value,{stream:true});}
    text+=decoder.decode();return validateCopilotResponse(JSON.parse(text));
  }catch(error){if(controller.signal.aborted)throw controller.signal.reason;throw error;}
  finally{clearTimeout(timer);options.signal.removeEventListener("abort",abort);await reader?.cancel().catch(()=>{});reader?.releaseLock();}
}
