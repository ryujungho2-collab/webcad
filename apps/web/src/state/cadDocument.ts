import type {
  CadDocument,
} from "@agent-webcad/cad-document";

export const cadDocument: CadDocument = {
  id: "document-1",
  revision: 0,

  objects: {
    "demo-part": {
      id: "demo-part",
      geometryId: "geometry-demo-part",
      name: "Boolean Cut Part",
      visible: true,
      layerId: "layer-default",
    },
  },

  features: {},
  sketches: {},

  layers: {
    "layer-default": {
      id: "layer-default",
      name: "Default",
      visible: true,
      locked: false,
      objectIds: [
        "demo-part",
      ],
    },
  },

  rootObjects: [
    "demo-part",
  ],

  rootLayers: [
    "layer-default",
  ],
};
