import type {CadDocument,CadModelProjection,ModelSection} from "@agent-webcad/cad-document";
import {projectSolids} from "../cad/kernelGeometryService";
import {getObjectTransform} from "../precision/objectTransform";
import {WORK_PLANES} from "../precision/workPlane";
import {sectionDrawingGeometry} from "../precision/modelSection";
import {projectModelPart} from "../precision/modelPresentation";

export async function projectionDrawings(d:CadDocument,v:CadModelProjection,before?:CadDocument){
 const prior=before?.modelPresentation?.projections[v.id];
 if(prior?.status==="resolved"&&prior.method===v.method&&prior.direction===v.direction&&(prior.hiddenLines===v.hiddenLines||v.hiddenLines==="omit")&&prior.basis===v.basis&&JSON.stringify(prior.partIds)===JSON.stringify(v.partIds)&&JSON.stringify(prior.outputs)===JSON.stringify(v.outputs)){
  const features=new Map(Object.values(d.features).map(f=>[f.output,f])),oldFeatures=new Map(Object.values(before!.features).map(f=>[f.output,f]));
  const unchanged=v.partIds.every(id=>{const part=d.modelPresentation?.parts[id],old=before!.modelPresentation?.parts[id],o=part&&d.objects[part.objectId],a=old&&before!.objects[old.objectId],f=o&&features.get(o.id),g=a&&oldFeatures.get(a.id);return o&&a&&f&&g&&part!.objectId===old!.objectId&&JSON.stringify([f.type,f.params,getObjectTransform(o,f)])===JSON.stringify([g.type,g.params,getObjectTransform(a,g)]);});
  if(unchanged&&Object.values(prior.outputs).every(e=>oldFeatures.has(e.objectId)&&features.has(e.objectId))){
   const map=(p:number[])=>[v.origin[0]+(p[0]-prior.origin[0])/prior.scale*v.scale,v.origin[1]+(p[1]-prior.origin[1])/prior.scale*v.scale,0];
   return Object.entries(prior.outputs).filter(([,e])=>v.hiddenLines!=="omit"||oldFeatures.get(e.objectId)!.params.projectionVisibility!=="hidden").map(([slot,e])=>{const params={...oldFeatures.get(e.objectId)!.params};if(Array.isArray(params.controlPoints))params.controlPoints=(params.controlPoints as number[][]).map(map);if(Array.isArray(params.points))params.points=(params.points as number[][]).map(map);if(Array.isArray(params.center))params.center=map(params.center as number[]);if(typeof params.radius==="number")params.radius=params.radius/prior.scale*v.scale;for(const axis of ["axisU","axisV"])if(Array.isArray(params[axis]))params[axis]=(params[axis] as number[]).map(x=>x/prior.scale*v.scale);return {slot,partId:e.partId??slot,kind:e.kind,sourceEdges:[...e.sourceEdges],params};});
  }
 }
 if(v.method!=="brep-hlr")return v.partIds.map(partId=>({slot:partId,partId,...projectModelPart(d,v,partId)}));
 const features=new Map(Object.values(d.features).map(f=>[f.output,f]));
 if(features.size!==Object.keys(d.features).length)throw Error("Ambiguous solid feature outputs.");
 const operands=v.partIds.map(id=>{const part=d.modelPresentation?.parts[id],o=part&&d.objects[part.objectId],f=o&&features.get(o.id);if(!o||!f)throw Error(`Missing projection source: ${id}. Rebind the stable part.`);return {params:f.params,transform:getObjectTransform(o,f)};});
 const plane=WORK_PLANES[v.basis],sign=v.direction==="opposite"?-1:1,curves=await projectSolids(operands,plane.normal.map(x=>x*sign) as typeof plane.normal,plane.xAxis.map(x=>x*sign) as typeof plane.xAxis);
 const curveKey=(c:typeof curves[number]["curve"])=>JSON.stringify(c.kind==="spline"||c.kind==="ellipse"?c:c.kind==="line"?{kind:c.kind,points:c.points.map(p=>p.map(v=>Math.round(v*1e6))).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))}:{...c,points:c.kind==="circle"?undefined:c.points,center:c.center.map(v=>Math.round(v*1e6)),radius:Math.round(c.radius*1e6)});
 const visible=new Set(curves.filter(c=>!c.hidden).map(c=>curveKey(c.curve)));
 const result:{slot:string;partId:string;kind:"spline"|"line"|"circle"|"arc"|"ellipse"|"elliptic-arc";params:Record<string,unknown>;sourceEdges:string[]}[]=[];
 for(const [i,partId] of v.partIds.entries())for(const hidden of [false,true]){
  if(hidden&&v.hiddenLines==="omit")continue;
  const classified=curves.filter(c=>c.sourceIndex===i&&c.hidden===hidden&&(!hidden||!visible.has(curveKey(c.curve))));
  const group=classified.map(c=>c.curve);
  const view:ModelSection={...v,basis:"XY",height:0,outputs:{}};
  const classes=new Map<string,string>();for(const c of classified)for(const g of sectionDrawingGeometry(view,partId,[c.curve])){const key=JSON.stringify([g.kind,g.params]);if(c.edgeClass==="outline"||!classes.has(key))classes.set(key,c.edgeClass);}
  for(const g of sectionDrawingGeometry(view,partId,group)){const slot=`${hidden?"hidden":"visible"}:${g.sourceKey}`;
   result.push({slot,partId,kind:g.kind,sourceEdges:[slot],params:{...g.params,projectionVisibility:hidden?"hidden":"visible",projectionEdgePolicy:"sharp-outline",projectionEdgeClass:classes.get(JSON.stringify([g.kind,g.params]))??"sharp"}});
  }
 }
 if(!result.length)throw Error("No analytic projection edges were produced.");return result;
}
