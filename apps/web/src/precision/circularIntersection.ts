import {linearToleranceAt,CAD_PRECISION} from "@agent-webcad/cad-document";

type Vec2=[number,number];
export type CircularBranch={branch:"negative"|"positive";point:Vec2};
export type CircularIntersectionStatus="two-points"|"tangent"|"separated"|"contained"|"concentric"|"coincident";
/** Positive is left of the ordered first-centre → second-centre axis.
 * Normalized Heron factors avoid large squared coordinates and tangency cancellation. */
export function circularIntersections(first:Vec2,r1:number,second:Vec2,r2:number):{status:CircularIntersectionStatus;branches:CircularBranch[]}{
  if(![...first,...second,r1,r2].every(Number.isFinite)||r1<=0||r2<=0)throw Error("Circular intersections require finite centres and positive radii.");
  const dx=second[0]-first[0],dy=second[1]-first[1],d=Math.hypot(dx,dy),tolerance=linearToleranceAt(...first,...second,r1,r2);
  if(!Number.isFinite(d))throw Error("Circular centre distance exceeds numeric limits.");
  if(d<=tolerance)return {status:Math.abs(r1-r2)<=tolerance?"coincident":"concentric",branches:[]};
  const scale=Math.max(d,r1,r2),D=d/scale,R1=r1/scale,R2=r2/scale,T=tolerance/scale;
  const outer=D-R1-R2,inner=D-Math.abs(R1-R2);
  if(outer>T)return {status:"separated",branches:[]};
  if(inner< -T)return {status:"contained",branches:[]};
  const tangent=Math.abs(outer)<=T||Math.abs(inner)<=T;
  const along=(D*D+(R1-R2)*(R1+R2))/(2*D)*scale;
  const height=tangent?0:Math.sqrt(Math.max(0,(D+R1+R2)*(-D+R1+R2)*(D-R1+R2)*(D+R1-R2)))/(2*D)*scale;
  const ux=dx/d,uy=dy/d;
  const branches=(['negative','positive'] as const).map(branch=>{
    const signed=branch==="positive"?height:-height;
    return {branch,point:[first[0]+along*ux-signed*uy,first[1]+along*uy+signed*ux] as Vec2};
  });
  if(branches.some(b=>!b.point.every(Number.isFinite)))throw Error("Circular intersection coordinates exceed numeric limits.");
  return {status:tangent?"tangent":"two-points",branches};
}

/** Closed endpoints, signed CW/CCW sweep and wrapped start angles. */
export function pointOnCircularDomain(point:Vec2,center:Vec2,radius:number,startAngle?:number,endAngle?:number){
  if(startAngle===undefined&&endAngle===undefined)return true;
  if(startAngle===undefined||endAngle===undefined||![startAngle,endAngle].every(Number.isFinite))return false;
  const sweep=endAngle-startAngle,tolerance=Math.max(CAD_PRECISION.angularTolerance,linearToleranceAt(...point,...center,radius)/radius),tau=2*Math.PI;
  if(Math.abs(sweep)>=tau-tolerance)return true;
  const angle=Math.atan2(point[1]-center[1],point[0]-center[0]),delta=((Math.sign(sweep)*(angle-startAngle)%tau)+tau)%tau;
  return Math.abs(sweep)>CAD_PRECISION.angularTolerance&&(delta<=Math.abs(sweep)+tolerance||tau-delta<=tolerance);
}
