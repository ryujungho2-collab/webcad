import { validAngularDefinition, type AngularDimensionDefinition, type AngularDimensionLine, type AngularDimensionParams, type AngularDimensionReference, type CadDocument } from "@agent-webcad/cad-document";
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
    ...(definition.text !== undefined ? { text: definition.text } : {}), lines: [first, second] };
}
