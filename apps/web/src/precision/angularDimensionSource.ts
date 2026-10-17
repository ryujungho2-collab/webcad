import { CAD_PRECISION, validAngularDefinition, type AngularDimensionDefinition, type AngularDimensionLine, type AngularDimensionParams, type AngularDimensionReference, type CadDocument } from "@agent-webcad/cad-document";
import { getWorldDrawingGeometry } from "./worldGeometry";
import type { DrawingTopology } from "./drawingTopology";
import { resolveAngularDimension } from "./angularDimension";

/** A selected straight edge, never an open polyline's endpoint chord. */
export function angularReferenceLine(document: CadDocument, reference: AngularDimensionReference): AngularDimensionLine {
  const object = document.objects[reference.objectId], feature = Object.values(document.features).find(f => f.output === reference.objectId);
  if (!object || feature?.type !== "drawing") throw new Error("An angular dimension source is missing. Reconnect or remove its annotation before deleting the source.");
  const topology = feature.params.topology as DrawingTopology | undefined;
  const edge = topology?.segments.find(s => s.id === reference.segmentId);
  if (!edge) throw new Error(`'${object.name}' no longer contains the referenced edge. Reconnect the angular dimension to a straight edge.`);
  const world = getWorldDrawingGeometry(object, feature);
  const segment = world?.profileSegments?.find(s => s.topologyReference === reference.segmentId);
  if (!world?.planeAligned || !segment || segment.kind !== "line") throw new Error(`'${object.name}' needs a straight, work-plane-aligned edge for this angular dimension.`);
  return { kind: "line", workPlane: world.workPlane, start: [...segment.start], end: [...segment.end] };
}

export function resolveAngularSources(document: CadDocument, definition: AngularDimensionDefinition, requireEditable = false): AngularDimensionParams {
  if (!validAngularDefinition(definition)) throw new Error("Choose two distinct straight edges, an angle region, and a positive annotation radius.");
  if (requireEditable) for (const ref of [definition.first, definition.second]) {
    const object = document.objects[ref.objectId], layer = object && document.layers[object.layerId];
    if (!object?.visible || !layer?.visible || layer.locked) throw new Error(`Show and unlock '${object?.name ?? ref.objectId}' before reviewing the angular dimension.`);
  }
  const first = angularReferenceLine(document, definition.first), second = angularReferenceLine(document, definition.second);
  const result = resolveAngularDimension(first, second, definition.branch, { radius: definition.radius, text: definition.text ?? undefined });
  if (!result.ok) throw new Error(result.reason);
  return { kind: "angular", workPlane: first.workPlane, first: { ...definition.first }, second: { ...definition.second }, branch: { ...definition.branch }, radius: definition.radius,
    ...(definition.text !== undefined ? { text: definition.text } : {}), ...(definition.style !== undefined ? { style: structuredClone(definition.style) } : {}), lines: [first, second] };
}

/** Keep the reviewed world ray when Join reverses an edge's parameter direction. */
export function remapAngularReference(before: CadDocument, after: CadDocument, definition: AngularDimensionDefinition, slot: "first" | "second", target: AngularDimensionReference): AngularDimensionDefinition {
  const oldLine = angularReferenceLine(before, definition[slot]), newLine = angularReferenceLine(after, target);
  const direction = (line: AngularDimensionLine) => { const d = line.end.map((v,i) => v - line.start[i]), length = Math.hypot(...d); return d.map(v => v / length); };
  const a = direction(oldLine), b = direction(newLine), dot = a.reduce((n,v,i) => n + v * b[i], 0);
  const cross = Math.hypot(a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]);
  if (!Number.isFinite(cross) || cross > Math.sin(CAD_PRECISION.angularTolerance) || oldLine.workPlane !== newLine.workPlane) throw new Error("Choose a straight result edge retaining the angular reference's direction. Reconnect the annotation before changing its measured direction.");
  const next = structuredClone(definition), ray = slot === "first" ? "firstRay" : "secondRay";
  next[slot] = { ...target };
  if (dot < 0) next.branch[ray] = next.branch[ray] === 1 ? -1 : 1;
  return next;
}

/** File/recovery snapshots must agree with the live references before publication. */
export function assertAngularEvaluation(document: CadDocument) {
  for (const f of Object.values(document.features)) if (f.type === "dimension" && f.params.kind === "angular") {
    const resolved = resolveAngularSources(document, f.params as AngularDimensionDefinition);
    if (JSON.stringify(resolved.lines) !== JSON.stringify(f.params.lines) || resolved.workPlane !== f.params.workPlane) throw new Error(`Angular annotation '${document.objects[f.output]?.name ?? f.output}' has an outdated measurement snapshot. Repair its source references before opening this file.`);
  }
}
