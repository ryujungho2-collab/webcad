import { planeToWorld, worldToPlane, type Vec3, type WorkPlane } from "./workPlane";

export type SnapType = "intersection" | "endpoint" | "midpoint" | "center" | "perpendicular" | "tangent" | "nearest" | "grid";
export type SnapResult = { type: SnapType; point: Vec3; objectId?: string; topologyReference?: string; screenDistance: number; metadata?: Record<string, unknown> };
export type SnapEntity = { objectId: string; kind: "line" | "polyline" | "rectangle" | "circle" | "arc"; points?: Vec3[]; center?: Vec3; radius?: number; startAngle?: number; endAngle?: number };
export type SnapQuery = { point: Vec3; referencePoint?: Vec3; entities: SnapEntity[]; plane: WorkPlane; gridStep: number; tolerancePx: number; project: (point: Vec3) => [number, number]; enabled?: Partial<Record<SnapType, boolean>> };

const priorities: Record<SnapType, number> = { intersection: 0, endpoint: 1, midpoint: 2, center: 3, perpendicular: 4, tangent: 5, nearest: 6, grid: 7 };
const sq = (value: number) => value * value;
const dist2 = (a: [number, number], b: [number, number]) => sq(a[0] - b[0]) + sq(a[1] - b[1]);

function segments(entity: SnapEntity): [Vec3, Vec3, string][] {
  const points = entity.points ?? [];
  const result: [Vec3, Vec3, string][] = [];
  for (let index = 0; index < points.length - 1; index += 1) result.push([points[index], points[index + 1], `segment:${index}`]);
  if (entity.kind === "rectangle" && points.length > 2) result.push([points[points.length - 1], points[0], `segment:${points.length - 1}`]);
  return result;
}

function curveEndpoints(entity: SnapEntity, plane: WorkPlane): [Vec3, string][] {
  if (entity.kind !== "arc" || !entity.center || !entity.radius || entity.startAngle === undefined || entity.endAngle === undefined) return [];
  const center = worldToPlane(entity.center, plane);
  const pointAt = (angle: number): Vec3 => planeToWorld([center[0] + Math.cos(angle) * entity.radius!, center[1] + Math.sin(angle) * entity.radius!], plane);
  return [[pointAt(entity.startAngle), "curve:start"], [pointAt(entity.endAngle), "curve:end"]];
}

function angleOnSweep(angle: number, start: number, end: number) {
  const tau = Math.PI * 2;
  if (end >= start) {
    while (angle < start) angle += tau;
    return angle <= end;
  }
  while (angle > start) angle -= tau;
  return angle >= end;
}

function pointOnCurve(entity: SnapEntity, point: [number, number], plane: WorkPlane) {
  if (!entity.center || !entity.radius) return false;
  const center = worldToPlane(entity.center, plane);
  const radiusError = Math.abs(Math.hypot(point[0] - center[0], point[1] - center[1]) - entity.radius);
  if (radiusError > 1e-7) return false;
  if (entity.kind !== "arc" || entity.startAngle === undefined || entity.endAngle === undefined) return true;
  return angleOnSweep(Math.atan2(point[1] - center[1], point[0] - center[0]), entity.startAngle, entity.endAngle);
}

function segmentCircleIntersections(a: [number, number], b: [number, number], center: [number, number], radius: number) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const fx = a[0] - center[0], fy = a[1] - center[1];
  const aa = dx * dx + dy * dy;
  if (aa < 1e-12) return [];
  const bb = 2 * (fx * dx + fy * dy);
  const cc = fx * fx + fy * fy - radius * radius;
  const discriminant = bb * bb - 4 * aa * cc;
  if (discriminant < -1e-9) return [];
  const root = Math.sqrt(Math.max(0, discriminant));
  return [(-bb - root) / (2 * aa), (-bb + root) / (2 * aa)]
    .filter((value, index, values) => value >= 0 && value <= 1 && (index === 0 || Math.abs(value - values[0]) > 1e-9))
    .map((value) => [a[0] + dx * value, a[1] + dy * value] as [number, number]);
}

function circleCircleIntersections(aCenter: [number, number], aRadius: number, bCenter: [number, number], bRadius: number) {
  const dx = bCenter[0] - aCenter[0], dy = bCenter[1] - aCenter[1];
  const distance = Math.hypot(dx, dy);
  if (distance < 1e-9 || distance > aRadius + bRadius + 1e-9 || distance < Math.abs(aRadius - bRadius) - 1e-9) return [];
  const along = (aRadius * aRadius - bRadius * bRadius + distance * distance) / (2 * distance);
  const height = Math.sqrt(Math.max(0, aRadius * aRadius - along * along));
  const base: [number, number] = [aCenter[0] + dx * along / distance, aCenter[1] + dy * along / distance];
  const offset: [number, number] = [-dy * height / distance, dx * height / distance];
  const first: [number, number] = [base[0] + offset[0], base[1] + offset[1]];
  if (height < 1e-9) return [first];
  return [first, [base[0] - offset[0], base[1] - offset[1]] as [number, number]];
}

function perpendicularPoint(reference: [number, number], a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const length2 = dx * dx + dy * dy;
  if (length2 < 1e-12) return null;
  const t = ((reference[0] - a[0]) * dx + (reference[1] - a[1]) * dy) / length2;
  if (t < 0 || t > 1) return null;
  return [a[0] + dx * t, a[1] + dy * t] as [number, number];
}

function circleTangents(reference: [number, number], center: [number, number], radius: number) {
  const dx = reference[0] - center[0], dy = reference[1] - center[1];
  const distance2 = dx * dx + dy * dy;
  if (distance2 <= radius * radius + 1e-9) return [];
  const scale = radius * radius / distance2;
  const offset = radius * Math.sqrt(Math.max(0, distance2 - radius * radius)) / distance2;
  const base: [number, number] = [center[0] + dx * scale, center[1] + dy * scale];
  return [
    [base[0] - dy * offset, base[1] + dx * offset],
    [base[0] + dy * offset, base[1] - dx * offset],
  ] as [number, number][];
}

function segmentIntersection(a0: [number, number], a1: [number, number], b0: [number, number], b1: [number, number]) {
  const d = (a1[0] - a0[0]) * (b1[1] - b0[1]) - (a1[1] - a0[1]) * (b1[0] - b0[0]);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((b0[0] - a0[0]) * (b1[1] - b0[1]) - (b0[1] - a0[1]) * (b1[0] - b0[0])) / d;
  const u = ((b0[0] - a0[0]) * (a1[1] - a0[1]) - (b0[1] - a0[1]) * (a1[0] - a0[0])) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a0[0] + t * (a1[0] - a0[0]), a0[1] + t * (a1[1] - a0[1])] as [number, number] : null;
}

export function querySnap(query: SnapQuery): SnapResult {
  const pointerScreen = query.project(query.point);
  const candidates: Omit<SnapResult, "screenDistance">[] = [];
  const enabled = (type: SnapType) => query.enabled?.[type] !== false;
  const add = (type: SnapType, point: Vec3, objectId?: string, topologyReference?: string, metadata?: Record<string, unknown>) => { if (enabled(type)) candidates.push({ type, point, objectId, topologyReference, metadata }); };
  const nearby = query.entities.filter((entity) => {
    const points = [...(entity.points ?? [])];
    if (entity.center && entity.radius) {
      const center = worldToPlane(entity.center, query.plane);
      points.push(
        planeToWorld([center[0] - entity.radius, center[1] - entity.radius], query.plane),
        planeToWorld([center[0] + entity.radius, center[1] + entity.radius], query.plane),
      );
    }
    if (!points.length) return false;
    const projected = points.map(query.project);
    const minX = Math.min(...projected.map((point) => point[0])) - query.tolerancePx;
    const maxX = Math.max(...projected.map((point) => point[0])) + query.tolerancePx;
    const minY = Math.min(...projected.map((point) => point[1])) - query.tolerancePx;
    const maxY = Math.max(...projected.map((point) => point[1])) + query.tolerancePx;
    return pointerScreen[0] >= minX && pointerScreen[0] <= maxX && pointerScreen[1] >= minY && pointerScreen[1] <= maxY;
  });
  for (const entity of nearby) {
    for (const [point, reference] of curveEndpoints(entity, query.plane)) add("endpoint", point, entity.objectId, reference);
    for (const [a, b, reference] of segments(entity)) {
      add("endpoint", a, entity.objectId, `${reference}:start`); add("endpoint", b, entity.objectId, `${reference}:end`);
      add("midpoint", [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], entity.objectId, `${reference}:midpoint`);
      const p = worldToPlane(query.point, query.plane), pa = worldToPlane(a, query.plane), pb = worldToPlane(b, query.plane);
      const dx = pb[0] - pa[0], dy = pb[1] - pa[1], length2 = dx * dx + dy * dy;
      const t = length2 ? Math.max(0, Math.min(1, ((p[0] - pa[0]) * dx + (p[1] - pa[1]) * dy) / length2)) : 0;
      add("nearest", planeToWorld([pa[0] + dx * t, pa[1] + dy * t], query.plane), entity.objectId, reference);
      if (query.referencePoint) {
        const referencePlane = worldToPlane(query.referencePoint, query.plane);
        const perpendicular = perpendicularPoint(referencePlane, pa, pb);
        if (perpendicular) add("perpendicular", planeToWorld(perpendicular, query.plane), entity.objectId, `${reference}:perpendicular`);
      }
    }
    if (entity.center && entity.radius) {
      add("center", entity.center, entity.objectId, "center");
      const p = worldToPlane(query.point, query.plane), c = worldToPlane(entity.center, query.plane);
      const angle = Math.atan2(p[1] - c[1], p[0] - c[0]);
      const radial = planeToWorld([c[0] + Math.cos(angle) * entity.radius, c[1] + Math.sin(angle) * entity.radius], query.plane);
      if (entity.kind !== "arc" || entity.startAngle === undefined || entity.endAngle === undefined || angleOnSweep(angle, entity.startAngle, entity.endAngle)) {
        add("nearest", radial, entity.objectId, "curve");
      } else {
        for (const [endpoint, reference] of curveEndpoints(entity, query.plane)) add("nearest", endpoint, entity.objectId, reference);
      }
      if (query.referencePoint) {
        const referencePlane = worldToPlane(query.referencePoint, query.plane);
        const tangentPoints = circleTangents(referencePlane, c, entity.radius);
        for (const tangent of tangentPoints) {
          if (pointOnCurve(entity, tangent, query.plane)) add("tangent", planeToWorld(tangent, query.plane), entity.objectId, "curve:tangent");
        }
      }
    }
  }
  if (enabled("intersection")) {
    const all = nearby.flatMap((entity) => segments(entity).map((segment) => ({ entity, segment })));
    for (let i = 0; i < all.length; i += 1) for (let j = i + 1; j < all.length; j += 1) {
      if (all[i].entity.objectId === all[j].entity.objectId) continue;
      const hit = segmentIntersection(worldToPlane(all[i].segment[0], query.plane), worldToPlane(all[i].segment[1], query.plane), worldToPlane(all[j].segment[0], query.plane), worldToPlane(all[j].segment[1], query.plane));
      if (hit) add("intersection", planeToWorld(hit, query.plane), all[i].entity.objectId, `${all[i].segment[2]}|${all[j].segment[2]}`, { otherObjectId: all[j].entity.objectId });
    }
    const curves = nearby.filter((entity) => entity.center && entity.radius && (entity.kind === "circle" || entity.kind === "arc"));
    for (const lineEntity of nearby) for (const segment of segments(lineEntity)) for (const curve of curves) {
      if (lineEntity.objectId === curve.objectId) continue;
      const a = worldToPlane(segment[0], query.plane), b = worldToPlane(segment[1], query.plane), center = worldToPlane(curve.center!, query.plane);
      for (const hit of segmentCircleIntersections(a, b, center, curve.radius!)) {
        if (pointOnCurve(curve, hit, query.plane)) add("intersection", planeToWorld(hit, query.plane), lineEntity.objectId, `${segment[2]}|curve`, { otherObjectId: curve.objectId });
      }
    }
    for (let i = 0; i < curves.length; i += 1) for (let j = i + 1; j < curves.length; j += 1) {
      const aCenter = worldToPlane(curves[i].center!, query.plane), bCenter = worldToPlane(curves[j].center!, query.plane);
      for (const hit of circleCircleIntersections(aCenter, curves[i].radius!, bCenter, curves[j].radius!)) {
        if (pointOnCurve(curves[i], hit, query.plane) && pointOnCurve(curves[j], hit, query.plane)) add("intersection", planeToWorld(hit, query.plane), curves[i].objectId, "curve|curve", { otherObjectId: curves[j].objectId });
      }
    }
  }
  const planePoint = worldToPlane(query.point, query.plane);
  add("grid", planeToWorld([Math.round(planePoint[0] / query.gridStep) * query.gridStep, Math.round(planePoint[1] / query.gridStep) * query.gridStep], query.plane));
  const ranked = candidates.map((candidate) => ({ ...candidate, screenDistance: Math.sqrt(dist2(query.project(candidate.point), pointerScreen)) })).filter((candidate) => candidate.screenDistance <= query.tolerancePx).sort((a, b) => priorities[a.type] - priorities[b.type] || a.screenDistance - b.screenDistance);
  return ranked[0] ?? { type: "nearest", point: query.point, screenDistance: Infinity };
}
