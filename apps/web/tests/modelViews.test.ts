import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import * as THREE from "three";
import { serializeDocument, deserializeDocument, validModelViewCamera, type CadModelView } from "@agent-webcad/cad-document";
import { validateCommand, type CadCommand } from "@agent-webcad/cad-commands";
import { captureModelViewCamera, cameraFromModelView } from "../src/viewport/modelViewCamera";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory, undoDocument, redoDocument } from "../src/state/history";
import { previewCadCommand, applyCadPlan, discardCadPlan } from "../src/state/documentPlans";
import { openDocumentFile, newDocument } from "../src/state/documentFile";
import { documentState, resetTestDocument } from "./helpers/documentHarness";
import { writeRecoveryCheckpoint, readRecoveryCheckpoint, DOCUMENT_CACHE_KEY } from "../src/state/documentRecovery";
beforeEach(resetTestDocument);
const view = (id = "front", name = "Front"): CadModelView => ({ id, name, camera: { projection: "orthographic", eye: [0, -100, 0], target: [0, 0, 0], up: [0, 0, 1], near: 0.1, far: 10000, zoom: 2, left: -40, right: 40, top: 20, bottom: -20 } });
async function apply(command: CadCommand) { const result = await dispatchCadCommand(command); assert.ok(result.ok, result.reason); return result; }
async function reject(command: CadCommand) {
  const before = JSON.stringify(cadDocument), past = cadHistory.getPastLabels(), future = cadHistory.getFutureLabels();
  try { const r = await dispatchCadCommand(command); assert.equal(r.ok, false); }
  catch (error) { assert.match(String(error), /Invalid CAD command payload/); }
  assert.equal(JSON.stringify(cadDocument), before); assert.deepEqual(cadHistory.getPastLabels(), past); assert.deepEqual(cadHistory.getFutureLabels(), future);
}
test("saved model views preview without mutation, preserve geometry and have one reversible history entry", async () => {
  await apply({ type: "create-drawing", id: "line", drawing: "line", params: { workPlane: "XZ", points: [[0, 3, 0], [20, 3, 10]] } });
  const before = documentState(), h = cadHistory.getPastLabels().length;
  const proposal = await previewCadCommand({ type: "upsert-model-view", view: view() });
  assert.ok(proposal.result.ok); assert.deepEqual(documentState(), before);
  assert.deepEqual(proposal.changes, []); assert.equal(proposal.impact?.find(i => i.kind === "Model views")?.created, 1);
  assert.ok((await applyCadPlan(proposal.planId)).ok); discardCadPlan(proposal.planId);
  assert.equal(cadHistory.getPastLabels().length, h + 1);
  assert.deepEqual(cadDocument.objects, before.objects); assert.deepEqual(cadDocument.features, before.features); assert.deepEqual(cadDocument.sketches, before.sketches);
  const after = documentState(); assert.ok(undoDocument()); assert.deepEqual(documentState(), before);
  assert.ok(redoDocument()); assert.deepEqual(documentState(), after);
  assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)), cadDocument);
});
test("update, rename and final deletion preserve view identity and restore optional fields in Undo/Redo", async () => {
  await apply({ type: "upsert-model-view", view: view() });
  await apply({ type: "upsert-model-view", view: { ...view(), name: "Elevation", camera: { ...view().camera, zoom: 3 } } });
  assert.equal(cadDocument.modelViews!.front.name, "Elevation");
  const saved = documentState(); await apply({ type: "delete-model-view", viewId: "front" }); assert.equal(cadDocument.modelViews, undefined);
  assert.ok(undoDocument()); assert.deepEqual(documentState(), saved);
  assert.ok(redoDocument()); assert.equal(cadDocument.modelViews, undefined);
});
test("invalid camera values, duplicate names, unchanged/missing commands and failed batches are atomic", async () => {
  await apply({ type: "upsert-model-view", view: view() });
  for (const extra of [{ eye: [0, 0, 0] }, { up: [0, -1, 0] }, { zoom: 0 }, { far: 0.01 }, { near: -1 }, { right: -40 }, { top: Infinity }, { workPlane: "XY" }]) {
    const command = { type: "upsert-model-view", view: { ...view(), camera: { ...view().camera, ...extra } } } as CadCommand;
    assert.equal(validateCommand(command), false); await reject(command);
  }
  await reject({ type: "upsert-model-view", view: view("other", "front") });
  await reject({ type: "upsert-model-view", view: view() }); await reject({ type: "delete-model-view", viewId: "missing" });
  await reject({ type: "batch", commands: [{ type: "upsert-model-view", view: view("other", "Other") }, { type: "delete-model-view", viewId: "missing" }] });
  await reject({ type: "upsert-model-view", view: view("__proto__", "Bad") });
});
test("v15 views reload, older files remain unchanged and cannot smuggle a model-view field", async () => {
  const old = serializeDocument(cadDocument); assert.equal(JSON.parse(old).version, 1);
  for (let version = 1; version <= 14; version++) {
    const file = { ...JSON.parse(old), version }; const loaded = deserializeDocument(JSON.stringify(file)); assert.equal(loaded.modelViews, undefined);
    assert.throws(() => deserializeDocument(JSON.stringify({ ...file, document: { ...file.document, modelViews: { front: view() } } })), /version 15/);
  }
  await apply({ type: "upsert-model-view", view: view() }); const file = JSON.parse(serializeDocument(cadDocument)); assert.equal(file.version, 15);
  const saved = documentState(); newDocument(); assert.equal(cadDocument.modelViews, undefined);
  await openDocumentFile(new File([JSON.stringify(file)], "model.webcad")); assert.deepEqual(documentState(), saved);
  await openDocumentFile(new File([old], "old.webcad")); assert.equal(cadDocument.modelViews, undefined);
  for (const views of [[], { mismatched: view() }, { front: { ...view(), camera: { ...view().camera, zoom: -1 } } }, { front: view(), other: view("other", "front") }])
    assert.throws(() => deserializeDocument(JSON.stringify({ ...file, document: { ...file.document, modelViews: views } })), /model view/);
});
test("stale model-view reviews cannot commit and caller-owned data never aliases the saved view", async () => {
  const input = view(); await apply({ type: "upsert-model-view", view: input }); input.camera.eye[0] = 900;
  assert.equal(cadDocument.modelViews!.front.camera.eye[0], 0);
  const p = await previewCadCommand({ type: "delete-model-view", viewId: "front" });
  await apply({ type: "upsert-model-view", view: view("top", "Top") }); const before = documentState();
  assert.equal((await applyCadPlan(p.planId)).ok, false); assert.deepEqual(documentState(), before); discardCadPlan(p.planId);
});
test("recovery checkpoints preserve views and invalid portable files cannot replace the live document", async () => {
  await apply({ type: "upsert-model-view", view: view() });
  const entries = new Map<string, string>(), storage = { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); } };
  writeRecoveryCheckpoint(storage, cadDocument); const original = documentState();
  assert.deepEqual(readRecoveryCheckpoint(storage)!.document, cadDocument);
  await apply({ type: "upsert-model-view", view: view("top", "Top") }); writeRecoveryCheckpoint(storage, cadDocument);
  entries.set(DOCUMENT_CACHE_KEY, "{broken");
  const recovered = readRecoveryCheckpoint(storage)!; assert.equal(recovered.recovered, true); assert.deepEqual(documentState(recovered.document), original);
  const before = JSON.stringify(cadDocument), past = cadHistory.getPastLabels();
  const invalid = JSON.parse(serializeDocument(cadDocument)); invalid.document.modelViews.front.camera.up = [0, 0, 0];
  await assert.rejects(openDocumentFile(new File([JSON.stringify(invalid)], "invalid.webcad")), /model view/);
  assert.equal(JSON.stringify(cadDocument), before); assert.deepEqual(cadHistory.getPastLabels(), past);
});
test("view-only batches on locked live-solid models leave every modeling field unchanged", async () => {
  await apply({ type: "create-sketch", id: "sketch", workPlane: "XY" });
  await apply({ type: "add-sketch-geometry", sketchId: "sketch", geometry: { id: "profile", kind: "rectangle", origin: [0, 0], width: 100, height: 60, cornerIds: ["a", "b", "c", "d"], edgeIds: ["ab", "bc", "cd", "da"] } });
  await apply({ type: "add-sketch-constraint", sketchId: "sketch", constraint: { id: "width", kind: "distance", first: { geometryId: "profile", pointId: "a" }, second: { geometryId: "profile", pointId: "b" }, value: 100 } });
  await apply({ type: "create-extrude", id: "plate", profileObjectIds: ["profile"], distance: 10 });
  await apply({ type: "set-layer-locked", layerId: "layer-default", locked: true });
  const before = documentState(), h = cadHistory.getPastLabels().length;
  await apply({ type: "batch", commands: [{ type: "upsert-model-view", view: view() }, { type: "upsert-model-view", view: view("top", "Top") }] });
  const { modelViews: _, ...after } = documentState(); assert.deepEqual(after, before);
  assert.equal(cadHistory.getPastLabels().length, h + 1); assert.equal(Object.keys(cadDocument.modelViews!).length, 2);
  assert.ok(undoDocument()); assert.deepEqual(documentState(), before);
  assert.ok(redoDocument()); assert.equal(cadDocument.modelViews!.front.camera.projection, "orthographic");
});
test("orthographic and perspective snapshots reproduce world projections including zoom, roll and clipping", () => {
  for (const camera of [new THREE.PerspectiveCamera(37, 1.7, 0.2, 5000), new THREE.OrthographicCamera(-35, 45, 25, -15, 0.2, 5000)]) {
    const target = new THREE.Vector3(1000000, 2000000, 3000000); camera.position.copy(target).add(new THREE.Vector3(80, -120, 60));
    camera.up.set(0.3, 0.4, 0.8).normalize(); camera.zoom = 2.3; camera.lookAt(target); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    const state = captureModelViewCamera(camera, target), restored = cameraFromModelView(state);
    assert.ok(validModelViewCamera(state)); assert.equal(restored.near, 0.2); assert.equal(restored.far, 5000); assert.equal(restored.zoom, 2.3);
    for (const offset of [[0, 0, 0], [10, 20, 5], [-12, 5, -10]]) {
      const point = target.clone().add(new THREE.Vector3(...offset)); const a = point.clone().project(camera), b = point.clone().project(restored);
      assert.ok(a.distanceTo(b) < 1e-7, `${a.toArray()} vs ${b.toArray()}`);
    }
    assert.deepEqual(captureModelViewCamera(restored, target).eye, state.eye);
  }
});
test("aspect adaptation preserves vertical framing, and unsupported offsets or mismatched targets fail", () => {
  const ortho = cameraFromModelView(view().camera, 3) as THREE.OrthographicCamera;
  assert.equal(ortho.top - ortho.bottom, 40); assert.equal(ortho.right - ortho.left, 120); assert.equal(ortho.zoom, 2);
  const perspective = new THREE.PerspectiveCamera(45, 1.5, 0.1, 1000); perspective.position.set(0, -100, 0); perspective.up.set(0, 0, 1); perspective.lookAt(0, 0, 0);
  const snapshot = captureModelViewCamera(perspective, new THREE.Vector3()); const wide = cameraFromModelView(snapshot, 3) as THREE.PerspectiveCamera;
  assert.equal(wide.aspect, 3); assert.equal(wide.fov, 45); assert.deepEqual(wide.position.toArray(), [0, -100, 0]);
  assert.throws(() => captureModelViewCamera(perspective, new THREE.Vector3(100, 0, 0)), /orbit target/);
  perspective.filmOffset = 1; assert.throws(() => captureModelViewCamera(perspective, new THREE.Vector3()), /Offset/);
  assert.throws(() => cameraFromModelView(view().camera, 0), /aspect/);
});
