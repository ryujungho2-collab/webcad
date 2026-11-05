import {useEffect,useState} from "react";
import {evaluateMeshModifiers,type EditableMesh,type MeshModifier,type PolygonMeshOperation} from "@agent-webcad/cad-document";
import type {CadCommand} from "@agent-webcad/cad-commands";

export function PolygonMeshControls({mesh,objectId,busy,preview,cancel}:{mesh:EditableMesh;objectId:string;busy:boolean;preview:(command:CadCommand)=>Promise<void>;cancel:()=>void}){
 const [kind,setKind]=useState<PolygonMeshOperation["kind"]>("extrude"),[distance,setDistance]=useState("1"),[factor,setFactor]=useState("0.5"),[offset,setOffset]=useState("0"),[resample,setResample]=useState(false);
 const [target,setTarget]=useState("new"),[level,setLevel]=useState("1"),[boundary,setBoundary]=useState<"smooth"|"fixed">("smooth");
 const stack=mesh.modifiers??[],selected=mesh.edit.ids,index=stack.findIndex(m=>m.id===target),modifier=stack[index];
 useEffect(()=>{setLevel(String(modifier?.level??1));setBoundary(modifier?.boundary??"smooth");},[target,modifier?.level,modifier?.boundary]);
 const edit=()=>{let operation:PolygonMeshOperation;switch(kind){
  case "extrude":case "inset":case "inset-region":operation={kind,faceIds:selected,distance:Number(distance)};break;
  case "bevel-edges":operation={kind,edgeIds:selected,distance:Number(distance)};break;
  case "bevel":operation={kind,edgeId:selected[0],distance:Number(distance)};break;
  case "bridge":operation={kind,edgeIds:selected,offset:Number(offset),resample};break;
  case "loop-cut":operation={kind,edgeId:selected[0],factor:Number(factor)};break;
  case "merge":operation={kind,vertexIds:selected as [string,string]};break;
  case "dissolve":operation={kind,edgeId:selected[0]};break;
  default:operation={kind,mode:mesh.edit.mode,elementIds:selected};
 }void preview({type:"edit-polygon-mesh",objectId,operation});};
 const permitted=selected.length>0&&(kind==="delete"||kind==="merge"&&mesh.edit.mode==="vertex"&&selected.length===2||["extrude","inset","inset-region"].includes(kind)&&mesh.edit.mode==="face"||["bevel","dissolve","loop-cut"].includes(kind)&&mesh.edit.mode==="edge"&&selected.length===1||["bridge","bevel-edges"].includes(kind)&&mesh.edit.mode==="edge");
 const reviewStack=(modifiers:MeshModifier[])=>void preview({type:"set-mesh-modifiers",objectId,modifiers});
 const reorder=(delta:number)=>{const next=[...stack];[next[index],next[index+delta]]=[next[index+delta],next[index]];reviewStack(next);};
 const description:Record<PolygonMeshOperation["kind"],string>={"inset-region":"One connected coplanar region with a convex simple boundary; no holes.","bevel-edges":"Up to 16 convex edges with disjoint endpoints; trivalent endpoint restrictions still apply.",extrude:"One connected coplanar face region; signed normal distance.",inset:"Individual strictly convex planar faces; inward edge offset.",bevel:"One convex edge with closed trivalent endpoints; distance along neighboring edges, below half their length.",bridge:"Two complete disjoint boundary loops; optional LCM resampling up to 64 vertices per loop. Explicit offset controls pairing.","loop-cut":"One continuous all-quad ring; factor is measured from the lexically smaller endpoint ID.",merge:"Two adjacent vertices, merged at their midpoint. First selected ID survives.",dissolve:"One internal edge between two coplanar faces; creates one polygon without holes.",delete:"Removes selected faces or all faces incident to selected edges/vertices; cleans unused vertices. Entire-surface deletion is rejected."};
 const result=evaluateMeshModifiers(mesh);
 return <>
  <label className="property-row"><span>Topology operation</span><select aria-label="Polygon operation" value={kind} disabled={busy} onChange={e=>{cancel();setKind(e.target.value as PolygonMeshOperation["kind"]);}}>{["extrude","inset","bevel","bridge","loop-cut","merge","dissolve","delete","inset-region","bevel-edges"].map(k=><option key={k} value={k}>{k}</option>)}</select></label>
  <p className="property-hint">{description[kind]}</p>
  {["extrude","inset","bevel","inset-region","bevel-edges"].includes(kind)&&<label className="property-row"><span>Distance (mm)</span><input aria-label="Polygon distance" value={distance} onChange={e=>{cancel();setDistance(e.target.value);}}/></label>}
  {kind==="loop-cut"&&<label className="property-row"><span>Cut factor</span><input aria-label="Polygon cut factor" value={factor} onChange={e=>{cancel();setFactor(e.target.value);}}/></label>}
  {kind==="bridge"&&<label className="property-row"><span>Resample unequal loops</span><input aria-label="Bridge resample" type="checkbox" checked={resample} onChange={e=>{cancel();setResample(e.target.checked);}}/></label>}
  {kind==="bridge"&&<label className="property-row"><span>Loop offset</span><input aria-label="Polygon bridge offset" value={offset} onChange={e=>{cancel();setOffset(e.target.value);}}/></label>}
  <button disabled={busy||!permitted||[distance,factor,offset].some(v=>!v.trim()||!Number.isFinite(Number(v)))} onClick={edit}>Review polygon operation</button>
  <p className="property-hint">Control: {mesh.vertices.length} vertices / {mesh.faces.length} faces. Evaluated: {result.mesh.vertices.length} vertices / {result.mesh.faces.length} faces. Picking edits the control cage. Edits pass bounded triangle intersection checks; no BRep solid certification.</p>
  <label className="property-row"><span>Modifier stack</span><select aria-label="Mesh modifier" value={target} disabled={busy} onChange={e=>{cancel();setTarget(e.target.value);}}><option value="new">New Catmull–Clark</option>{stack.map((m,i)=><option key={m.id} value={m.id}>{i+1}. {m.id} {m.enabled?"":"(disabled)"}</option>)}</select></label>
  <label className="property-row"><span>Subdivision level</span><input aria-label="Subdivision level" value={level} onChange={e=>{cancel();setLevel(e.target.value);}}/></label>
  <label className="property-row"><span>Boundary rule</span><select aria-label="Subdivision boundary" value={boundary} onChange={e=>{cancel();setBoundary(e.target.value as "smooth"|"fixed");}}><option value="smooth">Smooth cubic boundary</option><option value="fixed">Keep boundary vertices fixed</option></select></label>
  <p className="property-hint">Levels 0–3 per modifier, max 4 modifiers; evaluated geometry budget applies. Creases are infinitely sharp. Semi-sharp creases and limit surfaces are unsupported.</p>
  <button disabled={busy||!level.trim()||!Number.isInteger(Number(level))||Number(level)<0||Number(level)>3||!modifier&&stack.length>=4} onClick={()=>{const next:MeshModifier={id:modifier?.id??`subd-${crypto.randomUUID()}`,type:"catmull-clark",enabled:modifier?.enabled??true,level:Number(level),boundary,creaseEdges:modifier?.creaseEdges??[]};reviewStack(modifier?stack.map(m=>m.id===target?next:m):[...stack,next]);}}>Review subdivision</button>
  {modifier&&<>
   <button disabled={busy} onClick={()=>reviewStack(stack.map(m=>m.id===target?{...m,enabled:!m.enabled}:m))}>Review modifier toggle</button>
   <button disabled={busy||index===0} onClick={()=>reorder(-1)}>Review modifier up</button>
   <button disabled={busy||index===stack.length-1} onClick={()=>reorder(1)}>Review modifier down</button>
   <button disabled={busy||mesh.edit.mode!=="edge"} onClick={()=>reviewStack(stack.map(m=>m.id===target?{...m,creaseEdges:[...selected]}:m))}>Review selected crease edges</button>
   <p className="property-hint">{modifier.creaseEdges.length} crease edges. Review selected crease edges replaces this list; an empty edge selection clears it.</p>
   <button disabled={busy} onClick={()=>reviewStack(stack.filter(m=>m.id!==target))}>Review remove modifier</button>
  </>}
 </>;
}
