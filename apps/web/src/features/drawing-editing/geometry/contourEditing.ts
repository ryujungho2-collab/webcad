import type { CadFeature, CadObject } from "@agent-webcad/cad-document";
import { linearToleranceAt } from "@agent-webcad/cad-document";
import { getWorldDrawingGeometry } from "../../../precision/worldGeometry";
import { WORK_PLANES, worldToPlane, planeToWorld, type Vec3, type WorkPlaneId } from "../../../precision/workPlane";

/** Model-owned analytic paths. Display tessellation is never an editing source.
 * The same operations can later be used by sketch/block adapters that remap
 * their own constraints and references before committing a replacement. */
export type ContourSegment = {
  kind: "line" | "arc";
  start: Vec3;
  end: Vec3;
  center?: Vec3;
  radius?: number;
  startAngle?: number;
  sweep?: number;
};
export type ExactContour = { workPlane: WorkPlaneId; closed: boolean; segments: ContourSegment[] };
const distance = (a: Vec3, b: Vec3) => Math.hypot(...a.map((v, i) => v - b[i]));
export function contourTolerance(paths: ExactContour[]) {
  let largest = 0;
  for (const path of paths) for (const segment of path.segments) for (const point of [segment.start, segment.end, segment.center]) if (point) for (const v of point) {
    if (!Number.isFinite(v)) throw new Error("Contour coordinates must be finite.");
    largest = Math.max(largest, Math.abs(v));
  }
  return linearToleranceAt(largest);
}
const length = (s: ContourSegment) => s.kind === "line" ? distance(s.start, s.end) : s.radius! * Math.abs(s.sweep!);
export const contourLength = (path: ExactContour) => path.segments.reduce((sum, s) => sum + length(s), 0);
const elevation = (p: Vec3, plane: WorkPlaneId) => p.reduce((sum, v, i) => sum + v * WORK_PLANES[plane].normal[i], 0);
const fromPlane = (p: [number, number], h: number, plane: WorkPlaneId): Vec3 => planeToWorld(p, WORK_PLANES[plane]).map((v, i) => v + h * WORK_PLANES[plane].normal[i]) as Vec3;

export function exactDrawingContour(object: CadObject, feature: CadFeature): ExactContour {
  const world = getWorldDrawingGeometry(object, feature);
  if (!world || !world.planeAligned) throw new Error("Use drawing curves aligned with XY, XZ or YZ. Tilted work planes are not supported yet.");
  const path: ExactContour = { workPlane: world.workPlane, closed: world.closed || world.kind === "circle", segments: [] };
  if (world.kind === "arc" || world.kind === "circle") {
    if (!world.uniformScale || !world.center || !world.radius) throw new Error("Circular curves require uniform in-plane scale; an ellipse cannot be converted to an arc.");
    const start = world.kind === "circle" ? 0 : world.startAngle!;
    const sweep = world.kind === "circle" ? Math.PI * 2 : world.endAngle! - start;
    // Two semicircles also make a circle available to Break without an
    // infinite bulge (a complete circle remains a circle in Explode).
    const count = Math.abs(sweep) >= Math.PI * 2 - 1e-9 ? 2 : 1;
    const c = worldToPlane(world.center, WORK_PLANES[path.workPlane]);
    const point = (angle: number) => fromPlane([c[0] + world.radius! * Math.cos(angle), c[1] + world.radius! * Math.sin(angle)], elevation(world.center!, path.workPlane), path.workPlane);
    for (let i = 0; i < count; i++) path.segments.push({ kind: "arc", start: point(start + sweep * i / count), end: point(start + sweep * (i + 1) / count), center: world.center, radius: world.radius, startAngle: start + sweep * i / count, sweep: sweep / count });
  } else {
    const expected = (feature.params.points as Vec3[]).length - (path.closed ? 0 : 1);
    if (world.profileSegments?.length !== expected) throw new Error("Curved polylines require uniform in-plane scale.");
    path.segments = world.profileSegments!.map(s => ({ ...s, sweep: s.kind === "arc" ? s.endAngle! - s.startAngle! : undefined }));
  }
  const tolerance = contourTolerance([path]);
  if (!path.segments.length || path.segments.some(s => !Number.isFinite(length(s)) || length(s) <= tolerance)) throw new Error("The contour has a zero-length or invalid segment.");
  const h = elevation(path.segments[0].start, path.workPlane);
  if (path.segments.some(s => Math.abs(elevation(s.start, path.workPlane) - h) > tolerance || Math.abs(elevation(s.end, path.workPlane) - h) > tolerance)) throw new Error("The contour must lie on one plane.");
  return structuredClone(path);
}

const reverseSegment = (s: ContourSegment): ContourSegment => ({ ...s, start: s.end, end: s.start, startAngle: s.kind === "arc" ? s.startAngle! + s.sweep! : undefined, sweep: s.kind === "arc" ? -s.sweep! : undefined });
const reversed = (p: ExactContour) => p.segments.slice().reverse().map(reverseSegment);

export function joinContours(paths: ExactContour[]): ExactContour {
  if (paths.length < 2) throw new Error("Select at least two connected open lines, arcs or polylines.");
  const tolerance = contourTolerance(paths), plane = paths[0].workPlane, h = elevation(paths[0].segments[0].start, plane);
  if (paths.some(p => p.closed)) throw new Error("Join requires open contours. Break a closed contour first.");
  if (paths.some(p => p.workPlane !== plane || Math.abs(elevation(p.segments[0].start, plane) - h) > tolerance)) throw new Error("Join requires the same work plane and elevation.");
  const ends = paths.flatMap(p => [p.segments[0].start, p.segments.at(-1)!.end]);
  const parent = ends.map((_, i) => i), root = (i: number): number => parent[i] === i ? i : (parent[i] = root(parent[i]));
  for (let i = 0; i < ends.length; i++) for (let j = i + 1; j < ends.length; j++) if (distance(ends[i], ends[j]) <= tolerance) parent[root(j)] = root(i);
  const nodes = new Map<number, number[]>();
  ends.forEach((_, i) => { const r = root(i); nodes.set(r, [...(nodes.get(r) ?? []), i]); });
  if ([...nodes.values()].some(entries => entries.length > 2)) throw new Error("The selection branches at an endpoint. Select one unambiguous chain.");
  if ([...nodes.values()].some(entries => entries.some(i => entries.some(j => distance(ends[i], ends[j]) > tolerance)))) throw new Error("Endpoint clusters exceed the model tolerance; correct the gaps first.");
  const openEnds = [...nodes.values()].filter(entries => entries.length === 1);
  if (openEnds.length !== 0 && openEnds.length !== 2) throw new Error(`The selected contours are disconnected. Connect endpoints within ${tolerance.toPrecision(2)} mm.`);
  let endpoint = openEnds[0]?.[0] ?? 0;
  const used = new Set<number>(), segments: ContourSegment[] = [];
  while (!used.has(Math.floor(endpoint / 2))) {
    const index = Math.floor(endpoint / 2); used.add(index);
    segments.push(...(endpoint % 2 === 0 ? paths[index].segments : reversed(paths[index])));
    const exit = index * 2 + (endpoint % 2 === 0 ? 1 : 0);
    const next = nodes.get(root(exit))!.find(i => i !== exit);
    if (next === undefined) break;
    endpoint = next;
  }
  if (used.size !== paths.length) throw new Error("The selection contains separate chains or loops. Join each contour separately.");
  return { workPlane: plane, closed: openEnds.length === 0, segments: structuredClone(segments) };
}

export function contourParams(path: ExactContour): Record<string, unknown> {
  const segments = path.segments;
  if (!segments.length) throw new Error("An empty contour cannot be created.");
  if (!path.closed && segments.length === 1) {
    const s = segments[0];
    return s.kind === "line" ? { kind: "line", workPlane: path.workPlane, points: [s.start, s.end] }
      : { kind: "arc", workPlane: path.workPlane, center: s.center, radius: s.radius, startAngle: s.startAngle, endAngle: s.startAngle! + s.sweep! };
  }
  const points = segments.map(s => s.start);
  if (!path.closed) points.push(segments.at(-1)!.end);
  return { kind: "polyline", workPlane: path.workPlane, points, closed: path.closed, bulges: segments.map(s => s.kind === "arc" ? Math.tan(s.sweep! / 4) : 0) };
}

export function explodeContour(path: ExactContour): Record<string, unknown>[] {
  if (path.segments.length < 2) throw new Error("Select a polyline or rectangle with multiple segments to explode.");
  return path.segments.map(s => contourParams({ workPlane: path.workPlane, closed: false, segments: [s] }));
}

export function segmentPoint(s: ContourSegment, t: number, plane: WorkPlaneId): Vec3 {
  if (t === 0) return [...s.start];
  if (t === 1) return [...s.end];
  if (s.kind === "line") return s.start.map((v, i) => v + (s.end[i] - v) * t) as Vec3;
  const angle = s.startAngle! + s.sweep! * t, c = worldToPlane(s.center!, WORK_PLANES[plane]);
  return fromPlane([c[0] + s.radius! * Math.cos(angle), c[1] + s.radius! * Math.sin(angle)], elevation(s.center!, plane), plane);
}
export type ContourLocation = { point: Vec3; distance: number; fraction: number; segment: number; parameter: number };
/** Project a canvas pick onto its analytic segment. UI pixels only choose a
 * target; command coordinates are checked against the model tolerance. */
export function locateOnContour(path: ExactContour, point: Vec3): ContourLocation {
  const plane = WORK_PLANES[path.workPlane], p = worldToPlane(point, plane);
  let best: ContourLocation | undefined, traversed = 0;
  path.segments.forEach((s, index) => {
    let t: number;
    if (s.kind === "line") {
      const d = s.end.map((v, i) => v - s.start[i]);
      t = Math.max(0, Math.min(1, d.reduce((sum, v, i) => sum + v * (point[i] - s.start[i]), 0) / d.reduce((sum, v) => sum + v * v, 0)));
    } else {
      const c = worldToPlane(s.center!, plane), angle = Math.atan2(p[1] - c[1], p[0] - c[0]);
      const delta = ((Math.sign(s.sweep!) * (angle - s.startAngle!) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      t = delta / Math.abs(s.sweep!);
      if (t > 1) t = distance(point, s.start) <= distance(point, s.end) ? 0 : 1;
    }
    const projected = segmentPoint(s, t, path.workPlane), d = distance(projected, point);
    if (!best || d < best.distance) best = { point: projected, distance: d, fraction: traversed + t * length(s), segment: index, parameter: t };
    traversed += length(s);
  });
  return best!;
}

export function intervalSegments(path: ExactContour, start: number, end: number): ContourSegment[] {
  let cursor = 0;
  const result: ContourSegment[] = [], tolerance = contourTolerance([path]);
  for (const s of path.segments) {
    const size = length(s), a = Math.max(start, cursor), b = Math.min(end, cursor + size);
    if (b - a > tolerance) {
      const t0 = Math.max(0, (a - cursor) / size), t1 = Math.min(1, (b - cursor) / size);
      result.push({ ...s, start: segmentPoint(s, t0, path.workPlane), end: segmentPoint(s, t1, path.workPlane), startAngle: s.kind === "arc" ? s.startAngle! + s.sweep! * t0 : undefined, sweep: s.kind === "arc" ? s.sweep! * (t1 - t0) : undefined });
    }
    cursor += size;
  }
  return result;
}

export function breakContour(path: ExactContour, first: Vec3, second?: Vec3): Record<string, unknown>[] {
  const tolerance = contourTolerance([path]), total = contourLength(path);
  const locate = (point: Vec3) => {
    const hit = locateOnContour(path, point);
    if (hit.distance > tolerance) throw new Error(`The break point is not on the contour (model tolerance ${tolerance.toPrecision(2)} mm). Pick the curve or enter an exact point.`);
    return hit.fraction;
  };
  let a = locate(first), b = second ? locate(second) : a;
  const wrap = (start: number, end: number) => [...intervalSegments(path, start, total), ...intervalSegments(path, 0, end)];
  let pieces: ContourSegment[][];
  if (path.closed) {
    // Two points remove first→second in the contour's stored direction.
    // Reverse the points in the UI to remove the complementary interval.
    if (second && (Math.abs(a - b) <= tolerance || total - Math.abs(a - b) <= tolerance)) throw new Error("Choose two different points, or use Split at one point to open the contour.");
    pieces = second ? [b < a ? intervalSegments(path, b, a) : wrap(b, a)] : [wrap(a, a)];
  } else {
    if (a > b) [a, b] = [b, a];
    if (!second && (a <= tolerance || total - a <= tolerance)) throw new Error("Choose an interior point; splitting an endpoint leaves the contour unchanged.");
    if (second && b - a <= tolerance) throw new Error("Choose two different points to remove a gap.");
    pieces = [intervalSegments(path, 0, a), intervalSegments(path, b, total)].filter(p => p.length);
  }
  if (!pieces.length) throw new Error("This would remove the whole contour. Use Delete instead.");
  return pieces.map(segments => contourParams({ workPlane: path.workPlane, closed: false, segments }));
}
