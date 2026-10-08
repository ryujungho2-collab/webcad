import assert from "node:assert/strict";
import { test } from "node:test";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory, undoDocument, redoDocument } from "../src/state/history";
import { enqueueDocumentCommand } from "../src/state/documentCommandQueue";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { previewCadCommand, applyCadPlan, discardCadPlan } from "../src/state/documentPlans";
import { resetTestDocument, documentState } from "./helpers/documentHarness";

const circle = (id: string, layerId = "layer-default") => ({ type: "create-drawing" as const, id, layerId, drawing: "circle" as const, params: { workPlane: "XY", center: [0, 0, 0], radius: 12 } });
const history = () => ({ past: cadHistory.getPastLabels(), future: cadHistory.getFutureLabels() });
function holdQueue() {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const pending = enqueueDocumentCommand(() => gate);
  return { release, pending };
}

test("concurrent Apply calls publish the identical reviewed IDs once and preserve Undo/Redo", async () => {
  resetTestDocument();
  const before = documentState(), plan = await previewCadCommand(circle("once"));
  const [first, second] = await Promise.all([applyCadPlan(plan.planId), applyCadPlan(plan.planId)]);
  assert.equal(first.ok, true); assert.equal(second.alreadyApplied, true); assert.equal(second.changed, false);
  assert.deepEqual(first.createdIds, ["once"]); assert.deepEqual(second.createdIds, first.createdIds);
  assert.equal(cadHistory.getPastLabels().length, 1);
  const after = documentState();
  assert.ok(undoDocument()); assert.deepEqual(documentState(), before);
  assert.ok(redoDocument()); assert.deepEqual(documentState(), after);
  discardCadPlan(plan.planId);
});

test("Cancel while Apply waits for the mutation queue cannot publish geometry or history", async () => {
  resetTestDocument();
  const plan = await previewCadCommand(circle("cancelled")), before = JSON.stringify(cadDocument), labels = history();
  const queue = holdQueue(), controller = new AbortController();
  const applied = applyCadPlan(plan.planId, { signal: controller.signal });
  const rejected = assert.rejects(applied, /abort/i);
  controller.abort(); queue.release(); await queue.pending; await rejected;
  assert.equal(JSON.stringify(cadDocument), before); assert.deepEqual(history(), labels);
  discardCadPlan(plan.planId);
});

test("Apply rechecks the owner's review at publication, after waiting behind another operation", async () => {
  resetTestDocument();
  const plan = await previewCadCommand(circle("old-context")), before = JSON.stringify(cadDocument), labels = history();
  let reason: string | undefined, checks = 0;
  const queue = holdQueue();
  const applied = applyCadPlan(plan.planId, { validate: () => { checks++; return reason; } });
  reason = "The selection changed. Plan again.";
  queue.release(); await queue.pending;
  const result = await applied;
  assert.equal(checks, 1); assert.equal(result.ok, false); assert.match(result.reason!, /selection changed/);
  assert.equal(JSON.stringify(cadDocument), before); assert.deepEqual(history(), labels);
  discardCadPlan(plan.planId);
});

test("locked edit targets and partially failed creation batches leave the entire document and both history branches intact", async () => {
  resetTestDocument();
  await dispatchCadCommand(circle("existing"));
  await dispatchCadCommand({ type: "create-layer", id: "open" });
  await dispatchCadCommand({ type: "set-layer-locked", layerId: "layer-default", locked: true });
  await dispatchCadCommand({ type: "create-layer", id: "unused" }); assert.ok(undoDocument());
  const before = JSON.stringify(cadDocument), labels = history();
  for (const command of [
    { type: "rename-object", objectId: "existing", name: "Forbidden" },
    { type: "batch", commands: [circle("partial", "open"), circle("locked")] },
  ]) {
    const plan = await previewCadCommand(command);
    assert.equal(plan.result.ok, false); assert.equal((await applyCadPlan(plan.planId)).changed, false);
    assert.equal(JSON.stringify(cadDocument), before); assert.deepEqual(history(), labels);
    discardCadPlan(plan.planId);
  }
  await dispatchCadCommand({ type: "set-layer-locked", layerId: "layer-default", locked: false });
  const unlocked = JSON.stringify(cadDocument), unlockedHistory = history();
  const partial = await previewCadCommand({ type: "batch", commands: [circle("partial"), circle("existing")] });
  assert.equal(partial.result.ok, false); assert.equal((await applyCadPlan(partial.planId)).changed, false);
  assert.equal(JSON.stringify(cadDocument), unlocked); assert.deepEqual(history(), unlockedHistory);
  discardCadPlan(partial.planId);
});
