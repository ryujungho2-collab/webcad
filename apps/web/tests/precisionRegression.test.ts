import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { CadDocument, CadFeature, CadObject } from "@agent-webcad/cad-document";
import { resolveLineEdit } from "../src/precision/lineEditing";
import { getObjectWorldBounds, getSelectionWorldBounds } from "../src/precision/worldBounds";
import { getWorldDrawingGeometry } from "../src/precision/worldGeometry";

function object(id: string, translation: [number, number, number] = [0, 0, 0]): CadObject {
  return {
    id,
    geometryId: `geometry-${id}`,
    name: id,
    visible: true,
    layerId: "layer-default",
    transform: { translation, rotation: [0, 0, 0], scale: [1, 1, 1] },
  };
}

function drawing(id: string, kind: string, params: Record<string, unknown>): CadFeature {
  return { id: `feature-${id}`, type: "drawing", inputs: [], output: id, params: { kind, workPlane: "XY", ...params } };
}

describe("world drawing geometry", () => {
  test("applies object translation, rotation and scale once", () => {
    const lineObject = object("line", [5, 3, 0]);
    lineObject.transform = { translation: [5, 3, 0], rotation: [0, 0, 90], scale: [2, 2, 1] };
    const world = getWorldDrawingGeometry(lineObject, drawing("line", "line", { points: [[0, 0, 0], [10, 0, 0]] }));
    assert.ok(world?.points);
    assert.deepEqual(world.points.map((point) => point.map((value) => Math.round(value * 1e9) / 1e9)), [
      [10, -7, 0],
      [10, 13, 0],
    ]);
  });

  test("does not report a circular radius after non-uniform plane scaling", () => {
    const circleObject = object("circle");
    circleObject.transform = { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [2, 1, 1] };
    const world = getWorldDrawingGeometry(circleObject, drawing("circle", "circle", { center: [0, 0, 0], radius: 5 }));
    assert.equal(world?.uniformScale, false);
    assert.equal(world?.radius, undefined);
  });
});

describe("trim and extend regression", () => {
  test("trims a translated line using the same world geometry as preview", () => {
    const targetObject = object("target", [5, 0, 0]);
    const targetFeature = drawing("target", "line", { points: [[0, 0, 0], [10, 0, 0]] });
    const cutterObject = object("cutter");
    const cutterFeature = drawing("cutter", "line", { points: [[10, -5, 0], [10, 5, 0]] });
    const result = resolveLineEdit("trim", targetObject, targetFeature, cutterObject, cutterFeature, [14, 0, 0]);
    assert.deepEqual(result?.points, [[0, 0, 0], [5, 0, 0]]);
    assert.deepEqual(result?.intersection, [10, 0, 0]);
    assert.deepEqual(result?.preview, [[10, 0, 0], [15, 0, 0]]);
  });

  test("extends the nearest endpoint to the boundary", () => {
    const targetObject = object("target", [5, 0, 0]);
    const targetFeature = drawing("target", "line", { points: [[0, 0, 0], [5, 0, 0]] });
    const cutterObject = object("cutter");
    const cutterFeature = drawing("cutter", "line", { points: [[12, -5, 0], [12, 5, 0]] });
    const result = resolveLineEdit("extend", targetObject, targetFeature, cutterObject, cutterFeature, [10, 0, 0]);
    assert.deepEqual(result?.points, [[0, 0, 0], [7, 0, 0]]);
    assert.deepEqual(result?.intersection, [12, 0, 0]);
  });
});

describe("world bounds", () => {
  test("combines transformed primitive and drawing extents", () => {
    const box = object("box");
    box.transform = { translation: [0, 0, 0], rotation: [0, 0, 90], scale: [1, 1, 1] };
    const line = object("line", [20, 0, 0]);
    const document: CadDocument = {
      id: "document",
      revision: 0,
      objects: { box, line },
      features: {
        "feature-box": { id: "feature-box", type: "primitive", inputs: [], output: "box", params: { kind: "box", width: 10, depth: 2, height: 1 } },
        "feature-line": drawing("line", "line", { points: [[0, 0, 0], [5, 0, 0]] }),
      },
      layers: { "layer-default": { id: "layer-default", name: "Default", visible: true, locked: false, objectIds: ["box", "line"] } },
      rootObjects: ["box", "line"],
      rootLayers: ["layer-default"],
    };
    const boxBounds = getObjectWorldBounds(document, "box");
    assert.ok(boxBounds);
    assert.ok(Math.abs(boxBounds.min[0] + 2) < 1e-9);
    assert.ok(Math.abs(boxBounds.max[1] - 10) < 1e-9);
    assert.deepEqual(getSelectionWorldBounds(document, ["box", "line"]), {
      min: boxBounds.min,
      max: [25, 10, 1],
    });
  });
});
