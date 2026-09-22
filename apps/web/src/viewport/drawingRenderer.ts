import * as THREE from "three";
import { planeToWorld, WORK_PLANES, worldToPlane, type Vec3, type WorkPlaneId } from "../precision/workPlane";

export type DrawingRenderObject =
  | THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>
  | THREE.LineLoop<THREE.BufferGeometry, THREE.LineBasicMaterial>;

export function drawingRenderPoints(params: Record<string, unknown>, planeId: WorkPlaneId): Vec3[] {
  const kind = String(params.kind ?? "");
  if ((kind === "line" || kind === "polyline" || kind === "rectangle") && Array.isArray(params.points)) {
    const points = params.points as Vec3[];
    return kind === "rectangle" ? [...points, points[0]] : points;
  }
  if ((kind === "circle" || kind === "arc") && Array.isArray(params.center)) {
    const center = params.center as Vec3;
    const radius = Number(params.radius);
    const start = kind === "arc" ? Number(params.startAngle) : 0;
    const end = kind === "arc" ? Number(params.endAngle) : Math.PI * 2;
    const center2d = worldToPlane(center, WORK_PLANES[planeId]);
    const count = kind === "circle" ? 64 : Math.max(12, Math.ceil(Math.abs(end - start) / (Math.PI / 32)));
    return Array.from({ length: count + 1 }, (_, index) => {
      const angle = start + (end - start) * index / count;
      return planeToWorld([
        center2d[0] + Math.cos(angle) * radius,
        center2d[1] + Math.sin(angle) * radius,
      ], WORK_PLANES[planeId]);
    });
  }
  return [];
}

export function drawingRenderOrigin(params: Record<string, unknown>, planeId: WorkPlaneId): Vec3 {
  const points = drawingRenderPoints(params, planeId);
  if (!points.length) return [0, 0, 0];
  return new THREE.Box3()
    .setFromPoints(points.map((point) => new THREE.Vector3(...point)))
    .getCenter(new THREE.Vector3())
    .toArray() as Vec3;
}

export function createDrawingRenderObject(
  objectId: string,
  params: Record<string, unknown>,
  color = 0x4f8cff,
): DrawingRenderObject {
  const planeId = (params.workPlane === "XZ" || params.workPlane === "YZ" ? params.workPlane : "XY") as WorkPlaneId;
  const points = drawingRenderPoints(params, planeId);
  const origin = drawingRenderOrigin(params, planeId);
  const pivot = new THREE.Vector3(...origin);
  const geometry = new THREE.BufferGeometry().setFromPoints(
    points.map((point) => new THREE.Vector3(...point).sub(pivot)),
  );
  const material = new THREE.LineBasicMaterial({ color, linewidth: 1 });
  const renderObject = params.kind === "rectangle" || params.kind === "circle"
    ? new THREE.LineLoop(geometry, material)
    : new THREE.Line(geometry, material);
  renderObject.userData.cadObjectId = objectId;
  renderObject.userData.drawingOrigin = origin;
  return renderObject;
}
