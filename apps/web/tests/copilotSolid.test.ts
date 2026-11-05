import assert from "node:assert/strict";
import { test } from "node:test";
import { serializeDocument, deserializeDocument } from "@agent-webcad/cad-document";
import { planCopilotCommand, withCopilotLayer } from "../src/copilot/copilotPlan";
import { copilotSolidContract, solidParameterPlan } from "../src/copilot/copilotSolid";
import { validateCopilotEdit } from "../src/copilot/copilotEdit";
import { copilotRequest, validateCopilotResponse } from "../src/copilot/copilotConnection";
import { cadDocument } from "../src/state/cadDocument";
import { previewCadCommand, applyCadPlan, getCadPlanSolidGhosts, discardCadPlan } from "../src/state/documentPlans";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { measureDocumentObject } from "../src/state/documentQuery";
import { cadHistory, undoDocument, redoDocument } from "../src/state/history";
import { documentState, resetTestDocument, restoreTestDocument } from "./helpers/documentHarness";
import { CadEngine, inspectShape } from "@agent-webcad/cad-kernel";
import { exportStepBytes } from "../src/export/exportModel";

const prompt = "80x50x4mm 판 모서리 간격 10mm 지름 6mm 구멍 4개";
const plan = (input: string, selection: string[] = []) => {
  const result = planCopilotCommand(input, { document: cadDocument, selection });
  assert.ok(result.ok, result.ok ? "" : result.reason);
  return result.plan;
};
async function createPlate() {
  const proposed = plan(prompt), preview = await previewCadCommand(withCopilotLayer(proposed.command, "layer-default"));
  assert.ok(preview.result.ok, preview.result.reason);
  assert.ok((await applyCadPlan(preview.planId)).ok);
  discardCadPlan(preview.planId);
  return proposed.resultObjectIds![0];
}

test("four-hole plate is a detached parametric proposal with analytic volume, corner relationships and one Undo", async () => {
  resetTestDocument(); const before = documentState(), proposed = plan(prompt);
  assert.deepEqual(documentState(), before);
  const preview = await previewCadCommand(withCopilotLayer(proposed.command, "layer-default"));
  assert.ok(preview.result.ok, preview.result.reason); assert.deepEqual(documentState(), before);
  const id = proposed.resultObjectIds![0], ghost = getCadPlanSolidGhosts(preview.planId);
  assert.equal(ghost.length, 1); assert.equal(ghost[0].featureType, "extrude");
  const expected = 80 * 50 * 4 - 4 * Math.PI * 3 ** 2 * 4;
  assert.ok(Math.abs(preview.changes.find(c => c.objectId === id)!.after!.volume! - expected) < 0.003);
  ghost[0].params.distance = 999;
  assert.equal(getCadPlanSolidGhosts(preview.planId)[0].params.distance, 4);
  assert.ok((await applyCadPlan(preview.planId)).ok); assert.equal(cadHistory.getPastLabels().length, 1);
  const original = documentState(), edit = plan("폭을 100mm로 바꿔줘", [id]);
  validateCopilotEdit(edit.command, cadDocument, [id], "XY");
  const change = await previewCadCommand(edit.command);
  assert.ok(change.result.ok, change.result.reason); assert.deepEqual(documentState(), original);
  assert.ok(Math.abs(change.changes.find(c => c.objectId === id)!.after!.volume! - (100 * 50 * 4 - 144 * Math.PI)) < 0.003);
  assert.ok((await applyCadPlan(change.planId)).ok); assert.equal(cadHistory.getPastLabels().length, 2);
  const sketch = Object.values(cadDocument.sketches!)[0], holes = sketch.geometry.filter(g => g.kind === "circle");
  assert.deepEqual(holes.map(h => h.kind === "circle" ? h.center.map(v => Math.round(v * 1e6) / 1e6) : []), [[10, 10], [90, 10], [10, 40], [90, 40]]);
  assert.ok(holes.every(h => h.kind === "circle" && Math.abs(h.radius - 3) < 1e-6));
  const edited = documentState();
  assert.deepEqual(documentState(deserializeDocument(serializeDocument(cadDocument))), edited);
  assert.ok(undoDocument()); assert.deepEqual(documentState(), original);
  assert.ok(redoDocument()); assert.deepEqual(documentState(), edited);
  const reopened = deserializeDocument(serializeDocument(cadDocument)); restoreTestDocument(reopened);
  assert.ok((await measureDocumentObject(cadDocument, id)).volume! > expected);
  const bytes = await exportStepBytes(), { oc: instance } = await CadEngine.create(), oc = instance as unknown as Record<string, any>;
  const path = "/copilot-plate-roundtrip.step", reader = new oc.STEPControl_Reader_1(), progress = new oc.Message_ProgressRange_1();
  let shape: any;
  try {
    oc.FS.writeFile(path, bytes); reader.ReadFile(path); reader.TransferRoots(progress); shape = reader.OneShape();
    const measured = await inspectShape(shape);
    assert.equal(measured.validity, "valid");
    assert.ok(Math.abs(measured.volume - (20000 - 144 * Math.PI)) < 0.003);
    assert.ok(measured.bounds.max.every((value: number, axis: number) => Math.abs(value - [100, 50, 4][axis]) < 0.001));
  } finally { shape?.delete(); progress.delete(); reader.delete(); oc.FS.unlink(path); }
});

test("recipe parsing preserves explicit units and rejects unsupported conditions and invalid holes", () => {
  resetTestDocument();
  const metric = plan("8x5x0.4cm 판 모서리 간격 1cm 지름 0.6cm 구멍 4개");
  assert.match(metric.summary[0], /80 × 50 × 4/);
  for (const input of [prompt.replace("4개", "5개"), prompt.replace("10mm", "1mm"), prompt + " 필렛 5mm", prompt.replace("80x50x4mm", "80x10x4mm"), prompt.replace("80x50x4mm", "0x50x4mm"), "판 구멍 네 개 만들어줘"]) {
    const result = planCopilotCommand(input); assert.equal(result.ok, false, input);
  }
  assert.equal(planCopilotCommand("폭을 100mm로 바꿔줘").ok, false);
});

test("plate follow-up validates requested fit, selection, foreign sharing and locks before publication", async () => {
  resetTestDocument(); const id = await createPlate(), baseline = documentState(), labels = cadHistory.getPastLabels();
  for (const input of ["폭을 20mm로 바꿔줘", "구멍 지름을 30mm로 바꿔줘", "여백을 2mm로 바꿔줘", "두께를 0mm로 바꿔줘"]) assert.equal(planCopilotCommand(input, { document: cadDocument, selection: [id] }).ok, false, input);
  const edit = plan("두께를 6mm로 바꿔줘", [id]);
  for (const selection of [[], [id, "missing"], ["missing"]]) assert.throws(() => validateCopilotEdit(edit.command, cadDocument, selection, "XY"));
  cadDocument.layers["layer-default"].locked = true;
  assert.throws(() => validateCopilotEdit(edit.command, cadDocument, [id], "XY"), /unlock/i);
  restoreTestDocument({ ...baseline, revision: cadDocument.revision });
  assert.deepEqual(documentState(), baseline); assert.deepEqual(cadHistory.getPastLabels(), labels);
  const review = await previewCadCommand(edit.command);
  assert.ok((await dispatchCadCommand({ type: "create-primitive", id: "foreign", primitive: "box", params: { width: 10, depth: 10, height: 10 } })).ok);
  assert.equal((await applyCadPlan(review.planId)).ok, false);
  const thickness = copilotSolidContract(cadDocument, [id]).parameters.find(p => p.key.endsWith("_thickness"))!;
  assert.ok(thickness.command.type === "set-variable");
  await dispatchCadCommand({ type: "set-parameter-binding", target: { kind: "feature", objectId: "foreign", parameter: "width" }, expression: thickness.command.name });
  assert.equal(copilotSolidContract(cadDocument, [id]).targetId, undefined);
});

test("gateway advertises and revalidates one selected solid parameter; unselected and extra edits fail", async () => {
  resetTestDocument();
  await dispatchCadCommand({ type: "create-primitive", id: "box", primitive: "box", params: { width: 80, depth: 50, height: 30 } });
  const body = copilotRequest("높이를 40mm로 바꿔줘", cadDocument, ["box"], "XY");
  const proposed = { type: "update-primitive", objectId: "box", params: { height: 40, width: 80, depth: 50 } };
  const response = { version: 1, command: proposed, summary: ["untrusted"] };
  const accepted = validateCopilotResponse(response, body.edit, body.solid);
  assert.match(accepted.summary[0], /height 30 → 40/); assert.deepEqual(accepted.resultObjectIds, ["box"]);
  assert.deepEqual(withCopilotLayer(accepted.command, "other-layer"), accepted.command);
  for (const command of [{ ...proposed, objectId: "unselected" }, { ...proposed, layerId: "foreign" }, { ...proposed, params: { ...proposed.params, width: 100 } }, { ...proposed, params: { ...proposed.params, extra: 1 } }, { type: "batch", commands: [proposed] }]) assert.throws(() => validateCopilotResponse({ ...response, command }, body.edit, body.solid));
  assert.throws(() => validateCopilotResponse(response), /captured edit selection/);
  const review = await previewCadCommand(accepted.command); assert.ok(review.result.ok, review.result.reason);
  assert.ok((await applyCadPlan(review.planId)).ok);
  assert.ok(Math.abs((await measureDocumentObject(cadDocument, "box")).volume! - 80 * 50 * 40) < 1e-6);
  const local = plan("높이를 50mm로 바꿔줘", ["box"]); assert.equal(local.command.type, "update-primitive");
});

test("gateway can change a selected plate driver and rejects expressions, changed quantities and unrelated variables", async () => {
  resetTestDocument(); const id = await createPlate(), body = copilotRequest("width", cadDocument, [id], "XY");
  const key = body.solid.parameters.find(p => p.key.endsWith("_width"))!.key;
  const expected = solidParameterPlan(body.solid, key, 100);
  const response = { version: 1, command: expected.command };
  assert.deepEqual(validateCopilotResponse(response, body.edit, body.solid).command, expected.command);
  for (const change of [{ expression: "100" }, { expression: "100mm + 1mm" }, { expression: "20mm" }, { quantity: "scalar" }, { name: "foreign" }, { expression: "100mm", extra: true }]) assert.throws(() => validateCopilotResponse({ ...response, command: { ...expected.command, ...change } }, body.edit, body.solid));
});

test("an existing linked extrusion exposes its distance through local and gateway edits without replacing its source", async () => {
  resetTestDocument(); const creation = plan("100x50 사각형 돌출 20");
  assert.ok((await dispatchCadCommand(creation.command)).ok);
  const id = Object.values(cadDocument.features).find(f => f.type === "extrude")!.output;
  const sourceIds = [...Object.values(cadDocument.features).find(f => f.output === id)!.inputs];
  const local = plan("두께를 3cm로 바꿔줘", [id]);
  assert.deepEqual(local.command, { type: "update-extrude", objectId: id, distance: 30 });
  const body = copilotRequest("distance", cadDocument, [id], "XY");
  const accepted = validateCopilotResponse({ version: 1, command: local.command }, body.edit, body.solid);
  const preview = await previewCadCommand(accepted.command); assert.ok(preview.result.ok, preview.result.reason);
  assert.ok((await applyCadPlan(preview.planId)).ok);
  assert.ok(Math.abs((await measureDocumentObject(cadDocument, id)).volume! - 150000) < 1e-6);
  assert.deepEqual(Object.values(cadDocument.features).find(f => f.output === id)!.inputs, sourceIds);
  assert.throws(() => validateCopilotResponse({ version: 1, command: { ...local.command, distance: NaN } }, body.edit, body.solid));
});
