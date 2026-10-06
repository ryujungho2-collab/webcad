import assert from "node:assert/strict";
import { beforeEach, afterEach, test } from "node:test";
import { validateCommand, type CadCommand } from "@agent-webcad/cad-commands";
import { serializeDocument, deserializeDocument } from "@agent-webcad/cad-document";
import { cadDocument } from "../../src/state/cadDocument";
import { dispatchCadCommand } from "../../src/state/dispatchCadCommand";
import { previewCadCommand, applyCadPlan, discardCadPlan, getCadPlanDrawingPaths } from "../../src/state/documentPlans";
import { cadHistory, undoDocument, redoDocument } from "../../src/state/history";
import { contourLength, exactDrawingContour, segmentPoint } from "../../src/features/drawing-editing/geometry/contourEditing";
import { getWorldDrawingGeometry } from "../../src/precision/worldGeometry";
import type { DrawingTopology } from "../../src/precision/drawingTopology";
import { planeToWorld, WORK_PLANES, type Vec3, type WorkPlaneId } from "../../src/precision/workPlane";
import { measureDocumentObject } from "../../src/state/documentQuery";
import { resetTestDocument, restoreTestDocument, documentState } from "../helpers/documentHarness";
const original = structuredClone(cadDocument);
beforeEach(resetTestDocument); afterEach(() => { restoreTestDocument(original); cadHistory.clear(); });
const feature = (id: string) => Object.values(cadDocument.features).find(f => f.output === id)!;
const path = (id: string) => exactDrawingContour(cadDocument.objects[id], feature(id));
const top = (id: string) => feature(id).params.topology as DrawingTopology;
const near = (a: number, b: number, tolerance = 1e-7) => assert.ok(Math.abs(a - b) <= tolerance, `${a} ≈ ${b}`);
const pointNear = (a: Vec3, b: Vec3) => a.forEach((v, i) => near(v, b[i]));
async function apply(command: CadCommand) { const r = await dispatchCadCommand(command); assert.ok(r.ok, r.reason); return r; }
async function drawing(id: string, kind: "line" | "arc" | "circle" | "polyline" | "rectangle", params: Record<string, unknown>, plane: WorkPlaneId = "XY") { await apply({ type: "create-drawing", id, drawing: kind, params: { workPlane: plane, ...params } }); }
const line = (id: string, a: Vec3, b: Vec3) => drawing(id, "line", { points: [a, b] });
const lengthen = (id: string, value: number, mode: "total" | "delta" | "percent" = "total", endpoint: "start" | "end" = "end") => apply({ type: "lengthen-drawing", objectId: id, endpoint, mode, value });
const stretch = (ids: string[], first: Vec3, second: Vec3, delta: Vec3, workPlane: WorkPlaneId = "XY") => apply({ type: "stretch-drawings", objectIds: ids, workPlane, first, second, delta });
async function rejected(command: CadCommand, match: RegExp) { const before = documentState(), h = cadHistory.getPastLabels().length, r = await dispatchCadCommand(command); assert.equal(r.ok, false); assert.match(r.reason!, match); assert.deepEqual(documentState(), before); assert.equal(cadHistory.getPastLabels().length, h); }
const rectangle = (id: string) => drawing(id, "rectangle", { points: [[0, 0, 0], [100, 0, 0], [100, 60, 0], [0, 60, 0]] });

test("basic edit payloads require valid operation references, unique sources and finite values", () => {
  for (const payload of [{ type: "edit-polyline", objectId: "p", operation: "insert", segmentId: "s", point: [1, 2, 0] }, { type: "edit-polyline", objectId: "p", operation: "open" }, { type: "lengthen-drawing", objectId: "l", endpoint: "start", mode: "delta", value: -10 }, { type: "stretch-drawings", objectIds: ["l"], workPlane: "XY", first: [0, 0, 0], second: [10, 10, 0], delta: [1, 0, 0] }]) assert.ok(validateCommand(payload));
  for (const payload of [{ type: "edit-polyline", objectId: "p", operation: "insert", point: [1, 2, 0] }, { type: "edit-polyline", objectId: "p", operation: "delete" }, { type: "lengthen-drawing", objectId: "l", endpoint: "both", mode: "total", value: 10 }, { type: "lengthen-drawing", objectId: "l", endpoint: "start", mode: "percent", value: 0 }, { type: "lengthen-drawing", objectId: "l", endpoint: "end", mode: "delta", value: Infinity }, { type: "stretch-drawings", objectIds: ["l", "l"], workPlane: "XY", first: [0, 0, 0], second: [10, 10, 0], delta: [1, 0, 0] }]) assert.equal(validateCommand(payload), false);
});
test("Lengthen total/delta/percent keeps the fixed endpoint, direction, identity and live dimension", async () => {
  await line("l", [0, 0, 0], [30, 40, 0]);
  await apply({ type: "create-dimension", id: "dim", dimension: "linear", params: { points: [[0, 0], [30, 40]], sourceObjectId: "l", workPlane: "XY", offset: 12 } });
  const before = documentState(), geometryId = cadDocument.objects.l.geometryId, controls = structuredClone(top("l"));
  await lengthen("l", 100); pointNear(path("l").segments[0].start, [0, 0, 0]); pointNear(path("l").segments[0].end, [60, 80, 0]);
  assert.deepEqual(feature("dim").params.points, [[0, 0], [60, 80]]); assert.equal(feature("dim").params.offset, 12); assert.equal(cadDocument.objects.l.geometryId, geometryId); assert.deepEqual(top("l"), controls);
  const after = documentState(); await undoDocument(); assert.deepEqual(documentState(), before); await redoDocument(); assert.deepEqual(documentState(), after);
  await lengthen("l", -25, "delta", "start"); pointNear(path("l").segments[0].start, [15, 20, 0]); pointNear(path("l").segments[0].end, [60, 80, 0]);
  await lengthen("l", 200, "percent"); near(contourLength(path("l")), 150); pointNear(path("l").segments[0].start, [15, 20, 0]);
});
test("Lengthen crosses polyline vertices from either endpoint without losing surviving topology", async () => {
  await drawing("p", "polyline", { points: [[0, 0, 0], [40, 0, 0], [40, 30, 0], [70, 30, 0]] });
  const initial = structuredClone(top("p"));
  await lengthen("p", 50); assert.deepEqual(feature("p").params.points, [[0, 0, 0], [40, 0, 0], [40, 10, 0]]);
  assert.deepEqual(top("p").controls.map(c => c.id), [initial.controls[0].id, initial.controls[1].id, initial.controls[3].id]);
  await undoDocument(); await lengthen("p", 50, "total", "start"); (feature("p").params.points as Vec3[]).forEach((p, i) => pointNear(p, ([[40, 10, 0], [40, 30, 0], [70, 30, 0]] as Vec3[])[i]));
  assert.deepEqual(top("p").controls.map(c => c.id), [initial.controls[0].id, initial.controls[2].id, initial.controls[3].id]);
  await lengthen("p", 10, "delta", "start"); pointNear(path("p").segments[0].start, [40, 0, 0]);
});
test("Lengthen of a terminal polyline arc changes analytic sweep, preserving radius and unaffected vertices", async () => {
  await drawing("p", "polyline", { points: [[-20, 0, 0], [10, 0, 0], [0, 10, 0]], bulges: [0, Math.tan(Math.PI / 8)] });
  await lengthen("p", 30 + 10 * Math.PI); const s = path("p").segments[1]; near(s.radius!, 10); near(s.sweep!, Math.PI); pointNear(s.center!, [0, 0, 0]); pointNear(s.end, [-10, 0, 0]);
  await lengthen("p", 35); near(path("p").segments[1].sweep!, .5); pointNear(path("p").segments[0].start, [-20, 0, 0]);
});
test("Clockwise arc Lengthen preserves centre, radius and the chosen fixed endpoint", async () => {
  await drawing("a", "arc", { center: [20, 30, 4], radius: 10, startAngle: Math.PI / 2, endAngle: 0 });
  await lengthen("a", 10 * Math.PI); near(Number(feature("a").params.endAngle), -Math.PI / 2); near(Number(feature("a").params.startAngle), Math.PI / 2);
  await lengthen("a", 5 * Math.PI, "total", "start"); near(Number(feature("a").params.startAngle), 0); near(Number(feature("a").params.endAngle), -Math.PI / 2); pointNear(feature("a").params.center as Vec3, [20, 30, 4]);
  await rejected({ type: "lengthen-drawing", objectId: "a", endpoint: "end", mode: "total", value: 20 * Math.PI }, /full circle/);
});
for (const plane of ["XY", "XZ", "YZ"] as const) test(`Lengthen and insertion preserve elevated, rotated and reflected ${plane} world geometry`, async () => {
  const frame = WORK_PLANES[plane], elevate = (p: [number, number]): Vec3 => planeToWorld(p, frame).map((v, i) => v + frame.normal[i] * 7) as Vec3;
  await drawing("p", "polyline", { points: [elevate([0, 0]), elevate([10, 0]), elevate([10, 10])] }, plane);
  cadDocument.objects.p.transform = { translation: [23, 41, 5], rotation: frame.normal.map(v => v * 30) as Vec3, scale: [-2, 2, 2] };
  const before = path("p"), p = segmentPoint(before.segments[0], .5, plane), segmentId = top("p").segments[0].id;
  await apply({ type: "edit-polyline", objectId: "p", operation: "insert", segmentId, point: p });
  pointNear(path("p").segments[0].start, before.segments[0].start); pointNear(path("p").segments[0].end, p); pointNear(path("p").segments.at(-1)!.end, before.segments.at(-1)!.end);
  await lengthen("p", 50); near(contourLength(path("p")), 50); pointNear(path("p").segments[0].start, before.segments[0].start);
});
test("Insert/delete exact arc vertices is reversible and keeps curve area, perimeter and reference IDs", async () => {
  await drawing("p", "polyline", { points: [[-10, 0, 0], [10, 0, 0]], bulges: [1, 1], closed: true });
  const original = structuredClone(top("p")), expected = await measureDocumentObject(cadDocument, "p"), point = segmentPoint(path("p").segments[0], .25, "XY");
  await apply({ type: "edit-polyline", objectId: "p", operation: "insert", segmentId: original.segments[0].id, point });
  const inserted = top("p").controls[1].id; assert.deepEqual(top("p").controls.filter(c => c.id !== inserted).map(c => c.id), original.controls.map(c => c.id));
  near(contourLength(path("p")), 20 * Math.PI); for (const s of path("p").segments) { near(s.radius!, 10); pointNear(s.center!, [0, 0, 0]); }
  const measurement = await measureDocumentObject(cadDocument, "p"); near(measurement.area!, expected.area!);
  // Closed three-vertex deletion back to a two-arc circle must be allowed.
  await apply({ type: "edit-polyline", objectId: "p", operation: "delete", controlId: inserted });
  near(contourLength(path("p")), 20 * Math.PI); assert.deepEqual(top("p"), original);
  assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)), cadDocument);
});
test("Insert on a straight segment can add a corner, and delete removes that corner without moving others", async () => {
  await drawing("p", "polyline", { points: [[0, 0, 0], [100, 0, 0], [100, 60, 0]] });
  const ids = top("p").controls.map(c => c.id);
  await apply({ type: "edit-polyline", objectId: "p", operation: "insert", segmentId: top("p").segments[0].id, point: [50, 10, 0] });
  assert.deepEqual(feature("p").params.points, [[0, 0, 0], [50, 10, 0], [100, 0, 0], [100, 60, 0]]);
  await apply({ type: "edit-polyline", objectId: "p", operation: "delete", controlId: top("p").controls[1].id });
  assert.deepEqual(feature("p").params.points, [[0, 0, 0], [100, 0, 0], [100, 60, 0]]); assert.deepEqual(top("p").controls.map(c => c.id), ids);
});
test("Open removes the closing segment; Close adds it back while preserving surviving references", async () => {
  await rectangle("p"); const ids = structuredClone(top("p"));
  await apply({ type: "edit-polyline", objectId: "p", operation: "open" }); assert.equal(path("p").closed, false); near(contourLength(path("p")), 260); assert.equal(top("p").segments.length, 3);
  await apply({ type: "edit-polyline", objectId: "p", operation: "close" }); assert.equal(path("p").closed, true); near(contourLength(path("p")), 320);
  assert.deepEqual(top("p").controls.map(c => c.id), ids.controls.map(c => c.id)); assert.deepEqual(top("p").segments.slice(0, 3).map(s => s.id), ids.segments.slice(0, 3).map(s => s.id));
});
test("Vertex insertion keeps a live solid profile; opening it rejects and rolls back every linked object", async () => {
  await rectangle("p"); await apply({ type: "create-extrude", id: "solid", profileObjectIds: ["p"], distance: 8 });
  await apply({ type: "edit-polyline", objectId: "p", operation: "insert", segmentId: top("p").segments[0].id, point: [50, 0, 0] });
  near((await measureDocumentObject(cadDocument, "solid")).volume!, 100 * 60 * 8, 1e-3);
  await rejected({ type: "edit-polyline", objectId: "p", operation: "open" }, /closed|profile|loop|not connected/i);
});
test("Stretch moves only enclosed endpoints/vertices and centres, not lines merely crossing the area", async () => {
  await line("partial", [0, 0, 0], [100, 0, 0]); await line("crossing", [0, 20, 0], [200, 20, 0]); await line("whole", [95, 10, 0], [105, 10, 0]); await drawing("circle", "circle", { center: [100, 40, 0], radius: 30 });
  const before = documentState(), h = cadHistory.getPastLabels().length;
  await stretch(["partial", "crossing", "whole", "circle"], [90, -10, 0], [110, 50, 0], [20, 5, 0]);
  pointNear(path("partial").segments[0].start, [0, 0, 0]); pointNear(path("partial").segments[0].end, [120, 5, 0]);
  assert.deepEqual(feature("crossing").params.points, [[0, 20, 0], [200, 20, 0]]); assert.deepEqual(feature("whole").params.points, [[115, 15, 0], [125, 15, 0]]); pointNear(getWorldDrawingGeometry(cadDocument.objects.circle, feature("circle"))!.center!, [120, 45, 0]);
  assert.equal(cadHistory.getPastLabels().length, h + 1); const after = documentState(); await undoDocument(); assert.deepEqual(documentState(), before); await redoDocument(); assert.deepEqual(documentState(), after);
});
test("Stretch of a rectangle updates its exact area and dependent solid volume with stable IDs", async () => {
  await rectangle("p"); await apply({ type: "create-extrude", id: "solid", profileObjectIds: ["p"], distance: 8 });
  const ids = structuredClone(top("p")); await stretch(["p"], [90, -10, 0], [110, 70, 0], [20, 0, 0]);
  assert.equal(feature("p").params.kind, "polyline"); assert.deepEqual(top("p"), ids); assert.deepEqual(feature("p").params.points, [[0, 0, 0], [120, 0, 0], [120, 60, 0], [0, 60, 0]]);
  near((await measureDocumentObject(cadDocument, "p")).area!, 7200); near((await measureDocumentObject(cadDocument, "solid")).volume!, 57600, 1e-3); assert.deepEqual(feature("solid").inputs, ["p"]);
});
test("Partial arc Stretch keeps its included angle and fixed endpoint; radius dimension follows", async () => {
  await drawing("a", "arc", { center: [0, 0, 0], radius: 10, startAngle: 0, endAngle: Math.PI / 2 });
  await apply({ type: "create-dimension", id: "dim", dimension: "radius", params: { center: [0, 0], radius: 10, sourceObjectId: "a", workPlane: "XY" } });
  await stretch(["a"], [9, -1, 0], [11, 1, 0], [10, 0, 0]); const s = path("a").segments[0];
  pointNear(s.start, [20, 0, 0]); pointNear(s.end, [0, 10, 0]); near(s.sweep!, Math.PI / 2); near(s.radius!, Math.sqrt(250)); near(Number(feature("dim").params.radius), Math.sqrt(250));
});
test("A collapsed edge in one Stretch source rejects all sources and their live dimensions", async () => {
  await line("a", [0, 0, 0], [10, 0, 0]); await line("b", [0, 20, 0], [10, 20, 0]);
  await apply({ type: "create-dimension", id: "dim", dimension: "linear", params: { points: [[0, 0], [10, 0]], sourceObjectId: "a" } });
  await rejected({ type: "stretch-drawings", objectIds: ["a", "b"], workPlane: "XY", first: [9, -1, 0], second: [11, 21, 0], delta: [-10, 0, 0] }, /zero-length|invalid segment/);
});
test("Preview cancellation/staleness and Apply once retain exact in-place IDs and a single Undo", async () => {
  await line("l", [0, 0, 0], [100, 0, 0]); const before = documentState(), h = cadHistory.getPastLabels().length, command: CadCommand = { type: "lengthen-drawing", objectId: "l", endpoint: "end", mode: "total", value: 150 };
  const p = await previewCadCommand(command); assert.ok(p.result.ok); assert.deepEqual(documentState(), before); assert.equal(cadHistory.getPastLabels().length, h); assert.equal(getCadPlanDrawingPaths(p.planId, "l")!.after![1][0], 150); discardCadPlan(p.planId);
  const stale = await previewCadCommand(command); await apply({ type: "rename-object", objectId: "l", name: "Changed" }); assert.equal((await applyCadPlan(stale.planId)).ok, false);
  const current = await previewCadCommand(command); await applyCadPlan(current.planId); const after = documentState(), count = cadHistory.getPastLabels().length; assert.ok((await applyCadPlan(current.planId)).alreadyApplied); assert.equal(cadHistory.getPastLabels().length, count); assert.deepEqual(documentState(), after);
  await undoDocument(); near(contourLength(path("l")), 100); assert.equal(cadDocument.objects.l.name, "Changed");
});
test("Bindings, sketch ownership, patterns, visibility and locks cannot be bypassed by basic edit commands", async () => {
  await drawing("a", "arc", { center: [0, 0, 0], radius: 10, startAngle: 0, endAngle: Math.PI / 2 });
  await apply({ type: "set-parameter-binding", target: { kind: "feature", objectId: "a", parameter: "radius" }, expression: "10mm" });
  await rejected({ type: "stretch-drawings", objectIds: ["a"], workPlane: "XY", first: [9, -1, 0], second: [11, 1, 0], delta: [10, 0, 0] }, /binding|expression|driven/i);
  await line("l", [0, 0, 0], [10, 0, 0]); feature("l").params.sketchId = "owned";
  await rejected({ type: "lengthen-drawing", objectId: "l", endpoint: "end", mode: "total", value: 20 }, /sketch/i); delete feature("l").params.sketchId;
  cadDocument.objects.l.visible = false; await rejected({ type: "lengthen-drawing", objectId: "l", endpoint: "end", mode: "total", value: 20 }, /unlock|Show/); cadDocument.objects.l.visible = true;
  cadDocument.layers["layer-default"].locked = true; await rejected({ type: "lengthen-drawing", objectId: "l", endpoint: "end", mode: "total", value: 20 }, /unlock/);
});
test("Closed Lengthen, off-plane/degenerate Stretch and ambiguous curved vertex deletion reject explicitly", async () => {
  await rectangle("p"); await rejected({ type: "lengthen-drawing", objectId: "p", endpoint: "end", mode: "total", value: 200 }, /open/);
  await rejected({ type: "stretch-drawings", objectIds: ["p"], workPlane: "XY", first: [90, -1, 0], second: [110, 70, 0], delta: [1, 0, 1] }, /same work plane/);
  await rejected({ type: "stretch-drawings", objectIds: ["p"], workPlane: "XY", first: [90, -1, 0], second: [90, 70, 0], delta: [1, 0, 0] }, /positive width/);
  await drawing("mixed", "polyline", { points: [[-10, 0, 0], [10, 0, 0], [0, 10, 0]], bulges: [0, Math.tan(Math.PI / 8)] });
  await rejected({ type: "edit-polyline", objectId: "mixed", operation: "delete", controlId: top("mixed").controls[1].id }, /different curves/);
  await rejected({ type: "edit-polyline", objectId: "mixed", operation: "insert", segmentId: top("mixed").segments[1].id, point: [5, 5, 0] }, /exact arc/);
});
for (const plane of ["XY", "XZ", "YZ"] as const) test(`Stretch ${plane} checks world-area/elevation and retains unaffected transformed vertices`, async () => {
  const frame = WORK_PLANES[plane], elevate = (u: number, v: number): Vec3 => planeToWorld([u, v], frame).map((n, i) => n + frame.normal[i] * 7) as Vec3;
  await drawing("p", "rectangle", { points: [elevate(0, 0), elevate(10, 0), elevate(10, 10), elevate(0, 10)] }, plane);
  cadDocument.objects.p.transform = { translation: [23, 41, 5], rotation: frame.normal.map(v => v * 30) as Vec3, scale: [-2, 2, 2] };
  const before = path("p"), hit = before.segments[1].start, a = hit.map((n, i) => n - frame.xAxis[i] - frame.yAxis[i]) as Vec3, b = hit.map((n, i) => n + frame.xAxis[i] + frame.yAxis[i]) as Vec3, delta = frame.xAxis.map(n => n * 3) as Vec3;
  await stretch(["p"], a, b, delta, plane);
  path("p").segments.forEach((s, i) => pointNear(s.start, before.segments[i].start.map((n, axis) => n + (i === 1 ? delta[axis] : 0)) as Vec3));
  assert.ok(path("p").closed); assert.equal(feature("p").params.kind, "polyline");
});
test("Survey coordinates and nonuniform straight-line scale use world lengths without rounding or pivot drift", async () => {
  await line("l", [1e9, 2e9, 0], [1e9 + 30, 2e9 + 40, 0]); cadDocument.objects.l.transform = { translation: [23, 41, 5], rotation: [0, 0, 30], scale: [2, 3, 1] };
  const fixed = path("l").segments[0].start; await lengthen("l", 200); near(contourLength(path("l")), 200, 1e-5); pointNear(path("l").segments[0].start, fixed);
});
test("No affected vertices, zero displacement and full-circle Lengthen do not publish history", async () => {
  await line("l", [0, 0, 0], [100, 0, 0]);
  await rejected({ type: "stretch-drawings", objectIds: ["l"], workPlane: "XY", first: [40, -1, 0], second: [60, 1, 0], delta: [10, 0, 0] }, /No endpoints/);
  await rejected({ type: "stretch-drawings", objectIds: ["l"], workPlane: "XY", first: [90, -1, 0], second: [110, 1, 0], delta: [0, 0, 0] }, /nonzero/);
  await drawing("a", "arc", { center: [0, 0, 0], radius: 10, startAngle: 0, endAngle: Math.PI * 2 });
  await lengthen("a", 10 * Math.PI); near(Number(feature("a").params.endAngle), Math.PI);
  await rejected({ type: "lengthen-drawing", objectId: "a", endpoint: "start", mode: "total", value: 25 * Math.PI }, /full circle/);
});
test("Scaled arc insertion checks world tolerance and constructs the new vertex on the original circle", async () => {
  await drawing("p", "polyline", { points: [[10, 0, 0], [0, 10, 0]], bulges: [Math.tan(Math.PI / 8)] });
  cadDocument.objects.p.transform = { translation: [0, 0, 0], rotation: [0, 0, 30], scale: [1000, 1000, 1] };
  const before = path("p"), p = segmentPoint(before.segments[0], .5, "XY"), segmentId = top("p").segments[0].id;
  await rejected({ type: "edit-polyline", objectId: "p", operation: "insert", segmentId, point: [p[0] + .0001, p[1], p[2]] }, /exact arc/);
  await apply({ type: "edit-polyline", objectId: "p", operation: "insert", segmentId, point: p });
  for (const s of path("p").segments) { near(s.radius!, 10000); pointNear(s.center!, before.segments[0].center!); }
});
