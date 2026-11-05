import {InterferenceIntentEditor} from "./InterferenceIntentEditor";
import {triageMotionReport} from "../state/interferenceTriage";
import {useEffect,useRef,useState} from "react";
import {cadDocument} from "../state/cadDocument";
import {documentVersion,subscribeDocumentChanges} from "../state/documentSession";
import {inspectAssemblyMotion,motionPose,motionSourceSignature,type MotionRequest,type MotionReport} from "../state/assemblyMotion";
import {selectAssemblyJoint,setAssemblyPreview} from "../state/assemblyPreview";
import {getObjectTransform} from "../precision/objectTransform";
import {publishMotionReport} from "../state/assemblyDrive";
export function AssemblyMotionPanel({revision}:{revision:number}){
 const [jointId,setJoint]=useState(""),[start,setStart]=useState("0"),[end,setEnd]=useState("180"),[step,setStep]=useState("90"),[ids,setIds]=useState(""),[exceptions,setExceptions]=useState("[]"),[tolerance,setTolerance]=useState("0.000001"),[busy,setBusy]=useState(false),[report,setReport]=useState<MotionReport|null>(null),[message,setMessage]=useState("");
 const [pair,setPair]=useState<[string,string]|null>(null),sourceSignature=useRef<string|null>(null);
 const controller=useRef<AbortController|null>(null),ticket=useRef(0),joints=Object.values(cadDocument.assembly?.joints??{}).filter(j=>j.type==="revolute");
 function invalidate(){ticket.current++;controller.current?.abort();controller.current=null;setBusy(false);setReport(null);setPair(null);sourceSignature.current=null;setAssemblyPreview(null);}
 useEffect(()=>{return subscribeDocumentChanges(()=>{if(sourceSignature.current!==null&&sourceSignature.current===motionSourceSignature(cadDocument)){setReport(r=>r?{...r,version:documentVersion()}:r);setMessage("Design intent/history metadata updated; measured samples retained without recalculation.");return;}invalidate();setMessage("Document changed; inspection discarded.");});},[]);
 useEffect(()=>()=>{ticket.current++;controller.current?.abort();setAssemblyPreview(null);publishMotionReport(null);},[]);
 useEffect(()=>{publishMotionReport(report);},[report]);
 useEffect(()=>{if(!ids)setIds(cadDocument.rootObjects.filter(id=>cadDocument.objects[id]?.visible).slice(0,8).join(","));if(!jointId&&joints[0])setJoint(joints[0].id);},[revision]);
 async function inspect(){invalidate();const seq=++ticket.current,c=new AbortController();controller.current=c;setBusy(true);setMessage("Inspecting discrete BRep samples…");try{
 const request:MotionRequest={jointId,start:Number(start),end:Number(end),step:Number(step),partIds:ids.split(",").map(s=>s.trim()).filter(Boolean),exceptions:JSON.parse(exceptions),tolerance:Number(tolerance)},version=documentVersion();
 sourceSignature.current=motionSourceSignature(cadDocument);const sig=sourceSignature.current;
 const r=await inspectAssemblyMotion(cadDocument,request,{signal:c.signal,isCurrent:()=>motionSourceSignature(cadDocument)===sig});
 if(seq!==ticket.current)return;if(r.state==="stale"){setReport(null);setMessage("Stale result discarded.");}else{setReport({...r,version:documentVersion()});setMessage(r.samplingFinished?"Samples finished; check unknown/unsupported rows.":"Partial/incomplete inspection: "+(r.reason??r.state));}
 }catch(e){if(seq===ticket.current)setMessage(String(e));}finally{if(seq===ticket.current)setBusy(false);}}
 function preview(angle:number,pair:[string,string]){if(!report||JSON.stringify(documentVersion())!==JSON.stringify(report.version)){invalidate();setMessage("Stale result discarded.");return;}setPair(pair);const d=motionPose(cadDocument,report.request,angle);selectAssemblyJoint({documentId:cadDocument.id,jointId:report.request.jointId});setMessage("Preview "+angle+"° only; live Joint remains "+cadDocument.assembly!.joints[report.request.jointId].angle+"°.");setAssemblyPreview({documentId:cadDocument.id,revision,joint:d.assembly!.joints[report.request.jointId],highlightIds:pair,poses:Object.fromEntries(Object.values(d.objects).filter(o=>o.visible).map(o=>[o.id,getObjectTransform(o,Object.values(d.features).find(f=>f.output===o.id))]))});}
 const field=(name:string,value:string,set:(v:string)=>void)=><label className="property-row">{name}<input aria-label={name} value={value} disabled={busy} onChange={e=>{invalidate();set(e.target.value);}}/></label>;
 return <details><summary>Motion Inspection</summary><p>Discrete closed-BRep samples only. Only the listed part IDs are inspected. No physics or continuous collision guarantee. No edits or Undo entries.</p>
 <label>Revolute Joint<select aria-label="Motion Joint" value={jointId} disabled={busy} onChange={e=>{invalidate();setJoint(e.target.value);}}><option value="">Select Joint</option>{joints.map(j=><option key={j.id}>{j.id}</option>)}</select></label>
 {field("Motion start",start,setStart)}{field("Motion end",end,setEnd)}{field("Motion step",step,setStep)}{field("Motion parts",ids,setIds)}{field("Motion exceptions JSON",exceptions,setExceptions)}{field("Motion tolerance",tolerance,setTolerance)}
 <button disabled={busy||!jointId} onClick={()=>void inspect()}>Inspect Motion</button><button disabled={!busy} onClick={()=>controller.current?.abort()}>Cancel Motion</button><button onClick={()=>{setAssemblyPreview(null);setMessage("Preview cleared; authoring pose unchanged.");}}>Clear Motion preview</button>
 <p role="status" aria-label="Motion inspection status">{message}</p>
 {report&&<div aria-label="Motion inspection results"><p>{report.state} · {report.stats.completedSamples}/{report.angles.length} samples · {report.elapsedMs.toFixed(1)} ms</p><p>candidates {report.stats.candidates}; AABB filtered {report.stats.aabbRejected}; invariant reuse {report.stats.invariantReuse}; kernel calls {report.stats.kernelCalls}</p><p>{report.warning}</p><p>Raw penetrations {report.rows.filter(r=>r.baseStatus==="penetration").length}; after exceptions {report.rows.filter(r=>r.status==="penetration").length}; explicit exceptions {report.request.exceptions.length}</p>
 {report.parts.filter(p=>p.status!=="supported").map(p=><p key={p.id}>{p.id}: {p.status} {p.reason}</p>)}
 <ul>{triageMotionReport(report,cadDocument).map(t=>{const r=t.row;return <li key={t.index} data-motion-status={r.baseStatus} data-triage-category={t.category} data-motion-angle={r.angle} data-motion-volume={r.commonVolume}>
 <strong>{t.category}</strong> · {r.angle}° · {r.pair.join(" / ")} · {r.status} (raw: {r.baseStatus}, {r.method}) · volume {r.commonVolume??"not measured"} mm³ · volume tolerance {r.volumeTolerance??"n/a"} · gap {r.distance??"not measured"} mm {r.reason}
 <p>Design intent: {t.annotation?.intent??"no annotation"} · {t.annotation?.note??""}</p><p>{t.explanation}</p>
 <button aria-label={"Preview motion result "+t.index} onClick={()=>preview(r.angle,r.pair)}>Preview sample / pair intent</button></li>;})}</ul>
 {pair&&<InterferenceIntentEditor pair={pair} revision={revision}/>}</div>}
 </details>;
}
