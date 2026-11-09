import { deserializeDocument, serializeDocument, type CadDocument, type GeometryMeasurement } from "@agent-webcad/cad-document";
import { createCadToolSession } from "../src/copilot/cadToolSession";
import { type CadToolCall } from "../src/copilot/cadToolContract";
import { copilotRequest } from "../src/copilot/copilotConnection";
import { taskToolScope } from "../src/copilot/copilotTaskScope";
import { type DesignStudy } from "../src/copilot/designStudy";
import { prepareCadCommand } from "../src/state/dispatchCadCommand";
import { measureDocumentObject } from "../src/state/documentQuery";
import { buildDependencyGraph, dependencyNodeId } from "../src/state/dependencyGraph";
import { runCadEvaluation, type Assessment, type Criterion, type EvaluationOptions } from "./cadDesignEvaluation";

export const LOFT_TASK = {
  id: "CAD-EVAL-03-loft-connection-intent-v1", dataClass: "synthetic", units: "mm", mode: "existing-design-redesign",
  objective: "Change an existing three-section ruled loft to smooth interpolation while preserving every source section and placement",
  budgets: { modelCalls: 3, replans: 2, elapsedMs: 180000 },
  excluded: ["G1/G2 continuity certification", "aerodynamic/thermal/strength analysis", "source-section deformation", "automatic editor Apply", "model training"],
} as const;
export type LoftFixture = { document: CadDocument; loftId: string; referenceId: string; sectionIds: string[]; study: DesignStudy };
const feature = (d: CadDocument, id: string) => Object.values(d.features).find(f => f.output === id);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const context = (document: CadDocument, selectionIds: string[]) => ({ document, selectionIds, layerId: "layer-default", workPlane: "XY" as const });

export async function buildLoftFixture(signal?: AbortSignal): Promise<LoftFixture> {
  const empty: CadDocument = { id: "cad-eval-03-synthetic", revision: 0, objects: {}, features: {}, sketches: {}, rootObjects: [], rootLayers: ["layer-default"],
    layers: { "layer-default": { id: "layer-default", name: "Default", visible: true, locked: false, objectIds: [] } } };
  const sectionIds = ["section0", "section1", "section2"], loftId = "intent-loft", referenceId = "protected-fixture";
  const calls: CadToolCall[] = [20, 10, 25].map((radius, i) => ({ id: `section-call-${i}`, name: "curve.circle", arguments: { id: sectionIds[i], plane: "XY", center: [0, 0, i * 30], radius } }));
  calls.push({ id: "loft-call", name: "solid.loft", arguments: { id: loftId, profileObjectIds: sectionIds, ruled: true } });
  const plan = await createCadToolSession(context(empty, [])).plan(calls, signal), created = await prepareCadCommand(empty, plan.command, { signal });
  if (!created.result.ok) throw Error(`Loft fixture: ${created.result.reason}`);
  const setup = await prepareCadCommand(created.proposed, { type: "batch", label: "Synthetic loft intent fixture", commands: [
    { type: "move-object", objectId: loftId, translation: [70, 40, 10] },
    { type: "set-solid-finish", objectId: loftId, finish: { name: "Protected ceramic finish", color: "#dfddd4", roughness: .8, metalness: 0, opacity: 1 } },
    { type: "create-primitive", id: referenceId, primitive: "box", params: { width: 20, depth: 20, height: 80 }, position: [140, 0, 0] },
  ] }, { signal });
  if (!setup.result.ok) throw Error(`Loft placement: ${setup.result.reason}`);
  return { document: setup.proposed, loftId, referenceId, sectionIds, study: { version: 1, documentId: empty.id, intentConfirmed: true, decisions: [], brief: {
    goal: "Replace straight section spans with the existing smooth loft interpolation.", requirements: "Preserve all three circular source definitions, source order, cap profiles, live dependencies, object identity, placement, finish and unrelated fixture. Geometry must actually change and remain valid.",
    assumptions: "Evaluator-authored synthetic intent. Smooth interpolation is not G1/G2 certification.", questions: "Flow, strength, material specification and manufacturing tolerances remain unverified.", qualities: [],
    anchors: [{ objectId: loftId, role: "reference" }, ...sectionIds.map(objectId => ({ objectId, role: "preserve" as const })), { objectId: referenceId, role: "preserve" }],
  } } };
}

export function loftPrompt(f: LoftFixture, grounding = true, compact = false) {
  const graph = buildDependencyGraph(f.document), incoming = graph.edges.filter(e => e.to === dependencyNodeId("object", f.loftId));
  if (compact) return `Inspect selected existing loft ${f.loftId} with cad.inspect. Change its current ruled straight-section spans to the existing smooth interpolation mode.
Preserve the exact circular source definitions ${f.sectionIds.join(",")}, their elevations/order/end sections and live dependencies. Preserve the same object ID, world pose, finish and unrelated ${f.referenceId}. Do not replace the object, deform sections or substitute a scalar dimension edit. Propose only a currently advertised editor; otherwise explain the catalog limitation. No Apply. Do not certify G1/G2, flow, strength, material or manufacturing suitability.
${grounding ? JSON.stringify({ source: "buildDependencyGraph", document: { id: f.document.id, revision: f.document.revision }, sources: f.sectionIds, incomingCount: incoming.length, allLive: incoming.length === 3 && incoming.every(e => e.relation === "live-input") }) : ""}`;
  return `선택된 기존 로프트 ${f.loftId}를 cad.inspect로 먼저 조회해. 현재 세 단면 사이를 직선으로 연결한 상태를 기존 로프트의 부드러운 보간 연결로 바꿔줘.
설계 의도: 원본 원형 단면 ${f.sectionIds.join(", ")}의 모양·고도·순서와 live 관계를 모두 보존해. 끝의 원형 단면도 그대로 유지해. 기존 객체 ID, 월드 배치, 마감, 보호 부품 ${f.referenceId}를 보존해. 새 형상으로 대체하거나 원본 단면을 변형하지 마. 치수 하나를 조절하는 것으로 대신하지 마.
지원되는 기존 편집 명령이 있을 때만 제안하고, 현재 제공된 도구에 없으면 해당 제한을 명시해. 검증 전 성공이나 G1/G2 연속성·유동/강도 성능을 보장하지 마. 승인 전 Apply 금지.
${grounding ? JSON.stringify({ source: "Existing buildDependencyGraph", document: { id: f.document.id, revision: f.document.revision }, incoming, note: "Stored dependency evidence, not a command or an already validated result" }) : ""}`;
}
export function loftRouteAudit(f: LoftFixture) {
  const request=copilotRequest(loftPrompt(f),f.document,[f.loftId],"XY");
  const scope = taskToolScope(request.prompt,request.solid,request.context);
  return { source: "Existing taskToolScope / actual server-owned ordinary catalog", kind: scope.kind, advertisedTools: scope.names,
    nativeRegisteredTool: "solid.loft.update", advertised: scope.names.includes("solid.loft.update"), auditIsReadOnly: true };
}
export async function loftControl(f: LoftFixture) {
  return createCadToolSession(context(f.document, [f.loftId])).plan([{ id: "control-edit", name: "solid.loft.update", arguments: { objectId: f.loftId, ruled: false } }]);
}
export async function assessLoft(f: LoftFixture, candidate: CadDocument, signal?: AbortSignal): Promise<Assessment> {
  const criteria: Criterion[] = [], metrics: Assessment["metrics"] = {}, measurements: Record<string, GeometryMeasurement> = {};
  const check = (id: string, ok: boolean, source: string, actual?: unknown, expected?: unknown) => criteria.push({ id, status: ok ? "pass" : "fail", source, actual, expected });
  const old = feature(f.document, f.loftId), next = feature(candidate, f.loftId);
  check("document-identity", candidate.id === f.document.id && candidate.revision >= f.document.revision, "native-document");
  check("smooth-existing-live-loft", next?.type === "loft" && next.params.ruled === false && next.dependencyMode === "live", "native-feature-contract");
  check("ordered-source-sections", same(next?.inputs, f.sectionIds) && same(next?.params.profiles, old?.params.profiles), "native-feature-inputs-and-exact-profiles");
  // Only the declared interpolation flag and its derived bounds may differ.
  const preserved = (d: CadDocument) => {
    const { revision: _, ...rest } = structuredClone(d);
    const target = feature(rest as CadDocument, f.loftId);
    if (target) { delete target.params.ruled; delete target.params.bounds; }
    return rest;
  };
  check("all-other-document-state-preserved", same(preserved(f.document), preserved(candidate)), "exact-native-state-excluding-only-ruled-and-derived-bounds");
  const graph = buildDependencyGraph(candidate), incoming = graph.edges.filter(e => e.to === dependencyNodeId("object", f.loftId));
  check("three-live-section-relations", incoming.length === 3 && incoming.every(e => e.relation === "live-input") && f.sectionIds.every(id => incoming.some(e => e.from === dependencyNodeId("object", id))), "buildDependencyGraph");
  for (const id of [f.loftId, f.referenceId]) {
    signal?.throwIfAborted();
    try { measurements[id] = await measureDocumentObject(candidate, id); check(`valid-brep:${id}`, measurements[id].validity === "valid", "OpenCascade", measurements[id].validity, "valid"); }
    catch (e) { criteria.push({ id: `valid-brep:${id}`, status: "unknown", source: "OpenCascade", reason: e instanceof Error ? e.message : String(e) }); }
  }
  try {
    const baseline = await measureDocumentObject(f.document, f.loftId), volume = measurements[f.loftId]?.volume;
    if (volume !== undefined && baseline.volume !== undefined) {
      metrics.beforeVolumeMm3 = baseline.volume; metrics.afterVolumeMm3 = volume; metrics.absoluteVolumeChangeMm3 = Math.abs(volume - baseline.volume);
      check("actual-geometric-change", Number(metrics.absoluteVolumeChangeMm3) > 100, "OpenCascade-before-after-not-a-curvature-certificate", metrics.absoluteVolumeChangeMm3, ">100 mm³ for this fixture");
    } else criteria.push({ id: "actual-geometric-change", status: "unknown", source: "OpenCascade-volume", reason: "Missing measurement" });
  } catch (e) { criteria.push({ id: "actual-geometric-change", status: "unknown", source: "OpenCascade-volume", reason: e instanceof Error ? e.message : String(e) }); }
  try { const d = deserializeDocument(serializeDocument(candidate)); check("serialization", same(JSON.parse(serializeDocument(d)), JSON.parse(serializeDocument(candidate))), "native-serialization-roundtrip"); }
  catch (e) { criteria.push({ id: "serialization", status: "fail", source: "native-serialization", reason: e instanceof Error ? e.message : String(e) }); }
  const success = criteria.every(c => c.status === "pass");
  return { status: success ? "passed-native-preview" : criteria.some(c => c.status === "unknown") ? "incomplete" : "rejected", success, criteria, metrics, measurements };
}
export function runLoftEvaluation(f: LoftFixture, options: EvaluationOptions & { compactRequest?: boolean }) {
  return runCadEvaluation({ id: LOFT_TASK.id, document: f.document, targetId: f.loftId, prompt: loftPrompt(f, options.grounding !== false, options.compactRequest), excluded: LOFT_TASK.excluded,
    assess: (candidate, signal) => assessLoft(f, candidate, signal) }, options);
}
