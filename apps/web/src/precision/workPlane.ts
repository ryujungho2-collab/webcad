export type Vec3 = [number, number, number];
export type WorkPlaneId = "XY" | "XZ" | "YZ";

export type WorkPlane = { id: WorkPlaneId; origin: Vec3; xAxis: Vec3; yAxis: Vec3; normal: Vec3 };

export const WORK_PLANES: Record<WorkPlaneId, WorkPlane> = {
  XY: { id: "XY", origin: [0, 0, 0], xAxis: [1, 0, 0], yAxis: [0, 1, 0], normal: [0, 0, 1] },
  XZ: { id: "XZ", origin: [0, 0, 0], xAxis: [1, 0, 0], yAxis: [0, 0, 1], normal: [0, -1, 0] },
  YZ: { id: "YZ", origin: [0, 0, 0], xAxis: [0, 1, 0], yAxis: [0, 0, 1], normal: [1, 0, 0] },
};

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function intersectRayWithWorkPlane(origin: Vec3, direction: Vec3, plane: WorkPlane): Vec3 | null {
  const denominator = dot(direction, plane.normal);
  if (Math.abs(denominator) < 1e-9) return null;
  const delta: Vec3 = [plane.origin[0] - origin[0], plane.origin[1] - origin[1], plane.origin[2] - origin[2]];
  const distance = dot(delta, plane.normal) / denominator;
  if (distance < 0) return null;
  return [origin[0] + direction[0] * distance, origin[1] + direction[1] * distance, origin[2] + direction[2] * distance];
}

export function worldToPlane(point: Vec3, plane: WorkPlane): [number, number] {
  const delta: Vec3 = [point[0] - plane.origin[0], point[1] - plane.origin[1], point[2] - plane.origin[2]];
  return [dot(delta, plane.xAxis), dot(delta, plane.yAxis)];
}

export function planeToWorld(point: [number, number], plane: WorkPlane): Vec3 {
  return [plane.origin[0] + plane.xAxis[0] * point[0] + plane.yAxis[0] * point[1], plane.origin[1] + plane.xAxis[1] * point[0] + plane.yAxis[1] * point[1], plane.origin[2] + plane.xAxis[2] * point[0] + plane.yAxis[2] * point[1]];
}
