import type {CadDocument,SavedMeasurementDefinition} from "@agent-webcad/cad-document";
import {WORK_PLANES,planeToWorld,type Vec3} from "./workPlane";
/** Explicit drawing ownership; never infer a sheet from geometric proximity. */
export function measurementPresentation(d:CadDocument,m:SavedMeasurementDefinition){
 if(!m.drawingId)return {plane:m.plane,origin:[0,0] as [number,number],scale:1,anchorId:m.source.objectId};
 const view=d.modelPresentation?.sections?.[m.drawingId];if(!view||view.status!=="resolved"||view.basis!==m.plane||!Number.isFinite(view.scale)||view.scale<=0)return null;
 const objects=new Set(view.partIds.map(id=>d.modelPresentation?.parts[id]?.objectId));if(!objects.has(m.source.objectId)||!objects.has(m.target.objectId))return null;
 const anchorId=Object.values(view.outputs).map(o=>o.objectId).find(id=>d.objects[id]?.visible&&d.layers[d.objects[id].layerId]?.visible);if(!anchorId)return null;
 return {plane:"XY" as const,origin:[...view.origin] as [number,number],scale:view.scale,anchorId};
}
export function measurementDisplayPoint(d:CadDocument,m:SavedMeasurementDefinition,p:[number,number]):Vec3|null{const frame=measurementPresentation(d,m);return frame?planeToWorld([frame.origin[0]+p[0]*frame.scale,frame.origin[1]+p[1]*frame.scale],WORK_PLANES[frame.plane]):null;}
