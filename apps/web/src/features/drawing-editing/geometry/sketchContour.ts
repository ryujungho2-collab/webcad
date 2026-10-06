import { contourParams, contourTolerance, type ExactContour } from "./contourEditing";
/** A circle's artificial semicircle split must not turn a trimmed sketch arc
 * into a sampled or mixed polyline. Merge only the same analytic circle. */
export function sketchContour(path: ExactContour): ExactContour {
  if (path.closed || path.segments.length < 2) return path;
  const first = path.segments[0], tolerance = contourTolerance([path]);
  if (first.kind !== "arc" || path.segments.some(s => s.kind !== "arc" || Math.sign(s.sweep!) !== Math.sign(first.sweep!) || Math.abs(s.radius! - first.radius!) > tolerance || Math.hypot(...s.center!.map((v, i) => v - first.center![i])) > tolerance)) return path;
  const sweep = path.segments.reduce((sum, s) => sum + s.sweep!, 0);
  if (Math.abs(sweep) >= Math.PI * 2 - 1e-9) return path;
  return { ...path, segments: [{ ...first, end: path.segments.at(-1)!.end, sweep }] };
}

export function sketchContourParams(path: ExactContour): Record<string, unknown> {
  const first = path.segments[0], tolerance = contourTolerance([path]);
  if (path.closed && first?.kind === "arc" && path.segments.every(s => s.kind === "arc" && Math.sign(s.sweep!) === Math.sign(first.sweep!) && Math.abs(s.radius! - first.radius!) <= tolerance && Math.hypot(...s.center!.map((v, i) => v - first.center![i])) <= tolerance) && Math.abs(Math.abs(path.segments.reduce((n, s) => n + s.sweep!, 0)) - Math.PI * 2) <= 1e-9) return { kind: "circle", center: first.center, radius: first.radius, workPlane: path.workPlane };
  return contourParams(sketchContour(path));
}
