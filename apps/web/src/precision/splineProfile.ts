import type {ExtrudeProfile} from "@agent-webcad/cad-kernel";
import {sectionCurvePieces,sectionCurveRow,sectionCurvePointOn,verifySectionCurveBoundary} from "./sectionCurveBoundary";
import {splineArea,splineLength,sampleSpline} from "./splineGeometry";
import {worldToPlane,WORK_PLANES,type WorkPlaneId,type Vec3} from "./workPlane";
import {threePointCurve} from "./threePointCurve";
import type {SectionDrawing} from "./modelSection";
/** Exact positive rational Bezier pieces shared by contacts and containment. */
export function profileCurvePieces(profile:ExtrudeProfile,plane:WorkPlaneId){
 const local=(p:Vec3)=>[...worldToPlane(p,WORK_PLANES[plane]),0] as Vec3;
 const curves=profile.segments.map((s,i):SectionDrawing=>{
  const identity={sourceKey:String(i),partId:profile.id};
  if(s.kind==="spline")return {...identity,kind:"spline",params:{...s,controlPoints:s.controlPoints.map(local)}};
  if(s.kind==="line")return {...identity,kind:"line",params:{points:[local(s.start),local(s.end)]}};
  if(s.kind==="circle")return {...identity,kind:"circle",params:{center:local(s.center),radius:s.radius}};
  const result=threePointCurve([s.start,s.mid,s.end].map(p=>worldToPlane(p,WORK_PLANES[plane])));if(!result.ok)throw Error(result.reason);
  return {...identity,kind:"arc",params:{...result.curve,center:[...result.curve.center,0]}};
 });return sectionCurvePieces(curves);
}
export function curvedProfilesTouch(a:ExtrudeProfile,b:ExtrudeProfile,plane:WorkPlaneId){try{verifySectionCurveBoundary([...profileCurvePieces(a,plane),...profileCurvePieces(b,plane)]);return false;}catch{return true;}}
export function splineProfilePointOn(profile:ExtrudeProfile,p:[number,number],plane:WorkPlaneId){return sectionCurvePointOn(profileCurvePieces(profile,plane),p);}
export function singleSplineProfile(profile:ExtrudeProfile){
 const splines=profile.segments.filter(s=>s.kind==="spline");if(!splines.length)return;
 if(profile.segments.length!==1)throw Error("A spline boundary must be one closed spline; chained mixed edges are not supported.");return splines[0];
}
export function splineProfileContains(profile:ExtrudeProfile,p:[number,number],plane:WorkPlaneId){
 const pieces=verifySectionCurveBoundary(profileCurvePieces(profile,plane));if(sectionCurvePointOn(pieces,p))return false;const xs=sectionCurveRow(pieces,p[1]);
 return xs.filter(x=>x>p[0]).length%2===1;
}
export function splineProfilePoints(profile:ExtrudeProfile,plane:WorkPlaneId,tolerance=.02,maxPoints=200000){const samples=sampleSpline(singleSplineProfile(profile)!,tolerance);if(samples.length>maxPoints)throw Error("Spline profile display exceeds its point budget.");return samples.slice(0,-1).map(q=>worldToPlane(q,WORK_PLANES[plane]));}
export function splineProfileMeasurement(profile:ExtrudeProfile){const spline=singleSplineProfile(profile)!,area=splineArea(spline);if(area===undefined)throw Error("Spline profile is not closed and planar.");return {area,length:splineLength(spline)};}
