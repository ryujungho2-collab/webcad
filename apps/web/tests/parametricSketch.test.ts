import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import type { CadDocument, Sketch, SketchConstraint } from "@agent-webcad/cad-document";
import { deserializeDocument, serializeDocument } from "../../../packages/cad-document/src/serialization";
import { recognizeSketchProfiles } from "../src/precision/parametricProfiles";
import { adaptLegacyDrawingsToSketch, drawingToSketchGeometry, sketchGeometryToDrawingParams, sketchPointToWorld } from "../src/precision/sketchAdapter";
import { sketchPoint, solveSketch, SKETCH_TOLERANCE } from "../src/precision/sketchSolver";
import { cadDocument } from "../src/state/cadDocument";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { cadHistory, redoDocument, undoDocument } from "../src/state/history";
import { validSelection } from "../src/state/selection";

const ref = (geometryId: string, pointId: string) => ({ geometryId, pointId });
const line = (id = "line", start: [number, number] = [0, 0], end: [number, number] = [100, 0]) =>
  ({ id, kind: "line" as const, startId: `${id}:a`, endId: `${id}:b`, segmentId: `${id}:edge`, start, end });
const circle = (id = "circle", radius = 10) =>
  ({ id, kind: "circle" as const, centerId: `${id}:center`, curveId: `${id}:curve`, center: [0, 0] as [number, number], radius });
const baseSketch = (geometry: Sketch["geometry"] = []): Sketch => ({
  id: "sketch", workPlane: "XY", layerId: "layer-default", geometry, constraints: [], dimensions: [],
  solveState: { status: "under-constrained", degreesOfFreedom: 0, rank: 0, residual: 0, tolerance: SKETCH_TOLERANCE },
});
const solve = (sketch: Sketch) => {
  const result = solveSketch(sketch);
  assert.equal(result.ok, true, result.ok ? "" : result.reason);
  return result.ok ? result.sketch : sketch;
};

describe("parametric sketch mathematical core", () => {
  test("A: a free line has four DOF", () => {
    const result = solve(baseSketch([line()]));
    assert.equal(result.solveState.status, "under-constrained");
    assert.equal(result.solveState.degreesOfFreedom, 4);
  });

  test("B: horizontal, length and anchored start leave zero DOF", () => {
    const sketch = baseSketch([line()]);
    sketch.constraints = [
      { id: "horizontal", kind: "horizontal", first: ref("line", "line:a"), second: ref("line", "line:b") },
      { id: "length", kind: "distance", first: ref("line", "line:a"), second: ref("line", "line:b"), value: 100 },
      { id: "anchor", kind: "fixed-point", point: ref("line", "line:a"), value: [0, 0] },
    ];
    assert.equal(solve(sketch).solveState.degreesOfFreedom, 0);
    assert.equal(solve(sketch).solveState.status, "fully-constrained");
  });

  test("C: driving rectangle width updates solved geometry", () => {
    const sketch = baseSketch([{ id: "rect", kind: "rectangle", cornerIds: ["a", "b", "c", "d"], edgeIds: ["ab", "bc", "cd", "da"], origin: [0, 0], width: 100, height: 50 }]);
    sketch.constraints = [{ id: "width", kind: "distance", first: ref("rect", "a"), second: ref("rect", "b"), value: 150 }];
    const result = solve(sketch);
    assert.equal(result.geometry[0].kind, "rectangle");
    if (result.geometry[0].kind === "rectangle") assert.ok(Math.abs(result.geometry[0].width - 150) < SKETCH_TOLERANCE);
    assert.equal(result.solveState.degreesOfFreedom, 3);
  });

  test("D: driving circle radius and diameter update the radius", () => {
    const sketch = baseSketch([circle()]);
    sketch.constraints = [{ id: "radius", kind: "radius", geometryId: "circle", value: 25 }];
    const result = solve(sketch);
    assert.equal(result.geometry[0].kind, "circle");
    if (result.geometry[0].kind === "circle") assert.ok(Math.abs(result.geometry[0].radius - 25) < SKETCH_TOLERANCE);
    result.constraints = [{ id: "diameter", kind: "diameter", geometryId: "circle", value: 80 }];
    const diameter = solve(result);
    if (diameter.geometry[0].kind === "circle") assert.ok(Math.abs(diameter.geometry[0].radius - 40) < SKETCH_TOLERANCE);
  });

  test("a driving angle changes line directions in radians", () => {
    const sketch = baseSketch([line("horizontal", [0, 0], [100, 0]), line("vertical", [0, 0], [0, 100])]);
    sketch.constraints = [{ id: "angle", kind: "angle", firstLineId: "horizontal", secondLineId: "vertical", value: Math.PI / 4 }];
    const result = solve(sketch);
    const first = result.geometry[0], second = result.geometry[1];
    if (first.kind === "line" && second.kind === "line") {
      const ax = first.end[0] - first.start[0], ay = first.end[1] - first.start[1];
      const bx = second.end[0] - second.start[0], by = second.end[1] - second.start[1];
      assert.ok(Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by) - Math.PI / 4) < SKETCH_TOLERANCE);
    }
  });

  test("E: conflicting distances identify involved constraints without changing input", () => {
    const sketch = baseSketch([line()]);
    sketch.constraints = [
      { id: "length-100", kind: "distance", first: ref("line", "line:a"), second: ref("line", "line:b"), value: 100 },
      { id: "length-200", kind: "distance", first: ref("line", "line:a"), second: ref("line", "line:b"), value: 200 },
    ];
    const before = structuredClone(sketch);
    const result = solveSketch(sketch);
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.conflictingConstraintIds.includes("length-200"));
    assert.deepEqual(sketch, before);
  });

  test("F: coincident endpoints remain coincident after a driving length edit", () => {
    const sketch = baseSketch([line("first"), line("second", [100, 0], [150, 0])]);
    sketch.constraints = [
      { id: "join", kind: "coincident", first: ref("first", "first:b"), second: ref("second", "second:a") },
      { id: "length", kind: "distance", first: ref("first", "first:a"), second: ref("first", "first:b"), value: 140 },
    ];
    const result = solve(sketch);
    const a = result.geometry[0], b = result.geometry[1];
    if (a.kind === "line" && b.kind === "line") assert.ok(Math.hypot(a.end[0] - b.start[0], a.end[1] - b.start[1]) < SKETCH_TOLERANCE);
  });

  test("H/I/J: rectangle and circle are profiles, open line chains are not", () => {
    const sketch = baseSketch([
      { id: "rect", kind: "rectangle", cornerIds: ["a", "b", "c", "d"], edgeIds: ["ab", "bc", "cd", "da"], origin: [0, 0], width: 10, height: 20 },
      circle(),
      line("open-a"), line("open-b", [100, 0], [100, 100]), line("open-c", [100, 100], [0, 100]),
    ]);
    assert.deepEqual(recognizeSketchProfiles(solve(sketch)).map((entry) => entry.id), ["profile:rect", "profile:circle"]);
  });

  test("connected line loop requires persistent coincident topology, not proximity", () => {
    const sketch = baseSketch([line("a", [0, 0], [10, 0]), line("b", [10, 0], [10, 10]), line("c", [10, 10], [0, 10]), line("d", [0, 10], [0, 0])]);
    assert.equal(recognizeSketchProfiles(sketch).length, 0);
    const join = (id: string, first: string, second: string): SketchConstraint => ({ id, kind: "coincident", first: ref(first, `${first}:b`), second: ref(second, `${second}:a`) });
    sketch.constraints = [join("ab", "a", "b"), join("bc", "b", "c"), join("cd", "c", "d"), join("da", "d", "a")];
    assert.equal(recognizeSketchProfiles(solve(sketch)).length, 1);
  });

  test("closed polyline yields one profile and open polyline yields none", () => {
    const geometry: Sketch["geometry"][number] = {
      id: "path", kind: "polyline", closed: true,
      vertices: [
        { id: "v0", point: [0, 0] }, { id: "v1", point: [10, 0] },
        { id: "v2", point: [10, 10] }, { id: "v3", point: [0, 10] },
      ],
      segmentIds: ["s0", "s1", "s2", "s3"],
    };
    assert.equal(recognizeSketchProfiles(solve(baseSketch([geometry]))).length, 1);
    const open = { ...geometry, closed: false, segmentIds: ["s0", "s1", "s2"] };
    assert.equal(recognizeSketchProfiles(solve(baseSketch([open]))).length, 0);
  });
});

const original = structuredClone(cadDocument);
beforeEach(() => {
  Object.assign(cadDocument, structuredClone(original), { id: "sketch-test", revision: 0, sketches: {} });
  cadHistory.clear();
});

describe("sketch commands, history and persistence", () => {
  test("G: one driving edit restores geometry and constraint through undo/redo", async () => {
    await dispatchCadCommand({ type: "create-sketch", id: "sketch", workPlane: "XZ" });
    await dispatchCadCommand({ type: "add-sketch-geometry", sketchId: "sketch", geometry: circle() });
    await dispatchCadCommand({ type: "add-sketch-constraint", sketchId: "sketch", constraint: { id: "radius", kind: "radius", geometryId: "circle", value: 10 } });
    const historyBefore = cadHistory.getPastLabels().length;
    await dispatchCadCommand({ type: "set-sketch-dimension", sketchId: "sketch", constraintId: "radius", value: 20 });
    assert.equal(cadHistory.getPastLabels().length, historyBefore + 1);
    assert.ok(Math.abs((cadDocument.sketches!.sketch.geometry[0] as ReturnType<typeof circle>).radius - 20) < SKETCH_TOLERANCE);
    assert.equal(undoDocument(), true);
    assert.ok(Math.abs((cadDocument.sketches!.sketch.geometry[0] as ReturnType<typeof circle>).radius - 10) < SKETCH_TOLERANCE);
    assert.equal((cadDocument.sketches!.sketch.constraints[0] as { value: number }).value, 10);
    assert.equal(redoDocument(), true);
    assert.equal((cadDocument.sketches!.sketch.constraints[0] as { value: number }).value, 20);
    const reopened = deserializeDocument(serializeDocument(cadDocument));
    assert.deepEqual(reopened.sketches, cadDocument.sketches);
    assert.equal(reopened.sketches!.sketch.workPlane, "XZ");
  });

  test("conflict and no-op commands create no phantom history", async () => {
    await dispatchCadCommand({ type: "create-sketch", id: "sketch", workPlane: "XY" });
    await dispatchCadCommand({ type: "add-sketch-geometry", sketchId: "sketch", geometry: line() });
    const length = { id: "length", kind: "distance" as const, first: ref("line", "line:a"), second: ref("line", "line:b"), value: 100 };
    await dispatchCadCommand({ type: "add-sketch-constraint", sketchId: "sketch", constraint: length });
    const before = structuredClone(cadDocument.sketches!.sketch);
    const count = cadHistory.getPastLabels().length;
    const rejected = await dispatchCadCommand({ type: "add-sketch-constraint", sketchId: "sketch", constraint: { ...length, id: "conflict", value: 200 } });
    assert.equal((rejected as { accepted: boolean }).accepted, false);
    assert.deepEqual(cadDocument.sketches!.sketch, before);
    assert.equal(cadHistory.getPastLabels().length, count);
    await dispatchCadCommand({ type: "set-sketch-dimension", sketchId: "sketch", constraintId: "length", value: 100 });
    assert.equal(cadHistory.getPastLabels().length, count);
  });

  test("batch rollback restores sketch collection and history", async () => {
    const result = await dispatchCadCommand({ type: "batch", commands: [
      { type: "create-sketch", id: "first", workPlane: "YZ" },
      { type: "remove-sketch-geometry", sketchId: "missing", geometryId: "x" },
    ] });
    assert.equal((result as { accepted: boolean }).accepted, false);
    assert.deepEqual(cadDocument.sketches, {});
    assert.deepEqual(cadHistory.getPastLabels(), []);
  });

  test("locked sketch layer rejects edits without history", async () => {
    await dispatchCadCommand({ type: "create-sketch", id: "sketch", workPlane: "XY" });
    cadDocument.layers["layer-default"].locked = true;
    const count = cadHistory.getPastLabels().length;
    const result = await dispatchCadCommand({ type: "add-sketch-geometry", sketchId: "sketch", geometry: line() });
    assert.equal((result as { accepted: boolean }).accepted, false);
    assert.deepEqual(cadDocument.sketches!.sketch.geometry, []);
    assert.equal(cadHistory.getPastLabels().length, count);
  });
});

test("legacy drawing adaptation is read-only and retains topology references", () => {
  const document: CadDocument = {
    id: "legacy", revision: 0, sketches: {},
    objects: { drawing: { id: "drawing", geometryId: "geometry-drawing", name: "Line", visible: true, layerId: "layer-default",
      transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } } },
    features: { feature: { id: "feature", type: "drawing", output: "drawing", inputs: [], params: {
      kind: "line", workPlane: "XZ", points: [[0, 0, 0], [20, 0, 10]],
      topology: { controls: [{ id: "start" }, { id: "end" }], segments: [{ id: "edge" }] },
    } } },
    layers: { "layer-default": { id: "layer-default", name: "Default", visible: true, locked: false, objectIds: ["drawing"] } },
    rootObjects: ["drawing"], rootLayers: ["layer-default"],
  };
  const before = structuredClone(document);
  const adapted = adaptLegacyDrawingsToSketch(document, ["drawing"], "sketch");
  assert.equal(adapted.ok, true);
  if (adapted.ok) {
    assert.equal(adapted.sketch.geometry[0].kind, "line");
    if (adapted.sketch.geometry[0].kind === "line") {
      assert.equal(adapted.sketch.geometry[0].segmentId, "edge");
      assert.deepEqual(adapted.sketch.geometry[0].end, [20, 10]);
    }
    assert.deepEqual(sketchPointToWorld(adapted.sketch, [20, 10]), [20, 0, 10]);
  }
  assert.deepEqual(document, before);
  document.objects.drawing.transform!.translation = [5, 0, 0];
  assert.equal(adaptLegacyDrawingsToSketch(document, ["drawing"], "sketch").ok, false);
});

test("solver benchmark: independent constrained lines, 10/100/500", () => {
  for (const count of [10, 100, 500]) {
    const sketch = baseSketch(Array.from({ length: count }, (_, index) => line(`line-${index}`, [index * 200, 0], [index * 200 + 100, 0])));
    const edited = sketch.geometry[count - 1];
    if (edited.kind === "line") edited.end = [edited.end[0], 1];
    sketch.constraints = sketch.geometry.map((geometry) => ({
      id: `horizontal-${geometry.id}`, kind: "horizontal" as const,
      first: ref(geometry.id, `${geometry.id}:a`), second: ref(geometry.id, `${geometry.id}:b`),
    }));
    const started = performance.now();
    const result = solveSketch(sketch);
    const elapsed = performance.now() - started;
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.sketch.solveState.degreesOfFreedom, count * 3);
    console.log(`sketch-solve ${count} independent lines: ${elapsed.toFixed(2)} ms`);
  }
});

test("Sketch Mode adapter projects every drawing tool on XY/XZ/YZ with stable topology", () => {
  for (const workPlane of ["XY", "XZ", "YZ"] as const) {
    const sketch = { ...baseSketch(), workPlane };
    const world = (u: number, v: number) => sketchPointToWorld(sketch, [u, v]);
    const cases: [string, Record<string, unknown>][] = [
      ["line", { points: [world(0, 0), world(10, 0)] }],
      ["polyline", { points: [world(0, 0), world(10, 0), world(10, 5)], closed: false }],
      ["rectangle", { points: [world(10, 5), world(0, 5), world(0, 0), world(10, 0)] }],
      ["circle", { center: world(5, 5), radius: 2 }],
      ["arc", { center: world(5, 5), radius: 2, startAngle: 0, endAngle: Math.PI / 2 }],
    ];
    for (const [kind, params] of cases) {
      const geometry = drawingToSketchGeometry(sketch, kind, params, `${kind}-${workPlane}`);
      assert.ok(geometry, `${kind} on ${workPlane}`);
      const projection = sketchGeometryToDrawingParams(sketch, geometry);
      assert.equal(projection.kind, kind);
      assert.equal(projection.workPlane, workPlane);
      assert.equal(projection.sketchId, sketch.id);
      assert.ok((projection.topology as { controls: unknown[] }).controls.length > 0);
      if (kind === "rectangle" && geometry.kind === "rectangle") assert.deepEqual([geometry.width, geometry.height], [10, 5]);
    }
  }
});

test("sketch dimension edits update projected drawing atomically and survive undo/redo and JSON", async () => {
  await dispatchCadCommand({ type: "create-sketch", id: "sketch", workPlane: "XY" });
  const rectangle: Sketch["geometry"][number] = { id: "plate", kind: "rectangle", cornerIds: ["a", "b", "c", "d"], edgeIds: ["ab", "bc", "cd", "da"], origin: [0, 0], width: 120, height: 80 };
  await dispatchCadCommand({ type: "add-sketch-geometry", sketchId: "sketch", geometry: rectangle });
  assert.ok(cadDocument.objects.plate);
  assert.equal(cadDocument.features["feature-plate"].params.sketchId, "sketch");
  assert.equal(validSelection({ ids: ["plate"], primaryId: "plate", subObjects: [{ objectId: "plate", kind: "drawing-control", topologyId: "a" }] }).subObjects?.length, 1);
  await dispatchCadCommand({ type: "add-sketch-constraint", sketchId: "sketch", constraint: { id: "width", kind: "distance", first: ref("plate", "a"), second: ref("plate", "b"), value: 120 } });
  const count = cadHistory.getPastLabels().length;
  await dispatchCadCommand({ type: "set-sketch-dimension", sketchId: "sketch", constraintId: "width", value: 160 });
  assert.equal(cadHistory.getPastLabels().length, count + 1);
  assert.ok(Math.abs((cadDocument.sketches!.sketch.geometry[0] as typeof rectangle).width - 160) < SKETCH_TOLERANCE);
  assert.ok(Math.abs(((cadDocument.features["feature-plate"].params.points as number[][])[1][0] - (cadDocument.features["feature-plate"].params.points as number[][])[0][0]) - 160) < SKETCH_TOLERANCE);
  const reloaded = deserializeDocument(serializeDocument(cadDocument));
  assert.equal(reloaded.sketches?.sketch.constraints[0].id, "width");
  assert.deepEqual(reloaded.features["feature-plate"].params.topology, cadDocument.features["feature-plate"].params.topology);
  assert.equal(undoDocument(), true);
  assert.ok(Math.abs((cadDocument.sketches!.sketch.geometry[0] as typeof rectangle).width - 120) < SKETCH_TOLERANCE);
  assert.equal(redoDocument(), true);
  assert.ok(Math.abs((cadDocument.sketches!.sketch.geometry[0] as typeof rectangle).width - 160) < SKETCH_TOLERANCE);
  const before = serializeDocument(cadDocument), history = cadHistory.getPastLabels().length;
  const rejected = await dispatchCadCommand({ type: "add-sketch-constraint", sketchId: "sketch", constraint: { id: "conflict", kind: "distance", first: ref("plate", "a"), second: ref("plate", "b"), value: 200 } });
  assert.equal((rejected as { accepted: boolean }).accepted, false);
  assert.equal(serializeDocument(cadDocument), before);
  assert.equal(cadHistory.getPastLabels().length, history);
});

test("constrained plate keeps circle center on rectangle corner when width changes", async () => {
  await dispatchCadCommand({ type: "create-sketch", id: "plate-sketch", workPlane: "XZ" });
  await dispatchCadCommand({ type: "add-sketch-geometry", sketchId: "plate-sketch", geometry: { id: "rect", kind: "rectangle", cornerIds: ["a", "b", "c", "d"], edgeIds: ["ab", "bc", "cd", "da"], origin: [0, 0], width: 120, height: 80 } });
  await dispatchCadCommand({ type: "add-sketch-geometry", sketchId: "plate-sketch", geometry: { id: "hole", kind: "circle", centerId: "center", curveId: "curve", center: [120, 80], radius: 10 } });
  await dispatchCadCommand({ type: "add-sketch-constraint", sketchId: "plate-sketch", constraint: { id: "diameter", kind: "diameter", geometryId: "hole", value: 20 } });
  await dispatchCadCommand({ type: "add-sketch-constraint", sketchId: "plate-sketch", constraint: { id: "corner", kind: "coincident", first: ref("rect", "c"), second: ref("hole", "center") } });
  await dispatchCadCommand({ type: "add-sketch-constraint", sketchId: "plate-sketch", constraint: { id: "width", kind: "distance", first: ref("rect", "a"), second: ref("rect", "b"), value: 120 } });
  const result = await dispatchCadCommand({ type: "set-sketch-dimension", sketchId: "plate-sketch", constraintId: "width", value: 160 });
  assert.equal((result as { accepted: boolean }).accepted, true);
  const sketch = cadDocument.sketches!["plate-sketch"];
  const rect = sketch.geometry.find((entity) => entity.id === "rect")!;
  const hole = sketch.geometry.find((entity) => entity.id === "hole")!;
  const corner = sketchPoint(rect, "c")!, center = sketchPoint(hole, "center")!;
  assert.ok(Math.hypot(corner[0] - center[0], corner[1] - center[1]) < SKETCH_TOLERANCE);
  assert.equal(cadDocument.features["feature-hole"].params.workPlane, "XZ");
  assert.deepEqual(cadDocument.features["feature-hole"].params.center, [center[0], 0, center[1]]);
});

test("one sketch segment drag is one history entry; locked or no-op edits leave no entry", async () => {
  await dispatchCadCommand({ type: "create-sketch", id: "sketch", workPlane: "YZ" });
  await dispatchCadCommand({ type: "add-sketch-geometry", sketchId: "sketch", geometry: line("edge", [0, 0], [10, 0]) });
  const before = cadHistory.getPastLabels().length;
  const moved = await dispatchCadCommand({ type: "move-sketch-segment", sketchId: "sketch", geometryId: "edge", segmentId: "edge:edge", delta: [0, 5] });
  assert.equal((moved as { accepted: boolean }).accepted, true);
  assert.equal(cadHistory.getPastLabels().length, before + 1);
  assert.deepEqual((cadDocument.sketches!.sketch.geometry[0] as ReturnType<typeof line>).start, [0, 5]);
  assert.deepEqual((cadDocument.features["feature-edge"].params.points as unknown[])[0], [0, 0, 5]);
  assert.equal(undoDocument(), true);
  assert.deepEqual((cadDocument.sketches!.sketch.geometry[0] as ReturnType<typeof line>).start, [0, 0]);
  assert.equal(redoDocument(), true);
  assert.deepEqual((cadDocument.sketches!.sketch.geometry[0] as ReturnType<typeof line>).start, [0, 5]);
  const count = cadHistory.getPastLabels().length;
  await dispatchCadCommand({ type: "move-sketch-segment", sketchId: "sketch", geometryId: "edge", segmentId: "edge:edge", delta: [0, 0] });
  assert.equal(cadHistory.getPastLabels().length, count);
  cadDocument.layers["layer-default"].locked = true;
  await dispatchCadCommand({ type: "move-sketch-segment", sketchId: "sketch", geometryId: "edge", segmentId: "edge:edge", delta: [0, 5] });
  assert.equal(cadHistory.getPastLabels().length, count);
});
