import type { CadDocument } from "@agent-webcad/cad-document";
import { CommandBus, type CadCommand } from "@agent-webcad/cad-commands";
import {
  closeDrawingProfileParams,
  editDrawingControlParams,
  editDrawingCornerParams,
  editDrawingSegmentParams,
  offsetDrawingParams,
} from "../precision/drawingOperations";
import { createDrawingTopology } from "../precision/drawingTopology";
import { resolveLineEdit } from "../precision/lineEditing";
import { drawingPlaneScale, getWorldDrawingGeometry } from "../precision/worldGeometry";
import { getObjectTransform } from "./objectTransform";

/**
 * Command adapters for persistent drawing mutations. Geometry decisions live
 * in precision modules; this layer only validates document policy and commits
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
      name: command.drawing[0].toUpperCase() + command.drawing.slice(1),
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
        kind: command.drawing,
        ...structuredClone(command.params),
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
    feature.params = params;
    document.revision += 1;
  });

  commandBus.registerHandler("edit-drawing-corner", async (command: CadCommand) => {
    if (command.type !== "edit-drawing-corner") return;
    const object = editableObject(command.objectId);
    const feature = featureForObject(command.objectId);
    if (!object?.visible || !feature || feature.type !== "drawing" || feature.params.sketchId) return;
    const params = editDrawingCornerParams(feature.params, command.controlId, command.treatment, command.distance);
    if (!params) return;
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
      if (!edit) return;
      targetFeature.params = { ...targetFeature.params, points: edit.points };
      document.revision += 1;
    });
  }

  commandBus.registerHandler("offset-drawing", async (command: CadCommand) => {
    if (command.type !== "offset-drawing") return;
    const source = document.objects[command.objectId];
    const feature = featureForObject(command.objectId);
    const layer = source ? document.layers[source.layerId] : undefined;
    if (!source || !feature || feature.type !== "drawing" || !layer || layer.locked || !source.visible || !layer.visible) return;
    const world = getWorldDrawingGeometry(source, feature);
    if (!world?.planeAligned) return;
    const kind = String(feature.params.kind);
    const transform = getObjectTransform(source, feature);
    const plane = feature.params.workPlane === "XZ" || feature.params.workPlane === "YZ" ? feature.params.workPlane : "XY";
    const scale = drawingPlaneScale(transform.scale, plane);
    if (!scale.uniform) return;
    const signedDistance = (command.side === "right" ? -command.distance : command.distance) * scale.orientation / scale.magnitude;
    const params = offsetDrawingParams(kind, feature.params, signedDistance);
    if (!params) return;
    const id = `offset-${crypto.randomUUID()}`;
    const featureId = `feature-${id}`;
    document.objects[id] = {
      id,
      geometryId: `geometry-${id}`,
      name: `${source.name} Offset`,
      visible: true,
      layerId: source.layerId,
      transform: structuredClone(transform),
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
