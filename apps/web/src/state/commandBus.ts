import {
  CommandBus,
  type CadCommand,
} from "@agent-webcad/cad-commands";

import {
  cadDocument,
} from "./cadDocument";
import { getObjectTransform } from "./objectTransform";

export const commandBus =
  new CommandBus();

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

    if (!object || object.visible === command.visible) {
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
  return object && !layer?.locked ? object : undefined;
}

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
      !defaultLayer
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

    const id =
      `copy-${crypto.randomUUID()}`;

    const featureId =
      `feature-${id}`;

    const params = structuredClone(sourceFeature.params);
    const sourceTransform = getObjectTransform(source, sourceFeature);

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
          sourceTransform.translation[0] + 10,
          sourceTransform.translation[1],
          sourceTransform.translation[2],
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
