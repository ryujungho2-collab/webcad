import {useEffect,useRef,useState} from "react";
import type {CadCommand} from "@agent-webcad/cad-commands";
import {cadDocument} from "../state/cadDocument";
import {resolveHybridReference} from "../state/hybridReferences";
import {canConvertBrep,type HybridDatum} from "../state/hybridCommands";
import {updateHybridView} from "../state/hybridSession";
import {updateSculptView} from "../state/sculptSession";
import {previewCadCommand,applyCadPlan,discardCadPlan,getCadPlanFrameDocument} from "../state/documentPlans";
import {buildExtrudeMesh,buildPrimitiveMesh} from "../cad/kernelGeometryService";
import {PropertySection} from "../ui/PropertySection";

export function HybridPanel({selectedObjectId,revision,onCreated,onDocumentChange}:{selectedObjectId:string|null;revision:number;onCreated:(id:string)=>void;onDocumentChange:()=>void}){
  const [referenceId,setReferenceId]=useState("mesh-datum"),[dimensions,setDimensions]=useState({width:4,depth:6,height:5}),[message,setMessage]=useState(""),[review,setReview]=useState<Awaited<ReturnType<typeof previewCadCommand>>|null>(null),[busy,setBusy]=useState(false);
  const plan=useRef<string|undefined>(undefined),sequence=useRef(0),controller=useRef<AbortController|undefined>(undefined);
  const feature=Object.values(cadDocument.features).find(f=>f.output===selectedObjectId),isMesh=feature?.type==="mesh",h=feature?.params.hybridDatum as HybridDatum|undefined;
  const plane=cadDocument.workPlanes?.[h?.referenceId??referenceId],resolution=plane?.hybrid&&resolveHybridReference(cadDocument,plane.hybrid);
  function cancel(){sequence.current++;controller.current?.abort();if(plan.current)discardCadPlan(plan.current);plan.current=undefined;setReview(null);setBusy(false);updateHybridView({});}
  useEffect(()=>{cancel();},[selectedObjectId,revision]);
  useEffect(()=>()=>{sequence.current++;controller.current?.abort();if(plan.current)discardCadPlan(plan.current);updateHybridView({});},[]);
  async function preview(command:CadCommand){cancel();updateSculptView({active:false});const ticket=++sequence.current,abort=new AbortController();controller.current=abort;setBusy(true);setMessage("Validating Hybrid preview…");
    try{const result=await previewCadCommand(command,{signal:abort.signal});if(ticket!==sequence.current){discardCadPlan(result.planId);return;}plan.current=result.planId;setReview(result);if(!result.result.ok)throw Error(result.result.reason);
      const doc=getCadPlanFrameDocument(result.planId)!;if(command.type==="hybrid-reference")updateHybridView({frame:doc.workPlanes?.[command.referenceId]});
      else if(command.type==="hybrid-datum"){const f=Object.values(doc.features).find(f=>f.output===result.result.createdIds[0])!;const data=await buildExtrudeMesh(f.params,true,{signal:abort.signal});if(ticket===sequence.current)updateHybridView({preview:{data},frame:doc.workPlanes?.[command.referenceId]});}
      else if(command.type==="hybrid-to-mesh"){const f=Object.values(cadDocument.features).find(f=>f.output===command.objectId)!;const data=f.type==="primitive"?await buildPrimitiveMesh(f.params,{signal:abort.signal}):await buildExtrudeMesh(f.params,true,{signal:abort.signal});if(ticket===sequence.current)updateHybridView({preview:{data,objectId:command.objectId}});}
      if(ticket===sequence.current)setMessage("Validated preview. Apply publishes one transaction; Discard preserves the document.");
    }catch(e){if(ticket===sequence.current)setMessage(String(e));}finally{if(ticket===sequence.current)setBusy(false);}
  }
  async function apply(){if(!plan.current)return;setBusy(true);try{const result=await applyCadPlan(plan.current);if(!result.ok)throw Error(result.reason);cancel();setMessage("Hybrid change applied.");onDocumentChange();if(result.createdIds[0])onCreated(result.createdIds[0]);}catch(e){setBusy(false);setMessage(String(e));}}
  if(!feature||!isMesh&&!canConvertBrep(feature))return null;
  return <PropertySection title="Hybrid BRep / Mesh" meta="Material-point reference · exact prism" defaultOpen={false} active keepOpen={busy||!!review}>
    {isMesh&&<>
      <label className="property-row"><span>Reference ID</span><input aria-label="Hybrid reference ID" value={referenceId} disabled={busy} onChange={e=>{cancel();setReferenceId(e.target.value);}}/></label>
      <button disabled={busy} onClick={()=>{cancel();updateSculptView({active:false});setMessage("Click the selected mesh surface. Escape cancels picking.");updateHybridView({pick:{objectId:selectedObjectId!,accept:(origin,direction,expectedFingerprint)=>void preview({type:"hybrid-reference",objectId:selectedObjectId!,referenceId,origin,direction,expectedFingerprint}),error:setMessage}});}}>Pick Mesh surface</button>
      {(["width","depth","height"] as const).map(key=><label className="property-row" key={key}><span>{key} (mm)</span><input aria-label={`Hybrid ${key}`} type="number" min=".01" max="10000" value={dimensions[key]} disabled={busy} onChange={e=>{cancel();setDimensions({...dimensions,[key]:Number(e.target.value)});}}/></label>)}
      <button disabled={busy||!plane?.hybrid||plane.hybrid.objectId!==selectedObjectId} onClick={()=>void preview({type:"hybrid-datum",referenceId,...dimensions})}>Review datum + precise prism</button>
    </>}
    {resolution&&<p role="status">Reference {plane!.id}: {resolution.status}. {"reason" in resolution?resolution.reason:"Triangle material point resolved; dimensions remain in world millimetres."}</p>}
    {h&&<p>Precise BRep: {h.width} × {h.depth} × {h.height} mm · {h.status}. Source: {plane?.hybrid?.objectId}. Last valid shape remains visible if the reference is lost; export and further use are blocked.</p>}
    {canConvertBrep(feature)&&<button disabled={busy} onClick={()=>void preview({type:"hybrid-to-mesh",objectId:selectedObjectId!})}>Review BRep to Mesh</button>}
    <p className="property-hint">Planar boxes and Hybrid rectangular prisms only. Conversion preserves the BRep and loses editable parametric history in the independent Mesh. Zero analytic chord error for this planar subset; seam displacement is measured, not a certified distance bound. Surface reference normals are triangle normals, not fitted smooth surfaces. Bake Geometry Nodes/modifiers before picking. Topology changes require explicit reselection.</p>
    {review&&<><button disabled={busy||!review.result.ok} onClick={()=>void apply()}>Apply Hybrid result</button><button disabled={busy} onClick={cancel}>Discard Hybrid preview</button></>}
    {busy&&<button onClick={cancel}>Cancel Hybrid evaluation</button>}
    <p role="status">{message}</p>
  </PropertySection>;
}
