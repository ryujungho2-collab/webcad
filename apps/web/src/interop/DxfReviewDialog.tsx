import { useEffect, useRef, useState } from "react";
import type { CadCommand } from "@agent-webcad/cad-commands";
import type { DxfImportStats } from "./dxfImport";
import { applyCadPlan, discardCadPlan, getCadPlanDrawingPaths, previewCadCommand, type CadPlanPreview } from "../state/documentPlans";
import { commandInteraction } from "../state/commandInteraction";
import { sameDocumentVersion, type DocumentVersion } from "../state/documentSession";
import { CommandReview } from "../ui/CommandReview";
import { downloadFile } from "../export/exportModel";
import { encodeSvg, type SvgPolyline } from "../export/svgWriter";
import { WORK_PLANES, worldToPlane, type WorkPlaneId } from "../precision/workPlane";
import "../ui/palette.css";

export type DxfReview = {mode:"import";name:string;command:CadCommand;stats:DxfImportStats;baseVersion:DocumentVersion}
 | {mode:"export";name:string;text:string;entities:number;skipped:number;warnings:string[];baseVersion:DocumentVersion};

export function DxfReviewDialog({source,revision,onClose,onApplied}:{source:DxfReview;revision:number;onClose:()=>void;onApplied:(ids:string[])=>void}) {
 const dialog=useRef<HTMLDialogElement>(null),[preview,setPreview]=useState<CadPlanPreview|null>(null),[svg,setSvg]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false),[ack,setAck]=useState(false);
 const warnings=source.mode==="import"?source.stats.skipped:source.warnings;
 const excluded=source.mode==="import"?warnings.length:source.skipped;
 const stale=!sameDocumentVersion(source.baseVersion),key=source.name;
 useEffect(()=>{dialog.current?.showModal();return()=>{dialog.current?.close();};},[]);
 useEffect(()=>{
  if(source.mode!=="import"||stale)return;
  let cancelled=false,planId:string|undefined;
  void previewCadCommand(source.command).then(plan=>{
   planId=plan.planId;if(cancelled){discardCadPlan(planId);return;}setPreview(plan);
   const commands=source.command.type==="batch"?source.command.commands:[source.command],lines:SvgPolyline[]=[];
   for(const command of commands)if(command.type==="create-drawing"&&command.id){const paths=getCadPlanDrawingPaths(plan.planId,command.id);if(paths?.after){const plane=(command.params.workPlane??"XY") as WorkPlaneId;lines.push({points:paths.after.map(p=>worldToPlane(p,WORK_PLANES[plane])),closed:paths.afterClosed});}}
   if(lines.length)setSvg(encodeSvg(lines));
  }).catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:String(e));});
  return()=>{cancelled=true;if(planId)discardCadPlan(planId);};
 },[source,revision,stale]);
 const interaction=commandInteraction({command:"Import DXF",draftKey:key,reviewedKey:preview?key:undefined,preview,targets:[],pending:busy,inputError:stale?"Document changed. Cancel and choose the DXF file again.":error||excluded&&!ack?error||"Confirm the listed exclusions before importing the supported subset.":undefined});
 const apply=async()=>{
  if(!interaction.canApply||!preview)return;setBusy(true);
  try{const result=await applyCadPlan(preview.planId);if(result.ok){onApplied(result.createdIds);onClose();}else setError(result.reason??"Import failed. Cancel and choose the file again.");}
  catch(e){setError(e instanceof Error?e.message:"Import failed.");}finally{setBusy(false);}
 };
 return <dialog ref={dialog} className="dxf-review-dialog" aria-label={`${source.mode==="import"?"Import":"Export"} DXF review`} onCancel={e=>{e.preventDefault();if(!busy)onClose();}}>
  <div className="dxf-review-body"><h2>{source.mode==="import"?"Import":"Export"} DXF</h2><p>{source.name}</p>
  <p>{source.mode==="import"?source.stats.created:source.entities} supported entities · {source.mode==="import"?source.stats.unitName:"mm"} · {excluded} exclusions/warnings</p>
  <p>CAD constraints, construction, patterns, Scene links and annotation associations stay in WebCAD JSON. DXF carries the supported geometry and layer styles.</p>
  {warnings.length>0&&<ul aria-label="DXF exclusions">{warnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul>}
  {excluded>0&&<label><input type="checkbox" aria-label="Accept DXF exclusions" checked={ack} onChange={e=>setAck(e.target.checked)}/>Continue with the supported subset</label>}
  {svg&&<><img alt="DXF geometry preview" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}/><p>Finite drawing preview. Text and component labels are listed in the import summary.</p></>}
  {source.mode==="import"?<CommandReview state={interaction}/>:stale?<p role="alert">Document changed. Cancel and export again.</p>:null}
  </div><footer>
  {source.mode==="import"?<button aria-label="Apply DXF import" disabled={!interaction.canApply} onClick={()=>void apply()}>Import reviewed DXF</button>:<button aria-label="Download reviewed DXF" disabled={stale||excluded>0&&!ack} onClick={()=>{downloadFile(source.text,source.name,"application/dxf");onClose();}}>Download DXF</button>}
  <button aria-label="Cancel DXF review" disabled={busy} onClick={onClose}>Cancel</button></footer>
 </dialog>;
}
