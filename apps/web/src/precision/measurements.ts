import { WORK_PLANES, worldToPlane, type Vec3, type WorkPlaneId } from "./workPlane";

export type DrawingMeasurements = {
  distance?: number;
  angle?: number;
  radius?: number;
  diameter?: number;
  area?: number;
};

export type PointMeasurement = { distance: number; angle: number };
type MeasurableProfileSegment = { kind: "line" | "arc"; start: Vec3; end: Vec3; radius?: number; startAngle?: number; endAngle?: number };

export function measurePoints(a: Vec3, b: Vec3, planeId: WorkPlaneId = "XY"): PointMeasurement {
  const plane = WORK_PLANES[planeId];
  const first = worldToPlane(a, plane), second = worldToPlane(b, plane);
  return {
    distance: Math.hypot(second[0] - first[0], second[1] - first[1]),
    angle: Math.atan2(second[1] - first[1], second[0] - first[0]),
  };
}

export function measureDrawing(params: Record<string, unknown>): DrawingMeasurements {
  const kind = String(params.kind ?? "");
  const planeId = (params.workPlane === "XZ" || params.workPlane === "YZ" ? params.workPlane : "XY") as WorkPlaneId;
  const plane = WORK_PLANES[planeId];
  if ((kind === "line" || kind === "polyline" || kind === "rectangle") && Array.isArray(params.points)) {
    const points = params.points as Vec3[];
    const exactSegments = Array.isArray(params.profileSegments) ? params.profileSegments as MeasurableProfileSegment[] : null;
    let distance = 0;
    if (exactSegments?.length) {
      distance = exactSegments.reduce((sum, segment) => segment.kind === "arc" && segment.radius !== undefined && segment.startAngle !== undefined && segment.endAngle !== undefined
        ? sum + Math.abs(segment.endAngle - segment.startAngle) * segment.radius
        : sum + measurePoints(segment.start, segment.end, planeId).distance, 0);
    } else for (let index = 1; index < points.length; index += 1) {
      const a = worldToPlane(points[index - 1], plane), b = worldToPlane(points[index], plane);
      distance += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    if (!exactSegments?.length && kind === "rectangle" && points.length === 4) {
      const a = worldToPlane(points[points.length - 1], plane), b = worldToPlane(points[0], plane);
      distance += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    const closed = kind === "rectangle" || params.closed === true || (kind === "polyline" && points.length >= 3 && points[0].every((value, index) => Math.abs(value - points[points.length - 1][index]) < 1e-7));
    if (!exactSegments?.length && closed && kind === "polyline" && points.length > 1 && !points[0].every((value, index) => Math.abs(value - points[points.length - 1][index]) < 1e-7)) {
      const a = worldToPlane(points[points.length - 1], plane), b = worldToPlane(points[0], plane);
      distance += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    const result: DrawingMeasurements = { distance };
    if (points.length >= 2) {
      const a = worldToPlane(points[0], plane), b = worldToPlane(points[1], plane);
      result.angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
    }
    if (closed && (kind === "rectangle" || kind === "polyline") && points.length >= 3) {
      const projected = (exactSegments?.length ? exactSegments.map((segment) => segment.start) : points).map((point) => worldToPlane(point, plane));
      let signed = projected.reduce((sum, point, index) => {
        const next = projected[(index + 1) % projected.length];
        return sum + point[0] * next[1] - next[0] * point[1];
      }, 0) / 2;
      if (exactSegments?.length) signed += exactSegments.reduce((sum, segment) => {
        if (segment.kind !== "arc" || segment.radius === undefined || segment.startAngle === undefined || segment.endAngle === undefined) return sum;
        const sweep = segment.endAngle - segment.startAngle;
        return sum + segment.radius * segment.radius * (sweep - Math.sin(sweep)) / 2;
      }, 0);
      result.area = Math.abs(signed);
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
