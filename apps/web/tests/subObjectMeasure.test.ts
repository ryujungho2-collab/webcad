import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { CadDocument } from "@agent-webcad/cad-document";
import { describeSubObject } from "../src/viewport/subObjectMeasure";

function drawing(id: string, params: Record<string, unknown>, transform?: [number, number, number]) {
  return {
    object: {
      id,
      geometryId: `geometry-${id}`,
      name: id,
      visible: true,
      layerId: "layer-default",
      ...(transform ? { transform: { translation: transform, rotation: [0, 0, 0] as [number, number, number], scale: [1, 1, 1] as [number, number, number] } } : {}),
    },
    feature: {
      id: `feature-${id}`,
      type: "drawing" as const,
      inputs: [],
      output: id,
      params,
    },
  };
}

const line = drawing("line", {
  kind: "line",
  workPlane: "XY",
  points: [[0, 0, 0], [30, 40, 0]],
  topology: {
    version: 1,
    controls: [{ id: "v0", role: "vertex", index: 0 }, { id: "v1", role: "vertex", index: 1 }],
    segments: [{ id: "s0", startControlId: "v0", endControlId: "v1", index: 0, kind: "line" }],
    curves: [],
  },
});
const circle = drawing("circle", {
  kind: "circle",
  workPlane: "XY",
  center: [5, 5, 0],
  radius: 10,
  topology: {
    version: 1,
    controls: [{ id: "center", role: "center" }, { id: "radius", role: "radius" }],
    segments: [],
    curves: [{ id: "c0", kind: "circle" }],
  },
});
const arc = drawing("arc", {
  kind: "arc",
  workPlane: "XY",
  center: [0, 0, 0],
  radius: 8,
  startAngle: 0,
  endAngle: Math.PI / 2,
  topology: {
    version: 1,
    controls: [{ id: "center", role: "center" }, { id: "start", role: "start" }, { id: "end", role: "end" }],
    segments: [],
    curves: [{ id: "a0", kind: "arc" }],
  },
});
const moved = drawing("moved", {
  kind: "line",
  workPlane: "XY",
  points: [[0, 0, 0], [30, 40, 0]],
  topology: {
    version: 1,
    controls: [{ id: "v0", role: "vertex", index: 0 }, { id: "v1", role: "vertex", index: 1 }],
    segments: [{ id: "s0", startControlId: "v0", endControlId: "v1", index: 0, kind: "line" }],
    curves: [],
  },
}, [10, 0, 0]);

const parts = [line, circle, arc, moved];
const document = {
  id: "measure-test",
  revision: 0,
  objects: Object.fromEntries(parts.map((part) => [part.object.id, part.object])),
  features: Object.fromEntries(parts.map((part) => [part.feature.id, part.feature])),
  layers: { "layer-default": { id: "layer-default", name: "Default", visible: true, locked: false, objectIds: parts.map((part) => part.object.id) } },
  rootObjects: parts.map((part) => part.object.id),
  rootLayers: ["layer-default"],
} as unknown as CadDocument;

describe("sub-object precision summary", () => {
  test("reports line vertex work-plane coordinates", () => {
    assert.deepEqual(describeSubObject(document, { objectId: "line", kind: "drawing-control", topologyId: "v1" }), {
      title: "Vertex",
      plane: "XY",
      rows: [{ label: "X", value: "30.00 mm" }, { label: "Y", value: "40.00 mm" }],
    });
  });

  test("reports segment length and angle", () => {
    assert.deepEqual(describeSubObject(document, { objectId: "line", kind: "drawing-segment", topologyId: "s0" }), {
      title: "Segment",
      plane: "XY",
      rows: [{ label: "Length", value: "50.00 mm" }, { label: "Angle", value: "53.13 °" }],
    });
  });

  test("reports circle center, radius and circumference", () => {
    assert.deepEqual(describeSubObject(document, { objectId: "circle", kind: "drawing-control", topologyId: "center" })?.rows, [
      { label: "X", value: "5.00 mm" },
      { label: "Y", value: "5.00 mm" },
    ]);
    assert.deepEqual(describeSubObject(document, { objectId: "circle", kind: "drawing-control", topologyId: "radius" }), {
      title: "Radius",
      plane: "XY",
      rows: [{ label: "Radius", value: "10.00 mm" }],
    });
    assert.deepEqual(describeSubObject(document, { objectId: "circle", kind: "drawing-curve", topologyId: "c0" })?.title, "Circumference");
  });

  test("reports arc start, end and angles", () => {
    assert.deepEqual(describeSubObject(document, { objectId: "arc", kind: "drawing-control", topologyId: "start" }), {
      title: "Start",
      plane: "XY",
      rows: [
        { label: "X", value: "8.00 mm" },
        { label: "Y", value: "0.00 mm" },
        { label: "Radius", value: "8.00 mm" },
      ],
    });
    assert.deepEqual(describeSubObject(document, { objectId: "arc", kind: "drawing-curve", topologyId: "a0" })?.rows, [
      { label: "Radius", value: "8.00 mm" },
      { label: "Start", value: "0.00 °" },
      { label: "End", value: "90.00 °" },
    ]);
  });

  test("follows object transforms into world coordinates", () => {
    assert.deepEqual(describeSubObject(document, { objectId: "moved", kind: "drawing-control", topologyId: "v1" })?.rows, [
      { label: "X", value: "40.00 mm" },
      { label: "Y", value: "40.00 mm" },
    ]);
  });

  test("returns null for unknown or non-drawing references", () => {
    assert.equal(describeSubObject(document, { objectId: "line", kind: "drawing-control", topologyId: "missing" }), null);
    assert.equal(describeSubObject(document, { objectId: "missing", kind: "drawing-control", topologyId: "v0" }), null);
    assert.equal(describeSubObject(document, { objectId: "line", kind: "object", topologyId: "v0" }), null);
  });
});
