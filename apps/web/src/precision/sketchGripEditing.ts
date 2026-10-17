import type { SketchGeometry, SketchPoint } from "@agent-webcad/cad-document";
import { resizeRectangleCorner, resizeRectangleEdge } from "./sketchEditing";

/** Requested grip shape, before constraints are solved. Also used by the command handler. */
export function editSketchPointGeometry(geometry:SketchGeometry,pointId:string,position:SketchPoint):SketchGeometry|null {
  if(geometry.kind==="line"){
    if(pointId===geometry.startId)return {...geometry,start:position};
    if(pointId===geometry.endId)return {...geometry,end:position};
  }
  if(geometry.kind==="polyline"&&geometry.vertices.some(v=>v.id===pointId))return {...geometry,vertices:geometry.vertices.map(v=>v.id===pointId?{...v,point:position}:v)};
  if(geometry.kind==="circle"&&pointId===geometry.centerId)return {...geometry,center:position};
  if(geometry.kind==="circle"&&pointId===`${geometry.id}:radius:0`)return {...geometry,radius:Math.hypot(position[0]-geometry.center[0],position[1]-geometry.center[1])};
  if(geometry.kind==="arc"){
    if(pointId===geometry.centerId)return {...geometry,center:position};
    if(pointId===geometry.startId||pointId===geometry.endId){
      const radius=Math.hypot(position[0]-geometry.center[0],position[1]-geometry.center[1]);
      const angle=Math.atan2(position[1]-geometry.center[1],position[0]-geometry.center[0]);
      const direction=Math.sign(geometry.endAngle-geometry.startAngle),tau=2*Math.PI;
      const wrap=(a:number)=>((a%tau)+tau)%tau;
      // atan2 wraps at ±π; preserve the directed arc instead of flipping its branch.
      const start=pointId===geometry.startId;
      const sweep=wrap(direction*(start?geometry.endAngle-angle:angle-geometry.startAngle));
      if(radius<=1e-6||sweep<=1e-9||sweep>=tau-1e-9)return null;
      return {...geometry,radius,[start?"startAngle":"endAngle"]:start?geometry.endAngle-direction*sweep:geometry.startAngle+direction*sweep};
    }
  }
  if(geometry.kind==="rectangle")return resizeRectangleCorner(geometry,pointId,position);
  return null;
}

export function editSketchSegmentGeometry(geometry:SketchGeometry,segmentId:string,delta:SketchPoint):SketchGeometry|null {
  const translate=(p:SketchPoint):SketchPoint=>[p[0]+delta[0],p[1]+delta[1]];
  if(geometry.kind==="line"&&geometry.segmentId===segmentId)return {...geometry,start:translate(geometry.start),end:translate(geometry.end)};
  if(geometry.kind==="polyline"){
    const index=geometry.segmentIds.indexOf(segmentId);if(index<0)return null;
    return {...geometry,vertices:geometry.vertices.map((v,i)=>i===index||i===(index+1)%geometry.vertices.length?{...v,point:translate(v.point)}:v)};
  }
  if(geometry.kind==="rectangle")return resizeRectangleEdge(geometry,segmentId,delta);
  return null;
}
