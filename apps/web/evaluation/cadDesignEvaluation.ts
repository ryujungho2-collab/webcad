/** Evaluation-only orchestration. No editor publication, new CAD tools, or training. */
import type { CadDocument, CadFeature, GeometryMeasurement } from "@agent-webcad/cad-document";
import { deserializeDocument, serializeDocument } from "@agent-webcad/cad-document";
import { prepareCadCommand } from "../src/state/dispatchCadCommand";
import { measureDocumentObject } from "../src/state/documentQuery";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory } from "../src/state/history";
import { planCadToolPrompt } from "../src/copilot/cadToolPrompts";
import { compileRecipe } from "../src/copilot/cadRecipes";
import { createCadToolSession, type CadToolReadResult } from "../src/copilot/cadToolSession";
import { copilotRequest, requestCopilotPlan } from "../src/copilot/copilotConnection";
import { type CopilotPlan } from "../src/copilot/copilotPlan";
import { type ModelRun } from "../src/copilot/designIntent";
import { type DesignStudy, designPreservationIssue } from "../src/copilot/designStudy";
import { getCapability } from "../src/ontology/capabilities";
import { queryProfileExtrudeRelations } from "../src/state/profileExtrudeRelations";
import { getWorldDrawingGeometry } from "../src/precision/worldGeometry";
import { getObjectTransform } from "../src/precision/objectTransform";

export const TASK_ID = "CAD-EVAL-01-ventilation-intent-v1";
export const TASK_SPEC = {
  id: TASK_ID, dataClass: "synthetic", units: "mm", mode: "existing-design-redesign",
  scene: "Rounded open enclosure, bottom drain, front port, 3x5 vented lid, protected internal reference block",
  objective: "Increase geometric vent opening area to 700–800 mm² without altering mounting/envelope intent",
  constraints: {
    lidWidth: 100, lidDepth: 70, lidThickness: 3, rows: 3, columns: 5, centerMargin: 12,
    edgeLigamentMin: 8, betweenVentsLigamentMin: 10, inspectionGap: 2, internalClearanceMin: 10,
    preserve: ["case geometry and ports", "reference block", "lid identity and placement", "vent count and centers", "live profile references"],
  },
  budgets: { modelCalls: 6, replans: 2, elapsedMs: 180000 },
  excluded: ["whole-model autonomous creation", "airflow/thermal/strength certification", "fastening design", "automatic editor Apply", "model training"],
} as const;

export type Fixture = { document: CadDocument; caseId: string; lidId: string; referenceId: string; study: DesignStudy };
export type Criterion = { id: string; status: "pass" | "fail" | "unknown"; source: string; actual?: unknown; expected?: unknown; reason?: string };
export type Assessment = { status: "passed-native-preview" | "rejected" | "incomplete"; success: boolean; criteria: Criterion[]; metrics: Record<string, number | string>; measurements: Record<string, GeometryMeasurement> };
const featureOf = (d: CadDocument, id: string): CadFeature | undefined => Object.values(d.features).find(f => f.output === id);
const context = (document: CadDocument, selectionIds: string[] = []) => ({ document, selectionIds, layerId: "layer-default", workPlane: "XY" as const });
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const near = (a: number, b: number, tolerance = .001) => Number.isFinite(a) && Math.abs(a - b) <= tolerance;

/** Existing native planners build the fixture; these are evaluator actions, never model actions. */
export async function buildDesignEvaluationFixture(signal?: AbortSignal): Promise<Fixture> {
  let document: CadDocument = { id: "cad-eval-01-synthetic", revision: 0, objects: {}, features: {}, sketches: {},
    layers: { "layer-default": { id: "layer-default", name: "Default", visible: true, locked: false, objectIds: [] } }, rootObjects: [], rootLayers: ["layer-default"] };
  let selected: string[] = [];
  for (const prompt of ["100x70 사각형 스케치", "선택한 윤곽 30mm 돌출", "수직 모서리 반지름 4mm 필렛", "윗면 제거 두께 2mm 셸", "안쪽 바닥 중심에 지름 8mm 관통 구멍", "앞면 중심에 지름 10mm 깊이 2mm 구멍"]) {
    signal?.throwIfAborted();
    const result = await planCadToolPrompt(prompt, context(document, selected), { signal });
    if (!result?.ok) throw Error(`Fixture setup: ${result && !result.ok ? result.reason : prompt}`);
    const prepared = await prepareCadCommand(document, result.plan.command, { signal });
    if (!prepared.result.ok) throw Error(`Fixture setup: ${prepared.result.reason}`);
    document = prepared.proposed; selected = result.plan.resultObjectIds!;
  }
  const caseId = selected[0], lid = compileRecipe({ id: "vented-lid", parameters: { width: 100, depth: 70, thickness: 3, margin: 12, holeDiameter: 6, rows: 3, columns: 5 } });
  const preparedLid = await prepareCadCommand(document, lid.command, { signal });
  if (!preparedLid.result.ok) throw Error(`Fixture lid: ${preparedLid.result.reason}`);
  document = preparedLid.proposed;
  const lidId = lid.resultObjectIds![0], referenceId = "protected-electronics-envelope";
  const placement = await prepareCadCommand(document, { type: "batch", label: "Evaluation fixture placement", commands: [
    { type: "move-object", objectId: lidId, translation: [0, 0, 32] },
    { type: "rename-object", objectId: lidId, name: "Vented service lid" },
    { type: "rename-object", objectId: caseId, name: "Protected enclosure with two ports" },
    { type: "create-primitive", id: referenceId, primitive: "box", params: { width: 60, depth: 30, height: 4 }, position: [20, 20, 18] },
  ] }, { signal });
  if (!placement.result.ok) throw Error(`Fixture placement: ${placement.result.reason}`);
  document = placement.proposed;
  const study: DesignStudy = { version: 1, documentId: document.id, intentConfirmed: true, decisions: [], brief: {
    goal: "Increase vent opening area while preserving service-lid mounting and the protected enclosure.",
    requirements: "700–800 mm² geometric vent opening area; retain 3x5 grid, hole centers, 100x70x3 mm lid, edge ligament >=8 mm, inter-hole ligament >=10 mm; retain 2 mm inspection gap and >=10 mm lid-to-reference Z separation. Change only one advertised vent diameter driver.",
    assumptions: "Synthetic evaluation intent authored by the evaluator. The block is a protected geometric envelope. Opening area is not airflow; the inspection gap is not an assembled seal.",
    questions: "Material, cooling load, fasteners and manufacturing tolerances remain unspecified.", qualities: [],
    anchors: [{ objectId: caseId, role: "core" }, { objectId: referenceId, role: "preserve" }, { objectId: lidId, role: "reference" }],
  } };
  return { document, caseId, lidId, referenceId, study };
}

export function taskPrompt(fixture: Fixture, grounding = true): string {
  const { document: d, lidId, caseId, referenceId } = fixture;
  const facts = grounding ? {
    capabilities: ["driving-dimension-edit", "profile-extrude-relations"].map(id => {
      const c = getCapability(id)!; return { id, support: c.support, commandTypes: c.commandTypes, mcpTools: c.mcpTools };
    }),
    relations: (() => { const rows = queryProfileExtrudeRelations(d, lidId).relations; return {
      total: rows.length, shown: rows.slice(0, 2).map(r => ({ source: r.source.objectId, target: r.target.objectId, direction: r.direction, mode: r.mode, status: r.status })),
      omitted: Math.max(0, rows.length - 2), allLiveResolved: rows.length > 0 && rows.every(r => r.mode === "live" && r.status === "resolved"),
    }; })(),
    document: { id: d.id, revision: d.revision }, source: "Native capability records and stored dependency graph; not inferred by an LLM",
  } : undefined;
  return `기존 장비 케이스의 선택된 통풍 덮개를 개선해. 현재 문서를 cad.inspect로 조회한 뒤 지원되는 solid.parameter 한 개로만 수정안을 제안해.
목표: 통풍구의 기하학적 총 개방 면적을 700–800 mm²로 만들어. 지름은 네가 정해. 냉각 성능을 보증하지 마.
설계 의도: 덮개의 100×70 mm 외형, 두께 3 mm, 3행×5열의 15개 원형 구멍 중심과 대칭, 바깥쪽 구멍 중심 여백 12 mm, 객체 ID와 배치를 유지해. 경계까지 남는 재료 폭은 최소 8 mm, 구멍 사이 남는 재료 폭은 최소 10 mm여야 해. 케이스 위 2 mm 검사 간격과 내부 참조 부품 위 최소 10 mm Z 간격을 유지해.
수정 대상 ${lidId}. 보호할 케이스 ${caseId}와 내부 참조 부품 ${referenceId} 및 모든 원본은 바꾸지 마. 다른 부품을 추가하거나 대체하지 마. 선택된 덮개의 기존 통풍구 지름 driver만 변경해. 제조 공차·재료·하중·체결 방식은 미정이며 임의로 확정하지 마. 사용자 승인 전 Apply는 금지야.
${facts ? `조회 근거(정답 지름이나 실행 결과는 아님): ${JSON.stringify(facts)}` : ""}`;
}

function circles(d: CadDocument, lidId: string) {
  return (featureOf(d, lidId)?.inputs ?? []).flatMap(id => {
    const f = featureOf(d, id), g = f && getWorldDrawingGeometry(d.objects[id], f);
    return g?.kind === "circle" && g.radius !== undefined && g.center ? [{ id, radius: g.radius, center: g.center }] : [];
  });
}

/** Task-specific verifier. No learned judge and no blanket general-CAD correctness claim. */
export async function assessDesignCandidate(fixture: Fixture, candidate: CadDocument, signal?: AbortSignal): Promise<Assessment> {
  const before = fixture.document, criteria: Criterion[] = [], metrics: Assessment["metrics"] = {}, measurements: Assessment["measurements"] = {};
  const check = (id: string, ok: boolean, source: string, actual?: unknown, expected?: unknown) => criteria.push({ id, status: ok ? "pass" : "fail", source, actual, expected });
  signal?.throwIfAborted();
  check("document-identity", candidate.id === before.id && candidate.revision >= before.revision, "native-document", { id: candidate.id, revision: candidate.revision }, { id: before.id, minimumRevision: before.revision });
  check("preserve-anchors", !designPreservationIssue(before, candidate, fixture.study.brief), "designPreservationIssue", designPreservationIssue(before, candidate, fixture.study.brief) ?? "unchanged");
  check("same-object-and-feature-identities", same(Object.keys(before.objects).sort(), Object.keys(candidate.objects).sort()) && same(Object.keys(before.features).sort(), Object.keys(candidate.features).sort()), "native-document");
  // Protect upstream definitions too: a final BRep snapshot alone is insufficient evidence.
  const lidFeature = featureOf(before, fixture.lidId)!;
  const lidSourceIds = new Set(lidFeature.inputs);
  const lidSketchIds = new Set([...lidSourceIds].map(id => featureOf(before, id)?.params.sketchId).filter((id): id is string => typeof id === "string"));
  const oldCircles = circles(before, fixture.lidId), nextCircles = circles(candidate, fixture.lidId);
  const changedVariables = [...new Set([...Object.keys(before.variables ?? {}), ...Object.keys(candidate.variables ?? {})])].filter(id => !same(before.variables?.[id], candidate.variables?.[id]));
  check("only-vent-driver", changedVariables.length === 1 && changedVariables[0].endsWith("_holeDiameter"), "native-bound-variables", changedVariables);
  const protectedState = (d: CadDocument) => ({
    objects: d.objects,
    features: Object.fromEntries(Object.entries(d.features).filter(([, f]) => f.output !== fixture.lidId && !lidSourceIds.has(f.output))),
    sketches: Object.fromEntries(Object.entries(d.sketches ?? {}).filter(([id]) => !lidSketchIds.has(id))),
    variables: Object.fromEntries(Object.entries(d.variables ?? {}).filter(([id]) => !changedVariables.includes(id))),
    bindings: d.parameterBindings, workPlanes: d.workPlanes, layers: d.layers, roots: d.rootObjects, rootLayers: d.rootLayers,
    assembly: d.assembly, interferenceIntents: d.interferenceIntents,
  });
  check("protected-scene-and-sources", same(protectedState(before), protectedState(candidate)), "native-document-exact-comparison");
  const oldProfiles = lidFeature.inputs.map(id => ({ id, f: featureOf(before, id), g: featureOf(before, id) && getWorldDrawingGeometry(before.objects[id], featureOf(before, id)!) }));
  const newFeature = featureOf(candidate, fixture.lidId);
  check("live-inputs", newFeature?.type === "extrude" && newFeature.dependencyMode === "live" && same(newFeature.inputs, lidFeature.inputs) && queryProfileExtrudeRelations(candidate, fixture.lidId).relations.length === lidFeature.inputs.length && queryProfileExtrudeRelations(candidate, fixture.lidId).relations.every(r => r.mode === "live" && r.status === "resolved"), "queryProfileExtrudeRelations");
  check("outline-and-thickness", newFeature?.params.distance === 3 && oldProfiles.filter(p => p.g?.kind !== "circle").every(p => same(p.f, featureOf(candidate, p.id))), "native-profile-and-extrude");
  check("vent-grid-and-centers", oldCircles.length === 15 && nextCircles.length === 15 && nextCircles.every((c, i) => c.id === oldCircles[i].id && same(c.center, oldCircles[i].center)), "getWorldDrawingGeometry", nextCircles.length, 15);
  const area = nextCircles.reduce((sum, c) => sum + Math.PI * c.radius ** 2, 0), oldArea = oldCircles.reduce((sum, c) => sum + Math.PI * c.radius ** 2, 0);
  const edge = nextCircles.length ? Math.min(...nextCircles.flatMap(c => [c.center[0] - c.radius, 100 - c.center[0] - c.radius, c.center[1] - c.radius, 70 - c.center[1] - c.radius])) : -Infinity;
  const gaps = nextCircles.flatMap((a, i) => nextCircles.slice(i + 1).map(b => Math.hypot(...a.center.map((v, k) => v - b.center[k])) - a.radius - b.radius));
  const ligament = gaps.length ? Math.min(...gaps) : -Infinity;
  metrics.openingAreaMm2 = area; metrics.beforeOpeningAreaMm2 = oldArea; metrics.openingAreaIncreasePercent = (area / oldArea - 1) * 100;
  if (Number.isFinite(edge)) metrics.edgeLigamentMm = edge;
  if (Number.isFinite(ligament)) metrics.betweenVentsLigamentMm = ligament;
  check("opening-area-goal", area >= 700 - 1e-6 && area <= 800 + 1e-6, "analytic-circular-openings-not-flow-simulation", area, [700, 800]);
  check("uniform-diameter", nextCircles.length === 15 && nextCircles.every(c => near(c.radius, nextCircles[0].radius, 1e-6)), "native-circle-profiles");
  check("edge-ligament", edge >= 8 - 1e-6, "analytic-distance-to-rectangular-outline", edge, ">=8 mm");
  check("between-vent-ligament", ligament >= 10 - 1e-6, "analytic-circle-pair-distance", ligament, ">=10 mm");
  for (const id of [fixture.lidId, fixture.caseId, fixture.referenceId]) {
    signal?.throwIfAborted();
    try {
      measurements[id] = await measureDocumentObject(candidate, id);
      check(`valid-brep:${id}`, measurements[id].validity === "valid", "OpenCascade-native-measurement", measurements[id].validity, "valid");
    } catch (e) { criteria.push({ id: `valid-brep:${id}`, status: "unknown", source: "OpenCascade-native-measurement", reason: e instanceof Error ? e.message : String(e) }); }
  }
  const lid = measurements[fixture.lidId], body = measurements[fixture.caseId], reference = measurements[fixture.referenceId];
  if (lid?.bounds && body?.bounds && reference?.bounds) {
    const inspectionGap = lid.bounds.min[2] - body.bounds.max[2], clearance = lid.bounds.min[2] - reference.bounds.max[2];
    metrics.inspectionGapMm = inspectionGap; metrics.referenceZClearanceMm = clearance;
    check("lid-envelope-and-placement", [0, 0, 32].every((n, i) => near(lid.bounds!.min[i], n)) && [100, 70, 35].every((n, i) => near(lid.bounds!.max[i], n)) && same(getObjectTransform(candidate.objects[fixture.lidId], newFeature), getObjectTransform(before.objects[fixture.lidId], lidFeature)), "OpenCascade-bounds-and-native-transform", lid.bounds);
    check("inspection-gap", near(inspectionGap, 2), "world-Z-bounds-separation", inspectionGap, 2);
    check("reference-clearance", clearance >= 10 - .001, "world-Z-bounds-separation-not-general-distance", clearance, ">=10 mm");
  } else criteria.push({ id: "placement-and-clearance", status: "unknown", source: "OpenCascade-bounds", reason: "Missing measured bounds" });
  const expectedVolume = (100 * 70 - area) * 3;
  check("native-volume-matches-actual-profiles", lid?.volume !== undefined && near(lid.volume, expectedVolume, .02), "OpenCascade-volume-vs-independent-analytic-formula", lid?.volume, expectedVolume);
  try {
    const roundtrip = deserializeDocument(serializeDocument(candidate));
    check("serialization", same(JSON.parse(serializeDocument(roundtrip)), JSON.parse(serializeDocument(candidate))), "native-serializer-roundtrip");
  } catch (e) { criteria.push({ id: "serialization", status: "fail", source: "native-serializer-roundtrip", reason: e instanceof Error ? e.message : String(e) }); }
  const success = criteria.every(c => c.status === "pass");
  return { status: success ? "passed-native-preview" : criteria.some(c => c.status === "unknown") ? "incomplete" : "rejected", success, criteria, metrics, measurements };
}

export type EvaluationEvent = { kind: string; [key: string]: unknown };
export type EvaluationOptions = { fetcher: typeof fetch; model?: string; grounding?: boolean; signal?: AbortSignal; onEvent?: (event: EvaluationEvent) => void };
export type NativeEvaluationTask = {
  id: string; document: CadDocument; targetId: string; prompt: string; excluded: readonly string[];
  assess: (candidate: CadDocument, signal?: AbortSignal) => Promise<Assessment>;
  feedback?: (candidate: CadDocument, assessment: Assessment) => unknown;
};
export function runDesignEvaluation(fixture: Fixture, options: EvaluationOptions) {
  return runCadEvaluation({ id: TASK_ID, document: fixture.document, targetId: fixture.lidId, prompt: taskPrompt(fixture, options.grounding !== false), excluded: TASK_SPEC.excluded,
    assess: (candidate, signal) => assessDesignCandidate(fixture, candidate, signal),
    feedback: (candidate, assessment) => ({ source: "Measured candidate circle profiles; no evaluator solution supplied", units: "mm and mm²", holeCount: circles(candidate, fixture.lidId).length,
      diameters: [...new Set(circles(candidate, fixture.lidId).map(c => Number((2 * c.radius).toFixed(6))))], openingAreaMm2: assessment.metrics.openingAreaMm2,
      formula: "For N equal circular openings of diameter d, A = N * pi * (d / 2)^2. Compare A with BOTH area limits and recompute all ligament limits. A rejected diameter must not be repeated.",
      edgeLigamentMm: assessment.metrics.edgeLigamentMm, betweenVentsLigamentMm: assessment.metrics.betweenVentsLigamentMm }),
  }, options);
}
/** Same captured session, native preparation and bounded feedback loop for each task. */
export async function runCadEvaluation(fixture: NativeEvaluationTask, options: EvaluationOptions) {
  const started = performance.now(), source = structuredClone(fixture.document), sourceJson = JSON.stringify(source);
  const editorBefore = JSON.stringify(cadDocument), historyBefore = JSON.stringify(cadHistory.getPastLabels());
  const events: EvaluationEvent[] = [], runs: ModelRun[] = [], assessments: Assessment[] = [];
  const emit = (event: EvaluationEvent) => { events.push(event); options.onEvent?.(event); };
  const controller = new AbortController(), abort = () => controller.abort(options.signal?.reason);
  options.signal?.throwIfAborted(); options.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(Error("CAD evaluation time budget exceeded")), TASK_SPEC.budgets.elapsedMs);
  const assertUnchanged = () => { if (JSON.stringify(source) !== sourceJson || JSON.stringify(fixture.document) !== sourceJson || JSON.stringify(cadDocument) !== editorBefore || JSON.stringify(cadHistory.getPastLabels()) !== historyBefore) throw Error("Evaluation source/editor/history changed; abort without publishing"); };
  const captured = createCadToolSession(context(source, [fixture.targetId]), { isCurrent: () => JSON.stringify(source) === sourceJson });
  const session = { ...captured, async read(...args: Parameters<typeof captured.read>) { const read = await captured.read(...args); emit({ kind: "model-read", read }); return read; }, async plan(...args: Parameters<typeof captured.plan>) {
    emit({ kind: "model-plan", calls: args[0] });
    try { return await captured.plan(...args); } catch (e) { emit({ kind: "planner-rejection", reason: e instanceof Error ? e.message : String(e) }); throw e; }
  } };
  let accepted: CadDocument | undefined, acceptedPlan: CopilotPlan | undefined, error: string | undefined;
  try {
    acceptedPlan = await requestCopilotPlan("/api/copilot/plan", copilotRequest(fixture.prompt, source, [fixture.targetId], "XY", "layer-default", options.model), {
      baseUrl: "http://127.0.0.1", fetcher: options.fetcher, signal: controller.signal, timeoutMs: TASK_SPEC.budgets.elapsedMs, toolSession: session,
      onModelRun: run => { runs.push(run); emit({ kind: "model-usage", run }); },
      validatePlan: async (plan, signal, evidence: CadToolReadResult[]) => {
        assertUnchanged();
        emit({ kind: "native-attempt", command: plan.command, modelReadCallIds: evidence.map(r => r.id) });
        const prepared = await prepareCadCommand(source, plan.command, { signal });
        assertUnchanged();
        if (!prepared.result.ok || !prepared.result.changed) { const reason = prepared.result.reason ?? "Native command made no change"; emit({ kind: "native-rejection", reason }); throw Error(reason); }
        const assessment = await fixture.assess(prepared.proposed, signal); assessments.push(assessment); emit({ kind: "native-assessment", assessment });
        if (!assessment.success) throw Error("DESIGN_INTENT: " + JSON.stringify({
          failed: assessment.criteria.filter(c => c.status !== "pass").map(c => ({ id: c.id, status: c.status, actual: c.actual, expected: c.expected, reason: c.reason })),
          geometryFeedback: fixture.feedback?.(prepared.proposed, assessment),
        }));
        accepted = prepared.proposed;
      },
    });
    assertUnchanged();
  } catch (e) { error = e instanceof Error ? e.message : String(e); emit({ kind: "evaluation-error", error }); }
  finally { clearTimeout(timer); options.signal?.removeEventListener("abort", abort); }
  assertUnchanged();
  const success = !!accepted && !!acceptedPlan && !error;
  return { taskId: fixture.id, status: success ? "passed-native-preview-not-applied" : "not-completed", mode: "isolated-native-evaluation", success,
    elapsedMs: performance.now() - started, error, events, runs, assessments, proposed: success ? accepted : undefined, plan: success ? acceptedPlan : undefined,
    metrics: { modelReads: events.filter(e => e.kind === "model-read").length, nativeAttempts: events.filter(e => e.kind === "native-attempt").length, plannerRejections: events.filter(e => e.kind === "planner-rejection").length, designIntentRejections: assessments.filter(a => !a.success).length,
      reportedGatewayRuns: runs.length, inputTokens: runs.length ? runs.reduce((n, r) => n + r.inputTokens, 0) : undefined, outputTokens: runs.length ? runs.reduce((n, r) => n + r.outputTokens, 0) : undefined,
      editorApplyCalls: 0, sourceUnchanged: true, editorAndHistoryUnchanged: true },
    limits: fixture.excluded };
}
