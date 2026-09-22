import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  deserializeDocument,
  serializeDocument,
} from "../../../packages/cad-document/src/serialization";
import type { CadDocument } from "../../../packages/cad-document/src/CadDocument";

function legacyDrawingDocument(): CadDocument {
  return {
    id: "legacy-drawing",
    revision: 0,
    objects: {
      line: {
        id: "line",
        geometryId: "geometry-line",
        name: "Line",
        visible: true,
        layerId: "layer-default",
        transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      },
    },
    features: {
      "feature-line": {
        id: "feature-line",
        type: "drawing",
        inputs: [],
        output: "line",
        params: { kind: "line", workPlane: "XY", points: [[0, 0, 0], [10, 0, 0]] },
      },
    },
    layers: {
      "layer-default": {
        id: "layer-default",
        name: "Default",
        visible: true,
        locked: false,
        objectIds: ["line"],
      },
    },
    rootObjects: ["line"],
    rootLayers: ["layer-default"],
  };
}

describe("drawing document persistence", () => {
  test("migrates legacy topology once and preserves references across save/open", () => {
    const opened = deserializeDocument(serializeDocument(legacyDrawingDocument()));
    const topology = opened.features["feature-line"].params.topology;
    assert.ok(topology);
    const reopened = deserializeDocument(serializeDocument(opened));
    assert.deepEqual(reopened.features["feature-line"].params.topology, topology);
  });
});
