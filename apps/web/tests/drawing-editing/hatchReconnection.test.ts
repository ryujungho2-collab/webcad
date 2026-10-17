import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { deserializeDocument, serializeDocument } from "@agent-webcad/cad-document";
import type { CadCommand, ContourReferenceRoute } from "@agent-webcad/cad-commands";
import { cadDocument } from "../../src/state/cadDocument";
import { dispatchCadCommand } from "../../src/state/dispatchCadCommand";
import { previewCadCommand, applyCadPlan, discardCadPlan } from "../../src/state/documentPlans";
import { cadHistory, undoDocument, redoDocument } from "../../src/state/history";
import { assertConstructionEvaluation } from "../../src/precision/constructionGeometry";
import { exactDrawingContour } from "../../src/features/drawing-editing/geometry/contourEditing";
import { worldDraftingGeometry } from "../../src/precision/draftingGeometry";
import { resetTestDocument, documentState } from "../helpers/documentHarness";
beforeEach(resetTestDocument);
const feature = (id: string) => Object.values(cadDocument.features).find(f => f.output === id)!;
const hatchLinesOf = (id: string) => worldDraftingGeometry(cadDocument, cadDocument.objects[id], feature(id)).lines;
async function apply(command: CadCommand) { const r = await dispatchCadCommand(command); assert.ok(r.ok, r.reason); return r; }
async function reject(command: CadCommand, reason: RegExp) {
  const before = JSON.stringify(cadDocument), h = cadHistory.getPastLabels();
  const r = await dispatchCadCommand(command);
  assert.equal(r.ok, false); assert.match(r.reason!, reason);
  assert.equal(JSON.stringify(cadDocument), before); assert.deepEqual(cadHistory.getPastLabels(), h);
}
const hatchRoute = (sourceId: string, extra: Partial<ContourReferenceRoute> = {}): ContourReferenceRoute => ({ dependentId: "H", sourceId, resultIndices: [0], ...extra });
async function rectangle(id = "source") {
  await apply({ type: "create-drawing", id, drawing: "rectangle", params: { workPlane: "XY", points: [[0, 0, 0], [100, 0, 0], [100, 60, 0], [0, 60, 0]] } });
}
async function hatch(id = "H", sources: string[] = ["source"]) {
  await apply({ type: "create-drafting", id, params: { kind: "hatch", sourceObjectIds: sources, spacing: 5, angle: 0, workPlane: "XY" } });
}
function roundtrip(before: ReturnType<typeof documentState>) {
  const after = documentState();
  assert.ok(undoDocument()); assert.deepEqual(documentState(), before);
  assert.ok(redoDocument()); assert.deepEqual(documentState(), after);
  const loaded = deserializeDocument(serializeDocument(cadDocument));
  assert.deepEqual(loaded, cadDocument); assertConstructionEvaluation(loaded);
}

test("closed Trim with rejoin keeps one hatch on the reviewed contour", async () => {
  await rectangle();
  await apply({ type: "create-drawing", id: "boundary", drawing: "line", params: { workPlane: "XY", points: [[40, 70, 0], [110, 0, 0]] } });
  await hatch();
  const before = documentState(), h = cadHistory.getPastLabels().length, linesBefore = hatchLinesOf("H");
  assert.ok(linesBefore.length > 0);
  const planned = await previewCadCommand({ type: "trim-contour", objectId: "source", cutterIds: ["boundary"], pickPoint: [100, 40, 0], rejoin: true, referenceRoutes: [hatchRoute("source")] });
  assert.ok(planned.result.ok, planned.result.reason); assert.deepEqual(documentState(), before);
  const r = await applyCadPlan(planned.planId); assert.ok(r.ok, r.reason); discardCadPlan(planned.planId);
  assert.deepEqual(feature("H").params.sourceObjectIds, r.createdIds);
  assert.ok(pathClosed(r.createdIds[0]));
  const linesAfter = hatchLinesOf("H");
  assert.ok(linesAfter.length > 0);
  assert.notDeepEqual(linesAfter, linesBefore);
  assert.equal(cadHistory.getPastLabels().length, h + 1);
  roundtrip(before);
  function pathClosed(id: string) { return exactDrawingContour(cadDocument.objects[id], feature(id)).closed; }
});

test("Join merges two hatch sources into one reviewed profile", async () => {
  await apply({ type: "create-drawing", id: "bottom", drawing: "polyline", params: { workPlane: "XY", points: [[0, 0, 0], [100, 0, 0], [100, 60, 0]] } });
  await apply({ type: "create-drawing", id: "top", drawing: "polyline", params: { workPlane: "XY", points: [[100, 60, 0], [0, 60, 0], [0, 0, 0]] } });
  await hatch("H", ["bottom", "top"]);
  const before = documentState();
  const r = await apply({ type: "join-drawings", objectIds: ["bottom", "top"], id: "joined", referenceRoutes: [{ dependentId: "H", sourceId: "bottom", resultIndices: [0] }, { dependentId: "H", sourceId: "top", resultIndices: [0] }] });
  assert.deepEqual(r.createdIds, ["joined"]);
  assert.deepEqual(feature("H").params.sourceObjectIds, ["joined"]);
  assert.ok(hatchLinesOf("H").length > 0);
  roundtrip(before);
});

test("Explode keeps the loop when every piece is reviewed", async () => {
  await rectangle(); await hatch();
  const before = documentState();
  const exploded = await apply({ type: "explode-drawings", objectIds: ["source"], referenceRoutes: [{ dependentId: "H", sourceId: "source", resultIndices: [0, 1, 2, 3] }] });
  assert.equal(exploded.createdIds.length, 4);
  assert.deepEqual(feature("H").params.sourceObjectIds, exploded.createdIds);
  assert.ok(hatchLinesOf("H").length > 0);
  roundtrip(before);
});

test("vertex insertion on a hatched sketch keeps driving constraints and hatch regions", async () => {
  await apply({ type: "create-sketch", id: "sketch", workPlane: "XY" });
  await apply({ type: "add-sketch-geometry", sketchId: "sketch", geometry: { id: "source", kind: "rectangle", origin: [0, 0], width: 100, height: 60, cornerIds: ["a", "b", "c", "d"], edgeIds: ["ab", "bc", "cd", "da"] } });
  await hatch();
  const before = documentState(), h = cadHistory.getPastLabels().length;
  const r = await apply({ type: "edit-polyline", objectId: "source", operation: "insert", segmentId: "bc", point: [100, 30, 0], referenceRoutes: [hatchRoute("source")] });
  assert.ok(r.ok); assert.equal(cadHistory.getPastLabels().length, h + 1);
  assert.deepEqual(feature("H").params.sourceObjectIds, ["source"]);
  assert.ok(hatchLinesOf("H").length > 0);
  assert.ok(cadDocument.sketches!.sketch.geometry.some(g => g.id === "source"));
  roundtrip(before);
});

test("missing routes, partial mappings, locked layers and F2/F3 consumers fail atomically", async () => {
  await rectangle(); await hatch();
  await reject({ type: "join-drawings", objectIds: ["source"], bridges: [{ fromId: "source", fromEnd: "end", toId: "source", toEnd: "start" }] }, /references the selected contour/);
  await reject({ type: "explode-drawings", objectIds: ["source"], referenceRoutes: [] }, /Reconnect every/);
  await reject({ type: "explode-drawings", objectIds: ["source"], referenceRoutes: [hatchRoute("source", { segmentIndex: 0 })] }, /whole result objects/);
  await apply({ type: "create-layer", id: "refs", name: "Refs" });
  await apply({ type: "move-object-to-layer", objectId: "H", layerId: "refs" });
  await apply({ type: "set-layer-locked", layerId: "refs", locked: true });
  await reject({ type: "explode-drawings", objectIds: ["source"], referenceRoutes: [hatchRoute("source", { resultIndices: [0, 1, 2, 3] })] }, /Unlock/);
  await apply({ type: "set-layer-locked", layerId: "refs", locked: false });
  resetTestDocument(); await rectangle();
  await apply({ type: "create-drafting", id: "chain", params: { kind: "chain", workPlane: "XY", sourceObjectId: "source", points: [[0, 0, 0], [100, 0, 0]], orientation: "aligned", height: 4, offset: 10 } });
  await reject({ type: "explode-drawings", objectIds: ["source"], referenceRoutes: [{ dependentId: "chain", sourceId: "source", resultIndices: [0, 1, 2, 3] }] }, /exactly one result/);
  cadDocument.parameterBindings = { b: { id: "b", target: { kind: "feature", objectId: "source", parameter: "radius" }, expression: "10mm" } };
  await reject({ type: "explode-drawings", objectIds: ["source"] }, /driven by an expression/);
  await reject({ type: "explode-drawings", objectIds: ["source"], referenceRoutes: [] }, /Reconnect every/);
  delete cadDocument.parameterBindings;
});
