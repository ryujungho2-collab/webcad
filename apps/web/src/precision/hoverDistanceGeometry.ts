import {validEllipse,validSpline,validWorkPlaneFrame,type CadDocument} from "@agent-webcad/cad-document";
import {drawingModelToWorld} from "./worldGeometry";
import {profileSegments} from "./profileGeometry";
import {splineBezierSpans} from "./splineGeometry";
import {WORK_PLANES,type Vec3} from "./workPlane";

export type DistanceMode="shortest"|"project-XY"|"project-XZ"|"project-YZ"|"axis-X"|"axis-Y"|"axis-Z";
export type DistanceWitness={objectId:string;elementId:string;parameter?:number;point:Vec3};
export type CurvePiece={objectId:string;elementId:string;range:[number,number];a:Vec3;b:Vec3;error:number;at:(t:number)=>Vec3;split?:()=>[CurvePiece,CurvePiece]};
const add=(a:Vec3,b:Vec3)=>a.map((n,i)=>n+b[i]) as Vec3,sub=(a:Vec3,b:Vec3)=>a.map((n,i)=>n-b[i]) as Vec3;
const mul=(a:Vec3,n:number)=>a.map(v=>v*n) as Vec3,dot=(a:Vec3,b:Vec3)=>a.reduce((s,n,i)=>s+n*b[i],0);
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],clamp=(n:number)=>Math.max(0,Math.min(1,n));
const lerp=(a:Vec3,b:Vec3,t:number)=>add(a,mul(sub(b,a),t));
const axes=(mode:DistanceMode):Vec3=>mode==="shortest"?[1,1,1]:mode.startsWith("axis-")?["X","Y","Z"].map(a=>mode.endsWith(a)?1:0) as Vec3:["X","Y","Z"].map(a=>mode.slice(8).includes(a)?1:0) as Vec3;
/** Finite segment closest points, including degeneracy, skew and parallel overlap. */
export function closestSegments(a:Vec3,b:Vec3,c:Vec3,d:Vec3,mode:DistanceMode="shortest"){
 const mask=axes(mode),metric=(v:Vec3)=>v.map((n,i)=>n*mask[i]) as Vec3,u=metric(sub(b,a)),v=metric(sub(d,c)),w=metric(sub(c,a)),aa=dot(u,u),bb=dot(v,v);
 const candidates:[number,number][]=[[0,bb?clamp(-dot(v,w)/bb):0],[1,bb?clamp(dot(v,sub(u,w))/bb):0],[aa?clamp(dot(u,w)/aa):0,0],[aa?clamp(dot(u,add(w,v))/aa):0,1]];
 const n=cross(u,v),den=dot(n,n);if(den>0){const s=dot(cross(w,v),n)/den,t=dot(cross(w,u),n)/den;if(s>=0&&s<=1&&t>=0&&t<=1)candidates.push([s,t]);}
 let best={s:0,t:0,distance:Infinity};for(const [s,t] of candidates){const distance=Math.hypot(...metric(sub(lerp(a,b,s),lerp(c,d,t))));if(distance<best.distance)best={s,t,distance};}return best;
}
function line(objectId:string,elementId:string,a:Vec3,b:Vec3):CurvePiece{return {objectId,elementId,range:[0,1],a,b,error:0,at:t=>lerp(a,b,t)};}
function ellipse(objectId:string,elementId:string,c:Vec3,u:Vec3,v:Vec3,start:number,end:number):CurvePiece{
 const at=(t:number)=>add(c,add(mul(u,Math.cos(start+(end-start)*t)),mul(v,Math.sin(start+(end-start)*t))));
 return {objectId,elementId,range:[start,end],a:at(0),b:at(1),error:(Math.hypot(...u)+Math.hypot(...v))*(end-start)**2/8,at,split:()=>{const m=(start+end)/2;return [ellipse(objectId,elementId,c,u,v,start,m),ellipse(objectId,elementId,c,u,v,m,end)];}};
}
type H=[number,number,number,number];
const cart=(h:H):Vec3=>[h[0]/h[3],h[1]/h[3],h[2]/h[3]];
function bezier(objectId:string,elementId:string,h:H[],start:number,end:number):CurvePiece{
 const cast=(t:number)=>{const left=[h[0]],right=[h.at(-1)!];let row=h;while(row.length>1){row=row.slice(1).map((q,i)=>q.map((n,k)=>row[i][k]*(1-t)+n*t) as H);left.push(row[0]);right.unshift(row.at(-1)!);}return {left,right,point:cart(row[0])};};
 const points=h.map(cart),a=points[0],b=points.at(-1)!,error=Math.max(...points.map(p=>closestSegments(a,b,p,p).distance));
 return {objectId,elementId,range:[start,end],a,b,error,at:t=>cast(t).point,split:()=>{const {left,right}=cast(.5),m=(start+end)/2;return [bezier(objectId,elementId,left,start,m),bezier(objectId,elementId,right,m,end)];}};
}
/** Source geometry and its full affine transform, independent of display tessellation/zoom. */
export function distanceCurves(d:CadDocument,id:string):CurvePiece[]{
 const o=Object.hasOwn(d.objects,id)?d.objects[id]:undefined,f=o&&Object.values(d.features).find(f=>f.output===id);if(!o||f?.type!=="drawing")throw Error("Only finite drawing geometry is supported; solid, image and annotation distances are unavailable.");
 const p=f.params,kind=String(p.kind),map=(v:Vec3)=>drawingModelToWorld(o,f,v)!,top=p.topology as {segments?:{id:string;index:number}[];curves?:{id:string}[];controls?:{id:string}[]}|undefined,curveId=top?.curves?.[0]?.id??"curve:0";
 if(validSpline(p)){return splineBezierSpans(p).map((s,i)=>bezier(id,`${curveId}/span:${i}`,s.h.map(h=>{const q=map(cart(h));return [...q.map(n=>n*h[3]),h[3]] as H;}),s.a,s.b));}
 const arc=(c:Vec3,u:Vec3,v:Vec3,start:number,end:number,element=curveId)=>{const center=map(c);return ellipse(id,element,center,sub(map(add(c,u)),center),sub(map(add(c,v)),center),start,end);};
 if(validEllipse(p))return [arc(p.center,p.axisU,p.axisV,p.startParam,p.startParam+p.sweep)];
 const plane=validWorkPlaneFrame(p.faceFrame)?p.faceFrame:WORK_PLANES[p.workPlane==="XZ"?"XZ":p.workPlane==="YZ"?"YZ":"XY"];
 if(kind==="circle"||kind==="arc"){const r=Number(p.radius),start=kind==="circle"?0:Number(p.startAngle),end=kind==="circle"?2*Math.PI:Number(p.endAngle);if(!(r>0)||![start,end].every(Number.isFinite))throw Error("Invalid finite curve.");return [arc(p.center as Vec3,mul(plane.xAxis,r),mul(plane.yAxis,r),start,end)];}
 if(kind==="point"){const a=map((p.points as Vec3[])[0]);return [line(id,top?.controls?.[0]?.id??"point:0",a,a)];}
 if(!["line","polyline","rectangle"].includes(kind))throw Error("Unbounded rays/infinite lines are not supported for hover distance.");
 const profilePlane=WORK_PLANES[p.workPlane==="XZ"?"XZ":p.workPlane==="YZ"?"YZ":"XY"];
 const parts=profileSegments(kind,p).map(s=>{const element=top?.segments?.find(t=>t.index===s.index)?.id??`segment:${s.index}`;return s.kind==="line"?line(id,element,map(s.start),map(s.end)):arc(s.center!,mul(profilePlane.xAxis,s.radius!),mul(profilePlane.yAxis,s.radius!),s.startAngle!,s.startAngle!+s.sweep!,element);});
 if(!parts.length)throw Error("Drawing has no finite geometry.");return parts;
}
export type GeometryDistance={distance:number;lower:number;upper:number;accuracy:"analytic"|"bounded"|"approximate"|"brep";tolerance:number;source:DistanceWitness;target:DistanceWitness;evaluations:number};
type Pair={a:CurvePiece;b:CurvePiece;lower:number};
/** Certified chord/hull enclosures; actual curve points supply the upper bound and witnesses. */
export async function solveCurveDistance(source:CurvePiece[],target:CurvePiece[],mode:DistanceMode="shortest",tolerance=.001,signal?:AbortSignal,budget=20000):Promise<GeometryDistance>{
 if(!(tolerance>0&&Number.isFinite(tolerance)))throw Error("Invalid distance tolerance.");if(!source.length||!target.length||source.length>512||target.length>512||source.length*target.length>Math.min(16384,budget))throw Error("Hover geometry exceeds its 512-curve / primitive-pair evaluation budget.");
 let best:GeometryDistance|undefined,evaluations=0;const heap:Pair[]=[];
 const push=(p:Pair)=>{let i=heap.length;heap.push(p);while(i){const parent=(i-1)>>1;if(heap[parent].lower<=p.lower)break;heap[i]=heap[parent];i=parent;heap[i]=p;}};
 const pop=()=>{const first=heap[0],last=heap.pop()!;if(heap.length){let i=0;heap[0]=last;for(;;){let j=i*2+1;if(j>=heap.length)break;if(j+1<heap.length&&heap[j+1].lower<heap[j].lower)j++;if(last.lower<=heap[j].lower)break;heap[i]=heap[j];i=j;heap[i]=last;}}return first;};
 const witness=(p:CurvePiece,t:number):DistanceWitness=>({objectId:p.objectId,elementId:p.elementId,parameter:p.range[0]+(p.range[1]-p.range[0])*t,point:p.at(t)});
 const evaluate=(a:CurvePiece,b:CurvePiece)=>{evaluations++;const q=closestSegments(a.a,a.b,b.a,b.b,mode),s=witness(a,q.s),t=witness(b,q.t),distance=closestSegments(s.point,s.point,t.point,t.point,mode).distance;
  if(!best||distance<best.distance)best={distance,lower:0,upper:distance,accuracy:"bounded",tolerance,source:s,target:t,evaluations};
  push({a,b,lower:Math.max(0,q.distance-a.error-b.error)});
 };
 signal?.throwIfAborted();for(const a of source)for(const b of target){evaluate(a,b);if(evaluations%128===0){await new Promise(r=>setTimeout(r,0));signal?.throwIfAborted();}}
 const roundoff=128*Number.EPSILON*Math.max(1,...[...source,...target].flatMap(p=>[...p.a,...p.b,p.error].map(Math.abs)));
 while(heap.length&&best!.distance-heap[0].lower>Math.max(tolerance,roundoff)&&evaluations+2<=budget){const p=pop();if(p.lower>best!.distance)continue;const splitA=!!p.a.split&&(!p.b.split||p.a.error>=p.b.error);const curve=splitA?p.a:p.b;if(!curve.split){push(p);break;}for(const part of curve.split())evaluate(splitA?part:p.a,splitA?p.b:part);if(evaluations%128<2){await new Promise(r=>setTimeout(r,0));signal?.throwIfAborted();}}
 signal?.throwIfAborted();const result=best!,lower=Math.max(0,Math.min(result.distance,heap[0]?.lower??result.distance)-roundoff),upper=result.distance+roundoff;
 return {...result,lower,upper,evaluations,accuracy:source.every(p=>!p.split)&&target.every(p=>!p.split)?"analytic":upper-lower<=Math.max(tolerance,roundoff)*1.01?"bounded":"approximate"};
}
