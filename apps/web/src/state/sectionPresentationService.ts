import type {CadDocument,ModelSection,SectionDecoration} from "@agent-webcad/cad-document";
import {projectSolids} from "../cad/kernelGeometryService";
import {getObjectTransform} from "../precision/objectTransform";
import {WORK_PLANES} from "../precision/workPlane";
import {modelPlaneNormal,sectionDrawingGeometry,type SectionDrawing} from "../precision/modelSection";
import {ellipsePoint,ellipseExtrema} from "../precision/ellipseGeometry";
import {validEllipse} from "@agent-webcad/cad-document";
import {sectionHatch} from "../precision/sectionHatch";
import {createDrawingTopology} from "../precision/drawingTopology";
type Decoration={key:string;kind:SectionDecoration["kind"];role:SectionDecoration["role"];params:Record<string,unknown>};
const geometryKey=(g:SectionDrawing)=>JSON.stringify(g.kind==="spline"?g.params:g.kind==="ellipse"||g.kind==="elliptic-arc"?{kind:g.kind,center:(g.params.center as number[]).map(x=>Math.round(x*1e7)),tensor:[0,1].flatMap(i=>[0,1].map(j=>Math.round(((g.params.axisU as number[])[i]*(g.params.axisU as number[])[j]+(g.params.axisV as number[])[i]*(g.params.axisV as number[])[j])*1e7))),...g.kind==="elliptic-arc"?{points:[0,.5,1].map(t=>ellipsePoint(g.params as any,Number(g.params.startParam)+t*Number(g.params.sweep)).map(x=>Math.round(x*1e7)))}:{}}:g.kind==="line"?{kind:g.kind,points:(g.params.points as number[][]).map(p=>p.map(v=>Math.round(v*1e7))).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))}:{kind:g.kind,center:g.params.center,radius:g.params.radius,start:g.params.startAngle,end:g.params.endAngle});

async function decorations(d:CadDocument,v:ModelSection,cuts:SectionDrawing[],before?:CadDocument):Promise<{drawings:Decoration[];warnings:string[]}>{
 const style=v.presentation,drawings:Decoration[]=[],warnings:string[]=[];if(!style)return {drawings,warnings};
 const features=new Map(Object.values(d.features).map(f=>[f.output,f]));
 if(style.background){
  const old=before?.modelPresentation?.sections?.[v.id],prior=new Map(Object.values(before?.features??{}).map(f=>[f.output,f]));
  const unchanged=old?.status==="resolved"&&old.presentation?.background&&JSON.stringify([old.basis,old.height,old.range,old.partIds,old.presentation.keep,old.presentation.depth])===JSON.stringify([v.basis,v.height,v.range,v.partIds,style.keep,style.depth])&&v.partIds.every(id=>{const p=d.modelPresentation!.parts[id],q=before!.modelPresentation!.parts[id],o=d.objects[p?.objectId],a=before!.objects[q?.objectId],f=features.get(o?.id),g=prior.get(a?.id);return p&&q&&p.objectId===q.objectId&&o&&a&&f&&g&&JSON.stringify([f.type,f.params,getObjectTransform(o,f)])===JSON.stringify([g.type,g.params,getObjectTransform(a,g)]);});
  const bg:SectionDrawing[]=[];
  if(unchanged){for(const [key,e] of Object.entries(old!.decorations??{}))if(e.role==="background"){const f=prior.get(e.objectId);if(!f)throw Error("Missing architectural background output.");const params={...f.params},map=(p:number[])=>[v.origin[0]+(p[0]-old!.origin[0])/old!.scale*v.scale,v.origin[1]+(p[1]-old!.origin[1])/old!.scale*v.scale,0];if(Array.isArray(params.controlPoints))params.controlPoints=(params.controlPoints as number[][]).map(map);if(Array.isArray(params.points))params.points=(params.points as number[][]).map(map);if(Array.isArray(params.center))params.center=map(params.center as number[]);if(typeof params.radius==="number")params.radius=params.radius/old!.scale*v.scale;for(const axis of ["axisU","axisV"])if(Array.isArray(params[axis]))params[axis]=(params[axis] as number[]).map(x=>x/old!.scale*v.scale);bg.push({kind:e.kind as SectionDrawing["kind"],sourceKey:key,partId:String(f.params.sourcePartId),params});}}
  else{
   const operands=v.partIds.map(id=>{const p=d.modelPresentation!.parts[id],o=p&&d.objects[p.objectId],f=o&&features.get(o.id);if(!f||!o)throw Error(`Missing background source: ${id}.`);return {params:f.params,transform:getObjectTransform(o,f)};}),plane=WORK_PLANES[v.basis];
   const projected=await projectSolids(operands,plane.normal,plane.xAxis,{normal:modelPlaneNormal(v.basis),height:v.height,keep:style.keep,depth:style.depth});
   for(const [index,partId] of v.partIds.entries())for(const g of sectionDrawingGeometry({...v,basis:"XY",outputs:{}},partId,projected.filter(c=>c.sourceIndex===index&&!c.hidden).map(c=>c.curve)))bg.push({...g,sourceKey:`background:${g.sourceKey}`});
  }
  const seen=new Set(cuts.map(geometryKey));for(const g of bg){const key=geometryKey(g);if(seen.has(key))continue;seen.add(key);drawings.push({key:g.sourceKey,kind:g.kind,role:"background",params:{...g.params,sourcePartId:g.partId,sectionLineWeight:style.backgroundWeight}});}
 }
 if(style.hatch){const h=sectionHatch(cuts,v.origin,style.spacing,style.angle);warnings.push(...h.warnings);for(const line of h.lines)drawings.push({key:line.key,role:"hatch",kind:"line",params:{workPlane:"XY",points:line.points,sourcePartId:line.partId,sectionLineWeight:style.hatchWeight}});}
 if(style.label){const all=[...cuts.map(c=>c.params),...drawings.filter(g=>g.role==="background").map(g=>g.params)],pts=all.flatMap(p=>Array.isArray(p.controlPoints)?p.controlPoints as number[][]:validEllipse(p)?ellipseExtrema(p):Array.isArray(p.points)?p.points as number[][]:Array.isArray(p.center)?[[Number((p.center as number[])[0])-Number(p.radius??0),Number((p.center as number[])[1])-Number(p.radius??0)]]:[]),x=Math.min(...pts.map(p=>p[0])),y=Math.min(...pts.map(p=>p[1]));drawings.push({key:"label",kind:"text",role:"label",params:{workPlane:"XY",point:[Number.isFinite(x)?x:v.origin[0],(Number.isFinite(y)?y:v.origin[1])-7,0],text:`${v.name} · 1:${Number((1/v.scale).toFixed(4))}`,height:2.5}});}
 return {drawings,warnings};
}
/** Owned auxiliary outputs are regenerated separately from stable cut references. */
export async function syncSectionPresentation(d:CadDocument,v:ModelSection,cuts:SectionDrawing[],before?:CadDocument){
 const {drawings,warnings}=await decorations(d,v,cuts,before),old=v.decorations??{},next:Record<string,SectionDecoration>={},features=new Map(Object.values(d.features).map(f=>[f.output,f]));
 const editable=(id:string)=>{if(!d.objects[id]||d.layers[d.objects[id].layerId]?.locked)throw Error("Architectural section output is missing or locked.");};
 for(const g of drawings){const entry=old[g.key],id=entry?.objectId??`section-display-${crypto.randomUUID()}`,existing=features.get(id),params={...g.params,kind:g.kind,modelSectionPresentation:v.id,presentationKey:g.key,sectionRole:g.role,projectionStatus:"resolved",...g.kind!=="text"?{topology:existing?.params.topology??createDrawingTopology(g.kind,g.params,crypto.randomUUID())}:{}};
  if(entry){editable(id);if(!existing||entry.kind!==g.kind)throw Error("Architectural output mapping changed.");existing.params=params;d.objects[id].name=`${v.name} · ${d.modelPresentation?.parts[String(g.params.sourcePartId)]?.name??g.role} · ${g.role}`.slice(0,200);d.objects[id].visible=true;}
  else{const featureId=`feature-${id}`;d.objects[id]={id,geometryId:`geometry-${id}`,name:`${v.name} · ${d.modelPresentation?.parts[String(g.params.sourcePartId)]?.name??g.role} · ${g.role}`.slice(0,200),layerId:v.layerId,visible:true,transform:{translation:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}};d.features[featureId]={id:featureId,type:g.kind==="text"?"drafting":"drawing",output:id,inputs:[],params};d.rootObjects.push(id);d.layers[v.layerId].objectIds.push(id);}
  next[g.key]={objectId:id,kind:g.kind,role:g.role};
 }
 const retired=new Set<string>();
 for(const [key,e] of Object.entries(old))if(!next[key]){editable(e.objectId);const f=features.get(e.objectId);if(f)delete d.features[f.id];delete d.objects[e.objectId];retired.add(e.objectId);}
 if(retired.size){d.rootObjects=d.rootObjects.filter(id=>!retired.has(id));for(const layer of Object.values(d.layers))layer.objectIds=layer.objectIds.filter(id=>!retired.has(id));}
 if(v.presentation){v.decorations=next;v.presentationWarnings=warnings;}else{delete v.decorations;delete v.presentationWarnings;}
}
export function hideSectionPresentation(d:CadDocument,v:ModelSection){const features=new Map(Object.values(d.features).map(f=>[f.output,f]));for(const e of Object.values(v.decorations??{})){const o=d.objects[e.objectId],f=features.get(e.objectId);if(o&&f){if(d.layers[o.layerId]?.locked)throw Error("Architectural section output is locked.");o.visible=false;f.params.projectionStatus="unresolved";}}}
