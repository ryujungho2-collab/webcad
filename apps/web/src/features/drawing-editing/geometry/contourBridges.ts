import type { ContourBridge } from "@agent-webcad/cad-commands";
import { joinContours, contourTolerance, type ExactContour } from "./contourEditing";
import { contourIntersections } from "./trimContour";
import type { Vec3 } from "../../../precision/workPlane";
const distance = (a: Vec3, b: Vec3) => Math.hypot(...a.map((v, i) => v - b[i]));

/** Explicit end pairs add straight geometry; no nearest-end guessing. */
export function joinContoursWithBridges(sources: { id: string; path: ExactContour }[], bridges: ContourBridge[] = []): ExactContour {
  const paths = sources.map(s => s.path), tolerance = contourTolerance(paths);
  const endpoint = (id: string, end: "start" | "end") => {
    const p = sources.find(s => s.id === id)?.path;
    if (!p || p.closed) throw new Error("Reconnect endpoints of selected open contours.");
    return end === "start" ? p.segments[0].start : p.segments.at(-1)!.end;
  };
  for (const b of bridges) {
    const start = endpoint(b.fromId, b.fromEnd), end = endpoint(b.toId, b.toEnd), segment = { kind: "line" as const, start, end };
    if (distance(start, end) <= tolerance) throw new Error("This gap is already connected; Join it without a bridge.");
    for (const p of paths) for (const s of p.segments) for (const hit of contourIntersections(segment, s, p, tolerance, true)) {
      if ([start, end].every(e => distance(e, hit) > tolerance) || [p.segments[0].start, p.segments.at(-1)!.end].every(e => distance(e, hit) > tolerance)) throw new Error("The reconnection edge crosses retained geometry. Choose different endpoints.");
    }
    paths.push({ workPlane: paths[0].workPlane, closed: false, segments: [segment] });
  }
  return joinContours(paths);
}
