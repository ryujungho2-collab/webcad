import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { CadDocument } from "@agent-webcad/cad-document";
import { createDrawingTopology } from "../src/precision/drawingTopology";
import { editDrawingCornerParams } from "../src/precision/drawingOperations";
import { extractSketchLoops } from "../src/precision/sketchProfiles";

const baseDocument = (): CadDocument => ({
  id: "profiles",
  revision: 0,
  objects: {},
  features: {},
  layers: { default: { id: "default", name: "Default", visible: true, locked: false, objectIds: [] } },
  rootObjects: [],
  rootLayers: ["default"],
});

function addDrawing(document: CadDocument, id: string, kind: "line" | "polyline" | "rectangle" | "circle" | "arc", params: Record<string, unknown>) {
  document.objects[id] = {
    id,
    geometryId: `geometry-${id}`,
    name: id,
    visible: true,
    layerId: "default",
    transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
  };
  document.features[`feature-${id}`] = {
    id: `feature-${id}`,
    type: "drawing",
    inputs: [],
    output: id,
    params: { kind, workPlane: "XY", ...params, topology: createDrawingTopology(kind, params, id) },
  };
  document.layers.default.objectIds.push(id);
  document.rootObjects.push(id);
}

describe("sketch loop extraction", () => {
  test("normalizes a closed rectangle into a deterministic exact loop", () => {
    const document = baseDocument();
    addDrawing(document, "rectangle", "rectangle", { points: [[0, 0, 0], [10, 0, 0], [10, 5, 0], [0, 5, 0]] });
    const result = extractSketchLoops(document, ["rectangle"]);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.loops.length, 1);
    assert.equal(result.loops[0].segments.length, 4);
    assert.deepEqual(result.loops[0].sourceTopologyIds, [
      "rectangle/rectangle:segment:0",
      "rectangle/rectangle:segment:1",
      "rectangle/rectangle:segment:2",
      "rectangle/rectangle:segment:3",
    ]);
  });

  test("extracts one loop from unordered independently drawn lines", () => {
    const document = baseDocument();
    addDrawing(document, "bottom", "line", { points: [[0, 0, 0], [10, 0, 0]] });
    addDrawing(document, "top", "line", { points: [[10, 5, 0], [0, 5, 0]] });
    addDrawing(document, "left", "line", { points: [[0, 5, 0], [0, 0, 0]] });
    addDrawing(document, "right", "line", { points: [[10, 0, 0], [10, 5, 0]] });
    const result = extractSketchLoops(document, ["top", "right", "bottom", "left"]);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(new Set(result.loops[0].sourceObjectIds), new Set(["bottom", "right", "top", "left"]));
    assert.equal(result.loops[0].segments.length, 4);
  });

  test("keeps exact fillet arcs and stable source topology references", () => {
    const document = baseDocument();
    const points = [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0]] as [number, number, number][];
    const topology = createDrawingTopology("rectangle", { points }, "filleted");
    const filleted = editDrawingCornerParams({ kind: "rectangle", workPlane: "XY", points, topology }, "filleted:vertex:1", "fillet", 2);
    assert.ok(filleted);
    addDrawing(document, "filleted", "polyline", filleted!);
    document.features["feature-filleted"].params.topology = filleted!.topology;
    const result = extractSketchLoops(document, ["filleted"]);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.loops[0].segments.some((segment) => segment.kind === "arc"), true);
    assert.equal(result.loops[0].sourceTopologyIds.every((id) => id.startsWith("filleted/")), true);
  });

  test("supports a circle and rejects open or branching geometry", () => {
    const circleDocument = baseDocument();
    addDrawing(circleDocument, "circle", "circle", { center: [2, 3, 0], radius: 4 });
    const circle = extractSketchLoops(circleDocument, ["circle"]);
    assert.equal(circle.ok, true);
    if (circle.ok) assert.equal(circle.loops[0].segments[0].kind, "circle");

    const openDocument = baseDocument();
    addDrawing(openDocument, "a", "line", { points: [[0, 0, 0], [10, 0, 0]] });
    addDrawing(openDocument, "b", "line", { points: [[10, 0, 0], [10, 5, 0]] });
    assert.equal(extractSketchLoops(openDocument, ["a", "b"]).ok, false);

    addDrawing(openDocument, "branch", "line", { points: [[10, 0, 0], [15, 0, 0]] });
    assert.equal(extractSketchLoops(openDocument, ["a", "b", "branch"]).ok, false);
  });

  test("accepts a closed polyline without a duplicated closing vertex", () => {
    const document = baseDocument();
    addDrawing(document, "triangle", "polyline", {
      points: [[0, 0, 0], [10, 0, 0], [5, 8, 0]],
      closed: true,
    });
    const result = extractSketchLoops(document, ["triangle"]);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.loops[0].segments.length, 3);
  });
});
