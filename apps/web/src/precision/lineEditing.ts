import type { CadFeature, CadObject } from "@agent-webcad/cad-document";
import { drawingWorkPlane, drawingWorldToModel, getWorldDrawingGeometry, type WorldDrawingGeometry } from "./worldGeometry";
import { planeToWorld, WORK_PLANES, worldToPlane, type Vec3, type WorkPlane } from "./workPlane";
import { profileBulges } from "./profileGeometry";
import { drawingPointFromPlane } from "./drawingOperations";
import { angleOnSweep, circleCircleIntersections, segmentCircleIntersections } from "./snapEngine";

type Point2 = [number, number];
export type LineEditMode = "trim" | "extend";
export type LineEditResult = {
  /** Full feature.params replacement, excluding topology (owned by the command handler). */
  params: Record<string, unknown>;
  /** Set when vertex structure changes and topology must be regenerated deterministically. */
  rebuildTopologyKind?: "arc" | "polyline";
  /** World-space removed (trim) or added (extend) portion, sampled for preview. */
  previewPoints: Vec3[];
  /** World-space boundary point applied. */
  intersection: Vec3;
};

const EPS = 1e-8;
const ANGLE_EPS = 1e-7;
const ARCLEN_EPS = 1e-7;
const TAU = Math.PI * 2;
const normAngle = (value: number) => ((value % TAU) + TAU) % TAU;
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross2 = (a: Point2, b: Point2) => a[0] * b[1] - a[1] * b[0];
const sub2 = (a: Point2, b: Point2): Point2 => [a[0] - b[0], a[1] - b[1]];
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

function segmentHit(a: Point2, b: Point2, c: Point2, d: Point2) {
  const r = sub2(b, a), s = sub2(d, c), denominator = cross2(r, s);
  const scale = Math.hypot(...r) * Math.hypot(...s);
  if (scale < EPS) return { parallel: false, hit: null };
  if (Math.abs(denominator) <= scale * 1e-10) {
    return { parallel: Math.abs(cross2(sub2(c, a), r)) <= scale * 1e-10, hit: null };
  }
  const t = cross2(sub2(c, a), s) / denominator;
  const u = cross2(sub2(c, a), r) / denominator;
  return { parallel: false, hit: u >= -EPS && u <= 1 + EPS ? t : null };
}

/** CAD-space line edit query shared by transient preview and command commit. */
export function resolveLineEdit(
  mode: LineEditMode,
  target: CadObject,
  targetFeature: CadFeature,
  cutter: CadObject,
  cutterFeature: CadFeature,
  pickPoint: Vec3,
): LineEditResult | null {
  const targetWorld = getWorldDrawingGeometry(target, targetFeature);
  const cutterWorld = getWorldDrawingGeometry(cutter, cutterFeature);
  if (!targetWorld || !cutterWorld || !targetWorld.planeAligned || !cutterWorld.planeAligned ||
      targetWorld.workPlane !== cutterWorld.workPlane) return null;
  switch (targetWorld.kind) {
    case "line":
      return resolveLineTarget(mode, targetFeature, targetWorld, cutterWorld, pickPoint);
    case "polyline":
      return resolvePolylineTarget(mode, target, targetFeature, targetWorld, cutterWorld, pickPoint);
    case "arc":
      return resolveArcTarget(mode, target, targetFeature, targetWorld, cutterWorld, pickPoint);
    case "circle":
      // A closed circle has no free endpoint to extend; trimming converts it
      // to an arc (see resolveCircleTrim).
      return mode === "trim" ? resolveCircleTrim(target, targetFeature, targetWorld, cutterWorld, pickPoint) : null;
    default:
      // Rectangle edges and closed loops cannot be trimmed without breaking
      // their parametric/closed representation, so they are rejected here
      // rather than converted implicitly (see KNOWN LIMITATIONS).
      return null;
  }
}

function resolveLineTarget(
  mode: LineEditMode,
  targetFeature: CadFeature,
  targetWorld: WorldDrawingGeometry,
  cutterWorld: WorldDrawingGeometry,
  pickPoint: Vec3,
): LineEditResult | null {
  if (targetWorld.kind !== "line" || targetWorld.points?.length !== 2) return null;
  const local = targetFeature.params.points as Vec3[] | undefined;
  if (!local || local.length !== 2) return null;
  const plane = WORK_PLANES[targetWorld.workPlane];
  const [a3, b3] = targetWorld.points;
  const normalHeight = dot(a3, plane.normal);
  const samePlane = (p: Vec3) => Math.abs(dot(p, plane.normal) - normalHeight) <= 1e-6;
  if (!samePlane(b3) || !samePlane(pickPoint) || (cutterWorld.points ?? []).some((p) => !samePlane(p)) || (cutterWorld.center && !samePlane(cutterWorld.center))) return null;
  const a = worldToPlane(a3, plane), b = worldToPlane(b3, plane), direction = sub2(b, a);
  const lengthSquared = direction[0] ** 2 + direction[1] ** 2;
  if (lengthSquared <= EPS * EPS) return null;
  const hitTs = lineCutterTHits(cutterWorld, plane, a, b, direction, lengthSquared);
  if (!hitTs) return null;
  const pick = worldToPlane(pickPoint, plane);
  const pickT = ((pick[0] - a[0]) * direction[0] + (pick[1] - a[1]) * direction[1]) / lengthSquared;
  let chosen: number | undefined;
  let editStart = false;
  if (mode === "trim") {
    const inside = hitTs.filter((t) => t > EPS && t < 1 - EPS).sort((x, y) => x - y);
    if (!inside.length) return null;
    if (pickT < inside[0]) { chosen = inside[0]; editStart = true; }
    else if (pickT > inside.at(-1)!) { chosen = inside.at(-1)!; }
    else if (inside.length === 1) { chosen = inside[0]; editStart = pickT < chosen; }
    else return null; // Removing an interior interval would split the line.
  } else {
    editStart = pickT <= 0.5;
    const outside = hitTs.filter((t) => editStart ? t < -EPS : t > 1 + EPS);
    if (!outside.length) return null;
    chosen = editStart ? Math.max(...outside) : Math.min(...outside);
  }
  if (chosen === undefined || !Number.isFinite(chosen)) return null;
  const intersection = lerp3(a3, b3, chosen);
  const localIntersection = lerp3(local[0], local[1], chosen); // Affine transforms preserve the line parameter.
  const points: [Vec3, Vec3] = editStart ? [localIntersection, local[1]] : [local[0], localIntersection];
  const previewPoints: [Vec3, Vec3] = mode === "trim"
    ? editStart ? [a3, intersection] : [intersection, b3]
    : editStart ? [intersection, a3] : [b3, intersection];
  return { params: { ...targetFeature.params, points }, previewPoints, intersection };
}

/** Line/circle intersections along AB; null when a coincident cutter is ambiguous. */
function lineCutterTHits(
  cutterWorld: WorldDrawingGeometry,
  plane: WorkPlane,
  a: Point2,
  b: Point2,
  direction: Point2,
  lengthSquared: number,
): number[] | null {
  const hitTs: number[] = [];
  const pushT = (t: number) => {
    if (!hitTs.some((candidate) => Math.abs(candidate - t) < EPS)) hitTs.push(t);
  };
  const addCircleHits = (center3: Vec3, radius: number, startAngle?: number, endAngle?: number) => {
    const center = worldToPlane(center3, plane), f = sub2(a, center);
    const qb = 2 * (f[0] * direction[0] + f[1] * direction[1]);
    const qc = f[0] ** 2 + f[1] ** 2 - radius ** 2;
    const discriminant = qb ** 2 - 4 * lengthSquared * qc;
    if (discriminant <= lengthSquared * 1e-9) return;
    for (const sign of [-1, 1]) {
      const t = (-qb + sign * Math.sqrt(discriminant)) / (2 * lengthSquared);
      const point: Point2 = [a[0] + direction[0] * t, a[1] + direction[1] * t];
      if (startAngle !== undefined && endAngle !== undefined) {
        const angle = Math.atan2(point[1] - center[1], point[0] - center[0]);
        const normalize = (value: number) => normAngle(value);
        const sweep = endAngle - startAngle;
        const progress = normalize(Math.sign(sweep) * (angle - startAngle));
        if (progress > Math.abs(sweep) + EPS) continue;
      }
      pushT(t);
    }
  };
  if (cutterWorld.kind === "line" || cutterWorld.kind === "polyline" || cutterWorld.kind === "rectangle") {
    const exactSegments = cutterWorld.profileSegments ?? [];
    for (const segment of exactSegments) {
      if (segment.kind === "arc" && segment.center && segment.radius && segment.startAngle !== undefined && segment.endAngle !== undefined) {
        addCircleHits(segment.center, segment.radius, segment.startAngle, segment.endAngle);
      } else {
        const c = worldToPlane(segment.start, plane), d = worldToPlane(segment.end, plane);
        const hit = segmentHit(a, b, c, d);
        if (hit.parallel) return null; // Coincident boundaries are ambiguous.
        if (hit.hit !== null) pushT(hit.hit);
      }
    }
  } else if (cutterWorld.kind === "circle" || cutterWorld.kind === "arc") {
    if (!cutterWorld.center || !cutterWorld.radius || !cutterWorld.uniformScale) return null;
    addCircleHits(cutterWorld.center, cutterWorld.radius, cutterWorld.kind === "arc" ? cutterWorld.startAngle : undefined, cutterWorld.kind === "arc" ? cutterWorld.endAngle : undefined);
  } else return null;
  return hitTs;
}

/** World plane-space points where cutter boundaries meet a circle. */
function circleBoundaryHits(
  cutterWorld: WorldDrawingGeometry,
  plane: WorkPlane,
  center: Point2,
  radius: number,
): Point2[] {
  const hits: Point2[] = [];
  const push = (point: Point2) => {
    if (!hits.some((candidate) => Math.hypot(candidate[0] - point[0], candidate[1] - point[1]) < 1e-9)) hits.push(point);
  };
  for (const segment of cutterWorld.profileSegments ?? []) {
    if (segment.kind === "line") {
      const a = worldToPlane(segment.start, plane), b = worldToPlane(segment.end, plane);
      for (const point of segmentCircleIntersections(a, b, center, radius)) push(point);
    } else if (segment.center && segment.radius !== undefined && segment.startAngle !== undefined && segment.endAngle !== undefined) {
      const c = worldToPlane(segment.center, plane);
      for (const point of circleCircleIntersections(center, radius, c, segment.radius)) {
        if (angleOnSweep(Math.atan2(point[1] - c[1], point[0] - c[0]), segment.startAngle, segment.endAngle)) push(point);
      }
    }
  }
  if ((cutterWorld.kind === "circle" || cutterWorld.kind === "arc") && cutterWorld.center && cutterWorld.radius) {
    const c = worldToPlane(cutterWorld.center, plane);
    for (const point of circleCircleIntersections(center, radius, c, cutterWorld.radius)) {
      if (cutterWorld.kind === "circle") { push(point); continue; }
      if (cutterWorld.startAngle !== undefined && cutterWorld.endAngle !== undefined &&
        angleOnSweep(Math.atan2(point[1] - c[1], point[0] - c[0]), cutterWorld.startAngle, cutterWorld.endAngle)) push(point);
    }
  }
  return hits;
}

function planarContext(
  targetWorld: WorldDrawingGeometry,
  cutterWorld: WorldDrawingGeometry,
  pickPoint: Vec3,
): { plane: WorkPlane; normalHeight: number } | null {
  const plane = WORK_PLANES[targetWorld.workPlane];
  const anchor = targetWorld.center ?? targetWorld.points?.[0];
  if (!anchor) return null;
  const normalHeight = dot(anchor, plane.normal);
  const samePlane = (point: Vec3) => Math.abs(dot(point, plane.normal) - normalHeight) <= 1e-6;
  if ((targetWorld.points ?? []).some((point) => !samePlane(point))) return null;
  if (targetWorld.center && !samePlane(targetWorld.center)) return null;
  if (!samePlane(pickPoint)) return null;
  if ((cutterWorld.points ?? []).some((point) => !samePlane(point))) return null;
  if (cutterWorld.center && !samePlane(cutterWorld.center)) return null;
  return { plane, normalHeight };
}

function planePointToWorld(point: Point2, plane: WorkPlane, normalHeight: number): Vec3 {
  const world = planeToWorld(point, plane);
  const axis = Math.abs(plane.normal[0]) > 0.5 ? 0 : Math.abs(plane.normal[1]) > 0.5 ? 1 : 2;
  const result: Vec3 = [...world];
  result[axis] = normalHeight * Math.sign(plane.normal[axis] || 1);
  return result;
}

/** Samples a local-space arc interval through the exact document transform. */
function sampleLocalArcWorld(
  target: CadObject,
  targetFeature: CadFeature,
  localCenter: Vec3,
  localRadius: number,
  fromAngle: number,
  toAngle: number,
  samples = 24,
): Vec3[] | null {
  const planeId = drawingWorkPlane(targetFeature);
  const origin = worldToPlane(localCenter, WORK_PLANES[planeId]);
  const elevation = planeId === "XZ" ? localCenter[1] : planeId === "YZ" ? localCenter[0] : localCenter[2];
  const points: Vec3[] = [];
  for (let index = 0; index <= samples; index += 1) {
    const angle = fromAngle + (toAngle - fromAngle) * (index / samples);
    const local = drawingPointFromPlane([origin[0] + Math.cos(angle) * localRadius, origin[1] + Math.sin(angle) * localRadius], elevation, planeId);
    const world = drawingWorldToModel(target, targetFeature, local);
    if (!world) return null;
    points.push(world);
  }
  return points;
}

/** Local-space angle of a world plane-space point on the target's circle. */
function localCircleAngle(
  target: CadObject,
  targetFeature: CadFeature,
  localCenter: Vec3,
  worldPoint: Point2,
  plane: WorkPlane,
  normalHeight: number,
): number | null {
  const model = drawingWorldToModel(target, targetFeature, planePointToWorld(worldPoint, plane, normalHeight));
  if (!model) return null;
  const planeId = drawingWorkPlane(targetFeature);
  const local = worldToPlane(model, WORK_PLANES[planeId]);
  const origin = worldToPlane(localCenter, WORK_PLANES[planeId]);
  return Math.atan2(local[1] - origin[1], local[0] - origin[0]);
}

const nearestStoredAngle = (angle: number, reference: number) => angle + TAU * Math.round((reference - angle) / TAU);

/**
 * Open-polyline trim/extend restricted to free end segments. Moving a shared
 * vertex would silently distort the neighboring segment, so middle segments
 * (and closed loops, which have no free ends) are rejected.
 */
function resolvePolylineTarget(
  mode: LineEditMode,
  target: CadObject,
  targetFeature: CadFeature,
  targetWorld: WorldDrawingGeometry,
  cutterWorld: WorldDrawingGeometry,
  pickPoint: Vec3,
): LineEditResult | null {
  const local = targetFeature.params.points as Vec3[] | undefined;
  if (!local || local.length < 2) return null;
  if (targetFeature.params.closed === true) return null;
  if (profileBulges("polyline", targetFeature.params).some((bulge) => Math.abs(bulge) > EPS)) return null;
  const context = planarContext(targetWorld, cutterWorld, pickPoint);
  if (!context) return null;
  const { plane } = context;
  const worldSegs = (targetWorld.profileSegments ?? []).filter((entry) => entry.kind === "line");
  if (worldSegs.length !== local.length - 1) return null;
  const pick = worldToPlane(pickPoint, plane);
  let best: { index: number; t: number; distance: number } | null = null;
  for (const [index, segment] of worldSegs.entries()) {
    const a = worldToPlane(segment.start, plane), b = worldToPlane(segment.end, plane);
    const dx = b[0] - a[0], dy = b[1] - a[1], lengthSquared = dx * dx + dy * dy;
    if (lengthSquared <= EPS * EPS) continue;
    const t = Math.max(0, Math.min(1, ((pick[0] - a[0]) * dx + (pick[1] - a[1]) * dy) / lengthSquared));
    const distance = Math.hypot(pick[0] - a[0] - dx * t, pick[1] - a[1] - dy * t);
    if (!best || distance < best.distance - 1e-12) best = { index, t, distance };
  }
  if (!best || best.distance > 1e-6) return null;
  const last = worldSegs.length - 1;
  const atStart = best.index === 0;
  if (!atStart && best.index !== last) return null;
  const segment = worldSegs[best.index];
  const a = worldToPlane(segment.start, plane), b = worldToPlane(segment.end, plane);
  const direction = sub2(b, a);
  const lengthSquared = direction[0] ** 2 + direction[1] ** 2;
  if (lengthSquared <= EPS * EPS) return null;
  const hitTs = lineCutterTHits(cutterWorld, plane, a, b, direction, lengthSquared);
  if (!hitTs) return null;
  // A two-point polyline trims/extends exactly like a line, selected by pick
  // side. Longer polylines only expose free ends: moving a shared vertex
  // would silently distort the neighboring segment.
  const single = worldSegs.length === 1;
  let moveIndex: number, chosen: number;
  if (mode === "trim") {
    const inside = hitTs.filter((t) => t > EPS && t < 1 - EPS).sort((x, y) => x - y);
    if (!inside.length) return null;
    if (single) {
      if (best.t < inside[0]) { moveIndex = 0; chosen = inside[0]; }
      else if (best.t > inside.at(-1)!) { moveIndex = local.length - 1; chosen = inside.at(-1)!; }
      else if (inside.length === 1) {
        if (best.t < inside[0]) { moveIndex = 0; chosen = inside[0]; }
        else { moveIndex = local.length - 1; chosen = inside[0]; }
      } else return null;
    } else if (atStart) {
      if (!(best.t < inside[0])) return null;
      moveIndex = 0;
      chosen = inside[0];
    } else {
      if (!(best.t > inside.at(-1)!)) return null;
      moveIndex = local.length - 1;
      chosen = inside.at(-1)!;
    }
  } else if (single) {
    if (best.t <= 0.5) {
      const before = hitTs.filter((t) => t < -EPS);
      if (!before.length) return null;
      moveIndex = 0;
      chosen = Math.max(...before);
    } else {
      const after = hitTs.filter((t) => t > 1 + EPS);
      if (!after.length) return null;
      moveIndex = local.length - 1;
      chosen = Math.min(...after);
    }
  } else {
    const outside = hitTs.filter((t) => atStart ? t < -EPS : t > 1 + EPS);
    if (!outside.length) return null;
    chosen = atStart ? Math.max(...outside) : Math.min(...outside);
    moveIndex = atStart ? 0 : local.length - 1;
  }
  const worldHit = lerp3(segment.start, segment.end, chosen);
  const localHit = drawingWorldToModel(target, targetFeature, worldHit);
  if (!localHit) return null;
  const points = local.map((point, index) => index === moveIndex ? localHit : [...point] as Vec3);
  const fixed = moveIndex === 0 ? points[1] : points[points.length - 2];
  const moved = points[moveIndex];
  if (Math.hypot(moved[0] - fixed[0], moved[1] - fixed[1], moved[2] - fixed[2]) <= 1e-9) return null;
  const previewPoints: [Vec3, Vec3] = mode === "trim"
    ? moveIndex === 0 ? [segment.start, worldHit] : [worldHit, segment.end]
    : moveIndex === 0 ? [worldHit, segment.start] : [segment.end, worldHit];
  return { params: { ...targetFeature.params, points }, previewPoints, intersection: worldHit };
}

/** Arc trim/extend in local angle space; topology ids are preserved. */
function resolveArcTarget(
  mode: LineEditMode,
  target: CadObject,
  targetFeature: CadFeature,
  targetWorld: WorldDrawingGeometry,
  cutterWorld: WorldDrawingGeometry,
  pickPoint: Vec3,
): LineEditResult | null {
  const params = targetFeature.params as Record<string, unknown>;
  const localCenter = params.center as Vec3 | undefined;
  const localRadius = Number(params.radius);
  const localStart = Number(params.startAngle);
  const localEnd = Number(params.endAngle);
  if (!Array.isArray(localCenter) || !(localRadius > EPS) || !Number.isFinite(localStart) || !Number.isFinite(localEnd)) return null;
  if (!targetWorld.center || !targetWorld.radius) return null;
  const context = planarContext(targetWorld, cutterWorld, pickPoint);
  if (!context) return null;
  const { plane, normalHeight } = context;
  const center = worldToPlane(targetWorld.center, plane);
  const hits = circleBoundaryHits(cutterWorld, plane, center, targetWorld.radius);
  if (!hits.length) return null;
  const sweep = localEnd - localStart;
  if (Math.abs(sweep) <= ANGLE_EPS || Math.abs(sweep) >= TAU - ANGLE_EPS) return null;
  const direction = Math.sign(sweep);
  const total = Math.abs(sweep);
  const toAngle = (point: Point2) => localCircleAngle(target, targetFeature, localCenter, point, plane, normalHeight);
  const pickAngle = toAngle(worldToPlane(pickPoint, plane));
  if (pickAngle === null) return null;
  let newStart = localStart, newEnd = localEnd;
  let boundary: Point2;
  if (mode === "trim") {
    const inside = hits
      .map((hit) => ({ hit, angle: toAngle(hit) }))
      .filter((entry): entry is { hit: Point2; angle: number } => entry.angle !== null)
      .map((entry) => ({ ...entry, progress: normAngle(direction * (entry.angle - localStart)) }))
      .filter((entry) => entry.progress > ANGLE_EPS && entry.progress < total - ANGLE_EPS)
      .sort((x, y) => x.progress - y.progress);
    const distinct = inside.filter((entry, index) => index === 0 || entry.progress - inside[index - 1].progress > ANGLE_EPS);
    if (!distinct.length) return null;
    const pickProgress = normAngle(direction * (pickAngle - localStart));
    if (pickProgress < distinct[0].progress) {
      newStart = nearestStoredAngle(distinct[0].angle, localStart);
      boundary = distinct[0].hit;
    } else if (pickProgress > distinct.at(-1)!.progress) {
      newEnd = nearestStoredAngle(distinct.at(-1)!.angle, localEnd);
      boundary = distinct.at(-1)!.hit;
    } else if (distinct.length === 1) {
      if (pickProgress < distinct[0].progress) {
        newStart = nearestStoredAngle(distinct[0].angle, localStart);
        boundary = distinct[0].hit;
      } else {
        newEnd = nearestStoredAngle(distinct[0].angle, localEnd);
        boundary = distinct[0].hit;
      }
    } else return null; // Removing an interior interval would split the arc.
  } else {
    const circularDistance = (from: number, to: number) => {
      const delta = Math.abs(normAngle(from - to));
      return Math.min(delta, TAU - delta);
    };
    const extendStart = circularDistance(pickAngle, localStart) <= circularDistance(pickAngle, localEnd);
    type Candidate = { hit: Point2; angle: number; advance: number };
    const candidates: Candidate[] = [];
    for (const hit of hits) {
      const angle = toAngle(hit);
      if (angle === null) return null;
      const advance = extendStart
        ? normAngle(direction * (localStart - angle))
        : normAngle(direction * (angle - localEnd));
      if (advance > ANGLE_EPS && advance < TAU - total - ANGLE_EPS) candidates.push({ hit, angle, advance });
    }
    if (!candidates.length) return null;
    candidates.sort((x, y) => x.advance - y.advance);
    if (extendStart) newStart = nearestStoredAngle(candidates[0].angle, localStart);
    else newEnd = nearestStoredAngle(candidates[0].angle, localEnd);
    boundary = candidates[0].hit;
  }
  const newSweep = newEnd - newStart;
  if (Math.sign(newSweep) !== direction || Math.abs(newSweep) <= ANGLE_EPS || Math.abs(newSweep) >= TAU - ANGLE_EPS) return null;
  const preview = mode === "trim"
    ? (newStart !== localStart
      ? sampleLocalArcWorld(target, targetFeature, localCenter, localRadius, localStart, newStart)
      : sampleLocalArcWorld(target, targetFeature, localCenter, localRadius, newEnd, localEnd))
    : (newStart !== localStart
      ? sampleLocalArcWorld(target, targetFeature, localCenter, localRadius, newStart, localStart)
      : sampleLocalArcWorld(target, targetFeature, localCenter, localRadius, localEnd, newEnd));
  if (!preview) return null;
  return {
    params: { ...targetFeature.params, startAngle: newStart, endAngle: newEnd },
    previewPoints: preview,
    intersection: planePointToWorld(boundary, plane, normalHeight),
  };
}

/**
 * Circle trim converts the closed circle into an open arc keeping the picked
 * portion. Object id, layer and transform are preserved; topology is rebuilt
 * deterministically (see handler), so stale sub-selection references drop
 * through validSelection instead of dangling.
 */
function resolveCircleTrim(
  target: CadObject,
  targetFeature: CadFeature,
  targetWorld: WorldDrawingGeometry,
  cutterWorld: WorldDrawingGeometry,
  pickPoint: Vec3,
): LineEditResult | null {
  const params = targetFeature.params as Record<string, unknown>;
  const localCenter = params.center as Vec3 | undefined;
  const localRadius = Number(params.radius);
  if (!Array.isArray(localCenter) || !(localRadius > EPS)) return null;
  if (!targetWorld.center || !targetWorld.radius) return null;
  const context = planarContext(targetWorld, cutterWorld, pickPoint);
  if (!context) return null;
  const { plane, normalHeight } = context;
  const center = worldToPlane(targetWorld.center, plane);
  const hits = circleBoundaryHits(cutterWorld, plane, center, targetWorld.radius);
  if (hits.length !== 2) return null; // Tangent touches and ambiguous multi-hit cuts are rejected.
  const toAngle = (point: Point2) => localCircleAngle(target, targetFeature, localCenter, point, plane, normalHeight);
  const first = toAngle(hits[0]);
  const second = toAngle(hits[1]);
  const pickAngle = toAngle(worldToPlane(pickPoint, plane));
  if (first === null || second === null || pickAngle === null) return null;
  const total = normAngle(second - first);
  if (total < ANGLE_EPS || total > TAU - ANGLE_EPS) return null;
  const pickProgress = normAngle(pickAngle - first);
  let start: number, end: number;
  if (pickProgress > ANGLE_EPS && pickProgress < total - ANGLE_EPS) {
    start = first;
    end = first + total;
  } else {
    const total2 = TAU - total;
    const pickProgress2 = normAngle(pickAngle - second);
    if (!(pickProgress2 > ANGLE_EPS && pickProgress2 < total2 - ANGLE_EPS)) return null;
    start = second;
    end = second + total2;
  }
  const preview = sampleLocalArcWorld(target, targetFeature, localCenter, localRadius, end, start + TAU);
  if (!preview) return null;
  const nearer = Math.hypot(hits[0][0] - worldToPlane(pickPoint, plane)[0], hits[0][1] - worldToPlane(pickPoint, plane)[1]) <=
    Math.hypot(hits[1][0] - worldToPlane(pickPoint, plane)[0], hits[1][1] - worldToPlane(pickPoint, plane)[1]) ? hits[0] : hits[1];
  return {
    params: { ...targetFeature.params, kind: "arc", startAngle: start, endAngle: end },
    rebuildTopologyKind: "arc",
    previewPoints: preview,
    intersection: planePointToWorld(nearer, plane, normalHeight),
  };
}
