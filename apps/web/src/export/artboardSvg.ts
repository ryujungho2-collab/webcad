import type { SvgPolyline } from "./svgWriter";

export type ArtboardSvgBounds = { origin: [number, number]; size: [number, number] };
type Point2 = [number, number];
const EPSILON = 1e-8;

function close(a: Point2, b: Point2) { return Math.hypot(a[0] - b[0], a[1] - b[1]) <= EPSILON; }

function clipSegment(a: Point2, b: Point2, minX: number, minY: number, maxX: number, maxY: number) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  let enter = 0, leave = 1;
  for (const [p, q] of [[-dx, a[0] - minX], [dx, maxX - a[0]], [-dy, a[1] - minY], [dy, maxY - a[1]]]) {
    if (Math.abs(p) <= EPSILON) { if (q < 0) return null; continue; }
    const t = q / p;
    if (p < 0) enter = Math.max(enter, t); else leave = Math.min(leave, t);
    if (enter > leave) return null;
  }
  const start: Point2 = [a[0] + enter * dx, a[1] + enter * dy];
  const end: Point2 = [a[0] + leave * dx, a[1] + leave * dy];
  return { start, end, enter, leave };
}

/** Clip strokes to an artboard without inventing boundary edges for closed paths. */
export function clipSvgPolylinesToArtboard(lines: SvgPolyline[], bounds: ArtboardSvgBounds): SvgPolyline[] {
  const [minX, minY] = bounds.origin;
  const maxX = minX + bounds.size[0], maxY = minY + bounds.size[1];
  const output: SvgPolyline[] = [];
  for (const line of lines) {
    if(line.spline||line.ellipse||line.holes?.length){output.push(line);continue;}
    if (line.points.length < 2) continue;
    const inside = (point: Point2) => point[0] >= minX - EPSILON && point[0] <= maxX + EPSILON && point[1] >= minY - EPSILON && point[1] <= maxY + EPSILON;
    if (line.points.every(inside)) { output.push({ ...line, points: line.points.map(point => [...point] as Point2) }); continue; }
    if (line.closed && line.fill) output.push({ ...line, color: "none", lineWeight: undefined, dash: undefined });
    let fragment: Point2[] = [];
    const flush = () => {
      if (fragment.length > 1) output.push({ ...line, points: fragment, closed: false, fill: undefined });
      fragment = [];
    };
    const segmentCount = line.closed ? line.points.length : line.points.length - 1;
    for (let index = 0; index < segmentCount; index += 1) {
      const a = line.points[index], b = line.points[(index + 1) % line.points.length];
      const clipped = clipSegment(a, b, minX, minY, maxX, maxY);
      if (!clipped || close(clipped.start, clipped.end)) { flush(); continue; }
      if (!fragment.length || !close(fragment[fragment.length - 1], clipped.start)) {
        flush();
        fragment = [clipped.start];
      }
      if (!close(fragment[fragment.length - 1], clipped.end)) fragment.push(clipped.end);
      if (clipped.leave < 1 - EPSILON) flush();
    }
    flush();
  }
  return output;
}
