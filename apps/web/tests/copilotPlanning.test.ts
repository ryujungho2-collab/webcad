import { test } from "node:test";
import assert from "node:assert/strict";
import { compileRecipe, parseRecipe, recipeCatalog, verifyRecipeMeasurement } from "../src/copilot/cadRecipes";
import { answerPlanningQuestions, CopilotClarificationRequired, parsePlanningClarification, planningResponse, planRecipePrompt, prepareRecipe } from "../src/copilot/copilotPlanning";
import { copilotRequest, requestCopilotPlan } from "../src/copilot/copilotConnection";
import { createCadToolSession } from "../src/copilot/cadToolSession";
import { createLocalCopilot, modelProposalIssue } from "../server/localCopilot";
import { withCopilotLayer } from "../src/copilot/copilotPlan";
import { solidParameterPlan, copilotSolidContract } from "../src/copilot/copilotSolid";
import { previewCadCommand, applyCadPlan, discardCadPlan } from "../src/state/documentPlans";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory, undoDocument, redoDocument } from "../src/state/history";
import { documentState, resetTestDocument } from "./helpers/documentHarness";
import { deserializeDocument, serializeDocument } from "@agent-webcad/cad-document";
const lid = { id: "vented-lid", parameters: { width: 100, depth: 70, thickness: 3, margin: 12, holeDiameter: 6, rows: 3, columns: 5 } };
const json = (v: unknown) => new Response(JSON.stringify(v), { headers: { "Content-Type": "application/json" } });
const context = () => ({ document: cadDocument, selectionIds: [], layerId: "layer-default", workPlane: "XY" as const });

test("bounded local grammar extracts mixed units and refuses unsupported shape modifiers", () => {
  assert.equal(planRecipePrompt("핀 지름 .6cm 길이 0.03m")!.recipe!.parameters.length, 30);
  assert.deepEqual(planRecipePrompt("통풍 덮개 가로 100mm 세로 70mm 두께 3mm 중심 여백 12mm 구멍 지름 6mm 행 3 열 5")!.recipe, lid);
  for (const prompt of ["핀 지름 6 길이 30 나사산", "핀 지름 6 지름 8 길이 30", "핀 지름 -6 길이 30", "통풍 덮개 행 2mm", "통풍 덮개 선택한 면에 부착", "통풍 덮개 슬롯 10"]) assert.throws(() => planRecipePrompt(prompt), undefined, prompt);
  assert.equal(planRecipePrompt("브래킷 만들어줘"), undefined);
});
test("missing recipe slots ask across bounded rounds, retain values and never mutate CAD", () => {
  resetTestDocument(); const before = documentState(); let input = "통풍 덮개", rounds = 0;
  for (const answers of [{ width: "10cm", depth: "70", thickness: "3" }, { margin: "12", holeDiameter: "6", rows: "3" }, { columns: "5" }]) {
    try { planRecipePrompt(input); assert.fail("Expected question"); } catch (e) {
      assert.ok(e instanceof CopilotClarificationRequired); assert.ok(e.clarification.questions.length <= 3);
      assert.throws(() => answerPlanningQuestions(input, e.clarification, {}));
      input = answerPlanningQuestions(input, e.clarification, answers); rounds++;
    }
    assert.deepEqual(documentState(), before);
  }
  assert.equal(rounds, 3); assert.match(input, /^템플릿 · 통풍 덮개 가로 100mm/); assert.deepEqual(planRecipePrompt(input)!.recipe, lid);
  try { prepareRecipe({id:"mounting-plate",parameters:{width:100,depth:70,thickness:3,margin:12}}); } catch(e) {
    assert.ok(e instanceof CopilotClarificationRequired);
    assert.equal(planRecipePrompt(answerPlanningQuestions("판",e.clarification,{holeDiameter:"6"}))!.recipe!.id,"mounting-plate");
  }
});
test("recipe schemas reject foreign fields, partial geometry, oversized/touching patterns and nonnumeric dimensions", () => {
  assert.equal(recipeCatalog().length, 3);
  for (const parameters of [{ ...lid.parameters, rows: 1.5 }, { ...lid.parameters, rows: 16, columns: 16 }, { ...lid.parameters, holeDiameter: 24 }, { ...lid.parameters, margin: 40 }, { ...lid.parameters, holeDiameter: 20 }, { ...lid.parameters, width: "100" }, { ...lid.parameters, origin: [1,2,3] }]) assert.throws(() => compileRecipe({ id: lid.id, parameters }));
  for (const id of ["bracket", "__proto__", "constructor"]) assert.throws(() => parseRecipe({ id, parameters: {} }));
  assert.throws(() => compileRecipe({ id: "pin", parameters: { diameter: 6 } }), /missing/);
});
test("questions and geometry are mutually exclusive and no response can mix commands with clarification", () => {
  const clarification = { summary: "기준 면 확인", questions: [{ id: "face", prompt: "어떤 면을 기준으로 할까요?", options: ["윗면", "앞면"] }] };
  assert.deepEqual(parsePlanningClarification(clarification), clarification);
  assert.throws(() => planningResponse({ version: 1, clarification }), CopilotClarificationRequired);
  for (const extra of [{ toolCalls: [] }, { command: {} }, { recipe: lid }]) assert.throws(() => planningResponse({ version: 1, clarification, ...extra }), /exactly one/);
  for (const questions of [[], [...clarification.questions, ...clarification.questions], [{ id: "face", prompt: "?", options: [42] }]]) assert.throws(() => parsePlanningClarification({ ...clarification, questions }));
  assert.match(answerPlanningQuestions("구멍을 만들어줘", clarification, { face: "앞면" }), /어떤 면.*앞면/);
});
test("real kernel lid matches analytical volume, preserves pattern under edits, serializes and undoes atomically", async () => {
  resetTestDocument(); const before = documentState(), plan = compileRecipe(lid), preview = await previewCadCommand(withCopilotLayer(plan.command, "layer-default"));
  assert.ok(preview.result.ok, preview.result.reason); assert.deepEqual(documentState(), before);
  const id = plan.resultObjectIds![0], expected = (100 * 70 - 15 * Math.PI * 3 ** 2) * 3;
  assert.ok(Math.abs(preview.changes.find(c => c.objectId === id)!.after!.volume! - expected) < .01);
  assert.match(verifyRecipeMeasurement(plan.recipe!, preview.changes.find(c => c.objectId === id)!.after), /통과/);
  assert.throws(() => verifyRecipeMeasurement(plan.recipe!, { validity: "valid", volume: 21000 }), /verification failed/);
  assert.throws(() => verifyRecipeMeasurement(plan.recipe!, { validity: "invalid", volume: expected }), /verification failed/);
  assert.ok((await applyCadPlan(preview.planId)).ok); discardCadPlan(preview.planId); assert.equal(cadHistory.getPastLabels().length, 1);
  const applied = documentState(), contract = copilotSolidContract(cadDocument, [id]), width = contract.parameters.find(p => p.key.endsWith("_width"))!;
  assert.ok(width); const edit = solidParameterPlan(contract, width.key, 120);
  const changed = await previewCadCommand(edit.command); assert.ok(changed.result.ok, changed.result.reason); assert.ok((await applyCadPlan(changed.planId)).ok); discardCadPlan(changed.planId);
  const holes = Object.values(cadDocument.sketches!)[0].geometry.filter(g => g.kind === "circle");
  assert.equal(holes.length, 15); assert.deepEqual(holes.slice(0, 5).map(h => h.kind === "circle" ? h.center.map(x => Math.round(x * 1e6) / 1e6) : []), [[12, 12], [36, 12], [60, 12], [84, 12], [108, 12]]);
  assert.deepEqual(documentState(deserializeDocument(serializeDocument(cadDocument))), documentState());
  assert.ok(undoDocument()); assert.deepEqual(documentState(), applied); assert.ok(undoDocument()); assert.deepEqual(documentState(), before); assert.ok(redoDocument()); assert.deepEqual(documentState(), applied);
});
test("pin and single-row lid preview generate valid volume without publication", async () => {
  for (const [recipe, expected] of [[{ id: "pin", parameters: { diameter: 6, length: 30 } }, Math.PI * 9 * 30], [{ ...lid, parameters: { ...lid.parameters, rows: 1, columns: 1 } }, (7000 - Math.PI * 9) * 3]] as const) {
    resetTestDocument(); const before = documentState(), plan = compileRecipe(recipe), preview = await previewCadCommand(plan.command);
    assert.ok(preview.result.ok, preview.result.reason); assert.ok(Math.abs(preview.changes.find(c => c.objectId === plan.resultObjectIds![0])!.after!.volume! - expected) < .01);
    assert.deepEqual(documentState(), before); discardCadPlan(preview.planId);
  }
});
test("gateway read round can terminate in clarification; resumed recipe compiles locally", async () => {
  resetTestDocument(); const before = documentState(), sent: any[] = [], body = copilotRequest("구멍이 있는 덮개", cadDocument, [], "XY");
  const options = { signal: new AbortController().signal, baseUrl: "http://localhost", toolSession: createCadToolSession(context()), fetcher: (async (_url, init) => {
    sent.push(JSON.parse(String(init?.body))); return json(sent.length === 1 ? { version: 1, toolCalls: [{ id: "inspect", name: "cad.objects", arguments: {} }] } : { version: 1, clarification: { summary: "위치가 필요합니다", questions: [{ id: "placement", prompt: "월드 XY 원점에 새 부품으로 만들까요?", options: ["예"] }] } });
  }) as typeof fetch };
  await assert.rejects(requestCopilotPlan("/api/copilot/plan", body, options), CopilotClarificationRequired);
  assert.ok(sent[1].toolResults.length); assert.equal(sent[0].recipes.length, 3); assert.deepEqual(documentState(), before);
  const plan = await requestCopilotPlan("/api/copilot/plan", body, { ...options, fetcher: async () => json({ version: 1, recipe: lid }) });
  assert.equal(plan.recipe!.id, "vented-lid"); assert.deepEqual(documentState(), before);
});
test("local model gateway advertises owned recipe/clarification schemas and preserves response union", async () => {
  resetTestDocument(); let chat: any;
  const reply = { version: 1, recipe: { id: "pin", parameters: { diameter: 6 } } };
  const gateway = createLocalCopilot({ model: "test", fetcher: async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (path === "/api/tags") return json({ models: [{ name: "test" }] });
    if (path === "/api/show") return json({ capabilities: ["completion"] });
    chat = JSON.parse(String(init?.body)); return json({ done: true, done_reason: "stop", message: { content: JSON.stringify(reply) } });
  } });
  const result = await gateway.plan({ ...copilotRequest("핀", cadDocument, [], "XY"), recipes: [{ id: "evil" }] }, new AbortController().signal);
  const {run,...proposal}=result; assert.deepEqual(proposal, reply); assert.equal(run.provider,"Ollama"); assert.equal(run.context.truncate,false); assert.equal(run.context.numCtx,16384); assert.equal(chat.format.anyOf.length, 3); assert.ok(!chat.messages[1].content.includes('"evil"')); assert.match(chat.messages[0].content, /Keywords alone are insufficient/);
  assert.equal(modelProposalIssue(reply), undefined); assert.throws(() => prepareRecipe(result.recipe), CopilotClarificationRequired);
  assert.ok(modelProposalIssue({ ...reply, toolCalls: [] }));
});
