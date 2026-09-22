import * as THREE from "three";
import type { CadFeature, CadObject } from "@agent-webcad/cad-document";
import { getObjectTransform } from "../state/objectTransform";
import { planeToWorld, worldToPlane, WORK_PLANES, type Vec3, type WorkPlaneId } from "./workPlane";

export type WorldDrawingGeometry = {
  objectId: string;
  kind: "line" | "polyline" | "rectangle" | "circle" | "arc";
  workPlane: WorkPlaneId;
  points?: Vec3[];
  center?: Vec3;
  radius?: number;
  startAngle?: number;
  endAngle?: number;
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

function sampleDrawing(feature: CadFeature, plane: WorkPlaneId): { points?: Vec3[]; center?: Vec3; radius?: number; startAngle?: number; endAngle?: number } {
  const params = feature.params as Record<string, unknown>;
  const kind = String(params.kind);
  if ((kind === "line" || kind === "polyline" || kind === "rectangle") && Array.isArray(params.points)) return { points: params.points as Vec3[] };
  if (!Array.isArray(params.center) || !(Number(params.radius) > 0)) return {};
  const center = params.center as Vec3;
  const radius = Number(params.radius);
  const start = kind === "arc" ? Number(params.startAngle) : 0;
  const end = kind === "arc" ? Number(params.endAngle) : Math.PI * 2;
  const workPlane = WORK_PLANES[plane];
  const c = worldToPlane(center, workPlane);
  const count = kind === "circle" ? 96 : Math.max(24, Math.ceil(Math.abs(end - start) / (Math.PI / 48)));
  const points = Array.from({ length: count + 1 }, (_, index) => {
    const angle = start + (end - start) * index / count;
    return planeToWorld([c[0] + Math.cos(angle) * radius, c[1] + Math.sin(angle) * radius], workPlane);
  });
  return { points, center, radius, startAngle: kind === "arc" ? start : undefined, endAngle: kind === "arc" ? end : undefined };
}

export function getWorldDrawingGeometry(object: CadObject, feature: CadFeature): WorldDrawingGeometry | null {
  if (feature.type !== "drawing") return null;
  const kind = String(feature.params.kind) as WorldDrawingGeometry["kind"];
  if (!["line", "polyline", "rectangle", "circle", "arc"].includes(kind)) return null;
  const plane = (feature.params.workPlane === "XZ" || feature.params.workPlane === "YZ" ? feature.params.workPlane : "XY") as WorkPlaneId;
  const local = sampleDrawing(feature, plane);
  const transform = getObjectTransform(object, feature);
  const localPoints = local.points ?? [];
  const origin = localPoints.length ? new THREE.Box3().setFromPoints(localPoints.map((point) => new THREE.Vector3(...point))).getCenter(new THREE.Vector3()) : new THREE.Vector3();
  const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(...transform.rotation.map(THREE.MathUtils.degToRad) as [number, number, number]));
  const matrix = new THREE.Matrix4().compose(origin.clone().add(new THREE.Vector3(...transform.translation)), rotation, new THREE.Vector3(...transform.scale)).multiply(new THREE.Matrix4().makeTranslation(-origin.x, -origin.y, -origin.z));
  const points = localPoints.map((point) => new THREE.Vector3(...point).applyMatrix4(matrix).toArray() as Vec3);
  const center = local.center ? new THREE.Vector3(...local.center).applyMatrix4(matrix).toArray() as Vec3 : undefined;
  const planeScale = drawingPlaneScale(transform.scale, plane);
  const sourceNormal = new THREE.Vector3(...WORK_PLANES[plane].normal).normalize();
  const transformedNormal = sourceNormal.clone().applyQuaternion(rotation).normalize();
  const planeAligned = Math.abs(Math.abs(transformedNormal.dot(sourceNormal)) - 1) < 1e-9;
  return {
    objectId: object.id,
    kind,
    workPlane: plane,
    points,
    center,
    radius: local.radius !== undefined && planeScale.uniform ? local.radius * planeScale.magnitude : undefined,
    startAngle: local.startAngle,
    endAngle: local.endAngle,
    uniformScale: planeScale.uniform,
    planeAligned,
  };
}
