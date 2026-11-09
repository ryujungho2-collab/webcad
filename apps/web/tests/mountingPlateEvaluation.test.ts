import test from "node:test";
import assert from "node:assert/strict";
import { assessPlate, buildPlateFixture, plateControl, platePrompt, runPlateEvaluation } from "../evaluation/mountingPlateEvaluation";
import { prepareCadCommand } from "../src/state/dispatchCadCommand";
import { copilotSolidContract, solidParameterPlan } from "../src/copilot/copilotSolid";
import { deserializeDocument, serializeDocument } from "@agent-webcad/cad-document";
const fixture = buildPlateFixture();

test("plate task preserves edge-relative intent through an actual native width edit and reload", async () => {
  const f = await fixture, before = JSON.stringify(f.document);
  assert.ok(platePrompt(f).length < 4000);
  const baseline = await assessPlate(f, f.document);
  assert.equal(baseline.success, false);
  assert.ok(baseline.criteria.some(c => c.id === "width-increase" && c.status === "fail"));
  const p = await prepareCadCommand(f.document, plateControl(f).command); assert.ok(p.result.ok, p.result.reason);
  const assessment = await assessPlate(f, p.proposed); assert.ok(assessment.success, JSON.stringify(assessment.criteria.filter(c => c.status !== "pass")));
  assert.ok(Math.abs(Number(assessment.metrics.measuredWidthMm) - 160) < .001);
  assert.ok(Math.abs(Number(assessment.metrics.deviceZClearanceMm) - 2) < .001);
  assert.ok(Math.abs(Number(assessment.metrics.neighborXClearanceMm) - 30) < .001);
  assert.ok((await assessPlate(f, deserializeDocument(serializeDocument(p.proposed)))).success);
  assert.equal(JSON.stringify(f.document), before);
});

test("native-valid wrong width, wrong hole diameter and frozen right holes fail design intent", async () => {
  const f = await fixture, contract = copilotSolidContract(f.document, [f.plateId]);
  for (const [key, value, failed] of [[contract.plateVariables!.width, 170, "neighbor-X-separation"], [contract.plateVariables!.holeDiameter, 8, "width-driver-only"]] as const) {
    const p = await prepareCadCommand(f.document, solidParameterPlan(contract, key, value).command); assert.ok(p.result.ok);
    const a = await assessPlate(f, p.proposed); assert.equal(a.success, false); assert.ok(a.criteria.some(c => c.id === failed && c.status === "fail"));
  }
  const correct = (await prepareCadCommand(f.document, plateControl(f).command)).proposed;
  const corrupted = structuredClone(correct), sketch = Object.values(corrupted.sketches!)[0];
  const right = sketch.geometry.filter(g => g.kind === "circle" && g.center[0] > 100);
  for (const g of right) if (g.kind === "circle") g.center[0] -= 40;
  // Derived profile metadata also carries native solved positions; change that explicitly.
  for (const feature of Object.values(corrupted.features)) if (feature.params.kind === "circle" && Array.isArray(feature.params.center) && Number(feature.params.center[0]) > 100) feature.params.center[0] = Number(feature.params.center[0]) - 40;
  const a = await assessPlate(f, corrupted); assert.equal(a.success, false); assert.ok(a.criteria.some(c => c.id === "edge-relative-hole-centers" && c.status === "fail"));
});

test("shared loop executes reads and a valid proposal without manufacturing model metadata or publishing", async () => {
  const f = await fixture, contract = copilotSolidContract(f.document, [f.plateId]); let call = 0;
  const result = await runPlateEvaluation(f, { fetcher: async () => new Response(JSON.stringify(++call === 1
    ? { version: 1, toolCalls: [{ id: "read", name: "cad.inspect", arguments: { objectIds: [f.plateId] } }] }
    : { version: 1, toolCalls: [{ id: "edit", name: "solid.parameter", arguments: { key: contract.plateVariables!.width, value: 160 } }] }), { headers: { "Content-Type": "application/json" } }) });
  assert.ok(result.success, result.error); assert.equal(call, 2); assert.equal(result.metrics.modelReads, 1); assert.equal(result.metrics.nativeAttempts, 1); assert.equal(result.metrics.editorApplyCalls, 0); assert.equal(result.runs.length, 0);
});
