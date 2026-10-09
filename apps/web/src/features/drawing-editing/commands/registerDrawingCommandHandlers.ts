import type { CadDocument } from "@agent-webcad/cad-document";
import type { CommandBus, CadCommand } from "@agent-webcad/cad-commands";
import {
  closeDrawingProfileParams,
  editDrawingControlParams,
  editDrawingCornerForObject,
  editDrawingSegmentParams,
  offsetDrawingForObject,
} from "../geometry/drawingOperations";
import { createDrawingTopology } from "../../../precision/drawingTopology";
import { resolveLineEdit } from "../geometry/lineEditing";
import { drawingTransformAfterEdit } from "../../../precision/worldGeometry";
import { connectDrawings } from "../geometry/connectDrawings";

/**
 * Command adapters for persistent drawing mutations. Geometry decisions live
 * in geometry modules; this layer only validates document policy and commits
 * accepted replacements to CadDocument.
 */
export function registerDrawingCommandHandlers(commandBus: CommandBus, document: CadDocument) {
  const featureForObject = (objectId: string) =>
    Object.values(document.features).find((feature) => feature.output === objectId);
  const editableObject = (objectId: string) => {
    const object = document.objects[objectId];
    const layer = object ? document.layers[object.layerId] : undefined;
    return object && layer?.visible && !layer.locked ? object : undefined;
  };

  commandBus.registerHandler("create-drawing", async (command: CadCommand) => {
    if (command.type !== "create-drawing") return;
    const layerId = command.layerId ?? "layer-default";
    const layer = document.layers[layerId];
    if (!layer || !layer.visible || layer.locked) return;
    const id = command.id ?? `${command.drawing}-${crypto.randomUUID()}`;
    const featureId = `feature-${id}`;
    if (document.objects[id] || document.features[featureId]) return;
    document.objects[id] = {
      id,
      geometryId: `geometry-${id}`,
      name: command.name?.trim() || command.drawing[0].toUpperCase() + command.drawing.slice(1),
      visible: true,
      layerId,
      transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    };
    document.features[featureId] = {
      id: featureId,
      type: "drawing",
      inputs: [],
      output: id,
      params: {
        ...structuredClone(command.params),
        kind: command.drawing,
        topology: createDrawingTopology(command.drawing, command.params),
      },
    };
    document.rootObjects.push(id);
    layer.objectIds.push(id);
    document.revision += 1;
    return id;
  });

  commandBus.registerHandler("edit-drawing-control", async (command: CadCommand) => {
    if (command.type !== "edit-drawing-control") return;
    const object = editableObject(command.objectId);
    const feature = featureForObject(command.objectId);
    if (!object?.visible || !feature || feature.type !== "drawing" || feature.params.sketchId) return;
    const params = editDrawingControlParams(feature.params, command.controlId, command.point);
    if (!params) return;
    object.transform=drawingTransformAfterEdit(object,feature,params);
    feature.params = params;
    document.revision += 1;
  });

  commandBus.registerHandler("edit-drawing-segment", async (command: CadCommand) => {
    if (command.type !== "edit-drawing-segment") return;
    const object = editableObject(command.objectId);
    const feature = featureForObject(command.objectId);
    if (!object?.visible || !feature || feature.type !== "drawing" || feature.params.sketchId) return;
    const params = editDrawingSegmentParams(feature.params, command.segmentId, command.delta);
    if (!params) return;
    object.transform=drawingTransformAfterEdit(object,feature,params);
    feature.params = params;
    document.revision += 1;
  });

  commandBus.registerHandler("connect-drawings", (command: CadCommand) => {
    if (command.type !== "connect-drawings") return;
    const sources = [command.firstId, command.secondId].map(id => {
      const object = editableObject(id), feature = featureForObject(id);
      if (!object?.visible || !feature || feature.type !== "drawing") throw new Error("Show and unlock two drawing contours to connect.");
      if (feature.params.sketchId || feature.pattern || feature.construction) throw new Error("Connect standalone contours; edit a sketch, pattern source or construction definition through its owning tool.");
      return { object, feature };
    });
    const construction = Boolean(sources[0].feature.params.construction);
    if (sources.some(s => s.object.layerId !== sources[0].object.layerId || Boolean(s.feature.params.construction) !== construction)) throw new Error("Use the same layer and construction purpose for a connected contour.");
    const edit = connectDrawings(sources[0], sources[1], command.firstPoint, command.secondPoint, command.treatment, command.distance, command.secondDistance);
    const id = command.id ?? `${command.treatment}-${crypto.randomUUID()}`, featureId = `feature-${id}`;
    if (document.objects[id] || document.features[featureId]) throw new Error("The connector ID already exists.");
    sources.forEach((s, i) => { s.object.transform = drawingTransformAfterEdit(s.object, s.feature, edit.replacements[i]); s.feature.params = edit.replacements[i]; });
    const params: Record<string, unknown> = { ...edit.connector, ...(construction ? { construction: true } : {}) };
    document.objects[id] = { id, geometryId: `geometry-${id}`, name: command.treatment === "fillet" ? "Fillet arc" : "Chamfer line", visible: true, layerId: sources[0].object.layerId, transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } };
    document.features[featureId] = { id: featureId, type: "drawing", inputs: [], output: id, params: { ...params, topology: createDrawingTopology(String(params.kind), params, id) } };
    document.rootObjects.push(id); document.layers[sources[0].object.layerId].objectIds.push(id); document.revision++;
    return id;
  });

  commandBus.registerHandler("edit-drawing-corner", async (command: CadCommand) => {
    if (command.type !== "edit-drawing-corner") return;
    const object = editableObject(command.objectId);
    const feature = featureForObject(command.objectId);
    if (!object?.visible || !feature || feature.type !== "drawing") throw new Error("Show and unlock the corner's drawing layer before editing.");
    if (feature.params.sketchId || feature.pattern || feature.construction) throw new Error("Edit this corner through its owning sketch, pattern source or construction definition.");
    const params = editDrawingCornerForObject(object, feature, command.controlId, command.treatment, command.distance, command.secondDistance, command.distanceSpace);
    object.transform = drawingTransformAfterEdit(object, feature, params);
    feature.params = params;
    document.revision += 1;
  });

  commandBus.registerHandler("close-drawing-profile", async (command: CadCommand) => {
    if (command.type !== "close-drawing-profile") return;
    const object = editableObject(command.objectId);
    const feature = featureForObject(command.objectId);
    if (!object?.visible || !feature || feature.type !== "drawing" || feature.params.sketchId) return;
    const params = closeDrawingProfileParams(feature.params);
    if (!params) return;
    object.transform = drawingTransformAfterEdit(object, feature, params);
    feature.params = params;
    document.revision += 1;
  });

  for (const commandType of ["trim-drawing", "extend-drawing"] as const) {
    commandBus.registerHandler(commandType, async (command: CadCommand) => {
      if (command.type !== commandType) return;
      const target = document.objects[command.targetId];
      const cutter = document.objects[command.cutterId];
      const targetFeature = featureForObject(command.targetId);
      const cutterFeature = featureForObject(command.cutterId);
      const targetLayer = target ? document.layers[target.layerId] : undefined;
      const cutterLayer = cutter ? document.layers[cutter.layerId] : undefined;
      if (
        !target || !cutter || !targetFeature || !cutterFeature ||
        targetFeature.type !== "drawing" || cutterFeature.type !== "drawing" || Boolean(targetFeature.params.sketchId) ||
        !target.visible || !cutter.visible || !targetLayer?.visible || !cutterLayer?.visible ||
        targetLayer.locked || cutterLayer.locked
      ) return;
      const edit = resolveLineEdit(
        commandType === "trim-drawing" ? "trim" : "extend",
        target,
        targetFeature,
        cutter,
        cutterFeature,
        command.pickPoint,
      );
      if (!edit) throw new Error("Edit rejected: pick an exposed portion or free end with an actual boundary intersection. Closed polylines and shared interior vertices require Break first.");
      target.transform = drawingTransformAfterEdit(target, targetFeature, edit.params);
      // Vertex structure is unchanged for line/polyline/arc edits, so the
      // existing stable topology ids stay valid. Circle-to-arc conversion
      // changes the control set and regenerates deterministic references;
      // stale sub-selections drop through validSelection instead of dangling.
      targetFeature.params = edit.rebuildTopologyKind
        ? { ...edit.params, kind: edit.rebuildTopologyKind, topology: createDrawingTopology(edit.rebuildTopologyKind, edit.params, target.id) }
        : { ...edit.params, topology: targetFeature.params.topology };
      document.revision += 1;
    });
  }

  commandBus.registerHandler("offset-drawing", async (command: CadCommand) => {
    if (command.type !== "offset-drawing") return;
    const source = document.objects[command.objectId];
    const feature = featureForObject(command.objectId);
    const layer = source ? document.layers[source.layerId] : undefined;
    if (!source || !feature || feature.type !== "drawing" || !layer || layer.locked || !source.visible || !layer.visible) return;
    const kind = String(feature.params.kind);
    const params = offsetDrawingForObject(source, feature, command.distance, command.side);
    if (!params) throw new Error("Offset rejected: the distance collapses a segment/radius or creates an invalid join or crossing. Try a smaller distance or the other side.");
    const id = `offset-${crypto.randomUUID()}`;
    const featureId = `feature-${id}`;
    document.objects[id] = {
      id,
      geometryId: `geometry-${id}`,
      name: `${source.name} Offset`,
      visible: true,
      layerId: source.layerId,
      transform: drawingTransformAfterEdit(source, feature, params),
    };
    document.features[featureId] = {
      id: featureId,
      type: "drawing",
      inputs: [source.id],
      output: id,
      params: { ...params, kind, topology: createDrawingTopology(kind, params, id) },
    };
    document.rootObjects.push(id);
    layer.objectIds.push(id);
    document.revision += 1;
    return id;
  });

}
