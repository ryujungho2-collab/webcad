import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { CadDocument, CadFeature, CadObject } from "@agent-webcad/cad-document";
import { resolveLineEdit } from "../src/precision/lineEditing";
import { getObjectWorldBounds, getSelectionWorldBounds } from "../src/precision/worldBounds";
import { getWorldDrawingGeometry } from "../src/precision/worldGeometry";
import { editDrawingCornerParams } from "../src/precision/drawingOperations";
import { createDrawingTopology } from "../src/precision/drawingTopology";
import { querySnap } from "../src/precision/snapEngine";
import { WORK_PLANES } from "../src/precision/workPlane";
import { measureDrawing } from "../src/precision/measurements";

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

  test("keeps fillet arcs exact and OSNAP-addressable in world geometry", () => {
    const points: [number, number, number][] = [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0]];
    const topology = createDrawingTopology("rectangle", { points }, "profile");
    const filleted = editDrawingCornerParams({ kind: "rectangle", workPlane: "XY", points, topology }, "profile:vertex:1", "fillet", 2);
    assert.ok(filleted);
    const profileObject = object("profile");
    const world = getWorldDrawingGeometry(profileObject, drawing("profile", "polyline", filleted!));
    const arc = world?.profileSegments?.find((segment) => segment.kind === "arc");
    assert.ok(arc?.center && arc.radius);
    const snap = querySnap({
      point: arc.center,
      entities: [{ objectId: "profile", kind: "polyline", points: world?.points, profileSegments: world?.profileSegments }],
      plane: WORK_PLANES.XY,
      gridStep: 1,
      tolerancePx: 0.1,
      project: (point) => [point[0], point[1]],
    });
    assert.equal(snap.type, "center");
    assert.equal(snap.topologyReference, `${arc.topologyReference}:center`);
    const measurement = measureDrawing({ kind: "polyline", workPlane: "XY", points: world?.points, profileSegments: world?.profileSegments, closed: true });
    assert.ok(Math.abs(measurement.area! - (96 + Math.PI)) < 1e-9);
    assert.ok(Math.abs(measurement.distance! - (36 + Math.PI)) < 1e-9);
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

  test("computes extrusion bounds from the exact profile and signed sweep", () => {
    const document: CadDocument = {
      id: "extrude-bounds",
      revision: 0,
      objects: {
        solid: { id: "solid", geometryId: "geometry-solid", name: "Solid", visible: true, layerId: "layer-default", transform: { translation: [2, 3, 4], rotation: [0, 0, 0], scale: [1, 1, 1] } },
      },
      features: {
        feature: { id: "feature", type: "extrude", inputs: ["profile"], output: "solid", params: {
          kind: "extrude", distance: -5, profile: { id: "loop", normal: [0, 0, 1], segments: [
            { kind: "line", topologyReference: "a", start: [0, 0, 0], end: [10, 0, 0] },
            { kind: "line", topologyReference: "b", start: [10, 0, 0], end: [10, 6, 0] },
            { kind: "line", topologyReference: "c", start: [10, 6, 0], end: [0, 6, 0] },
            { kind: "line", topologyReference: "d", start: [0, 6, 0], end: [0, 0, 0] },
          ] },
        } },
      },
      layers: { "layer-default": { id: "layer-default", name: "Default", visible: true, locked: false, objectIds: ["solid"] } },
      rootObjects: ["solid"],
      rootLayers: ["layer-default"],
    };
    assert.deepEqual(getObjectWorldBounds(document, "solid"), { min: [2, 3, -1], max: [12, 9, 4] });
  });

  test("ignores hidden, stale, and invalid members in selection bounds", () => {
    const document: CadDocument = {
      id: "selection-bounds", revision: 0,
      objects: { near: object("near"), far: object("far", [100, 0, 0]), invalid: object("invalid") },
      features: {
        near: { id: "near-feature", type: "primitive", inputs: [], output: "near", params: { kind: "box", width: 2, depth: 3, height: 4 } },
        far: { id: "far-feature", type: "primitive", inputs: [], output: "far", params: { kind: "box", width: 2, depth: 3, height: 4 } },
        invalid: { id: "invalid-feature", type: "primitive", inputs: [], output: "invalid", params: { kind: "box", width: Number.NaN, depth: 3, height: 4 } },
      },
      layers: { "layer-default": { id: "layer-default", name: "Default", visible: true, locked: false, objectIds: ["near", "far", "invalid"] } },
      rootObjects: ["near", "far", "invalid"], rootLayers: ["layer-default"],
    };
    document.objects.far.visible = false;
    assert.equal(getObjectWorldBounds(document, "invalid"), null);
    assert.deepEqual(getSelectionWorldBounds(document, ["stale", "far", "invalid", "near"]), { min: [0, 0, 0], max: [2, 3, 4] });
    document.layers["layer-default"].locked = true;
    assert.equal(getSelectionWorldBounds(document, ["near"]), null);
  });
});
