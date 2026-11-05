import type {CadDocument} from "@agent-webcad/cad-document";
import {cadDocument} from "../state/cadDocument";
import {collectArtboardExportItems} from "./exportModel";
import {modelSheetOwnedIds} from "../precision/modelSheet";
import {encodeDxf} from "../interop/dxfWriter";
import {encodeFrameDxf} from "./frameDxf";
import {modelSheetDxf} from "./modelSheetExport";
import type {ArtboardPngScene} from "./artboardPng";
import type {SvgExportItem,SvgText} from "./svgWriter";
export type OutputFormat="pdf"|"svg"|"dxf";
export type OutputIssue={code:string;severity:"error"|"warning"|"info";message:string;boardId:string;objectId?:string;viewId?:string};
export type OutputPage={boardId:string;name:string;issues:OutputIssue[];scene?:ArtboardPngScene;scaleLabel:string};
export function textEnvelope(t:SvgText){const h=t.size??3.5,w=Math.max(h,Array.from(t.text).length*h*1.2),left=t.align==="center"?-w/2:0,a=(t.angle??0)*Math.PI/180,u=t.basis?.[0]??[Math.cos(a),Math.sin(a)],v=t.basis?.[1]??[-Math.sin(a),Math.cos(a)];return [left,left+w].flatMap(x=>[-h*.3,h].map(y=>[t.position[0]+x*u[0]+y*v[0],t.position[1]+x*u[1]+y*v[1]]));}
/** Read-only diagnostics. The exact collector used by output supplies the scene. */
export function checkOutputPage(d:CadDocument,boardId:string,format:OutputFormat,collect:(id:string)=>SvgExportItem[]):OutputPage{
 const b=d.artboards?.[boardId],issues:OutputIssue[]=[],sheet=Object.values(d.modelPresentation?.sheets??{}).find(s=>s.artboardId===boardId);
 const add=(code:string,severity:OutputIssue['severity'],message:string,objectId?:string,viewId?:string)=>issues.push({code,severity,message,boardId,objectId,viewId});
 const page:OutputPage={boardId,name:b?.name??boardId,issues,scaleLabel:sheet?`1:${sheet.denominator}`:b?.frame?`1:${b.frame.denominator}`:'Paper mm'};
 if(!b){add('missing-board','error','Sheet artboard is missing.');return page;}
 if(sheet&&(!Number.isFinite(sheet.denominator)||sheet.denominator<=0))add('paper-scale','error','Sheet scale denominator must be finite and positive.');
 if(!b.visible)add('hidden-board','error','Sheet artboard is hidden.');
 if(!b.size.every(n=>Number.isFinite(n)&&n>0))add('paper-size','error','Paper dimensions must be finite and positive.');
 let ids:string[]|undefined;
 try{ids=b.frame?.memberIds??modelSheetOwnedIds(d,boardId);}catch(e){add('missing-view','error',e instanceof Error?e.message:String(e));}
 const p=d.modelPresentation,viewIds=sheet?Object.keys(sheet.placements):Object.keys({...p?.projections,...p?.sections}).filter(id=>{const v=p?.projections[id]??p?.sections?.[id];return v&&Object.values(v.outputs).some(o=>ids?ids.includes(o.objectId):Object.values(d.features).some(f=>f.output===o.objectId&&f.params.workPlane===b.workPlane));});
 for(const id of viewIds){const view=p?.projections[id]??p?.sections?.[id];if(!view){add('missing-view','error',`Missing view: ${id}`,undefined,id);continue;}
  if(view.status!=='resolved')add('stale-view','error',`${view.name}: ${view.reason??'Rebind the changed source before output.'}`,undefined,id);
  for(const partId of view.partIds){const part=p?.parts[partId];if(!part||!d.objects[part.objectId])add('missing-source','error',`${view.name}: missing source ${partId}.`,part?.objectId,id);}
  if(sheet&&Math.abs(view.scale-1/sheet.denominator)>1e-8)add('scale-mismatch','error',`${view.name}: view scale differs from sheet 1:${sheet.denominator}.`,undefined,id);
  for(const o of [...Object.values(view.outputs),...Object.values('decorations' in view?view.decorations??{}:{})])if(!d.objects[o.objectId])add('missing-output','error',`${view.name}: output ${o.objectId} is missing.`,o.objectId,id);
  if('presentationWarnings' in view)for(const warning of view.presentationWarnings??[])add('section-presentation','warning',warning,undefined,id);
 }
 const scoped=ids??d.rootObjects,features=new Map(Object.values(d.features).map(f=>[f.output,f]));
 for(const id of scoped){const o=d.objects[id],f=features.get(id);if(!o||!f){add('missing-object','error',`Missing referenced object ${id}.`,id);continue;}
  if(!o.visible||d.layers[o.layerId]?.visible===false){if(ids)add('hidden-output','warning',`${o.name}: hidden output will be omitted.`,id);continue;}
  if((f.params.modelNote||f.params.modelDrawingReference)&&f.params.referenceStatus!=='resolved')add('stale-annotation','error',`${o.name}: annotation reference needs rebind.`,id);
  if(f.type==='drawing'&&f.params.workPlane===b.workPlane&&['point','infinite-line','ray'].includes(String(f.params.kind)))add('unsupported-geometry','error',`${o.name}: convert ${f.params.kind} to finite output geometry.`,id);
 }
 try{const items=collect(boardId);page.scene={board:{id:b.id,name:b.name,origin:[...b.origin],size:[...b.size],workPlane:b.workPlane,background:b.background},items};
  if(!items.length)add('empty-sheet','warning','This page contains no visible artwork.');
  const texts=items.filter((i):i is Extract<SvgExportItem,{type:'text'}>=>i.type==='text');
  const checked=new Set<string>();for(const item of texts){const t=item.text,clip=item.clip??b,lo=clip.origin,hi=[lo[0]+clip.size[0],lo[1]+clip.size[1]],outside=(q:number[])=>q[0]<Math.max(b.origin[0],lo[0])-1e-6||q[1]<Math.max(b.origin[1],lo[1])-1e-6||q[0]>Math.min(b.origin[0]+b.size[0],hi[0])+1e-6||q[1]>Math.min(b.origin[1]+b.size[1],hi[1])+1e-6;
   if(textEnvelope(t).some(outside)&&!checked.has(t.objectId??t.text)){checked.add(t.objectId??t.text);add('text-crop','warning',`Possible clipped annotation: “${t.text.slice(0,60)}”. Conservative font envelope; inspect the page preview.`,t.objectId);}
  }
  if(texts.length)add('font-policy','info',format==='pdf'?'PDF rasterizes text using the current browser fonts.':'System-ui text is not font-embedded; font substitution can change glyphs and width.');
  if(format!=='dxf'&&items.some(i=>i.type==='polyline'&&['circle','arc'].includes(String(features.get(i.polyline.objectId??'')?.params.kind))))add('legacy-curve-approximation','warning','Circle/arc artwork in this SVG/PDF path uses display polylines without a certified paper error bound. Inspect the preview; exact editable curves remain in DXF.');
  if(format!=='dxf'&&items.some(i=>i.type==='polyline'&&i.polyline.spline))add('spline-approximation','warning','SVG/PDF samples spline geometry at its declared paper chord tolerance (normally 0.02 mm); exact editable SPLINE remains in DXF.');
  if(format==='dxf'&&(b.frame||b.frameSheet))add('frame-flattening','warning','Frame DXF flattens presentation curves/fills into sampled linework and text; associations and fill semantics remain in WebCAD.');
  if(format==='dxf'&&items.some(i=>i.type==='image'))add('dxf-image','error','This DXF path does not embed raster image assets. Use SVG/PDF or remove the image from this output.');
  if(format==='pdf')add('raster-pdf','info','PDF pages are rasterized at the selected DPI; dimensions remain paper mm.');
 }catch(e){add('scene-error','error',e instanceof Error?e.message:String(e));}
 return page;
}
export function outputBoardDxf(boardId:string){const b=cadDocument.artboards?.[boardId];if(!b)throw Error('Missing output artboard.');const sheet=Object.values(cadDocument.modelPresentation?.sheets??{}).find(s=>s.artboardId===boardId);if(sheet)return modelSheetDxf(sheet.id);const items=collectArtboardExportItems(boardId);if(b.frame||b.frameSheet)return {text:encodeFrameDxf(b,items),warnings:['Flattened frame presentation'],skipped:0};return encodeDxf(cadDocument,modelSheetOwnedIds(cadDocument,boardId)??cadDocument.rootObjects,{paperBounds:[b.origin[0],b.origin[1],b.origin[0]+b.size[0],b.origin[1]+b.size[1]]});}
export function preflightOutput(boardIds:string[],format:OutputFormat):OutputPage[]{return boardIds.map(id=>{const page=checkOutputPage(cadDocument,id,format,collectArtboardExportItems);if(format==='dxf'&&page.scene&&!page.issues.some(i=>i.severity==='error'))try{const out=outputBoardDxf(id);if(out.skipped)page.issues.push({code:'dxf-skipped',severity:'error',message:`DXF skipped ${out.skipped} entities.`,boardId:id});for(const warning of out.warnings)page.issues.push({code:'dxf-policy',severity:'info',message:warning,boardId:id});}catch(e){page.issues.push({code:'dxf-error',severity:'error',message:e instanceof Error?e.message:String(e),boardId:id});}return page;});}
