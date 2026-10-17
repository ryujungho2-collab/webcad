import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { deserializeDocument, serializeDocument } from "@agent-webcad/cad-document";
import type { CadCommand, ContourReferenceRoute } from "@agent-webcad/cad-commands";
import { cadDocument } from "../../src/state/cadDocument";
import { dispatchCadCommand } from "../../src/state/dispatchCadCommand";
import { previewCadCommand, applyCadPlan, discardCadPlan } from "../../src/state/documentPlans";
import { cadHistory, undoDocument, redoDocument } from "../../src/state/history";
import { assertConstructionEvaluation } from "../../src/precision/constructionGeometry";
import { solveSketch } from "../../src/precision/sketchSolver";
import { exactDrawingContour } from "../../src/features/drawing-editing/geometry/contourEditing";
import { resetTestDocument, documentState, meshVolume } from "../helpers/documentHarness";
import { buildExtrudeMesh } from "../../src/cad/kernelGeometryService";
import { contourReferenceRequirements } from "../../src/features/drawing-editing/commands/contourReferences";
import { newScene } from "../../src/state/sceneCommands";
beforeEach(resetTestDocument);
const feature = (id: string) => Object.values(cadDocument.features).find(f => f.output === id)!;
const near = (a: number, b: number, tolerance = 1e-4) => assert.ok(Math.abs(a - b) <= tolerance, `${a} ≈ ${b}`);
async function apply(command: CadCommand) { const r = await dispatchCadCommand(command); assert.ok(r.ok, r.reason); return r; }
async function reject(command: CadCommand, reason: RegExp) {
  const before = JSON.stringify(cadDocument), h = cadHistory.getPastLabels();
  const r = await dispatchCadCommand(command);
  assert.equal(r.ok, false); assert.match(r.reason!, reason);
  assert.equal(JSON.stringify(cadDocument), before); assert.deepEqual(cadHistory.getPastLabels(), h);
}
const sketchRoute = (constraintId: string, slot: string, extra: Partial<ContourReferenceRoute> = {}): ContourReferenceRoute =>
  ({ dependentId: `sketch-reference:${JSON.stringify(["sketch", constraintId, slot])}`, sourceId: "source", resultIndices: [0], ...extra });
const profileRoutes = () => contourReferenceRequirements(cadDocument, ["source"]).filter(r => r.kind === "profile").map(r => ({ dependentId: r.dependentId, sourceId: "source", resultIndices: [0] }));
async function rectangle() {
  await apply({ type: "create-sketch", id: "sketch", workPlane: "XY" });
  await apply({ type: "add-sketch-geometry", sketchId: "sketch", geometry: { id: "source", kind: "rectangle", origin: [0, 0], width: 100, height: 60, cornerIds: ["a", "b", "c", "d"], edgeIds: ["ab", "bc", "cd", "da"] } });
}
async function widthDimension() {
  await apply({ type: "add-sketch-constraint", sketchId: "sketch", constraint: { id: "width", kind: "distance", first: { geometryId: "source", pointId: "a" }, second: { geometryId: "source", pointId: "b" }, value: 100 } as never });
}
function roundtrip(before: ReturnType<typeof documentState>) {
  const after = documentState();
  assert.ok(undoDocument()); assert.deepEqual(documentState(), before);
  assert.ok(redoDocument()); assert.deepEqual(documentState(), after);
  const loaded = deserializeDocument(serializeDocument(cadDocument));
  assert.deepEqual(loaded, cadDocument); assertConstructionEvaluation(loaded);
}

test("inserted vertex keeps reviewed spikes, driving width and live extrusion in one Undo", async () => {
  await rectangle(); await widthDimension();
  await apply({ type: "create-extrude", id: "plate", profileObjectIds: ["source"], distance: 10 });
  const before = documentState(), h = cadHistory.getPastLabels().length;
  const planned = await previewCadCommand({ type: "edit-polyline", objectId: "source", operation: "insert", segmentId: "ab", point: [40, 20, 0], referenceRoutes: [] });
  assert.equal(planned.result.ok, false); assert.match(planned.result.reason!, /Reconnect every/);
  discardCadPlan(planned.planId);
  const r = await apply({ type: "edit-polyline", objectId: "source", operation: "insert", segmentId: "ab", point: [40, -20, 0], referenceRoutes: [sketchRoute("width", "first", { pointIndex: 0 }), sketchRoute("width", "second", { pointIndex: 2 }), ...profileRoutes()] });
  assert.equal(r.createdIds.length, 0); assert.equal(cadHistory.getPastLabels().length, h + 1);
  assert.ok(cadDocument.objects.source);
  const params = feature("source").params;
  assert.equal(params.kind, "polyline");
  assert.deepEqual(params.points[1], [40, -20, 0]);
  const width = cadDocument.sketches!.sketch.constraints.find(c => c.id === "width")!;
  assert.equal((width as { value: number }).value, 100);
  assert.ok(solveSketch(cadDocument.sketches!.sketch).ok);
  near(meshVolume(await buildExtrudeMesh(feature("plate").params, true)), 70000, 1);
  const edited = documentState();
  assert.ok(undoDocument()); assert.deepEqual(documentState(), before);
  assert.ok(redoDocument()); assert.deepEqual(documentState(), edited);
  assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)), cadDocument);
  await apply({ type: "set-sketch-dimension", sketchId: "sketch", constraintId: "width", value: 120 });
  assert.ok(meshVolume(await buildExtrudeMesh(feature("plate").params, true)) > 70000);
});

test("deleted corner merges straights and midpoint construction follows the diagonal", async () => {
  await rectangle();
  await apply({ type: "create-construction", id: "M", workPlane: "XY", definition: { operation: "midpoint", segmentId: "source", elements: { segment: { topologyId: "ab" } } } });
  const r = await apply({ type: "edit-polyline", objectId: "source", operation: "delete", controlId: "b", referenceRoutes: [{ dependentId: "M", sourceId: "source", resultIndices: [0], segmentIndex: 0 }] });
  assert.ok(r.ok);
  assert.deepEqual(feature("M").params.points, [[50, 30, 0]]);
  const path = exactDrawingContour(cadDocument.objects.source, feature("source"));
  assert.ok(path.closed && path.segments.length === 3 && path.segments.every(s => s.kind === "line"));
});

test("open and close keep the driving dimension value and entity identity", async () => {
  await rectangle(); await widthDimension();
  const before = documentState();
  const opened = await apply({ type: "edit-polyline", objectId: "source", operation: "open", referenceRoutes: [sketchRoute("width", "first", { pointIndex: 0 }), sketchRoute("width", "second", { pointIndex: 1 })] });
  assert.ok(opened.ok);
  assert.equal(feature("source").params.closed, false);
  assert.equal((cadDocument.sketches!.sketch.constraints.find(c => c.id === "width") as { value: number }).value, 100);
  const afterOpen = documentState();
  assert.ok(undoDocument()); assert.deepEqual(documentState(), before);
  assert.ok(redoDocument()); assert.deepEqual(documentState(), afterOpen);
  await apply({ type: "edit-polyline", objectId: "source", operation: "close", referenceRoutes: [sketchRoute("width", "first", { pointIndex: 0 }), sketchRoute("width", "second", { pointIndex: 1 })] });
  assert.equal(feature("source").params.closed, true);
  assert.ok(cadDocument.objects.source);
  assert.equal((cadDocument.sketches!.sketch.constraints.find(c => c.id === "width") as { value: number }).value, 100);
});

test("invalid operations, missing routes and wrong portions fail without mutation", async () => {
  await apply({ type: "create-sketch", id: "sketch", workPlane: "XY" });
  await apply({ type: "add-sketch-geometry", sketchId: "sketch", geometry: { id: "arc", kind: "arc", center: [0, 0], radius: 10, startAngle: 0, endAngle: Math.PI, centerId: "c", startId: "s", endId: "e", curveId: "curve" } });
  await reject({ type: "edit-polyline", objectId: "arc", operation: "open", referenceRoutes: [] }, /already open/);
  resetTestDocument(); await rectangle(); await widthDimension();
  await reject({ type: "edit-polyline", objectId: "source", operation: "open", referenceRoutes: [] }, /Reconnect every/);
  await reject({ type: "edit-polyline", objectId: "source", operation: "open", referenceRoutes: [sketchRoute("width", "first", { segmentIndex: 0 }), sketchRoute("width", "second", { pointIndex: 1 })] }, /existing point/);
});

test("standalone edits stay direct and pattern and scene boundaries hold", async () => {
  await apply({ type: "create-drawing", id: "plain", drawing: "polyline", params: { workPlane: "XY", points: [[0, 0, 0], [100, 0, 0], [100, 60, 0]] } });
  const topology = feature("plain").params.topology as any;
  await apply({ type: "edit-polyline", objectId: "plain", operation: "insert", segmentId: topology.segments[0].id, point: [40, 0, 0] });
  assert.equal((feature("plain").params.points as unknown[]).length, 4);
  await reject({ type: "edit-polyline", objectId: "plain", operation: "open", referenceRoutes: [] }, /need no reference routes/);
  resetTestDocument(); await rectangle();
  await apply({ type: "create-pattern", id: "array", sourceObjectIds: ["source"], spec: { kind: "linear", workPlane: "XY", columns: 2, rows: 1, spacing: [200, 0] } });
  await reject({ type: "edit-polyline", objectId: "source", operation: "open", referenceRoutes: [] }, /Detach the pattern/);
  resetTestDocument(); await rectangle();
  await apply({ type: "create-artboard", id: "board", workPlane: "XY", origin: [-50, -50], size: [500, 500] });
  await apply({ type: "upsert-scene", scene: { ...newScene("board", ["source"]), id: "S" } });
  await reject({ type: "edit-polyline", objectId: "source", operation: "open", referenceRoutes: [] }, /scene relationship/);
});

test("stale reviewed vertex edit cannot commit after an intervening edit", async () => {
  await rectangle();
  const planned = await previewCadCommand({ type: "edit-polyline", objectId: "source", operation: "open", referenceRoutes: [] });
  assert.ok(planned.result.ok);
  await apply({ type: "rename-object", objectId: "source", name: "Changed" });
  const before = documentState(), h = cadHistory.getPastLabels();
  const r = await applyCadPlan(planned.planId);
  assert.equal(r.ok, false); assert.deepEqual(documentState(), before); assert.deepEqual(cadHistory.getPastLabels(), h);
  discardCadPlan(planned.planId);
});

test("locked source and construction dependent reject vertex edits atomically", async () => {
  await rectangle();
  await apply({ type: "set-layer-locked", layerId: cadDocument.objects.source.layerId, locked: true });
  await reject({ type: "edit-polyline", objectId: "source", operation: "open", referenceRoutes: [] }, /unlock/i);
  await apply({ type: "set-layer-locked", layerId: cadDocument.objects.source.layerId, locked: false });
  await apply({ type: "create-construction", id: "M", workPlane: "XY", definition: { operation: "midpoint", segmentId: "source", elements: { segment: { topologyId: "ab" } } } });
  await apply({ type: "create-layer", id: "refs", name: "References" });
  await apply({ type: "move-object-to-layer", objectId: "M", layerId: "refs" });
  await apply({ type: "set-layer-locked", layerId: "refs", locked: true });
  await reject({ type: "edit-polyline", objectId: "source", operation: "delete", controlId: "b", referenceRoutes: [{ dependentId: "M", sourceId: "source", resultIndices: [0], segmentIndex: 0 }] }, /Unlock/);
});

test("dimension routes conflicting with the reviewed contour fail atomically", async () => {
  await rectangle(); await widthDimension();
  // The first point is reviewed at x=40 while the second stays at x=100;
  // preserving the driving width of 100 would move the reviewed contour.
  await reject({ type: "edit-polyline", objectId: "source", operation: "insert", segmentId: "ab", point: [40, 0, 0], referenceRoutes: [sketchRoute("width", "first", { pointIndex: 1 }), sketchRoute("width", "second", { pointIndex: 2 })] }, /conflicts with the reviewed contour/);
});
