import {useEffect,useRef,useState} from "react";
import {cadDocument} from "../state/cadDocument";
import {previewCadCommand,applyCadPlan,discardCadPlan,type CadPlanPreview} from "../state/documentPlans";
import {commandInteraction} from "../state/commandInteraction";
import {parseLength} from "../precision/units";
import {PropertySection} from "../ui/PropertySection";
import {CommandReview} from "../ui/CommandReview";
import type {FaceHoleDefinition} from "../state/faceHoleCommands";

export function FaceHolePanel({revision,selectedObjectId,onDocumentChange,onCreated}:{revision:number;selectedObjectId:string|null;onDocumentChange:()=>void;onCreated:(id:string)=>void}){
  const selected=selectedObjectId?Object.values(cadDocument.features).find(feature=>feature.output===selectedObjectId):undefined;
  const editing=selected?.params.faceHole as FaceHoleDefinition|undefined;
  const planeOptions=Object.values(cadDocument.workPlanes??{}).filter(plane=>Boolean(plane.source));
  const [planeId,setPlaneId]=useState(""),[x,setX]=useState("0 mm"),[y,setY]=useState("0 mm"),[diameter,setDiameter]=useState("4 mm"),[depth,setDepth]=useState("5 mm"),[through,setThrough]=useState(false);
  const [error,setError]=useState(""),[busy,setBusy]=useState(false),[review,setReview]=useState<CadPlanPreview>(),[reviewedKey,setReviewedKey]=useState<string>();
  const plan=useRef<string|undefined>(undefined),sequence=useRef(0);
  function cancelReview(){sequence.current++;if(plan.current)discardCadPlan(plan.current);plan.current=undefined;setReview(undefined);setReviewedKey(undefined);setBusy(false);}
  useEffect(()=>{cancelReview();if(editing){setPlaneId(editing.planeId);setX(`${editing.center[0]} mm`);setY(`${editing.center[1]} mm`);setDiameter(`${editing.diameter} mm`);setDepth(`${editing.depth} mm`);setThrough(editing.through);}},[selectedObjectId,revision]);
  useEffect(()=>()=>{sequence.current++;if(plan.current)discardCadPlan(plan.current);},[]);
  const activePlane=editing?.planeId??(planeId||planeOptions[0]?.id||"");
  const sourceId=cadDocument.workPlanes?.[activePlane]?.source?.objectId;
  const key=JSON.stringify([selectedObjectId,activePlane,x,y,diameter,depth,through,revision]);
  const interaction=commandInteraction({command:editing?"Edit Hole":"Create Hole",draftKey:key,reviewedKey,preview:review,targets:sourceId?[sourceId]:[],pending:busy,idle:!review&&!busy});
  const valid=[x,y,diameter,depth].map(value=>parseLength(value)),ready=Boolean(activePlane&&valid.every(value=>value!==null)&&valid[2]!>1e-6&&valid[3]!>1e-6);
  async function reviewHole(){
    if(!ready){setError("Choose a face work plane and valid X, Y, diameter and depth values.");return;}
    cancelReview();const ticket=++sequence.current;setBusy(true);setError("");
    const fields={center:[valid[0]!,valid[1]!] as [number,number],diameter:valid[2]!,depth:valid[3]!,through};
    const command=editing?{type:"update-face-hole",objectId:selectedObjectId!,...fields}:{type:"create-face-hole",planeId:activePlane,...fields};
    try{const next=await previewCadCommand(command);if(ticket!==sequence.current){discardCadPlan(next.planId);return;}plan.current=next.planId;setReview(next);setReviewedKey(key);if(!next.result.ok)setError(next.result.reason??"Hole preview failed.");}
    catch(cause){if(ticket===sequence.current)setError(cause instanceof Error?cause.message:String(cause));}
    finally{if(ticket===sequence.current)setBusy(false);}
  }
  async function applyHole(){
    if(!interaction.canApply||!plan.current)return;setBusy(true);
    try{const result=await applyCadPlan(plan.current);if(!result.ok)throw Error(result.reason??"Hole rejected.");cancelReview();setError("");onDocumentChange();const id=result.createdIds[0];if(id)onCreated(id);}
    catch(cause){setError(cause instanceof Error?cause.message:String(cause));setBusy(false);}
  }
  if(!planeOptions.length&&!editing)return null;
  const holeChange=review?.changes.find(change=>change.objectId===(selectedObjectId&&editing?selectedObjectId:review?.result.createdIds[0]));
  const before=holeChange?.before?.volume??review?.changes.find(change=>change.objectId===sourceId)?.before?.volume,after=holeChange?.after?.volume;
  return <PropertySection title={editing?"Edit Hole":"Hole"} meta="Face · mm" defaultOpen={Boolean(editing)} active={Boolean(editing)}>
    <p className="property-hint">Choose a planar face work plane. X/Y are coordinates on that face; the cylindrical hole goes into its source solid.</p>
    <label className="property-row"><span>Face</span><select aria-label="Hole face work plane" value={activePlane} disabled={Boolean(editing)} onChange={event=>{cancelReview();setPlaneId(event.target.value);}}>{planeOptions.map(plane=><option key={plane.id} value={plane.id}>{plane.name}</option>)}</select></label>
    <label className="property-row"><span>X</span><input aria-label="Hole X" value={x} onChange={event=>{cancelReview();setX(event.target.value);}}/></label>
    <label className="property-row"><span>Y</span><input aria-label="Hole Y" value={y} onChange={event=>{cancelReview();setY(event.target.value);}}/></label>
    <label className="property-row"><span>Diameter</span><input aria-label="Hole diameter" value={diameter} onChange={event=>{cancelReview();setDiameter(event.target.value);}}/></label>
    <label className="property-row"><span>Depth</span><input aria-label="Hole depth" value={depth} onChange={event=>{cancelReview();setDepth(event.target.value);}}/></label>
    <label className="property-row"><span>Through all</span><input aria-label="Hole through all" type="checkbox" checked={through} onChange={event=>{cancelReview();setThrough(event.target.checked);}}/></label>
    <div className="property-actions"><button type="button" disabled={!ready||busy} onClick={()=>void reviewHole()}>{editing?"Review Hole edit":"Review Hole"}</button></div>
    {error&&<p role="alert" className="inspector-notice inspector-error">{error}</p>}
    {review&&<><CommandReview state={interaction}/>{review.result.ok&&<p className="property-hint" data-testid="hole-volume">Volume: {before?.toFixed(3)??"?"} → {after?.toFixed(3)??"?"} mm³</p>}<div className="property-actions"><button type="button" disabled={!interaction.canApply} onClick={()=>void applyHole()}>{editing?"Apply Hole edit":"Apply Hole"}</button><button type="button" onClick={cancelReview}>Cancel Hole review</button></div></>}
  </PropertySection>;
}
