import assert from "node:assert/strict";
import { beforeEach, afterEach, test } from "node:test";
import { serializeDocument, deserializeDocument } from "@agent-webcad/cad-document";
import { validateCommand, type CadCommand } from "@agent-webcad/cad-commands";
import { cadDocument } from "../../src/state/cadDocument";
import { dispatchCadCommand } from "../../src/state/dispatchCadCommand";
import { previewCadCommand, applyCadPlan, discardCadPlan } from "../../src/state/documentPlans";
import { cadHistory, undoDocument, redoDocument } from "../../src/state/history";
import { exactDrawingContour, contourLength, segmentPoint } from "../../src/features/drawing-editing/geometry/contourEditing";
import { offsetDrawingParams, offsetDrawingForObject } from "../../src/features/drawing-editing/geometry/drawingOperations";
import { drawingModelToWorld } from "../../src/precision/worldGeometry";
import { WORK_PLANES, planeToWorld, worldToPlane, type Vec3, type WorkPlaneId } from "../../src/precision/workPlane";
import { resetTestDocument, restoreTestDocument, documentState } from "../helpers/documentHarness";
const original = structuredClone(cadDocument);
beforeEach(resetTestDocument); afterEach(() => { restoreTestDocument(original); cadHistory.clear(); });
const feature = (id: string) => Object.values(cadDocument.features).find(f => f.output === id)!;
const path = (id: string) => exactDrawingContour(cadDocument.objects[id], feature(id));
const near = (a: number, b: number, tolerance = 1e-6) => assert.ok(Math.abs(a - b) <= tolerance, `${a} ≈ ${b}`);
const pointNear = (a: Vec3, b: Vec3) => a.forEach((v, i) => near(v, b[i]));
async function apply(command: CadCommand) { const r = await dispatchCadCommand(command); assert.ok(r.ok, r.reason); return r; }
async function drawing(id: string, kind: "line" | "polyline" | "arc" | "circle", params: Record<string, unknown>) { return apply({ type: "create-drawing", id, drawing: kind, params: { workPlane: "XY", ...params } }); }
const line = (id: string, a: Vec3, b: Vec3) => drawing(id, "line", { points: [a, b] });
async function rejected(command: CadCommand, pattern: RegExp = /./) { const before = documentState(), h = cadHistory.getPastLabels().length, r = await dispatchCadCommand(command); assert.equal(r.ok, false); assert.match(r.reason!, pattern); assert.deepEqual(documentState(), before); assert.equal(cadHistory.getPastLabels().length, h); }
const corner = (treatment: "fillet" | "chamfer", distance: number, extra = {}): CadCommand => ({ type: "connect-drawings", firstId: "a", secondId: "b", firstPoint: [5, 0, 0], secondPoint: [0, 5, 0], treatment, distance, id: "connector", ...extra });
const dShape = { points: [[0, -10, 0], [0, 10, 0], [-20, 10, 0], [-20, -10, 0]], closed: true, bulges: [1, 0, 0, 0] };

test("curve connection payloads reject self-connection and nonfinite or zero inputs", () => {
  assert.ok(validateCommand(corner("fillet", 2)));
  for (const extra of [{ secondId: "a" }, { firstPoint: [0, NaN, 0] }, { distance: 0 }, { treatment: "round" }]) assert.equal(validateCommand(corner("fillet", 2, extra)), false);
});
test("closed D offsets keep analytic tangent arcs, normal distance and winding", async () => {
  await drawing("d", "polyline", dShape);
  const before = documentState(), h = cadHistory.getPastLabels().length, p = await previewCadCommand({ type: "offset-drawing", objectId: "d", distance: 2 });
  assert.ok(p.result.ok, p.result.reason); assert.deepEqual(documentState(), before); assert.equal(cadHistory.getPastLabels().length, h);
  const r = await applyCadPlan(p.planId), id = r.createdIds[0], result = path(id), arc = result.segments[0];
  near(arc.radius!, 8); near(arc.sweep!, Math.PI); pointNear(arc.center!, [0, 0, 0]); pointNear(result.segments[1].end, [-18, 8, 0]);
  near(contourLength(result), 52 + 8 * Math.PI); assert.equal(result.closed, true);
  const after = documentState(); assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)), cadDocument);
  await undoDocument(); assert.deepEqual(documentState(), before); await redoDocument(); assert.deepEqual(documentState(), after); discardCadPlan(p.planId);
});
test("non-tangent line/arc offset joins use exact supporting intersections", async () => {
  await drawing("mixed", "polyline", { points: [[0, 0, 0], [10, 0, 0], [0, 10, 0]], bulges: [0, Math.tan(Math.PI / 8)] });
  const r = await apply({ type: "offset-drawing", objectId: "mixed", distance: 2 }), result = path(r.createdIds[0]);
  pointNear(result.segments[0].end, [Math.sqrt(60), 2, 0]); pointNear(result.segments[1].center!, [0, 0, 0]); near(result.segments[1].radius!, 8);
  near(result.segments[1].sweep!, Math.PI / 2 - Math.asin(.25));
});
test("clockwise arcs offset left outwards and collapse is rejected atomically", async () => {
  await drawing("circle-poly", "polyline", { points: [[10, 0, 0], [-10, 0, 0]], closed: true, bulges: [-1, -1] });
  const r = await apply({ type: "offset-drawing", objectId: "circle-poly", distance: 2 });
  for (const s of path(r.createdIds[0]).segments) { near(s.radius!, 12); near(s.sweep!, -Math.PI); }
  await rejected({ type: "offset-drawing", objectId: "circle-poly", distance: 10, side: "right" });
  assert.equal(offsetDrawingParams("polyline", { ...dShape, workPlane: "XY" }, 11), null);
  assert.equal(offsetDrawingParams("polyline", { points: [[10, 0, 0], [-10, 0, 0], [10, 0, 0], [-10, 0, 0]], closed: true, bulges: [1, 1, 1, 1] }, 2), null, "Coincident doubled arcs must not produce a falsely valid contour");
});
test("curved offsets preserve elevated XY/XZ/YZ frames under rotation, scale and reflection", async () => {
  for (const [index, plane] of (["XY", "XZ", "YZ"] as WorkPlaneId[]).entries()) {
    const axes = WORK_PLANES[plane], from = (p: number[]): Vec3 => planeToWorld([p[0], p[1]], axes).map((v, i) => v + 7 * axes.normal[i] + 1e8 * axes.xAxis[i]) as Vec3;
    const id = `p${index}`; await drawing(id, "polyline", { workPlane: plane, points: [[10, 0], [0, 10], [-20, 10]].map(from), bulges: [Math.tan(Math.PI / 8), 0] });
    const rotation: Vec3 = plane === "XY" ? [0, 0, 32] : plane === "XZ" ? [0, 32, 0] : [32, 0, 0];
    cadDocument.objects[id].transform = { translation: [15, 23, 17], rotation, scale: plane === "XY" ? [-2, 2, 2] : plane === "XZ" ? [-2, 2, 2] : [2, -2, 2] };
    const originalArc = path(id).segments[0], sourceStart = originalArc.start;
    const r = await apply({ type: "offset-drawing", objectId: id, distance: 4 }), offset = path(r.createdIds[0]);
    near(offset.segments[0].radius!, 24, 1e-5); pointNear(offset.segments[0].center!, originalArc.center!);
    near(Math.hypot(...offset.segments[0].start.map((v, i) => v - sourceStart[i])), 4, 1e-5);
    near(worldToPlane(offset.segments[0].center!, axes)[0], worldToPlane(originalArc.center!, axes)[0]);
  }
});
test("curved polyline Trim/Extend preserve centers, neighbors and stable topology", async () => {
  await drawing("mixed", "polyline", { points: [[10, -10, 0], [10, 0, 0], [0, 10, 0]], bulges: [0, Math.tan(Math.PI / 8)] });
  await line("cut", [5, 0, 0], [5, 20, 0]); await line("extend", [-5, 0, 0], [-5, 20, 0]);
  const topology = structuredClone(feature("mixed").params.topology), before = documentState(), h = cadHistory.getPastLabels().length;
  await apply({ type: "trim-drawing", targetId: "mixed", cutterId: "cut", pickPoint: [10 * Math.cos(5 * Math.PI / 12), 10 * Math.sin(5 * Math.PI / 12), 0] });
  const arc = path("mixed").segments[1]; near(arc.radius!, 10); near(arc.sweep!, Math.PI / 3); pointNear(arc.center!, [0, 0, 0]); pointNear(path("mixed").segments[0].start, [10, -10, 0]); assert.deepEqual(feature("mixed").params.topology, topology);
  await apply({ type: "extend-drawing", targetId: "mixed", cutterId: "extend", pickPoint: arc.end });
  near(path("mixed").segments[1].sweep!, 2 * Math.PI / 3); pointNear(path("mixed").segments[1].end, [-5, Math.sqrt(75), 0]); assert.deepEqual(feature("mixed").params.topology, topology); assert.equal(cadHistory.getPastLabels().length, h + 2);
  await undoDocument(); await undoDocument(); assert.deepEqual(documentState(), before);
});
test("mixed polyline straight free end edits work while shared-vertex edits reject", async () => {
  await drawing("mixed", "polyline", { points: [[10, -10, 0], [10, 0, 0], [0, 10, 0]], bulges: [0, Math.tan(Math.PI / 8)] }); await line("cut", [0, -5, 0], [20, -5, 0]);
  await apply({ type: "trim-drawing", targetId: "mixed", cutterId: "cut", pickPoint: [10, -9, 0] });
  pointNear(path("mixed").segments[0].start, [10, -5, 0]); near(path("mixed").segments[1].radius!, 10);
  await line("cut-shared", [0, -2, 0], [20, -2, 0]); await rejected({ type: "trim-drawing", targetId: "mixed", cutterId: "cut-shared", pickPoint: [10, -1, 0] });
  await drawing("arc-first", "polyline", { points: [[10, 0, 0], [0, 10, 0], [-20, 10, 0]], bulges: [Math.tan(Math.PI / 8), 0] }); await line("cut-last", [-10, 0, 0], [-10, 20, 0]);
  const unchangedArc = structuredClone(path("arc-first").segments[0]);
  await apply({ type: "trim-drawing", targetId: "arc-first", cutterId: "cut-last", pickPoint: [-19, 10, 0] }); pointNear(path("arc-first").segments[1].end, [-10, 10, 0]); assert.deepEqual(path("arc-first").segments[0], unchangedArc);
});
test("two-object Fillet trims both picked branches with exact radius and tangency in one Undo", async () => {
  await line("a", [0, 0, 0], [20, 0, 0]); await line("b", [0, 0, 0], [0, 20, 0]);
  const before = documentState(), ids = [feature("a").params.topology, feature("b").params.topology], h = cadHistory.getPastLabels().length, p = await previewCadCommand(corner("fillet", 3));
  assert.ok(p.result.ok, p.result.reason); assert.deepEqual(documentState(), before); assert.equal(p.changes.length, 3);
  const r = await applyCadPlan(p.planId); assert.deepEqual(r.createdIds, ["connector"]); const arc = path("connector").segments[0];
  near(arc.radius!, 3); pointNear(arc.center!, [3, 3, 0]); pointNear(arc.start, [3, 0, 0]); pointNear(arc.end, [0, 3, 0]); near(arc.sweep!, -Math.PI / 2);
  for (const [index, id] of ["a", "b"].entries()) { assert.deepEqual(feature(id).params.topology, ids[index]); const s = path(id).segments[0], d = s.end.map((v, i) => v - s.start[i]), radial = s.start.map((v, i) => v - arc.center![i]); near(d.reduce((sum, v, i) => sum + v * radial[i], 0), 0); }
  assert.equal(cadHistory.getPastLabels().length, h + 1); const after = documentState(); await undoDocument(); assert.deepEqual(documentState(), before); await redoDocument(); assert.deepEqual(documentState(), after);
});
test("Chamfer extends separated branches, then Join and Offset operate on their exact result", async () => {
  await line("a", [10, 0, 0], [20, 0, 0]); await line("b", [0, 20, 0], [0, 10, 0]);
  await apply(corner("chamfer", 3, { firstPoint: [15, 0, 0], secondPoint: [0, 15, 0] }));
  pointNear(path("a").segments[0].start, [3, 0, 0]); pointNear(path("b").segments[0].end, [0, 3, 0]); near(contourLength(path("connector")), 3 * Math.sqrt(2));
  await apply({ type: "join-drawings", objectIds: ["a", "b", "connector"], id: "joined" });
  near(contourLength(path("joined")), 34 + 3 * Math.sqrt(2)); const r = await apply({ type: "offset-drawing", objectId: "joined", distance: 1 }); assert.equal(path(r.createdIds[0]).segments.length, 3);
});
test("two-object corners support transformed/elevated end segments and retain untouched polyline arcs", async () => {
  await drawing("a", "polyline", { workPlane: "XZ", points: [[0, 7, 0], [20, 7, 0], [30, 7, 10]], bulges: [0, Math.tan(Math.PI / 8)] });
  await drawing("b", "line", { workPlane: "XZ", points: [[0, 7, 0], [0, 7, 20]] });
  cadDocument.objects.a.transform = { translation: [10, 3, 4], rotation: [0, 25, 0], scale: [2, 2, 2] };
  const frame = (p: Vec3) => drawingModelToWorld(cadDocument.objects.a, feature("a"), p)!;
  // Place B in world coordinates to avoid relying on the same inverse-frame implementation.
  feature("b").params.points = [frame([0, 7, 0]), frame([0, 7, 20])];
  const untouched = structuredClone(path("a").segments[1]);
  await apply(corner("fillet", 4, { firstPoint: frame([5, 7, 0]), secondPoint: frame([0, 7, 5]) }));
  near(path("connector").segments[0].radius!, 4); assert.deepEqual(path("a").segments[1], untouched);
});
test("failed corners leave both sources, connector IDs and history unchanged", async () => {
  await line("a", [0, 0, 0], [20, 0, 0]); await line("b", [0, 0, 0], [0, 20, 0]);
  await rejected(corner("fillet", 21), /consumes/); await rejected(corner("fillet", 2, { firstPoint: [0, 0, 0] }), /away/);
  cadDocument.layers["layer-default"].locked = true; await rejected(corner("chamfer", 2), /unlock/); cadDocument.layers["layer-default"].locked = false;
  feature("b").params.points = [[0, 1, 0], [20, 1, 0]]; await rejected(corner("fillet", 2, { secondPoint: [5, 1, 0] }), /Parallel/);
});
test("source dimensions refresh in the same reviewed connection plan", async () => {
  await line("a", [0, 0, 0], [20, 0, 0]); await line("b", [0, 0, 0], [0, 20, 0]);
  await apply({ type: "create-dimension", id: "dimension", dimension: "linear", params: { sourceObjectId: "a", points: [[0, 0], [20, 0]] } });
  const p = await previewCadCommand(corner("chamfer", 4)); assert.ok(p.result.ok, p.result.reason); assert.ok(p.changes.some(c => c.objectId === "dimension"));
  await applyCadPlan(p.planId); assert.deepEqual(feature("dimension").params.points, [[4, 0], [20, 0]]);
});

test("offset preview and commit share the frame when a rotation flips its normal", async () => {
  await drawing("mixed", "polyline", { points: [[10, 0, 0], [0, 10, 0], [-20, 10, 0]], bulges: [Math.tan(Math.PI / 8), 0] });
  cadDocument.objects.mixed.transform = { translation: [5, 9, 7], rotation: [180, 0, 0], scale: [2, 2, 2] };
  const before = path("mixed"), params = offsetDrawingForObject(cadDocument.objects.mixed, feature("mixed"), 4)!;
  assert.ok(params); const r = await apply({ type: "offset-drawing", objectId: "mixed", distance: 4 });
  const after = path(r.createdIds[0]); near(after.segments[0].radius!, 24); pointNear(after.segments[0].center!, before.segments[0].center!);
  assert.deepEqual(feature(r.createdIds[0]).params.points, params.points); assert.deepEqual(feature(r.createdIds[0]).params.bulges, params.bulges);
  await drawing("circle", "circle", { center: [0, 0, 0], radius: 5 }); cadDocument.objects.circle.transform = { translation: [2, 3, 4], rotation: [0, 0, 20], scale: [-2, 2, 2] };
  const circle = await apply({ type: "offset-drawing", objectId: "circle", distance: 3 }); near(path(circle.createdIds[0]).segments[0].radius!, 13); pointNear(path(circle.createdIds[0]).segments[0].center!, path("circle").segments[0].center!);
});

test("two-object connectors preserve construction visibility purpose and reject mixed purposes", async () => {
  await line("a", [0, 0, 0], [20, 0, 0]); await line("b", [0, 0, 0], [0, 20, 0]);
  feature("a").params.construction = true; await rejected(corner("chamfer", 2), /purpose/);
  feature("b").params.construction = true; await apply(corner("fillet", 2)); assert.equal(feature("connector").params.construction, true);
});

test("connected source edits regenerate saved constructions and reject loss of a dependent intersection atomically", async () => {
  await line("a", [0, 0, 0], [20, 0, 0]); await line("b", [0, 0, 0], [0, 20, 0]);
  await apply({ type: "create-construction", id: "mid", workPlane: "XY", definition: { operation: "midpoint", segmentId: "a" } });
  await drawing("circle", "circle", { center: [0, 0, 0], radius: 2 });
  await apply({ type: "create-construction", id: "intersection", workPlane: "XY", definition: { operation: "intersection", firstId: "a", secondId: "circle", branch: "positive" } });
  await rejected(corner("chamfer", 4), /intersection|domain|branch|intersect/i);
  await apply(corner("chamfer", 1));
  pointNear((feature("mid").params.points as Vec3[])[0], [10.5, 0, 0]); pointNear((feature("intersection").params.points as Vec3[])[0], [2, 0, 0]);
  const before = documentState(); const p = await previewCadCommand({ type: "join-drawings", objectIds: ["a", "b", "connector"] });
  assert.equal(p.result.ok, false); assert.match(p.result.reason!, /references/i); assert.deepEqual(documentState(), before); discardCadPlan(p.planId);
});
