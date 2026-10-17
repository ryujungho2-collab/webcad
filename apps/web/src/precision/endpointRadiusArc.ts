import {CAD_PRECISION,linearToleranceAt,type SketchPoint} from "@agent-webcad/cad-document";

export type ArcCentreSide="left"|"right";
export type ArcDirection="cw"|"ccw";
export type EndpointRadiusArc={center:SketchPoint;radius:number;startAngle:number;endAngle:number;diametric:boolean};
export type EndpointRadiusArcResult={ok:true;curve:EndpointRadiusArc}|{ok:false;reason:string};
/** Centre side is relative to the ordered start→end chord; direction independently selects the sweep. */
export function endpointRadiusArc(start:SketchPoint,end:SketchPoint,radius:number,side:ArcCentreSide,direction:ArcDirection):EndpointRadiusArcResult{
  const fail=(reason:string):EndpointRadiusArcResult=>({ok:false,reason});
  if(start.length!==2||end.length!==2||![...start,...end,radius].every(Number.isFinite)||radius<=0)return fail("Enter two finite endpoints and a positive radius.");
  if(!["left","right"].includes(side)||!["cw","ccw"].includes(direction))return fail("Choose a centre side and CW / CCW direction.");
  const dx=end[0]-start[0],dy=end[1]-start[1],length=Math.hypot(dx,dy),half=length/2,tolerance=linearToleranceAt(...start,...end,radius);
  if(!Number.isFinite(length)||length<=tolerance)return fail("Arc endpoints must be distinct beyond the modeling tolerance.");
  if(half-radius>tolerance)return fail("The endpoint distance exceeds twice the radius. Increase the radius or move an endpoint.");
  // Factored and normalized height avoids subtracting large squares at the diameter boundary.
  const diametric=Math.abs(half-radius)<=tolerance,ratio=Math.min(1,half/radius),height=diametric?0:radius*Math.sqrt((1-ratio)*(1+ratio)),sign=side==="left"?1:-1;
  const center:SketchPoint=[start[0]+dx/2-sign*height*dy/length,start[1]+dy/2+sign*height*dx/length];
  const startAngle=Math.atan2(start[1]-center[1],start[0]-center[0]),endAngle=Math.atan2(end[1]-center[1],end[0]-center[0]),tau=2*Math.PI;
  const ccw=((endAngle-startAngle)%tau+tau)%tau,sweep=direction==="ccw"?ccw:ccw-tau;
  if(![...center,startAngle,sweep].every(Number.isFinite)||Math.min(Math.abs(sweep),tau-Math.abs(sweep))<=CAD_PRECISION.angularTolerance)return fail("Arc endpoints are indistinguishable at the supported angular precision.");
  const errorTolerance=linearToleranceAt(...center,...start,...end,radius);
  if([start,end].some(p=>Math.abs(Math.hypot(p[0]-center[0],p[1]-center[1])-radius)>errorTolerance))return fail("The arc cannot retain its endpoints at the supported coordinate precision.");
  return {ok:true,curve:{center,radius,startAngle,endAngle:startAngle+sweep,diametric}};
}
