import {fittedCurveInSpace,type FitSpace} from "../precision/fittedCurveSpace";
import {cubicJoinReport} from "../precision/cubicTangents";
import {validSpline,type CadDocument} from "@agent-webcad/cad-document";
import {fitSpline,fittedSplineDefinition,type FitContinuity} from "../precision/fitSpline";
import {getObjectTransform} from "../precision/objectTransform";
import {WORK_PLANES,type Vec3,type WorkPlaneId} from "../precision/workPlane";
import type {CopilotPlan} from "./copilotPlan";

export function inspectFittedCurve(document:CadDocument,id:string){
 const object=document.objects[id],feature=Object.values(document.features).find(f=>f.output===id);
 if(!object||!feature||feature.type!=="drawing"||!validSpline(feature.params))throw Error("Choose a fitted spline.");
 const fit=fittedSplineDefinition(feature.params);if(!fit)throw Error("This spline does not have recoverable fit points. Use the manual NURBS editor.");
 const independent=!feature.inputs.length&&!feature.params.sketchId&&!feature.construction&&!feature.pattern&&document.rootObjects.includes(id);
 return {objectId:id,plane:feature.params.workPlane as WorkPlaneId,space:feature.params.fitSpace==="spatial"?"spatial" as const:"planar" as const,...fit,continuityReport:cubicJoinReport(feature.params.controlPoints,fit.closed),transform:getObjectTransform(object,feature),independent,editable:independent&&object.visible&&!!document.layers[object.layerId]?.visible&&!document.layers[object.layerId]?.locked,coordinates:"source XYZ mm; retain the existing object transform"};
}
export const fittedPoints=fittedCurveInSpace;
export function reshapeFittedCurve(document:CadDocument,selectionIds:string[],objectId:string,points:Vec3[],tension:number,continuity?:FitContinuity,space?:FitSpace):CopilotPlan{
 if(selectionIds.length!==1||selectionIds[0]!==objectId)throw Error("Select exactly the fitted spline being reshaped; a read is not an edit grant.");
 const source=inspectFittedCurve(document,objectId);if(!source.editable)throw Error("Select an independent visible unlocked fitted spline.");
 const normal=WORK_PLANES[source.plane].normal,axis=normal.findIndex(v=>v!==0);
 if((space??source.space)==="planar"&&points.some(p=>Math.abs(p[axis]-source.points[0][axis])>1e-6))throw Error("A reshape must retain the curve's source elevation.");
 const spline=fittedPoints(points,source.plane,source.closed,tension,continuity??source.continuity,space??source.space);
 return {command:{type:"update-spline",objectId,spline},resultObjectIds:[objectId],summary:[`Reshape ${objectId}: ${points.length} fit points, ${continuity??source.continuity}, ${space??source.space}, tangent ${tension}. Source plane, closure and object placement remain unchanged. Snapshot derivatives need separate review.`],ghosts:[]};
}
