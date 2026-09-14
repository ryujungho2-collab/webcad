import { planeToWorld, worldToPlane, type Vec3, type WorkPlane } from "./workPlane";

export type SnapType = "intersection" | "endpoint" | "midpoint" | "center" | "nearest" | "grid";
export type SnapResult = { type: SnapType; point: Vec3; objectId?: string; topologyReference?: string; screenDistance: number; metadata?: Record<string, unknown> };
export type SnapEntity = { objectId: string; kind: "line" | "polyline" | "rectangle" | "circle" | "arc"; points?: Vec3[]; center?: Vec3; radius?: number; startAngle?: number; endAngle?: number };
export type SnapQuery = { point: Vec3; entities: SnapEntity[]; plane: WorkPlane; gridStep: number; tolerancePx: number; project: (point: Vec3) => [number, number]; enabled?: Partial<Record<SnapType, boolean>> };

const priorities: Record<SnapType, number> = { intersection: 0, endpoint: 1, midpoint: 2, center: 3, nearest: 4, grid: 5 };
const sq = (value: number) => value * value;
const dist2 = (a: [number, number], b: [number, number]) => sq(a[0] - b[0]) + sq(a[1] - b[1]);

function segments(entity: SnapEntity): [Vec3, Vec3, string][] {
  const points = entity.points ?? [];
  const result: [Vec3, Vec3, string][] = [];
  for (let index = 0; index < points.length - 1; index += 1) result.push([points[index], points[index + 1], `segment:${index}`]);
  if (entity.kind === "rectangle" && points.length > 2) result.push([points[points.length - 1], points[0], `segment:${points.length - 1}`]);
  return result;
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
  const add = (type: SnapType, point: Vec3, objectId?: string, topologyReference?: string) => { if (enabled(type)) candidates.push({ type, point, objectId, topologyReference }); };
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
    for (const [a, b, reference] of segments(entity)) {
      add("endpoint", a, entity.objectId, `${reference}:start`); add("endpoint", b, entity.objectId, `${reference}:end`);
      add("midpoint", [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], entity.objectId, `${reference}:midpoint`);
      const p = worldToPlane(query.point, query.plane), pa = worldToPlane(a, query.plane), pb = worldToPlane(b, query.plane);
      const dx = pb[0] - pa[0], dy = pb[1] - pa[1], length2 = dx * dx + dy * dy;
      const t = length2 ? Math.max(0, Math.min(1, ((p[0] - pa[0]) * dx + (p[1] - pa[1]) * dy) / length2)) : 0;
      add("nearest", planeToWorld([pa[0] + dx * t, pa[1] + dy * t], query.plane), entity.objectId, reference);
    }
    if (entity.center && entity.radius) {
      add("center", entity.center, entity.objectId, "center");
      const p = worldToPlane(query.point, query.plane), c = worldToPlane(entity.center, query.plane);
      const angle = Math.atan2(p[1] - c[1], p[0] - c[0]);
      add("nearest", planeToWorld([c[0] + Math.cos(angle) * entity.radius, c[1] + Math.sin(angle) * entity.radius], query.plane), entity.objectId, "curve");
    }
  }
  if (enabled("intersection")) {
    const all = nearby.flatMap((entity) => segments(entity).map((segment) => ({ entity, segment })));
    for (let i = 0; i < all.length; i += 1) for (let j = i + 1; j < all.length; j += 1) {
      if (all[i].entity.objectId === all[j].entity.objectId) continue;
      const hit = segmentIntersection(worldToPlane(all[i].segment[0], query.plane), worldToPlane(all[i].segment[1], query.plane), worldToPlane(all[j].segment[0], query.plane), worldToPlane(all[j].segment[1], query.plane));
      if (hit) add("intersection", planeToWorld(hit, query.plane), all[i].entity.objectId, `${all[i].segment[2]}|${all[j].segment[2]}`);
    }
  }
  const planePoint = worldToPlane(query.point, query.plane);
  add("grid", planeToWorld([Math.round(planePoint[0] / query.gridStep) * query.gridStep, Math.round(planePoint[1] / query.gridStep) * query.gridStep], query.plane));
  const ranked = candidates.map((candidate) => ({ ...candidate, screenDistance: Math.sqrt(dist2(query.project(candidate.point), pointerScreen)) })).filter((candidate) => candidate.screenDistance <= query.tolerancePx).sort((a, b) => priorities[a.type] - priorities[b.type] || a.screenDistance - b.screenDistance);
  return ranked[0] ?? { type: "nearest", point: query.point, screenDistance: Infinity };
}
