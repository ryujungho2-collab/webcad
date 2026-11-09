import {useEffect,useRef,useState} from "react";
import {SCULPT_BRUSHES,type RemeshOptions} from "@agent-webcad/cad-document";
import type {CadCommand} from "@agent-webcad/cad-commands";
import {cadDocument} from "../state/cadDocument";
import {documentMesh} from "../state/meshCommands";
import {sculptSourceSignature} from "../state/sculptCommands";
import {sculptView,subscribeSculptView,updateSculptView} from "../state/sculptSession";
import {previewCadCommand,applyCadPlan,discardCadPlan,getCadPlanFrameDocument} from "../state/documentPlans";
import {PropertySection} from "../ui/PropertySection";
export function SculptPanel({selectedObjectId,revision,onCreated,onDocumentChange}:{selectedObjectId:string|null;revision:number;onCreated:(id:string)=>void;onDocumentChange:()=>void}){
 const [state,setState]=useState(sculptView),[options,setOptions]=useState<RemeshOptions>({method:"surface",iterations:1,relaxation:.15}),[review,setReview]=useState<Awaited<ReturnType<typeof previewCadCommand>>|null>(null),[report,setReport]=useState("");const plan=useRef<string|undefined>(undefined),controller=useRef<AbortController|null>(null),sequence=useRef(0);
 const mesh=selectedObjectId?documentMesh(cadDocument,selectedObjectId):undefined,feature=Object.values(cadDocument.features).find(f=>f.output===selectedObjectId),canBake=feature&&["mesh","geometry-nodes"].includes(feature.type),settings=state.settings;
 function cancel(){sequence.current++;controller.current?.abort();if(plan.current)discardCadPlan(plan.current);plan.current=undefined;setReview(null);setReport("");updateSculptView({preview:undefined,busy:false});}
 useEffect(()=>subscribeSculptView(()=>setState(sculptView())),[]);
 useEffect(()=>{cancel();updateSculptView({objectId:selectedObjectId,active:false,message:""});},[selectedObjectId]);
 useEffect(()=>{cancel();},[revision]);
 useEffect(()=>()=>{sequence.current++;controller.current?.abort();if(plan.current)discardCadPlan(plan.current);updateSculptView({active:false,preview:undefined,busy:false});},[]);
 async function preview(command:CadCommand){cancel();updateSculptView({active:false,busy:true,message:"Evaluating geometry in Worker…"});const ticket=++sequence.current,abort=new AbortController();controller.current=abort;try{const r=await previewCadCommand(command,{signal:abort.signal});if(ticket!==sequence.current){discardCadPlan(r.planId);return;}plan.current=r.planId;setReview(r);if(!r.result.ok)throw Error(r.result.reason);const doc=getCadPlanFrameDocument(r.planId),id=r.result.createdIds[0],result=doc&&id?documentMesh(doc,id):undefined;updateSculptView({preview:result,message:"Validated preview · source object retained."});setReport(result?.derivation?.report?JSON.stringify(result.derivation.report,null,2):"Bake freezes evaluated geometry. The source remains independently editable.");}catch(e){if(ticket===sequence.current)updateSculptView({message:String(e)});}finally{if(ticket===sequence.current)updateSculptView({busy:false});}}
 async function apply(){if(!plan.current)return;updateSculptView({busy:true});try{const r=await applyCadPlan(plan.current);if(!r.ok)throw Error(r.reason);cancel();onDocumentChange();if(r.createdIds[0])onCreated(r.createdIds[0]);}catch(e){updateSculptView({busy:false,message:String(e)});}}
 const change=(patch:Partial<typeof settings>)=>{cancel();updateSculptView({active:false,settings:{...settings,...patch}});};
 const derivation=mesh?.derivation,stale=derivation&&sculptSourceSignature(cadDocument,derivation.sourceObjectId)!==derivation.sourceSignature;
 if(!canBake)return null;
 return <PropertySection title="Sculpt & Remesh" meta="Mesh · local mm · bounded evaluation" defaultOpen={false} active={!!canBake||!!review} keepOpen={state.busy||state.active||!!review}>
  {canBake&&<button disabled={state.busy} onClick={()=>void preview({type:"bake-mesh",objectId:selectedObjectId!})}>Review Bake for Sculpt</button>}
  {derivation&&<p role="status">{derivation.kind} snapshot from {derivation.sourceObjectId}. {stale?"Source changed or missing; this snapshot is detached and is NOT regenerated.":"Source fingerprint matches snapshot."}</p>}
  {mesh&&<>
   <label className="property-row"><span>Brush</span><select aria-label="Sculpt brush" value={settings.brush} disabled={state.busy} onChange={e=>change({brush:e.target.value as typeof settings.brush})}>{SCULPT_BRUSHES.map(b=><option key={b} value={b}>{b}</option>)}</select></label>
   {(["radius","strength","spacing"] as const).map(key=><label className="property-row" key={key}><span>{key}</span><input aria-label={`Sculpt ${key}`} type="number" step={key==="radius"?1:.05} value={settings[key]} disabled={state.busy} onChange={e=>change({[key]:Number(e.target.value)})}/></label>)}
   <label className="property-row"><span>Falloff</span><select aria-label="Sculpt falloff" value={settings.falloff} disabled={state.busy} onChange={e=>change({falloff:e.target.value as typeof settings.falloff})}>{["linear","smooth","sharp"].map(f=><option key={f}>{f}</option>)}</select></label>
   <label className="property-row"><span>X symmetry (local)</span><input aria-label="Sculpt X symmetry" type="checkbox" checked={settings.symmetry} disabled={state.busy} onChange={e=>change({symmetry:e.target.checked})}/></label>
   <button disabled={state.busy||!!mesh.modifiers?.some(m=>m.enabled&&m.level>0)} onClick={()=>{cancel();updateSculptView({active:!state.active,message:!state.active?"Drag on the selected surface. Escape cancels; release commits one stroke.":"Sculpt mode off."});}}>{state.active?"Stop Sculpt":"Start Sculpt"}</button>
   <p className="property-hint">Frozen-source surface hits per stroke. Radius and X symmetry use object-local coordinates. Refine a coarse mesh before using a small brush. Max 5,000 vertices / 10,000 faces / 20,000 render triangles / 128 samples. Live preview is provisional; release validates intersections before commit.</p>
   <label className="property-row"><span>Remesh method</span><select aria-label="Remesh method" disabled={state.busy} value={options.method} onChange={e=>{cancel();setOptions(e.target.value==="surface"?{method:"surface",iterations:1,relaxation:.15}:{method:"voxel",resolution:8});}}><option value="surface">Surface refinement</option><option value="voxel">Voxel boundary</option></select></label>
   {options.method==="surface"?<><label className="property-row"><span>Refinement levels (1–3)</span><input aria-label="Remesh levels" type="number" value={options.iterations} onChange={e=>{cancel();setOptions({...options,iterations:Number(e.target.value)});}}/></label><label className="property-row"><span>Relaxation (0–0.5)</span><input aria-label="Remesh relaxation" type="number" step=".05" value={options.relaxation} onChange={e=>{cancel();setOptions({...options,relaxation:Number(e.target.value)});}}/></label></>:<label className="property-row"><span>Longest axis cells (4–24)</span><input aria-label="Voxel resolution" type="number" value={options.resolution} onChange={e=>{cancel();setOptions({...options,resolution:Number(e.target.value)});}}/></label>}
   <button disabled={state.busy} onClick={()=>void preview({type:"remesh-mesh",objectId:selectedObjectId!,options})}>Review Remesh</button>
   <p className="property-hint">Remesh creates a separate object. All old element references are lost in the result; originals remain on the source. Voxel output is stair-stepped; thin features can disappear. Surface supports manifold boundaries; Voxel requires closed manifold input. Non-manifold inputs are rejected. Distance is sampled, not a certified Hausdorff bound; finer grids do not guarantee monotonic error reduction. Volume is an algebraic closed-surface estimate, not a solid-kernel certificate.</p>
  </>}
  {state.busy&&<button onClick={()=>{updateSculptView({active:false});cancel();}}>Cancel Sculpt evaluation</button>}
  {review&&<><pre style={{whiteSpace:"pre-wrap",fontSize:11}}>{report}</pre><button disabled={state.busy||!review.result.ok} onClick={()=>void apply()}>Apply Sculpt result</button><button disabled={state.busy} onClick={cancel}>Discard Sculpt preview</button></>}
  {state.message&&<p role="status">{state.message}</p>}
 </PropertySection>;
}
