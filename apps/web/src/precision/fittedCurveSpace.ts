import {fitSpline,type FitContinuity} from "./fitSpline";
import {WORK_PLANES,type Vec3,type WorkPlaneId} from "./workPlane";
export type FitSpace="planar"|"spatial";
/** View plane is retained even for a true XYZ path; it is not a projection. */
export function fittedCurveInSpace(points:Vec3[],plane:WorkPlaneId,closed:boolean,tension:number,continuity:FitContinuity="C1",space:FitSpace="planar"){
 const frame=WORK_PLANES[plane];if(!frame)throw Error("Use an origin reference plane.");if(space!=="planar"&&space!=="spatial")throw Error("Use planar or spatial curve coordinates.");
 if(space==="planar"){const elevation=points.map(p=>p.reduce((s,v,i)=>s+v*frame.normal[i],0));if(elevation.some(v=>Math.abs(v-elevation[0])>1e-6))throw Error("Fit points must share one plane parallel to the source work plane. Choose spatial XYZ for a 3D path.");}
 if(closed&&Math.hypot(...points[0].map((v,i)=>v-points.at(-1)![i]))<1e-7)throw Error("Omit the repeated closing fit point.");const spline=fitSpline(points,closed,tension,continuity);return space==="spatial"?{...spline,fitSpace:"spatial" as const}:spline;
}
