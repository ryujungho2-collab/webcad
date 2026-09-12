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
    },
  },

  features: {},

  rootObjects: [
    "demo-part",
  ],
};