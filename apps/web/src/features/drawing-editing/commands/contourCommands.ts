import type { CadDocument, CadFeature, CadObject } from "@agent-webcad/cad-document";
import type { CadCommand, CommandBus, ContourReferenceRoute } from "@agent-webcad/cad-commands";
import { exactDrawingContour, contourParams, explodeContour, breakContour, convertContourEdge } from "../geometry/contourEditing";
import { replacementTopology } from "../geometry/contourTopology";
import { trimContour } from "../geometry/trimContour";
import { joinContoursWithBridges } from "../geometry/contourBridges";
import { contourReferenceRequirements, reconnectContourReferences } from "./contourReferences";
import { sketchContourParams } from "../geometry/sketchContour";

type Source = { object: CadObject; feature: CadFeature };
/** Reference/ownership policy is deliberately outside the analytic operations.
 * Later sketch and block adapters can explicitly remap references rather than
 * discarding constraints or using tessellated geometry. */
export function contourSources(document: CadDocument, ids: string[], reconnect = false): Source[] {
  const selected = new Set(ids);
  const sources = ids.map(id => {
    const object = document.objects[id], feature = Object.values(document.features).find(f => f.output === id);
    const layer = object && document.layers[object.layerId];
    if (!object || !feature || feature.type !== "drawing") throw new Error("Select standalone drawing curves. Block and sketch composition editing will use separate adapters.");
    if (!object.visible || !layer?.visible || layer.locked) throw new Error(`Show and unlock '${object.name}' and its layer before editing.`);
    if (feature.params.sketchId && !reconnect) throw new Error("This curve belongs to a sketch. Use Trim/Join with explicit constraint references so ownership and constraints are preserved.");
    if (feature.pattern) throw new Error("Detach the pattern before editing the composition of an instance.");
    if (Object.values(document.parameterBindings ?? {}).some(b => b.target.kind === "feature" && b.target.objectId === id) && !reconnect) throw new Error(`'${object.name}' is driven by an expression. Review its binding with explicit reference routes before replacing its geometry.`);
    return { object, feature };
  });
  for (const f of Object.values(document.features)) {
    if (selected.has(f.output)) continue;
    const referenced = f.inputs.some(id => selected.has(id)) || selected.has(String(f.params.sourceObjectId))
      || Array.isArray(f.params.sourceObjectIds) && f.params.sourceObjectIds.some(id => selected.has(String(id)));
    if (referenced && !reconnect) throw new Error(`'${document.objects[f.output]?.name ?? f.output}' references the selected contour. Edit an independent copy or remove that relationship before replacing the contour.`);
  }
  return sources;
}

export function registerContourCommandHandlers(bus: CommandBus, document: CadDocument) {
  const replace = (sources: Source[], pieces: { params: Record<string, unknown>; source: Source; id?: string }[], routes?: ContourReferenceRoute[]) => {
    // Complete geometry/policy/ID preparation precedes all document mutations.
    if (pieces.length > 4096) throw new Error("Split fewer contours at a time (maximum 4096 output pieces).");
    const prepared = pieces.map((piece, index) => {
      const id = piece.id ?? `contour-${crypto.randomUUID()}`, featureId = `feature-${id}`;
      if (document.objects[id] || document.features[featureId]) throw new Error("The output ID already exists.");
      const params: Record<string, unknown> = { ...structuredClone(piece.params), ...(piece.source.feature.params.construction ? { construction: true } : {}) };
      const object: CadObject = { id, geometryId: `geometry-${id}`, name: `${piece.source.object.name} · ${String(params.kind)} ${index + 1}`, visible: true, layerId: piece.source.object.layerId, transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } };
      const feature: CadFeature = { id: featureId, type: "drawing", inputs: [], dependencyMode: "snapshot", output: id, params };
      params.topology = replacementTopology(params, exactDrawingContour(object, feature), sources, id);
      return { id, featureId, object, feature };
    });
    if (new Set(prepared.map(p => p.id)).size !== prepared.length) throw new Error("Output IDs must be unique.");
    const references = reconnectContourReferences(document, sources.map(s => s.object.id), prepared, routes);
    const removed = new Set(sources.map(s => s.object.id));
    for (const source of sources) { delete document.objects[source.object.id]; delete document.features[source.feature.id]; }
    document.rootObjects = document.rootObjects.filter(id => !removed.has(id));
    for (const layer of Object.values(document.layers)) layer.objectIds = layer.objectIds.filter(id => !removed.has(id));
    for (const p of prepared) {
      document.objects[p.id] = p.object;
      document.features[p.featureId] = p.feature;
      document.rootObjects.push(p.id); document.layers[p.object.layerId].objectIds.push(p.id);
    }
    for (const feature of references.features) document.features[feature.id] = feature;
    for (const sketch of references.sketches) document.sketches![sketch.id] = sketch;
    for (const scene of references.scenes) document.scenes![scene.id] = scene;
    for (const [id, binding] of Object.entries(references.bindings)) { document.parameterBindings ??= {}; document.parameterBindings[id] = binding; }
    document.revision++;
    return { createdIds: prepared.map(p => p.id) };
  };
  bus.registerHandler("join-drawings", (command: CadCommand) => {
    if (command.type !== "join-drawings") return;
    const sources = contourSources(document, command.objectIds, command.referenceRoutes !== undefined);
    if (sources.some(s => s.object.layerId !== sources[0].object.layerId || Boolean(s.feature.params.construction) !== Boolean(sources[0].feature.params.construction))) throw new Error("Join curves on the same layer with the same construction setting so their styles and purpose are preserved.");
    const joined = joinContoursWithBridges(sources.map(s => ({ id: s.object.id, path: exactDrawingContour(s.object, s.feature) })), command.bridges);
    return replace(sources, [{ source: sources[0], id: command.id, params: sources[0].feature.params.sketchId ? sketchContourParams(joined) : contourParams(joined) }], command.referenceRoutes);
  });
  bus.registerHandler("trim-contour", (command: CadCommand) => {
    if (command.type !== "trim-contour") return;
    const sources = contourSources(document, [command.objectId], true), source = sources[0];
    const boundaries = command.cutterIds.map(id => {
      const object = document.objects[id], feature = Object.values(document.features).find(f => f.output === id);
      if (!object?.visible || !feature || feature.type !== "drawing" || !document.layers[object.layerId]?.visible) throw new Error("Choose visible drawing boundaries.");
      return exactDrawingContour(object, feature);
    });
    const trimmed = trimContour(exactDrawingContour(source.object, source.feature), boundaries, command.pickPoint, command.rejoin);
    return replace(sources, trimmed.pieces.map(path => ({ source, params: source.feature.params.sketchId ? sketchContourParams(path) : contourParams(path) })), command.referenceRoutes);
  });
  bus.registerHandler("explode-drawings", (command: CadCommand) => {
    if (command.type !== "explode-drawings") return;
    const sources = contourSources(document, command.objectIds, command.referenceRoutes !== undefined);
    const requirements = contourReferenceRequirements(document,command.objectIds);
    if (sources.some(s=>s.feature.params.sketchId) || requirements.some(r=>r.kind === "sketch" || r.kind === "pattern" || "throughPattern" in r && r.throughPattern)) throw new Error("Explode reference preservation currently supports standalone drawings. Sketch projections and patterns need their ownership adapters.");
    const pieces = sources.flatMap(source => {
      if (!["polyline", "rectangle"].includes(String(source.feature.params.kind))) throw new Error("Explode supports standalone polylines and rectangles. Lines, arcs and circles are already independent curves.");
      return explodeContour(exactDrawingContour(source.object, source.feature)).map(params => ({ params, source }));
    });
    return replace(sources, pieces, command.referenceRoutes);
  });
  bus.registerHandler("break-drawing", (command: CadCommand) => {
    if (command.type !== "break-drawing") return;
    const sources = contourSources(document, [command.objectId], command.referenceRoutes !== undefined), source = sources[0];
    const requirements = contourReferenceRequirements(document, [command.objectId]);
    if (source.feature.params.sketchId || requirements.some(r => r.kind === "sketch" || r.kind === "pattern" || "throughPattern" in r && r.throughPattern)) throw new Error("Break reference preservation currently supports standalone drawings. Edit sketch or pattern relationships separately.");
    if (Object.values(document.scenes ?? {}).some(scene => scene.objectIds.includes(command.objectId))) throw new Error("This contour belongs to a scene. Reassign or remove that scene relationship before Break.");
    const pieces = breakContour(exactDrawingContour(source.object, source.feature), command.firstPoint, command.secondPoint);
    const keep = command.keepResultIndices;
    if (keep?.some(i => !pieces[i])) throw new Error("Choose an existing Break result to keep.");
    // Output order follows the contour, independent of the order of kept indices.
    // Reference indices address this reviewed, filtered output list.
    return replace(sources, pieces.filter((_, i) => !keep || keep.includes(i)).map(params => ({ params, source })), command.referenceRoutes);
  });
  bus.registerHandler("convert-contour-edge", (command: CadCommand) => {
    if (command.type !== "convert-contour-edge") return;
    const sources = contourSources(document, [command.objectId], command.referenceRoutes !== undefined), source = sources[0];
    const requirements = contourReferenceRequirements(document, [command.objectId]);
    if (source.feature.params.sketchId || requirements.some(r => r.kind === "sketch" || r.kind === "pattern" || "throughPattern" in r && r.throughPattern)) throw new Error("Edge conversion currently supports standalone drawings. Edit sketch or pattern relationships separately.");
    if (Object.values(document.scenes ?? {}).some(scene => scene.objectIds.includes(command.objectId))) throw new Error("This contour belongs to a scene. Reassign or remove that scene relationship before converting its edge.");
    const converted = convertContourEdge(exactDrawingContour(source.object, source.feature), command.segmentIndex, command.target, command.radius, command.side);
    return replace(sources, [{ source, params: contourParams(converted) }], command.referenceRoutes);
  });
}
