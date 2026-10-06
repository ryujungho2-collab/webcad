import { contourLength, contourTolerance, intervalSegments, locateOnContour, segmentPoint, type ContourSegment, type ExactContour } from "./contourEditing";
import { WORK_PLANES, worldToPlane, type Vec3 } from "../../../precision/workPlane";

const distance = (a: Vec3, b: Vec3) => Math.hypot(...a.map((v, i) => v - b[i]));
const cross = (a: number[], b: number[]) => a[0] * b[1] - a[1] * b[0];
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1];
export type ContourTrim = { pieces: ExactContour[]; removed: ExactContour; cuts: Vec3[] };

/** Bounded analytic intersections. Touching tangencies are not crossings;
 * coincident intervals are ambiguous and cannot choose a removal branch. */
export function contourIntersections(a: ContourSegment, b: ContourSegment, path: ExactContour, tolerance: number, includeTouches = false): Vec3[] {
  const plane = WORK_PLANES[path.workPlane], origin = worldToPlane(a.start, plane);
  const uv = (p: Vec3) => worldToPlane(p, plane).map((v, i) => v - origin[i]);
  const from = (p: number[]) => a.start.map((v, i) => v + p[0] * plane.xAxis[i] + p[1] * plane.yAxis[i]) as Vec3;
  const start = uv(a.start), end = uv(a.end), other = uv(b.start), otherEnd = uv(b.end);
  let hits: number[][];
  if (a.kind === "line" && b.kind === "line") {
    const d = end.map((v, i) => v - start[i]), e = otherEnd.map((v, i) => v - other[i]), q = other.map((v, i) => v - start[i]);
    const dl = Math.hypot(...d), el = Math.hypot(...e), determinant = cross(d, e);
    if (Math.abs(determinant) <= 1e-12 * dl * el) {
      if (Math.abs(cross(q, d)) / dl <= tolerance) {
        const t = [dot(q, d) / dl, dot(otherEnd.map((v, i) => v - start[i]), d) / dl].sort((x, y) => x - y);
        if (Math.min(dl, t[1]) - Math.max(0, t[0]) > tolerance) throw new Error("The boundary overlaps a target segment. Choose a crossing boundary.");
      }
      return [];
    }
    const t = cross(q, e) / determinant;
    hits = [start.map((v, i) => v + t * d[i])];
  } else if (a.kind === "arc" && b.kind === "arc") {
    const c = uv(a.center!), k = uv(b.center!), delta = k.map((v, i) => v - c[i]), length = Math.hypot(...delta);
    if (length <= tolerance) {
      if (Math.abs(a.radius! - b.radius!) <= tolerance) throw new Error("Coincident arc boundaries cannot define an unambiguous Trim interval.");
      return [];
    }
    if (length > a.radius! + b.radius! + tolerance || length < Math.abs(a.radius! - b.radius!) - tolerance) return [];
    const along = (a.radius! ** 2 - b.radius! ** 2 + length ** 2) / (2 * length), height2 = a.radius! ** 2 - along ** 2;
    if (height2 < -tolerance * Math.max(a.radius!, b.radius!, 1) || !includeTouches && height2 <= tolerance * Math.max(a.radius!, b.radius!, 1)) return [];
    const h = Math.sqrt(Math.max(0, height2)), base = c.map((v, i) => v + delta[i] * along / length), normal = [-delta[1] / length, delta[0] / length];
    hits = [base.map((v, i) => v + normal[i] * h), base.map((v, i) => v - normal[i] * h)];
  } else {
    const line = a.kind === "line" ? a : b, arc = a.kind === "arc" ? a : b;
    const s = uv(line.start), e = uv(line.end), c = uv(arc.center!), d = e.map((v, i) => v - s[i]), length = Math.hypot(...d), q = c.map((v, i) => v - s[i]);
    const along = dot(q, d) / length, perpendicular = cross(d, q) / length, height2 = arc.radius! ** 2 - perpendicular ** 2;
    if (height2 < -tolerance * Math.max(arc.radius!, 1) || !includeTouches && height2 <= tolerance * Math.max(arc.radius!, 1)) return [];
    const h = Math.sqrt(Math.max(0, height2));
    hits = [along - h, along + h].map(t => s.map((v, i) => v + d[i] * t / length));
  }
  return hits.map(from).filter(point => [a, b].every(s => locateOnContour({ ...path, closed: false, segments: [s] }, point).distance <= tolerance));
}

function crossesVertex(path: ExactContour, index: number, point: Vec3, cutter: ContourSegment, tolerance: number) {
  const s = path.segments[index], count = path.segments.length;
  const atStart = distance(point, s.start) <= tolerance, atEnd = distance(point, s.end) <= tolerance;
  if (!atStart && !atEnd || !path.closed && (atStart && index === 0 || atEnd && index === count - 1)) return true;
  const before = atStart ? path.segments[(index + count - 1) % count] : s, after = atEnd ? path.segments[(index + 1) % count] : s;
  const step = (s: ContourSegment) => Math.min(.25, Math.max(.001, 32 * tolerance / contourLength({ ...path, segments: [s] })));
  const a = segmentPoint(before, 1 - step(before), path.workPlane), b = segmentPoint(after, step(after), path.workPlane), plane = WORK_PLANES[path.workPlane];
  const side = (p: Vec3) => {
    if (cutter.kind === "arc") return distance(p, cutter.center!) - cutter.radius!;
    const u = worldToPlane(cutter.start, plane), v = worldToPlane(cutter.end, plane), q = worldToPlane(p, plane), d = v.map((n, i) => n - u[i]);
    return cross(d, q.map((n, i) => n - u[i])) / Math.hypot(...d);
  };
  const first = side(a), second = side(b);
  if (Math.abs(first) <= tolerance || Math.abs(second) <= tolerance) throw new Error("The boundary is nearly tangent at a vertex. Choose a clear crossing boundary.");
  return first * second < 0;
}

/** Remove the interval picked between actual bounded cutter crossings.
 * Outputs retain exact line/arc parameters, including intervals across a seam. */
export function trimContour(path: ExactContour, boundaries: ExactContour[], pick: Vec3, rejoin = false): ContourTrim {
  const tolerance = contourTolerance([path, ...boundaries]), total = contourLength(path), plane = WORK_PLANES[path.workPlane];
  const height = (p: Vec3) => p.reduce((n, v, i) => n + v * plane.normal[i], 0);
  if (!boundaries.length || boundaries.some(b => b.workPlane !== path.workPlane || Math.abs(height(b.segments[0].start) - height(path.segments[0].start)) > tolerance)) throw new Error("Choose boundaries on the same work plane and elevation.");
  if (path.segments.length * boundaries.reduce((sum, b) => sum + b.segments.length, 0) > 65536) throw new Error("Use fewer boundary segments for one Trim review.");
  const hit = locateOnContour(path, pick);
  if (hit.distance > tolerance) throw new Error("Pick an exact point on the target contour.");
  const cuts: { fraction: number; point: Vec3 }[] = [];
  let cursor = 0;
  for (const [index, segment] of path.segments.entries()) {
    for (const boundary of boundaries) for (const cutter of boundary.segments) {
      for (const point of contourIntersections(segment, cutter, path, tolerance)) {
        if (!crossesVertex(path, index, point, cutter, tolerance)) continue;
        const local = locateOnContour({ ...path, closed: false, segments: [segment] }, point);
        let fraction = cursor + local.fraction;
        if (path.closed && total - fraction <= tolerance) fraction = 0;
        if (!cuts.some(c => Math.abs(c.fraction - fraction) <= tolerance)) cuts.push({ fraction, point });
      }
    }
    cursor += contourLength({ ...path, segments: [segment] });
  }
  cuts.sort((a, b) => a.fraction - b.fraction);
  if (path.closed ? cuts.length < 2 : !cuts.some(c => c.fraction > tolerance && total - c.fraction > tolerance)) throw new Error("The boundary needs two distinct crossings of a closed contour, or an interior crossing of an open contour. Tangencies do not split it.");
  let position = hit.fraction;
  if (path.closed && total - position <= tolerance) position = 0;
  if (cuts.some(c => Math.abs(c.fraction - position) <= tolerance)) throw new Error("Pick inside a portion, away from its boundary intersection.");
  const slice = (a: number, b: number) => intervalSegments(path, a, b);
  const wrap = (a: number, b: number) => [...slice(a, total), ...slice(0, b)];
  let removed: ContourSegment[], retained: ContourSegment[][];
  if (path.closed) {
    const upper = cuts.find(c => c.fraction > position)?.fraction ?? cuts[0].fraction;
    const lower = cuts.filter(c => c.fraction < position).at(-1)?.fraction ?? cuts.at(-1)!.fraction;
    removed = lower < upper ? slice(lower, upper) : wrap(lower, upper);
    retained = [upper < lower ? slice(upper, lower) : wrap(upper, lower)];
  } else {
    const lower = cuts.filter(c => c.fraction < position).at(-1)?.fraction ?? 0;
    const upper = cuts.find(c => c.fraction > position)?.fraction ?? total;
    removed = slice(lower, upper); retained = [slice(0, lower), slice(upper, total)].filter(p => p.length);
  }
  if (!removed.length || !retained.length || retained.some(p => !p.length)) throw new Error("Trim would remove the entire contour. Use Delete instead.");
  const pieces = retained.map(segments => ({ workPlane: path.workPlane, closed: false, segments }));
  if (rejoin) {
    if (!path.closed || pieces.length !== 1) throw new Error("Rejoin during Trim applies to one closed source. Join separate open results with explicit endpoint bridges.");
    const p = pieces[0], bridge: ContourSegment = { kind: "line", start: p.segments.at(-1)!.end, end: p.segments[0].start };
    if (distance(bridge.start, bridge.end) <= tolerance) throw new Error("The reconnection edge is degenerate.");
    for (const s of p.segments) if (contourIntersections(bridge, s, path, tolerance, true).some(point => distance(point, bridge.start) > tolerance && distance(point, bridge.end) > tolerance)) throw new Error("The reconnection edge crosses or touches retained geometry. Choose another interval.");
    p.segments.push(bridge); p.closed = true;
  }
  return { pieces, removed: { workPlane: path.workPlane, closed: false, segments: removed }, cuts: cuts.map(c => c.point) };
}
