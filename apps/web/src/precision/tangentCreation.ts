import {CAD_PRECISION,linearToleranceAt,type SketchPoint} from "@agent-webcad/cad-document";
import type {EndpointRadiusArcResult} from "./endpointRadiusArc";

/** Oriented start tangent determines direction, including complementary major arcs. */
export function startTangentArc(start:SketchPoint,end:SketchPoint,angle:number):EndpointRadiusArcResult{
 const fail=(reason:string):EndpointRadiusArcResult=>({ok:false,reason});
 if(![...start,...end,angle].every(Number.isFinite))return fail("Enter finite endpoints and a tangent angle.");
 const dx=end[0]-start[0],dy=end[1]-start[1],length=Math.hypot(dx,dy),tol=linearToleranceAt(...start,...end);
 if(!Number.isFinite(length)||length<=tol)return fail("Arc endpoints must be distinct.");
 const tx=Math.cos(angle),ty=Math.sin(angle),projection=(-ty*dx+tx*dy)/length;
 if(Math.abs(projection)<=Math.max(CAD_PRECISION.angularTolerance,tol/length))return fail("The chord is parallel to the start tangent: no finite circular arc.");
 const k=length/(2*projection),radius=Math.abs(k),center:SketchPoint=[start[0]-k*ty,start[1]+k*tx];
 const a=Math.atan2(start[1]-center[1],start[0]-center[0]),b=Math.atan2(end[1]-center[1],end[0]-center[0]),tau=2*Math.PI,ccw=((b-a)%tau+tau)%tau,sweep=k>0?ccw:ccw-tau;
 if(![...center,radius,sweep].every(Number.isFinite)||Math.min(Math.abs(sweep),tau-Math.abs(sweep))<=CAD_PRECISION.angularTolerance)return fail("The arc exceeds supported angular precision.");
 const tolerance=linearToleranceAt(...center,...start,...end,radius);
 if([start,end].some(p=>Math.abs(Math.hypot(p[0]-center[0],p[1]-center[1])-radius)>tolerance)||Math.hypot(-Math.sin(a)*Math.sign(k)-tx,Math.cos(a)*Math.sign(k)-ty)>Math.max(CAD_PRECISION.angularTolerance,tolerance/radius))return fail("The arc cannot retain its endpoints and oriented tangent at this precision.");
 return {ok:true,curve:{center,radius,startAngle:a,endAngle:a+sweep,diametric:Math.abs(Math.abs(sweep)-Math.PI)<=CAD_PRECISION.angularTolerance}};
}
export type TangentCircleCandidate={branch:string;center:SketchPoint;contacts:[SketchPoint,SketchPoint];radius:number};
export function twoLineTangentCircles(lines:[[SketchPoint,SketchPoint],[SketchPoint,SketchPoint]],radius:number,extend=false):TangentCircleCandidate[]{
 if(![...lines.flat(2),radius].every(Number.isFinite)||radius<=0)throw Error("Enter finite lines and a positive radius.");
 const origin=lines[0][0],data=lines.map(([a,b])=>{const d=[b[0]-a[0],b[1]-a[1]],length=Math.hypot(...d);if(length<=linearToleranceAt(...a,...b))throw Error("Select two nondegenerate straight lines.");return {a:[a[0]-origin[0],a[1]-origin[1]],u:[d[0]/length,d[1]/length],n:[-d[1]/length,d[0]/length],length};});
 const [a,b]=data,det=a.n[0]*b.n[1]-a.n[1]*b.n[0];
 if(Math.abs(det)<=CAD_PRECISION.angularTolerance)throw Error("Parallel or coincident lines have no isolated centre candidates.");
 const result:TangentCircleCandidate[]=[];
 for(const first of [1,-1])for(const second of [1,-1]){
  const ra=a.n[0]*a.a[0]+a.n[1]*a.a[1]+first*radius,rb=b.n[0]*b.a[0]+b.n[1]*b.a[1]+second*radius,c=[(ra*b.n[1]-a.n[1]*rb)/det,(a.n[0]*rb-ra*b.n[0])/det],center:SketchPoint=[origin[0]+c[0],origin[1]+c[1]],tol=linearToleranceAt(...center,...lines.flat(2),radius);
  const contacts=data.map((line,i)=>[origin[0]+c[0]-(i?second:first)*radius*line.n[0],origin[1]+c[1]-(i?second:first)*radius*line.n[1]] as SketchPoint) as [SketchPoint,SketchPoint];
  if(![...center,...contacts.flat()].every(Number.isFinite))continue;
  if(!extend&&contacts.some((p,i)=>{const t=(p[0]-lines[i][0][0])*data[i].u[0]+(p[1]-lines[i][0][1])*data[i].u[1];return t < -tol||t>data[i].length+tol;}))continue;
  if(contacts.some((p,i)=>Math.abs(Math.hypot(p[0]-center[0],p[1]-center[1])-radius)>tol||Math.abs((p[0]-lines[i][0][0])*data[i].n[0]+(p[1]-lines[i][0][1])*data[i].n[1])>tol))continue;
  result.push({branch:`${first===1?"left":"right"}/${second===1?"left":"right"}`,center,contacts,radius});
 }
 return result;
}
