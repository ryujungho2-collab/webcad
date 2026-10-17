import {ArchitectureContentPanel} from "./ArchitectureContentPanel";
import {useEffect,useRef,useState} from "react";
import {cadDocument} from "../state/cadDocument";
import {documentVersion,sameDocumentVersion} from "../state/documentSession";
import {applyCadPlan,discardCadPlan,previewCadCommand,type CadPlanPreview} from "../state/documentPlans";
import {analyzeFloorSelection,planFloorTask,type FloorAnalysis,type FloorTaskIntent} from "../precision/floorPlanWorkflow";
import {parseLength} from "../precision/units";
import {profileBoundaryPoints} from "../precision/profileRegions";
import {encodeSvg} from "../export/svgWriter";
import type {Vec3} from "../precision/workPlane";
import {ArchitectureWallPanel} from "./ArchitectureWallPanel";

/** Local guided intents; UI and Copilot open this same revision-bound planner. */
export function FloorPlanTaskPanel({selectedIds,layerId,revision,onClose,onApplied,onInspect,onImport,onExtrude,onWallPreview}:{selectedIds:string[];layerId:string;revision:number;onClose:()=>void;onApplied:(ids:string[])=>void;onInspect:(ids:string[],point?:Vec3)=>void;onImport:()=>void;onExtrude:()=>void;onWallPreview?:(ghosts:import("../copilot/copilotPlan").CopilotGhost[]|null)=>void}){
  const [tolerance,setTolerance]=useState("0.1mm"),[repair,setRepair]=useState(false),[analysis,setAnalysis]=useState<FloorAnalysis|null>(null),[summary,setSummary]=useState<string[]>([]),[preview,setPreview]=useState<CadPlanPreview|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[done,setDone]=useState(false);
  const serial=useRef(0),plan=useRef<string|undefined>(undefined),controller=useRef<AbortController|undefined>(undefined),baseline=useRef(documentVersion()),selection=selectedIds.join("\0");
  const invalidate=()=>{serial.current++;controller.current?.abort();if(plan.current)discardCadPlan(plan.current);plan.current=undefined;setPreview(null);setSummary([]);setAnalysis(null);setDone(false);setBusy(false);};
  useEffect(()=>{invalidate();baseline.current=documentVersion();},[revision,selection,layerId]);
  useEffect(()=>()=>{serial.current++;controller.current?.abort();if(plan.current)discardCadPlan(plan.current);},[]);
  const edit=()=>{invalidate();setError("");};
  async function review(kind:FloorTaskIntent["kind"]){
    invalidate();setBusy(true);setError("");const request=serial.current,version=documentVersion(),scope=new AbortController();controller.current=scope;baseline.current=version;
    try{
      const mm=parseLength(tolerance);if(mm===null)throw Error("Enter a tolerance with units, e.g. 0.1mm.");
      if(kind==="make-face")setAnalysis(analyzeFloorSelection(cadDocument,selectedIds,mm,repair));
      const intent:FloorTaskIntent={requestId:crypto.randomUUID(),documentId:version.documentId,revision:version.revision,targetIds:[...selectedIds],kind,toleranceMm:mm,repair,layerId};
      const task=planFloorTask(cadDocument,intent),result=await previewCadCommand(task.command,{signal:scope.signal});
      if(request!==serial.current||!sameDocumentVersion(version)){discardCadPlan(result.planId);return;}
      if(!result.result.ok){discardCadPlan(result.planId);throw Error(result.result.reason??"Task was rejected.");}
      plan.current=result.planId;setPreview(result);setSummary(task.summary);
    }catch(e){if(!scope.signal.aborted&&request===serial.current)setError(e instanceof Error?e.message:String(e));}
    finally{if(request===serial.current)setBusy(false);}
  }
  async function apply(){if(!preview||busy||!sameDocumentVersion(baseline.current))return;setBusy(true);try{const result=await applyCadPlan(preview.planId,{signal:controller.current?.signal});plan.current=undefined;setPreview(null);if(!result.ok)throw Error(result.reason??"Task changed. Review again.");onApplied(result.createdIds.filter(id=>cadDocument.objects[id]));setDone(true);setError("");}catch(e){setError(String(e));}finally{setBusy(false);}}
  let svg="",previewError="";try{let remaining=200000;const points=(loop:FloorAnalysis["loops"][number],boundary=loop)=>{const value=profileBoundaryPoints(boundary,loop.workPlane,.02,remaining);remaining-=value.length;return value;};if(analysis?.loops.length)svg=encodeSvg(analysis.loops.map(loop=>({points:points(loop),holes:loop.holes?.map(h=>points(loop,h as FloorAnalysis["loops"][number])),closed:true,fill:"#a3bec9",color:"#263b44"})));}catch(e){previewError=String(e);}
  const receipts=selectedIds.flatMap(id=>{const feature=Object.values(cadDocument.features).find(f=>f.output===id);return feature?.params.floorPlanSource?[{id,source:feature.params.floorPlanSource}]:[];});
  return <aside className="floor-task-panel" aria-label="Floor plan tasks" data-cad-editor onKeyDown={e=>{if(e.key==="Escape"){e.preventDefault();e.stopPropagation();invalidate();setError("Task cancelled; document unchanged.");}}}>
    <header><strong>Floor plan · 평면도 작업</strong><button onClick={onClose} disabled={busy}>Close floor tasks</button></header>
    <p>Local guided Copilot intents. Review fixes targets, units and document revision; Apply is one Undo.</p>
    <button onClick={onImport} disabled={busy}>Prepare / import DXF…</button>
    <ArchitectureWallPanel selectedIds={selectedIds} layerId={layerId} revision={revision} onApplied={onApplied} onPreview={onWallPreview}/>
    <details><summary>Content, floors & finishes…</summary><ArchitectureContentPanel selectedIds={selectedIds} layerId={layerId} revision={revision} onApplied={onApplied} onPreview={onWallPreview}/></details>
    <button onClick={()=>void review("purge")} disabled={busy}>Review PURGE</button>
    <p>Hidden geometry and referenced definitions/layers remain in use. PURGE removes only the listed unused definitions and empty unreferenced layers.</p>
    <p>{selectedIds.length} selected sources · select outer and hole boundaries together. Locked references may be read, never modified.</p>
    <label>Repair tolerance<input aria-label="Face repair tolerance" value={tolerance} disabled={busy} onChange={e=>{edit();setTolerance(e.target.value);}}/></label>
    <label><input type="checkbox" aria-label="Propose gap bridges" checked={repair} disabled={busy} onChange={e=>{edit();setRepair(e.target.checked);}}/>Propose unambiguous endpoint bridges within tolerance</label>
    <button disabled={busy||!selectedIds.length} onClick={()=>void review("make-face")}>Diagnose / review Make face</button>
    {analysis?.issues.map((issue,i)=><div key={i} role="status"><span>{issue.kind}: {issue.message} {issue.distanceMm!==undefined&&`${issue.distanceMm.toFixed(6)} mm`} {issue.point&&`(${issue.point.map(v=>v.toFixed(3)).join(", ")})`}</span><button onClick={()=>onInspect(issue.objectIds,issue.point)}>Inspect issue {i+1}</button></div>)}
    {svg&&<img alt="Face regions and holes preview" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}/>}
    {summary.length>0&&<ul aria-label="Floor task changes">{summary.map((s,i)=><li key={i}>{s}</li>)}</ul>}
    {preview&&<p>{preview.changes.length} object changes · {preview.impact?.map(i=>`${i.kind}: ${i.before} → ${i.after}`).join("; ")}</p>}
    {(error||previewError)&&<p role="alert">{error||previewError}</p>}{busy&&<p role="status">Preparing local task…</p>}
    <button disabled={!preview||busy||!!previewError||!sameDocumentVersion(baseline.current)} onClick={()=>void apply()}>Apply floor task</button>
    <button disabled={!busy&&!preview} onClick={()=>{invalidate();setBusy(false);setError("Task cancelled; document unchanged.");}}>Cancel floor task</button>
    {done&&<p role="status">Applied. Select a face to extrude, or continue preparing boundaries.</p>}
    <button onClick={onExtrude} disabled={busy||!selectedIds.length}>Extrude selected face…</button>
    {!!receipts.length&&<details><summary>Source receipt / original coordinates</summary><p>Source world units = (current imported world mm + base point mm) / unitMm. Later model edits require their own inverse transform.</p><pre>{JSON.stringify(receipts,null,2)}</pre></details>}
  </aside>;
}

