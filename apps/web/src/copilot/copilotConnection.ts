import { validateCommand, type CadCommand } from "@agent-webcad/cad-commands";
import type { CadDocument } from "@agent-webcad/cad-document";
import type { CopilotPlan, CopilotGhost } from "./copilotPlan";
import { copilotMoveContract, validateCopilotMove, type CopilotMoveContract } from "./copilotEdit";
import { copilotSolidContract, validateCopilotSolidCommand, type CopilotSolidContract } from "./copilotSolid";
import { CAD_TOOLS, CAD_TOOL_LIMITS, cadToolCatalog, validateCadToolCalls } from "./cadToolContract";
import type { CadToolSession, CadToolReadResult } from "./cadToolSession";
import {taskToolScope,preservationQuestionConflict,modelReadEvidence} from "./copilotTaskScope";
import {parseModelRun,type ModelRun} from "./designIntent";
import { recipeCatalog } from "./cadRecipes";
import { planningResponse } from "./copilotPlanning";

export type CopilotConnection={mode:"rules"|"gateway";endpoint:string;model?:string};
export const COPILOT_CAPABILITIES=["create-drawing","create-primitive","move-object","update-primitive","update-extrude","set-variable"] as const;
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

export function copilotRequest(prompt:string,document:CadDocument,selection:string[],workPlane:string,layerId="layer-default",model?:string){
  if(!prompt.trim()||prompt.length>4000)throw new Error("Enter a prompt of 1–4000 characters.");
  const features=new Map(Object.values(document.features).map(f=>[f.output,f]));
  const selected=[...new Set(selection)].slice(0,50).flatMap(id=>{
    const object=document.objects[id],feature=features.get(id);if(!object)return [];
    const layer=document.layers[object.layerId];
    return [{id,name:object.name.slice(0,200),type:feature?.type,kind:feature?.params.kind,locked:!layer||layer.locked,visible:object.visible&&layer?.visible===true,
      dependencyMode:feature?.dependencyMode,independent:document.rootObjects.includes(id)&&!!feature&&!feature.pattern&&!feature.construction&&!feature.params.componentContent,
      inputs:feature?.inputs.slice(0,50)??[]}];
  });
  const routingSelection={selected,selectionCount:selection.length,selectionTruncated:selection.length>50};
  const scope=taskToolScope(prompt,copilotSolidContract(document,selection),routingSelection);
  const goalPair=scope.kind==="interference"?Object.values(document.interferenceIntents??{}).find(a=>a.pair.some(id=>selection.includes(id)))?.pair:undefined;
  return {version:1,prompt,...model?{model}:{},recipes:scope.kind==="general"?recipeCatalog():[],planning:{stages:["intent","parameters","clarify-or-explicit-defaults","compile","native-preview","review-apply"],clarification:true},capabilities:COPILOT_CAPABILITIES,tools:cadToolCatalog(scope.names),toolContext:{layerId,selectionIds:[...selection].slice(0,50)},edit:copilotMoveContract(document,selection,workPlane),solid:copilotSolidContract(document,selection),context:{...(scope.kind==="interference"?{goalPair,assemblyPresent:!!document.assembly}:{}),documentId:document.id,revision:document.revision,units:"mm",workPlane,...routingSelection}};
}

export function validateCopilotResponse(value:unknown,edit?:CopilotMoveContract,solid?:CopilotSolidContract):CopilotPlan {
  if(!record(value))throw new Error("Gateway returned no plan. Return a version 1 command proposal.");
  const response=value as Record<string,unknown>;
  if(response.version!==1||!record(response.command))throw new Error("Gateway returned an invalid version or CAD command. Correct the proposal and Plan again.");
  const raw=response.command;
  if (["set-variable", "update-primitive", "update-extrude"].includes(String(raw.type))) {
    if (!validateCommand(raw)) throw new Error("Gateway returned an invalid solid edit command.");
    return validateCopilotSolidCommand(raw as CadCommand, solid);
  }
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

type CopilotRequestOptions={signal:AbortSignal;baseUrl:string;fetcher?:typeof fetch;timeoutMs?:number;toolSession?:CadToolSession;onToolActivity?:(label:string)=>void;onModelRun?:(run:ModelRun)=>void;validatePlan?:(plan:CopilotPlan,signal:AbortSignal,evidence:CadToolReadResult[])=>Promise<void>};
export async function requestCopilotResponse(endpoint:string,body:unknown,options:CopilotRequestOptions):Promise<unknown>{
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
    if(!response.ok){
      let message="";
      if(response.headers.get("content-type")?.includes("application/json")&&response.body){
        reader=response.body.getReader();let raw="",size=0;const decoder=new TextDecoder();
        while(true){const chunk=await Promise.race([reader.read(),aborted]);if(chunk.done)break;size+=chunk.value.length;if(size>4096)break;raw+=decoder.decode(chunk.value,{stream:true});}
        if(size<=4096)try{const error=JSON.parse(raw);if(typeof error.error==="string")message=error.error.slice(0,1000);}catch{}
      }
      throw new Error(`Gateway returned HTTP ${response.status}. ${message||"Check its configuration and Plan again."}`);
    }
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
    return value;
  }catch(error){if(controller.signal.aborted)throw controller.signal.reason;throw error;}
  finally{
    clearTimeout(timer);options.signal.removeEventListener("abort",abort);controller.signal.removeEventListener("abort",rejectOnAbort);
    if(reader){void reader.cancel().catch(()=>{});reader.releaseLock();}
    else void response?.body?.cancel().catch(()=>{});
  }
}

/** Read rounds remain local and bounded; modeling calls become a proposal for the ordinary Review/Apply path. */
export async function requestCopilotPlan(endpoint:string,body:ReturnType<typeof copilotRequest>,options:CopilotRequestOptions):Promise<CopilotPlan>{
 const controller=new AbortController(),abort=()=>controller.abort(options.signal.reason);options.signal.throwIfAborted();options.signal.addEventListener("abort",abort,{once:true});
 const timeout=options.timeoutMs??30000;if(!Number.isFinite(timeout)||timeout<1||timeout>180000){options.signal.removeEventListener("abort",abort);throw Error("Gateway deadline must be between 1 and 180000 ms.");}
 const timer=setTimeout(()=>controller.abort(Error("Gateway timed out. Check the connection and Plan again.")),timeout);
 let rejectAbort:(r:unknown)=>void=()=>{};const cancelled=new Promise<never>((_,reject)=>{rejectAbort=reject;}),onAbort=()=>rejectAbort(controller.signal.reason);controller.signal.addEventListener("abort",onAbort);
 const race=<T>(t:Promise<T>)=>Promise.race([t,cancelled]);
 const results:CadToolReadResult[]=[],seen=new Set<string>(),rejected=new Set<string>(),rejectedReasons=new Map<string,string>(),steps:string[]=[],feedback:unknown[]=[];
 const scope=taskToolScope(body.prompt,body.solid,body.context);let rounds=0,replans=0;
 const missing=()=>scope.kind==="loft"?(!results.some(r=>r.ok&&r.name==="cad.inspect"&&Array.isArray(r.result)&&(r.result as any[]).some(o=>o.id===body.context.selected[0]?.id))?["cad.inspect"]:[]):scope.kind!=="interference"?(/cad.inspect|조회|read|inspect/i.test(body.prompt)&&scope.kind==="parameter"&&!results.some(r=>r.ok&&r.name==="cad.inspect")?["cad.inspect"]:[]):["cad.inspect","assembly.inspect","assembly.motion.inspect"].filter(name=>!results.some(r=>r.name===name&&r.ok&&(name!=="cad.inspect"||Array.isArray(r.result)&&(r.result as any[]).some(o=>o.id===body.solid.targetId))));
 const signatureOf=(value:any):string=>JSON.stringify(value,(_key,v)=>{if(v&&typeof v==='object'&&!Array.isArray(v))return Object.fromEntries(Object.keys(v).sort().filter(k=>!(k==='id'&&'name' in v&&'arguments' in v)).map(k=>[k,v[k]]));return v;});
 const retry=(failed:unknown,error:unknown)=>{controller.signal.throwIfAborted();options.toolSession?.assertCurrent(controller.signal);const signature=signatureOf(failed),message=error instanceof Error?error.message:String(error);if(rejected.has(signature))throw Error(`Repeated rejected/no-op proposal; stopped without CAD changes. Last reason: ${rejectedReasons.get(signature)??message}`);if(replans>=2)throw error;rejected.add(signature);rejectedReasons.set(signature,message);replans++;feedback.push({code:message.includes("READ_REQUIRED")?"READ_REQUIRED":message.includes("unchanged")?"NO_OP":"NATIVE_VALIDATION",failed,reason:message,...scope.kind==="loft"?{requiredReads:missing(),support:"The original prompt and captured selection remain binding. Only the advertised standalone loft edit; no source/pose changes or Apply."}:{current:body.solid,requiredReads:missing(),preserveRequirements:body.prompt,support:scope.kind==="interference"?"Only selected solid scalar dimensions. Joint-owned translation, reparent, axis changes and automatic Apply are not offered.":"Only advertised commands and current selected source."}});steps.push("Validation feedback: "+message);};
 try{for(let iteration=0;iteration<CAD_TOOL_LIMITS.readRounds+4;iteration++){
  controller.signal.throwIfAborted();options.toolSession?.assertCurrent(controller.signal);
  const intents=results.find(r=>r.name==="assembly.inspect"&&r.ok)?.result as any;
  const annotations=Object.fromEntries((intents?.designIntents?.entries??[]).map((a:any)=>[JSON.stringify([...a.pair].sort()),a]));
  const projected=results.map(r=>modelReadEvidence(r,annotations,body.solid?.targetId));
  let response=await race(requestCopilotResponse(endpoint,{...body,...projected.length?{toolResults:projected}:{},...feedback.length?{validationFeedback:feedback}:{}},{...options,signal:controller.signal}));
  controller.signal.throwIfAborted();options.toolSession?.assertCurrent(controller.signal);
  if(record(response)&&Object.hasOwn(response,"run")){const run=parseModelRun(response.run);if(!run)throw Error("Invalid model usage metadata.");options.onModelRun?.(run);response={...response};delete (response as any).run;}
  if(record(response)&&Object.hasOwn(response,"clarification")&&missing().length){retry(response,Error("READ_REQUIRED: inspect document facts before asking the user. Missing: "+missing().join(", ")));continue;}
  if(scope.kind==="interference"&&record(response)&&response.clarification){const conflict=preservationQuestionConflict(response.clarification);if(conflict){retry(response,Error(conflict));continue;}}
  if(scope.kind==="loft"&&record(response)&&(Object.hasOwn(response,"recipe")||Object.hasOwn(response,"command")||Object.hasOwn(response,"alternatives")))throw Error("Loft task requires an advertised tool proposal or clarification, not raw commands or recipes.");
  const recipe=planningResponse(response);if(recipe){await options.validatePlan?.(recipe,controller.signal,results);return {...recipe,toolSteps:[...steps,...recipe.toolSteps??[]]};}
  if(record(response)&&Object.hasOwn(response,"toolCalls")){
   if(response.version!==1||Object.keys(response).some(k=>!["version","toolCalls"].includes(k)))throw Error("Tool-call responses require version 1 and toolCalls only. Separate reads from the final proposal.");
   const calls=validateCadToolCalls(response.toolCalls),reads=calls.filter(c=>CAD_TOOLS[c.name].readOnly);if(scope.kind==="loft"&&calls.some(c=>!scope.names.includes(c.name)))throw Error("Tool is outside the captured loft task scope.");if(reads.length&&reads.length!==calls.length)throw Error("Read and modeling calls cannot be mixed in one response.");if(!options.toolSession)throw Error("CAD tool calls require a captured local CAD session.");
   for(const call of calls)if(seen.has(call.id))throw Error("Tool call IDs must be unique across the planning session.");
   if(!reads.length){try{const signature=signatureOf(calls);if(scope.kind==="loft"&&rejectedReasons.get(signature)?.startsWith("READ_REQUIRED:")&&!missing().length){rejected.delete(signature);rejectedReasons.delete(signature);}if(rejected.has(signature))throw Error("Repeated rejected/no-op proposal; stopped without CAD changes.");if(missing().length)throw Error("READ_REQUIRED: "+missing().join(", "));const plan=await race(options.toolSession.plan(calls,controller.signal));await race(options.validatePlan?.(plan,controller.signal,results)??Promise.resolve());return {...plan,toolSteps:[...steps,...plan.toolSteps??[]]};}catch(e){retry(calls,e);continue;}}
   if(rounds++>=CAD_TOOL_LIMITS.readRounds||calls.length>CAD_TOOL_LIMITS.readCallsPerRound)throw Error("CAD tool read limit reached. Use at most four read rounds and eight calls per round.");
   for(const call of calls){seen.add(call.id);const label=CAD_TOOLS[call.name].label;options.onToolActivity?.(label);const result=await race(options.toolSession.read(call,controller.signal));controller.signal.throwIfAborted();options.toolSession.assertCurrent(controller.signal);results.push(result);steps.push(label+(result.ok?"":" (reported a limitation)"));if(new TextEncoder().encode(JSON.stringify(results.map(r=>modelReadEvidence(r,annotations,body.solid?.targetId)))).byteLength>CAD_TOOL_LIMITS.bytes)throw Error("CAD tool transcript exceeds 64 KiB. Request less context.");}continue;
  }
  try{const plan=validateCopilotResponse(response,body.edit,body.solid);if(missing().length)throw Error("READ_REQUIRED: "+missing().join(", "));await options.validatePlan?.(plan,controller.signal,results);return {...plan,toolSteps:steps};}catch(e){retry(response,e);}
 }throw Error("CAD tool read/validation limit reached.");}
 finally{clearTimeout(timer);options.signal.removeEventListener("abort",abort);controller.signal.removeEventListener("abort",onAbort);}
}
