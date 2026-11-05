import test from "node:test";
import assert from "node:assert/strict";
import { wallMovePlan } from "../src/copilot/wallMovePlan";
import { planArchitecturePrompt } from "../src/copilot/architecturePrompts";
import { cadDocument } from "../src/state/cadDocument";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { previewCadCommand, applyCadPlan, discardCadPlan, getCadPlanWallGhosts } from "../src/state/documentPlans";
import { measureDocumentObject } from "../src/state/documentQuery";
import { cadHistory, undoDocument, redoDocument } from "../src/state/history";
import { documentState, resetTestDocument } from "./helpers/documentHarness";
import { serializeDocument, deserializeDocument, type ArchitectureWall } from "@agent-webcad/cad-document";
const run = async (command: Parameters<typeof dispatchCadCommand>[0]) => { const result = await dispatchCadCommand(command); assert.ok(result.ok, result.reason); };
const definition: ArchitectureWall = { mode: "centerline", sourceObjectIds: ["axis"], height: 3000, thickness: 200, baseLevel: 0, openings: [
  { id: "door", kind: "door", side: "left", along: 1500, width: 900, height: 2100, sill: 0 },
  { id: "window", kind: "window", side: "left", along: 4000, width: 1200, height: 1200, sill: 900 },
] };
test.beforeEach(async () => { resetTestDocument(); await run({ type: "create-drawing", id: "axis", drawing: "line", params: { workPlane: "XY", points: [[0, 0, 0], [6000, 0, 0]] } }); await run({ type: "create-wall", id: "wall", definition }); });
test("wall move previews exact placement, preserves openings/source/volume and is one undoable portable change", async () => {
  await run({ type: "create-wall", id: "sibling", definition: { ...definition, baseLevel: 3500, openings: [] } });
  await run({ type: "move-object", objectId: "wall", translation: [500, 100, 0] }); await run({ type: "rotate-object", objectId: "wall", rotation: [0, 0, 90] });
  const before = documentState(), past = cadHistory.getPastLabels().length, original = await measureDocumentObject(cadDocument, "wall");
  const preview = await previewCadCommand(wallMovePlan(cadDocument, "wall", "normal", 300).command);
  assert.ok(preview.result.ok, preview.result.reason); assert.deepEqual(documentState(), before);
  const ghost = getCadPlanWallGhosts(preview.planId).find(g => g.key === "wall-review-wall")!;
  assert.ok(Math.abs(ghost.transform.translation[0] - 200) < 1e-6); assert.ok(Math.abs(ghost.transform.translation[1] - 100) < 1e-6);
  assert.ok((await applyCadPlan(preview.planId)).ok); discardCadPlan(preview.planId);
  assert.equal(cadHistory.getPastLabels().length, past + 1);
  assert.deepEqual(cadDocument.objects.axis, before.objects.axis); assert.deepEqual(cadDocument.objects.sibling, before.objects.sibling);
  assert.deepEqual(cadDocument.features["feature-wall"].params.architecturalWall, definition);
  const moved = await measureDocumentObject(cadDocument, "wall"); assert.ok(Math.abs(moved.volume! - original.volume!) < 1);
  const after = documentState(); assert.deepEqual(documentState(deserializeDocument(serializeDocument(cadDocument))), after);
  assert.ok(undoDocument()); assert.deepEqual(documentState(), before); assert.ok(redoDocument()); assert.deepEqual(documentState(), after);
});
test("rotated reference and reversed distance use wall direction; world axis remains world axis", async () => {
  await run({ type: "rotate-object", objectId: "axis", rotation: [0, 0, 90] });
  const command = wallMovePlan(cadDocument, "wall", "normal", -250).command;
  assert.ok(command.type === "batch"); assert.deepEqual(command.commands[0], { type: "move-object", objectId: "wall", translation: [250, 0, 0] });
  await run(command); const world = wallMovePlan(cadDocument, "wall", "Y", 100).command;
  assert.ok(world.type === "batch"); assert.deepEqual(world.commands[0], { type: "move-object", objectId: "wall", translation: [250, 100, 0] });
});
test("wall move refreshes real drawings in its transaction and a locked drawing rejects the complete move", async () => {
  await run({ type: "create-layer", id: "views", name: "Views" }); await run({ type: "register-model-part", part: { id: "part", objectId: "wall", name: "Wall" } });
  await run({ type: "upsert-model-section", view: { id: "plan", name: "Plan", partIds: ["part"], basis: "XY", height: 1200, origin: [0, 0], scale: 1, layerId: "views" } });
  const before = documentState(); await run(wallMovePlan(cadDocument, "wall", "Y", 300).command);
  assert.equal(cadDocument.modelPresentation!.sections!.plan.status, "resolved");
  const outputs = Object.values(cadDocument.modelPresentation!.sections!.plan.outputs!);
  assert.ok(outputs.length > 0); assert.deepEqual(cadDocument.modelPresentation!.sections!.plan.outputs, before.modelPresentation!.sections!.plan.outputs, "Translation retains drawing identities");
  for (const output of outputs) {
    const previous = Object.values(before.features).find(f => f.output === output.objectId)!.params.points as number[][];
    const next = Object.values(cadDocument.features).find(f => f.output === output.objectId)!.params.points as number[][];
    assert.deepEqual(next, previous.map(p => [p[0], p[1] + 300, p[2]]));
  }
  assert.ok(undoDocument()); assert.deepEqual(documentState(), before);
  await run({ type: "set-layer-locked", layerId: "views", locked: true }); const locked = documentState();
  const preview = await previewCadCommand(wallMovePlan(cadDocument, "wall", "Y", 300).command); assert.equal(preview.result.ok, false); discardCadPlan(preview.planId); assert.deepEqual(documentState(), locked);
});
test("zero/nonfinite/out of range moves, locked hosts and stale review cannot move CAD", async () => {
  const before = documentState(); for (const value of [0, NaN, Infinity, 1000001]) assert.throws(() => wallMovePlan(cadDocument, "wall", "Y", value));
  assert.throws(() => wallMovePlan(cadDocument, "axis", "Y", 1)); assert.deepEqual(documentState(), before);
  const preview = await previewCadCommand(wallMovePlan(cadDocument, "wall", "Y", 300).command);
  await run({ type: "rename-object", objectId: "wall", name: "Changed" }); const changed = documentState(); assert.equal((await applyCadPlan(preview.planId)).ok, false); discardCadPlan(preview.planId); assert.deepEqual(documentState(), changed);
  await run({ type: "set-layer-locked", layerId: "layer-default", locked: true }); assert.throws(() => wallMovePlan(cadDocument, "wall", "Y", 100));
});
test("natural language wall moves share the exact native planner and reject ambiguous selection/modifiers", () => {
  const context = { document: cadDocument, selectionIds: ["wall"], layerId: "layer-default", workPlane: "XY" as const };
  for (const prompt of ["선택한 벽 직각 방향 30cm 이동", "선택한 벽 왼쪽으로 0.3m 이동"]){ const result = planArchitecturePrompt(prompt, context); assert.ok(result?.ok); assert.deepEqual(result.plan.command, wallMovePlan(cadDocument, "wall", "normal", 300).command); }
  const right = planArchitecturePrompt("선택한 벽 오른쪽으로 300mm 이동", context); assert.ok(right?.ok); assert.deepEqual(right.plan.command, wallMovePlan(cadDocument, "wall", "normal", -300).command);
  for (const prompt of ["선택한 벽 이동", "선택한 벽 Y 0 이동", "선택한 벽 Y 300 이동 연결 벽도 늘려줘"]) assert.equal(planArchitecturePrompt(prompt, context)?.ok, false);
  assert.equal(planArchitecturePrompt("선택한 벽 Y 300 이동", { ...context, selectionIds: [] })?.ok, false);
});
