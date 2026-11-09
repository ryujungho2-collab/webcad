import "./assemblyPartPlacement.css";
import {useEffect,useRef,useState} from 'react';
import {cadDocument} from '../state/cadDocument';
import {inspectAssemblyPlacement,type AssemblyPlacementInput} from '../state/assemblyCommands';
import {previewCadCommand,acknowledgeAssemblyPlacementIntent,getCadPlanFrameDocument,discardCadPlan,applyCadPlan} from '../state/documentPlans';
import {setAssemblyPreview} from '../state/assemblyPreview';
import type {CadObjectTransform} from '@agent-webcad/cad-document';

export function AssemblyPartPlacementPanel({revision,onDocumentChange}:{revision:number;onDocumentChange:()=>void}){
 const [objectId,setObject]=useState(''),[position,setPosition]=useState(''),[rotation,setRotation]=useState(''),[policy,setPolicy]=useState(''),[message,setMessage]=useState(''),[report,setReport]=useState<ReturnType<typeof inspectAssemblyPlacement>|null>(null),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false);
 const plan=useRef<string|undefined>(undefined),generation=useRef(0);
 function cancel(){generation.current++;if(plan.current)discardCadPlan(plan.current);plan.current=undefined;setAssemblyPreview(null);setReport(null);setConfirmed(false);setBusy(false);}
 useEffect(()=>{cancel();const t=cadDocument.objects[objectId]?.transform;setPosition(t?.translation.join(', ')??'');setRotation(t?.rotation.join(', ')??'');},[revision,objectId]);
 useEffect(()=>()=>{generation.current++;if(plan.current)discardCadPlan(plan.current);setAssemblyPreview(null);},[]);
 const parse=(value:string)=>{const v=value.split(',').map(x=>x.trim()===''?NaN:Number(x));if(v.length!==3||v.some(n=>!Number.isFinite(n)))throw Error('Enter three finite XYZ values separated by commas.');return v as [number,number,number];};
 async function review(){cancel();const token=++generation.current;setBusy(true);try{
  const c:AssemblyPlacementInput={objectId,targetWorldPose:{translation:parse(position),rotation:parse(rotation),scale:[1,1,1]},descendantPolicy:policy as AssemblyPlacementInput['descendantPolicy']};
  const info=inspectAssemblyPlacement(cadDocument,c),p=await previewCadCommand({type:'assembly-part-place',...c});if(token!==generation.current){discardCadPlan(p.planId);return;}if(!p.result.ok){discardCadPlan(p.planId);throw Error(p.result.reason);}
  plan.current=p.planId;setReport(info);const d=getCadPlanFrameDocument(p.planId)!;setAssemblyPreview({documentId:d.id,revision,highlightIds:[objectId,...info.movedDescendants],poses:Object.fromEntries(Object.values(d.objects).map(o=>[o.id,o.transform??{translation:[0,0,0],rotation:[0,0,0],scale:[1,1,1]} as CadObjectTransform]))});setMessage('Validated placement Preview; document and History unchanged.');
 }catch(e){setMessage(String(e));}finally{if(token===generation.current)setBusy(false);}}
 async function apply(){if(!plan.current||!report||report.requiresIntentReview&&!confirmed)return;setBusy(true);try{const r=await applyCadPlan(plan.current);if(!r.ok)throw Error(r.reason);cancel();onDocumentChange();setMessage('Assembly part placement applied.');}catch(e){setMessage(String(e));setBusy(false);}}
 return <><fieldset className="assembly-part-placement" disabled={busy} aria-label="Assembly constrained placement"><legend>Place Joint-owned part</legend>
 <label>Part<select aria-label="Placement part" value={objectId} onChange={e=>{cancel();setObject(e.target.value);}}><option value="">Select child</option>{Object.values(cadDocument.assembly?.joints??{}).map(j=><option key={j.childId}>{j.childId}</option>)}</select></label>
 <label>Target world XYZ · mm<input aria-label="Placement position" value={position} onChange={e=>{cancel();setPosition(e.target.value);}}/></label>
 <label>Target world rotation XYZ · degrees<input aria-label="Placement rotation" value={rotation} onChange={e=>{cancel();setRotation(e.target.value);}}/></label>
 <label>Descendants<select aria-label="Placement descendant policy" value={policy} onChange={e=>{cancel();setPolicy(e.target.value);}}><option value="">Choose explicitly</option><option value="move-subtree">Move Subtree</option><option value="preserve-descendant-world">Preserve Descendant World Poses</option></select></label>
 <button disabled={!objectId||!policy} onClick={()=>void review()}>Review part placement</button>
 {report&&<><details open><summary>Placement before / after</summary><p>Moved descendants: {report.movedDescendants.join(", ")||"none"}. Preserved descendants: {report.preservedDescendants.join(", ")||"none"}.</p><p>Geometry / relations preserved: {String(report.preservation.geometry)} / {String(report.preservation.relationsAndAngles)}. Changed world anchors: {report.anchors.filter(a=>a.changed).map(a=>a.jointId).join(", ")||"none"}.</p><pre style={{maxHeight:240,overflow:"auto",fontSize:11}} aria-label="Placement review">{JSON.stringify(report,null,2)}</pre></details>
 <p>{report.warning}</p>{report.requiresIntentReview&&<label><input type="checkbox" aria-label="Confirm placement design intent" checked={confirmed} onChange={e=>{if(plan.current)acknowledgeAssemblyPlacementIntent(plan.current,e.target.checked);setConfirmed(e.target.checked);}}/>I reviewed changed world anchors and reconfirm the existing design intent.</label>}
 <button disabled={report.requiresIntentReview&&!confirmed} onClick={()=>void apply()}>Apply part placement</button></>}
 <p role="status">{message}</p></fieldset><button onClick={cancel}>Cancel part placement</button></>;
}
