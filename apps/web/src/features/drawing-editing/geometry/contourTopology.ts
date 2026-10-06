import type { CadFeature, CadObject } from "@agent-webcad/cad-document";
import { createDrawingTopology, type DrawingTopology } from "../../../precision/drawingTopology";
import { exactDrawingContour, contourTolerance, segmentPoint, type ExactContour, type ContourSegment } from "./contourEditing";
import type { Vec3 } from "../../../precision/workPlane";
import { drawingReferenceGeometry } from "../../../precision/drawingReference";

/** Unchanged analytic edges retain identity through replacement and reversal.
 * New cut edges receive new IDs; dependent routes explicitly choose them. */
export function replacementTopology(params: Record<string, unknown>, path: ExactContour, sources: { object: CadObject; feature: CadFeature }[], id: string): DrawingTopology {
  const topology = createDrawingTopology(String(params.kind), params, id), old = sources.map(s => ({ path: exactDrawingContour(s.object, s.feature), topology: s.feature.params.topology as DrawingTopology }));
  const tolerance = contourTolerance([path, ...old.map(o => o.path)]), near = (a: Vec3, b: Vec3) => Math.hypot(...a.map((v, i) => v - b[i])) <= tolerance;
  const equal = (a: ContourSegment, b: ContourSegment) => a.kind === b.kind && (near(a.start, b.start) && near(a.end, b.end) || near(a.start, b.end) && near(a.end, b.start)) && (a.kind === "line" || near(a.center!, b.center!) && Math.abs(a.radius! - b.radius!) <= tolerance && near(segmentPoint(a, .5, path.workPlane), segmentPoint(b, .5, path.workPlane)) && Math.abs(Math.abs(a.sweep!) - Math.abs(b.sweep!)) <= 1e-9);
  const used = new Set<string>();
  topology.segments.forEach((s, index) => {
    const matches = old.flatMap(o => o.path.segments.flatMap((edge, i) => equal(edge, path.segments[index]) ? [o.topology?.segments[i]?.id ?? o.topology?.curves[0]?.id].filter((v): v is string => !!v) : []));
    if (matches.length === 1 && !used.has(matches[0])) s.id = matches[0]; used.add(s.id);
  });
  if (topology.curves.length && path.segments.length === 1) {
    const match = old.flatMap(o => o.path.segments.flatMap((s, i) => equal(s, path.segments[0]) ? [o.topology?.segments[i]?.id ?? o.topology?.curves[0]?.id].filter((v): v is string => !!v) : []));
    if (match.length === 1) topology.curves[0].id = match[0];
  }
  const newObject = { ...sources[0].object, transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } } as CadObject;
  const newFeature = { ...sources[0].feature, params: { ...params, topology } };
  const oldPoints = sources.flatMap(s => (s.feature.params.topology as DrawingTopology).controls.filter(c => c.role !== "radius").flatMap(c => {
    const point = drawingReferenceGeometry(s.object, s.feature, { topologyId: c.id })?.points?.[0];
    return point ? [{ control: c, point }] : [];
  }));
  for (const control of topology.controls) {
    if (control.role === "radius") continue;
    const point = drawingReferenceGeometry(newObject, newFeature, { topologyId: control.id })?.points?.[0];
    const matches = point ? oldPoints.filter(p => (p.control.role === "center") === (control.role === "center") && near(p.point, point)) : [];
    if (matches.length !== 1 || used.has(matches[0].control.id)) continue;
    const previous = control.id; control.id = matches[0].control.id; used.add(control.id);
    for (const edge of topology.segments) { if (edge.startControlId === previous) edge.startControlId = control.id; if (edge.endControlId === previous) edge.endControlId = control.id; }
  }
  return topology;
}
