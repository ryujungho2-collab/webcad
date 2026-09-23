import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  closeDrawingProfileParams,
  editDrawingControlParams,
  editDrawingCornerParams,
  editDrawingSegmentParams,
  offsetDrawingParams,
} from "../src/precision/drawingOperations";
import { createDrawingTopology } from "../src/precision/drawingTopology";
import { profileSegments, sampleProfile } from "../src/precision/profileGeometry";

const points = (...values: [number, number, number][]) => values;

describe("drawing topology", () => {
  test("creates deterministic persisted references for every supported topology", () => {
    const rectangle = createDrawingTopology("rectangle", {
      points: points([0, 0, 0], [10, 0, 0], [10, 5, 0], [0, 5, 0]),
    }, "rectangle-a");
    assert.deepEqual(rectangle.controls.map((control) => control.id), [
      "rectangle-a:vertex:0",
      "rectangle-a:vertex:1",
      "rectangle-a:vertex:2",
      "rectangle-a:vertex:3",
    ]);
    assert.equal(rectangle.segments.length, 4);
    assert.deepEqual(rectangle.segments.at(-1), {
      id: "rectangle-a:segment:3",
      startControlId: "rectangle-a:vertex:3",
      endControlId: "rectangle-a:vertex:0",
      index: 3,
      kind: "line",
    });

    const arc = createDrawingTopology("arc", { center: [0, 0, 0], radius: 5 }, "arc-a");
    assert.deepEqual(arc.controls.map((control) => control.role), ["center", "start", "end"]);
    assert.equal(arc.curves[0].id, "arc-a:curve:0");
  });
});

describe("closed profiles and corner treatment", () => {
  test("closes a valid polyline while preserving existing topology references", () => {
    const source = {
      kind: "polyline",
      workPlane: "XY",
      points: points([0, 0, 0], [10, 0, 0], [10, 10, 0]),
      topology: createDrawingTopology("polyline", { points: points([0, 0, 0], [10, 0, 0], [10, 10, 0]) }, "profile"),
    };
    const closed = closeDrawingProfileParams(source);
    assert.equal(closed?.closed, true);
    assert.equal((closed?.topology as ReturnType<typeof createDrawingTopology>).segments.length, 3);
    assert.deepEqual((closed?.topology as ReturnType<typeof createDrawingTopology>).controls.map((entry) => entry.id), source.topology.controls.map((entry) => entry.id));
    assert.equal(closeDrawingProfileParams({ ...source, points: points([0, 0, 0], [10, 0, 0], [20, 0, 0]) }), null);
  });

  test("creates an exact circular fillet and keeps unaffected topology ids", () => {
    const rectanglePoints = points([0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0]);
    const topology = createDrawingTopology("rectangle", { points: rectanglePoints }, "rectangle-a");
    const result = editDrawingCornerParams({ kind: "rectangle", workPlane: "XY", points: rectanglePoints, topology }, "rectangle-a:vertex:1", "fillet", 2);
    assert.equal(result?.kind, "polyline");
    assert.equal(result?.closed, true);
    assert.equal((result?.points as unknown[]).length, 5);
    const tangentPoints = (result?.points as [number, number, number][]).slice(1, 3);
    assert.deepEqual(tangentPoints[0], [8, 0, 0]);
    assert.ok(Math.abs(tangentPoints[1][0] - 10) < 1e-9 && Math.abs(tangentPoints[1][1] - 2) < 1e-9);
    const arc = profileSegments("polyline", result! as Record<string, unknown>).find((segment) => segment.kind === "arc");
    assert.ok(arc);
    assert.ok(Math.abs(arc.radius! - 2) < 1e-9);
    assert.ok(Math.abs(arc.sweep! - Math.PI / 2) < 1e-9);
    assert.equal(sampleProfile("polyline", result! as Record<string, unknown>).length > 5, true);
    assert.equal((result?.topology as ReturnType<typeof createDrawingTopology>).controls[0].id, "rectangle-a:vertex:0");
  });

  test("creates a chamfer and rejects impossible or already-curved corners", () => {
    const sourcePoints = points([0, 0, 0], [10, 0, 0], [10, 10, 0]);
    const topology = createDrawingTopology("polyline", { points: sourcePoints }, "path");
    const chamfer = editDrawingCornerParams({ kind: "polyline", workPlane: "XY", points: sourcePoints, topology }, "path:vertex:1", "chamfer", 2);
    assert.deepEqual(chamfer?.points, points([0, 0, 0], [8, 0, 0], [10, 2, 0], [10, 10, 0]));
    assert.equal(editDrawingCornerParams({ kind: "polyline", workPlane: "XY", points: sourcePoints, topology }, "path:vertex:1", "fillet", 20), null);
    assert.equal(editDrawingCornerParams({ kind: "polyline", workPlane: "XY", points: sourcePoints, bulges: [0, 0.2], topology }, "path:vertex:1", "fillet", 1), null);
  });
});

describe("direct drawing editing", () => {
  test("moves a line endpoint and rejects a no-op", () => {
    const topology = createDrawingTopology("line", { points: points([0, 0, 0], [10, 0, 0]) }, "line-a");
    const source = { kind: "line", workPlane: "XY", points: points([0, 0, 0], [10, 0, 0]), topology };
    assert.equal(editDrawingControlParams(source, "line-a:vertex:0", [0, 0, 0]), null);
    const edited = editDrawingControlParams(source, "line-a:vertex:1", [12, 3, 0]);
    assert.deepEqual(edited?.points, points([0, 0, 0], [12, 3, 0]));
    assert.deepEqual(source.points, points([0, 0, 0], [10, 0, 0]), "source remains immutable");
  });

  test("keeps rectangle corners orthogonal when a corner moves", () => {
    const rectanglePoints = points([0, 0, 0], [10, 0, 0], [10, 5, 0], [0, 5, 0]);
    const topology = createDrawingTopology("rectangle", { points: rectanglePoints }, "rectangle-a");
    const edited = editDrawingControlParams({
      kind: "rectangle",
      workPlane: "XY",
      points: rectanglePoints,
      topology,
    }, "rectangle-a:vertex:2", [12, 7, 0]);
    assert.deepEqual(edited?.points, points([0, 0, 0], [12, 0, 0], [12, 7, 0], [0, 7, 0]));
  });

  test("constrains rectangle edge motion to the edge normal", () => {
    const rectanglePoints = points([0, 0, 0], [10, 0, 0], [10, 5, 0], [0, 5, 0]);
    const topology = createDrawingTopology("rectangle", { points: rectanglePoints }, "rectangle-a");
    const edited = editDrawingSegmentParams({
      kind: "rectangle",
      workPlane: "XY",
      points: rectanglePoints,
      topology,
    }, "rectangle-a:segment:0", [4, 2, 0]);
    assert.deepEqual(edited?.points, points([0, 2, 0], [10, 2, 0], [10, 5, 0], [0, 5, 0]));
  });

  test("edits circle and arc controls without replacing stable topology", () => {
    const circleTopology = createDrawingTopology("circle", { center: [0, 0, 0], radius: 5 }, "circle-a");
    const circle = { kind: "circle", workPlane: "XY", center: [0, 0, 0], radius: 5, topology: circleTopology };
    const movedCircle = editDrawingControlParams(circle, "circle-a:center:0", [2, 3, 0]);
    assert.deepEqual(movedCircle?.center, [2, 3, 0]);
    assert.deepEqual(movedCircle?.topology, circleTopology);
    const resizedCircle = editDrawingControlParams(circle, "circle-a:radius:0", [8, 0, 0]);
    assert.equal(resizedCircle?.radius, 8);

    const arcTopology = createDrawingTopology("arc", { center: [0, 0, 0], radius: 5 }, "arc-a");
    const arc = { kind: "arc", workPlane: "XY", center: [0, 0, 0], radius: 5, startAngle: 0, endAngle: Math.PI / 2, topology: arcTopology };
    const editedArc = editDrawingControlParams(arc, "arc-a:end:0", [-5, 0, 0]);
    assert.equal(editedArc?.radius, 5);
    assert.ok(Math.abs(Number(editedArc?.endAngle) - Math.PI) < 1e-9);
    assert.deepEqual(editedArc?.topology, arcTopology);
  });
});

describe("offset", () => {
  test("offsets a line and connected polyline without mutating the source", () => {
    const line = { kind: "line", workPlane: "XY", points: points([0, 0, 0], [10, 0, 0]) };
    assert.deepEqual(offsetDrawingParams("line", line, 2)?.points, points([0, 2, 0], [10, 2, 0]));
    assert.deepEqual(line.points, points([0, 0, 0], [10, 0, 0]));

    const polyline = { kind: "polyline", workPlane: "XY", points: points([0, 0, 0], [10, 0, 0], [10, 10, 0]) };
    assert.deepEqual(offsetDrawingParams("polyline", polyline, 1)?.points, points([0, 1, 0], [9, 1, 0], [9, 10, 0]));

    const collinear = { kind: "polyline", workPlane: "XY", points: points([0, 0, 0], [5, 0, 0], [10, 0, 0]) };
    assert.deepEqual(offsetDrawingParams("polyline", collinear, 2)?.points, points([0, 2, 0], [5, 2, 0], [10, 2, 0]));
  });

  test("offsets rectangles and rejects collapsed inward offsets", () => {
    const rectangle = {
      kind: "rectangle",
      workPlane: "XY",
      points: points([0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0]),
    };
    assert.deepEqual(offsetDrawingParams("rectangle", rectangle, 1)?.points, points(
      [1, 1, 0], [9, 1, 0], [9, 9, 0], [1, 9, 0],
    ));
    assert.equal(offsetDrawingParams("rectangle", rectangle, 5), null);
  });

  test("preserves work-plane elevation and validates circle/arc radii", () => {
    const xzLine = { kind: "line", workPlane: "XZ", points: points([0, 3, 0], [10, 3, 0]) };
    assert.deepEqual(offsetDrawingParams("line", xzLine, 2)?.points, points([0, 3, 2], [10, 3, 2]));
    assert.equal(offsetDrawingParams("circle", { kind: "circle", center: [0, 0, 0], radius: 5 }, -5), null);
    assert.equal(offsetDrawingParams("arc", { kind: "arc", center: [0, 0, 0], radius: 5 }, 2)?.radius, 7);
  });
});
