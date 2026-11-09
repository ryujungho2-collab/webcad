import {AssemblyCandidateSearchPanel} from "./AssemblyCandidateSearchPanel";
import {AssemblyPartPlacementPanel} from "./AssemblyPartPlacementPanel";
import {AssemblyMotionPanel} from "./AssemblyMotionPanel";
import {AssemblyJointDrivePanel} from "./AssemblyJointDrivePanel";
import {useState,useEffect,useRef} from "react";
import type {CadCommand,} from "@agent-webcad/cad-commands";
import type {JointInput} from "@agent-webcad/cad-document";
import {cadDocument} from "../state/cadDocument";
import {assertAssemblyPose} from "../state/assemblyCommands";
import {getObjectTransform} from "../precision/objectTransform";
import {previewCadCommand,getCadPlanFrameDocument,applyCadPlan,discardCadPlan} from "../state/documentPlans";
import {selectAssemblyJoint,setAssemblyPreview} from "../state/assemblyPreview";
import {PropertySection} from "../ui/PropertySection";
export function AssemblyPanel({revision,onDocumentChange}:{revision:number;onDocumentChange:()=>void}){
 const [parent,setParent]=useState(""),[child,setChild]=useState(""),[id,setId]=useState("joint-1"),[type,setType]=useState<"fixed"|"revolute">("revolute"),[origin,setOrigin]=useState("0,0,0"),[axis,setAxis]=useState("0,0,1"),[angle,setAngle]=useState(0),[min,setMin]=useState(""),[max,setMax]=useState(""),[target,setTarget]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false),[ready,setReady]=useState(false),[reviewInfo,setReviewInfo]=useState<{before:unknown;after:unknown}|null>(null);
 const [editOrigin,setEditOrigin]=useState(""),[editAxis,setEditAxis]=useState(""),[editMin,setEditMin]=useState(""),[editMax,setEditMax]=useState(""),[newParent,setNewParent]=useState(""),[preserveWorld,setPreserveWorld]=useState(true);
 useEffect(()=>{const j=cadDocument.assembly?.joints[target];selectAssemblyJoint(j?{documentId:cadDocument.id,jointId:j.id}:null);if(!j){if(target)setTarget("");return;}setEditOrigin(j.origin.join(","));setEditAxis(j.axis.join(","));setEditMin(j.min===undefined?"":String(j.min));setEditMax(j.max===undefined?"":String(j.max));setNewParent(j.parentId);setAngle(j.angle);},[target,revision]);
 const plan=useRef<string|undefined>(undefined),ticket=useRef(0);const ids=cadDocument.rootObjects.filter(id=>cadDocument.objects[id]?.visible),joints=Object.values(cadDocument.assembly?.joints??{});
 function cancel(){ticket.current++;if(plan.current)discardCadPlan(plan.current);plan.current=undefined;setReady(false);setReviewInfo(null);setBusy(false);setAssemblyPreview(null);}
 useEffect(()=>{cancel();},[revision]);useEffect(()=>()=>{ticket.current++;if(plan.current)discardCadPlan(plan.current);setAssemblyPreview(null);selectAssemblyJoint(null);},[]);
 async function review(command:CadCommand){cancel();const seq=++ticket.current;setBusy(true);try{const r=await previewCadCommand(command);if(seq!==ticket.current){discardCadPlan(r.planId);return;}plan.current=r.planId;if(!r.result.ok)throw Error(r.result.reason);const d=getCadPlanFrameDocument(r.planId)!;setAssemblyPreview({documentId:cadDocument.id,revision,joint:d.assembly?.joints[target]??null,poses:Object.fromEntries(Object.values(d.objects).filter(o=>o.visible).map(o=>[o.id,getObjectTransform(o,Object.values(d.features).find(f=>f.output===o.id))]))});setReviewInfo({before:cadDocument.assembly?.joints[target]??null,after:d.assembly?.joints[target]??null});setReady(true);setMessage("Validated Joint preview; source geometry preserved.");}catch(e){if(seq===ticket.current)setMessage(String(e));}finally{if(seq===ticket.current)setBusy(false);}}
 async function apply(){if(!plan.current)return;setBusy(true);try{const r=await applyCadPlan(plan.current);if(!r.ok)throw Error(r.reason);cancel();onDocumentChange();setMessage("Assembly applied.");}catch(e){setMessage(String(e));setBusy(false);}}
 let validity="valid";try{assertAssemblyPose(cadDocument);}catch(e){validity=String(e);}
 const field=(label:string,v:string,fn:(v:string)=>void)=><label className="property-row">{label}<input aria-label={label} value={v} disabled={busy} onChange={e=>{cancel();fn(e.target.value);}}/></label>;
 const parts=(label:string,v:string,fn:(v:string)=>void)=><label>{label}<select aria-label={label} value={v} disabled={busy} onChange={e=>{cancel();fn(e.target.value);}}><option value="">Select part</option>{ids.map(id=><option key={id}>{id}</option>)}</select></label>;
 return <PropertySection title="Assembly joints" defaultOpen={false} keepOpen={ready||busy}>
 <AssemblyCandidateSearchPanel revision={revision} onDocumentChange={onDocumentChange}/><AssemblyPartPlacementPanel revision={revision} onDocumentChange={onDocumentChange}/><AssemblyMotionPanel revision={revision}/><AssemblyJointDrivePanel revision={revision} onDocumentChange={onDocumentChange}/>
 <p>Rigid unit-scale parts. Origin/axis: parent-local mm. Angles: absolute degrees from captured bind pose. Ground a root to lock it.</p>
 {parts("Joint parent",parent,setParent)}{parts("Joint child",child,setChild)}
 <button disabled={busy||!parent} onClick={()=>void review({type:"assembly-ground",objectId:parent,grounded:true})}>Review Ground</button>
 <button disabled={busy||!parent} onClick={()=>void review({type:"assembly-ground",objectId:parent,grounded:false})}>Review Unground</button>
 {field("Joint ID",id,setId)}<label>Joint type<select aria-label="Joint type" value={type} onChange={e=>{cancel();setType(e.target.value as typeof type);}}><option value="revolute">Revolute</option><option value="fixed">Fixed</option></select></label>
 {field("Joint origin",origin,setOrigin)}{field("Joint axis",axis,setAxis)}
 {field("Joint minimum",min,setMin)}{field("Joint maximum",max,setMax)}
 <button disabled={busy||!parent||!child} onClick={()=>{try{const joint:JointInput={id,type,parentId:parent,childId:child,origin:origin.split(",").map(Number) as [number,number,number],axis:axis.split(",").map(Number) as [number,number,number],angle:0,...type==="revolute"&&min!==""?{min:Number(min)}:{},...type==="revolute"&&max!==""?{max:Number(max)}:{}};void review({type:"assembly-joint-create",joint});}catch(e){setMessage(String(e));}}}>Review Joint</button>
 <label>Joint<select aria-label="Assembly Joint" value={target} onChange={e=>{cancel();setTarget(e.target.value);setAngle(cadDocument.assembly!.joints[e.target.value]?.angle??0);}}><option value="">Select Joint</option>{joints.map(j=><option key={j.id}>{j.id}</option>)}</select></label>
 <p role="status" aria-label="Assembly validity">Assembly: {validity}</p>
 <p>Grounded roots: {cadDocument.assembly?.grounded.join(", ")||"none"}</p>
 <p>Independent roots: {ids.filter(id=>!joints.some(j=>j.childId===id)).join(", ")}</p>
 {target&&cadDocument.assembly?.joints[target]&&<fieldset disabled={busy}>
 <legend>Selected Joint lifecycle</legend>
 <label><input aria-label="Keep Joint world pose" type="checkbox" checked={preserveWorld} onChange={e=>{cancel();setPreserveWorld(e.target.checked);}}/>Keep current World Pose</label>
 <p>{preserveWorld?"Recapture Rest at current angle; descendants stay in place.":"Retain existing Rest in the new frame; subtree may move."} Limits never clamp the current angle.</p>
 {field("Edit Joint origin",editOrigin,setEditOrigin)}{field("Edit Joint axis",editAxis,setEditAxis)}{field("Edit Joint minimum",editMin,setEditMin)}{field("Edit Joint maximum",editMax,setEditMax)}
 <button onClick={()=>void review({type:"assembly-joint-edit",jointId:target,preserveWorld,edit:{origin:editOrigin.split(",").map(Number) as [number,number,number],axis:editAxis.split(",").map(Number) as [number,number,number],min:editMin===""?null:Number(editMin),max:editMax===""?null:Number(editMax)}})}>Review Joint edit</button>
 {parts("New Joint parent",newParent,setNewParent)}
 <button disabled={!newParent} onClick={()=>void review({type:"assembly-joint-reparent",jointId:target,parentId:newParent,preserveWorld})}>Review Joint reparent</button>
 <button onClick={()=>void review({type:"assembly-joint-delete",jointId:target})}>Review Joint delete</button>
 <p>Delete detaches only this edge. Child becomes an ungrounded root at its current World Pose; descendant Joints remain.</p>
 </fieldset>}
 {target&&cadDocument.assembly?.joints[target]&&<p>Selected Joint: {cadDocument.assembly.joints[target].type} · origin {cadDocument.assembly.joints[target].origin.join(", ")} mm · axis {cadDocument.assembly.joints[target].axis.join(", ")} · limits {cadDocument.assembly.joints[target].min??"none"} / {cadDocument.assembly.joints[target].max??"none"} degrees</p>}
 {field("Joint angle",String(angle),v=>setAngle(Number(v)))}
 <button disabled={busy||!target} onClick={()=>void review({type:"assembly-joint-update",jointId:target,angle})}>Review angle</button>
 {[0,90,180].map(a=><button key={a} disabled={busy||!target} onClick={()=>{setAngle(a);void review({type:"assembly-joint-update",jointId:target,angle:a});}}>Review {a}°</button>)}
 {reviewInfo&&<details open><summary>Joint before / after Preview</summary><pre aria-label="Joint review before">{JSON.stringify(reviewInfo.before,null,2)}</pre><pre aria-label="Joint review after">{JSON.stringify(reviewInfo.after,null,2)}</pre></details>}
 {ready&&<button disabled={busy} onClick={()=>void apply()}>Apply Joint</button>}<button disabled={!busy&&!ready} onClick={cancel}>Cancel Joint preview</button>
 <ul>{joints.map(j=><li key={j.id}><button aria-pressed={target===j.id} onClick={()=>{cancel();setTarget(j.id);}}>Select {j.id}</button> {j.parentId} → [{j.id} · {j.type}] → {j.childId} · axis {j.axis.join(", ")} · {j.angle}°</li>)}</ul><p role="status">{message}</p>
 </PropertySection>;
}
