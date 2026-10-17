import {splinePoint} from "./splineGeometry";
import type {CadEllipse} from "@agent-webcad/cad-document";
import {ellipseContains,ellipseClosed,ellipsePoint,ellipseNearest} from "./ellipseGeometry";
import { linearToleranceAt } from "@agent-webcad/cad-document";
import { planeToWorld, worldToPlane, type Vec3, type WorkPlane } from "./workPlane";
import { intersectLinear, linearCircleBranches, type LinearDomain } from "./constructionGeometry";
import { circularIntersections, pointOnCircularDomain } from "./circularIntersection";

export type SnapType = "intersection" | "endpoint" | "midpoint" | "center" | "quadrant" | "perpendicular" | "tangent" | "extension" | "nearest" | "grid";
export type SnapResult = { type: SnapType; point: Vec3; objectId?: string; topologyReference?: string; screenDistance: number; metadata?: Record<string, unknown> };
export type SnapProfileSegment = { topologyReference: string; kind: "line" | "arc"; start: Vec3; end: Vec3; center?: Vec3; radius?: number; startAngle?: number; endAngle?: number };
export type SnapEntity = { objectId: string; spline?:import("@agent-webcad/cad-document").CadSpline;ellipse?:CadEllipse;kind: "spline" | "ellipse" | "elliptic-arc" | "line" | "polyline" | "rectangle" | "circle" | "arc" | "point" | "infinite-line" | "ray"; points?: Vec3[]; center?: Vec3; radius?: number; startAngle?: number; endAngle?: number; profileSegments?: SnapProfileSegment[] };
export type SnapQuery = { point: Vec3; referencePoint?: Vec3; entities: SnapEntity[]; plane: WorkPlane; gridStep: number; tolerancePx: number; project: (point: Vec3) => [number, number]; enabled?: Partial<Record<SnapType, boolean>> };

const priorities: Record<SnapType, number> = { intersection: 0, endpoint: 1, midpoint: 2, center: 3, quadrant: 4, perpendicular: 5, tangent: 6, extension: 7, nearest: 8, grid: 9 };
const sq = (value: number) => value * value;
const dist2 = (a: [number, number], b: [number, number]) => sq(a[0] - b[0]) + sq(a[1] - b[1]);

function segments(entity: SnapEntity): [Vec3, Vec3, string][] {
  if(entity.kind==="spline"||entity.ellipse||["ellipse","elliptic-arc"].includes(entity.kind))return [];
  if (entity.profileSegments) return entity.profileSegments
    .filter((segment) => segment.kind === "line")
    .map((segment) => [segment.start, segment.end, segment.topologyReference]);
  const points = entity.points ?? [];
  const result: [Vec3, Vec3, string][] = [];
  for (let index = 0; index < points.length - 1; index += 1) result.push([points[index], points[index + 1], `segment:${index}`]);
  if (entity.kind === "rectangle" && points.length > 2) result.push([points[points.length - 1], points[0], `segment:${points.length - 1}`]);
  return result;
}

type SnapCurve = { center: Vec3; radius: number; startAngle?: number; endAngle?: number; reference: string };

function curves(entity: SnapEntity): SnapCurve[] {
  const result: SnapCurve[] = [];
  for (const segment of entity.profileSegments ?? []) {
    if (segment.kind === "arc" && segment.center && segment.radius !== undefined && segment.startAngle !== undefined && segment.endAngle !== undefined) {
      result.push({ center: segment.center, radius: segment.radius, startAngle: segment.startAngle, endAngle: segment.endAngle, reference: segment.topologyReference });
    }
  }
  if (entity.center && entity.radius) result.push({ center: entity.center, radius: entity.radius, startAngle: entity.startAngle, endAngle: entity.endAngle, reference: "curve" });
  return result;
}

function curveEndpoints(entity: SnapEntity, plane: WorkPlane): [Vec3, string][] {
  return curves(entity).flatMap((curve) => {
    if (curve.startAngle === undefined || curve.endAngle === undefined) return [];
    const center = worldToPlane(curve.center, plane);
    const pointAt = (angle: number): Vec3 => planeToWorld([center[0] + Math.cos(angle) * curve.radius, center[1] + Math.sin(angle) * curve.radius], plane);
    return [[pointAt(curve.startAngle), `${curve.reference}:start`], [pointAt(curve.endAngle), `${curve.reference}:end`]] as [Vec3, string][];
  });
}

export function angleOnSweep(angle: number, start: number, end: number) {
  const tau = Math.PI * 2;
  if (end >= start) {
    while (angle < start) angle += tau;
    return angle <= end;
  }
  while (angle > start) angle -= tau;
  return angle >= end;
}

function pointOnCurve(curve: SnapCurve, point: [number, number], plane: WorkPlane) {
  const center = worldToPlane(curve.center, plane);
  const radiusError = Math.abs(Math.hypot(point[0] - center[0], point[1] - center[1]) - curve.radius);
  if (radiusError > linearToleranceAt(...point, ...center, curve.radius)) return false;
  return pointOnCircularDomain(point, center, curve.radius, curve.startAngle, curve.endAngle);
}

// Construction keeps signed branches; snapping keeps each physical position once.
function uniqueIntersectionPoints(points: [number, number][], tolerance: number) {
  return points.filter((point, index) => point.every(Number.isFinite) && !points.slice(0, index).some(previous => Math.hypot(point[0] - previous[0], point[1] - previous[1]) <= tolerance));
}

function linearCircleIntersections(a: [number, number], b: [number, number], center: [number, number], radius: number, domain: LinearDomain) {
  if (![...a, ...b, ...center, radius].every(Number.isFinite) || radius <= 0) return [];
  const tolerance = linearToleranceAt(...a, ...b, ...center, radius);
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (!Number.isFinite(length) || length <= tolerance) return [];
  return uniqueIntersectionPoints(linearCircleBranches(a, b, center, radius, domain).map(branch => branch.point), tolerance);
}

export function segmentCircleIntersections(a: [number, number], b: [number, number], center: [number, number], radius: number) {
  return linearCircleIntersections(a, b, center, radius, "line");
}

export function circleCircleIntersections(aCenter: [number, number], aRadius: number, bCenter: [number, number], bRadius: number) {
  if (![...aCenter, ...bCenter, aRadius, bRadius].every(Number.isFinite) || aRadius <= 0 || bRadius <= 0 || !Number.isFinite(Math.hypot(bCenter[0] - aCenter[0], bCenter[1] - aCenter[1]))) return [];
  const result = circularIntersections(aCenter, aRadius, bCenter, bRadius);
  // Preserve the existing positive-side-first snap candidate order.
  return uniqueIntersectionPoints([...result.branches].reverse().map(branch => branch.point), linearToleranceAt(...aCenter, ...bCenter, aRadius, bRadius));
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
  const enabled = (type: SnapType) => type === "extension" ? query.enabled?.extension === true : query.enabled?.[type] !== false;
  const add = (type: SnapType, point: Vec3, objectId?: string, topologyReference?: string, metadata?: Record<string, unknown>) => { if (enabled(type)) candidates.push({ type, point, objectId, topologyReference, metadata }); };
  const nearby = query.entities.filter((entity) => {
    if (["infinite-line", "ray"].includes(entity.kind)) return true;
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
    if(entity.spline){const s=entity.spline;add("endpoint",splinePoint(s,s.domain[0]),entity.objectId,"spline:start");add("endpoint",splinePoint(s,s.domain[1]),entity.objectId,"spline:end");add("midpoint",splinePoint(s,(s.domain[0]+s.domain[1])/2),entity.objectId,"spline:parameter-midpoint");continue;}
    if(entity.ellipse){const e=entity.ellipse;add("center",e.center,entity.objectId,"ellipse:center");if(!ellipseClosed(e)){add("endpoint",ellipsePoint(e,e.startParam),entity.objectId,"ellipse:start");add("endpoint",ellipsePoint(e,e.startParam+e.sweep),entity.objectId,"ellipse:end");}for(let i=0;i<4;i++)if(ellipseContains(e,i*Math.PI/2))add("quadrant",ellipsePoint(e,i*Math.PI/2),entity.objectId,`ellipse:axis:${i}`);add("nearest",ellipseNearest(e,query.point),entity.objectId,"ellipse:curve");continue;}

    if (entity.kind === "point" && entity.points?.[0]) add("endpoint", entity.points[0], entity.objectId, "point");
    for (const [point, reference] of curveEndpoints(entity, query.plane)) add("endpoint", point, entity.objectId, reference);
    for (const [a, b, reference] of segments(entity)) {
      const unbounded = entity.kind === "infinite-line" || entity.kind === "ray";
      if (entity.kind !== "infinite-line") add("endpoint", a, entity.objectId, `${reference}:start`);
      if (!unbounded) { add("endpoint", b, entity.objectId, `${reference}:end`); add("midpoint", [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], entity.objectId, `${reference}:midpoint`); }
      const p = worldToPlane(query.point, query.plane), pa = worldToPlane(a, query.plane), pb = worldToPlane(b, query.plane);
      const dx = pb[0] - pa[0], dy = pb[1] - pa[1], length2 = dx * dx + dy * dy;
      const raw = length2 ? ((p[0] - pa[0]) * dx + (p[1] - pa[1]) * dy) / length2 : 0;
      const t = entity.kind === "infinite-line" ? raw : entity.kind === "ray" ? Math.max(0, raw) : Math.max(0, Math.min(1, raw));
      add("nearest", planeToWorld([pa[0] + dx * t, pa[1] + dy * t], query.plane), entity.objectId, reference);
      if (query.referencePoint) {
        const referencePlane = worldToPlane(query.referencePoint, query.plane);
        const amount = length2 ? ((referencePlane[0] - pa[0]) * dx + (referencePlane[1] - pa[1]) * dy) / length2 : 0;
        const perpendicular = unbounded ? entity.kind === "ray" && amount < 0 ? null : [pa[0] + dx * amount, pa[1] + dy * amount] as [number, number] : perpendicularPoint(referencePlane, pa, pb);
        if (perpendicular) add("perpendicular", planeToWorld(perpendicular, query.plane), entity.objectId, `${reference}:perpendicular`);
      }
    }
    for (const curve of curves(entity)) {
      add("center", curve.center, entity.objectId, `${curve.reference}:center`);
      const p = worldToPlane(query.point, query.plane), c = worldToPlane(curve.center, query.plane);
      for(let quadrant=0;quadrant<4;quadrant++){
        const angle=quadrant*Math.PI/2;
        if(curve.startAngle===undefined||curve.endAngle===undefined||angleOnSweep(angle,curve.startAngle,curve.endAngle))add("quadrant",planeToWorld([c[0]+Math.cos(angle)*curve.radius,c[1]+Math.sin(angle)*curve.radius],query.plane),entity.objectId,`${curve.reference}:quadrant:${quadrant}`);
      }
      const angle = Math.atan2(p[1] - c[1], p[0] - c[0]);
      const radial = planeToWorld([c[0] + Math.cos(angle) * curve.radius, c[1] + Math.sin(angle) * curve.radius], query.plane);
      if (curve.startAngle === undefined || curve.endAngle === undefined || angleOnSweep(angle, curve.startAngle, curve.endAngle)) {
        add("nearest", radial, entity.objectId, curve.reference);
      } else {
        for (const [endpoint, reference] of curveEndpoints(entity, query.plane).filter(([, reference]) => reference.startsWith(curve.reference))) add("nearest", endpoint, entity.objectId, reference);
      }
      if (query.referencePoint) {
        const referencePlane = worldToPlane(query.referencePoint, query.plane);
        const tangentPoints = circleTangents(referencePlane, c, curve.radius);
        for (const tangent of tangentPoints) {
          if (pointOnCurve(curve, tangent, query.plane)) add("tangent", planeToWorld(tangent, query.plane), entity.objectId, `${curve.reference}:tangent`);
        }
      }
    }
  }
  // Extension cannot use finite-object bounds: the cursor is outside those bounds.
  if(enabled("extension"))for(const entity of query.entities)if(!["infinite-line","ray"].includes(entity.kind))for(const [a,b,reference] of segments(entity)){
    const p=worldToPlane(query.point,query.plane),pa=worldToPlane(a,query.plane),pb=worldToPlane(b,query.plane),dx=pb[0]-pa[0],dy=pb[1]-pa[1],length2=dx*dx+dy*dy;
    if(length2<=1e-12)continue;
    const t=((p[0]-pa[0])*dx+(p[1]-pa[1])*dy)/length2;
    if(t<0||t>1)add("extension",planeToWorld([pa[0]+t*dx,pa[1]+t*dy],query.plane),entity.objectId,`${reference}:extension`,{extensionFrom:t<0?a:b});
  }
  if (enabled("intersection")) {
    const all = nearby.flatMap((entity) => segments(entity).map((segment) => ({ entity, segment })));
    for (let i = 0; i < all.length; i += 1) for (let j = i + 1; j < all.length; j += 1) {
      if (all[i].entity.objectId === all[j].entity.objectId) continue;
      const domain = (entity: SnapEntity): LinearDomain => entity.kind === "infinite-line" || entity.kind === "ray" ? entity.kind : "line";
      const hit = intersectLinear(worldToPlane(all[i].segment[0], query.plane), worldToPlane(all[i].segment[1], query.plane), domain(all[i].entity), worldToPlane(all[j].segment[0], query.plane), worldToPlane(all[j].segment[1], query.plane), domain(all[j].entity));
      if (hit) add("intersection", planeToWorld(hit, query.plane), all[i].entity.objectId, `${all[i].segment[2]}|${all[j].segment[2]}`, { otherObjectId: all[j].entity.objectId });
    }
    const curveEntries = nearby.flatMap((entity) => curves(entity).map((curve) => ({ entity, curve })));
    for (const lineEntity of nearby) for (const segment of segments(lineEntity)) for (const entry of curveEntries) {
      if (lineEntity.objectId === entry.entity.objectId) continue;
      const a = worldToPlane(segment[0], query.plane), b = worldToPlane(segment[1], query.plane), center = worldToPlane(entry.curve.center, query.plane);
      const hits = linearCircleIntersections(a, b, center, entry.curve.radius, ["infinite-line", "ray"].includes(lineEntity.kind) ? lineEntity.kind as LinearDomain : "line");
      for (const hit of hits) {
        if (pointOnCurve(entry.curve, hit, query.plane)) add("intersection", planeToWorld(hit, query.plane), lineEntity.objectId, `${segment[2]}|${entry.curve.reference}`, { otherObjectId: entry.entity.objectId });
      }
    }
    for (let i = 0; i < curveEntries.length; i += 1) for (let j = i + 1; j < curveEntries.length; j += 1) {
      if (curveEntries[i].entity.objectId === curveEntries[j].entity.objectId) continue;
      const aCenter = worldToPlane(curveEntries[i].curve.center, query.plane), bCenter = worldToPlane(curveEntries[j].curve.center, query.plane);
      for (const hit of circleCircleIntersections(aCenter, curveEntries[i].curve.radius, bCenter, curveEntries[j].curve.radius)) {
        if (pointOnCurve(curveEntries[i].curve, hit, query.plane) && pointOnCurve(curveEntries[j].curve, hit, query.plane)) add("intersection", planeToWorld(hit, query.plane), curveEntries[i].entity.objectId, `${curveEntries[i].curve.reference}|${curveEntries[j].curve.reference}`, { otherObjectId: curveEntries[j].entity.objectId });
      }
    }
  }
  const planePoint = worldToPlane(query.point, query.plane);
  add("grid", planeToWorld([Math.round(planePoint[0] / query.gridStep) * query.gridStep, Math.round(planePoint[1] / query.gridStep) * query.gridStep], query.plane));
  const ranked = candidates.map((candidate) => ({ ...candidate, screenDistance: Math.sqrt(dist2(query.project(candidate.point), pointerScreen)) })).filter((candidate) => candidate.screenDistance <= query.tolerancePx).sort((a, b) => priorities[a.type] - priorities[b.type] || a.screenDistance - b.screenDistance);
  return ranked[0] ?? { type: "nearest", point: query.point, screenDistance: Infinity };
}
