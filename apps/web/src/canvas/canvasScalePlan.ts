import {canvasLockReason,canvasTarget,type CadDocument,type CadCanvas,validDrawingFrame} from "@agent-webcad/cad-document";
import type {CadCommand} from "@agent-webcad/cad-commands";
import {getObjectTransform} from "../precision/objectTransform";
import {WORK_PLANES,planeToWorld,worldToPlane} from "../precision/workPlane";

export type CanvasScaleReport={canvasId:string;factor:number;keepPaperStyles:boolean;includeImages:boolean;previews?:{name:string;svg:string}[];items:{name:string;kind:string;before:number[];after:number[]}[];skipped:string[];commands:Exclude<CadCommand,{type:"batch"}>[]};
/** Uniform presentation scaling around the root's work-plane origin. Never edits CAD source geometry. */
export function planCanvasScale(d:CadDocument,id:string,factor:number,keepPaperStyles=false,includeImages=true):CanvasScaleReport{
 const candidate=d.canvases&&Object.hasOwn(d.canvases,id)?d.canvases[id]:undefined;if(!candidate)throw Error("Canvas no longer exists.");const root:CadCanvas=candidate;
 if(!Number.isFinite(factor)||factor<.001||factor>1000||factor===1)throw Error("Choose a uniform scale from 0.001 to 1000, different from 1. Non-uniform scale is unsupported for curves and constraints.");
 const report:CanvasScaleReport={canvasId:id,factor,keepPaperStyles,includeImages,items:[],skipped:[],commands:[]},seen=new Set<string>();
 const point=(p:[number,number]):[number,number]=>p.map((v,i)=>root.origin[i]+(v-root.origin[i])*factor) as [number,number];
 const length=(v:number)=>v*factor;
 const layout=(c:CadCanvas):CadCanvas=>({...c,origin:point(c.origin),size:c.size.map(length) as [number,number],...(c.layout?{layout:{...c.layout,gap:length(c.layout.gap),padding:length(c.layout.padding),width:axis(c.layout.width),height:axis(c.layout.height)}}:{}),members:c.members.map(m=>({...m,...m.layout?{layout:{...m.layout,...m.layout.width?{width:axis(m.layout.width)}:{},...m.layout.height?{height:axis(m.layout.height)}:{},...m.layout.offset?{offset:m.layout.offset.map(length) as [number,number]}:{}}}:{}}))});
 function axis(a:import("@agent-webcad/cad-document").FlexAxis){return {...a,...a.value!==undefined?{value:length(a.value)}:{},...a.min!==undefined?{min:length(a.min)}:{},...a.max!==undefined?{max:length(a.max)}:{}};}
 function visit(c:CadCanvas,save=true){
  const locked=canvasLockReason(d,c.id);if(locked)throw Error(locked);
  if(c.units!==root.units||c.workPlane!==root.workPlane)throw Error(`${c.name}: scale requires matching units and plane.`);
  for(const m of c.members){const t=canvasTarget(d,m);if(!t)throw Error("Canvas member no longer exists.");
   if(m.relation==="reference"){report.skipped.push(`${t.name} · shared reference stays unchanged`);continue;}
   const key=`${m.kind}:${m.id}`;if(seen.has(key))throw Error("Scale encountered duplicate ownership.");seen.add(key);
   if(m.kind==="canvas"){visit(d.canvases![m.id]);continue;}
   if(m.kind==="artboard"){
    const b=d.artboards![m.id];if(!b.frame)throw Error(`${b.name}: use a drawing frame to scale presentation content.`);
    if(b.workPlane!==root.workPlane||root.units!=="paper-mm")throw Error("Drawing frames require a matching paper canvas.");
    if(!b.visible||b.locked||b.frame.stitch||b.frameSheet||Object.values(d.frameLinks??{}).some(l=>l.fromId===b.id||l.toId===b.id)||Object.values(d.artboards??{}).some(a=>a.frame?.stitch?.parts.some(p=>p.frameId===b.id)||a.frameSheet?.placements.some(p=>p.frameId===b.id)))throw Error(`${b.name}: unlock/show the frame and release connected, stitched or sheet placements before scaling.`);
    const frame={...b.frame,denominator:b.frame.denominator/factor,paperStrokeScale:(b.frame.paperStrokeScale??1)*(keepPaperStyles?1:factor),paperTextScale:(b.frame.paperTextScale??1)*(keepPaperStyles?1/factor:1)};
    if(!validDrawingFrame(frame))throw Error(`${b.name}: resulting presentation scale exceeds the supported range.`);
    const origin=point(b.origin),size=b.size.map(length) as [number,number];
    report.commands.push({type:"update-artboard",artboardId:b.id,origin,size,frame});report.items.push({name:b.name,kind:"frame · width/height mm, denominator N · source dimensions preserved",before:[...b.size,b.frame.denominator],after:[...size,frame.denominator]});
   }else if(m.kind==="workspace-section"){
    const section=d.workspaceSections![m.id];if(root.units!=="paper-mm"||section.workPlane!==root.workPlane)throw Error("Work area requires matching paper units and plane.");
    const origin=point(section.origin);if(factor!==1)report.commands.push({type:"upsert-workspace-section",section:{...section,origin,size:section.size.map(length) as [number,number]}});
    visit({...c,members:section.frameIds.map(id=>({kind:"artboard",id,relation:"own"}))},false);
   }else if(m.kind==="object"){
    const o=d.objects[m.id],f=Object.values(d.features).find(f=>f.output===m.id);
    if(f?.type!=="image")throw Error(`${t.name}: original CAD geometry and constraints are not resized. Place it in an owned drawing frame to scale its presentation.`);
    if(!includeImages){report.skipped.push(`${t.name} · image excluded`);continue;}
    const layer=d.layers[o.layerId];if(!o.visible||!layer?.visible||layer.locked)throw Error(`${t.name}: show and unlock the image and its layer.`);
    if(t.units!==root.units||t.workPlane!==root.workPlane)throw Error(`${t.name}: image requires matching model units and plane.`);
    const transform=getObjectTransform(o,f),plane=WORK_PLANES[root.workPlane],p=worldToPlane(transform.translation,plane),q=point(p),delta=planeToWorld([q[0]-p[0],q[1]-p[1]],plane);
    const scale=transform.scale.map(length) as [number,number,number],translation=transform.translation.map((n,i)=>n+delta[i]) as [number,number,number];
    if(translation.some(n=>!Number.isFinite(n)||Math.abs(n)>1e7)||scale.some(n=>!Number.isFinite(n)||Math.abs(n)>1e6))throw Error("Resulting image transform exceeds the supported range.");
    if(scale.some((n,i)=>n!==transform.scale[i]))report.commands.push({type:"scale-object",objectId:o.id,scale});
    if(translation.some((n,i)=>n!==transform.translation[i]))report.commands.push({type:"move-object",objectId:o.id,translation});
    report.items.push({name:t.name,kind:"image · XYZ scale · original bitmap retained",before:transform.scale,after:scale});
   }else throw Error(`${t.name}: scale through its owning work area, sheet or view tool, or own individual drawing frames here.`);
  }
  if(!save)return;
  const next=layout(c);if(next.size.some(n=>n<=0||n>1e7)||next.origin.some(n=>Math.abs(n)>1e7))throw Error("Resulting canvas bounds exceed the supported range.");
  report.commands.push({type:"upsert-canvas",canvas:next});report.items.push({name:c.name,kind:"canvas · width/height mm",before:c.size,after:next.size});
 }
 visit(root);return report;
}
