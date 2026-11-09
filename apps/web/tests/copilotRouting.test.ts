import test from "node:test";
import assert from "node:assert/strict";
import { buildLoftFixture, assessLoft, loftPrompt } from "../evaluation/loftIntentEvaluation";
import { copilotRequest, requestCopilotPlan } from "../src/copilot/copilotConnection";
import { taskToolScope } from "../src/copilot/copilotTaskScope";
import { createCadToolSession } from "../src/copilot/cadToolSession";
import { prepareCadCommand } from "../src/state/dispatchCadCommand";
import { createLocalCopilot } from "../server/localCopilot";
const setup = buildLoftFixture();
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
const ctx = (document: Awaited<typeof setup>["document"], selectionIds = ["intent-loft"]) => ({ document, selectionIds, layerId: "layer-default", workPlane: "XY" as const });
const read = (id = "inspect", objectId = "intent-loft") => ({ version: 1, toolCalls: [{ id, name: "cad.inspect", arguments: { objectIds: [objectId] } }] });
const edit = (ruled: boolean, id = "edit") => ({ version: 1, toolCalls: [{ id, name: "solid.loft.update", arguments: { objectId: "intent-loft", ruled } }] });

test("scope comes from actual selected live loft state, not its label; restricted selections get no writer", async () => {
  const f = await setup, body = copilotRequest(loftPrompt(f), f.document, [f.loftId], "XY");
  assert.deepEqual(body.tools.tools.map(t => t.name), ["cad.inspect", "cad.measure", "solid.loft.update"]);
  assert.equal(body.recipes.length, 0);
  for (const mode of ["locked", "hidden", "snapshot", "pattern", "construction", "owned", "multiple", "missing-extra"] as const) {
    const d = structuredClone(f.document), object = d.objects[f.loftId], feature = Object.values(d.features).find(x => x.output === f.loftId)!;
    if (mode === "locked") d.layers[object.layerId].locked = true;
    if (mode === "hidden") object.visible = false;
    if (mode === "snapshot") feature.dependencyMode = "snapshot";
    if (mode === "pattern") feature.pattern = { id: "pattern", sourceObjectIds: ["section0"], sourceId: "section0", index: 1, spec: { kind: "linear", columns: 2, rows: 1, spacing: [10, 0], workPlane: "XY" }, layerId: object.layerId };
    if (mode === "construction") feature.construction = { operation: "midpoint", segmentId: "section0" };
    if (mode === "owned") d.rootObjects = d.rootObjects.filter(id => id !== f.loftId);
    const selection = [f.loftId, ...(mode === "multiple" ? [f.referenceId] : mode === "missing-extra" ? ["missing"] : [])];
    const request = copilotRequest(loftPrompt(f), d, selection, "XY");
    assert.ok(!request.tools.tools.some(t => t.name === "solid.loft.update"), mode);
  }
  const named = structuredClone(f.document); named.objects[f.referenceId].name = "Loft smooth interpolation";
  const misleading = copilotRequest("Make the selected loft smooth", named, [f.referenceId], "XY");
  assert.ok(!misleading.tools.tools.some(t => t.name === "solid.loft.update"));
  assert.equal(taskToolScope("폭을60mm로 변경", { targetId: "box" }).kind, "parameter");
  assert.equal(taskToolScope("간섭을 줄여줘", { targetId: "support" }).kind, "interference");
});

test("gateway rebuilds its own matching catalog, excludes recipes/scalar guidance, and narrows after real native inspection", async () => {
  const f = await setup, body = copilotRequest(loftPrompt(f), f.document, [f.loftId], "XY"), chats: any[] = [];
  const gateway = createLocalCopilot({ model: "unit-model", fetcher: async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (path === "/api/tags") return json({ models: [{ name: "unit-model" }] });
    if (path === "/api/show") return json({ capabilities: ["completion"] });
    const chat = JSON.parse(String(init?.body)); chats.push(chat);
    return json({ done: true, done_reason: "stop", message: { content: JSON.stringify(chats.length === 1 ? read() : edit(false)) }, prompt_eval_count: 100, eval_count: 20 });
  } });
  const first = await gateway.plan({ ...body, tools: { tools: [{ name: "untrusted-tool" }] }, recipes: [{ id: "untrusted-recipe" }] }, new AbortController().signal);
  assert.ok(first.toolCalls);
  const payload = JSON.parse(chats[0].messages[1].content);
  assert.deepEqual(payload.tools.tools.map((t: any) => t.name), body.tools.tools.map(t => t.name));
  assert.equal(payload.recipes, undefined); assert.equal(payload.solid, undefined); assert.equal(payload.capabilities, undefined);
  assert.ok(!chats[0].messages[0].content.includes("assembly.inspect")); assert.ok(!chats[0].messages[0].content.includes("solid.parameter"));
  assert.equal(chats[0].truncate, false); assert.equal(chats[0].options.num_ctx, 16384);
  const inspected = await createCadToolSession(ctx(f.document)).read(read().toolCalls[0]);
  assert.equal((inspected.result as any[])[0].loft.ruled, true);
  await gateway.plan({ ...body, toolResults: [inspected] }, new AbortController().signal);
  assert.deepEqual(JSON.parse(chats[1].messages[1].content).tools.tools.map((t: any) => t.name), ["solid.loft.update"]);
  assert.ok(JSON.parse(chats[1].messages[1].content).evidenceGuide.nextAction.includes("solid.loft.update"));
});

test("write-before-read is rejected; compact feedback preserves the root requirements and a later native preview passes", async () => {
  const f = await setup, body = copilotRequest(loftPrompt(f), f.document, [f.loftId], "XY"), sent: any[] = [], session = createCadToolSession(ctx(f.document));
  const responses = [edit(false, "premature"), read(), edit(false, "after-read")]; let attempts = 0;
  const plan = await requestCopilotPlan("/api/copilot/plan", body, { signal: new AbortController().signal, baseUrl: "http://localhost", toolSession: session,
    fetcher: async (_url, init) => { sent.push(JSON.parse(String(init?.body))); return json(responses[sent.length - 1]); },
    validatePlan: async p => { attempts++; const prepared = await prepareCadCommand(f.document, p.command); assert.ok(prepared.result.ok); assert.ok((await assessLoft(f, prepared.proposed)).success); } });
  assert.equal(plan.command.type, "update-loft"); assert.equal(attempts, 1); assert.equal(sent.length, 3);
  assert.equal(sent[1].validationFeedback[0].code, "READ_REQUIRED");
  assert.equal(sent[1].validationFeedback[0].preserveRequirements, undefined); assert.equal(sent[1].validationFeedback[0].current, undefined);
  assert.equal(sent[1].prompt, body.prompt); assert.ok(sent[1].validationFeedback[0].support.includes("original prompt"));
});

test("no-op can be corrected once; a read of a different object does not satisfy target inspection", async () => {
  const f = await setup, body = copilotRequest(loftPrompt(f), f.document, [f.loftId], "XY"), sent: any[] = [];
  const responses = [read("wrong-inspect", f.referenceId), edit(false, "premature"), read("target-inspect"), edit(true, "noop"), edit(false, "corrected")];
  const plan = await requestCopilotPlan("/api/copilot/plan", body, { signal: new AbortController().signal, baseUrl: "http://localhost", toolSession: createCadToolSession(ctx(f.document)), fetcher: async (_url, init) => { sent.push(JSON.parse(String(init?.body))); return json(responses[sent.length - 1]); } });
  assert.equal(plan.command.type, "update-loft"); assert.equal(sent.length, 5); assert.ok(sent[2].validationFeedback[0].requiredReads.includes("cad.inspect"));
  assert.equal(sent[4].validationFeedback[1].code, "NO_OP");
});

test("routing hints never bypass native locks/ownership or the captured revision", async () => {
  const f = await setup, locked = structuredClone(f.document); locked.layers["layer-default"].locked = true;
  await assert.rejects(createCadToolSession(ctx(locked)).plan(edit(false).toolCalls), /visible unlocked independent live loft/);
  const d = structuredClone(f.document), session = createCadToolSession(ctx(d));
  const body = copilotRequest(loftPrompt(f), d, [f.loftId], "XY"); let calls = 0;
  await assert.rejects(requestCopilotPlan("/api/copilot/plan", body, { signal: new AbortController().signal, baseUrl: "http://localhost", toolSession: session, fetcher: async () => {
    if (++calls === 2) d.revision++;
    return json(calls === 1 ? read() : edit(false));
  } }), /CAD context changed/);
});

test("out-of-scope tool proposals and over-budget scoped requests remain rejected", async () => {
  const f = await setup, body = copilotRequest(loftPrompt(f), f.document, [f.loftId], "XY");
  await assert.rejects(requestCopilotPlan("/api/copilot/plan", body, { signal: new AbortController().signal, baseUrl: "http://localhost", toolSession: createCadToolSession(ctx(f.document)),
    fetcher: async () => json({ version: 1, toolCalls: [{ id: "unexpected", name: "solid.primitive", arguments: { id: "fake", primitive: "box", params: { width: 10, depth: 10, height: 10 }, position: [0, 0, 0] } }] }) }), /outside the captured loft task scope/);
  let chats = 0;
  const gateway = createLocalCopilot({ model: "unit-model", fetcher: async url => {
    const path = new URL(String(url)).pathname;
    if (path === "/api/tags") return json({ models: [{ name: "unit-model" }] });
    if (path === "/api/show") return json({ capabilities: ["completion"] });
    chats++; throw Error("Must not infer");
  } });
  await assert.rejects(gateway.plan({ ...body, validationFeedback: ["x".repeat(20000)] }, new AbortController().signal), /CONTEXT_BUDGET/);
  assert.equal(chats, 0);
});

test("raw command and recipe responses cannot bypass the selected loft scope", async () => {
  const f = await setup, body = copilotRequest(loftPrompt(f), f.document, [f.loftId], "XY");
  for (const response of [
    { version: 1, command: { type: "create-primitive", primitive: "box", params: { width: 10, depth: 10, height: 10 } }, summary: ["Unrequested replacement"] },
    { version: 1, recipe: { id: "pin", parameters: { diameter: 6, length: 30 } } },
  ]) {
    let calls = 0;
    await assert.rejects(requestCopilotPlan("/api/copilot/plan", body, { signal: new AbortController().signal, baseUrl: "http://localhost", toolSession: createCadToolSession(ctx(f.document)),
      fetcher: async () => json(++calls === 1 ? read() : response) }), /not raw commands or recipes/);
  }
});
