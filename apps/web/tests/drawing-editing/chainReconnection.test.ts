import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { deserializeDocument, serializeDocument } from "@agent-webcad/cad-document";
import type { CadCommand, ContourReferenceRoute } from "@agent-webcad/cad-commands";
import { cadDocument } from "../../src/state/cadDocument";
import { dispatchCadCommand } from "../../src/state/dispatchCadCommand";
import { previewCadCommand, applyCadPlan, discardCadPlan } from "../../src/state/documentPlans";
import { cadHistory, undoDocument, redoDocument } from "../../src/state/history";
import { assertConstructionEvaluation } from "../../src/precision/constructionGeometry";
import { getWorldDrawingGeometry } from "../../src/precision/worldGeometry";
import { resetTestDocument, documentState } from "../helpers/documentHarness";
beforeEach(resetTestDocument);
const feature = (id: string) => Object.values(cadDocument.features).find(f => f.output === id)!;
const worldPoints = (id: string) => getWorldDrawingGeometry(cadDocument.objects[id], feature(id))!.points!;
async function apply(command: CadCommand) { const r = await dispatchCadCommand(command); assert.ok(r.ok, r.reason); return r; }
async function reject(command: CadCommand, reason: RegExp) {
  const before = JSON.stringify(cadDocument), h = cadHistory.getPastLabels();
  const r = await dispatchCadCommand(command);
  assert.equal(r.ok, false); assert.match(r.reason!, reason);
  assert.equal(JSON.stringify(cadDocument), before); assert.deepEqual(cadHistory.getPastLabels(), h);
}
const chainRoute = (sourceId: string, extra: Partial<ContourReferenceRoute> = {}): ContourReferenceRoute => ({ dependentId: "C", sourceId, resultIndices: [0], ...extra });
async function chain(id = "C", sourceId = "source") {
  await apply({ type: "create-drafting", id, params: { kind: "chain", workPlane: "XY", sourceObjectId: sourceId, points: [[0, 0, 0], [100, 0, 0]], orientation: "aligned", height: 4, offset: 10 } });
}
function roundtrip(before: ReturnType<typeof documentState>) {
  const after = documentState();
  assert.ok(undoDocument()); assert.deepEqual(documentState(), before);
  assert.ok(redoDocument()); assert.deepEqual(documentState(), after);
  const loaded = deserializeDocument(serializeDocument(cadDocument));
  assert.deepEqual(loaded, cadDocument); assertConstructionEvaluation(loaded);
}

test("Join moves one continuous dimension onto the reviewed contour", async () => {
  await apply({ type: "create-drawing", id: "bottom", drawing: "polyline", params: { workPlane: "XY", points: [[0, 0, 0], [100, 0, 0], [100, 60, 0]] } });
  await apply({ type: "create-drawing", id: "top", drawing: "polyline", params: { workPlane: "XY", points: [[100, 60, 0], [0, 60, 0], [0, 0, 0]] } });
  await chain("C", "bottom");
  const before = documentState(), h = cadHistory.getPastLabels().length;
  const r = await apply({ type: "join-drawings", objectIds: ["bottom", "top"], id: "joined", referenceRoutes: [{ dependentId: "C", sourceId: "bottom", resultIndices: [0] }] });
  assert.deepEqual(r.createdIds, ["joined"]);
  assert.equal(feature("C").params.sourceObjectId, "joined");
  assert.deepEqual(feature("C").params.points, worldPoints("joined"));
  assert.equal(cadHistory.getPastLabels().length, h + 1);
  roundtrip(before);
});

test("Explode, Trim and vertex edits refresh continuous dimensions on one reviewed piece", async () => {
  await apply({ type: "create-drawing", id: "source", drawing: "rectangle", params: { workPlane: "XY", points: [[0, 0, 0], [100, 0, 0], [100, 60, 0], [0, 60, 0]] } });
  await chain();
  const exploded = await apply({ type: "explode-drawings", objectIds: ["source"], referenceRoutes: [chainRoute("source", { resultIndices: [2] })] });
  const piece = exploded.createdIds[2];
  assert.equal(feature("C").params.sourceObjectId, piece);
  assert.deepEqual(feature("C").params.points, worldPoints(piece));
  undoDocument();
  await apply({ type: "create-drawing", id: "boundary", drawing: "line", params: { workPlane: "XY", points: [[40, 70, 0], [110, 0, 0]] } });
  const trimmed = await apply({ type: "trim-contour", objectId: "source", cutterIds: ["boundary"], pickPoint: [100, 40, 0], rejoin: true, referenceRoutes: [chainRoute("source")] });
  assert.equal(feature("C").params.sourceObjectId, trimmed.createdIds[0]);
  assert.deepEqual(feature("C").params.points, worldPoints(trimmed.createdIds[0]));
  undoDocument();
  await apply({ type: "create-sketch", id: "sketch", workPlane: "XY" });
  await apply({ type: "add-sketch-geometry", sketchId: "sketch", geometry: { id: "owned", kind: "rectangle", origin: [200, 0], width: 100, height: 60, cornerIds: ["a", "b", "c", "d"], edgeIds: ["ab", "bc", "cd", "da"] } });
  await chain("C2", "owned");
  await apply({ type: "edit-polyline", objectId: "owned", operation: "insert", segmentId: "ab", point: [240, 0, 0], referenceRoutes: [{ dependentId: "C2", sourceId: "owned", resultIndices: [0] }] });
  assert.equal(feature("C2").params.sourceObjectId, "owned");
  assert.deepEqual(feature("C2").params.points, worldPoints("owned"));
});

test("partial mappings, locked layers and F3 bindings fail atomically", async () => {
  await apply({ type: "create-drawing", id: "source", drawing: "rectangle", params: { workPlane: "XY", points: [[0, 0, 0], [100, 0, 0], [100, 60, 0], [0, 60, 0]] } });
  await chain();
  await reject({ type: "explode-drawings", objectIds: ["source"], referenceRoutes: [chainRoute("source", { segmentIndex: 0 })] }, /exactly one result/);
  await reject({ type: "explode-drawings", objectIds: ["source"], referenceRoutes: [chainRoute("source", { resultIndices: [0, 1] })] }, /exactly one result/);
  await apply({ type: "create-layer", id: "refs", name: "Refs" });
  await apply({ type: "move-object-to-layer", objectId: "C", layerId: "refs" });
  await apply({ type: "set-layer-locked", layerId: "refs", locked: true });
  await reject({ type: "explode-drawings", objectIds: ["source"], referenceRoutes: [chainRoute("source", { resultIndices: [0] })] }, /Unlock/);
  await apply({ type: "set-layer-locked", layerId: "refs", locked: false });
  cadDocument.parameterBindings = { b: { id: "b", target: { kind: "feature", objectId: "source", parameter: "radius" }, expression: "10mm" } };
  await reject({ type: "explode-drawings", objectIds: ["source"] }, /driven by an expression/);
  await reject({ type: "explode-drawings", objectIds: ["source"], referenceRoutes: [] }, /Reconnect every/);
  delete cadDocument.parameterBindings;
});
