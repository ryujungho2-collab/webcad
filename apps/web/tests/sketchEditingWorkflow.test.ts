import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import type { CadCommand } from "@agent-webcad/cad-commands";
import type { SketchGeometry } from "@agent-webcad/cad-document";
import { serializeDocument, deserializeDocument } from "../../../packages/cad-document/src/serialization";
import { cadDocument } from "../src/state/cadDocument";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { cadHistory, undoDocument, redoDocument } from "../src/state/history";
import { planPrecisionTransform } from "../src/state/precisionTransformCommands";
import { sketchPoint } from "../src/precision/sketchSolver";
import { WORK_PLANES, planeToWorld, worldToPlane, type WorkPlaneId } from "../src/precision/workPlane";
import { getWorldDrawingGeometry } from "../src/precision/worldGeometry";
import { buildExtrudeMesh } from "../src/cad/kernelGeometryService";
import { documentState, meshVolume, resetTestDocument } from "./helpers/documentHarness";

beforeEach(resetTestDocument);
const feature = (id: string) => Object.values(cadDocument.features).find((entry) => entry.output === id)!;
const rect = (): Extract<SketchGeometry, { kind: "rectangle" }> => ({ id: "rect", kind: "rectangle", origin: [0, 0], width: 100, height: 60, cornerIds: ["a", "b", "c", "d"], edgeIds: ["ab", "bc", "cd", "da"] });
const line = (id: string, start: [number, number], end: [number, number]): SketchGeometry => ({ id, kind: "line", startId: `${id}:a`, endId: `${id}:b`, segmentId: `${id}:edge`, start, end });
async function apply(command: CadCommand) { const result = await dispatchCadCommand(command); assert.equal(result.ok, true, result.reason); return result; }
async function sketch(geometry: SketchGeometry[] = [rect()], plane: WorkPlaneId = "XY") {
  await apply({ type: "create-sketch", id: "sketch", workPlane: plane });
  for (const entity of geometry) {
    const result = await apply({ type: "add-sketch-geometry", sketchId: "sketch", geometry: entity });
    assert.deepEqual(result.createdIds, [entity.id], "selection needs the new geometry ID, never the sketch ID");
  }
}
function near(actual: number[], expected: number[], tolerance = 1e-5) { actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) < tolerance, `${actual} ≈ ${expected}`)); }
function undoRedo(before: ReturnType<typeof documentState>) {
  const after = documentState(); assert.ok(undoDocument()); assert.deepEqual(documentState(), before);
  assert.ok(redoDocument()); assert.deepEqual(documentState(), after);
}
async function reject(command: CadCommand, reason?: RegExp) {
  const before = documentState(), revision = cadDocument.revision, history = cadHistory.getPastLabels();
  const result = await dispatchCadCommand(command); assert.equal(result.ok, false); assert.deepEqual(result.createdIds, []);
  if (reason) assert.match(result.reason!, reason);
  assert.deepEqual(documentState(), before); assert.equal(cadDocument.revision, revision); assert.deepEqual(cadHistory.getPastLabels(), history);
}

for (const plane of ["XY", "XZ", "YZ"] as const) test(`${plane}: default 2D rotation stays planar and two-value Move uses plane coordinates`, async () => {
  await apply({ type: "create-drawing", id: "drawing", drawing: "rectangle", params: { workPlane: plane, points: [[0, 0], [100, 0], [100, 60], [0, 60]].map((point) => planeToWorld(point as [number, number], WORK_PLANES[plane])) } });
  const before = documentState();
  for (const command of planPrecisionTransform(cadDocument, ["drawing"], "rotate", 90, null, plane).commands) await apply(command);
  const geometry = getWorldDrawingGeometry(cadDocument.objects.drawing, feature("drawing"))!;
  assert.equal(geometry.planeAligned, true); assert.equal(geometry.points!.length, 4);
  const local = geometry.points!.map((point) => worldToPlane(point, WORK_PLANES[plane]));
  near([local[1][0] - local[0][0], local[1][1] - local[0][1]], [0, 100]);
  undoRedo(before);
  const translation = planPrecisionTransform(cadDocument, ["drawing"], "translate", [20, 30], null, plane);
  for (const command of translation.commands) await apply(command);
  const after = getWorldDrawingGeometry(cadDocument.objects.drawing, feature("drawing"))!;
  near(worldToPlane(after.points![0], WORK_PLANES[plane]), [local[0][0] + 20, local[0][1] + 30]);
  const normal = WORK_PLANES[plane].normal.findIndex((value) => value !== 0) as 0 | 1 | 2;
  assert.match(planPrecisionTransform(cadDocument, ["drawing"], "translate", 10, normal, plane).reason!, /plane/);
});

for (let corner = 0; corner < 4; corner++) test(`rectangle grip ${corner} anchors its opposite corner and retains topology`, async () => {
  await sketch(); const before = documentState(), original = rect(), opposite = sketchPoint(original, original.cornerIds[(corner + 2) % 4])!;
  const target: [number, number] = [[-20, -10], [120, -10], [120, 80], [-20, 80]][corner] as [number, number];
  await apply({ type: "move-sketch-point", sketchId: "sketch", point: { geometryId: "rect", pointId: original.cornerIds[corner] }, position: target });
  const changed = cadDocument.sketches!.sketch.geometry[0] as typeof original;
  near(sketchPoint(changed, original.cornerIds[corner])!, target); near(sketchPoint(changed, original.cornerIds[(corner + 2) % 4])!, opposite);
  assert.deepEqual(changed.cornerIds, original.cornerIds); assert.equal(changed.width, 120); assert.equal(changed.height, 70 + (corner >= 2 ? 10 : 0));
  assert.equal(cadDocument.sketches!.sketch.constraints.length, 0); assert.equal(cadDocument.sketches!.sketch.solveState.degreesOfFreedom, 4);
  undoRedo(before);
});

test("rotated rectangle edge drag remains rectangular with the opposite edge anchored", async () => {
  const geometry = { ...rect(), angle: Math.PI / 2 }; await sketch([geometry]);
  const anchor = sketchPoint(geometry, "a")!;
  await apply({ type: "move-sketch-segment", sketchId: "sketch", geometryId: "rect", segmentId: "bc", delta: [0, 20] });
  const changed = cadDocument.sketches!.sketch.geometry[0] as typeof geometry;
  near(sketchPoint(changed, "a")!, anchor); assert.equal(changed.width, 120); assert.equal(changed.height, 60);
  near(sketchPoint(changed, "b")!, [0, 120]);
  await reject({ type: "move-sketch-segment", sketchId: "sketch", geometryId: "rect", segmentId: "bc", delta: [0, -200] }, /cross/);
});

test("requested drag cannot be silently reversed by a driving width; conflict names are returned atomically", async () => {
  await sketch(); await apply({ type: "add-sketch-constraint", sketchId: "sketch", constraint: { id: "plate-width", kind: "distance", first: { geometryId: "rect", pointId: "a" }, second: { geometryId: "rect", pointId: "b" }, value: 100 } });
  await reject({ type: "move-sketch-point", sketchId: "sketch", point: { geometryId: "rect", pointId: "c" }, position: [150, 80] }, /plate-width/);
  await apply({ type: "move-sketch-point", sketchId: "sketch", point: { geometryId: "rect", pointId: "c" }, position: [100, 80] });
  assert.equal((cadDocument.sketches!.sketch.geometry[0] as ReturnType<typeof rect>).height, 80);
});

test("mechanical plate: sketch rotate, move, width change, regenerate, export geometry and Undo/Redo", async () => {
  await sketch(); await apply({ type: "add-sketch-constraint", sketchId: "sketch", constraint: { id: "width", kind: "distance", first: { geometryId: "rect", pointId: "a" }, second: { geometryId: "rect", pointId: "b" }, value: 100 } });
  await apply({ type: "transform-sketch-geometry", sketchId: "sketch", geometryIds: ["rect"], translation: [10, 20], center: [0, 0], angle: Math.PI / 2, scale: 1 });
  await apply({ type: "create-extrude", id: "plate", profileObjectIds: ["rect"], distance: 5 });
  const before = documentState(); cadHistory.clear();
  await apply({ type: "set-sketch-dimension", sketchId: "sketch", constraintId: "width", value: 150 });
  const mesh = await buildExtrudeMesh(feature("plate").params);
  assert.ok(Math.abs(meshVolume(mesh) - 150 * 60 * 5) < 1e-2);
  const geometry = cadDocument.sketches!.sketch.geometry[0] as ReturnType<typeof rect>;
  assert.equal(geometry.angle, Math.PI / 2); assert.deepEqual(geometry.cornerIds, rect().cornerIds);
  const points = feature("rect").params.points as number[][];
  near([points[1][0] - points[0][0], points[1][1] - points[0][1]], [0, 150]);
  undoRedo(before);
  const loaded = deserializeDocument(serializeDocument(cadDocument)); assert.deepEqual(documentState(loaded), documentState());
});

test("uniform scale works for free sketch geometry; fixed anchors and dimensions block incompatible transforms", async () => {
  await sketch(); await apply({ type: "transform-sketch-geometry", sketchId: "sketch", geometryIds: ["rect"], translation: [0, 0], center: [0, 0], angle: 0, scale: 2 });
  assert.equal((cadDocument.sketches!.sketch.geometry[0] as ReturnType<typeof rect>).width, 200);
  await apply({ type: "add-sketch-constraint", sketchId: "sketch", constraint: { id: "origin-anchor", kind: "fixed-point", point: { geometryId: "rect", pointId: "a" }, value: [0, 0] } });
  await reject({ type: "transform-sketch-geometry", sketchId: "sketch", geometryIds: ["rect"], translation: [10, 0], center: [0, 0], angle: 0, scale: 1 }, /origin-anchor/);
});

test("duplicate selection remaps topology, internal constraints and dimensions, excludes external relations", async () => {
  await sketch([line("first", [0, 0], [100, 0]), line("second", [100, 0], [100, 60]), line("outside", [0, 0], [0, 30])]);
  await apply({ type: "add-sketch-constraint", sketchId: "sketch", constraint: { id: "join", kind: "coincident", first: { geometryId: "first", pointId: "first:b" }, second: { geometryId: "second", pointId: "second:a" } } });
  await apply({ type: "add-sketch-constraint", sketchId: "sketch", constraint: { id: "length", kind: "distance", first: { geometryId: "first", pointId: "first:a" }, second: { geometryId: "first", pointId: "first:b" }, value: 100 } });
  await apply({ type: "add-sketch-constraint", sketchId: "sketch", constraint: { id: "external", kind: "coincident", first: { geometryId: "first", pointId: "first:a" }, second: { geometryId: "outside", pointId: "outside:a" } } });
  const before = documentState(); cadHistory.clear();
  const result = await apply({ type: "duplicate-sketch-geometry", sketchId: "sketch", geometryIds: ["first", "second"], offset: [200, 20] });
  assert.equal(result.createdIds.length, 2);
  const current = cadDocument.sketches!.sketch; assert.equal(current.constraints.length, 5); assert.equal(current.dimensions.length, 2);
  const copies = current.geometry.filter((entry) => result.createdIds.includes(entry.id));
  assert.ok(copies.every((entry) => entry.kind === "line" && !["first:a", "first:b", "second:a", "second:b"].includes(entry.startId)));
  assert.equal(current.constraints.filter((entry) => entry.kind === "coincident").length, 3);
  const first = copies[0]; if (first.kind === "line") { near(first.start, [200, 20]); near(first.end, [300, 20]); }
  undoRedo(before);
});

test("architectural sketch: trim, extend, offset and constrained entity deletion are single undoable edits", async () => {
  await sketch([line("wall", [0, 0], [100, 0]), line("boundary", [50, -30], [50, 30]), line("far", [120, -30], [120, 30])]);
  await apply({ type: "trim-sketch-geometry", sketchId: "sketch", targetId: "wall", cutterId: "boundary", pickPoint: [80, 0, 0] });
  let wall = cadDocument.sketches!.sketch.geometry.find((entry) => entry.id === "wall")!; assert.equal(wall.kind, "line"); if (wall.kind === "line") { near(wall.start, [0, 0]); near(wall.end, [50, 0]); assert.equal(wall.endId, "wall:b"); }
  await apply({ type: "extend-sketch-geometry", sketchId: "sketch", targetId: "wall", cutterId: "far", pickPoint: [45, 0, 0] });
  wall = cadDocument.sketches!.sketch.geometry.find((entry) => entry.id === "wall")!; if (wall.kind === "line") near(wall.end, [120, 0]);
  const offset = await apply({ type: "offset-sketch-geometry", sketchId: "sketch", geometryId: "wall", distance: 10, side: "left" });
  assert.equal(offset.createdIds.length, 1); const copied = cadDocument.sketches!.sketch.geometry.find((entry) => entry.id === offset.createdIds[0])!;
  if (copied.kind === "line") { near(copied.start, [0, 10]); near(copied.end, [120, 10]); }
  await apply({ type: "add-sketch-constraint", sketchId: "sketch", constraint: { id: "wall-length", kind: "distance", first: { geometryId: "wall", pointId: "wall:a" }, second: { geometryId: "wall", pointId: "wall:b" }, value: 120 } });
  const before = documentState(); cadHistory.clear();
  await apply({ type: "remove-sketch-geometry", sketchId: "sketch", geometryId: "wall" });
  assert.equal(cadDocument.sketches!.sketch.constraints.length, 0); assert.equal(cadDocument.sketches!.sketch.dimensions.length, 0);
  assert.ok(!cadDocument.objects.wall && !feature("wall")); undoRedo(before);
});

test("rotated rectangle offsets preserve shape; collapsing offsets and locked layers reject atomically", async () => {
  await sketch([{ ...rect(), angle: Math.PI / 4 }]);
  const result = await apply({ type: "offset-sketch-geometry", sketchId: "sketch", geometryId: "rect", distance: 10 });
  const copy = cadDocument.sketches!.sketch.geometry.find((entry) => entry.id === result.createdIds[0])!;
  assert.equal(copy.kind, "rectangle"); if (copy.kind === "rectangle") { near([copy.width, copy.height, copy.angle!], [80, 40, Math.PI / 4]); }
  await reject({ type: "offset-sketch-geometry", sketchId: "sketch", geometryId: "rect", distance: 40 }, /collapse/);
  cadDocument.layers["layer-default"].locked = true;
  await reject({ type: "duplicate-sketch-geometry", sketchId: "sketch", geometryIds: ["rect"], offset: [10, 0] }, /locked/);
});

for (const plane of ["XY", "XZ", "YZ"] as const) test(`${plane}: sketch precision edits change local coordinates without a second object transform`, async () => {
  await sketch([rect()], plane);
  for (const command of planPrecisionTransform(cadDocument, ["rect"], "translate", [20, 30], null, plane, "sketch").commands) await apply(command);
  for (const command of planPrecisionTransform(cadDocument, ["rect"], "rotate", 90, null, plane, "sketch").commands) await apply(command);
  const geometry = cadDocument.sketches!.sketch.geometry[0] as ReturnType<typeof rect>;
  // Rotate the translated 100 x 60 rectangle about its centre (70, 60).
  near(sketchPoint(geometry, "a")!, [100, 10]); near(sketchPoint(geometry, "c")!, [40, 110]);
  const params = feature("rect").params, points = params.points as [number, number, number][];
  near(points[0], planeToWorld([100, 10], WORK_PLANES[plane]));
  assert.deepEqual(cadDocument.objects.rect.transform, { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
  assert.match(planPrecisionTransform(cadDocument, ["rect"], "scale", 2, 0, plane, "sketch").reason!, /uniform|plane/);
});

test("copy fixed circle anchors and implicit radius handles with fresh references", async () => {
  await sketch([{ id: "circle", kind: "circle", centerId: "center", curveId: "curve", center: [0, 0], radius: 10 }]);
  await apply({ type: "add-sketch-constraint", sketchId: "sketch", constraint: { id: "anchor", kind: "fixed-point", point: { geometryId: "circle", pointId: "center" }, value: [0, 0] } });
  await apply({ type: "add-sketch-constraint", sketchId: "sketch", constraint: { id: "size", kind: "distance", first: { geometryId: "circle", pointId: "center" }, second: { geometryId: "circle", pointId: "circle:radius:0" }, value: 10 } });
  const result = await apply({ type: "duplicate-sketch-geometry", sketchId: "sketch", geometryIds: ["circle"], offset: [50, 20] });
  const current = cadDocument.sketches!.sketch, copy = current.geometry.find((entry) => entry.id === result.createdIds[0])!;
  assert.equal(copy.kind, "circle"); if (copy.kind === "circle") near(copy.center, [50, 20]);
  const size = current.constraints.find((entry) => entry.kind === "distance" && entry.first.geometryId === copy.id)!;
  assert.equal(size.kind, "distance"); if (size.kind === "distance") assert.equal(size.second.pointId, `${copy.id}:radius:0`);
  const anchor = current.constraints.find((entry) => entry.kind === "fixed-point" && entry.point.geometryId === copy.id)!;
  if (anchor.kind === "fixed-point") near(anchor.value, [50, 20]);
  assert.equal(current.solveState.degreesOfFreedom, 0);
});

test("driving line length prevents a contradictory trim and retains all references", async () => {
  await sketch([line("wall", [0, 0], [100, 0]), line("boundary", [50, -30], [50, 30])]);
  await apply({ type: "add-sketch-constraint", sketchId: "sketch", constraint: { id: "wall-length", kind: "distance", first: { geometryId: "wall", pointId: "wall:a" }, second: { geometryId: "wall", pointId: "wall:b" }, value: 100 } });
  await reject({ type: "trim-sketch-geometry", sketchId: "sketch", targetId: "wall", cutterId: "boundary", pickPoint: [80, 0, 0] }, /wall-length/);
  await apply({ type: "remove-sketch-constraint", sketchId: "sketch", constraintId: "wall-length" });
  await apply({ type: "trim-sketch-geometry", sketchId: "sketch", targetId: "wall", cutterId: "boundary", pickPoint: [80, 0, 0] });
  const wall = cadDocument.sketches!.sketch.geometry[0];
  if (wall.kind === "line") { near(wall.end, [50, 0]); assert.equal(wall.endId, "wall:b"); }
});

test("circle trim becomes an arc and retains curve and centre identity", async () => {
  await sketch([{ id: "circle", kind: "circle", centerId: "center", curveId: "curve", center: [0, 0], radius: 10 }, line("boundary", [0, -20], [0, 20])]);
  await apply({ type: "trim-sketch-geometry", sketchId: "sketch", targetId: "circle", cutterId: "boundary", pickPoint: [10, 0, 0] });
  const geometry = cadDocument.sketches!.sketch.geometry[0];
  assert.equal(geometry.kind, "arc"); if (geometry.kind === "arc") { assert.equal(geometry.centerId, "center"); assert.equal(geometry.curveId, "curve"); near([geometry.radius, Math.abs(geometry.endAngle - geometry.startAngle)], [10, Math.PI]); }
});

test("deleting a live sketch profile rejects atomically, including proposed constraint cleanup", async () => {
  await sketch(); await apply({ type: "add-sketch-constraint", sketchId: "sketch", constraint: { id: "width", kind: "distance", first: { geometryId: "rect", pointId: "a" }, second: { geometryId: "rect", pointId: "b" }, value: 100 } });
  await apply({ type: "create-extrude", id: "plate", profileObjectIds: ["rect"], distance: 5 });
  await reject({ type: "remove-sketch-geometry", sketchId: "sketch", geometryId: "rect" });
});
