import test from "node:test";
import assert from "node:assert/strict";
import { assessLoft, buildLoftFixture, loftControl, loftPrompt, loftRouteAudit, runLoftEvaluation } from "../evaluation/loftIntentEvaluation";
import { prepareCadCommand } from "../src/state/dispatchCadCommand";
import { deserializeDocument, serializeDocument } from "@agent-webcad/cad-document";
const fixture = buildLoftFixture();

test("native three-section smooth loft changes real geometry while preserving sources, placement and finish", async () => {
  const f = await fixture, source = JSON.stringify(f.document), baseline = await assessLoft(f, f.document);
  assert.ok(loftPrompt(f).length < 4000); assert.equal(baseline.success, false);
  const compact = loftPrompt(f, true, true); assert.ok(compact.length < loftPrompt(f).length); assert.match(compact, /Preserve the exact circular source definitions/); assert.match(compact, /No Apply/);
  const plan = await loftControl(f), prepared = await prepareCadCommand(f.document, plan.command); assert.ok(prepared.result.ok, prepared.result.reason);
  const assessed = await assessLoft(f, prepared.proposed); assert.ok(assessed.success, JSON.stringify(assessed.criteria));
  assert.ok(Number(assessed.metrics.absoluteVolumeChangeMm3) > 100);
  assert.ok((await assessLoft(f, deserializeDocument(serializeDocument(prepared.proposed)))).success);
  assert.equal(JSON.stringify(f.document), source);
});
test("source edits and reordered sections cannot masquerade as an intent-preserving connection edit", async () => {
  const f = await fixture, good = (await prepareCadCommand(f.document, (await loftControl(f)).command)).proposed;
  const changed = structuredClone(good), source = Object.values(changed.features).find(f => f.output === "section1")!;
  source.params.radius = 11;
  const assessed = await assessLoft(f, changed); assert.equal(assessed.success, false); assert.ok(assessed.criteria.some(c => c.id === "all-other-document-state-preserved" && c.status === "fail"));
  const reordered = structuredClone(good); Object.values(reordered.features).find(f => f.output === "intent-loft")!.inputs.reverse();
  assert.ok((await assessLoft(f, reordered)).criteria.some(c => c.id === "ordered-source-sections" && c.status === "fail"));
});
test("routing audit matches the current catalog and a scripted clarification is not counted as success", async () => {
  const f = await fixture, route = loftRouteAudit(f); assert.equal(route.advertised, route.advertisedTools.includes("solid.loft.update")); assert.equal(route.auditIsReadOnly, true);
  const result = await runLoftEvaluation(f, { fetcher: async () => new Response(JSON.stringify({ version: 1, clarification: { summary: "The current catalog does not offer a loft connection editor.", questions: [{ id: "support", prompt: "Use the existing native loft inspector?", options: ["Inspect native support"] }] } }), { headers: { "Content-Type": "application/json" } }) });
  assert.equal(result.success, false); assert.equal(result.metrics.nativeAttempts, 0); assert.equal(result.metrics.editorApplyCalls, 0); assert.equal(result.runs.length, 0);
});
