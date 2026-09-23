import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  deserializeDocument,
  serializeDocument,
} from "../../../packages/cad-document/src/serialization";
import type { CadDocument } from "../../../packages/cad-document/src/CadDocument";
import { createDrawingTopology } from "../src/precision/drawingTopology";
import { editDrawingCornerParams } from "../src/precision/drawingOperations";

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

  test("round-trips exact closed-profile bulges and topology ids", () => {
    const document = legacyDrawingDocument();
    const points: [number, number, number][] = [[0, 0, 0], [20, 0, 0], [20, 10, 0], [0, 10, 0]];
    const topology = createDrawingTopology("rectangle", { points }, "profile");
    const filleted = editDrawingCornerParams({ kind: "rectangle", workPlane: "XY", points, topology }, "profile:vertex:1", "fillet", 3);
    assert.ok(filleted);
    document.objects.line.name = "Closed fillet profile";
    document.features["feature-line"].params = filleted;
    const reopened = deserializeDocument(serializeDocument(document));
    assert.deepEqual(reopened.features["feature-line"].params.bulges, filleted.bulges);
    assert.deepEqual(reopened.features["feature-line"].params.topology, filleted.topology);
    assert.equal(reopened.features["feature-line"].params.closed, true);
  });

  test("round-trips an extrusion profile and its source topology references", () => {
    const document = legacyDrawingDocument();
    document.objects.extrude = {
      id: "extrude", geometryId: "geometry-extrude", name: "Extrude", visible: true, layerId: "layer-default",
      transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    };
    document.features["feature-extrude"] = {
      id: "feature-extrude", type: "extrude", inputs: ["line"], output: "extrude",
      params: {
        kind: "extrude",
        distance: 8,
        profile: {
          id: "loop:line/feature-line:segment:0",
          workPlane: "XY",
          normal: [0, 0, 1],
          sourceObjectIds: ["line"],
          sourceTopologyIds: ["line/feature-line:segment:0"],
          segments: [{ kind: "line", topologyReference: "line/feature-line:segment:0", start: [0, 0, 0], end: [10, 0, 0] }],
        },
      },
    };
    document.rootObjects.push("extrude");
    document.layers["layer-default"].objectIds.push("extrude");
    const reopened = deserializeDocument(serializeDocument(document));
    assert.deepEqual(reopened.features["feature-extrude"], document.features["feature-extrude"]);
  });
});
