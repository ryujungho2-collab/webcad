import { linearToleranceAt, type CadObject, type CadFeature } from "@agent-webcad/cad-document";
import type { DrawingTopology } from "./drawingTopology";
import { getWorldDrawingGeometry } from "./worldGeometry";
import type { Vec3, WorkPlaneId } from "./workPlane";

export type DimensionSource = { workPlane: WorkPlaneId; points?: Vec3[]; center?: Vec3; radius?: number };
/** Resolve saved edge identity, never the current position of an edge in an array. */
export function dimensionSourceGeometry(object: CadObject, feature: CadFeature, segmentId?: string): DimensionSource | undefined {
  if (feature.type !== "drawing") return;
  const w = getWorldDrawingGeometry(object, feature); if (!w?.planeAligned) return;
  if (segmentId) {
    const topology = feature.params.topology as DrawingTopology | undefined;
    const index = topology?.segments.findIndex(s => s.id === segmentId) ?? -1;
    if (index >= 0) {
      const s = w.profileSegments?.[index]; if (!s) return;
      return s.kind === "line" ? { workPlane: w.workPlane, points: [s.start, s.end] } : w.uniformScale ? { workPlane: w.workPlane, center: s.center, radius: s.radius } : undefined;
    }
    if (!topology?.curves.some(c => c.id === segmentId)) return;
  }
  if ((w.kind === "line" || w.kind === "polyline" && !w.closed) && w.profileSegments?.length) {
    const start = w.profileSegments[0].start, end = w.profileSegments.at(-1)!.end;
    if (Math.hypot(...start.map((v, i) => v - end[i])) <= linearToleranceAt(...start, ...end)) return;
    return { workPlane: w.workPlane, points: [start, end] };
  }
  if ((w.kind === "circle" || w.kind === "arc") && w.uniformScale) return { workPlane: w.workPlane, center: w.center, radius: w.radius };
}
