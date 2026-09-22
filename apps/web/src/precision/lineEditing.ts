import type { CadFeature, CadObject } from "@agent-webcad/cad-document";
import { getWorldDrawingGeometry } from "./worldGeometry";
import { WORK_PLANES, worldToPlane, type Vec3 } from "./workPlane";

type Point2 = [number, number];
export type LineEditMode = "trim" | "extend";
export type LineEditResult = {
  points: [Vec3, Vec3];
  preview: [Vec3, Vec3];
  intersection: Vec3;
};

const EPS = 1e-8;
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

function arcContains(point: Point2, center: Point2, sampled: Vec3[], plane: typeof WORK_PLANES.XY, originalSweep: number) {
  if (sampled.length < 3 || !(Math.abs(originalSweep) > EPS) || Math.abs(originalSweep) > Math.PI * 2 + EPS) return false;
  const first = worldToPlane(sampled[0], plane), next = worldToPlane(sampled[1], plane);
  const start = Math.atan2(first[1] - center[1], first[0] - center[0]);
  const direction = Math.sign(cross2(sub2(first, center), sub2(next, center)));
  if (!direction) return false;
  const angle = Math.atan2(point[1] - center[1], point[0] - center[0]);
  const turn = (value: number) => ((value % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return turn(direction * (angle - start)) <= Math.abs(originalSweep) + EPS;
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
  if (!targetWorld || targetWorld.kind !== "line" || targetWorld.points?.length !== 2 || !targetWorld.planeAligned ||
      !cutterWorld || !cutterWorld.planeAligned || targetWorld.workPlane !== cutterWorld.workPlane) return null;
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
  const hitTs: number[] = [];
  if (cutterWorld.kind === "line" || cutterWorld.kind === "polyline" || cutterWorld.kind === "rectangle") {
    const points = cutterWorld.points ?? [];
    const count = points.length - 1 + (cutterWorld.kind === "rectangle" || cutterFeature.params.closed === true ? 1 : 0);
    for (let index = 0; index < count; index += 1) {
      const c = worldToPlane(points[index], plane), d = worldToPlane(points[(index + 1) % points.length], plane);
      const hit = segmentHit(a, b, c, d);
      if (hit.parallel) return null; // Coincident boundaries are ambiguous.
      if (hit.hit !== null && !hitTs.some((t) => Math.abs(t - hit.hit!) < EPS)) hitTs.push(hit.hit);
    }
  } else if (cutterWorld.kind === "circle" || cutterWorld.kind === "arc") {
    if (!cutterWorld.center || !cutterWorld.radius || !cutterWorld.uniformScale) return null;
    const center = worldToPlane(cutterWorld.center, plane), f = sub2(a, center);
    const qb = 2 * (f[0] * direction[0] + f[1] * direction[1]);
    const qc = f[0] ** 2 + f[1] ** 2 - cutterWorld.radius ** 2;
    const discriminant = qb ** 2 - 4 * lengthSquared * qc;
    if (discriminant <= lengthSquared * 1e-9) return null; // Tangency has no removable interval.
    for (const sign of [-1, 1]) {
      const t = (-qb + sign * Math.sqrt(discriminant)) / (2 * lengthSquared);
      const point: Point2 = [a[0] + direction[0] * t, a[1] + direction[1] * t];
      if (cutterWorld.kind === "arc" && !arcContains(point, center, cutterWorld.points ?? [], plane, Number(cutterFeature.params.endAngle) - Number(cutterFeature.params.startAngle))) continue;
      if (!hitTs.some((candidate) => Math.abs(candidate - t) < EPS)) hitTs.push(t);
    }
  } else return null;
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
  const preview: [Vec3, Vec3] = mode === "trim"
    ? editStart ? [a3, intersection] : [intersection, b3]
    : editStart ? [intersection, a3] : [b3, intersection];
  return { points, preview, intersection };
}
