import { linearToleranceAt } from "@agent-webcad/cad-document";
import { profileSegments } from "../../../precision/profileGeometry";
import type { Vec3, WorkPlaneId } from "../../../precision/workPlane";

type P = [number, number];
type Curve = { kind: "line" | "arc"; start: P; end: P; center?: P; radius?: number; angle?: number; sweep?: number };
const tau = 2 * Math.PI;
const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const cross = (a: P, b: P) => a[0] * b[1] - a[1] * b[0];
const gap = (a: P, b: P) => Math.hypot(...sub(a, b));
const wrap = (v: number) => ((v % tau) + tau) % tau;
const nearestAngle = (v: number, reference: number) => v + tau * Math.round((reference - v) / tau);
const planePoint = (p: Vec3, plane: WorkPlaneId): P => plane === "XZ" ? [p[0], p[2]] : plane === "YZ" ? [p[1], p[2]] : [p[0], p[1]];

/** Intersections of analytic supporting curves, calculated about local origins. */
function hits(a: Curve, b: Curve, tolerance: number): P[] {
  if (a.kind === "line" && b.kind === "line") {
    const u = sub(a.end, a.start), v = sub(b.end, b.start), d = cross(u, v);
    if (Math.abs(d) <= 1e-12 * Math.hypot(...u) * Math.hypot(...v)) return [];
    const t = cross(sub(b.start, a.start), v) / d;
    return [[a.start[0] + t * u[0], a.start[1] + t * u[1]]];
  }
  if (a.kind === "arc" && b.kind === "line") return hits(b, a, tolerance);
  if (a.kind === "line") {
    const u = sub(a.end, a.start), q = sub(a.start, b.center!), length = Math.hypot(...u);
    const along = -(q[0] * u[0] + q[1] * u[1]) / length;
    const height = cross(u, q) / length, square = b.radius! ** 2 - height ** 2;
    if (square < -tolerance * b.radius!) return [];
    const root = Math.sqrt(Math.max(0, square));
    return (root <= tolerance ? [along] : [along - root, along + root]).map(t => [a.start[0] + t * u[0] / length, a.start[1] + t * u[1] / length]);
  }
  const d = sub(b.center!, a.center!), size = Math.hypot(...d), r = a.radius!, s = b.radius!;
  if (size <= tolerance || size > r + s + tolerance || size < Math.abs(r - s) - tolerance) return [];
  const along = (r * r - s * s + size * size) / (2 * size), square = r * r - along * along;
  if (square < -tolerance * r) return [];
  const height = Math.sqrt(Math.max(0, square)), base: P = [a.center![0] + along * d[0] / size, a.center![1] + along * d[1] / size];
  return (height <= tolerance ? [0] : [-height, height]).map(h => [base[0] - h * d[1] / size, base[1] + h * d[0] / size]);
}
function contains(s: Curve, p: P, tolerance: number) {
  if (s.kind === "arc") {
    const a = Math.atan2(p[1] - s.center![1], p[0] - s.center![0]);
    return gap(p, s.start) <= tolerance || gap(p, s.end) <= tolerance || wrap(Math.sign(s.sweep!) * (a - s.angle!)) <= Math.abs(s.sweep!) + tolerance / s.radius!;
  }
  const u = sub(s.end, s.start), q = sub(p, s.start), square = u[0] ** 2 + u[1] ** 2;
  const t = (q[0] * u[0] + q[1] * u[1]) / square;
  return t >= -tolerance / Math.sqrt(square) && t <= 1 + tolerance / Math.sqrt(square);
}
/** Supporting intersections are empty for coincident curves. Detect actual
 * overlapping intervals as well, rather than allowing doubled contour edges. */
function overlaps(a: Curve, b: Curve, tolerance: number) {
  if (a.kind !== b.kind) return false;
  if (a.kind === "line") {
    const u = sub(a.end, a.start), size = Math.hypot(...u), c = sub(b.start, a.start), d = sub(b.end, a.start);
    if (Math.abs(cross(u, c)) > tolerance * size || Math.abs(cross(u, d)) > tolerance * size) return false;
    const project = (p: P) => (p[0] * u[0] + p[1] * u[1]) / size, x = project(c), y = project(d);
    return Math.min(size, Math.max(x, y)) - Math.max(0, Math.min(x, y)) > tolerance;
  }
  if (gap(a.center!, b.center!) > tolerance || Math.abs(a.radius! - b.radius!) > tolerance) return false;
  const intervals = (s: Curve) => {
    const start = wrap(s.angle! + (s.sweep! < 0 ? s.sweep! : 0)), end = start + Math.abs(s.sweep!);
    return end <= tau ? [[start, end]] : [[start, tau], [0, end - tau]];
  };
  return intervals(a).some(u => intervals(b).some(v => Math.min(u[1], v[1]) - Math.max(u[0], v[0]) > tolerance / a.radius!));
}
function area(segments: Curve[]) {
  const origin = segments[0].start;
  return segments.reduce((sum, s) => sum + (cross(sub(s.start, origin), sub(s.end, origin)) + (s.kind === "arc" ? s.radius! ** 2 * (s.sweep! - Math.sin(s.sweep!)) : 0)) / 2, 0);
}

/** Left offsets preserve exact bulge arcs and analytic miter joins. No tessellation. */
export function offsetCurvedProfile(kind: string, source: Record<string, unknown>, distance: number): Record<string, unknown> | null {
  const plane: WorkPlaneId = source.workPlane === "XZ" || source.workPlane === "YZ" ? source.workPlane : "XY";
  const closed = kind === "rectangle" || source.closed === true;
  const input = profileSegments(kind, source);
  const tolerance = linearToleranceAt(Math.max(...input.flatMap(s => [...s.start.map(Math.abs), ...s.end.map(Math.abs)]), 0));
  const curves: Curve[] = input.map(s => ({ kind: s.kind, start: planePoint(s.start, plane), end: planePoint(s.end, plane), center: s.center && planePoint(s.center, plane), radius: s.radius, angle: s.startAngle, sweep: s.sweep }));
  if (!curves.length || curves.some(s => gap(s.start, s.end) <= tolerance)) return null;
  const offset: Curve[] = [];
  for (const s of curves) {
    if (s.kind === "line") {
      const u = sub(s.end, s.start), size = Math.hypot(...u), n: P = [-u[1] * distance / size, u[0] * distance / size];
      offset.push({ ...s, start: [s.start[0] + n[0], s.start[1] + n[1]], end: [s.end[0] + n[0], s.end[1] + n[1]] });
    } else {
      const radius = s.radius! - Math.sign(s.sweep!) * distance;
      if (radius <= tolerance) return null;
      const at = (p: P): P => [s.center![0] + (p[0] - s.center![0]) * radius / s.radius!, s.center![1] + (p[1] - s.center![1]) * radius / s.radius!];
      offset.push({ ...s, radius, start: at(s.start), end: at(s.end) });
    }
  }
  const vertices: P[] = [];
  for (let i = 0; i < offset.length; i++) {
    if (i === 0 && !closed) { vertices.push(offset[0].start); continue; }
    const a = offset[(i + offset.length - 1) % offset.length], b = offset[i];
    // Tangent, collinear and concentric neighbors already have a common join.
    if (gap(a.end, b.start) <= tolerance) { vertices.push(a.end); continue; }
    const intersections = hits(a, b, tolerance).sort((x, y) => gap(x, curves[i].start) - gap(y, curves[i].start));
    if (!intersections.length) return null;
    vertices.push(intersections[0]);
  }
  if (!closed) vertices.push(offset.at(-1)!.end);
  for (let i = 0; i < offset.length; i++) {
    const s = offset[i], start = vertices[i], end = vertices[(i + 1) % vertices.length];
    if (gap(start, end) <= tolerance) return null;
    if (s.kind === "line") {
      const a = sub(s.end, s.start), b = sub(end, start);
      if (a[0] * b[0] + a[1] * b[1] <= tolerance ** 2) return null;
    } else {
      const angle = nearestAngle(Math.atan2(start[1] - s.center![1], start[0] - s.center![0]), s.angle!);
      const endAngle = nearestAngle(Math.atan2(end[1] - s.center![1], end[0] - s.center![0]), s.angle! + s.sweep!);
      const sweep = endAngle - angle;
      if (Math.sign(sweep) !== Math.sign(s.sweep!) || Math.abs(sweep) >= tau - 1e-8 || Math.abs(sweep) * s.radius! <= tolerance) return null;
      s.angle = angle; s.sweep = sweep;
    }
    s.start = start; s.end = end;
  }
  for (let i = 0; i < offset.length; i++) for (let j = i + 1; j < offset.length; j++) {
    if (overlaps(offset[i], offset[j], tolerance)) return null;
    const adjacent = j === i + 1 || (closed && i === 0 && j === offset.length - 1);
    const permitted = adjacent ? (j === i + 1 ? offset[i].end : offset[i].start) : undefined;
    if (hits(offset[i], offset[j], tolerance).some(p => contains(offset[i], p, tolerance) && contains(offset[j], p, tolerance) && (!permitted || gap(p, permitted) > tolerance))) return null;
  }
  if (closed && (Math.abs(area(offset)) <= tolerance ** 2 || area(curves) * area(offset) <= 0)) return null;
  const elevation = plane === "XZ" ? input[0].start[1] : plane === "YZ" ? input[0].start[0] : input[0].start[2];
  const from = (p: P): Vec3 => plane === "XZ" ? [p[0], elevation, p[1]] : plane === "YZ" ? [elevation, p[0], p[1]] : [p[0], p[1], elevation];
  return { ...structuredClone(source), points: vertices.map(from), bulges: offset.map(s => s.kind === "arc" ? Math.tan(s.sweep! / 4) : 0), topology: undefined };
}
