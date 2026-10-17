import {useEffect,useRef,useState} from "react";
import {featureContract} from "@agent-webcad/cad-document";
import {cadDocument} from "../state/cadDocument";
import type {TopologySelectionRef} from "../state/selection";
import {sourceMesh} from "../state/faceCutCommands";
import {previewCadCommand,applyCadPlan,discardCadPlan,type CadPlanPreview} from "../state/documentPlans";
import {commandInteraction} from "../state/commandInteraction";
import {parseLength} from "../precision/units";
import {PropertySection} from "../ui/PropertySection";
import {CommandReview} from "../ui/CommandReview";

export function ShellPanel({revision,selectedObjectId,selection,onDocumentChange,onCreated}:{revision:number;selectedObjectId:string|null;selection:TopologySelectionRef[];onDocumentChange:()=>void;onCreated:(id:string)=>void}){
  const selected=Object.values(cadDocument.features).find(f=>f.output===selectedObjectId);
  const [editingId,setEditingId]=useState(""),[thickness,setThickness]=useState("2 mm"),[keys,setKeys]=useState<string[]>([]),[faces,setFaces]=useState<string[]>([]);
  const [error,setError]=useState(""),[busy,setBusy]=useState(false),[review,setReview]=useState<CadPlanPreview>(),[reviewedKey,setReviewedKey]=useState<string>();
  const plan=useRef<string|undefined>(undefined),sequence=useRef(0);
  const editing=Object.values(cadDocument.features).find(f=>f.output===editingId&&f.type==="shell");
  const source=editing?Object.values(cadDocument.features).find(f=>f.output===editing.inputs[0]):selected;
  function cancel(){sequence.current++;if(plan.current)discardCadPlan(plan.current);plan.current=undefined;setReview(undefined);setReviewedKey(undefined);setBusy(false);}
  useEffect(()=>{if(selected?.type==="shell")setEditingId(selected.dependencyMode==="snapshot"?"":selected.output);},[selectedObjectId]);
  useEffect(()=>{cancel();if(editing){setThickness(`${editing.params.thickness} mm`);setKeys(editing.params.faceKeys as string[]);}else setKeys([]);},[editingId,revision]);
  useEffect(()=>{
    let active=true;setFaces([]);cancel();if(!editing)setKeys([]);
    if(source&&featureContract(source).representation==="brep")void sourceMesh(source).then(mesh=>{if(active)setFaces((mesh.faces??[]).map(f=>f.key));}).catch(cause=>{if(active)setError(String(cause));});
    return()=>{active=false;};
  },[source?.id,revision]);
  const picked=selection.filter(s=>s.kind==="brep-face"&&s.objectId===source?.output).map(s=>s.topologyId).sort().join("\n");
  useEffect(()=>{if(picked){cancel();setKeys(picked.split("\n"));}},[picked]);
  useEffect(()=>()=>{sequence.current++;if(plan.current)discardCadPlan(plan.current);},[]);
  const value=parseLength(thickness),key=JSON.stringify([editingId,source?.output,keys,thickness,revision]);
  const interaction=commandInteraction({command:editing?"Edit Shell":"Create Shell",draftKey:key,reviewedKey,preview:review,targets:source?[source.output]:[],pending:busy,idle:!busy&&!review});
  const ready=Boolean(source&&keys.length&&keys.every(k=>faces.includes(k))&&value!==null&&value>1e-6);
  async function preview(){
    if(!ready)return;cancel();const ticket=++sequence.current;setBusy(true);setError("");
    try{
      const fields={thickness:value!,faceKeys:keys};
      const next=await previewCadCommand(editing?{type:"update-shell",objectId:editing.output,...fields}:{type:"create-shell",targetId:source!.output,...fields});
      if(ticket!==sequence.current){discardCadPlan(next.planId);return;}plan.current=next.planId;setReview(next);setReviewedKey(key);if(!next.result.ok)setError(next.result.reason??"Shell preview failed.");
    }catch(cause){if(ticket===sequence.current)setError(String(cause));}finally{if(ticket===sequence.current)setBusy(false);}
  }
  async function apply(){
    if(!interaction.canApply||!plan.current)return;setBusy(true);
    try{const result=await applyCadPlan(plan.current);if(!result.ok)throw Error(result.reason);cancel();setError("");onDocumentChange();if(result.createdIds[0])onCreated(result.createdIds[0]);}
    catch(cause){setError(String(cause));setBusy(false);}
  }
  if(!source||featureContract(source).representation!=="brep")return null;
  const resultChange=review?.changes.find(c=>c.objectId===(editing?.output??review.result.createdIds[0]));
  const before=resultChange?.before?.volume??review?.changes.find(c=>c.objectId===source.output)?.before?.volume;
  return <PropertySection title={editing?"Edit Shell":"Shell"} meta="Inward · mm" defaultOpen active>
    <p className="property-hint">Remove the checked faces and hollow the body inward. Face selection in the viewport also sets the removed faces.</p>
    <label className="property-row"><span>Result</span><select aria-label="Shell result" value={editingId} onChange={e=>{cancel();setEditingId(e.target.value);}}><option value="">New Shell</option>{Object.values(cadDocument.features).filter(f=>f.type==="shell"&&f.dependencyMode!=="snapshot").map(f=><option key={f.id} value={f.output}>{cadDocument.objects[f.output]?.name}</option>)}</select></label>
    {editing&&<p className="property-hint" role={editing.params.referenceStatus==="resolved"?undefined:"alert"}>Removed faces: {String(editing.params.referenceStatus)}. Choose the intended source faces below to rebind.</p>}
    <label className="property-row"><span>Thickness</span><input aria-label="Shell thickness" value={thickness} onChange={e=>{cancel();setThickness(e.target.value);}}/></label>
    {faces.map((face,index)=><label className="property-row" key={`${face}:${index}`}><span title={`Centre (mm): ${face.split("|")[0].split(":").at(-1)}`}>Remove face {index+1}</span><input type="checkbox" aria-label={`Shell remove face ${index+1}`} checked={keys.includes(face)} onChange={e=>{cancel();setKeys(e.target.checked?[...keys.filter(k=>faces.includes(k)),face]:keys.filter(k=>k!==face));}}/></label>)}
    <button type="button" disabled={!ready||busy} onClick={()=>void preview()}>{editing?"Review Shell edit":"Review Shell"}</button>
    {error&&<p role="alert" className="inspector-notice inspector-error">{error}</p>}
    {review&&<><CommandReview state={interaction}/>{review.result.ok&&<p data-testid="shell-volume" className="property-hint">Volume: {before?.toFixed(3)??"?"} → {resultChange?.after?.volume?.toFixed(3)??"?"} mm³</p>}<button disabled={!interaction.canApply} onClick={()=>void apply()}>{editing?"Apply Shell edit":"Apply Shell"}</button><button onClick={cancel}>Cancel Shell review</button></>}
  </PropertySection>;
}
