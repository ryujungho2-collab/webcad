import {useEffect,useRef,useState} from "react";
import {DEFAULT_RECONSTRUCTION,type ReconstructionOptions,type PlanarAnalysis,type HealingReport} from "@agent-webcad/cad-document";
import {cadDocument} from "../state/cadDocument";
import {reconstructionSource,reconstructionSnapshotStatus} from "../state/reconstructionCommands";
import {hybridSource} from "../state/hybridReferences";
import {previewCadCommand,applyCadPlan,discardCadPlan,getCadPlanFrameDocument} from "../state/documentPlans";
import {updateHybridView} from "../state/hybridSession";
import {updateSculptView} from "../state/sculptSession";
import {buildPrimitiveMesh} from "../cad/kernelGeometryService";
import {PropertySection} from "../ui/PropertySection";
export function ReconstructionPanel({selectedObjectId,revision,onCreated,onDocumentChange}:{selectedObjectId:string|null;revision:number;onCreated:(id:string)=>void;onDocumentChange:()=>void}){
 const feature=Object.values(cadDocument.features).find(f=>f.output===selectedObjectId),isMesh=feature?.type==="mesh",receipt=feature?.params.reconstructionReceipt as Record<string,unknown>|undefined;
 const [options,setOptions]=useState<ReconstructionOptions>({...DEFAULT_RECONSTRUCTION}),[analysis,setAnalysis]=useState<PlanarAnalysis|null>(null),[report,setReport]=useState<Record<string,unknown>|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[ready,setReady]=useState(false);
 const sequence=useRef(0),plan=useRef<string|undefined>(undefined),controller=useRef<AbortController|undefined>(undefined);
 function cancel(){sequence.current++;controller.current?.abort();if(plan.current)discardCadPlan(plan.current);plan.current=undefined;setBusy(false);setReady(false);setReport(null);updateHybridView({});}
 useEffect(()=>{cancel();setAnalysis(null);setMessage("");},[selectedObjectId,revision]);
 useEffect(()=>()=>{sequence.current++;controller.current?.abort();if(plan.current)discardCadPlan(plan.current);updateHybridView({});},[]);
 async function analyze(){cancel();setBusy(true);setMessage("Analyzing bounded Mesh geometry…");const ticket=++sequence.current;await new Promise<void>(resolve=>setTimeout(resolve,0));if(ticket!==sequence.current)return;try{const a=reconstructionSource(cadDocument,selectedObjectId!,options).analysis;setAnalysis(a);setMessage(a.rejection??`${a.planarFaces} planar region candidates; kernel verification still required.`);}catch(e){setAnalysis(null);setMessage(String(e));}finally{if(ticket===sequence.current)setBusy(false);}}
 async function preview(){cancel();updateSculptView({active:false});const ticket=++sequence.current,abort=new AbortController();controller.current=abort;setBusy(true);setMessage("Reconstructing and checking OpenCascade solid…");try{
  const result=await previewCadCommand({type:"reconstruct-planar-mesh",objectId:selectedObjectId!,options},{signal:abort.signal});if(ticket!==sequence.current){discardCadPlan(result.planId);return;}plan.current=result.planId;if(!result.result.ok)throw Error(result.result.reason);const doc=getCadPlanFrameDocument(result.planId)!,f=Object.values(doc.features).find(f=>f.output===result.result.createdIds[0])!,data=await buildPrimitiveMesh(f.params,{signal:abort.signal});if(ticket!==sequence.current)return;setReport(f.params.reconstructionReceipt as Record<string,unknown>);updateHybridView({preview:{data}});setReady(true);setMessage("Validated closed BRep preview. Original Mesh retained.");
 }catch(e){if(ticket===sequence.current)setMessage(String(e));}finally{if(ticket===sequence.current)setBusy(false);}}
 async function apply(){if(!plan.current)return;setBusy(true);try{const r=await applyCadPlan(plan.current);if(!r.ok)throw Error(r.reason);cancel();onDocumentChange();onCreated(r.createdIds[0]);}catch(e){setBusy(false);setMessage(String(e));}}
 if(!isMesh&&!receipt)return null;const shown=report??receipt;const status=receipt?reconstructionSnapshotStatus(cadDocument,selectedObjectId!):undefined,healing=shown?.healing as HealingReport|undefined;
 return <PropertySection title="Mesh → planar BRep" meta="Recognized regions · bounded reconstruction" defaultOpen={false} active keepOpen={busy||ready}>
  {isMesh&&<>
   {(["absoluteTolerance","relativeTolerance","angleDegrees"] as const).map(key=><label className="property-row" key={key}><span>{key}</span><input type="number" aria-label={`Reconstruction ${key}`} value={options[key]} disabled={busy} step="any" onChange={e=>{cancel();setAnalysis(null);setOptions({...options,[key]:Number(e.target.value)});}}/></label>)}
   <button disabled={busy} onClick={()=>void analyze()}>Analyze Mesh regions</button>
   {analysis&&<p role="status">{analysis.components} components · {analysis.boundaryEdges} boundary edges · {analysis.planarFaces} planar regions · {analysis.definition.regions.reduce((n,r)=>n+r.loops.length-1,0)} holes · effective tolerance {analysis.definition.tolerance} mm</p>}
   <button disabled={busy||!analysis?.solidCandidate} onClick={()=>void preview()}>Review planar reconstruction</button>
  </>}
  {receipt&&<p role="status">Independent BRep snapshot from {String(receipt.sourceObjectId)}. {status?.qualityCurrent?"Source and result placement match the quality report.":"Source or result placement changed/missing; quality report is historical. Result is NOT regenerated."}</p>}
  {healing&&<p role="status">Healing {String(healing.applied?"applied":"validated")}: {String(healing.correctedVertices)} vertices / {String(healing.correctedEdges)} edges · max input movement {String(healing.maxInputMovement)} mm · tolerance use {String(healing.toleranceUtilization*100)}% · {String(healing.reason)}</p>}
  {shown&&<><p role="status">OpenCascade {String(shown.kernelValidity)} · closed solid · {String(shown.brepFaces)} faces</p><pre aria-label="Reconstruction quality" style={{whiteSpace:"pre-wrap",fontSize:11}}>{JSON.stringify(shown,null,2)}</pre></>}
  {ready&&<><button disabled={busy} onClick={()=>void apply()}>Apply reconstructed BRep</button><button disabled={busy} onClick={cancel}>Discard reconstruction preview</button></>}
  {busy&&<button onClick={cancel}>Cancel reconstruction</button>}
  <p role="status">{message}</p>
  <p className="property-hint">World mm. ≤1,000 vertices / 2,000 triangles / 128 regions. One outward, closed manifold component only; open Shell publication is unsupported. Holes are retained, not capped. Shared plane intersections reuse boundary vertices and edges. Healing movement must stay within the unchanged effective tolerance; holes/thin walls within 4× tolerance are refused. Plane fit uses effective absolute/relative tolerance; sewing uses 2× tolerance and sampled deviation must be ≤4× tolerance + 1e-7 mm. Bidirectional sampled distances are approximate, not certified Hausdorff bounds. No cylinder/NURBS fitting or recovered design constraints. Zero-merge inputs are reported as faceted, not recovered analytic surfaces. Original Mesh remains editable.</p>
 </PropertySection>;
}
