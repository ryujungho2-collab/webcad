import type { Vec3, WorkPlaneId } from "./workPlane";

export type ProfileSegment = {
  index: number;
  kind: "line" | "arc";
  start: Vec3;
  end: Vec3;
  bulge: number;
  center?: Vec3;
  radius?: number;
  startAngle?: number;
  sweep?: number;
};

const EPSILON = 1e-9;

function toPlane(point: Vec3, plane: WorkPlaneId): [number, number] {
  if (plane === "XZ") return [point[0], point[2]];
  if (plane === "YZ") return [point[1], point[2]];
  return [point[0], point[1]];
}

function fromPlane(point: [number, number], elevation: number, plane: WorkPlaneId): Vec3 {
  if (plane === "XZ") return [point[0], elevation, point[1]];
  if (plane === "YZ") return [elevation, point[0], point[1]];
  return [point[0], point[1], elevation];
}

export function profileIsClosed(kind: string, params: Record<string, unknown>) {
  return kind === "rectangle" || params.closed === true;
}

export function profileSegmentCount(kind: string, params: Record<string, unknown>) {
  if (!Array.isArray(params.points)) return 0;
  return Math.max(0, params.points.length - 1 + (profileIsClosed(kind, params) ? 1 : 0));
}

export function profileBulges(kind: string, params: Record<string, unknown>) {
  const count = profileSegmentCount(kind, params);
  const source = Array.isArray(params.bulges) ? params.bulges : [];
  return Array.from({ length: count }, (_, index) => {
    const value = Number(source[index] ?? 0);
    return Number.isFinite(value) && Math.abs(value) > EPSILON ? value : 0;
  });
}

export function profileSegments(kind: string, params: Record<string, unknown>): ProfileSegment[] {
  if (!Array.isArray(params.points)) return [];
  const points = params.points as Vec3[];
  const count = profileSegmentCount(kind, params);
  const bulges = profileBulges(kind, params);
  const plane = (params.workPlane === "XZ" || params.workPlane === "YZ" ? params.workPlane : "XY") as WorkPlaneId;
  return Array.from({ length: count }, (_, index) => {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    const bulge = bulges[index];
    if (Math.abs(bulge) <= EPSILON) return { index, kind: "line" as const, start, end, bulge: 0 };
    const a = toPlane(start, plane);
    const b = toPlane(end, plane);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const chord = Math.hypot(dx, dy);
    if (chord <= EPSILON) return { index, kind: "line" as const, start, end, bulge: 0 };
    const centerDistance = chord * (1 - bulge * bulge) / (4 * bulge);
    const midpoint: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const center2: [number, number] = [
      midpoint[0] - dy / chord * centerDistance,
      midpoint[1] + dx / chord * centerDistance,
    ];
    const elevation = plane === "XZ" ? start[1] : plane === "YZ" ? start[0] : start[2];
    const center = fromPlane(center2, elevation, plane);
    return {
      index,
      kind: "arc" as const,
      start,
      end,
      bulge,
      center,
      radius: Math.hypot(a[0] - center2[0], a[1] - center2[1]),
      startAngle: Math.atan2(a[1] - center2[1], a[0] - center2[0]),
      sweep: 4 * Math.atan(bulge),
    };
  });
}

export function sampleProfile(kind: string, params: Record<string, unknown>, maximumAngle = Math.PI / 32): Vec3[] {
  const segments = profileSegments(kind, params);
  if (!segments.length) return [];
  const points: Vec3[] = [[...segments[0].start]];
  for (const segment of segments) points.push(...sampleProfileSegment(segment, params, maximumAngle).slice(1));
  if (profileIsClosed(kind, params) && points.length > 1) points.pop();
  return points;
}

export function sampleProfileSegment(segment: ProfileSegment, params: Record<string, unknown>, maximumAngle = Math.PI / 32): Vec3[] {
  const plane = (params.workPlane === "XZ" || params.workPlane === "YZ" ? params.workPlane : "XY") as WorkPlaneId;
  if (segment.kind === "line" || !segment.center || !segment.radius || segment.startAngle === undefined || segment.sweep === undefined) {
    return [[...segment.start], [...segment.end]];
  }
  const center = toPlane(segment.center, plane);
  const elevation = plane === "XZ" ? segment.start[1] : plane === "YZ" ? segment.start[0] : segment.start[2];
  const count = Math.max(2, Math.ceil(Math.abs(segment.sweep) / maximumAngle));
  return Array.from({ length: count + 1 }, (_, step) => {
    const angle = segment.startAngle! + segment.sweep! * step / count;
    return fromPlane([
      center[0] + Math.cos(angle) * segment.radius!,
      center[1] + Math.sin(angle) * segment.radius!,
    ], elevation, plane);
  });
}
