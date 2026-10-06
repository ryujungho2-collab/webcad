import { linearToleranceAt, type CadFeature, type CadObject, type CadConstructionElement } from "@agent-webcad/cad-document";
import type { DrawingTopology } from "./drawingTopology";
import { getWorldDrawingGeometry, type WorldDrawingGeometry } from "./worldGeometry";

/** Resolve document-owned sub-elements in world space, independent of rendering. */
export function drawingReferenceGeometry(object: CadObject, feature: CadFeature, element?: CadConstructionElement): WorldDrawingGeometry | undefined {
  const world = getWorldDrawingGeometry(object, feature); if (!world || !element) return world ?? undefined;
  if (element.span === "endpoints") {
    if (world.closed || !world.profileSegments?.length) return;
    const start = world.profileSegments[0].start, end = world.profileSegments.at(-1)!.end;
    if (Math.hypot(...start.map((v, i) => v - end[i])) <= linearToleranceAt(...start, ...end)) return;
    return { ...world, kind: "line", points: [start, end], center: undefined, radius: undefined, profileSegments: undefined };
  }
  const topology = feature.params.topology as DrawingTopology | undefined;
  const index = topology?.segments.findIndex(s => s.id === element.topologyId) ?? -1;
  if (index >= 0) {
    const s = world.profileSegments?.[index]; if (!s) return;
    if (element.endpoint) return { ...world, kind: "point", closed: false, points: [element.endpoint === "start" ? s.start : s.end], center: undefined, radius: undefined, profileSegments: undefined };
    return { ...world, kind: s.kind, closed: false, points: [s.start, s.end], center: s.center, radius: s.radius, startAngle: s.startAngle, endAngle: s.endAngle, profileSegments: undefined };
  }
  if (topology?.curves.some(c => c.id === element.topologyId)) {
    if (!element.endpoint) return world;
    if (!world.points?.length || world.kind !== "arc") return;
    return { ...world, kind: "point", closed: false, points: [element.endpoint === "start" ? world.points[0] : world.points.at(-1)!], center: undefined, radius: undefined };
  }
  const control = topology?.controls.find(c => c.id === element.topologyId); if (!control || element.endpoint) return;
  const point = world.kind === "point" ? world.points?.[0] : control.role === "center" ? world.center : control.role === "start" || control.role === "radius" ? world.points?.[0] : control.role === "end" ? world.points?.at(-1) : world.profileSegments?.[control.index ?? 0]?.start ?? world.profileSegments?.at(-1)?.end;
  return point ? { ...world, kind: "point", closed: false, points: [point], center: undefined, radius: undefined, profileSegments: undefined } : undefined;
}
