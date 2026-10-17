import type {SketchGeometry} from "./Sketch";
/** Analytic circular identity is the owner plus a stable edge ID, never an index. */
export function sketchCircularGeometry(g:SketchGeometry|undefined,segmentId?:string):Extract<SketchGeometry,{kind:"circle"|"arc"}>|null {
  if(!g)return null;
  if(g.kind==="circle"||g.kind==="arc")return segmentId===undefined?g:null;
  if(g.kind!=="polyline"||segmentId===undefined)return null;
  const i=g.segmentIds.indexOf(segmentId),bulge=g.bulges?.[i];
  if(i<0||!bulge||!Number.isFinite(bulge))return null;
  const a=g.vertices[i],b=g.vertices[(i+1)%g.vertices.length],dx=b.point[0]-a.point[0],dy=b.point[1]-a.point[1],chord=Math.hypot(dx,dy);
  if(chord<=1e-6)return null;
  const offset=(1-bulge*bulge)/(4*bulge),center:[number,number]=[(a.point[0]+b.point[0])/2-dy*offset,(a.point[1]+b.point[1])/2+dx*offset],radius=chord*(1+bulge*bulge)/(4*Math.abs(bulge)),startAngle=Math.atan2(a.point[1]-center[1],a.point[0]-center[0]);
  if(![...center,radius,startAngle].every(Number.isFinite))return null;
  return {id:g.id,kind:"arc",centerId:`${segmentId}:center`,curveId:segmentId,startId:a.id,endId:b.id,center,radius,startAngle,endAngle:startAngle+4*Math.atan(bulge)};
}
