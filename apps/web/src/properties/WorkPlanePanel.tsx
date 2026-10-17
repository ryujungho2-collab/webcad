import { useEffect, useState } from "react";
import type { CadWorkPlaneFrame } from "@agent-webcad/cad-document";
import { cadDocument } from "../state/cadDocument";
import { dispatchCadCommand } from "../state/dispatchCadCommand";
import { resolveStoredWorkPlane, type WorkPlaneResolution } from "../state/attachedWorkPlane";
import type { TopologySelectionRef } from "../state/selection";
import { PropertySection } from "../ui/PropertySection";

type Vector=[number,number,number];
const parse=(draft:string):Vector|null=>{const values=draft.split(",").map(v=>Number(v.trim()));return values.length===3&&values.every(Number.isFinite)?values as Vector:null;};
const dot=(a:Vector,b:Vector)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const unit=(v:Vector):Vector|null=>{const length=Math.hypot(...v);return length>1e-9?v.map(x=>x/length) as Vector:null;};
function frame(originDraft:string,xDraft:string,yDraft:string):CadWorkPlaneFrame|null {
  const origin=parse(originDraft),rawX=parse(xDraft),rawY=parse(yDraft);if(!origin||!rawX||!rawY)return null;
  const x=unit(rawX);if(!x)return null;
  const y=x&&unit(rawY.map((value,i)=>value-dot(rawY,x)*x[i]) as Vector);if(!y)return null;
  const normal:Vector=[x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]];
  return {origin,xAxis:x,yAxis:y,normal};
}

export function WorkPlanePanel({revision,selection,layerId,onDocumentChange,onSketchCreated}:{revision:number;selection:TopologySelectionRef[];layerId:string;onDocumentChange:()=>void;onSketchCreated?:(id:string)=>void}){
  const [name,setName]=useState("Work plane"),[origin,setOrigin]=useState("0, 0, 0"),[xAxis,setXAxis]=useState("1, 0, 0"),[yAxis,setYAxis]=useState("0, 1, 0");
  const [error,setError]=useState(""),[pending,setPending]=useState(false),[resolutions,setResolutions]=useState<Record<string,WorkPlaneResolution>>({});
  const selected=selection.length===1&&selection[0].kind==="brep-face"?selection[0]:null;
  const planes=Object.values(cadDocument.workPlanes??{});
  useEffect(()=>{let live=true;const document=structuredClone(cadDocument);void Promise.all(Object.values(document.workPlanes??{}).map(async plane=>[plane.id,await resolveStoredWorkPlane(document,plane)] as const)).then(entries=>{if(live)setResolutions(Object.fromEntries(entries));}).catch(cause=>{if(live)setError(cause instanceof Error?cause.message:String(cause));});return()=>{live=false;};},[revision]);
  async function run(command:Parameters<typeof dispatchCadCommand>[0]){setPending(true);setError("");try{const result=await dispatchCadCommand(command);if(!result.ok)throw Error(result.reason??"Work plane change was rejected.");onDocumentChange();}catch(cause){setError(cause instanceof Error?cause.message:String(cause));}finally{setPending(false);}}
  async function createSketch(planeId:string){setPending(true);setError("");try{const id=`Face sketch ${Object.keys(cadDocument.sketches??{}).length+1}`;const result=await dispatchCadCommand({type:"create-face-sketch",id,planeId,layerId});if(!result.ok)throw Error(result.reason??"Could not create face sketch.");onDocumentChange();onSketchCreated?.(id);}catch(cause){setError(cause instanceof Error?cause.message:String(cause));}finally{setPending(false);}}
  const parsed=frame(origin,xAxis,yAxis);
  return <PropertySection title="Work planes" meta={planes.length} defaultOpen={Boolean(selected)} active={Boolean(selected)}>
    <p className="property-hint">Frames use millimetres. Attach a planar solid face, then start a sketch on that plane. Legacy XY/XZ/YZ sketches keep their current coordinates.</p>
    <label className="property-row"><span>Name</span><input aria-label="Work plane name" value={name} maxLength={80} onChange={event=>setName(event.target.value)}/></label>
    <label className="property-row"><span>Origin (mm)</span><input aria-label="Work plane origin" value={origin} onChange={event=>setOrigin(event.target.value)}/></label>
    <label className="property-row"><span>X axis</span><input aria-label="Work plane X axis" value={xAxis} onChange={event=>setXAxis(event.target.value)}/></label>
    <label className="property-row"><span>Y axis</span><input aria-label="Work plane Y axis" value={yAxis} onChange={event=>setYAxis(event.target.value)}/></label>
    {parsed&&<div className="property-row"><span>Normal</span><code>{parsed.normal.map(value=>Number(value.toFixed(4))).join(", ")}</code></div>}
    <div className="property-actions"><button type="button" disabled={pending||!parsed||!name.trim()} onClick={()=>void run({type:"upsert-work-plane",plane:{id:`plane-${crypto.randomUUID()}`,name:name.trim(),...parsed!}})}>Create work plane</button>
      {selected&&<button type="button" disabled={pending||!name.trim()} onClick={()=>void run({type:"attach-work-plane-face",id:`plane-${crypto.randomUUID()}`,name:name.trim(),source:{kind:"brep-face",objectId:selected.objectId,topologyId:selected.topologyId}})}>Create plane from selected face</button>}</div>
    {planes.map(plane=><div key={plane.id} className="property-row"><span>{plane.name}</span><strong>{resolutions[plane.id]?.status??"Checking"}</strong>{plane.source&&<button type="button" aria-label={`Sketch on work plane ${plane.name}`} disabled={pending||resolutions[plane.id]?.status!=="resolved"} onClick={()=>void createSketch(plane.id)}>Sketch on face</button>}<button type="button" aria-label={`Delete work plane ${plane.name}`} disabled={pending} onClick={()=>void run({type:"delete-work-plane",planeId:plane.id})}>Delete</button>{selected&&<button type="button" aria-label={`Rebind work plane ${plane.name}`} disabled={pending} onClick={()=>void run({type:"rebind-work-plane-face",planeId:plane.id,source:{kind:"brep-face",objectId:selected.objectId,topologyId:selected.topologyId}})}>Rebind</button>}</div>)}
    {planes.map(plane=>{const result=resolutions[plane.id];return result&&result.status!=="resolved"?<p key={`${plane.id}:error`} role="status" className="property-hint">{plane.name}: {result.reason}</p>:null;})}
    {error&&<p role="alert" className="inspector-notice inspector-error">{error}</p>}
  </PropertySection>;
}
