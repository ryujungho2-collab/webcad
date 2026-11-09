/** Local synthetic evaluation; --live is explicit. No editor Apply or external data. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { deserializeDocument, serializeDocument } from "@agent-webcad/cad-document";
import { parseDesignStudy } from "../src/copilot/designStudy";
import { createLocalCopilot } from "../server/localCopilot";
import { assessDesignCandidate, buildDesignEvaluationFixture, runDesignEvaluation, taskPrompt, TASK_SPEC } from "../evaluation/cadDesignEvaluation";
import { copilotSolidContract, solidParameterPlan } from "../src/copilot/copilotSolid";
import { prepareCadCommand } from "../src/state/dispatchCadCommand";
import { designViewSvg, projectDesignScenes, readDesignScene } from "../src/copilot/designStudyScene";
import { assessPlate, buildPlateFixture, plateControl, platePrompt, PLATE_TASK, runPlateEvaluation } from "../evaluation/mountingPlateEvaluation";
import { assessLoft, buildLoftFixture, loftControl, loftPrompt, loftRouteAudit, LOFT_TASK, runLoftEvaluation } from "../evaluation/loftIntentEvaluation";

const live = process.argv.includes("--live"), grounding = !process.argv.includes("--without-ontology");
const taskName = process.argv.find(arg => arg.startsWith("--task="))?.split("=")[1] ?? "ventilation";
assert.ok(["ventilation", "mounting-plate", "loft-connection"].includes(taskName), "Task must be ventilation, mounting-plate or loft-connection");
const compactRequest = process.argv.includes("--compact-request");
assert.ok(!compactRequest || taskName === "loft-connection", "Compact request currently applies only to the loft evaluation");
const replayPath = process.argv.find(arg => arg.startsWith("--replay="))?.slice(9);
assert.ok(!replayPath || taskName === "loft-connection", "Replay currently applies only to the loft evaluation");
const maxCallsArg = process.argv.find(arg => arg.startsWith("--max-model-calls="))?.split("=")[1];
const maxModelCalls = maxCallsArg === undefined ? TASK_SPEC.budgets.modelCalls : Number(maxCallsArg);
assert.ok(Number.isInteger(maxModelCalls) && maxModelCalls >= 1 && maxModelCalls <= TASK_SPEC.budgets.modelCalls, "Model-call limit must be 1–6");
const directoryArg = process.argv.find(arg => arg.startsWith("--out="))?.slice(6);
// Each execution gets its own directory; previous evidence is never overwritten.
const directory = resolve(directoryArg ?? `../../output/verification/${taskName === "loft-connection" ? "cad-eval-03" : taskName === "mounting-plate" ? "cad-eval-02" : "cad-eval-01"}/${new Date().toISOString().replaceAll(":", "-")}`);
await mkdir(directory, { recursive: true });
const save = async (name: string, value: unknown) => writeFile(resolve(directory, name), JSON.stringify(value, null, 2));
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const started = performance.now();
const scenario = await (async () => {
  if (taskName === "loft-connection") {
    const f = await (async () => {
      if (!replayPath) return buildLoftFixture(AbortSignal.timeout(90000));
      const inputDirectory=resolve(replayPath), meta=JSON.parse(await readFile(resolve(inputDirectory,"task.json"),"utf8")), prior=JSON.parse(await readFile(resolve(inputDirectory,"report.json"),"utf8"));
      assert.equal(meta.id,LOFT_TASK.id); assert.equal(meta.dataClass,"synthetic"); assert.equal(prior.taskId,LOFT_TASK.id);
      const raw=await readFile(resolve(inputDirectory,"input.webcad.json"),"utf8"); assert.equal(sha(raw),prior.sourceHashBefore,"Replay source hash mismatch");
      const document=deserializeDocument(raw); assert.equal(document.id,"cad-eval-03-synthetic"); assert.equal(Object.keys(document.objects).length,5);
      assert.equal(sha(serializeDocument(document)),prior.sourceHashBefore,"Replay serialization changed the source");
      const study=parseDesignStudy(await readFile(resolve(inputDirectory,"design-study.json"),"utf8"),document.id);
      return {document,study,loftId:"intent-loft",referenceId:"protected-fixture",sectionIds:["section0","section1","section2"]};
    })();
    return { fixture: f, spec: LOFT_TASK, targetId: f.loftId, displayIds: [f.loftId, f.referenceId], prompt: loftPrompt(f, grounding, compactRequest), routeAudit: loftRouteAudit(f),
      assess: (d: typeof f.document) => assessLoft(f, d), control: await loftControl(f), run: (options: Parameters<typeof runDesignEvaluation>[1]) => runLoftEvaluation(f, { ...options, compactRequest }) };
  }
  if (taskName === "mounting-plate") {
    const f = await buildPlateFixture(AbortSignal.timeout(90000));
    return { fixture: f, spec: PLATE_TASK, targetId: f.plateId, displayIds: [f.plateId, f.referenceId, f.obstacleId], prompt: platePrompt(f, grounding),
      assess: (d: typeof f.document) => assessPlate(f, d), control: plateControl(f), run: (options: Parameters<typeof runDesignEvaluation>[1]) => runPlateEvaluation(f, options) };
  }
  const f = await buildDesignEvaluationFixture(AbortSignal.timeout(90000));
  const contract = copilotSolidContract(f.document, [f.lidId]), key = contract.parameters.find(p => p.key.endsWith("_holeDiameter"))!.key;
  return { fixture: f, spec: TASK_SPEC, targetId: f.lidId, displayIds: [f.caseId, f.lidId, f.referenceId], prompt: taskPrompt(f, grounding),
    assess: (d: typeof f.document) => assessDesignCandidate(f, d), control: solidParameterPlan(contract, key, 8), run: (options: Parameters<typeof runDesignEvaluation>[1]) => runDesignEvaluation(f, options) };
})();
const fixture = scenario.fixture;
const source = serializeDocument(fixture.document), hashBefore = sha(source);
await writeFile(resolve(directory, "input.webcad.json"), source);
await save("task.json", { ...scenario.spec, selectedObjectId: scenario.targetId, prompt: scenario.prompt, grounding, compactRequest, replaySource:replayPath?resolve(replayPath):undefined, intentOrigin: "evaluator-authored", fixtureOrigin: "existing-native-planners-not-AI" });
await save("design-study.json", fixture.study);
if ("routeAudit" in scenario) await save("tool-route-audit.json", scenario.routeAudit);
const baseline = await scenario.assess(fixture.document);
await save("baseline-measurements.json", baseline);
// This answer belongs to preflight only. Never passed to the model or its feedback.
const control = await prepareCadCommand(fixture.document, scenario.control.command);
assert.ok(control.result.ok, control.result.reason);
const oracle = await scenario.assess(control.proposed); assert.ok(oracle.success, JSON.stringify(oracle.criteria));
await save("native-preflight.json", { kind: "evaluator-control-not-model", assessment: oracle });
await writeFile(resolve(directory, "control-preview.webcad.json"), serializeDocument(control.proposed));
let visualEvidence: { status: string; paths?: string[]; reason?: string };
try {
  const scenes = await Promise.all([fixture.document, control.proposed].map(d => readDesignScene(d, scenario.displayIds)));
  const views = projectDesignScenes(scenes, "XY"), paths: string[] = [];
  for (const [i, group] of views.entries()) for (const view of group) {
    const name = `${i ? "evaluator-control" : "baseline"}-${view.id}.svg`;
    await writeFile(resolve(directory, name), designViewSvg(view)); paths.push(name);
  }
  visualEvidence = { status: "native-tessellation-projections-not-browser", paths };
} catch (e) { visualEvidence = { status: "not-generated", reason: e instanceof Error ? e.message : String(e) }; }
console.log(`Fixture: ${Object.keys(fixture.document.objects).length} objects, ${Object.keys(fixture.document.features).length} features; native preflight passed.`);

let modelCalls = 0;
const modelTrace: unknown[] = [], gatewayTrace: unknown[] = [], events: unknown[] = [];
let result: Awaited<ReturnType<typeof runDesignEvaluation>> | undefined, executionError: string | undefined;
if (live) {
  const gateway = createLocalCopilot({ model: process.env.CAD_EVAL_MODEL ?? "qwen3-coder-32k:latest", fetcher: async (url, init) => {
    const isChat = new URL(String(url)).pathname === "/api/chat";
    if (isChat && ++modelCalls > maxModelCalls) throw Error("Evaluation model-call budget exhausted");
    const started = performance.now(), request = isChat ? JSON.parse(String(init?.body)) : undefined;
    try {
      const response = await fetch(url, init);
      if (isChat) { const body = await response.clone().json(); modelTrace.push({ call: modelCalls, elapsedMs: performance.now() - started, request, response: body }); await save("model-trace.json", modelTrace); }
      return response;
    } catch (e) {
      if (isChat) { modelTrace.push({ call: modelCalls, elapsedMs: performance.now() - started, request, error: e instanceof Error ? e.message : String(e) }); await save("model-trace.json", modelTrace); }
      throw e;
    }
  } });
  try {
    await save("model-status.json", await gateway.status());
    result = await scenario.run({ grounding, model: process.env.CAD_EVAL_MODEL ?? "qwen3-coder-32k:latest", onEvent: e => { events.push(e); console.log(e.kind); }, fetcher: async (_url, init) => {
      const request = JSON.parse(String(init?.body)), started = performance.now();
      try {
        const response = await gateway.plan(request, init?.signal as AbortSignal);
        gatewayTrace.push({ request, response, elapsedMs: performance.now() - started }); await save("gateway-trace.json", gatewayTrace);
        return new Response(JSON.stringify(response), { headers: { "Content-Type": "application/json" } });
      } catch (e) { gatewayTrace.push({ request, error: e instanceof Error ? e.message : String(e), elapsedMs: performance.now() - started }); await save("gateway-trace.json", gatewayTrace); throw e; }
    } });
  } catch (e) { executionError = e instanceof Error ? e.message : String(e); }
}
const hashAfter = sha(serializeDocument(fixture.document)); assert.equal(hashAfter, hashBefore);
if (result?.proposed) {
  await writeFile(resolve(directory, "preview.webcad.json"), serializeDocument(result.proposed));
  try {
    const scene = await readDesignScene(result.proposed, scenario.displayIds), views = projectDesignScenes([scene], "XY")[0];
    for (const view of views) await writeFile(resolve(directory, `model-preview-${view.id}.svg`), designViewSvg(view));
  } catch (e) { await save("model-visual-error.json", { error: e instanceof Error ? e.message : String(e) }); }
}
const report = { version: 1, taskId: scenario.spec.id, liveRequested: live, maxModelCalls, actualModelCalls: modelTrace.length, modelCallAttempts: modelCalls, grounding, sourceHashBefore: hashBefore, sourceHashAfter: hashAfter, visualEvidence,
  elapsedMs: performance.now() - started, executionError, nativePreflight: "passed", result: result ? { ...result, proposed: result.proposed ? "preview.webcad.json" : undefined } : undefined,
  status: !live ? "native-preflight-only-model-not-run" : result?.success ? "real-model-native-preview-not-applied" : "not-completed",
  limitations: [...scenario.spec.excluded, "Intent is evaluator-authored; model intent extraction was not separately tested", "No browser test or independent STEP engine in this run", "No measured ontology uplift without paired runs", "No weights updated; logs alone are not token-level RL trajectories"] };
await save("events.json", events); await save("report.json", report);
console.log(JSON.stringify({ status: report.status, modelCalls: report.actualModelCalls, metrics: result?.metrics, error: executionError ?? result?.error, output: directory }, null, 2));
if (live && !result?.success) process.exitCode = 1;
