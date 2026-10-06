import { useEffect, useRef, useState } from "react";
import { cadDocument } from "../state/cadDocument";
import { planDiameterFromSelection } from "../state/dimensionCommands";
import { applyCadPlan, discardCadPlan, previewCadCommand, type CadPlanPreview } from "../state/documentPlans";
import { commandInteraction } from "../state/commandInteraction";
import { CommandReview } from "../ui/CommandReview";
import { PrecisionField } from "../ui/PrecisionField";
import { parseAngle } from "../precision/units";
import { resolveDimension } from "../precision/dimensionGeometry";
import { WORK_PLANES, worldToPlane } from "../precision/workPlane";
import { encodeSvg } from "../export/svgWriter";

export function DiameterDimensionReview({objectId,layerId,revision,onClose,onApplied}:{objectId:string;layerId:string;revision:number;onClose:()=>void;onApplied:(id:string)=>void}) {
 const dialog=useRef<HTMLDialogElement>(null),[angle,setAngle]=useState("45deg"),[review,setReview]=useState<{key:string;plan:CadPlanPreview}|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const base=planDiameterFromSelection(cadDocument,objectId),degrees=parseAngle(angle),key=JSON.stringify([objectId,layerId,angle]);
 const inputError=!base?"Select a visible, unlocked circle or circular arc with a uniform transform.":degrees===null?"Enter a finite leader angle in degrees or radians.":undefined;
 const command=base&&degrees!==null?{...base,layerId,params:{...base.params,angle:degrees}}:null;
 const resolved=command?resolveDimension({...command.params,kind:"diameter"}):null;
 const frame=base?WORK_PLANES[(base.params.workPlane??"XY") as keyof typeof WORK_PLANES]:WORK_PLANES.XY;
 const svg=resolved?encodeSvg(resolved.segments.map(segment=>({points:segment.map(p=>worldToPlane(p,frame)),closed:false}))):"";
 useEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close();},[]);
 useEffect(()=>{setReview(null);setError("");if(!command||inputError)return;let cancelled=false,id:string|undefined;
  void previewCadCommand(command).then(plan=>{id=plan.planId;if(cancelled)discardCadPlan(id);else setReview({key,plan});}).catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:String(e));});
  return()=>{cancelled=true;if(id)discardCadPlan(id);};
 },[key,revision,inputError]);
 const interaction=commandInteraction({command:"Create diameter annotation",draftKey:key,reviewedKey:review?.key,preview:review?.plan,targets:[objectId],pending:busy,inputError:inputError||error||undefined});
 async function apply(){if(!interaction.canApply||!review)return;setBusy(true);try{const result=await applyCadPlan(review.plan.planId);if(result.ok){onApplied(result.createdIds[0]);onClose();}else setError(result.reason??"Review the source again.");}catch(e){setError(e instanceof Error?e.message:"Could not create the annotation.");}finally{setBusy(false);}}
 return <dialog ref={dialog} className="dxf-review-dialog" aria-label="Diameter dimension review" onCancel={e=>{e.preventDefault();if(!busy)onClose();}}><div className="dxf-review-body">
  <h2>Diameter dimension</h2><p>Measures the supporting circle. This annotation follows source edits; it does not drive sketch geometry.</p>
  <PrecisionField label="Leader angle" aria-label="Diameter leader angle" kind="angle" value={angle} onChange={setAngle}/>
  {resolved&&<><strong>{resolved.text}</strong><img alt="Diameter annotation preview" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}/></>}
  <CommandReview state={interaction}/></div><footer><button aria-label="Apply diameter dimension" disabled={!interaction.canApply} onClick={()=>void apply()}>Apply</button><button aria-label="Cancel diameter dimension" disabled={busy} onClick={onClose}>Cancel</button></footer></dialog>;
}
