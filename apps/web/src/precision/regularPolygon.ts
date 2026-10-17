import {linearToleranceAt} from "@agent-webcad/cad-document";

export const MAX_POLYGON_SIDES=128;
export type PolygonRadiusMode="inscribed"|"circumscribed";

/** Inscribed: first vertex direction. Circumscribed: first edge outward normal.
 * Returns ordinary CCW vertices without a repeated closing vertex. */
export function regularPolygon(center:[number,number],sides:number,radius:number,radiusMode:PolygonRadiusMode,rotation:number){
  if(!Number.isInteger(sides)||sides<3||sides>MAX_POLYGON_SIDES)return {ok:false as const,reason:`Side count must be an integer from 3 to ${MAX_POLYGON_SIDES}.`};
  if(![...center,radius,rotation].every(Number.isFinite)||radius<=linearToleranceAt(...center))return {ok:false as const,reason:"Enter a finite centre, angle and positive radius above drawing tolerance."};
  if(radiusMode!=="inscribed"&&radiusMode!=="circumscribed")return {ok:false as const,reason:"Choose inscribed or circumscribed radius."};
  const half=Math.PI/sides,R=radiusMode==="inscribed"?radius:radius/Math.cos(half);
  const start=(rotation%360)*Math.PI/180-(radiusMode==="circumscribed"?half:0);
  const points=Array.from({length:sides},(_,i):[number,number]=>[center[0]+R*Math.cos(start+2*i*half),center[1]+R*Math.sin(start+2*i*half)]);
  if(points.some((p,i)=>!p.every(Number.isFinite)||Math.hypot(p[0]-points[(i+1)%sides][0],p[1]-points[(i+1)%sides][1])<=linearToleranceAt(...p,...points[(i+1)%sides])))return {ok:false as const,reason:"Polygon edges collapse at the current coordinate precision."};
  const perimeter=2*sides*R*Math.sin(half),area=sides*R*R*Math.sin(2*half)/2;
  if(!Number.isFinite(area)||!Number.isFinite(perimeter))return {ok:false as const,reason:"Polygon measurements exceed numeric limits."};
  return {ok:true as const,points,perimeter,area};
}
