import type { CadDocument } from "@agent-webcad/cad-document";
import type { CommandBus, CadCommand } from "@agent-webcad/cad-commands";
import { dimensionSourceGeometry } from "../precision/dimensionSource";

/** Annotation mutations belong to dimensions, independently of contour tools. */
export function registerDimensionCommandHandlers(commandBus: CommandBus, document: CadDocument) {
  const featureForObject = (id: string) => Object.values(document.features).find(f => f.output === id);
  const editableObject = (id: string) => {
    const object = document.objects[id], layer = object && document.layers[object.layerId];
    return object && layer?.visible && !layer.locked ? object : undefined;
  };
  commandBus.registerHandler("create-dimension", async (command: CadCommand) => {
    if (command.type !== "create-dimension") return;
    const layerId = command.layerId ?? "layer-default";
    const layer = document.layers[layerId];
    if (!layer || !layer.visible || layer.locked) return;
    const id = command.id ?? `dimension-${crypto.randomUUID()}`;
    const featureId = `feature-${id}`;
    if (document.objects[id] || document.features[featureId]) return;
    const kind = command.dimension;
    const params = structuredClone(command.params);
    if (kind === "diameter" && typeof params.sourceObjectId === "string") {
      const source = editableObject(params.sourceObjectId), sourceFeature = featureForObject(params.sourceObjectId);
      if (!source?.visible || !sourceFeature || !dimensionSourceGeometry(source, sourceFeature, typeof params.sourceSegmentId === "string" ? params.sourceSegmentId : undefined)?.radius) return;
    }
    document.objects[id] = {
      id,
      geometryId: `geometry-${id}`,
      name: kind === "linear" ? "Linear Dimension" : kind === "diameter" ? "Diameter Dimension" : "Radius Dimension",
      visible: true,
      layerId,
      transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    };
    document.features[featureId] = {
      id: featureId,
      type: "dimension",
      inputs: typeof params.sourceObjectId === "string" ? [params.sourceObjectId] : [],
      output: id,
      params: { ...params, kind },
    };
    document.rootObjects.push(id);
    layer.objectIds.push(id);
    document.revision += 1;
    return id;
  });

  commandBus.registerHandler("update-dimension", async (command: CadCommand) => {
    if (command.type !== "update-dimension") return;
    const object = editableObject(command.objectId);
    const feature = featureForObject(command.objectId);
    if (!object?.visible || !feature || feature.type !== "dimension") return;
    const patch = command.params;
    const next = { ...feature.params };
    let changed = false;
    for (const key of ["orientation", "offset", "angle", "text"] as const) {
      if (!(key in patch)) continue;
      const value = key === "text" && patch[key] === "" ? null : patch[key];
      if (JSON.stringify(next[key]) !== JSON.stringify(value)) {
        next[key] = value as never;
        changed = true;
      }
    }
    if (!changed) return;
    feature.params = next;
    document.revision += 1;
  });
}
