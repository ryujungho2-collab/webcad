import { WORK_PLANES, worldToPlane, type Vec3, type WorkPlaneId } from "./workPlane";

export type DrawingMeasurements = {
  distance?: number;
  angle?: number;
  radius?: number;
  diameter?: number;
  area?: number;
};

export function measureDrawing(params: Record<string, unknown>): DrawingMeasurements {
  const kind = String(params.kind ?? "");
  const planeId = (params.workPlane === "XZ" || params.workPlane === "YZ" ? params.workPlane : "XY") as WorkPlaneId;
  const plane = WORK_PLANES[planeId];
  if ((kind === "line" || kind === "polyline" || kind === "rectangle") && Array.isArray(params.points)) {
    const points = params.points as Vec3[];
    let distance = 0;
    for (let index = 1; index < points.length; index += 1) {
      const a = worldToPlane(points[index - 1], plane), b = worldToPlane(points[index], plane);
      distance += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    const result: DrawingMeasurements = { distance };
    if (points.length >= 2) {
      const a = worldToPlane(points[0], plane), b = worldToPlane(points[1], plane);
      result.angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
    }
    if (kind === "rectangle" && points.length === 4) {
      const projected = points.map((point) => worldToPlane(point, plane));
      result.area = Math.abs(projected.reduce((sum, point, index) => {
        const next = projected[(index + 1) % projected.length];
        return sum + point[0] * next[1] - next[0] * point[1];
      }, 0)) / 2;
    }
    return result;
  }
  if ((kind === "circle" || kind === "arc") && typeof params.radius === "number") {
    const result: DrawingMeasurements = { radius: params.radius, diameter: params.radius * 2 };
    if (kind === "circle") result.area = Math.PI * params.radius * params.radius;
    if (kind === "arc" && typeof params.startAngle === "number" && typeof params.endAngle === "number") {
      result.angle = params.endAngle - params.startAngle;
      result.distance = Math.abs(result.angle) * params.radius;
    }
    return result;
  }
  return {};
}
