import assert from "node:assert/strict";
import { beforeEach, afterEach, test } from "node:test";
import { serializeDocument, deserializeDocument } from "@agent-webcad/cad-document";
import { validateCommand, type CadCommand } from "@agent-webcad/cad-commands";
import { cadDocument } from "../../src/state/cadDocument";
import { dispatchCadCommand } from "../../src/state/dispatchCadCommand";
import { previewCadCommand, applyCadPlan, discardCadPlan } from "../../src/state/documentPlans";
import { cadHistory, undoDocument, redoDocument } from "../../src/state/history";
import { exactDrawingContour, contourLength, segmentPoint } from "../../src/features/drawing-editing/geometry/contourEditing";
import { trimContour } from "../../src/features/drawing-editing/geometry/trimContour";
import type { DrawingTopology } from "../../src/precision/drawingTopology";
import { WORK_PLANES, planeToWorld, type Vec3, type WorkPlaneId } from "../../src/precision/workPlane";
import { buildExtrudeMesh, buildSweepMesh } from "../../src/cad/kernelGeometryService";
import { drawingModelToWorld } from "../../src/precision/worldGeometry";
import { resetTestDocument, restoreTestDocument, documentState, meshVolume } from "../helpers/documentHarness";
const original = structuredClone(cadDocument);
beforeEach(resetTestDocument); afterEach(() => { restoreTestDocument(original); cadHistory.clear(); });
const feature = (id: string) => Object.values(cadDocument.features).find(f => f.output === id)!;
const path = (id: string) => exactDrawingContour(cadDocument.objects[id], feature(id));
const topology = (id: string) => feature(id).params.topology as DrawingTopology;
const near = (a: number, b: number, tolerance = 1e-6) => assert.ok(Math.abs(a - b) <= tolerance, `${a} ≈ ${b}`);
async function apply(command: CadCommand) { const r = await dispatchCadCommand(command); assert.ok(r.ok, r.reason); return r; }
async function drawing(id: string, kind: "line" | "polyline" | "rectangle" | "circle" | "arc", params: Record<string, unknown>) { return apply({ type: "create-drawing", id, drawing: kind, params: { workPlane: "XY", ...params } }); }
const line = (id: string, a: Vec3, b: Vec3) => drawing(id, "line", { points: [a, b] });
async function reject(command: CadCommand, reason: RegExp = /./) { const before = documentState(), h = cadHistory.getPastLabels().length, r = await dispatchCadCommand(command); assert.equal(r.ok, false); assert.match(r.reason!, reason); assert.deepEqual(documentState(), before); assert.equal(cadHistory.getPastLabels().length, h); }
async function setupOpen() {
  await line("source", [0, 0, 0], [100, 0, 0]);
  await drawing("boundary", "polyline", { points: [[40, -20, 0], [40, 20, 0], [60, 20, 0], [60, -20, 0]] });
  await apply({ type: "create-dimension", id: "dim", dimension: "linear", params: { workPlane: "XY", points: [[0, 0], [100, 0]], sourceObjectId: "source", offset: 12, text: "<> mm" } });
}
const cut = (extra = {}): CadCommand => ({ type: "trim-contour", objectId: "source", cutterIds: ["boundary"], pickPoint: [50, 0, 0], ...extra });
const dimRoute = { dependentId: "dim", sourceId: "source", resultIndices: [0] };
async function setupClosed() {
  await drawing("source", "rectangle", { points: [[0, 0, 0], [100, 0, 0], [100, 60, 0], [0, 60, 0]] });
  await line("boundary", [40, 70, 0], [110, 0, 0]);
  await apply({ type: "create-dimension", id: "dim", dimension: "linear", params: { workPlane: "XY", points: [[0, 0], [100, 0]], sourceObjectId: "source", sourceSegmentId: topology("source").segments[0].id, offset: 12 } });
  await apply({ type: "create-extrude", id: "plate", profileObjectIds: ["source"], distance: 10 });
}
const closedCut = (rejoin: boolean): CadCommand => ({ type: "trim-contour", objectId: "source", cutterIds: ["boundary"], pickPoint: [100, 40, 0], rejoin, referenceRoutes: [{ ...dimRoute, segmentIndex: 2 }, { dependentId: "plate", sourceId: "source", resultIndices: [0] }] });

test("Trim and bridge payloads validate finite picks and unique complete mappings", () => {
  assert.ok(validateCommand(cut({ referenceRoutes: [dimRoute] })));
  for (const extra of [{ cutterIds: ["source"] }, { cutterIds: [] }, { pickPoint: [0, NaN, 0] }, { referenceRoutes: [{ ...dimRoute, resultIndices: [-1] }] }, { referenceRoutes: [dimRoute, dimRoute] }]) assert.equal(validateCommand(cut(extra)), false);
  assert.ok(validateCommand({ type: "join-drawings", objectIds: ["source"], bridges: [{ fromId: "source", fromEnd: "end", toId: "source", toEnd: "start" }] }));
  assert.equal(validateCommand({ type: "join-drawings", objectIds: ["source"], bridges: [{ fromId: "other", fromEnd: "end", toId: "source", toEnd: "start" }] }), false);
});
test("middle Trim → explicit gap Join → dimension refresh survives Undo/Redo and save", async () => {
  await setupOpen(); const before = documentState(), h = cadHistory.getPastLabels().length;
  const preview = await previewCadCommand(cut({ referenceRoutes: [dimRoute] })); assert.ok(preview.result.ok, preview.result.reason); assert.deepEqual(documentState(), before); assert.equal(cadHistory.getPastLabels().length, h);
  const r = await applyCadPlan(preview.planId); assert.deepEqual(r.createdIds, preview.result.createdIds); const [a, b] = r.createdIds; near(contourLength(path(a)), 40); near(contourLength(path(b)), 40); assert.deepEqual(feature("dim").params.points, [[0, 0], [40, 0]]);
  assert.equal(feature("dim").params.text, "<> mm"); const afterTrim = documentState();
  await apply({ type: "join-drawings", objectIds: [a, b], id: "joined", bridges: [{ fromId: a, fromEnd: "end", toId: b, toEnd: "start" }], referenceRoutes: [{ dependentId: "dim", sourceId: a, resultIndices: [0] }] });
  near(contourLength(path("joined")), 100); assert.deepEqual(feature("dim").params.points, [[0, 0], [100, 0]]); assert.deepEqual(feature("dim").inputs, ["joined"]); assert.equal(cadHistory.getPastLabels().length, h + 2);
  const after = documentState(); assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)), cadDocument);
  await undoDocument(); assert.deepEqual(documentState(), afterTrim); await undoDocument(); assert.deepEqual(documentState(), before); await redoDocument(); await redoDocument(); assert.deepEqual(documentState(), after); discardCadPlan(preview.planId);
});
test("closed corner Trim + straight rejoin changes area/volume and retains a linked edge", async () => {
  await setupClosed(); const before = documentState(), edge = topology("source").segments[0].id, h = cadHistory.getPastLabels().length;
  await reject(closedCut(false), /regenerate|closed|open|profile/i);
  const p = await previewCadCommand(closedCut(true)); assert.ok(p.result.ok, p.result.reason); assert.deepEqual(documentState(), before);
  near(p.changes.find(c => c.objectId === "plate")!.before!.volume!, 60000, .01); near(p.changes.find(c => c.objectId === "plate")!.after!.volume!, 47500, .01);
  const result = await applyCadPlan(p.planId), id = result.createdIds[0]; assert.ok(path(id).closed); assert.equal(path(id).segments.length, 5); assert.equal(topology(id).segments[2].id, edge); assert.equal(feature("dim").params.sourceSegmentId, edge); assert.deepEqual(feature("plate").inputs, [id]); near(meshVolume(await buildExtrudeMesh(feature("plate").params)), 47500, .05); assert.equal(cadHistory.getPastLabels().length, h + 1);
  await apply({ type: "edit-drawing-control", objectId: id, controlId: topology(id).controls[3].id, point: [120, 0, 0] }); assert.deepEqual(feature("dim").params.points, [[0, 0], [120, 0]]); near(meshVolume(await buildExtrudeMesh(feature("plate").params)), 48500, .05);
  const after = documentState(); await undoDocument(); await undoDocument(); assert.deepEqual(documentState(), before); await redoDocument(); await redoDocument(); assert.deepEqual(documentState(), after);
  const reopened = deserializeDocument(serializeDocument(cadDocument)); assert.deepEqual(reopened, cadDocument); restoreTestDocument(reopened);
  await apply({ type: "edit-drawing-control", objectId: id, controlId: topology(id).controls[3].id, point: [140, 0, 0] }); assert.deepEqual(feature("dim").params.points, [[0, 0], [140, 0]]); near(meshVolume(await buildExtrudeMesh(feature("plate").params)), 49500, .05); discardCadPlan(p.planId);
});
test("missing, stale, wrong-kind and extra routes reject without source loss", async () => {
  await setupOpen(); await reject(cut(), /Reconnect/);
  await reject(cut({ referenceRoutes: [{ ...dimRoute, resultIndices: [9] }] }), /result/);
  await reject(cut({ referenceRoutes: [{ ...dimRoute, dependentId: "absent" }] }), /Reconnect/);
  await reject(cut({ referenceRoutes: [{ ...dimRoute, resultIndices: [0, 1] }] }), /exactly one/);
  await reject(cut({ referenceRoutes: [{ ...dimRoute, segmentIndex: 9 }] }), /existing result edge/);
  await reject(cut({ referenceRoutes: [dimRoute, { ...dimRoute, dependentId: "extra" }] }), /Reconnect/);
});
test("locked and unsupported dependents reject explicit remapping atomically", async () => {
  await setupOpen(); cadDocument.layers["annotations"] = { id: "annotations", name: "Annotations", locked: true, visible: true, objectIds: ["dim"] }; cadDocument.objects.dim.layerId = "annotations";
  await reject(cut({ referenceRoutes: [dimRoute] }), /Unlock/);
  cadDocument.layers.annotations.locked = false;
  // A drafting dependent models an unsupported relationship without weakening its own policy.
  cadDocument.features["dependent"] = { id: "dependent", type: "drafting", inputs: ["source"], output: "dependent", params: { kind: "hatch" } };
  await reject(cut({ referenceRoutes: [dimRoute, { dependentId: "dependent", sourceId: "source", resultIndices: [0] }] }), /unsupported/);
});
test("circle seam Trim keeps exact arcs and radius references follow later edits", async () => {
  await drawing("source", "circle", { center: [0, 0, 0], radius: 10 }); await line("boundary", [0, -20, 0], [0, 20, 0]);
  await apply({ type: "create-dimension", id: "dim", dimension: "radius", params: { center: [0, 0], radius: 10, sourceObjectId: "source", angle: 45 } });
  const r = await apply({ type: "trim-contour", objectId: "source", cutterIds: ["boundary"], pickPoint: [10, 0, 0], referenceRoutes: [{ ...dimRoute, segmentIndex: 0 }] }); const id = r.createdIds[0]; near(contourLength(path(id)), Math.PI * 10); assert.ok(path(id).segments.every(s => s.kind === "arc" && Math.abs(s.radius! - 10) < 1e-8)); near(Number(feature("dim").params.radius), 10); assert.ok(feature("dim").params.sourceSegmentId);
  await reject({ type: "edit-polyline", objectId: id, operation: "delete", controlId: topology(id).controls[0].id }, /references an edge/);
  await apply({ type: "edit-polyline", objectId: id, operation: "delete", controlId: topology(id).controls[1].id }); near(Number(feature("dim").params.radius), 10); assert.equal(path(id).segments.length, 1);
});
test("bounded cutters do not trim their infinite extension; tangencies and overlap reject", async () => {
  await line("source", [0, 0, 0], [100, 0, 0]); await line("boundary", [40, 1, 0], [40, 20, 0]); await reject(cut(), /crossing/);
  feature("boundary").params.points = [[20, 0, 0], [60, 0, 0]]; await reject(cut(), /overlaps/);
  await drawing("circle", "circle", { center: [0, 0, 0], radius: 10 }); feature("boundary").params.points = [[-20, 10, 0], [20, 10, 0]];
  await reject({ type: "trim-contour", objectId: "circle", cutterIds: ["boundary"], pickPoint: [10, 0, 0] }, /Tangencies/);
});
test("picks at cuts and off the contour cannot select an interval", async () => {
  await setupOpen(); await reject(cut({ pickPoint: [40, 0, 0], referenceRoutes: [dimRoute] }), /inside a portion/); await reject(cut({ pickPoint: [50, 1, 0], referenceRoutes: [dimRoute] }), /exact point/);
});
test("closed Trim can commit open geometry then explicitly reclose it with Join", async () => {
  await drawing("source", "rectangle", { points: [[0, 0, 0], [100, 0, 0], [100, 60, 0], [0, 60, 0]] }); await line("boundary", [40, 70, 0], [110, 0, 0]);
  const r = await apply({ type: "trim-contour", objectId: "source", cutterIds: ["boundary"], pickPoint: [100, 40, 0] }); const id = r.createdIds[0]; assert.equal(path(id).closed, false);
  await apply({ type: "join-drawings", objectIds: [id], id: "closed", bridges: [{ fromId: id, fromEnd: "end", toId: id, toEnd: "start" }] }); assert.ok(path("closed").closed);
  await apply({ type: "create-extrude", id: "plate", profileObjectIds: ["closed"], distance: 10 }); near(meshVolume(await buildExtrudeMesh(feature("plate").params)), 47500, .05);
});
test("all principal planes and elevated large coordinates preserve analytic circle cuts", async () => {
  for (const plane of ["XY", "XZ", "YZ"] as WorkPlaneId[]) {
    const axes = WORK_PLANES[plane], p = (x: number, y: number): Vec3 => planeToWorld([x + 1e8, y], axes).map((v, i) => v + 7 * axes.normal[i]) as Vec3;
    await drawing(plane, "circle", { workPlane: plane, center: p(0, 0), radius: 10 }); await drawing(`${plane}-cut`, "line", { workPlane: plane, points: [p(0, -20), p(0, 20)] });
    const result = await apply({ type: "trim-contour", objectId: plane, cutterIds: [`${plane}-cut`], pickPoint: p(10, 0) }); const remaining = path(result.createdIds[0]); near(contourLength(remaining), 10 * Math.PI, 1e-5); for (const s of remaining.segments) near(s.radius!, 10);
  }
});
test("interior arc intervals and arc cutters use exact circle intersections", async () => {
  await drawing("source", "arc", { center: [0, 0, 0], radius: 10, startAngle: 0, endAngle: Math.PI }); await drawing("boundary", "circle", { center: [0, 8, 0], radius: 6 });
  const original = path("source"), t = trimContour(original, [path("boundary")], segmentPoint(original.segments[0], .5, "XY")); assert.equal(t.pieces.length, 2);
  const angle = Math.asin(.8); for (const p of t.pieces) near(contourLength(p), 10 * angle); for (const s of t.pieces.flatMap(p => p.segments)) { near(s.radius!, 10); assert.deepEqual(s.center, [0, 0, 0]); }
});
test("a boundary that only touches a polygon corner does not split the removed interval", async () => {
  await drawing("source", "rectangle", { points: [[0, 0, 0], [100, 0, 0], [100, 60, 0], [0, 60, 0]] }); await line("cross", [50, -20, 0], [50, 80, 0]); await line("touch", [-10, 10, 0], [10, -10, 0]);
  const result = trimContour(path("source"), [path("cross"), path("touch")], [0, 30, 0], true);
  assert.equal(result.cuts.length, 2); assert.ok(result.pieces[0].closed); near(contourLength(result.removed), 160); near(contourLength(result.pieces[0]), 220);
});
test("straight gap reconnection rejects a tangential self-contact", async () => {
  await drawing("source", "polyline", { points: [[-10, 0, 0], [-10, 10, 0], [10, 10, 0], [10, 0, 0]], bulges: [0, 1, 0] });
  await reject({ type: "join-drawings", objectIds: ["source"], bridges: [{ fromId: "source", fromEnd: "end", toId: "source", toEnd: "start" }] }, /crosses retained/);
});
test("dimension routes preserve measurement direction and reject zero projected extent", async () => {
  await setupOpen(); await apply({ type: "update-dimension", objectId: "dim", params: { orientation: "horizontal" } });
  // Remove a corner from an L; one retained piece is vertical and cannot carry this horizontal dimension.
  feature("source").params.kind = "polyline"; feature("source").params.points = [[0, 0, 0], [100, 0, 0], [100, 100, 0]];
  feature("boundary").params.points = [[80, -20, 0], [80, 20, 0], [120, 20, 0]];
  await reject(cut({ pickPoint: [90, 0, 0], referenceRoutes: [{ ...dimRoute, resultIndices: [1], segmentIndex: 0 }] }), /zero extent/);
});
test("rotated, scaled and reflected contours cut in world space on every principal plane", async () => {
  for (const [i, plane] of (["XY", "XZ", "YZ"] as WorkPlaneId[]).entries()) {
    const axes = WORK_PLANES[plane], from = (x: number, y: number): Vec3 => planeToWorld([x, y], axes).map((v, j) => v + 7 * axes.normal[j]) as Vec3, id = `source-${i}`, cutter = `cutter-${i}`;
    await drawing(id, "rectangle", { workPlane: plane, points: [from(0, 0), from(100, 0), from(100, 60), from(0, 60)] });
    cadDocument.objects[id].transform = { translation: [1e8, 17, 23], rotation: plane === "XY" ? [0, 0, 32] : plane === "XZ" ? [0, 32, 0] : [32, 0, 0], scale: plane === "YZ" ? [2, -2, 2] : [-2, 2, 2] };
    const world = (x: number, y: number) => drawingModelToWorld(cadDocument.objects[id], feature(id), from(x, y))!;
    await drawing(cutter, "line", { workPlane: plane, points: [world(40, 70), world(110, 0)] }); const expectedCorner = world(100, 10);
    const r = await apply({ type: "trim-contour", objectId: id, cutterIds: [cutter], pickPoint: world(100, 40), rejoin: true });
    const p = path(r.createdIds[0]); assert.ok(p.closed); assert.ok(p.segments.some(s => Math.hypot(...s.end.map((v, j) => v - expectedCorner[j])) < 1e-5));
    near(contourLength(p), 2 * (220 + Math.sqrt(5000)), 1e-5);
  }
});
test("path remapping keeps Sweep input roles and regenerates its shortened spine", async () => {
  await setupOpen(); await drawing("section", "rectangle", { workPlane: "YZ", points: [[0, -1, -1], [0, 1, -1], [0, 1, 1], [0, -1, 1]] });
  await apply({ type: "create-sweep", id: "swept", profileObjectIds: ["section"], pathObjectId: "source" }); near(meshVolume(await buildSweepMesh(feature("swept").params)), 400, .05);
  const r = await apply(cut({ referenceRoutes: [dimRoute, { dependentId: "swept", sourceId: "source", resultIndices: [0] }] }));
  assert.deepEqual(feature("swept").inputs, ["section", r.createdIds[0]]); assert.deepEqual(feature("swept").params.spine, [[0, 0, 0], [40, 0, 0]]); near(meshVolume(await buildSweepMesh(feature("swept").params)), 160, .05);
});
test("one closed Trim routes all live solids and measures the regenerated revolution", async () => {
  await setupClosed(); await apply({ type: "create-revolve", id: "wheel", profileObjectIds: ["source"], axis: "y", angle: 360 });
  const command = closedCut(true); if (command.type !== "trim-contour") throw new Error("Unexpected command"); command.referenceRoutes!.push({ dependentId: "wheel", sourceId: "source", resultIndices: [0] });
  const p = await previewCadCommand(command); assert.ok(p.result.ok, p.result.reason);
  near(p.changes.find(c => c.objectId === "wheel")!.before!.volume!, 600000 * Math.PI, .01); near(p.changes.find(c => c.objectId === "wheel")!.after!.volume!, (600000 - 625000 / 3) * Math.PI, .01);
  const r = await applyCadPlan(p.planId); assert.deepEqual(feature("wheel").inputs, r.createdIds); assert.deepEqual(feature("plate").inputs, r.createdIds); discardCadPlan(p.planId);
});
