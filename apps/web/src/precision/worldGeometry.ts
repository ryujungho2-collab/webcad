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
};

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
  const uniformScale = Math.abs(Math.abs(transform.scale[0]) - Math.abs(transform.scale[1])) < 1e-9 && Math.abs(Math.abs(transform.scale[1]) - Math.abs(transform.scale[2])) < 1e-9;
  return { objectId: object.id, kind, workPlane: plane, points, center, radius: local.radius !== undefined && uniformScale ? local.radius * Math.abs(transform.scale[0]) : undefined, startAngle: local.startAngle, endAngle: local.endAngle, uniformScale };
}
