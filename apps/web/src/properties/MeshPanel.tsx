import {PolygonMeshControls} from "./PolygonMeshControls";
import {useEffect,useRef,useState} from "react";
import {meshElementIds,type MeshSelectionMode,type MeshVector} from "@agent-webcad/cad-document";
import type {CadCommand} from "@agent-webcad/cad-commands";
import {cadDocument} from "../state/cadDocument";
import {documentMesh} from "../state/meshCommands";
import {dispatchCadCommand} from "../state/dispatchCadCommand";
import {applyCadPlan,discardCadPlan,previewCadCommand} from "../state/documentPlans";
import {PropertySection} from "../ui/PropertySection";

export function MeshPanel({selectedObjectId,layerId,revision,onCreated,onDocumentChange}:{selectedObjectId:string|null;layerId:string;revision:number;onCreated:(id:string)=>void;onDocumentChange:()=>void}){
  const mesh=selectedObjectId?documentMesh(cadDocument,selectedObjectId):undefined;
  const [size,setSize]=useState("40"),[value,setValue]=useState<[string,string,string]>(["0","0","10"]),[operation,setOperation]=useState<"move"|"scale">("move"),[distance,setDistance]=useState("10");
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[review,setReview]=useState<Awaited<ReturnType<typeof previewCadCommand>>|null>(null);
  const plan=useRef<string|null>(null),sequence=useRef(0);
  function cancel(){sequence.current++;if(plan.current)discardCadPlan(plan.current);plan.current=null;setReview(null);setBusy(false);}
  useEffect(()=>{cancel();},[selectedObjectId,layerId,revision]);
  useEffect(()=>()=>{sequence.current++;if(plan.current)discardCadPlan(plan.current);},[]);
  async function preview(command:CadCommand){cancel();const ticket=++sequence.current;setBusy(true);setError("");try{const result=await previewCadCommand(command);if(ticket!==sequence.current){discardCadPlan(result.planId);return;}plan.current=result.planId;setReview(result);if(!result.result.ok)setError(result.result.reason??"Mesh edit rejected.");}catch(e){if(ticket===sequence.current)setError(String(e));}finally{if(ticket===sequence.current)setBusy(false);}}
  async function apply(){if(!plan.current)return;setBusy(true);try{const result=await applyCadPlan(plan.current);cancel();if(!result.ok)throw Error(result.reason);onDocumentChange();if(result.createdIds[0])onCreated(result.createdIds[0]);}catch(e){setError(String(e));setBusy(false);}}
  async function select(mode:MeshSelectionMode,ids:string[],enabled=true){if(!selectedObjectId)return;cancel();setError("");setBusy(true);try{const result=await dispatchCadCommand({type:"select-mesh-elements",objectId:selectedObjectId,enabled,mode,elementIds:ids});if(!result.ok)throw Error(result.reason);onDocumentChange();}catch(e){setError(String(e));}finally{setBusy(false);}}
  const numbers=value.map(Number) as MeshVector,validValue=value.every(v=>v.trim()!==""&&Number.isFinite(Number(v)))&&(operation!=="scale"||numbers.every(n=>n>0));
  const selected=mesh?.edit.ids??[],elements=mesh?meshElementIds(mesh,mesh.edit.mode):[];
  return <PropertySection title="Mesh editing" meta="Mesh surface · local mm" defaultOpen={false} active={!!mesh||!!review||!!error} keepOpen={busy||!!review}>
    <label className="property-row"><span>Cube size (mm)</span><input aria-label="Mesh cube size" value={size} onChange={e=>{cancel();setSize(e.target.value);}}/></label>
    <button type="button" disabled={busy||!size.trim()||!Number.isFinite(Number(size))||Number(size)<.001} onClick={()=>void preview({type:"create-mesh",layerId,size:Number(size)})}>Review new mesh cube</button>
    <button type="button" disabled={busy||!size.trim()||!Number.isFinite(Number(size))||Number(size)<.001} onClick={()=>void preview({type:"create-polygon-mesh",layerId,size:Number(size),shape:"cube"})}>Review polygon cube</button>
    <button type="button" disabled={busy||!size.trim()||!Number.isFinite(Number(size))||Number(size)<.001} onClick={()=>void preview({type:"create-polygon-mesh",layerId,size:Number(size),shape:"ngon",sides:6})}>Review polygon hexagon</button>
    {mesh&&selectedObjectId&&<>
      <p className="property-hint">{mesh.vertices.length} vertices · {mesh.faces.length} {mesh.version===1?"triangular":"polygon"} faces. Surface topology is validated. Polygon edits additionally run bounded self-intersection checks.</p>
      <label className="property-row"><span>Viewport element picking</span><input aria-label="Mesh edit mode" type="checkbox" checked={mesh.edit.enabled} disabled={busy} onChange={e=>void select(mesh.edit.mode,selected,e.target.checked)}/></label>
      <label className="property-row"><span>Elements</span><select aria-label="Mesh selection mode" value={mesh.edit.mode} disabled={busy} onChange={e=>void select(e.target.value as MeshSelectionMode,[])}><option value="vertex">Vertex</option><option value="edge">Edge</option><option value="face">Face ({mesh.version===1?"triangle":"polygon"})</option></select></label>
      <p className="property-hint">Click a visible element in the viewport; Shift/Ctrl toggles selection. IDs below offer precise selection. Transforms use object-local coordinates.</p>
      <select aria-label="Mesh elements" style={{width:"100%",minWidth:0,boxSizing:"border-box"}} multiple size={6} disabled={busy} value={selected} onChange={e=>void select(mesh.edit.mode,Array.from(e.target.selectedOptions,o=>o.value))}>{elements.map(id=><option value={id} key={id}>{id}</option>)}</select>
      <label className="property-row"><span>Operation</span><select aria-label="Mesh transform" value={operation} onChange={e=>{cancel();setOperation(e.target.value as "move"|"scale");setValue(e.target.value==="scale"?["1","1","1"]:["0","0","10"]);}}><option value="move">Move (mm)</option><option value="scale">Scale about local origin</option></select></label>
      {value.map((v,i)=><label className="property-row" key={i}><span>{["X","Y","Z"][i]}</span><input aria-label={`Mesh ${["X","Y","Z"][i]}`} value={v} onChange={e=>{cancel();setValue(value.map((n,j)=>j===i?e.target.value:n) as [string,string,string]);}}/></label>)}
      <button type="button" disabled={busy||!selected.length||!validValue} onClick={()=>void preview({type:"transform-mesh-elements",objectId:selectedObjectId,mode:mesh.edit.mode,elementIds:selected,operation,value:numbers})}>Review mesh transform</button>
      {mesh.version===1&&<>
      <label className="property-row"><span>Face extrusion (mm)</span><input aria-label="Mesh extrusion distance" value={distance} onChange={e=>{cancel();setDistance(e.target.value);}}/></label>
      <button type="button" disabled={busy||mesh.edit.mode!=="face"||selected.length!==1||!distance.trim()||!Number.isFinite(Number(distance))||Math.abs(Number(distance))<1e-6} onClick={()=>void preview({type:"extrude-mesh-face",objectId:selectedObjectId,faceId:selected[0],distance:Number(distance)})}>Review face extrusion</button>
      <button disabled={busy} onClick={()=>void preview({type:"upgrade-mesh",objectId:selectedObjectId})}>Review upgrade to Polygon</button>
      <p className="property-hint">Upgrade preserves triangle IDs and connectivity; new polygon edits and modifiers require file v56. Undo restores v55.</p></>}
      {mesh.version===2&&<PolygonMeshControls key={selectedObjectId} mesh={mesh} objectId={selectedObjectId} busy={busy} preview={preview} cancel={cancel}/>}
    </>}
    {review&&<div role="status"><p>{review.result.ok?"Validated mesh proposal. Apply commits one undoable transaction.":"Proposal rejected."}</p>{review.changes.filter(c=>c.after?.basis==="mesh").map(c=><p key={c.objectId}>Surface area: {c.before?.area?.toFixed(3)??"new"} → {c.after?.area?.toFixed(3)} mm²</p>)}<button type="button" disabled={busy||!review.result.ok||review.stale} onClick={()=>void apply()}>Apply mesh edit</button><button type="button" disabled={busy} onClick={cancel}>Discard mesh preview</button></div>}
    {error&&<p role="alert">{error}</p>}
  </PropertySection>;
}
