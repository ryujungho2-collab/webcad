import assert from "node:assert/strict";
import { beforeEach, afterEach, test } from "node:test";
import { serializeDocument, deserializeDocument, type CadFeature } from "@agent-webcad/cad-document";
import { validateCommand, type CadCommand } from "@agent-webcad/cad-commands";
import { cadDocument } from "../../src/state/cadDocument";
import { dispatchCadCommand } from "../../src/state/dispatchCadCommand";
import { previewCadCommand, applyCadPlan, discardCadPlan } from "../../src/state/documentPlans";
import { cadHistory, undoDocument, redoDocument } from "../../src/state/history";
import { exactDrawingContour, contourLength, locateOnContour } from "../../src/features/drawing-editing/geometry/contourEditing";
import { getWorldDrawingGeometry, drawingModelOrigin, drawingModelToWorld } from "../../src/precision/worldGeometry";
import { drawingRenderOrigin, drawingRenderPoints } from "../../src/viewport/drawingRenderer";
import { resolveLineEdit } from "../../src/features/drawing-editing/geometry/lineEditing";
import { measureDocumentObject } from "../../src/state/documentQuery";
import { profileSegments } from "../../src/precision/profileGeometry";
import { resetTestDocument, restoreTestDocument, documentState } from "../helpers/documentHarness";
import { planeToWorld, WORK_PLANES, type Vec3, type WorkPlaneId } from "../../src/precision/workPlane";
const original = structuredClone(cadDocument);
beforeEach(resetTestDocument); afterEach(() => { restoreTestDocument(original); cadHistory.clear(); });
const feature = (id: string) => Object.values(cadDocument.features).find(f => f.output === id)!;
const path = (id: string) => exactDrawingContour(cadDocument.objects[id], feature(id));
const near = (a: number, b: number, tolerance = 1e-7) => assert.ok(Math.abs(a - b) <= tolerance, `${a} ≈ ${b}`);
const pointNear = (a: Vec3, b: Vec3) => a.forEach((v, i) => near(v, b[i]));
async function apply(command: CadCommand) { const r = await dispatchCadCommand(command); assert.ok(r.ok, r.reason); return r; }
async function drawing(id: string, kind: "line" | "arc" | "circle" | "polyline" | "rectangle", params: Record<string, unknown>, workPlane: WorkPlaneId = "XY") { await apply({ type: "create-drawing", id, drawing: kind, params: { workPlane, ...params } }); }
const line = (id: string, a: Vec3, b: Vec3, plane: WorkPlaneId = "XY") => drawing(id, "line", { points: [a, b] }, plane);
async function rejected(command: CadCommand, pattern: RegExp) { const before = documentState(), h = cadHistory.getPastLabels().length, r = await dispatchCadCommand(command); assert.equal(r.ok, false); assert.match(r.reason!, pattern); assert.deepEqual(documentState(), before); assert.equal(cadHistory.getPastLabels().length, h); }

test("composition payloads reject duplicated/missing objects and nonfinite coordinates", () => {
  assert.ok(validateCommand({ type: "join-drawings", objectIds: ["a", "b"] }));
  assert.ok(validateCommand({ type: "explode-drawings", objectIds: ["a"] }));
  assert.ok(validateCommand({ type: "break-drawing", objectId: "a", firstPoint: [1, 2, 3], secondPoint: [4, 5, 6] }));
  for (const payload of [{ type: "join-drawings", objectIds: ["a"] }, { type: "join-drawings", objectIds: ["a", "a"] }, { type: "explode-drawings", objectIds: [] }, { type: "break-drawing", objectId: "a", firstPoint: [NaN, 0, 0] }, { type: "break-drawing", objectId: "a", firstPoint: [0, 0, 0], secondPoint: [0, Infinity, 0] }]) assert.equal(validateCommand(payload), false);
});

test("Join orders and reverses selected lines/arcs into an exact closed D contour", async () => {
  await drawing("arc", "arc", { center: [0, 0, 0], radius: 10, startAngle: -Math.PI / 2, endAngle: Math.PI / 2 });
  await line("top", [0, 10, 0], [-20, 10, 0]); await line("left", [-20, -10, 0], [-20, 10, 0]); await line("bottom", [-20, -10, 0], [0, -10, 0]);
  const h = cadHistory.getPastLabels().length, before = documentState();
  const result = await apply({ type: "join-drawings", objectIds: ["left", "arc", "bottom", "top"], id: "joined" });
  assert.deepEqual(result.createdIds, ["joined"]); assert.equal(cadHistory.getPastLabels().length, h + 1);
  assert.equal(feature("joined").params.closed, true); assert.equal((feature("joined").params.points as Vec3[]).length, 4);
  near(contourLength(path("joined")), 60 + 10 * Math.PI);
  const arc = path("joined").segments.find(s => s.kind === "arc")!; near(arc.radius!, 10); near(Math.abs(arc.sweep!), Math.PI); pointNear(arc.center!, [0, 0, 0]);
  const after = documentState(); await undoDocument(); assert.deepEqual(documentState(), before); await redoDocument(); assert.deepEqual(documentState(), after);
  assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)), cadDocument);
});

test("Join closes two exact semicircles and persists both topology segments", async () => {
  await drawing("a", "arc", { center: [0, 0, 0], radius: 10, startAngle: 0, endAngle: Math.PI });
  await drawing("b", "arc", { center: [0, 0, 0], radius: 10, startAngle: Math.PI, endAngle: 2 * Math.PI });
  await apply({ type: "join-drawings", objectIds: ["b", "a"], id: "loop" });
  assert.equal(path("loop").closed, true); near(contourLength(path("loop")), 20 * Math.PI);
  assert.equal((feature("loop").params.topology as { segments: unknown[] }).segments.length, 2);
  assert.equal(profileSegments("polyline", feature("loop").params).length, 2);
});

test("Explode and Join retain a rounded rectangle's analytic arc and layer style", async () => {
  await drawing("rect", "rectangle", { points: [[0, 0, 0], [20, 0, 0], [20, 10, 0], [0, 10, 0]] });
  await apply({ type: "edit-drawing-corner", objectId: "rect", controlId: (feature("rect").params.topology as { controls: { id: string }[] }).controls[1].id, treatment: "fillet", distance: 2 });
  cadDocument.layers["layer-default"].style = { color: "#f58342", lineType: "dashed", lineWidth: .5 };
  const expected = documentState(), exactLength = 56 + Math.PI;
  const result = await apply({ type: "explode-drawings", objectIds: ["rect"] });
  assert.equal(result.createdIds.length, 5); near(result.createdIds.reduce((n, id) => n + contourLength(path(id)), 0), exactLength);
  const arcId = result.createdIds.find(id => feature(id).params.kind === "arc")!; near(Number(feature(arcId).params.radius), 2); near(Number(feature(arcId).params.endAngle) - Number(feature(arcId).params.startAngle), Math.PI / 2);
  assert.ok(result.createdIds.every(id => cadDocument.objects[id].layerId === "layer-default"));
  await apply({ type: "join-drawings", objectIds: [...result.createdIds].reverse(), id: "rebuilt" }); near(contourLength(path("rebuilt")), exactLength);
  assert.equal(path("rebuilt").closed, true); assert.deepEqual(cadDocument.layers["layer-default"].style, expected.layers["layer-default"].style);
});

test("Break splits a line once and removes a two-point gap without changing its remaining endpoints", async () => {
  await line("line", [0, 0, 0], [100, 0, 0]);
  const split = await apply({ type: "break-drawing", objectId: "line", firstPoint: [40, 0, 0] });
  assert.equal(split.createdIds.length, 2); near(contourLength(path(split.createdIds[0])), 40); near(contourLength(path(split.createdIds[1])), 60);
  pointNear(path(split.createdIds[0]).segments[0].start, [0, 0, 0]); pointNear(path(split.createdIds[1]).segments[0].end, [100, 0, 0]);
  await undoDocument();
  const gap = await apply({ type: "break-drawing", objectId: "line", firstPoint: [50, 0, 0], secondPoint: [30, 0, 0] });
  near(gap.createdIds.reduce((n, id) => n + contourLength(path(id)), 0), 80); pointNear(path(gap.createdIds[0]).segments.at(-1)!.end, [30, 0, 0]); pointNear(path(gap.createdIds[1]).segments[0].start, [50, 0, 0]);
});

test("Break splits a mixed line/arc polyline at an exact angle, with no faceting", async () => {
  await drawing("mixed", "polyline", { points: [[-10, 0, 0], [10, 0, 0], [0, 10, 0]], bulges: [0, Math.tan(Math.PI / 8)] });
  const a = Math.PI / 6, p: Vec3 = [10 * Math.cos(a), 10 * Math.sin(a), 0];
  const result = await apply({ type: "break-drawing", objectId: "mixed", firstPoint: p });
  assert.equal(result.createdIds.length, 2); near(contourLength(path(result.createdIds[0])), 20 + 10 * a); near(contourLength(path(result.createdIds[1])), 10 * (Math.PI / 2 - a));
  for (const id of result.createdIds) for (const s of path(id).segments.filter(s => s.kind === "arc")) { near(s.radius!, 10); pointNear(s.center!, [0, 0, 0]); }
  assert.equal(feature(result.createdIds[1]).params.kind, "arc");
});

test("Closed contour Break opens at one point and uses first→second direction for a gap", async () => {
  await drawing("rect", "rectangle", { points: [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0]] });
  const opened = await apply({ type: "break-drawing", objectId: "rect", firstPoint: [5, 0, 0] });
  assert.equal(opened.createdIds.length, 1); assert.equal(path(opened.createdIds[0]).closed, false); near(contourLength(path(opened.createdIds[0])), 40);
  pointNear(path(opened.createdIds[0]).segments[0].start, [5, 0, 0]); pointNear(path(opened.createdIds[0]).segments.at(-1)!.end, [5, 0, 0]);
  await undoDocument();
  const shortGap = await apply({ type: "break-drawing", objectId: "rect", firstPoint: [5, 0, 0], secondPoint: [10, 5, 0] }); near(contourLength(path(shortGap.createdIds[0])), 30);
  await undoDocument();
  const longGap = await apply({ type: "break-drawing", objectId: "rect", firstPoint: [10, 5, 0], secondPoint: [5, 0, 0] }); near(contourLength(path(longGap.createdIds[0])), 10);
});

test("Circle gap produces one analytic arc and retains its exact centre/radius", async () => {
  await drawing("circle", "circle", { center: [20, 30, 4], radius: 10 });
  const result = await apply({ type: "break-drawing", objectId: "circle", firstPoint: [30, 30, 4], secondPoint: [10, 30, 4] });
  const arc = feature(result.createdIds[0]); assert.equal(arc.params.kind, "arc"); pointNear(arc.params.center as Vec3, [20, 30, 4]); near(Number(arc.params.radius), 10); near(contourLength(path(arc.output)), 10 * Math.PI);
});

for (const plane of ["XY", "XZ", "YZ"] as const) test(`Elevated/reflected ${plane} curves keep their direction, plane and scale through Explode/Break`, async () => {
  const frame = WORK_PLANES[plane], elevate = (p: [number, number]): Vec3 => planeToWorld(p, frame).map((v, i) => v + frame.normal[i] * 3) as Vec3;
  await drawing("arc", "arc", { center: elevate([0, 0]), radius: 10, startAngle: 0, endAngle: Math.PI / 2 }, plane);
  const transform = cadDocument.objects.arc.transform!; transform.rotation = [...frame.xAxis].map(v => v * 180) as Vec3; transform.scale = [2, 2, 2];
  const world = getWorldDrawingGeometry(cadDocument.objects.arc, feature("arc"))!;
  assert.ok(world.points!.every(p => Math.abs(p.reduce((sum, v, i) => sum + (v - world.center![i]) * frame.normal[i], 0)) < 1e-7));
  near(world.endAngle! - world.startAngle!, -Math.PI / 2);
  const exact = path("arc"), mid = locateOnContour(exact, world.points![Math.floor(world.points!.length / 2)]).point;
  const result = await apply({ type: "break-drawing", objectId: "arc", firstPoint: mid });
  near(result.createdIds.reduce((n, id) => n + contourLength(path(id)), 0), 10 * Math.PI);
  for (const id of result.createdIds) { near(path(id).segments[0].radius!, 20); assert.ok(path(id).segments[0].sweep! < 0); pointNear(path(id).segments[0].center!, world.center!); }
});

test("A rotated/scaled polyline is baked into world coordinates without bounds-pivot drift", async () => {
  await drawing("p", "polyline", { points: [[0, 0, 0], [10, 0, 0], [10, 10, 0]], bulges: [0, Math.tan(Math.PI / 8)] });
  cadDocument.objects.p.transform = { translation: [23, 41, 5], rotation: [0, 0, 30], scale: [-2, 2, 1] };
  const original = path("p"), result = await apply({ type: "explode-drawings", objectIds: ["p"] });
  original.segments.forEach((s, i) => { const actual = path(result.createdIds[i]).segments[0]; pointNear(actual.start, s.start); pointNear(actual.end, s.end); if (s.kind === "arc") { near(actual.radius!, 10 * Math.SQRT2); near(actual.sweep!, -Math.PI / 2); pointNear(actual.center!, s.center!); } });
});

test("Disconnected, branched and off-plane selections fail atomically with actionable reasons", async () => {
  await line("a", [0, 0, 0], [10, 0, 0]); await line("b", [10.001, 0, 0], [20, 0, 0]);
  await rejected({ type: "join-drawings", objectIds: ["a", "b"] }, /disconnected/);
  await line("c", [10, 0, 0], [10, 10, 0]); await line("d", [10, 0, 0], [20, 0, 0]);
  await rejected({ type: "join-drawings", objectIds: ["a", "c", "d"] }, /branches/);
  await line("e", [10, 0, 1], [20, 0, 1]); await rejected({ type: "join-drawings", objectIds: ["a", "e"] }, /elevation/);
  await rejected({ type: "break-drawing", objectId: "a", firstPoint: [5, .0001, 0] }, /not on the contour/);
  await rejected({ type: "break-drawing", objectId: "a", firstPoint: [0, 0, 0] }, /interior point/);
  await rejected({ type: "break-drawing", objectId: "a", firstPoint: [5, 0, 0], secondPoint: [5, 0, 0] }, /different points/);
});

test("Composition rejects dependent dimensions instead of silently freezing them", async () => {
  await line("a", [0, 0, 0], [10, 0, 0]); await line("b", [10, 0, 0], [20, 0, 0]);
  await apply({ type: "create-dimension", id: "dim", dimension: "linear", params: { workPlane: "XY", points: [[0, 0], [10, 0]], orientation: "aligned", offset: 4, sourceObjectId: "a" } });
  await rejected({ type: "join-drawings", objectIds: ["a", "b"] }, /references the selected contour/);
  await rejected({ type: "break-drawing", objectId: "a", firstPoint: [5, 0, 0] }, /references the selected contour/);
});

test("Ownership, expression, nonuniform curve scale and hidden/locked layer policies are explicit", async () => {
  await drawing("arc", "arc", { center: [0, 0, 0], radius: 10, startAngle: 0, endAngle: Math.PI });
  feature("arc").params.sketchId = "owned"; await rejected({ type: "break-drawing", objectId: "arc", firstPoint: [0, 10, 0] }, /belongs to a sketch/); delete feature("arc").params.sketchId;
  cadDocument.parameterBindings = { b: { id: "b", target: { kind: "feature", objectId: "arc", parameter: "radius" }, expression: "10mm" } };
  await rejected({ type: "break-drawing", objectId: "arc", firstPoint: [0, 10, 0] }, /driven by an expression/); delete cadDocument.parameterBindings;
  cadDocument.objects.arc.transform!.scale = [2, 1, 1]; await rejected({ type: "break-drawing", objectId: "arc", firstPoint: [0, 10, 0] }, /uniform/); cadDocument.objects.arc.transform!.scale = [1, 1, 1];
  cadDocument.layers["layer-default"].locked = true; await rejected({ type: "break-drawing", objectId: "arc", firstPoint: [0, 10, 0] }, /unlock/); cadDocument.layers["layer-default"].locked = false;
  cadDocument.objects.arc.visible = false; await rejected({ type: "break-drawing", objectId: "arc", firstPoint: [0, 10, 0] }, /Show/);
});

test("Whole-source dependent solids and patterns cannot lose their contour through composition", async () => {
  await drawing("p", "rectangle", { points: [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0]] });
  // This is a reference-policy test, independent of a kernel build.
  const dependent: CadFeature = { id: "dependent", output: "solid", type: "extrude", inputs: ["p"], dependencyMode: "live", params: { distance: 5 } }; cadDocument.features.dependent = dependent;
  await rejected({ type: "explode-drawings", objectIds: ["p"] }, /references/); delete cadDocument.features.dependent;
  await apply({ type: "create-pattern", id: "array", sourceObjectIds: ["p"], spec: { kind: "linear", workPlane: "XY", columns: 2, rows: 1, spacing: [20, 20] } });
  await rejected({ type: "explode-drawings", objectIds: ["p"] }, /references/);
  const instance = Object.values(cadDocument.features).find(f => f.pattern)!; await rejected({ type: "explode-drawings", objectIds: [instance.output] }, /Detach the pattern/);
});

test("Preview/cancel and stale apply have no history, valid apply is one reversible transaction", async () => {
  await line("a", [0, 0, 0], [10, 0, 0]); await line("b", [10, 0, 0], [20, 0, 0]);
  const before = documentState(), h = cadHistory.getPastLabels().length;
  const cancelled = await previewCadCommand({ type: "join-drawings", objectIds: ["b", "a"], id: "cancelled" }); assert.ok(cancelled.result.ok); assert.deepEqual(documentState(), before); assert.equal(cadHistory.getPastLabels().length, h); discardCadPlan(cancelled.planId);
  const stale = await previewCadCommand({ type: "join-drawings", objectIds: ["a", "b"], id: "stale" }); await apply({ type: "rename-object", objectId: "a", name: "Changed source" });
  const changed = documentState(), staleResult = await applyCadPlan(stale.planId); assert.equal(staleResult.ok, false); assert.match(staleResult.reason!, /changed/); assert.deepEqual(documentState(), changed);
  const valid = await previewCadCommand({ type: "join-drawings", objectIds: ["a", "b"], id: "valid" }); const count = cadHistory.getPastLabels().length; assert.ok((await applyCadPlan(valid.planId)).ok); assert.equal(cadHistory.getPastLabels().length, count + 1);
  const after = documentState(); assert.equal((await applyCadPlan(valid.planId)).changed, false); await undoDocument(); assert.deepEqual(documentState(), changed); await redoDocument(); assert.deepEqual(documentState(), after);
});

test("Trim/Extend keep the unchanged world endpoint of a rotated/scaled line and match the precision preview", async () => {
  await line("a", [0, 0, 0], [10, 0, 0]); cadDocument.objects.a.transform = { translation: [5, 3, 0], rotation: [0, 0, 90], scale: [2, 2, 1] };
  await line("cut", [-50, 5, 0], [50, 5, 0]);
  const target = cadDocument.objects.a, before = path("a").segments[0].start, controlIds = structuredClone(feature("a").params.topology);
  const preview = resolveLineEdit("trim", target, feature("a"), cadDocument.objects.cut, feature("cut"), [10, 12, 0]);
  pointNear(preview!.intersection, [10, 5, 0]);
  await apply({ type: "trim-drawing", targetId: "a", cutterId: "cut", pickPoint: [10, 12, 0] });
  pointNear(path("a").segments[0].start, before); pointNear(path("a").segments[0].end, [10, 5, 0]); assert.deepEqual(feature("a").params.topology, controlIds);
  await undoDocument(); await line("extension", [-50, 20, 0], [50, 20, 0]);
  await apply({ type: "extend-drawing", targetId: "a", cutterId: "extension", pickPoint: [10, 12, 0] });
  pointNear(path("a").segments[0].start, before); pointNear(path("a").segments[0].end, [10, 20, 0]);
});

test("A transformed corner edit leaves unaffected world vertices fixed when its analytic bounds change", async () => {
  await drawing("triangle", "polyline", { points: [[0, 0, 0], [20, 0, 0], [10, 10, 0]], closed: true });
  cadDocument.objects.triangle.transform = { translation: [25, 10, 0], rotation: [0, 0, 35], scale: [2, 2, 1] };
  const before = feature("triangle"), object = cadDocument.objects.triangle;
  const a = drawingModelToWorld(object, before, [0, 0, 0])!, b = drawingModelToWorld(object, before, [10, 10, 0])!;
  const control = (before.params.topology as { controls: { id: string }[] }).controls[1].id;
  await apply({ type: "edit-drawing-corner", objectId: "triangle", controlId: control, treatment: "fillet", distance: 2 });
  pointNear(drawingModelToWorld(cadDocument.objects.triangle, feature("triangle"), [0, 0, 0])!, a);
  pointNear(drawingModelToWorld(cadDocument.objects.triangle, feature("triangle"), [10, 10, 0])!, b);
});

test("Renderer and precision pivot use exact arc extrema, including elevated centres", async () => {
  const params = { kind: "arc", center: [20, 30, 4], radius: 10, startAngle: .123, endAngle: 2.345, workPlane: "XY" };
  const expected: Vec3 = [20 + 5 * (Math.cos(.123) + Math.cos(2.345)), 30 + 5 * (Math.sin(.123) + 1), 4];
  pointNear(drawingModelOrigin(params), expected); pointNear(drawingRenderOrigin(params, "XY"), expected);
  assert.ok(drawingRenderPoints(params, "XY").every(p => p[2] === 4));
  await drawing("arc", "arc", params); cadDocument.objects.arc.transform = { translation: [4, 7, 2], rotation: [0, 0, 27], scale: [-2, 2, 1] };
  const angle = 27 * Math.PI / 180, localStart: Vec3 = [20 + 10 * Math.cos(.123), 30 + 10 * Math.sin(.123), 4], x = -2 * (localStart[0] - expected[0]), y = 2 * (localStart[1] - expected[1]);
  pointNear(path("arc").segments[0].start, [expected[0] + 4 + x * Math.cos(angle) - y * Math.sin(angle), expected[1] + 7 + x * Math.sin(angle) + y * Math.cos(angle), 6]);
});

test("Survey-scale coordinates use model tolerance without accepting visible gaps", async () => {
  await line("a", [1e9, 1e9, 0], [1e9 + 10, 1e9, 0]); await line("b", [1e9 + 10, 1e9, 0], [1e9 + 20, 1e9, 0]);
  await apply({ type: "join-drawings", objectIds: ["a", "b"], id: "survey" }); near(contourLength(path("survey")), 20);
  const result = await apply({ type: "break-drawing", objectId: "survey", firstPoint: [1e9 + 5, 1e9, 0] }); near(result.createdIds.reduce((n, id) => n + contourLength(path(id)), 0), 20);
  await rejected({ type: "break-drawing", objectId: result.createdIds[1], firstPoint: [1e9 + 12, 1e9 + .01, 0] }, /not on the contour/);
});

test("A joined two-arc contour extrudes exactly and subsequent vertex editing regenerates the linked solid", async () => {
  await drawing("top", "arc", { center: [0, 0, 0], radius: 10, startAngle: 0, endAngle: Math.PI });
  await drawing("bottom", "arc", { center: [0, 0, 0], radius: 10, startAngle: Math.PI, endAngle: Math.PI * 2 });
  await apply({ type: "join-drawings", objectIds: ["top", "bottom"], id: "circular-profile" });
  await apply({ type: "create-extrude", id: "cylinder", profileObjectIds: ["circular-profile"], distance: 8 });
  assert.deepEqual(feature("cylinder").inputs, ["circular-profile"]);
  near((await measureDocumentObject(cadDocument, "cylinder")).volume!, Math.PI * 100 * 8, 1e-7);
  const before = documentState(), control = (feature("circular-profile").params.topology as { controls: { id: string }[] }).controls[0].id;
  await apply({ type: "edit-drawing-control", objectId: "circular-profile", controlId: control, point: [12, 0, 0] });
  near((await measureDocumentObject(cadDocument, "cylinder")).volume!, Math.PI * 121 * 8, 1e-7);
  const after = documentState(); await undoDocument(); assert.deepEqual(documentState(), before); await redoDocument(); assert.deepEqual(documentState(), after);
});
