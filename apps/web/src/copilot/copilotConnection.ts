import { validateCommand, type CadCommand } from "@agent-webcad/cad-commands";
import type { CadDocument } from "@agent-webcad/cad-document";
import type { CopilotPlan, CopilotGhost } from "./copilotPlan";
import { copilotMoveContract, validateCopilotMove, type CopilotMoveContract } from "./copilotEdit";

export type CopilotConnection={mode:"rules"|"gateway";endpoint:string};
export const COPILOT_CAPABILITIES=["create-drawing","create-primitive","move-object"] as const;
const MAX_BYTES=65536;
const DRAWING_FIELDS:Record<string,string[]>={
  line:["points"],polyline:["points","closed","bulges"],rectangle:["points","closed"],
  circle:["center","radius"],arc:["center","radius","startAngle","endAngle"],
};
const PRIMITIVE_FIELDS:Record<string,string[]>={
  box:["width","depth","height"],cylinder:["radius","height"],sphere:["radius"],
  cone:["radius1","radius2","height"],torus:["majorRadius","minorRadius"],
};
const record=(value:unknown):value is Record<string,unknown>=>typeof value==="object"&&value!==null&&!Array.isArray(value);
function supportedFields(value:Record<string,unknown>,fields:string[]){
  const unsupported=Object.keys(value).find(key=>!fields.includes(key));
  if(unsupported)throw new Error(`Gateway proposal has an unsupported field '${unsupported}'. Return only the advertised creation parameters and Plan again.`);
}

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
  return {version:1,prompt,capabilities:COPILOT_CAPABILITIES,edit:copilotMoveContract(document,selection,workPlane),context:{documentId:document.id,revision:document.revision,units:"mm",workPlane,selected,selectionTruncated:selection.length>50}};
}

export function validateCopilotResponse(value:unknown,edit?:CopilotMoveContract):CopilotPlan {
  if(!record(value))throw new Error("Gateway returned no plan. Return a version 1 command proposal.");
  const response=value as Record<string,unknown>;
  if(response.version!==1||!record(response.command))throw new Error("Gateway returned an invalid version or CAD command. Correct the proposal and Plan again.");
  const raw=response.command;
  if(raw.type==="batch")supportedFields(raw,["type","label","commands"]);
  const commands=raw.type==="batch"&&Array.isArray(raw.commands)?raw.commands:[raw];
  if(!commands.length||commands.length>20)throw new Error("A gateway plan supports 1–20 commands. Split the request into smaller steps.");
  // Reject ownership/reference metadata before the permissive public CAD validator.
  // Inspect only one flat batch, so nested commands cannot recurse through validation.
  for(const entry of commands){
    if(!record(entry))throw new Error("Gateway returned an invalid version or CAD command. Correct the proposal and Plan again.");
    if(entry.type==="move-object"){
      if(raw.type==="batch"||commands.length!==1)throw new Error("Move supports one selected target in one standalone command. Split creation and editing into separate reviewed steps.");
      supportedFields(entry,["type","objectId","translation"]);
      if(!validateCommand(entry))throw new Error("Move requires three finite numeric translation values in mm. Correct the proposal and Plan again.");
      validateCopilotMove(entry as Extract<CadCommand,{type:"move-object"}>,edit);
      continue;
    }
    if(entry.type!=="create-drawing"&&entry.type!=="create-primitive")throw new Error(`Gateway returned an invalid version or CAD command for its creation capabilities (${String(entry.type)}). Nested batches and editing commands are unsupported.`);
    supportedFields(entry,entry.type==="create-drawing"?["type","id","name","drawing","params","layerId"]:["type","id","primitive","params","position","layerId"]);
    const fields=entry.type==="create-drawing"?DRAWING_FIELDS[String(entry.drawing)]:PRIMITIVE_FIELDS[String(entry.primitive)];
    if(!Array.isArray(fields)||!record(entry.params))throw new Error("Gateway returned an invalid version or CAD command. Correct the proposal and Plan again.");
    supportedFields(entry.params,entry.type==="create-drawing"?[...fields,"kind","workPlane","construction"]:fields);
    if(entry.type==="create-drawing"&&entry.params.kind!==undefined&&entry.params.kind!==entry.drawing)throw new Error("Gateway drawing kind must match the command. Correct the proposal and Plan again.");
    if(entry.params.closed!==undefined&&typeof entry.params.closed!=="boolean")throw new Error("Gateway closed-contour parameters must be boolean. Correct the proposal and Plan again.");
    if(entry.type==="create-primitive"&&Object.values(entry.params).some(n=>typeof n!=="number"||!Number.isFinite(n)))throw new Error("Gateway primitive parameters must be finite numbers. Correct the proposal and Plan again.");
  }
  if(raw.label!==undefined&&(typeof raw.label!=="string"||!raw.label.trim()||raw.label.length>200))throw new Error("Gateway returned an invalid version or CAD command. Correct the proposal and Plan again.");
  if(!validateCommand(raw))throw new Error("Gateway returned an invalid version or CAD command. Correct the proposal and Plan again.");
  const command=raw as CadCommand;
  if(!Array.isArray(response.summary)||response.summary.length>20||!response.summary.length||!response.summary.every(s=>typeof s==="string"&&s.length>0&&s.length<=500))throw new Error("Gateway must include 1–20 short review summaries.");
  const ghosts:CopilotGhost[]=(command.type==="batch"?command.commands:[command]).map((entry,index):CopilotGhost|null=>{
    if(entry.type==="move-object")return null;
    if(entry.type==="create-primitive")return {kind:"primitive",key:`gateway-${index}`,primitive:entry.primitive,params:entry.params,position:entry.position??[0,0,0]};
    if(entry.type==="create-drawing"&&entry.drawing!=="point"&&entry.drawing!=="infinite-line"&&entry.drawing!=="ray"&&entry.drawing!=="ellipse"&&entry.drawing!=="elliptic-arc"&&entry.drawing!=="spline")return {kind:"drawing",key:`gateway-${index}`,drawing:entry.drawing,params:{...entry.params,kind:entry.drawing}};
    throw new Error(`Gateway command ${entry.type} is outside the current creation capabilities. Use manual editing for this operation.`);
  }).filter((ghost):ghost is CopilotGhost=>ghost!==null);
  // Ignore any server-supplied ghost/HTML/script fields: preview derives only from validated commands.
  const summary=command.type==="move-object"?[`Move ${edit!.target!.name}: translation [${edit!.target!.translation.join(", ")}] → [${command.translation.join(", ")}] mm (${edit!.target!.workPlane}). Connected objects are checked in Impact review.`]:response.summary as string[];
  return structuredClone({command,summary,ghosts});
}

export async function requestCopilotPlan(endpoint:string,body:ReturnType<typeof copilotRequest>,options:{signal:AbortSignal;baseUrl:string;fetcher?:typeof fetch;timeoutMs?:number}):Promise<CopilotPlan>{
  const url=validateCopilotEndpoint(endpoint,options.baseUrl),controller=new AbortController();
  const abort=()=>controller.abort(options.signal.reason);options.signal.throwIfAborted();options.signal.addEventListener("abort",abort,{once:true});
  const timer=setTimeout(()=>controller.abort(new Error("Gateway timed out. Check the connection and Plan again.")),options.timeoutMs??30000);
  let rejectAbort:(reason:unknown)=>void=()=>{};
  const aborted=new Promise<never>((_resolve,reject)=>{rejectAbort=reject;});
  const rejectOnAbort=()=>rejectAbort(controller.signal.reason);
  controller.signal.addEventListener("abort",rejectOnAbort,{once:true});
  let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
  let response:Response|undefined;
  try{
    const fetching=(options.fetcher??fetch)(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),credentials:"omit",redirect:"error",signal:controller.signal}).then(response=>{
      if(controller.signal.aborted)void response.body?.cancel().catch(()=>{});
      return response;
    });
    response=await Promise.race([fetching,aborted]);
    controller.signal.throwIfAborted();
    if(!response.ok)throw new Error(`Gateway returned HTTP ${response.status}. Check its configuration and Plan again.`);
    if(response.headers.get("content-type")?.split(";",1)[0].trim().toLowerCase()!=="application/json")throw new Error("Gateway must return application/json.");
    if(Number(response.headers.get("content-length"))>MAX_BYTES)throw new Error("Gateway plan exceeds 64 KiB. Ask for a smaller operation.");
    if(!response.body)throw new Error("Gateway returned an empty response.");
    reader=response.body.getReader();let size=0,text="";const decoder=new TextDecoder("utf-8",{fatal:true});
    const decode=(bytes?:Uint8Array)=>{
      try{return bytes?decoder.decode(bytes,{stream:true}):decoder.decode();}
      catch{throw new Error("Gateway returned invalid UTF-8. Correct the response and Plan again.");}
    };
    while(true){const chunk=await Promise.race([reader.read(),aborted]);controller.signal.throwIfAborted();if(chunk.done)break;size+=chunk.value.byteLength;if(size>MAX_BYTES)throw new Error("Gateway plan exceeds 64 KiB. Ask for a smaller operation.");text+=decode(chunk.value);}
    text+=decode();
    let value:unknown;try{value=JSON.parse(text);}catch{throw new Error("Gateway returned malformed JSON. Correct the response and Plan again.");}
    return validateCopilotResponse(value,body.edit);
  }catch(error){if(controller.signal.aborted)throw controller.signal.reason;throw error;}
  finally{
    clearTimeout(timer);options.signal.removeEventListener("abort",abort);controller.signal.removeEventListener("abort",rejectOnAbort);
    if(reader){void reader.cancel().catch(()=>{});reader.releaseLock();}
    else void response?.body?.cancel().catch(()=>{});
  }
}
