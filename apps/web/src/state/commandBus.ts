import {
  CommandBus,
  type CadCommand,
} from "@agent-webcad/cad-commands";

import {
  cadDocument,
} from "./cadDocument";

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

    cadDocument.layers[id] = {
      id,
      name:
        command.name ??
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

    if (!name) {
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

    if (!layer) {
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

    if (!layer) {
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

    if (
      !object ||
      !targetLayer
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

    if (!object) {
      return;
    }

    object.visible =
      command.visible;

    cadDocument.revision += 1;
  }
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

    cadDocument.objects[id] = {
      id,
      geometryId: `geometry-${id}`,
      name: "Box",
      visible: true,
      layerId,
    };

    cadDocument.features[
      `feature-${id}`
    ] = {
      id: `feature-${id}`,
      type: "primitive",
      inputs: [],
      output: id,
      params: {
        width: command.width,
        depth: command.depth,
        height: command.height,
        position:
          command.position ?? [0, 0, 0],
      },
    };

    cadDocument.rootObjects.push(id);
    cadDocument.layers[layerId].objectIds.push(id);
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

    const params =
      structuredClone(
        sourceFeature.params
      );

    const position =
      (
        params.position ??
        [0, 0, 0]
      ) as [
        number,
        number,
        number,
      ];

    params.position = [
      position[0] + 10,
      position[1],
      position[2],
    ];

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

    const layer =
      cadDocument.layers[
        source.layerId
      ];

    if (layer) {
      layer.objectIds.push(
        id
      );
    }

    cadDocument.revision += 1;

    return id;
  }
);