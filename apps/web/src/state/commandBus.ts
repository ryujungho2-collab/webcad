import {
  CommandBus,
  type CadCommand,
} from "@agent-webcad/cad-commands";

import {
  cadDocument,
} from "./cadDocument";
import { getObjectTransform } from "./objectTransform";
import { registerDrawingCommandHandlers } from "./registerDrawingCommandHandlers";
import { registerSketchCommandHandlers } from "./registerSketchCommandHandlers";
import { createDrawingTopology } from "../precision/drawingTopology";
import { extractSketchLoops } from "../precision/sketchProfiles";
import { validateExtrudeOperation } from "../viewport/kernelGeometryService";

export const commandBus =
  new CommandBus();

function restoreDocumentSnapshot(snapshot: typeof cadDocument) {
  cadDocument.id = snapshot.id;
  cadDocument.objects = structuredClone(snapshot.objects);
  cadDocument.features = structuredClone(snapshot.features);
  cadDocument.sketches = structuredClone(snapshot.sketches);
  cadDocument.layers = structuredClone(snapshot.layers);
  cadDocument.rootObjects = [...snapshot.rootObjects];
  cadDocument.rootLayers = [...snapshot.rootLayers];
  cadDocument.revision = snapshot.revision;
}

commandBus.registerHandler("batch", async (command: CadCommand) => {
  if (command.type !== "batch") return;
  // Batches are the transaction boundary. Nested batches are rejected so a
  // child cannot create an independent commit/history boundary.
  if (command.commands.some((entry) => (entry as CadCommand).type === "batch")) {
    return { accepted: false, reason: "Nested batches are not supported." };
  }
  const snapshot = structuredClone(cadDocument);
  const results: unknown[] = [];
  try {
    for (const entry of command.commands) {
      const beforeRevision = cadDocument.revision;
      const result = await commandBus.dispatch(entry);
      // Handlers signal a rejected/no-op command by leaving revision intact.
      // A batch containing one such child must not leak earlier mutations.
      if (cadDocument.revision === beforeRevision) {
        restoreDocumentSnapshot(snapshot);
        return { accepted: false, reason: `Command rejected: ${entry.type}` };
      }
      results.push(result);
    }
  } catch (error) {
    restoreDocumentSnapshot(snapshot);
    return { accepted: false, reason: error instanceof Error ? error.message : "Batch rejected." };
  }
  return { accepted: true, results };
});

commandBus.registerHandler(
  "create-layer",
  async (command: CadCommand) => {
    if (command.type !== "create-layer") {
      return;
    }

    const id =
      command.id ??
      `layer-${crypto.randomUUID()}`;

    if (cadDocument.layers[id]) {
      return;
    }

    const requestedName = command.name?.trim();

    cadDocument.layers[id] = {
      id,
      name:
        requestedName ||
        `Layer ${cadDocument.rootLayers.length + 1}`,
      visible: true,
      locked: false,
      objectIds: [],
    };

    cadDocument.rootLayers.push(id);
    cadDocument.revision += 1;

    return id;
  }
);

commandBus.registerHandler(
  "rename-layer",
  async (command: CadCommand) => {
    if (command.type !== "rename-layer") {
      return;
    }

    const layer =
      cadDocument.layers[command.layerId];

    if (!layer) {
      return;
    }

    const name =
      command.name.trim();

    if (!name || name === layer.name) {
      return;
    }

    layer.name = name;
    cadDocument.revision += 1;
  }
);

commandBus.registerHandler(
  "set-layer-visible",
  async (command: CadCommand) => {
    if (command.type !== "set-layer-visible") {
      return;
    }

    const layer =
      cadDocument.layers[command.layerId];

    if (!layer || layer.visible === command.visible) {
      return;
    }

    layer.visible =
      command.visible;

    cadDocument.revision += 1;
  }
);

commandBus.registerHandler(
  "set-layer-locked",
  async (command: CadCommand) => {
    if (command.type !== "set-layer-locked") {
      return;
    }

    const layer =
      cadDocument.layers[command.layerId];

    if (!layer || layer.locked === command.locked) {
      return;
    }

    layer.locked =
      command.locked;

    cadDocument.revision += 1;
  }
);

commandBus.registerHandler(
  "move-object-to-layer",
  async (command: CadCommand) => {
    if (
      command.type !==
      "move-object-to-layer"
    ) {
      return;
    }

    const object =
      cadDocument.objects[
        command.objectId
      ];

    const targetLayer =
      cadDocument.layers[
        command.layerId
      ];

    const sourceLayer = object
      ? cadDocument.layers[object.layerId]
      : undefined;

    if (
      !object ||
      !targetLayer ||
      object.layerId === targetLayer.id ||
      sourceLayer?.locked ||
      Boolean(Object.values(cadDocument.features).find((feature) => feature.output === command.objectId)?.params.sketchId) ||
      targetLayer.locked
    ) {
      return;
    }

    /*
     * Remove ONLY this object
     * from every layer.
     *
     * This also repairs stale /
     * duplicated layer membership.
     */
    for (
      const layer
      of Object.values(
        cadDocument.layers
      )
    ) {
      layer.objectIds =
        layer.objectIds.filter(
          (objectId) =>
            objectId !== object.id
        );
    }

    object.layerId =
      targetLayer.id;

    targetLayer.objectIds.push(
      object.id
    );

    cadDocument.revision += 1;
  }
);

commandBus.registerHandler(
  "set-object-visible",
  async (command: CadCommand) => {
    if (command.type !== "set-object-visible") {
      return;
    }

    const object =
      cadDocument.objects[
        command.objectId
      ];
    const layer = object ? cadDocument.layers[object.layerId] : undefined;

    if (!object || layer?.locked || object.visible === command.visible) {
      return;
    }

    object.visible =
      command.visible;

    cadDocument.revision += 1;
  }
);

commandBus.registerHandler(
  "isolate-object",
  async (command: CadCommand) => {
    if (command.type !== "isolate-object" || !cadDocument.objects[command.objectId]) return;
    const target = cadDocument.objects[command.objectId];
    const targetLayer = cadDocument.layers[target.layerId];
    if (targetLayer?.locked || Object.values(cadDocument.objects).some((object) => {
      const layer = cadDocument.layers[object.layerId];
      return object.visible !== (object.id === command.objectId) && layer?.locked;
    })) return;
    let changed = false;
    for (const object of Object.values(cadDocument.objects)) {
      const visible = object.id === command.objectId;
      if (object.visible !== visible) {
        object.visible = visible;
        changed = true;
      }
    }
    if (changed) cadDocument.revision += 1;
  },
);

commandBus.registerHandler(
  "show-all-objects",
  async (command: CadCommand) => {
    if (command.type !== "show-all-objects") return;
    if (Object.values(cadDocument.objects).some((object) => {
      const layer = cadDocument.layers[object.layerId];
      return !object.visible && layer?.locked;
    })) return;
    let changed = false;
    for (const object of Object.values(cadDocument.objects)) {
      if (!object.visible) {
        object.visible = true;
        changed = true;
      }
    }
    if (changed) cadDocument.revision += 1;
  },
);

commandBus.registerHandler(
  "rename-object",
  async (command: CadCommand) => {
    if (command.type !== "rename-object") {
      return;
    }

    const object = cadDocument.objects[command.objectId];
    const name = command.name.trim();
    const layer = object ? cadDocument.layers[object.layerId] : undefined;

    if (!object || !name || object.name === name || layer?.locked) {
      return;
    }

    object.name = name;
    cadDocument.revision += 1;
  }
);

commandBus.registerHandler(
  "update-box",
  async (command: CadCommand) => {
    if (command.type !== "update-box") {
      return;
    }

    const feature = Object.values(cadDocument.features).find(
      (entry) => entry.output === command.objectId
    );
    const object = cadDocument.objects[command.objectId];
    const layer = object ? cadDocument.layers[object.layerId] : undefined;

    const values = [command.width, command.depth, command.height];
    const currentValues = feature
      ? [feature.params.width, feature.params.depth, feature.params.height].map(Number)
      : [];

    if (
      !feature ||
      feature.type !== "primitive" ||
      !object ||
      layer?.locked ||
      values.some((value) => !Number.isFinite(value)) ||
      command.width <= 0 ||
      command.depth <= 0 ||
      command.height <= 0 ||
      values.every((value, index) => value === currentValues[index])
    ) {
      return;
    }

    feature.params = {
      ...feature.params,
      width: command.width,
      depth: command.depth,
      height: command.height,
    };

    cadDocument.revision += 1;
  }
);

function findFeatureForObject(objectId: string) {
  return Object.values(cadDocument.features).find(
    (feature) => feature.output === objectId,
  );
}

function getEditableObject(objectId: string) {
  const object = cadDocument.objects[objectId];
  const layer = object ? cadDocument.layers[object.layerId] : undefined;
  return object && !layer?.locked && !findFeatureForObject(objectId)?.params.sketchId ? object : undefined;
}

function primitiveKind(feature: { params: Record<string, unknown> }) {
  return typeof feature.params.kind === "string" ? feature.params.kind : "box";
}

function isValidPrimitiveParams(kind: string, params: Record<string, number>) {
  const valid = (key: string) => Number.isFinite(params[key]) && params[key] > 0;
  if (kind === "box") return valid("width") && valid("depth") && valid("height");
  if (kind === "cylinder") return valid("radius") && valid("height");
  if (kind === "sphere") return valid("radius");
  if (kind === "cone") return valid("radius1") && valid("radius2") && valid("height");
  if (kind === "torus") return valid("majorRadius") && valid("minorRadius") && params.majorRadius > params.minorRadius;
  return false;
}

registerDrawingCommandHandlers(commandBus, cadDocument);
registerSketchCommandHandlers(commandBus, cadDocument);

commandBus.registerHandler(
  "create-primitive",
  async (command: CadCommand) => {
    if (command.type !== "create-primitive" || !isValidPrimitiveParams(command.primitive, command.params)) return;
    const id = command.id ?? `${command.primitive}-${crypto.randomUUID()}`;
    const featureId = `feature-${id}`;
    const layerId = command.layerId ?? "layer-default";
    const layer = cadDocument.layers[layerId];
    if (cadDocument.objects[id] || cadDocument.features[featureId] || !layer || layer.locked) return;
    cadDocument.objects[id] = {
      id, geometryId: `geometry-${id}`, name: command.primitive[0].toUpperCase() + command.primitive.slice(1), visible: true, layerId,
      transform: { translation: [...(command.position ?? [0, 0, 0])], rotation: [0, 0, 0], scale: [1, 1, 1] },
    };
    cadDocument.features[featureId] = { id: featureId, type: "primitive", inputs: [], output: id, params: { kind: command.primitive, ...command.params } };
    cadDocument.rootObjects.push(id); layer.objectIds.push(id); cadDocument.revision += 1;
    return id;
  },
);

commandBus.registerHandler("create-extrude", async (command: CadCommand) => {
  if (command.type !== "create-extrude") return;
  const loopResult = extractSketchLoops(cadDocument, command.profileObjectIds);
  if (!loopResult.ok || loopResult.loops.length !== 1) return;
  const profile = loopResult.loops[0];
  const layerId = command.layerId ?? cadDocument.objects[command.profileObjectIds[0]]?.layerId ?? "layer-default";
  const layer = cadDocument.layers[layerId];
  const id = command.id ?? `extrude-${crypto.randomUUID()}`;
  const featureId = `feature-${id}`;
  if (!layer || layer.locked || cadDocument.objects[id] || cadDocument.features[featureId]) return;
  const params = { kind: "extrude", distance: command.distance, profile: structuredClone(profile) };
  try {
    await validateExtrudeOperation(params);
  } catch {
    return;
  }
  cadDocument.objects[id] = {
    id,
    geometryId: `geometry-${id}`,
    name: "Extrude",
    visible: true,
    layerId,
    transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
  };
  cadDocument.features[featureId] = {
    id: featureId,
    type: "extrude",
    inputs: [...profile.sourceObjectIds],
    output: id,
    params,
  };
  cadDocument.rootObjects.push(id);
  layer.objectIds.push(id);
  cadDocument.revision += 1;
  return id;
});

commandBus.registerHandler("update-extrude", async (command: CadCommand) => {
  if (command.type !== "update-extrude") return;
  const object = getEditableObject(command.objectId);
  const feature = findFeatureForObject(command.objectId);
  if (!object || !feature || feature.type !== "extrude" || Number(feature.params.distance) === command.distance) return;
  const params = { ...structuredClone(feature.params), distance: command.distance };
  try {
    await validateExtrudeOperation(params);
  } catch {
    return;
  }
  feature.params = params;
  cadDocument.revision += 1;
});

commandBus.registerHandler(
  "update-primitive",
  async (command: CadCommand) => {
    if (command.type !== "update-primitive") return;
    const object = getEditableObject(command.objectId);
    const feature = findFeatureForObject(command.objectId);
    if (!object || !feature || feature.type !== "primitive") return;
    const kind = primitiveKind(feature);
    if (!isValidPrimitiveParams(kind, command.params)) return;
    const current = Object.fromEntries(Object.entries(feature.params).filter(([key]) => key !== "kind"));
    if (JSON.stringify(current) === JSON.stringify(command.params)) return;
    feature.params = { kind, ...command.params };
    cadDocument.revision += 1;
  },
);

commandBus.registerHandler(
  "move-object",
  async (command: CadCommand) => {
    if (command.type !== "move-object") return;
    const object = getEditableObject(command.objectId);
    if (!object) return;
    const current = getObjectTransform(object, findFeatureForObject(object.id));
    if (command.translation.every((value, index) => value === current.translation[index])) return;
    object.transform = { ...current, translation: [...command.translation] };
    cadDocument.revision += 1;
  },
);

commandBus.registerHandler(
  "rotate-object",
  async (command: CadCommand) => {
    if (command.type !== "rotate-object") return;
    const object = getEditableObject(command.objectId);
    if (!object) return;
    const current = getObjectTransform(object, findFeatureForObject(object.id));
    if (command.rotation.every((value, index) => value === current.rotation[index])) return;
    object.transform = { ...current, rotation: [...command.rotation] };
    cadDocument.revision += 1;
  },
);

commandBus.registerHandler(
  "scale-object",
  async (command: CadCommand) => {
    if (command.type !== "scale-object") return;
    const object = getEditableObject(command.objectId);
    if (!object) return;
    const current = getObjectTransform(object, findFeatureForObject(object.id));
    if (command.scale.every((value, index) => value === current.scale[index])) return;
    object.transform = { ...current, scale: [...command.scale] };
    cadDocument.revision += 1;
  },
);

commandBus.registerHandler(
  "delete-layer",
  async (command: CadCommand) => {
    if (command.type !== "delete-layer") {
      return;
    }

    if (
      command.layerId ===
      "layer-default"
    ) {
      return;
    }

    const layer =
      cadDocument.layers[
        command.layerId
      ];

    const defaultLayer =
      cadDocument.layers[
        "layer-default"
      ];

    if (
      !layer ||
      !defaultLayer ||
      layer.locked ||
      defaultLayer.locked
    ) {
      return;
    }

    /*
     * Deleting a layer does NOT delete
     * its CAD objects.
     *
     * Move them to Default instead.
     */
    for (
      const objectId
      of layer.objectIds
    ) {
      const object =
        cadDocument.objects[
          objectId
        ];

      if (!object) {
        continue;
      }

      object.layerId =
        "layer-default";

      if (
        !defaultLayer.objectIds.includes(
          objectId
        )
      ) {
        defaultLayer.objectIds.push(
          objectId
        );
      }
    }

    // Sketches are document-owned entities even before their viewport adapter
    // is enabled. Keep their layer references valid when a layer is removed.
    for (const sketch of Object.values(cadDocument.sketches ?? {})) {
      if (sketch.layerId === command.layerId) sketch.layerId = "layer-default";
    }

    delete cadDocument.layers[
      command.layerId
    ];

    cadDocument.rootLayers =
      cadDocument.rootLayers.filter(
        (id) =>
          id !== command.layerId
      );

    cadDocument.revision += 1;
  }
);

commandBus.registerHandler(
  "create-box",
  async (command: CadCommand) => {
    if (command.type !== "create-box") {
      return;
    }

    const id =
      command.id ??
      `box-${crypto.randomUUID()}`;

    const layerId =
      command.layerId ??
      "layer-default";

    const layer = cadDocument.layers[layerId];
    const dimensions = [command.width, command.depth, command.height];
    const featureId = `feature-${id}`;

    if (
      cadDocument.objects[id] ||
      cadDocument.features[featureId] ||
      !layer ||
      layer.locked ||
      dimensions.some((value) => !Number.isFinite(value) || value <= 0) ||
      command.position?.some((value) => !Number.isFinite(value))
    ) {
      return;
    }

    cadDocument.objects[id] = {
      id,
      geometryId: `geometry-${id}`,
      name: "Box",
      visible: true,
      layerId,
      transform: {
        translation: [...(command.position ?? [0, 0, 0])],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
    };

    cadDocument.features[
      featureId
    ] = {
      id: featureId,
      type: "primitive",
      inputs: [],
      output: id,
      params: {
        width: command.width,
        depth: command.depth,
        height: command.height,
      },
    };

    cadDocument.rootObjects.push(id);
    layer.objectIds.push(id);
    cadDocument.revision += 1;

    return id;
  }
);

commandBus.registerHandler(
  "delete-object",
  async (command: CadCommand) => {
    if (command.type !== "delete-object") {
      return;
    }

    const object =
      cadDocument.objects[
        command.objectId
      ];

    if (!object) {
      return;
    }

    if (findFeatureForObject(object.id)?.params.sketchId) return;

    const layer =
      cadDocument.layers[
        object.layerId
      ];

    if (layer?.locked) {
      return;
    }

    if (layer) {
      layer.objectIds =
        layer.objectIds.filter(
          (id) =>
            id !== object.id
        );
    }

    cadDocument.rootObjects =
      cadDocument.rootObjects.filter(
        (id) =>
          id !== object.id
      );

    for (
      const [
        featureId,
        feature,
      ]
      of Object.entries(
        cadDocument.features
      )
    ) {
      if (
        feature.output ===
        object.id
      ) {
        delete cadDocument.features[
          featureId
        ];
      }
    }

    delete cadDocument.objects[
      object.id
    ];

    cadDocument.revision += 1;
  }
);

commandBus.registerHandler(
  "duplicate-object",
  async (command: CadCommand) => {
    if (command.type !== "duplicate-object") {
      return;
    }

    const source =
      cadDocument.objects[
        command.objectId
      ];

    if (!source) {
      return;
    }

    const sourceLayer = cadDocument.layers[source.layerId];

    if (!sourceLayer || sourceLayer.locked) {
      return;
    }

    const sourceFeature =
      Object.values(
        cadDocument.features
      ).find(
        (feature) =>
          feature.output ===
          source.id
      );

    if (!sourceFeature) {
      return;
    }

    // Sketch geometry is owned by its sketch. A standalone duplicate must not
    // retain the ownership marker or it would be mistaken for a projection.
    if (sourceFeature.params.sketchId) return;

    const id =
      `copy-${crypto.randomUUID()}`;

    const featureId =
      `feature-${id}`;

    const params = structuredClone(sourceFeature.params);
    const sourceTransform = getObjectTransform(source, sourceFeature);
    const offset = command.offset ?? [10, 0, 0];

    // A duplicate is a new topological entity. Reusing the source IDs makes
    // overlapping Direct Select candidates indistinguishable and would let a
    // future constraint reference accidentally address the wrong copy.
    if (sourceFeature.type === "drawing") {
      const kind = String(params.kind ?? "drawing");
      params.topology = createDrawingTopology(kind, params, id);
    }

    cadDocument.objects[id] = {
      id,
      geometryId:
        `geometry-${id}`,
      name:
        `${source.name} Copy`,
      visible:
        source.visible,
      layerId:
        source.layerId,
      transform: {
        ...sourceTransform,
        translation: [
          sourceTransform.translation[0] + offset[0],
          sourceTransform.translation[1] + offset[1],
          sourceTransform.translation[2] + offset[2],
        ],
      },
    };

    cadDocument.features[
      featureId
    ] = {
      ...structuredClone(
        sourceFeature
      ),
      id: featureId,
      output: id,
      params,
    };

    cadDocument.rootObjects.push(
      id
    );

    sourceLayer.objectIds.push(
      id
    );

    cadDocument.revision += 1;

    return id;
  }
);

commandBus.registerHandler(
  "boolean-operation",
  async (command: CadCommand) => {
    if (command.type !== "boolean-operation") return;
    const target = cadDocument.objects[command.target];
    const tool = cadDocument.objects[command.tool];
    const targetFeature = findFeatureForObject(command.target);
    const toolFeature = findFeatureForObject(command.tool);
    const targetLayer = target ? cadDocument.layers[target.layerId] : undefined;
    const toolLayer = tool ? cadDocument.layers[tool.layerId] : undefined;
    if (!target || !tool || !targetFeature || !toolFeature || targetFeature.type !== "primitive" || toolFeature.type !== "primitive" || targetLayer?.locked || toolLayer?.locked) return;
    const id = `boolean-${crypto.randomUUID()}`;
    const featureId = `feature-${id}`;
    const operands = [target, tool].map((object, index) => ({
      params: structuredClone((index === 0 ? targetFeature : toolFeature).params),
      transform: structuredClone(getObjectTransform(object, index === 0 ? targetFeature : toolFeature)),
    }));
    for (const object of [target, tool]) {
      const layer = cadDocument.layers[object.layerId];
      if (layer) layer.objectIds = layer.objectIds.filter((objectId) => objectId !== object.id);
      cadDocument.rootObjects = cadDocument.rootObjects.filter((objectId) => objectId !== object.id);
      for (const [existingFeatureId, feature] of Object.entries(cadDocument.features)) {
        if (feature.output === object.id) delete cadDocument.features[existingFeatureId];
      }
      delete cadDocument.objects[object.id];
    }
    cadDocument.objects[id] = { id, geometryId: `geometry-${id}`, name: `${command.operation[0].toUpperCase()}${command.operation.slice(1)}`, visible: true, layerId: target.layerId, transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } };
    cadDocument.features[featureId] = { id: featureId, type: "boolean", inputs: [target.id, tool.id], output: id, params: { operation: command.operation, operands } };
    cadDocument.rootObjects.push(id); targetLayer?.objectIds.push(id); cadDocument.revision += 1;
    return id;
  },
);
