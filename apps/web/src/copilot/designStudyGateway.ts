import type {CopilotConnection} from "./copilotConnection";
import {copilotRequest,requestCopilotResponse,validateCopilotResponse} from "./copilotConnection";
import type {CadDocument} from "@agent-webcad/cad-document";
import {inspectFittedCurve} from "./fittedCurveTools";
import {createCadToolSession,type CadToolReadResult} from "./cadToolSession";
import {CAD_TOOLS,CAD_TOOL_LIMITS,validateCadToolCalls} from "./cadToolContract";
import type {WorkPlaneId} from "../precision/workPlane";
import {parseDesignStudy,validateDesignMarks,type DesignStudy,type DesignMark,type DesignCandidate} from "./designStudy";
import {copilotDeadline,parseDesignIntent,parseModelRun,type ModelRun,type DesignRevision} from "./designIntent";
export type DesignVisual={id:string;label:string;dataUrl:string;bounds:[number,number,number,number]};
/** A provider proposes alternatives; it never publishes edits or sets local review results. */
type DesignRequest={connection:CopilotConnection;document:CadDocument;selectionIds:string[];layerId:string;plane:WorkPlaneId;study:DesignStudy;marks:DesignMark[];visuals:DesignVisual[];signal:AbortSignal;isCurrent:()=>boolean;baseUrl:string;fetcher?:typeof fetch;revision?:DesignRevision;maxFitPoints?:number};
export async function requestDesignIntent(args:DesignRequest){
 parseDesignStudy(JSON.stringify(args.study),args.document.id);args.signal.throwIfAborted();
 const body={...copilotRequest(args.study.brief.goal,args.document,args.selectionIds,args.plane,args.layerId,args.connection.model),task:"design-intent",design:{brief:args.study.brief,decisions:args.study.decisions.slice(-8),visuals:[],marks:[]}};
 const value=await requestCopilotResponse(args.connection.endpoint,body,{signal:args.signal,baseUrl:args.baseUrl,fetcher:args.fetcher,timeoutMs:copilotDeadline(args.connection.endpoint)});
 args.signal.throwIfAborted();if(!args.isCurrent())throw Error("The design context changed. Review the current intent again.");return parseDesignIntent(value,args.document.id);
}
export async function requestDesignCandidates(args:DesignRequest):Promise<{brief:DesignStudy["brief"];candidates:DesignCandidate[];run?:ModelRun}>{
 const controller=new AbortController(),abort=()=>controller.abort(args.signal.reason);args.signal.throwIfAborted();args.signal.addEventListener("abort",abort,{once:true});
 const timer=setTimeout(()=>controller.abort(new Error("Design gateway exceeded its deadline.")),copilotDeadline(args.connection.endpoint));
 let rejectAbort:(e:unknown)=>void=()=>{};const cancelled=new Promise<never>((_,reject)=>{rejectAbort=reject;}),onAbort=()=>rejectAbort(controller.signal.reason);controller.signal.addEventListener("abort",onAbort);
 try{return await Promise.race([requestDesignStudy({...args,signal:controller.signal}),cancelled]);}
 finally{clearTimeout(timer);args.signal.removeEventListener("abort",abort);controller.signal.removeEventListener("abort",onAbort);}
}
async function requestDesignStudy(args:DesignRequest):Promise<{brief:DesignStudy["brief"];candidates:DesignCandidate[];run?:ModelRun}>{
 const {document,selectionIds,layerId,plane,signal}=args;parseDesignStudy(JSON.stringify(args.study),document.id);validateDesignMarks(args.marks);
 if(args.visuals.length>3||args.visuals.some(v=>!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(v.dataUrl)||v.id.length>40||v.label.length>100||v.bounds.length!==4||!v.bounds.every(Number.isFinite)))throw Error("Only up to three locally rendered PNG views can be sent.");
 if(args.marks.some(m=>!args.visuals.some(v=>v.id===m.viewId)))throw Error("Each marked region needs its matching rendered CAD view.");
 const anchors=args.study.brief.anchors.map(a=>({...a,name:document.objects[a.objectId]?.name.slice(0,200),layerId:document.objects[a.objectId]?.layerId}));
 const sourceCurves=selectionIds.length===1?(()=>{try{return [inspectFittedCurve(document,selectionIds[0])];}catch{return [];}})():[];
 if(args.maxFitPoints!==undefined&&(!Number.isInteger(args.maxFitPoints)||args.maxFitPoints<3||args.maxFitPoints>60))throw Error("Model fit-point limit must be an integer from 3 to 60.");
 const request={...copilotRequest(args.study.brief.goal,document,selectionIds,plane,layerId,args.connection.model),task:"design-explore",design:{brief:args.study.brief,constraints:{newFittedClosed:true,maxFitPoints:args.maxFitPoints??12},sourceCurves,anchors,decisions:args.study.decisions.slice(-8),marks:args.marks,visuals:args.visuals,...args.revision?{revision:args.revision}:{}},responseContract:{version:1,readResponse:"Optionally return only {version:1,toolCalls:[advertised read-only calls]}; up to four rounds, eight calls per round. toolResults are returned in the next request. Reading is not an edit grant.",brief:"goal, requirements, assumptions, questions, qualities[], anchors[]; never silently promote assumptions",alternatives:"2–3 {id,label,rationale,proposal:{version:1,command,summary} OR toolCalls:[advertised modeling calls]}",constraints:"Preserve anchored objects except references. No scripts, arbitrary Python or HTML. Do not assert aesthetic approval or numeric facts without evidence. Return alternative designs, not edits to this request."}};
 const session=createCadToolSession({document,selectionIds,layerId,workPlane:plane},{isCurrent:args.isCurrent}),results:CadToolReadResult[]=[],seenCalls=new Set<string>();let value:unknown;
 for(let round=0;round<=CAD_TOOL_LIMITS.readRounds;round++){
  signal.throwIfAborted();if(!args.isCurrent())throw Error("The design context changed. Generate alternatives again.");
  const body=results.length?{...request,toolResults:results}:request;
  if(new TextEncoder().encode(JSON.stringify(body)).length>512000)throw Error("Visual request exceeds 512 KB. Send fewer views or disable visual context.");
  value=await requestCopilotResponse(args.connection.endpoint,body,{signal,baseUrl:args.baseUrl,fetcher:args.fetcher,timeoutMs:copilotDeadline(args.connection.endpoint)});session.assertCurrent(signal);
  if(!value||typeof value!=="object"||!Object.hasOwn(value,"toolCalls"))break;
  const read=value as Record<string,unknown>;if(read.version!==1||Object.keys(read).some(k=>!["version","toolCalls"].includes(k)))throw Error("Separate read-only tool calls from the final design alternatives.");
  const calls=validateCadToolCalls(read.toolCalls);if(calls.some(c=>!CAD_TOOLS[c.name].readOnly))throw Error("Top-level design tool calls are read-only. Put modeling calls inside an alternative.");
  if(round===CAD_TOOL_LIMITS.readRounds||calls.length>CAD_TOOL_LIMITS.readCallsPerRound)throw Error("Design study read limit reached: four rounds and eight calls per round.");
  for(const call of calls){if(seenCalls.has(call.id))throw Error("Design read call IDs must be unique.");seenCalls.add(call.id);results.push(await session.read(call,signal));if(new TextEncoder().encode(JSON.stringify(results)).length>CAD_TOOL_LIMITS.bytes)throw Error("Design read transcript exceeds 64 KiB.");}
 }
 signal.throwIfAborted();if(!args.isCurrent())throw Error("The design context changed. Generate alternatives again.");
 const v=value as {version?:unknown;brief?:unknown;alternatives?:unknown};if(v?.version!==1||!Array.isArray(v.alternatives)||v.alternatives.length<2||v.alternatives.length>3)throw Error("Design gateway must return version 1 and two or three alternatives.");
 // Gateway interpretation stays separate; the user explicitly accepts it into the editable brief.
 const brief=parseDesignStudy(JSON.stringify({version:1,documentId:document.id,brief:v.brief,decisions:[]}),document.id).brief;
 const seen=new Set<string>(),candidates:DesignCandidate[]=[];
 for(const a of v.alternatives){if(!a||typeof a.id!=="string"||!a.id||a.id.length>100||seen.has(a.id)||typeof a.label!=="string"||!a.label.trim()||a.label.length>120||typeof a.rationale!=="string"||!a.rationale.trim()||a.rationale.length>1000||!!a.proposal===!!a.toolCalls)throw Error("Each alternative needs a unique id, label, rationale and exactly one proposal or toolCalls.");seen.add(a.id);
  if(Array.isArray(a.toolCalls)&&a.toolCalls.some((c:any)=>c?.name==="curve.fitted"&&c.arguments?.closed!==true))throw Error("Design alternatives require closed fitted outlines. The model must correct the proposal.");
  const base=copilotRequest(args.study.brief.goal,document,selectionIds,plane,layerId,args.connection.model),plan=a.toolCalls?await session.plan(a.toolCalls,signal):validateCopilotResponse(a.proposal,base.edit,base.solid);signal.throwIfAborted();if(!args.isCurrent())throw Error("The design context changed. Generate alternatives again.");candidates.push({id:a.id,label:a.label,rationale:a.rationale,plan,origin:"gateway"});
 }
 return {brief,candidates,run:parseModelRun((value as Record<string,unknown>)?.run)};
}
