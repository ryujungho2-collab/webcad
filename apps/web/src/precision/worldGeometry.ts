import {validSpline,type CadSpline} from "@agent-webcad/cad-document";
import {sampleSpline,splineClosed} from "./splineGeometry";
import {validEllipse,type CadEllipse} from "@agent-webcad/cad-document";
import {ellipseClosed,ellipseExtrema,sampleEllipse} from "./ellipseGeometry";
import * as THREE from "three";
import type { CadFeature, CadObject } from "@agent-webcad/cad-document";
import { validWorkPlaneFrame } from "@agent-webcad/cad-document";
import { getObjectTransform } from "./objectTransform";
import { planeToWorld, worldToPlane, WORK_PLANES, type Vec3, type WorkPlaneId, type WorkPlane } from "./workPlane";
import { sampleProfile } from "./profileGeometry";
import { profileSegments } from "./profileGeometry";

export type WorldProfileSegment = {
  topologyReference: string;
  kind: "line" | "arc";
  start: Vec3;
  end: Vec3;
  center?: Vec3;
  radius?: number;
  startAngle?: number;
  endAngle?: number;
};

export type WorldDrawingGeometry = {
  spline?:CadSpline;
  ellipse?:CadEllipse;
  objectId: string;
  kind: "spline" | "ellipse" | "elliptic-arc" | "line" | "polyline" | "rectangle" | "circle" | "arc" | "point" | "infinite-line" | "ray";
  workPlane: WorkPlaneId;
  points?: Vec3[];
  center?: Vec3;
  radius?: number;
  startAngle?: number;
  endAngle?: number;
  closed: boolean;
  profileSegments?: WorldProfileSegment[];
  uniformScale: boolean;
  planeAligned: boolean;
};

export function drawingPlaneScale(
  scale: [number, number, number],
  plane: WorkPlaneId,
) {
  const [first, second] = plane === "XZ" ? [0, 2] : plane === "YZ" ? [1, 2] : [0, 1];
  const firstScale = scale[first];
  const secondScale = scale[second];
  const magnitude = Math.abs(firstScale);
  return {
    uniform: magnitude > 1e-9 && Math.abs(magnitude - Math.abs(secondScale)) < 1e-9,
    magnitude,
    orientation: Math.sign(firstScale * secondScale) || 1,
  };
}

function drawingFrame(params:Record<string,unknown>,plane:WorkPlaneId):WorkPlane {
  return validWorkPlaneFrame(params.faceFrame)?{id:String(params.facePlaneId),...params.faceFrame}:WORK_PLANES[plane];
}

function sampleDrawing(feature: CadFeature, plane: WorkPlane): { points?: Vec3[]; center?: Vec3; radius?: number; startAngle?: number; endAngle?: number } {
  const params = feature.params as Record<string, unknown>;
  const kind = String(params.kind);
  if (["point", "infinite-line", "ray"].includes(kind) && Array.isArray(params.points)) return { points: params.points as Vec3[] };
  if ((kind === "line" || kind === "polyline" || kind === "rectangle") && Array.isArray(params.points)) return { points: sampleProfile(kind, params, Math.PI / 48) };
  if (!Array.isArray(params.center) || !(Number(params.radius) > 0)) return {};
  const center = params.center as Vec3;
  const radius = Number(params.radius);
  const start = kind === "arc" ? Number(params.startAngle) : 0;
  const end = kind === "arc" ? Number(params.endAngle) : Math.PI * 2;
  const workPlane = plane;
  const c = worldToPlane(center, workPlane);
  const elevation = center.reduce((sum, value, index) => sum + (value-workPlane.origin[index]) * workPlane.normal[index], 0);
  const count = kind === "circle" ? 96 : Math.max(24, Math.ceil(Math.abs(end - start) / (Math.PI / 48)));
  const points = Array.from({ length: count + 1 }, (_, index) => {
    const angle = start + (end - start) * index / count;
    const point = planeToWorld([c[0] + Math.cos(angle) * radius, c[1] + Math.sin(angle) * radius], workPlane);
    return point.map((value, index) => value + elevation * workPlane.normal[index]) as Vec3;
  });
  return { points, center, radius, startAngle: kind === "arc" ? start : undefined, endAngle: kind === "arc" ? end : undefined };
}

export function drawingWorkPlane(feature: CadFeature): WorkPlaneId {
  return (feature.params.workPlane === "XZ" || feature.params.workPlane === "YZ" ? feature.params.workPlane : "XY") as WorkPlaneId;
}

/** A drawing's edit/render pivot is based on analytic extrema, independent of
 * display tessellation density. Both the renderer and precision tools use it. */
export function drawingModelOrigin(params: Record<string, unknown>): Vec3 {
  const kind = String(params.kind), planeId = (params.workPlane === "XZ" || params.workPlane === "YZ" ? params.workPlane : "XY") as WorkPlaneId, plane = drawingFrame(params,planeId);
  if(validSpline(params)){return new THREE.Box3().setFromPoints(params.controlPoints.map(p=>new THREE.Vector3(...p))).getCenter(new THREE.Vector3()).toArray() as Vec3;}
  if(validEllipse(params)){const pts=ellipseExtrema(params);return new THREE.Box3().setFromPoints(pts.map(p=>new THREE.Vector3(...p))).getCenter(new THREE.Vector3()).toArray() as Vec3;}
  const points: Vec3[] = Array.isArray(params.points) ? [...params.points as Vec3[]] : [];
  if (["infinite-line", "ray"].includes(kind) && points.length) return [...points[0]];
  const includeArc = (center: Vec3, radius: number, start: number, sweep: number) => {
    const c = worldToPlane(center, plane), h = center.reduce((sum, v, i) => sum + (v-plane.origin[i]) * plane.normal[i], 0);
    for (const angle of [start, start + sweep, 0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const progress = ((Math.sign(sweep) * (angle - start) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      if (angle !== start && angle !== start + sweep && progress > Math.abs(sweep) + 1e-10) continue;
      points.push(planeToWorld([c[0] + radius * Math.cos(angle), c[1] + radius * Math.sin(angle)], plane).map((v, i) => v + h * plane.normal[i]) as Vec3);
    }
  };
  if (kind === "circle" || kind === "arc") {
    if (Array.isArray(params.center) && Number(params.radius) > 0) includeArc(params.center as Vec3, Number(params.radius), kind === "circle" ? 0 : Number(params.startAngle), kind === "circle" ? 2 * Math.PI : Number(params.endAngle) - Number(params.startAngle));
  } else for (const segment of profileSegments(kind, params)) if (segment.kind === "arc") includeArc(segment.center!, segment.radius!, segment.startAngle!, segment.sweep!);
  return points.length ? new THREE.Box3().setFromPoints(points.map(point => new THREE.Vector3(...point))).getCenter(new THREE.Vector3()).toArray() as Vec3 : [0, 0, 0];
}

export function drawingTransformMatrix(object: CadObject, feature: CadFeature): THREE.Matrix4 {
  const transform = getObjectTransform(object, feature);
  const origin = new THREE.Vector3(...drawingModelOrigin(feature.params));
  const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(...transform.rotation.map(THREE.MathUtils.degToRad) as [number, number, number]));
  return new THREE.Matrix4().compose(origin.clone().add(new THREE.Vector3(...transform.translation)), rotation, new THREE.Vector3(...transform.scale)).multiply(new THREE.Matrix4().makeTranslation(-origin.x, -origin.y, -origin.z));
}

/** Maps one world-space point back into a drawing feature's model coordinates. */
export function drawingWorldToModel(object: CadObject, feature: CadFeature, worldPoint: Vec3): Vec3 | null {
  if (feature.type !== "drawing") return null;
  const matrix = drawingTransformMatrix(object, feature).invert();
  return new THREE.Vector3(...worldPoint).applyMatrix4(matrix).toArray() as Vec3;
}

/** Maps one model-space point of a drawing feature to world coordinates. */
export function drawingModelToWorld(object: CadObject, feature: CadFeature, modelPoint: Vec3): Vec3 | null {
  if (feature.type !== "drawing") return null;
  return new THREE.Vector3(...modelPoint).applyMatrix4(drawingTransformMatrix(object, feature)).toArray() as Vec3;
}

/** Includes rotations that flip the work-plane normal as well as reflected scale. */
export function drawingPlaneOrientation(object: CadObject, feature: CadFeature) {
  const transform = getObjectTransform(object, feature), plane = drawingWorkPlane(feature);
  const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(...transform.rotation.map(THREE.MathUtils.degToRad) as [number, number, number]));
  const normal = new THREE.Vector3(...WORK_PLANES[plane].normal);
  return drawingPlaneScale(transform.scale, plane).orientation * Math.sign(normal.clone().applyQuaternion(rotation).dot(normal));
}

/** Keep the model-to-world frame when an edit changes the drawing's bounds-centre pivot. */
export function drawingTransformAfterEdit(object:CadObject,feature:CadFeature,params:Record<string,unknown>){
  const transform=getObjectTransform(object,feature);
  const before=drawingModelToWorld(object,feature,[0,0,0])!;
  const after=drawingModelToWorld(object,{...feature,params},[0,0,0])!;
  return {...transform,translation:transform.translation.map((v,i)=>v+before[i]-after[i]) as Vec3};
}

export function getWorldDrawingGeometry(object: CadObject, feature: CadFeature): WorldDrawingGeometry | null {
  if (feature.type !== "drawing") return null;
  const kind = String(feature.params.kind) as WorldDrawingGeometry["kind"];
  if (!["spline","ellipse","elliptic-arc","line", "polyline", "rectangle", "circle", "arc", "point", "infinite-line", "ray"].includes(kind)) return null;
  const plane = drawingWorkPlane(feature);
  const frame=drawingFrame(feature.params,plane);
  if(validSpline(feature.params)){const matrix=drawingTransformMatrix(object,feature),spline={...feature.params,controlPoints:feature.params.controlPoints.map(p=>new THREE.Vector3(...p).applyMatrix4(matrix).toArray() as Vec3)};return {objectId:object.id,kind:"spline",spline,workPlane:plane,points:sampleSpline(spline),closed:splineClosed(spline),uniformScale:false,planeAligned:spline.controlPoints.every(p=>Math.abs(p.reduce((sum,x,i)=>sum+(x-spline.controlPoints[0][i])*frame.normal[i],0))<1e-7)};}
  if(validEllipse(feature.params)){const source=feature.params,m=drawingTransformMatrix(object,feature),map=(p:Vec3)=>new THREE.Vector3(...p).applyMatrix4(m).toArray() as Vec3,center=map(source.center),axis=(a:Vec3)=>map(source.center.map((v,i)=>v+a[i]) as Vec3).map((v,i)=>v-center[i]) as Vec3,ellipse={center,axisU:axis(source.axisU),axisV:axis(source.axisV),startParam:source.startParam,sweep:source.sweep};if(!validEllipse(ellipse))throw Error("Ellipse transform collapses its plane.");const normal=new THREE.Vector3(...ellipse.axisU).cross(new THREE.Vector3(...ellipse.axisV)).normalize();return {objectId:object.id,kind,workPlane:plane,points:sampleEllipse(ellipse),center,ellipse,closed:ellipseClosed(ellipse),uniformScale:false,planeAligned:Math.abs(normal.dot(new THREE.Vector3(...frame.normal)))>1-1e-9};}
  const local = sampleDrawing(feature, frame);
  const transform = getObjectTransform(object, feature);
  const localPoints = local.points ?? [];
  const matrix = drawingTransformMatrix(object, feature);
  const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(...transform.rotation.map(THREE.MathUtils.degToRad) as [number, number, number]));
  const points = localPoints.map((point) => new THREE.Vector3(...point).applyMatrix4(matrix).toArray() as Vec3);
  const center = local.center ? new THREE.Vector3(...local.center).applyMatrix4(matrix).toArray() as Vec3 : undefined;
  const planeScale = feature.params.facePlaneId ? {uniform:transform.scale.every(v=>Math.abs(v-1)<1e-9),magnitude:1,orientation:1}:drawingPlaneScale(transform.scale, plane);
  const sourceNormal = new THREE.Vector3(...frame.normal).normalize();
  const transformedNormal = sourceNormal.clone().applyQuaternion(rotation).normalize();
  const planeAligned = Math.abs(Math.abs(transformedNormal.dot(sourceNormal)) - 1) < 1e-9;
  const orientation = planeScale.orientation * Math.sign(transformedNormal.dot(sourceNormal));
  const topology = feature.params.topology as { segments?: { id: string; index?: number }[] } | undefined;
  const exactProfileSegments = (["point","infinite-line","ray"].includes(kind) ? [] : profileSegments(kind, feature.params)).reduce<WorldProfileSegment[]>((result, segment) => {
    const start = new THREE.Vector3(...segment.start).applyMatrix4(matrix).toArray() as Vec3;
    const end = new THREE.Vector3(...segment.end).applyMatrix4(matrix).toArray() as Vec3;
    const reference = topology?.segments?.find((entry) => entry.index === segment.index)?.id ?? `segment:${segment.index}`;
    if (segment.kind === "line") {
      result.push({ topologyReference: reference, kind: "line", start, end });
      return result;
    }
    if (!planeAligned || !planeScale.uniform || !segment.center || segment.sweep === undefined) return result;
    const arcCenter = new THREE.Vector3(...segment.center).applyMatrix4(matrix).toArray() as Vec3;
    const center2 = worldToPlane(arcCenter, frame);
    const start2 = worldToPlane(start, frame);
    const startAngle = Math.atan2(start2[1] - center2[1], start2[0] - center2[0]);
    result.push({
      topologyReference: reference,
      kind: "arc" as const,
      start,
      end,
      center: arcCenter,
      radius: segment.radius! * planeScale.magnitude,
      startAngle,
      endAngle: startAngle + segment.sweep * orientation,
    });
    return result;
  }, []);
  const transformedArcStart = kind === "arc" && center && points[0]
    ? (() => { const c = worldToPlane(center, frame); const p = worldToPlane(points[0], frame); return Math.atan2(p[1] - c[1], p[0] - c[0]); })()
    : undefined;
  return {
    objectId: object.id,
    kind,
    workPlane: plane,
    points,
    center,
    radius: local.radius !== undefined && planeScale.uniform ? local.radius * planeScale.magnitude : undefined,
    startAngle: transformedArcStart,
    endAngle: transformedArcStart !== undefined && local.startAngle !== undefined && local.endAngle !== undefined
      ? transformedArcStart + (local.endAngle - local.startAngle) * orientation
      : undefined,
    closed: kind === "rectangle" || feature.params.closed === true,
    profileSegments: exactProfileSegments.length ? exactProfileSegments : undefined,
    uniformScale: planeScale.uniform,
    planeAligned,
  };
}
