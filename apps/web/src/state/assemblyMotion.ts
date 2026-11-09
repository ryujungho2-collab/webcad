import {Box3,Vector3} from "three";
import {validateAssembly,validateFeatureParameters,featureContract,type CadDocument} from "@agent-webcad/cad-document";
import type {SerializedOperand} from "../cad/kernelProtocol";
import {inspectSolid,measureSolidDistance,projectKernelMetrics} from "../cad/kernelGeometryService";
import {liveFeatureInputs} from "./featureRegeneration";
import {assemblyMatrix,evaluateAssembly,assertAssemblyPose} from "./assemblyCommands";
import {getObjectTransform} from "../precision/objectTransform";
import {documentVersion,subscribeDocumentChanges} from "./documentSession";
import {cadModelReferenceIssue} from "../copilot/cadModelingTools";
export const MOTION_BUDGET={parts:8,samples:13,rows:128,kernelCalls:160,totalMs:30000,taskMs:5000,inputBytes:8*1024*1024,resultBytes:48000,wasmCapacityBytes:256*1024*1024};
export type MotionRequest={jointId:string;start:number;end:number;step:number;partIds:string[];exceptions:[string,string][];tolerance:number};
export type MotionStatus="penetration"|"contact"|"no-penetration"|"unknown"|"unsupported";
export type MotionRow={relativeMotion?:"invariant"|"motion-dependent";angle:number;pair:[string,string];baseStatus:MotionStatus;status:MotionStatus|"intentional-exception";method:"aabb"|"brep"|"reuse"|"preflight";commonVolume?:number;distance?:number;volumeTolerance?:number;reason?:string;exception:boolean};
export type MotionReport={version:ReturnType<typeof documentVersion>;request:MotionRequest;angles:number[];rows:MotionRow[];parts:{id:string;status:"supported"|"unsupported"|"error";reason?:string}[];samplingFinished:boolean;state:"finished"|"partial"|"cancelled"|"stale";reason?:string;elapsedMs:number;stats:{possiblePairs:number;aabbRejected:number;candidates:number;invariantReuse:number;kernelCalls:number;completedSamples:number;estimatedInputBytes:number;wasmCapacityBytes:number|null};warning:string};
/** Each group has the same ordered set of changing rigid edges on its ancestor path.
 * Separate coupled siblings must never reuse relative-motion results merely because both move. */
export function assemblyMotionGroups(d:CadDocument,jointId:string){
 validateAssembly(d);const a=d.assembly,j=a?.joints[jointId];if(!a||!j||j.type==="fixed"||j.coupling)throw Error("Select an independent movable Joint driver.");
 const active=new Set([jointId]);let more=true;while(more){more=false;for(const edge of Object.values(a.joints))if(edge.coupling&&edge.coupling.ratio!==0&&active.has(edge.coupling.driverId)&&!active.has(edge.id)){active.add(edge.id);more=true;}}
 const incoming=new Map(Object.values(a.joints).map(j=>[j.childId,j])),groups=new Map<string,string>();
 const group=(id:string):string=>{if(groups.has(id))return groups.get(id)!;const edge=incoming.get(id),path=edge?group(edge.parentId)+(active.has(edge.id)?"/"+JSON.stringify(edge.id):""):"";groups.set(id,path);return path;};
 for(const id of Object.keys(d.objects))group(id);return groups;
}
export function drivenAssemblyParts(d:CadDocument,jointId:string){return new Set([...assemblyMotionGroups(d,jointId)].filter(([,group])=>group!=="").map(([id])=>id));}
/** Exact serialized context comparison; only design-intent metadata and revision are excluded. */
export function motionSourceSignature(d:CadDocument){const {interferenceIntents:_,revision:__,...geometry}=d;return JSON.stringify(geometry);}
const pairKey=(a:string,b:string)=>JSON.stringify([a,b].sort());
export function motionAngles(r:MotionRequest){
 if(!r||Object.keys(r).some(k=>!["jointId","start","end","step","partIds","exceptions","tolerance"].includes(k))||typeof r.jointId!=="string"||![r.start,r.end,r.step,r.tolerance].every(Number.isFinite)||r.step<=0||r.tolerance<1e-7||r.tolerance>.01||Math.max(Math.abs(r.start),Math.abs(r.end))>1e9||!Array.isArray(r.partIds)||r.partIds.length<2||r.partIds.length>MOTION_BUDGET.parts||r.partIds.some(id=>typeof id!=="string"||!id||id.length>200)||new Set(r.partIds).size!==r.partIds.length||!Array.isArray(r.exceptions)||r.exceptions.length>28||r.exceptions.some(p=>!Array.isArray(p)||p.length!==2||p[0]===p[1]||!p.every(id=>r.partIds.includes(id))))throw Error("Invalid/budget-exceeding motion request.");
 if(new Set(r.exceptions.map(p=>pairKey(...p))).size!==r.exceptions.length)throw Error("Duplicate exception pair.");
 const count=Math.floor(Math.abs(r.end-r.start)/r.step+1e-10)+1;if(count>MOTION_BUDGET.samples)throw Error("Motion sample budget exceeded.");
 const direction=r.end>=r.start?1:-1,angles=Array.from({length:count},(_,i)=>r.start+direction*r.step*i);
 if(Math.abs(angles.at(-1)!-r.end)>1e-8)angles.push(r.end);
 if(angles.length>MOTION_BUDGET.samples)throw Error("Motion sample budget exceeded.");return angles;
}
export function motionPose(source:CadDocument,r:MotionRequest,angle:number){const d=structuredClone(source),j=d.assembly?.joints[r.jointId];if(!j||j.type==="fixed"||j.coupling)throw Error("Select an independent movable Joint driver.");if(j.min!==undefined&&angle<j.min||j.max!==undefined&&angle>j.max)throw Error("Sample outside Joint limits.");if(j.type==="prismatic")j.offset=angle;else j.angle=angle;evaluateAssembly(d,undefined,true);return d;}
type Dependencies={inspect:typeof inspectSolid;distance:typeof measureSolidDistance;metrics:typeof projectKernelMetrics};
export async function inspectAssemblyMotion(source:CadDocument,request:MotionRequest,options:{signal?:AbortSignal;isCurrent?:()=>boolean;taskMs?:number;totalMs?:number;dependencies?:Dependencies}={}):Promise<MotionReport>{
 const started=performance.now(),angles=motionAngles(request),version=documentVersion(source),r=structuredClone(request),dep=options.dependencies??{inspect:inspectSolid,distance:measureSolidDistance,metrics:projectKernelMetrics};
 const inputBytes=JSON.stringify(source).length*2;if(inputBytes>MOTION_BUDGET.inputBytes)throw Error("Motion input memory budget exceeded.");assertAssemblyPose(source);
 const snapshot=structuredClone(source),driverJoint=snapshot.assembly?.joints[r.jointId];if(!driverJoint||driverJoint.type==="fixed"||driverJoint.coupling)throw Error("Select an independent movable Joint driver.");if(angles.some(a=>driverJoint.min!==undefined&&a<driverJoint.min||driverJoint.max!==undefined&&a>driverJoint.max))throw Error("Sample outside Joint limits.");
 // Preflight the complete coupling chain at every requested sample before starting kernel work.
 for(const value of angles)motionPose(snapshot,r,value);
 const report:MotionReport={version,request:r,angles,rows:[],parts:[],samplingFinished:false,state:"partial",elapsedMs:0,stats:{possiblePairs:angles.length*r.partIds.length*(r.partIds.length-1)/2,aabbRejected:0,candidates:0,invariantReuse:0,kernelCalls:0,completedSamples:0,estimatedInputBytes:inputBytes,wasmCapacityBytes:null},warning:"Discrete samples only; unchecked motion intervals are NOT certified collision-free. AABB is not a collision test. Exceptions retain their original result."};
 const controller=new AbortController(),abort=()=>controller.abort(),taskMs=Math.min(MOTION_BUDGET.taskMs,options.taskMs??MOTION_BUDGET.taskMs),totalMs=Math.min(MOTION_BUDGET.totalMs,options.totalMs??MOTION_BUDGET.totalMs);
 const current=()=>options.isCurrent?options.isCurrent():JSON.stringify(documentVersion(source))===JSON.stringify(version);
 const changed=()=>{if(!current())controller.abort();};const unsubscribe=subscribeDocumentChanges(changed);
 options.signal?.addEventListener("abort",abort,{once:true});if(options.signal?.aborted)abort();const deadline=setTimeout(abort,totalMs);
 const check=()=>{if(!current())throw Error("stale document");if(controller.signal.aborted)throw Error(options.signal?.aborted?"cancelled":"inspection deadline/cancel");if(performance.now()-started>totalMs)throw Error("inspection time budget");const metrics=dep.metrics(),capacity=metrics.workerResident===false?null:metrics.wasmCapacityBytes;report.stats.wasmCapacityBytes=capacity;if(capacity!==null&&capacity>MOTION_BUDGET.wasmCapacityBytes)throw Error("WASM capacity budget exceeded");};
 const task=async<T>(fn:(signal:AbortSignal)=>Promise<T>)=>{check();if(++report.stats.kernelCalls>MOTION_BUDGET.kernelCalls)throw Error("Kernel call budget exceeded");const c=new AbortController(),relay=()=>c.abort();controller.signal.addEventListener("abort",relay,{once:true});let timeout=false;const timer=setTimeout(()=>{timeout=true;c.abort();},taskMs),t=performance.now();try{const value=await fn(c.signal);check();if(timeout||performance.now()-t>taskMs)throw Error("Kernel task timeout");return value;}finally{clearTimeout(timer);controller.signal.removeEventListener("abort",relay);}};
 const identity={translation:[0,0,0] as [number,number,number],rotation:[0,0,0] as [number,number,number],scale:[1,1,1] as [number,number,number]};
 const parts=new Map<string,{operand?:SerializedOperand;box?:Box3;status:"supported"|"unsupported"|"error";reason?:string}>();
 const groups=assemblyMotionGroups(snapshot,r.jointId),moving=drivenAssemblyParts(snapshot,r.jointId);
 const featureMap=new Map(Object.values(snapshot.features).map(f=>[f.output,f]));
 const drivenGeometryInput=(id:string,seen=new Set<string>()):boolean=>{if(seen.has(id))return false;seen.add(id);const f=featureMap.get(id);return !!f&&liveFeatureInputs(f,snapshot).some(input=>moving.has(input)||drivenGeometryInput(input,seen));};
 const invariant=new Map<string,MotionRow>(),exceptions=new Set(r.exceptions.map(p=>pairKey(...p)));
 const add=(row:MotionRow)=>{if(report.rows.length>=MOTION_BUDGET.rows||JSON.stringify({...report,rows:[...report.rows,row]}).length*2>MOTION_BUDGET.resultBytes)throw Error("Motion result memory/row budget exceeded");report.rows.push(row);};
 try{
  check();
  for(const id of r.partIds){check();const object=snapshot.objects[id],feature=Object.values(snapshot.features).find(f=>f.output===id);
   let p:{operand?:SerializedOperand;box?:Box3;status:"supported"|"unsupported"|"error";reason?:string}={status:"unsupported",reason:"Not a supported closed unit-scale BRep solid."};
   if(object&&feature&&featureContract(feature).representation==="brep"&&getObjectTransform(object,feature).scale.every(s=>Math.abs(s-1)<1e-8)){
    const issue=cadModelReferenceIssue(snapshot,id);if(drivenGeometryInput(id))p={status:"unsupported",reason:"Live geometry depends on driven parts; independent rigid bodies only."};else if(issue)p={status:"error",reason:issue};else try{
     if(!validateFeatureParameters(feature))throw Error("Invalid BRep feature parameters.");
     const operand={params:structuredClone(feature.params),transform:identity},m=await task(signal=>dep.inspect(operand,{signal}));if(m.validity!=="valid"||!m.bounds||!m.volume||m.volume<=0)throw Error("Invalid or non-volume BRep.");
     // Reuse existing strict closed-solid validator and Boolean Common on the local body once.
     const self=await task(signal=>dep.distance(operand,operand,r.tolerance,{signal}));if(self.classificationError||self.relationship!=="coincident"||self.commonVolume===undefined||self.commonVolume<=self.volumeTolerance)throw Error(self.classificationError??"Self BRep validation indeterminate.");
     p={status:"supported",operand,box:new Box3(new Vector3(...m.bounds.min),new Vector3(...m.bounds.max))};
    }catch(e){check();const reason=String(e).slice(0,600);p={status:/closed solid|free faces|open faces|shells/i.test(reason)?"unsupported":"error",reason};}
   }
   parts.set(id,p);report.parts.push({id,status:p.status,...p.reason?{reason:p.reason}:{}});
  }
  for(const angle of angles){check();const pose=motionPose(snapshot,r,angle);
   for(let i=0;i<r.partIds.length;i++)for(let k=i+1;k<r.partIds.length;k++){check();const a=r.partIds[i],b=r.partIds[k],pair:[string,string]=[a,b],pa=parts.get(a)!,pb=parts.get(b)!,key=pairKey(a,b),exception=exceptions.has(key),constant=groups.get(a)===groups.get(b);
    let row:MotionRow={relativeMotion:constant?"invariant":"motion-dependent",angle,pair,baseStatus:"unknown",status:"unknown",method:"preflight",exception};
    const reused=constant&&invariant.get(key);
    if(reused){row={...reused,angle,method:"reuse"};report.stats.invariantReuse++;}
    else if(pa.status!=="supported"||pb.status!=="supported"){row.baseStatus=pa.status==="error"||pb.status==="error"?"unknown":"unsupported";row.reason=[pa.reason,pb.reason].filter(Boolean).join("; ");}
    else{const ta=getObjectTransform(pose.objects[a],Object.values(pose.features).find(f=>f.output===a)),tb=getObjectTransform(pose.objects[b],Object.values(pose.features).find(f=>f.output===b)),ba=pa.box!.clone().applyMatrix4(assemblyMatrix(ta)).expandByScalar(r.tolerance),bb=pb.box!.clone().applyMatrix4(assemblyMatrix(tb)).expandByScalar(r.tolerance);
     if(!ba.intersectsBox(bb)){row.baseStatus="no-penetration";row.method="aabb";report.stats.aabbRejected++;}
     else{report.stats.candidates++;row.method="brep";try{const d=await task(signal=>dep.distance({...pa.operand!,transform:ta},{...pb.operand!,transform:tb},r.tolerance,{signal}));
      row.commonVolume=d.commonVolume;row.distance=d.boundaryDistance;row.volumeTolerance=d.volumeTolerance;
      if(d.classificationError||d.relationship==="indeterminate"||d.commonVolume===undefined){row.baseStatus="unknown";row.reason=(d.classificationError??"Kernel classification indeterminate.").slice(0,600);}
      else row.baseStatus=d.commonVolume>d.volumeTolerance?"penetration":d.relationship==="contact"?"contact":"no-penetration";
     }catch(e){check();row.baseStatus="unknown";row.reason=String(e).slice(0,600);}}
    }
    row.status=exception?"intentional-exception":row.baseStatus;add(row);if(constant&&!reused)invariant.set(key,row);
   }report.stats.completedSamples++;
  }report.samplingFinished=true;report.state=report.rows.some(x=>x.baseStatus==="unknown"||x.baseStatus==="unsupported")?"partial":"finished";
 }catch(e){report.reason=String(e).slice(0,600);report.state=!current()?"stale":options.signal?.aborted?"cancelled":"partial";if(report.state==="stale"){report.rows=[];report.parts=[];}}
 finally{clearTimeout(deadline);unsubscribe();options.signal?.removeEventListener("abort",abort);report.elapsedMs=performance.now()-started;}
 return report;
}
