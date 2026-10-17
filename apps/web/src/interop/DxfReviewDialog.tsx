import { useEffect, useRef, useState, type ReactNode } from "react";
import type { CadCommand } from "@agent-webcad/cad-commands";
import type { DxfImportStats } from "./dxfImport";
import { applyCadPlan, discardCadPlan, getCadPlanDrawingPaths, getCadPlanDraftingGeometry, previewCadCommand, type CadPlanPreview } from "../state/documentPlans";
import { commandInteraction } from "../state/commandInteraction";
import { sameDocumentVersion, type DocumentVersion } from "../state/documentSession";
import { CommandReview } from "../ui/CommandReview";
import { downloadFile } from "../export/exportModel";
import { encodeSvg, type SvgPolyline, type SvgText } from "../export/svgWriter";
import { WORK_PLANES, worldToPlane } from "../precision/workPlane";
import "../ui/palette.css";
import {pickDxfPreviewPoint} from "./dxfPreviewPick";

export type DxfReview = {mode:"import";name:string;command:CadCommand;stats:DxfImportStats;details?:string[];baseVersion:DocumentVersion}
 | {mode:"export";name:string;text:string;entities:number;skipped:number;warnings:string[];details?:string[];baseVersion:DocumentVersion};

export function DxfReviewDialog({source,revision,onClose,onApplied,format="DXF",preparationControls,preparationPending=false,preparationBlocked=false,onPreviewPick}:{preparationBlocked?:boolean;onPreviewPick?:(point:[number,number])=>void;preparationControls?:ReactNode;preparationPending?:boolean;format?:"DXF"|"Exchange fixture";source:DxfReview;revision:number;onClose:()=>void;onApplied:(ids:string[])=>void}) {
 const dialog=useRef<HTMLDialogElement>(null),[preview,setPreview]=useState<CadPlanPreview|null>(null),[svg,setSvg]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false),[ack,setAck]=useState(false);
 const warnings=source.mode==="import"?source.stats.skipped:source.warnings;
 const excluded=source.mode==="import"?warnings.length:source.skipped;
 const stale=!sameDocumentVersion(source.baseVersion),key=source.name;
 const [reviewedSource,setReviewedSource]=useState<DxfReview|null>(null);
 const [endpoints,setEndpoints]=useState<[number,number][]>([]);
 const currentPreview=reviewedSource===source?preview:null;
 useEffect(()=>{dialog.current?.showModal();return()=>{dialog.current?.close();};},[]);
 useEffect(()=>{
  setPreview(null);setSvg("");setError("");setAck(false);setReviewedSource(null);
  if(source.mode!=="import"||stale)return;
  let cancelled=false,planId:string|undefined;
  void previewCadCommand(source.command).then(plan=>{
   planId=plan.planId;if(cancelled){discardCadPlan(planId);return;}setPreview(plan);setReviewedSource(source);
   const commands=source.command.type==="batch"?source.command.commands:[source.command],lines:SvgPolyline[]=[],texts:SvgText[]=[];
   const hidden=new Set(commands.flatMap(c=>c.type==="set-object-visible"&&!c.visible?[c.objectId]:[]));
   for(const command of commands)if(command.type==="create-drawing"&&command.id&&!hidden.has(command.id)){const paths=getCadPlanDrawingPaths(plan.planId,command.id,"world");if(paths?.after)lines.push({points:paths.after.map(p=>worldToPlane(p,WORK_PLANES.XY)),closed:paths.afterClosed});}
   for(const command of commands)if((command.type==="create-drafting"||command.type==="insert-block")&&command.id&&!hidden.has(command.id)){
    const data=getCadPlanDraftingGeometry(plan.planId,command.id);if(!data)continue;
    const xy=WORK_PLANES.XY;
    lines.push(...data.lines.map(line=>({points:line.points.map(p=>worldToPlane(p,xy)),closed:line.closed})));
    texts.push(...data.texts.map(text=>({position:worldToPlane(text.point,xy),text:text.text,size:text.height,align:text.align,angle:text.angle,...(text.axes?{basis:text.axes.map(axis=>worldToPlane(axis,xy)) as [[number,number],[number,number]]}:{})})));
   }
   if(lines.length||texts.length){setSvg(encodeSvg(lines,{texts}));setEndpoints(lines.flatMap(l=>l.closed?l.points:[l.points[0],l.points.at(-1)!]).filter(Boolean));}
  }).catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:String(e));});
  return()=>{cancelled=true;if(planId)discardCadPlan(planId);};
 },[source,revision,stale]);
 const interaction=commandInteraction({command:`Import ${format}`,draftKey:key,reviewedKey:currentPreview?key:undefined,preview:currentPreview,targets:[],pending:busy,inputError:stale?`Document changed. Cancel and choose the ${format} file again.`:preparationBlocked?"Verify input units and the known length before importing.":preparationPending?"Settings changed. Review preparation before importing.":error||excluded&&!ack?error||"Confirm the listed exclusions before importing the supported subset.":undefined});
 const apply=async()=>{
  if(!interaction.canApply||!currentPreview)return;setBusy(true);
  try{const result=await applyCadPlan(currentPreview.planId);if(result.ok){onApplied(result.createdIds);onClose();}else setError(result.reason??"Import failed. Cancel and choose the file again.");}
  catch(e){setError(e instanceof Error?e.message:"Import failed.");}finally{setBusy(false);}
 };
 return <dialog ref={dialog} className="dxf-review-dialog" aria-label={`${source.mode==="import"?"Import":"Export"} ${format} review`} onCancel={e=>{e.preventDefault();if(!busy)onClose();}}>
  <div className="dxf-review-body"><h2>{source.mode==="import"?"Import":"Export"} {format}</h2><p>{source.name}</p>
  {preparationControls&&<fieldset disabled={busy||stale} className="dxf-preparation-host">{preparationControls}</fieldset>}
  {source.mode==="import"&&source.stats.preparation&&<p aria-label="DXF preparation summary">{source.stats.preparation.excludedEntities} source entities intentionally excluded · {source.stats.preparation.omittedBlocks} unused definitions and {source.stats.preparation.omittedLayers} unused layers omitted. Base point ({source.stats.preparation.originMm.join(", ")}) mm → (0, 0, 0). {source.stats.preparation.reference?"Separate CAD reference layers will be locked.":"Editable geometry."} {source.stats.preparation.dependencyLayers.length>0&&`Retained block dependencies: ${source.stats.preparation.dependencyLayers.join(", ")}.`}</p>}
  <p>{source.mode==="import"?source.stats.created:source.entities} supported entities · {source.mode==="import"?source.stats.unitName:"mm"} · {excluded} exclusions/warnings</p>
  {source.mode === "import" && !!source.stats.oriented && <p aria-label="DXF OCS placement">{source.stats.oriented} oriented OCS entity placement(s). Preview projects world XY; Apply preserves the actual 3D placement. Tilted curves require aligned editing tools.</p>}
  <p>{format === "DXF" ? "CAD constraints, construction, patterns, Scene links and annotation associations stay in WebCAD JSON. DXF carries the supported geometry and layer styles." : "Offline JSON fixture: independent lines and rectangles only. Source ID mappings, original coordinates, losses and asset metadata are saved in WebCAD JSON. Asset bytes are unavailable; dependent entities are excluded. Export uses world/mm coordinates."}</p>
  {source.details?.length ? <details><summary>Source manifest and ID mapping</summary><ul>{source.details.map((detail,i)=><li key={i}>{detail}</li>)}</ul></details> : null}
  {warnings.length>0&&<ul aria-label={`${format} exclusions`}>{warnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul>}
  {excluded>0&&<label><input type="checkbox" aria-label={`Accept ${format} exclusions`} checked={ack} onChange={e=>setAck(e.target.checked)}/>Continue with the supported subset</label>}
  {svg&&!preparationPending&&reviewedSource===source&&<><img alt={`${format} geometry preview`} style={onPreviewPick?{cursor:"crosshair"}:undefined} onClick={e=>{if(!onPreviewPick)return;const point=pickDxfPreviewPoint(svg,e.currentTarget.getBoundingClientRect(),[e.clientX,e.clientY],endpoints);if(point)onPreviewPick(point);}} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}/><p>{format === "DXF" ? "Prepared geometry and nested components projected onto world XY. OCS elevations and orientations are preserved in the 3D model. Picks snap to displayed endpoints within 10 pixels. Edge-on geometry can collapse in this projection." : "Preview of supported finite geometry in its authoring plane. Source mapping and manifest are listed above."}</p></>}
  {source.mode==="import"?<CommandReview state={interaction}/>:stale?<p role="alert">Document changed. Cancel and export again.</p>:null}
  </div><footer>
  {source.mode==="import"?<button aria-label={`Apply ${format} import`} disabled={!interaction.canApply} onClick={()=>void apply()}>Import reviewed {format}</button>:<button aria-label={`Download reviewed ${format}`} disabled={stale||excluded>0&&!ack} onClick={()=>{downloadFile(source.text,source.name,format === "DXF" ? "application/dxf" : "application/json");onClose();}}>Download {format}</button>}
  <button aria-label={`Cancel ${format} review`} disabled={busy} onClick={onClose}>Cancel</button></footer>
 </dialog>;
}
