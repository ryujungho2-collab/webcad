import type { CadFeature, CadObject } from "@agent-webcad/cad-document";
import { exactDrawingContour, contourTolerance, locateOnContour } from "./contourEditing";
import { drawingWorldToModel } from "../../../precision/worldGeometry";
import { WORK_PLANES, worldToPlane, type Vec3 } from "../../../precision/workPlane";
type Source = { object: CadObject; feature: CadFeature };
type P = [number,number];
const dot=(a:P,b:P)=>a[0]*b[0]+a[1]*b[1], sub=(a:P,b:P):P=>[a[0]-b[0],a[1]-b[1]], cross=(a:P,b:P)=>a[0]*b[1]-a[1]*b[0];
const unit=(p:P):P=>{const l=Math.hypot(...p);return [p[0]/l,p[1]/l];};
const tau=2*Math.PI, mod=(n:number)=>(n%tau+tau)%tau;

/** Bounded analytic locus intersections; picks choose retained material, never sampled facets. */
export function lineArcFilletSolutions(first:Source,second:Source,firstPoint:Vec3,secondPoint:Vec3,radius:number) {
  if(!Number.isFinite(radius)||radius<=1e-9)throw new Error("Enter a positive finite Fillet radius.");
  const sources=[first,second],paths=sources.map(s=>exactDrawingContour(s.object,s.feature)),picks=[firstPoint,secondPoint],tol=contourTolerance(paths);
  if(paths.some(p=>p.closed||p.workPlane!==paths[0].workPlane))throw new Error("Use two open contours on one work plane.");
  const plane=WORK_PLANES[paths[0].workPlane],height=(p:Vec3)=>dot3(p,plane.normal);
  if(Math.abs(height(paths[0].segments[0].start)-height(paths[1].segments[0].start))>tol)throw new Error("Use the same elevation for a line–arc Fillet.");
  const hits=paths.map((p,i)=>locateOnContour(p,picks[i]));
  if(hits.some(h=>h.distance>tol))throw new Error("Pick a point on each retained branch.");
  const arcIndex=sources.findIndex(s=>s.feature.params.kind==="arc"),lineIndex=1-arcIndex;
  if(arcIndex<0||paths[arcIndex].segments.length!==1||paths[lineIndex].segments[hits[lineIndex].segment].kind!=="line")throw new Error("Line–arc Fillet requires one standalone finite arc and one straight free-end segment. Arc–arc is a separate operation.");
  const lp=paths[lineIndex],lh=hits[lineIndex];
  if(lh.segment!==0&&lh.segment!==lp.segments.length-1)throw new Error("Pick a straight free-end segment on the line contour.");
  const line=lp.segments[lh.segment],arc=paths[arcIndex].segments[0];
  if(arc.kind!=="arc"||Math.abs(arc.sweep!)>=tau-1e-9)throw new Error("Use a finite open arc, not a full circle.");
  const a=worldToPlane(line.start,plane),b=worldToPlane(line.end,plane),c=worldToPlane(arc.center!,plane),length=Math.hypot(...sub(b,a)),u=unit(sub(b,a)),normal:P=[-u[1],u[0]],R=arc.radius!;
  const pickLine=dot(sub(worldToPlane(picks[lineIndex],plane),a),u),pickArc=hits[arcIndex].parameter;
  const toWorld=(p:P):Vec3=>plane.origin.map((n,i)=>n+p[0]*plane.xAxis[i]+p[1]*plane.yAxis[i]+height(arc.center!)*plane.normal[i]) as Vec3;
  const results:{replacements:Record<string,unknown>[];connector:Record<string,unknown>;contacts:Vec3[];corner:Vec3;center:Vec3}[]=[];
  for(const side of [-1,1])for(const signedDistance of [R+radius,R-radius]){
    const distance=Math.abs(signedDistance);if(distance<=tol)continue; // Coincident circles have no unique tangency.
    const base:P=[a[0]+normal[0]*side*radius,a[1]+normal[1]*side*radius],along=dot(sub(c,base),u),foot:P=[base[0]+along*u[0],base[1]+along*u[1]],h2=distance*distance-dot(sub(foot,c),sub(foot,c));
    if(!Number.isFinite(h2)||h2<-tol*Math.max(1,distance))continue;
    for(const root of h2<=tol*tol?[0]:[-Math.sqrt(Math.max(0,h2)),Math.sqrt(Math.max(0,h2))]){
      const center:P=[foot[0]+root*u[0],foot[1]+root*u[1]],progress=dot(sub(center,a),u),contactLine:P=[a[0]+progress*u[0],a[1]+progress*u[1]],contactArc:P=[c[0]+(center[0]-c[0])*R/signedDistance,c[1]+(center[1]-c[1])*R/signedDistance];
      const angle=Math.atan2(contactArc[1]-c[1],contactArc[0]-c[0]),arcT=mod(Math.sign(arc.sweep!)*(angle-arc.startAngle!))/Math.abs(arc.sweep!);
      if(progress<=tol||progress>=length-tol||arcT<=tol/R||arcT>=1-tol/R||Math.abs(pickLine-progress)<=tol||Math.abs(pickArc-arcT)*R*Math.abs(arc.sweep!)<=tol)continue;
      const lineKeepEnd=pickLine>progress,arcKeepEnd=pickArc>arcT;
      if(lp.segments.length>1&&lineKeepEnd!==(lh.segment===0))continue;
      const r=sub(contactLine,center),s=sub(contactArc,center),startAngle=Math.atan2(r[1],r[0]);
      let sweep=Math.atan2(cross(r,s),dot(r,s));
      // At a double locus root, a semicircle has two orientations; retain the G1 direction.
      if(Math.abs(Math.abs(sweep)-Math.PI)<1e-9)sweep=Math.PI*Math.sign(dot(unit([-r[1],r[0]]),[u[0]*(lineKeepEnd?-1:1),u[1]*(lineKeepEnd?-1:1)]));
      if(Math.abs(sweep)*radius<=tol)continue;
      const startTangent=unit([-r[1]*Math.sign(sweep),r[0]*Math.sign(sweep)]),endTangent=unit([-s[1]*Math.sign(sweep),s[0]*Math.sign(sweep)]),arcRadial=sub(contactArc,c),arcDirection=Math.sign(arc.sweep!)*(arcKeepEnd?1:-1);
      if(dot(startTangent,[u[0]*(lineKeepEnd?-1:1),u[1]*(lineKeepEnd?-1:1)])<1-1e-7||dot(endTangent,unit([-arcRadial[1]*arcDirection,arcRadial[0]*arcDirection]))<1-1e-7)continue;
      const contacts:Vec3[]=Array(2);contacts[lineIndex]=toWorld(contactLine);contacts[arcIndex]=toWorld(contactArc);
      const lineParams=structuredClone(sources[lineIndex].feature.params),modelContact=drawingWorldToModel(sources[lineIndex].object,sources[lineIndex].feature,contacts[lineIndex]);
      if(!modelContact)throw new Error("Unable to invert the line frame.");
      (lineParams.points as Vec3[])[lineKeepEnd?0:(lineParams.points as Vec3[]).length-1]=modelContact;
      const arcParams={...sources[arcIndex].feature.params},modelStart=Number(arcParams.startAngle),modelSweep=Number(arcParams.endAngle)-modelStart;
      if(arcKeepEnd)arcParams.startAngle=modelStart+modelSweep*arcT;else arcParams.endAngle=modelStart+modelSweep*arcT;
      const replacements:Record<string,unknown>[]=Array(2);replacements[lineIndex]=lineParams;replacements[arcIndex]=arcParams;
      const connector={kind:"arc",workPlane:paths[0].workPlane,center:toWorld(center),radius,startAngle:lineIndex===0?startAngle:startAngle+sweep,endAngle:lineIndex===0?startAngle+sweep:startAngle};
      if(!results.some(e=>Math.hypot(...e.center.map((v,i)=>v-toWorld(center)[i]))<=tol))results.push({replacements,connector,contacts,corner:contacts[lineIndex],center:toWorld(center)});
    }
  }
  return results;
}
function dot3(a:Vec3,b:Vec3){return a.reduce((sum,n,i)=>sum+n*b[i],0);}
