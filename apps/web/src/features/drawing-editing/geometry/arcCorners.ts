import { openEndCornerSources, openEndChamferSolutions } from "./openEndCorners";
import type { CadFeature,CadObject } from "@agent-webcad/cad-document";
import { exactDrawingContour,contourTolerance,locateOnContour,segmentPoint,type ContourSegment } from "./contourEditing";
import { lineArcFilletSolutions } from "./lineArcFillet";
import { WORK_PLANES,worldToPlane,type Vec3 } from "../../../precision/workPlane";
type Source={object:CadObject;feature:CadFeature};
type P=[number,number];
const dot=(a:P,b:P)=>a[0]*b[0]+a[1]*b[1],sub=(a:P,b:P):P=>[a[0]-b[0],a[1]-b[1]],cross=(a:P,b:P)=>a[0]*b[1]-a[1]*b[0];
const unit=(p:P):P=>{const n=Math.hypot(...p);return [p[0]/n,p[1]/n];};
const mod=(n:number)=>(n%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
export type ArcCornerSolution={replacements:Record<string,unknown>[];connector:Record<string,unknown>;contacts:Vec3[];corner:Vec3;center?:Vec3};
export function curveCornerSolutions(first:Source,second:Source,firstPick:Vec3,secondPick:Vec3,treatment:"fillet"|"chamfer",value:number,d2=value):ArcCornerSolution[]{
 if(treatment==="chamfer")return openEndChamferSolutions(first,second,firstPick,secondPick,value,d2);
 const original=[first,second], originalPaths=original.map(s=>exactDrawingContour(s.object,s.feature));
 if(originalPaths.some(p=>p.segments.length>1)){
  const reduced=openEndCornerSources(original,[firstPick,secondPick]);
  const ends=reduced.ends.map(e=>e.source);
  return curveCornerSolutions(ends[0],ends[1],firstPick,secondPick,treatment,value,d2).flatMap(result=>{const restored=reduced.restore(result);return restored?[restored]:[];});
 }
 if(treatment==="fillet"&&[first,second].filter(s=>s.feature.params.kind==="arc").length===1)return lineArcFilletSolutions(first,second,firstPick,secondPick,value);
 if(!Number.isFinite(value)||value<=1e-9||!Number.isFinite(d2)||d2<=1e-9)throw new Error("Enter positive finite corner distances.");
 const sources=[first,second],paths=sources.map(s=>exactDrawingContour(s.object,s.feature)),picks=[firstPick,secondPick],tol=contourTolerance(paths),plane=WORK_PLANES[paths[0].workPlane];
 if(paths.some(p=>p.closed||p.segments.length!==1||p.workPlane!==paths[0].workPlane))throw new Error("Use standalone finite arcs or lines on the same plane.");
 const segments=paths.map(p=>p.segments[0]);
 if(Math.abs(segments[0].start.reduce((n,v,i)=>n+(v-segments[1].start[i])*plane.normal[i],0))>tol)throw new Error("Use the same elevation for arc corners.");
 if(segments.some(s=>s.kind==="arc"&&Math.abs(s.sweep!)>=2*Math.PI-1e-9))throw new Error("Full circles have no retained end branch.");
 const hits=paths.map((p,i)=>locateOnContour(p,picks[i]));if(hits.some(h=>h.distance>tol))throw new Error("Pick a point on each retained branch.");
 const length=(s:ContourSegment)=>s.kind==="arc"?s.radius!*Math.abs(s.sweep!):Math.hypot(...s.end.map((n,i)=>n-s.start[i]));
 const replacement=(i:number,t:number,keepEnd:boolean)=>{const params={...sources[i].feature.params};if(segments[i].kind!=="arc")throw new Error("Arc replacement requires an analytic source arc.");const a=Number(params.startAngle),s=Number(params.endAngle)-a;if(keepEnd)params.startAngle=a+s*t;else params.endAngle=a+s*t;return params;};
 const valid=(t:number,i:number)=>Number.isFinite(t)&&t>tol/length(segments[i])&&t<1-tol/length(segments[i])&&Math.abs(t-hits[i].parameter)*length(segments[i])>tol;
 const results:ArcCornerSolution[]=[];
 if(segments.some(s=>s.kind!=="arc"))throw new Error("Arc–arc Fillet requires two finite arcs.");
 const centers=segments.map(s=>worldToPlane(s.center!,plane)),v=sub(centers[1],centers[0]),D=Math.hypot(...v);if(D<=tol)return [];const u=unit(v),normal:P=[-u[1],u[0]],height=segments[0].center!.reduce((sum,n,i)=>sum+n*plane.normal[i],0);
 const world=(p:P):Vec3=>plane.origin.map((n,i)=>n+p[0]*plane.xAxis[i]+p[1]*plane.yAxis[i]+height*plane.normal[i]) as Vec3;
 for(const signed0 of [segments[0].radius!+value,segments[0].radius!-value])for(const signed1 of [segments[1].radius!+value,segments[1].radius!-value]){
  const radii=[signed0,signed1];if(radii.some(r=>Math.abs(r)<=tol))continue;
  const along=(signed0*signed0-signed1*signed1+D*D)/(2*D),h2=signed0*signed0-along*along;if(!Number.isFinite(h2)||h2<-tol*Math.max(Math.abs(signed0),1))continue;
  for(const root of h2<=tol*tol?[0]:[-Math.sqrt(Math.max(0,h2)),Math.sqrt(Math.max(0,h2))]){
   const center:P=[centers[0][0]+u[0]*along+normal[0]*root,centers[0][1]+u[1]*along+normal[1]*root],contact2=segments.map((s,i)=>[centers[i][0]+(center[0]-centers[i][0])*s.radius!/radii[i],centers[i][1]+(center[1]-centers[i][1])*s.radius!/radii[i]] as P);
   const ts=contact2.map((p,i)=>mod(Math.sign(segments[i].sweep!)*(Math.atan2(p[1]-centers[i][1],p[0]-centers[i][0])-segments[i].startAngle!))/Math.abs(segments[i].sweep!));if(!ts.every(valid))continue;
   const keep=ts.map((t,i)=>hits[i].parameter>t),incoming=unit(sub(contact2[0],centers[0])),outgoing=unit(sub(contact2[1],centers[1])),directions=[Math.sign(segments[0].sweep!)*(keep[0]?-1:1),Math.sign(segments[1].sweep!)*(keep[1]?1:-1)];
   const desired0:P=[-incoming[1]*directions[0],incoming[0]*directions[0]],desired1:P=[-outgoing[1]*directions[1],outgoing[0]*directions[1]],a=sub(contact2[0],center),b=sub(contact2[1],center),start=Math.atan2(a[1],a[0]);let sweep=Math.atan2(cross(a,b),dot(a,b));
   if(Math.abs(Math.abs(sweep)-Math.PI)<1e-9)sweep=Math.PI*Math.sign(dot(unit([-a[1],a[0]]),desired0));
   if(Math.abs(sweep)*value<=tol||dot(unit([-a[1]*Math.sign(sweep),a[0]*Math.sign(sweep)]),desired0)<1-1e-7||dot(unit([-b[1]*Math.sign(sweep),b[0]*Math.sign(sweep)]),desired1)<1-1e-7)continue;
   const contacts=contact2.map(world);if(results.some(r=>Math.hypot(...r.center!.map((n,i)=>n-world(center)[i]))<=tol))continue;
   results.push({replacements:ts.map((t,i)=>replacement(i,t,keep[i])),contacts,corner:contacts[0],center:world(center),connector:{kind:"arc",workPlane:paths[0].workPlane,center:world(center),radius:value,startAngle:start,endAngle:start+sweep}});
  }
 }
 return results;
}
export function chooseCurveCorner(solutions:ArcCornerSolution[],solutionIndex?:number){
 if(!solutions.length)throw new Error("No bounded corner fits the retained branches. Change the radius/distances or picks.");
 if(solutions.length>1&&solutionIndex===undefined)throw new Error("Multiple curved corners fit. Choose a solution and review its contact points.");
 const selected=solutions[solutionIndex??0];if(!selected)throw new Error("Selected corner solution is unavailable. Review again.");return selected;
}
