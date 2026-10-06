import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { CadDocument, CadFeature, CadObject } from "@agent-webcad/cad-document";
import { resolveLineEdit } from "../src/features/drawing-editing/geometry/lineEditing";
import { getObjectWorldBounds, getSelectionWorldBounds } from "../src/precision/worldBounds";
import { getWorldDrawingGeometry } from "../src/precision/worldGeometry";
import { editDrawingCornerParams } from "../src/features/drawing-editing/geometry/drawingOperations";
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
    assert.deepEqual(result?.params.points, [[0, 0, 0], [5, 0, 0]]);
    assert.deepEqual(result?.intersection, [10, 0, 0]);
    assert.deepEqual(result?.previewPoints, [[10, 0, 0], [15, 0, 0]]);
  });

  test("extends the nearest endpoint to the boundary", () => {
    const targetObject = object("target", [5, 0, 0]);
    const targetFeature = drawing("target", "line", { points: [[0, 0, 0], [5, 0, 0]] });
    const cutterObject = object("cutter");
    const cutterFeature = drawing("cutter", "line", { points: [[12, -5, 0], [12, 5, 0]] });
    const result = resolveLineEdit("extend", targetObject, targetFeature, cutterObject, cutterFeature, [10, 0, 0]);
    assert.deepEqual(result?.params.points, [[0, 0, 0], [7, 0, 0]]);
    assert.deepEqual(result?.intersection, [12, 0, 0]);
  });

  test("trims lines against circle and arc cutters on either side", () => {
    const targetObject = object("target");
    const targetFeature = drawing("target", "line", { points: [[-10, 0, 0], [10, 0, 0]] });
    const circleCutter = drawing("cutter", "circle", { center: [0, 0, 0], radius: 5 });
    const left = resolveLineEdit("trim", targetObject, targetFeature, object("cutter"), circleCutter, [-8, 0, 0]);
    assert.deepEqual(left?.params.points, [[-5, 0, 0], [10, 0, 0]]);
    assert.deepEqual(left?.intersection, [-5, 0, 0]);
    const right = resolveLineEdit("trim", targetObject, targetFeature, object("cutter"), circleCutter, [8, 0, 0]);
    assert.deepEqual(right?.params.points, [[-10, 0, 0], [5, 0, 0]]);

    const arcCutter = drawing("cutter", "arc", { center: [10, 0, 0], radius: 5, startAngle: Math.PI / 2, endAngle: 3 * Math.PI / 2 });
    const longTarget = drawing("target", "line", { points: [[0, 0, 0], [20, 0, 0]] });
    const trimmed = resolveLineEdit("trim", targetObject, longTarget, object("cutter"), arcCutter, [18, 0, 0]);
    assert.deepEqual(trimmed?.params.points, [[0, 0, 0], [5, 0, 0]]);
  });

  test("trims on XZ and YZ work planes", () => {
    const xzTarget = drawing("target", "line", { workPlane: "XZ", points: [[0, 3, 0], [10, 3, 0]] });
    const xzCutter = drawing("cutter", "line", { workPlane: "XZ", points: [[5, 3, -5], [5, 3, 5]] });
    assert.deepEqual(
      resolveLineEdit("trim", object("target"), xzTarget, object("cutter"), xzCutter, [8, 3, 0])?.params.points,
      [[0, 3, 0], [5, 3, 0]],
    );
    const yzTarget = drawing("target", "line", { workPlane: "YZ", points: [[0, 0, 0], [0, 10, 0]] });
    const yzCutter = drawing("cutter", "line", { workPlane: "YZ", points: [[0, 5, -5], [0, 5, 5]] });
    assert.deepEqual(
      resolveLineEdit("trim", object("target"), yzTarget, object("cutter"), yzCutter, [0, 8, 0])?.params.points,
      [[0, 0, 0], [0, 5, 0]],
    );
  });

  test("trims rotated lines using world geometry", () => {
    const targetObject: CadObject = {
      id: "target", geometryId: "geometry-target", name: "target", visible: true, layerId: "layer-default",
      transform: { translation: [0, 0, 0], rotation: [0, 0, 90], scale: [1, 1, 1] },
    };
    const targetFeature = drawing("target", "line", { points: [[0, 0, 0], [10, 0, 0]] });
    const cutterFeature = drawing("cutter", "line", { points: [[-10, 0, 0], [10, 0, 0]] });
    const result = resolveLineEdit("trim", targetObject, targetFeature, object("cutter"), cutterFeature, [5, -4, 0]);
    assert.deepEqual(result?.params.points, [[5, 0, 0], [10, 0, 0]]);
    assert.deepEqual(result?.intersection, [5, 0, 0]);
  });

  test("rejects endpoint touches, misses, tangents, coincidence, splits and degenerate input", () => {
    const targetObject = object("target");
    const targetFeature = drawing("target", "line", { points: [[-10, 0, 0], [10, 0, 0]] });
    const endTouch = drawing("cutter", "line", { points: [[10, -5, 0], [10, 5, 0]] });
    assert.equal(resolveLineEdit("trim", targetObject, targetFeature, object("cutter"), endTouch, [9, 0, 0]), null);
    const parallel = drawing("cutter", "line", { points: [[-10, 5, 0], [10, 5, 0]] });
    assert.equal(resolveLineEdit("trim", targetObject, targetFeature, object("cutter"), parallel, [0, 0, 0]), null);
    const tangent = drawing("cutter", "circle", { center: [0, 5, 0], radius: 5 });
    assert.equal(resolveLineEdit("trim", targetObject, targetFeature, object("cutter"), tangent, [0, 0, 0]), null);
    const coincident = drawing("cutter", "line", { points: [[-10, 0, 0], [10, 0, 0]] });
    assert.equal(resolveLineEdit("trim", targetObject, targetFeature, object("cutter"), coincident, [0, 0, 0]), null);
    const circle = drawing("cutter", "circle", { center: [0, 0, 0], radius: 5 });
    assert.equal(resolveLineEdit("trim", targetObject, targetFeature, object("cutter"), circle, [0, 0, 0]), null);
    const collapsedTarget = drawing("target", "line", { points: [[4, 4, 0], [4, 4, 0]] });
    const cutter = drawing("cutter", "line", { points: [[10, -5, 0], [10, 5, 0]] });
    assert.equal(resolveLineEdit("trim", targetObject, collapsedTarget, object("cutter"), cutter, [4, 4, 0]), null);
    const collapsedCutter = drawing("cutter", "line", { points: [[1, 1, 0], [1, 1, 0]] });
    assert.equal(resolveLineEdit("trim", targetObject, targetFeature, object("cutter"), collapsedCutter, [0, 0, 0]), null);
  });

  test("trims and extends open polyline end segments", () => {
    const targetObject = object("target");
    const feature = drawing("target", "polyline", { points: [[0, 0, 0], [10, 0, 0], [10, 10, 0]] });
    const cutter = drawing("cutter", "line", { points: [[4, -5, 0], [4, 15, 0]] });
    const trimmed = resolveLineEdit("trim", targetObject, feature, object("cutter"), cutter, [1, 0, 0]);
    assert.deepEqual(trimmed?.params.points, [[4, 0, 0], [10, 0, 0], [10, 10, 0]]);
    assert.deepEqual(trimmed?.intersection, [4, 0, 0]);
    assert.deepEqual(trimmed?.previewPoints, [[0, 0, 0], [4, 0, 0]]);

    const wall = drawing("cutter", "line", { points: [[5, -5, 0], [5, 15, 0]] });
    const endFeature = drawing("target", "polyline", { points: [[0, 0, 0], [10, 0, 0], [10, 10, 0]] });
    const endTrimmed = resolveLineEdit("trim", targetObject, endFeature, object("cutter"), wall, [10, 9, 0]);
    assert.equal(endTrimmed, null);

    const ledge = drawing("cutter", "line", { points: [[5, 15, 0], [15, 15, 0]] });
    const extended = resolveLineEdit("extend", targetObject, feature, object("cutter"), ledge, [10, 9, 0]);
    assert.deepEqual(extended?.params.points, [[0, 0, 0], [10, 0, 0], [10, 15, 0]]);
    assert.deepEqual(extended?.intersection, [10, 15, 0]);
  });

  test("rejects middle-segment, closed-loop and rectangle trims", () => {
    const targetObject = object("target");
    const open = drawing("target", "polyline", { points: [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0]] });
    const ruling = drawing("cutter", "line", { points: [[-5, 5, 0], [15, 5, 0]] });
    assert.equal(resolveLineEdit("trim", targetObject, open, object("cutter"), ruling, [10, 7, 0]), null);
    const closed = drawing("target", "polyline", { closed: true, points: [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0]] });
    assert.equal(resolveLineEdit("trim", targetObject, closed, object("cutter"), ruling, [10, 7, 0]), null);
    const rectangle = drawing("target", "rectangle", { points: [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0]] });
    assert.equal(resolveLineEdit("trim", targetObject, rectangle, object("cutter"), ruling, [5, 10, 0]), null);
  });

  test("trims and extends arcs by angle without touching topology", () => {
    const targetObject = object("target");
    const feature = drawing("target", "arc", { center: [0, 0, 0], radius: 5, startAngle: 0, endAngle: Math.PI / 2 });
    const cutter = drawing("cutter", "line", { points: [[3, -10, 0], [3, 10, 0]] });
    const pickEnd = [5 * Math.cos(1.3963), 5 * Math.sin(1.3963), 0] as [number, number, number];
    const trimmed = resolveLineEdit("trim", targetObject, feature, object("cutter"), cutter, pickEnd);
    assert.equal(trimmed?.params.startAngle, 0);
    assert.ok(Math.abs(Number(trimmed?.params.endAngle) - Math.atan2(4, 3)) < 1e-9);
    assert.equal(trimmed?.rebuildTopologyKind, undefined);
    assert.ok((trimmed?.previewPoints.length ?? 0) > 2);

    const short = drawing("target", "arc", { center: [0, 0, 0], radius: 5, startAngle: 0, endAngle: Math.PI / 4 });
    const rail = drawing("cutter", "line", { points: [[0, 4, 0], [0, 12, 0]] });
    const pickTip = [5 * Math.cos(0.7), 5 * Math.sin(0.7), 0] as [number, number, number];
    const extended = resolveLineEdit("extend", targetObject, short, object("cutter"), rail, pickTip);
    assert.equal(extended?.params.startAngle, 0);
    assert.ok(Math.abs(Number(extended?.params.endAngle) - Math.PI / 2) < 1e-9);

    const half = drawing("target", "arc", { center: [0, 0, 0], radius: 5, startAngle: 0, endAngle: Math.PI });
    const cross = drawing("cutter", "line", { points: [[-10, 4, 0], [10, 4, 0]] });
    assert.equal(resolveLineEdit("trim", targetObject, half, object("cutter"), cross, [0, 5, 0]), null);
  });

  test("trims circles into arcs and rejects extend and ambiguous cuts", () => {
    const targetObject = object("target");
    const feature = drawing("target", "circle", { center: [0, 0, 0], radius: 5 });
    const cutter = drawing("cutter", "line", { points: [[3, -10, 0], [3, 10, 0]] });
    const trimmed = resolveLineEdit("trim", targetObject, feature, object("cutter"), cutter, [-5, 0, 0]);
    assert.equal(trimmed?.params.kind, "arc");
    assert.equal(trimmed?.rebuildTopologyKind, "arc");
    assert.equal(trimmed?.params.radius, 5);
    assert.deepEqual(trimmed?.params.center, [0, 0, 0]);
    assert.ok(Math.abs(Number(trimmed?.params.startAngle) - Math.atan2(4, 3)) < 1e-9);
    assert.ok(Math.abs(Number(trimmed?.params.endAngle) - (Math.PI * 2 - Math.atan2(4, 3))) < 1e-9);
    assert.ok((trimmed?.previewPoints.length ?? 0) > 2);
    assert.equal(resolveLineEdit("extend", targetObject, feature, object("cutter"), cutter, [5, 0, 0]), null);

    const tangentCutter = drawing("cutter", "line", { points: [[-10, 5, 0], [10, 5, 0]] });
    assert.equal(resolveLineEdit("trim", targetObject, feature, object("cutter"), tangentCutter, [0, -5, 0]), null);
    const boxCutter = drawing("cutter", "rectangle", { points: [[-4, -6, 0], [4, -6, 0], [4, 6, 0], [-4, 6, 0]] });
    assert.equal(resolveLineEdit("trim", targetObject, feature, object("cutter"), boxCutter, [-5, 0, 0]), null);
  });

  test("keeps stable topology references for edits that preserve structure", () => {
    const topology = createDrawingTopology("line", { points: [[0, 0, 0], [10, 0, 0]] }, "stable");
    const targetFeature = drawing("target", "line", { points: [[0, 0, 0], [10, 0, 0]], topology });
    assert.ok(targetFeature.params.topology === topology);
    const cutter = drawing("cutter", "line", { points: [[10, -5, 0], [10, 5, 0]] });
    const result = resolveLineEdit("trim", object("target", [5, 0, 0]), targetFeature, object("cutter"), cutter, [14, 0, 0]);
    assert.deepEqual(result?.params.points, [[0, 0, 0], [5, 0, 0]]);
    assert.equal(result?.params.topology, topology);
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
