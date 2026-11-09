import {useCallback,useEffect,useRef,useState,useSyncExternalStore} from "react";
import {cadDocument} from "../state/cadDocument";
import {subscribeDocumentChanges} from "../state/documentSession";
import {selectAssemblyJoint,setAssemblyPreview} from "../state/assemblyPreview";
import {previewCadCommand,applyCadPlan,discardCadPlan} from "../state/documentPlans";
import {clampDriveAngle,driveRange,drivePose,followerParts,interferenceAtAngle,interferenceSamples,motionReportForDrive,stepDrive,subscribeMotionReport,DEFAULT_UNLIMITED_RANGE} from "../state/assemblyDrive";

const fmt=(n:number)=>String(Math.round(n*1000)/1000);
/**
 * Drives one Revolute Joint through its range as a preview only: poses go to the assembly preview
 * overlay, never to the document or Undo history. "Commit" is the only action that writes an angle.
 */
export function AssemblyJointDrivePanel({revision,onDocumentChange}:{revision:number;onDocumentChange:()=>void}){
 const [jointId,setJointId]=useState(""),[angle,setAngleState]=useState(0),[playing,setPlaying]=useState(false),[repeat,setRepeat]=useState(true),[speed,setSpeed]=useState("45"),[from,setFrom]=useState(String(DEFAULT_UNLIMITED_RANGE[0])),[to,setTo]=useState(String(DEFAULT_UNLIMITED_RANGE[1])),[previewing,setPreviewing]=useState(false),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 const report=useSyncExternalStore(subscribeMotionReport,motionReportForDrive);
 const angleRef=useRef(0),dirRef=useRef<1|-1>(1),frame=useRef(0),last=useRef(0),ticket=useRef(0),opts=useRef({min:0,max:360,speed:45,repeat:true});
 const joints=Object.values(cadDocument.assembly?.joints??{}).filter(j=>j.type==="revolute"),joint=cadDocument.assembly?.joints[jointId];
 const range=joint?driveRange(joint,[Number(from),Number(to)]):{min:0,max:360,limited:false};
 const speedValue=Number(speed),speedOk=Number.isFinite(speedValue)&&speedValue>0&&speedValue<=3600,rangeOk=range.max>range.min&&Number.isFinite(range.min)&&Number.isFinite(range.max);
 opts.current={min:range.min,max:range.max,speed:speedOk?speedValue:0,repeat};

 const stopLoop=useCallback(()=>{if(frame.current)cancelAnimationFrame(frame.current);frame.current=0;},[]);
 const clearPreview=useCallback(()=>{stopLoop();setPlaying(false);setPreviewing(false);setAssemblyPreview(null);},[stopLoop]);
 /** Show one pose. Invalid poses clear the preview instead of leaving a stale ghost. */
 const show=useCallback((value:number)=>{
  const j=cadDocument.assembly?.joints[jointId];if(!j||j.type!=="revolute")return false;
  const next=clampDriveAngle(value,opts.current);angleRef.current=next;setAngleState(next);
  try{
   const pose=drivePose(cadDocument,jointId,next),hit=interferenceAtAngle(motionReportForDrive(),jointId,next);
   selectAssemblyJoint({documentId:cadDocument.id,jointId});
   setAssemblyPreview({documentId:cadDocument.id,revision,joint:pose.joint,poses:pose.poses,...hit?{highlightIds:[...new Set(hit.pairs.flat())]}:{}});
   setPreviewing(true);return true;
  }catch(e){clearPreview();setMessage(String(e));return false;}
 },[jointId,revision,clearPreview]);

 const tick:FrameRequestCallback=useCallback((now:number)=>{
  const dt=Math.min(100,now-last.current);last.current=now;
  const s=stepDrive({angle:angleRef.current,dir:dirRef.current},dt,opts.current);dirRef.current=s.dir;
  if(!show(s.angle))return;
  if(s.finished){frame.current=0;setPlaying(false);setMessage("Playback finished at "+fmt(s.angle)+"°. Preview only.");return;}
  frame.current=requestAnimationFrame(tick);
 },[show]);
 function play(){
  if(!joint||!speedOk||!rangeOk){setMessage("Set a valid speed (0–3600 °/s) and range first.");return;}
  stopLoop();let start=clampDriveAngle(angleRef.current,range);
  if(!repeat&&start>=range.max-1e-9){start=range.min;dirRef.current=1;}
  if(show(start)){setPlaying(true);setMessage("Playing preview only; live Joint stays "+fmt(joint.angle)+"°.");last.current=performance.now();frame.current=requestAnimationFrame(tick);}
 }
 function pause(){stopLoop();setPlaying(false);setMessage("Paused at "+fmt(angleRef.current)+"° (preview only).");}
 function stop(){clearPreview();const j=cadDocument.assembly?.joints[jointId];angleRef.current=j?.angle??0;setAngleState(angleRef.current);dirRef.current=1;setMessage("Preview cleared; live Joint "+fmt(angleRef.current)+"° unchanged.");}
 function scrub(value:number){stopLoop();setPlaying(false);if(show(value))setMessage("Preview "+fmt(clampDriveAngle(value,range))+"° only; live Joint stays "+fmt(joint?.angle??0)+"°.");}
 async function commit(){
  if(!joint||busy)return;stopLoop();setPlaying(false);const seq=++ticket.current,value=clampDriveAngle(angleRef.current,range);setBusy(true);
  let planId:string|undefined;
  try{
   const r=await previewCadCommand({type:"assembly-joint-update",jointId,angle:value});planId=r.planId;if(!r.result.ok)throw Error(r.result.reason);
   if(seq!==ticket.current){discardCadPlan(planId);return;}
   const a=await applyCadPlan(planId);planId=undefined;if(!a.ok)throw Error(a.reason);
   setAssemblyPreview(null);setPreviewing(false);onDocumentChange();setMessage("Committed Joint angle "+fmt(value)+"° (one Undo step).");
  }catch(e){if(planId)discardCadPlan(planId);setMessage(String(e));}finally{if(seq===ticket.current)setBusy(false);}
 }

 // Joint list / document changes: never keep playing against a document that moved under us.
 useEffect(()=>{if(!jointId&&joints[0])setJointId(joints[0].id);if(jointId&&!cadDocument.assembly?.joints[jointId]){clearPreview();setJointId(joints[0]?.id??"");}},[revision]);
 useEffect(()=>{const j=cadDocument.assembly?.joints[jointId];angleRef.current=j?.angle??0;setAngleState(angleRef.current);dirRef.current=1;if(j)selectAssemblyJoint({documentId:cadDocument.id,jointId});if(j?.min!==undefined||j?.max!==undefined){setFrom(String(j.min??0));setTo(String(j.max??360));}},[jointId]);
 useEffect(()=>subscribeDocumentChanges(()=>{stopLoop();setPlaying(false);setPreviewing(false);const j=cadDocument.assembly?.joints[jointId];angleRef.current=j?.angle??0;setAngleState(angleRef.current);}),[jointId,stopLoop]);
 useEffect(()=>()=>{ticket.current++;stopLoop();setAssemblyPreview(null);},[stopLoop]);

 const hit=jointId?interferenceAtAngle(report,jointId,angle):null,samples=jointId?interferenceSamples(report,jointId):[];
 const followers=jointId&&joint?(()=>{try{return followerParts(cadDocument,jointId);}catch{return [];}})():[];
 return <details><summary>Joint Drive</summary>
 <p>Slider and playback show a preview only. Nothing is written to the document or Undo until you press Commit.</p>
 <label>Revolute Joint<select aria-label="Drive Joint" value={jointId} disabled={busy} onChange={e=>{clearPreview();setJointId(e.target.value);}}><option value="">Select Joint</option>{joints.map(j=><option key={j.id}>{j.id}</option>)}</select></label>
 {joint&&<>
 <p>Live angle {fmt(joint.angle)}° · range {fmt(range.min)}° to {fmt(range.max)}° ({range.limited?"Joint limits":"playback range, no Joint limits"})</p>
 {!range.limited&&<><label className="property-row">Range start<input aria-label="Joint drive range start" value={from} onChange={e=>setFrom(e.target.value)}/></label><label className="property-row">Range end<input aria-label="Joint drive range end" value={to} onChange={e=>setTo(e.target.value)}/></label></>}
 <label className="property-row">Angle<input aria-label="Joint drive slider" type="range" min={range.min} max={range.max} step="any" value={angle} disabled={busy||!rangeOk} onChange={e=>scrub(Number(e.target.value))}/></label>
 <label className="property-row">Angle (°)<input aria-label="Joint drive angle" type="number" step="any" value={fmt(angle)} disabled={busy||!rangeOk} onChange={e=>{if(e.target.value!==""&&Number.isFinite(Number(e.target.value)))scrub(Number(e.target.value));}}/></label>
 <label className="property-row">Speed (°/s)<input aria-label="Joint drive speed" value={speed} onChange={e=>setSpeed(e.target.value)} aria-invalid={!speedOk}/></label>
 <label><input aria-label="Joint drive repeat" type="checkbox" checked={repeat} onChange={e=>setRepeat(e.target.checked)}/>Repeat (bounce between ends)</label>
 {playing?<button onClick={pause}>Pause Joint drive</button>:<button disabled={busy||!speedOk||!rangeOk} onClick={play}>Play Joint drive</button>}
 <button disabled={busy||!previewing&&!playing} onClick={stop}>Stop Joint drive</button>
 <button disabled={busy||!previewing} onClick={()=>void commit()}>Commit drive angle</button>
 <p role="status" aria-label="Joint drive status" data-playing={playing} data-angle={fmt(angle)} data-preview={previewing}>{message}</p>
 <p aria-label="Joint drive followers">Moves with this Joint: {followers.join(", ")||"none"}</p>
 {hit&&<p role="alert" aria-label="Joint drive interference" data-interference-angle={hit.sampleAngle}>Interference at sampled {fmt(hit.sampleAngle)}°: {hit.pairs.map(p=>p.join(" / ")).join("; ")} (highlighted red; discrete samples only)</p>}
 {samples.length>0&&<p>Interference samples: {samples.map(s=><button key={s.sampleAngle} aria-label={"Jump to interference "+fmt(s.sampleAngle)} disabled={busy} onClick={()=>scrub(s.sampleAngle)}>{fmt(s.sampleAngle)}°</button>)}</p>}
 {!report&&<p>Run Motion Inspection to mark interfering angles here.</p>}
 </>}
 </details>;
}
