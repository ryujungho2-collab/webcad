import test from "node:test";
import assert from "node:assert/strict";
import { deserializeDocument, serializeDocument } from "@agent-webcad/cad-document";
import { assessDesignCandidate, buildDesignEvaluationFixture, runDesignEvaluation, taskPrompt } from "../evaluation/cadDesignEvaluation";
import { prepareCadCommand } from "../src/state/dispatchCadCommand";
import { copilotSolidContract, solidParameterPlan } from "../src/copilot/copilotSolid";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory } from "../src/state/history";

const setup = buildDesignEvaluationFixture();
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });

test("moderately complex synthetic fixture has exact BRep, ports, 15 vents, source relations and explicit unverified intent", async () => {
  const f = await setup, d = f.document;
  assert.equal(Object.values(d.features).filter(x => x.type === "fillet").length, 1);
  assert.equal(Object.values(d.features).filter(x => x.type === "shell").length, 1);
  assert.equal(Object.values(d.features).filter(x => x.params.faceHole).length, 2);
  assert.equal(Object.values(d.sketches!).flatMap(s => s.geometry).filter(g => g.kind === "circle").length, 15);
  assert.ok(taskPrompt(f).length < 4000);
  assert.match(f.study.brief.assumptions, /not airflow/);
  const before = await assessDesignCandidate(f, d);
  assert.equal(before.success, false, "baseline is a valid scene but does not meet the new area target");
  assert.deepEqual(before.criteria.filter(c => c.status === "fail").map(c => c.id).sort(), ["only-vent-driver", "opening-area-goal"]);
  assert.equal(before.criteria.filter(c => c.id.startsWith("valid-brep:") && c.status === "pass").length, 3);
});

test("native redesign satisfies all coupled intent constraints and persists without editing editor/history", async () => {
  const f = await setup, before = JSON.stringify(f.document), editor = JSON.stringify(cadDocument), history = cadHistory.getPastLabels();
  const contract = copilotSolidContract(f.document, [f.lidId]), parameter = contract.parameters.find(p => p.key.endsWith("_holeDiameter"))!;
  assert.ok(parameter); const plan = solidParameterPlan(contract, parameter.key, 8);
  const prepared = await prepareCadCommand(f.document, plan.command); assert.ok(prepared.result.ok, prepared.result.reason);
  const report = await assessDesignCandidate(f, prepared.proposed);
  assert.equal(report.success, true, JSON.stringify(report.criteria.filter(c => c.status !== "pass")));
  assert.ok(Math.abs(Number(report.metrics.openingAreaMm2) - 15 * Math.PI * 16) < 1e-6);
  assert.ok(Math.abs(Number(report.metrics.edgeLigamentMm) - 8) < 1e-6); assert.ok(Math.abs(Number(report.metrics.betweenVentsLigamentMm) - 11) < 1e-6);
  assert.ok(Math.abs(Number(report.metrics.inspectionGapMm) - 2) < .001);
  assert.ok(Number(report.metrics.referenceZClearanceMm) >= 10 - .001);
  assert.ok((await assessDesignCandidate(f, deserializeDocument(serializeDocument(prepared.proposed)))).success);
  assert.equal(JSON.stringify(f.document), before); assert.equal(JSON.stringify(cadDocument), editor); assert.deepEqual(cadHistory.getPastLabels(), history);
});

test("valid geometry is rejected for area, edge-material, protected-source, placement or missing-reference violations", async () => {
  const f = await setup, c = copilotSolidContract(f.document, [f.lidId]), key = c.parameters.find(p => p.key.endsWith("_holeDiameter"))!.key;
  for (const [value, required] of [[7, "opening-area-goal"], [9, "edge-ligament"]] as const) {
    const prepared = await prepareCadCommand(f.document, solidParameterPlan(c, key, value).command); assert.ok(prepared.result.ok);
    const report = await assessDesignCandidate(f, prepared.proposed); assert.equal(report.success, false);
    assert.ok(report.criteria.some(x => x.id === required && x.status === "fail"));
  }
  const good = (await prepareCadCommand(f.document, solidParameterPlan(c, key, 8).command)).proposed;
  const moved = structuredClone(good); moved.objects[f.lidId].transform!.translation[2] += 1;
  assert.ok((await assessDesignCandidate(f, moved)).criteria.some(c => c.id === "lid-envelope-and-placement" && c.status === "fail"));
  const corrupted = structuredClone(good), source = Object.values(corrupted.features).find(x => x.type === "shell")!;
  source.params.thickness = 5;
  assert.ok((await assessDesignCandidate(f, corrupted)).criteria.some(c => c.id === "protected-scene-and-sources" && c.status === "fail"));
  const missing = structuredClone(good); delete missing.objects[f.lidId];
  const unknown = await assessDesignCandidate(f, missing);
  assert.equal(unknown.success, false); assert.equal(unknown.status, "incomplete");
});

test("scripted transport exercises model read -> intent rejection -> bounded retry; it is not a real-model result", async () => {
  const f = await setup, c = copilotSolidContract(f.document, [f.lidId]), diameter = c.parameters.find(p => p.key.endsWith("_holeDiameter"))!.key;
  let requests = 0; const sent: any[] = [];
  const responses = [
    { version: 1, toolCalls: [{ id: "read-target", name: "cad.inspect", arguments: { objectIds: [f.lidId] } }] },
    { version: 1, toolCalls: [{ id: "too-small", name: "solid.parameter", arguments: { key: diameter, value: 7 } }] },
    { version: 1, toolCalls: [{ id: "revised", name: "solid.parameter", arguments: { key: diameter, value: 8 } }] },
  ];
  const result = await runDesignEvaluation(f, { fetcher: async (_url, init) => { sent.push(JSON.parse(String(init?.body))); return json(responses[requests++]); } });
  assert.equal(result.success, true, result.error); assert.equal(requests, 3);
  assert.equal(result.metrics.modelReads, 1); assert.equal(result.metrics.nativeAttempts, 2); assert.equal(result.metrics.designIntentRejections, 1);
  assert.match(JSON.stringify(sent[2].validationFeedback), /opening-area-goal/);
  assert.equal(result.metrics.editorApplyCalls, 0); assert.equal(result.runs.length, 0, "scripted transport does not manufacture Ollama metadata");
  assert.ok(result.proposed); assert.ok(result.plan);
});

test("same rejected/no-op proposal stops instead of spending unbounded retries or publishing", async () => {
  const f = await setup, c = copilotSolidContract(f.document, [f.lidId]), key = c.parameters.find(p => p.key.endsWith("_holeDiameter"))!.key;
  let requests = 0;
  const result = await runDesignEvaluation(f, { fetcher: async () => json(++requests === 1
    ? { version: 1, toolCalls: [{ id: "inspect", name: "cad.inspect", arguments: { objectIds: [f.lidId] } }] }
    : { version: 1, toolCalls: [{ id: `noop-${requests}`, name: "solid.parameter", arguments: { key, value: 6 } }] }) });
  assert.equal(result.success, false); assert.equal(requests, 3); assert.equal(result.metrics.nativeAttempts, 0);
  assert.match(result.error!, /Repeated rejected\/no-op/); assert.equal(result.proposed, undefined); assert.equal(result.metrics.editorApplyCalls, 0);
});
