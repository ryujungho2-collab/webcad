import type { CadFeature,CadObject } from "@agent-webcad/cad-document";
import type { DrawingTopology } from "../../../precision/drawingTopology";
import { drawingWorldToModel,drawingPlaneOrientation } from "../../../precision/worldGeometry";
import { exactDrawingContour,segmentPoint,type ContourSegment } from "./contourEditing";
import { curveCornerSolutions,chooseCurveCorner,type ArcCornerSolution } from "./arcCorners";
import { isSimpleCurvedProfile } from "./curvedOffset";
import type { Vec3 } from "../../../precision/workPlane";

function context(object:CadObject,feature:CadFeature,controlId:string){
 const path=exactDrawingContour(object,feature),topology=feature.params.topology as DrawingTopology,index=topology?.controls.find(c=>c.id===controlId&&c.role==="vertex")?.index;
 if(!path.closed||index===undefined||!["polyline","rectangle"].includes(String(feature.params.kind)))throw new Error("Select a vertex on a closed standalone contour.");
 const previous=(index+path.segments.length-1)%path.segments.length,segments=[path.segments[previous],path.segments[index]],plane=path.workPlane;
 const temp=segments.map((s,i)=>({object:{id:`corner-${i}`,geometryId:`corner-${i}`,name:"Corner",visible:true,layerId:object.layerId} as CadObject,feature:{id:`corner-${i}`,output:`corner-${i}`,type:"drawing",inputs:[],params:s.kind==="arc"?{kind:"arc",workPlane:plane,center:s.center,radius:s.radius,startAngle:s.startAngle,endAngle:s.startAngle!+s.sweep!}:{kind:"line",workPlane:plane,points:[s.start,s.end]}} as CadFeature}));
 return {path,topology,index,previous,segments,plane,temp};
}
export function closedCornerSolutions(object:CadObject,feature:CadFeature,controlId:string,treatment:"fillet"|"chamfer",value:number,d2=value):ArcCornerSolution[]{
 const c=context(object,feature,controlId);
 if(!Number.isFinite(value)||value<=1e-9||!Number.isFinite(d2)||d2<=1e-9)throw new Error("Enter positive finite corner distances.");
 if(treatment==="fillet")return curveCornerSolutions(c.temp[0],c.temp[1],c.segments[0].start,c.segments[1].end,"fillet",value);
 const lengths=c.segments.map(s=>s.kind==="arc"?s.radius!*Math.abs(s.sweep!):Math.hypot(...s.end.map((n,i)=>n-s.start[i])));
 if(value>=lengths[0]-1e-6||d2>=lengths[1]-1e-6)throw new Error("Chamfer distances consume an adjacent segment. Reduce D1/D2.");
 const t=[1-value/lengths[0],d2/lengths[1]],contacts=t.map((v,i)=>segmentPoint(c.segments[i],v,c.plane));
 const replacements=c.temp.map((s,i)=>c.segments[i].kind==="arc"?{...s.feature.params,...(i===0?{endAngle:c.segments[i].startAngle!+c.segments[i].sweep!*t[i]}:{startAngle:c.segments[i].startAngle!+c.segments[i].sweep!*t[i]})}:{...s.feature.params,points:i===0?[c.segments[i].start,contacts[i]]:[contacts[i],c.segments[i].end]});
 return [{replacements,contacts,corner:c.segments[0].end,connector:{kind:"line",workPlane:c.plane,points:contacts}}];
}
export function editCurvedInternalCorner(object:CadObject,feature:CadFeature,controlId:string,treatment:"fillet"|"chamfer",value:number,d2?:number,solutionIndex?:number){
 const c=context(object,feature,controlId),selected=chooseCurveCorner(closedCornerSolutions(object,feature,controlId,treatment,value,d2),solutionIndex),orientation=drawingPlaneOrientation(object,feature);
 const points=structuredClone(feature.params.points as Vec3[]),contacts=selected.contacts.map(p=>drawingWorldToModel(object,feature,p)!);if(contacts.some(p=>!p||p.some(n=>!Number.isFinite(n))))throw new Error("Unable to invert corner frame.");
 points.splice(c.index,1,...contacts);
 const newId=`vertex-${crypto.randomUUID()}`,edgeId=`segment-${crypto.randomUUID()}`,controls=c.topology.controls.map(ctrl=>({...ctrl,index:ctrl.index!==undefined&&ctrl.index>c.index?ctrl.index+1:ctrl.index}));controls.push({id:newId,role:"vertex",index:c.index+1});controls.sort((a,b)=>a.index!-b.index!);
 const incoming=c.topology.segments.find(s=>s.endControlId===controlId)!,outgoing=c.topology.segments.find(s=>s.startControlId===controlId)!;
 const bulge=(params:Record<string,unknown>)=>params.kind==="arc"?Math.tan((Number(params.endAngle)-Number(params.startAngle))*orientation/4):0;
 const segments=controls.map((ctrl,index)=>{
  const end=controls[(index+1)%controls.length];let old=c.topology.segments.find(s=>s.startControlId===ctrl.id&&s.endControlId===end.id);
  if(end.id===controlId)old=incoming;if(ctrl.id===newId)old=outgoing;
  return {id:ctrl.id===controlId?edgeId:old!.id,startControlId:ctrl.id,endControlId:end.id,index,kind:ctrl.id===controlId?treatment==="fillet"?"arc" as const:"line" as const:old!.kind};
 });
 const oldBulges=feature.params.bulges as number[]|undefined,bulges=segments.map(s=>s.id===edgeId?bulge(selected.connector):s.id===incoming.id?bulge(selected.replacements[0]):s.id===outgoing.id?bulge(selected.replacements[1]):oldBulges?.[c.topology.segments.find(old=>old.id===s.id)!.index ?? 0]??0);
 const params={...structuredClone(feature.params),kind:"polyline",closed:true,points,bulges,topology:{version:1,controls,segments,curves:[...c.topology.curves,...(treatment==="fillet"?[{id:edgeId,kind:"arc" as const}]:[])]}};
 if(!isSimpleCurvedProfile("polyline",params))throw new Error("Corner creates a self-intersecting or degenerate closed contour. Reduce the radius/distances or choose another solution.");
 return params;
}
