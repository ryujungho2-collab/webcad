import { deserializeDocument, serializeDocument, type CadDocument, type GeometryMeasurement } from "@agent-webcad/cad-document";
import { mountingPlatePlan } from "../src/copilot/mountingPlate";
import { copilotSolidContract, solidParameterPlan } from "../src/copilot/copilotSolid";
import { type DesignStudy, designPreservationIssue } from "../src/copilot/designStudy";
import { prepareCadCommand } from "../src/state/dispatchCadCommand";
import { measureDocumentObject } from "../src/state/documentQuery";
import { queryProfileExtrudeRelations } from "../src/state/profileExtrudeRelations";
import { getObjectTransform } from "../src/precision/objectTransform";
import { getWorldDrawingGeometry } from "../src/precision/worldGeometry";
import { getCapability } from "../src/ontology/capabilities";
import { runCadEvaluation, type Assessment, type Criterion, type EvaluationOptions } from "./cadDesignEvaluation";

export const PLATE_TASK = {
  id: "CAD-EVAL-02-mounting-margin-intent-v1", dataClass: "synthetic", units: "mm", mode: "existing-design-redesign",
  objective: "Widen the existing four-hole mounting plate by 40 mm while retaining its left datum and edge-relative mounting intent",
  constraints: { widthIncrease: 40, depth: 80, thickness: 4, holeCount: 4, holeDiameter: 6, centerMargin: 12, referenceZClearance: 2, obstacleXClearanceMin: 25 },
  budgets: { modelCalls: 6, replans: 2, elapsedMs: 180000 },
  excluded: ["autonomous whole-assembly creation", "stress/load/fastener certification", "automatic editor Apply", "model training"],
} as const;
export type PlateFixture = { document: CadDocument; plateId: string; referenceId: string; obstacleId: string; study: DesignStudy };
const feature = (d: CadDocument, id: string) => Object.values(d.features).find(f => f.output === id);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const near = (a: number, b: number, tolerance = .001) => Number.isFinite(a) && Math.abs(a - b) <= tolerance;
const holeGeometry = (d: CadDocument, id: string) => (feature(d, id)?.inputs ?? []).flatMap(input => {
  const f = feature(d, input), o = d.objects[input], g = o && f && getWorldDrawingGeometry(o, f);
  return g?.kind === "circle" && g.center && g.radius !== undefined ? [{ id: input, center: g.center, radius: g.radius }] : [];
});

export async function buildPlateFixture(signal?: AbortSignal): Promise<PlateFixture> {
  const empty: CadDocument = { id: "cad-eval-02-synthetic", revision: 0, objects: {}, features: {}, sketches: {}, rootObjects: [], rootLayers: ["layer-default"],
    layers: { "layer-default": { id: "layer-default", name: "Default", visible: true, locked: false, objectIds: [] } } };
  const plan = mountingPlatePlan({ width: 120, depth: 80, thickness: 4, margin: 12, holeDiameter: 6 });
  const plate = await prepareCadCommand(empty, plan.command, { signal });
  if (!plate.result.ok) throw Error(`Plate fixture failed: ${plate.result.reason}`);
  const plateId = plan.resultObjectIds![0], referenceId = "protected-device-envelope", obstacleId = "protected-neighbor";
  const setup = await prepareCadCommand(plate.proposed, { type: "batch", label: "Synthetic mount evaluation fixture", commands: [
    { type: "move-object", objectId: plateId, translation: [0, 0, 8] },
    { type: "rename-object", objectId: plateId, name: "Four-hole mounting plate" },
    { type: "create-primitive", id: referenceId, primitive: "box", params: { width: 40, depth: 30, height: 6 }, position: [40, 25, 14] },
    { type: "create-primitive", id: obstacleId, primitive: "box", params: { width: 20, depth: 80, height: 4 }, position: [190, 0, 8] },
  ] }, { signal });
  if (!setup.result.ok) throw Error(`Plate fixture placement failed: ${setup.result.reason}`);
  return { document: setup.proposed, plateId, referenceId, obstacleId, study: { version: 1, documentId: empty.id, intentConfirmed: true, decisions: [], brief: {
    goal: "Increase available mounting width while preserving edge-relative fastener layout.",
    requirements: "Widen by 40 mm from current width; retain left datum, depth 80 mm, thickness 4 mm, four Ø6 holes with centers 12 mm from their adjacent edges. Keep hole symmetry about the NEW plate center. Protect device/neighbor geometry and placement, >=2 mm device Z separation, >=25 mm neighbor X separation.",
    assumptions: "Evaluator-authored synthetic geometric design intent; reference boxes are not physical electronics or load models.", questions: "Loads, material, fasteners and manufacturing tolerances unspecified.", qualities: [],
    anchors: [{ objectId: referenceId, role: "preserve" }, { objectId: obstacleId, role: "preserve" }, { objectId: plateId, role: "reference" }],
  } } };
}

export function platePrompt(f: PlateFixture, grounding = true) {
  const relations = queryProfileExtrudeRelations(f.document, f.plateId);
  return `선택한 4홀 장착판의 현재 치수를 cad.inspect로 조회하고, 더 넓은 장치를 위한 폭을 현재보다 40 mm 늘려줘. 지원되는 solid.parameter 한 개로만 제안해.
설계 의도: 왼쪽 기준면과 월드 배치는 그대로, 깊이 80 mm·두께 4 mm·구멍 4개·구멍 지름 6 mm를 유지해. 각 구멍 중심은 인접한 두 가장자리에서 계속 12 mm 떨어져야 하며, 넓어진 판의 새 중심을 기준으로 좌우/상하 대칭이어야 해. 오른쪽 두 구멍은 오른쪽 가장자리를 따라가야 하므로 모든 구멍의 월드 좌표를 고정하지 마.
보호 대상 ${f.referenceId} 및 ${f.obstacleId}의 형상·배치와 모든 원본을 보존해. 장치 하단과 판 상단의 Z 간격은 최소 2 mm, 이웃 부품 왼쪽과 판 오른쪽의 X 간격은 최소 25 mm. 선택 객체 ${f.plateId}의 ID와 live 프로파일 참조를 유지해. 구멍 지름이나 여백을 바꾸는 것으로 폭 증가를 대신하지 마. 하중·재료·체결 규격은 미정이며 인증했다고 말하지 마. 승인 전 Apply 금지.
${grounding ? JSON.stringify({ evidence: "Native capability/dependency records", capability: getCapability("driving-dimension-edit")?.mcpTools, document: relations.document,
    relationCount: relations.relations.length, allLiveResolved: relations.relations.length === 5 && relations.relations.every(r => r.mode === "live" && r.status === "resolved") }) : ""}`;
}

export async function assessPlate(f: PlateFixture, candidate: CadDocument, signal?: AbortSignal): Promise<Assessment> {
  const criteria: Criterion[] = [], metrics: Assessment["metrics"] = {}, measurements: Record<string, GeometryMeasurement> = {}, before = f.document;
  const check = (id: string, ok: boolean, source: string, actual?: unknown, expected?: unknown) => criteria.push({ id, status: ok ? "pass" : "fail", source, actual, expected });
  const old = copilotSolidContract(before, [f.plateId]), next = copilotSolidContract(candidate, [f.plateId]);
  const oldSpec = old.plate, spec = next.plate, targetWidth = (oldSpec?.width ?? NaN) + 40;
  check("document-identity", before.id === candidate.id && candidate.revision >= before.revision, "native-document");
  check("same-object-feature-identities", same(Object.keys(before.objects).sort(), Object.keys(candidate.objects).sort()) && same(Object.keys(before.features).sort(), Object.keys(candidate.features).sort()), "native-document");
  check("protected-anchors", !designPreservationIssue(before, candidate, f.study.brief), "designPreservationIssue");
  const changed = [...new Set([...Object.keys(before.variables ?? {}), ...Object.keys(candidate.variables ?? {})])].filter(id => !same(before.variables?.[id], candidate.variables?.[id]));
  check("width-driver-only", changed.length === 1 && changed[0] === old.plateVariables?.width, "native-binding-contract", changed);
  const oldFeature = feature(before, f.plateId), nextFeature = feature(candidate, f.plateId), allowedOutputs = new Set([f.plateId, ...(oldFeature?.inputs ?? [])]);
  const sketchIds = new Set([...allowedOutputs].map(id => feature(before, id)?.params.sketchId).filter((id): id is string => typeof id === "string"));
  const protectedState = (d: CadDocument) => ({ objects: d.objects, roots: d.rootObjects, layers: d.layers, rootLayers: d.rootLayers,
    features: Object.fromEntries(Object.entries(d.features).filter(([, feature]) => !allowedOutputs.has(feature.output))),
    sketches: Object.fromEntries(Object.entries(d.sketches ?? {}).filter(([id]) => !sketchIds.has(id))),
    variables: Object.fromEntries(Object.entries(d.variables ?? {}).filter(([id]) => id !== old.plateVariables?.width)), bindings: d.parameterBindings,
    assembly: d.assembly, workPlanes: d.workPlanes, interferenceIntents: d.interferenceIntents });
  check("protected-scene-and-bindings", same(protectedState(before), protectedState(candidate)), "exact-native-document-comparison");
  check("width-increase", !!spec && near(spec.width, targetWidth), "evaluated-driving-variables", spec?.width, targetWidth);
  check("retain-depth-thickness-margin-diameter", !!spec && !!oldSpec && ["depth", "thickness", "margin", "holeDiameter"].every(key => near(spec[key as keyof typeof spec], oldSpec[key as keyof typeof oldSpec], 1e-6)), "evaluated-driving-variables", spec);
  const holes = holeGeometry(candidate, f.plateId), oldHoles = holeGeometry(before, f.plateId);
  check("four-original-holes", holes.length === 4 && oldHoles.length === 4 && holes.every((h, i) => h.id === oldHoles[i].id), "actual-source-profiles", holes.length, 4);
  const centers = [[12, 12], [targetWidth - 12, 12], [12, 68], [targetWidth - 12, 68]];
  check("edge-relative-hole-centers", holes.length === 4 && holes.every((h, i) => near(h.center[0], centers[i][0]) && near(h.center[1], centers[i][1]) && near(h.radius, 3, 1e-6)), "getWorldDrawingGeometry", holes.map(h => ({ center: h.center, diameter: 2 * h.radius })), centers);
  check("hole-symmetry", holes.length === 4 && near(holes[0].center[0] + holes[1].center[0], targetWidth) && near(holes[2].center[0] + holes[3].center[0], targetWidth) && near(holes[0].center[1] + holes[2].center[1], 80) && near(holes[1].center[1] + holes[3].center[1], 80), "actual-hole-centers");
  const relations = queryProfileExtrudeRelations(candidate, f.plateId);
  check("live-profile-references", nextFeature?.type === "extrude" && same(nextFeature.inputs, oldFeature?.inputs) && relations.relations.length === 5 && relations.relations.every(r => r.mode === "live" && r.status === "resolved"), "queryProfileExtrudeRelations");
  check("placement-preserved", !!candidate.objects[f.plateId] && same(getObjectTransform(candidate.objects[f.plateId], nextFeature), getObjectTransform(before.objects[f.plateId], oldFeature)), "native-object-transform");
  for (const id of [f.plateId, f.referenceId, f.obstacleId]) {
    signal?.throwIfAborted();
    try { measurements[id] = await measureDocumentObject(candidate, id); check(`valid-brep:${id}`, measurements[id].validity === "valid", "OpenCascade", measurements[id].validity, "valid"); }
    catch (e) { criteria.push({ id: `valid-brep:${id}`, status: "unknown", source: "OpenCascade", reason: e instanceof Error ? e.message : String(e) }); }
  }
  const plate = measurements[f.plateId], reference = measurements[f.referenceId], obstacle = measurements[f.obstacleId];
  if (plate?.bounds && reference?.bounds && obstacle?.bounds) {
    metrics.measuredWidthMm = plate.bounds.max[0] - plate.bounds.min[0]; metrics.deviceZClearanceMm = reference.bounds.min[2] - plate.bounds.max[2]; metrics.neighborXClearanceMm = obstacle.bounds.min[0] - plate.bounds.max[0];
    check("native-plate-envelope", [0, 0, 8].every((n, i) => near(plate.bounds!.min[i], n)) && [targetWidth, 80, 12].every((n, i) => near(plate.bounds!.max[i], n)), "OpenCascade-world-bounds", plate.bounds);
    check("device-Z-separation", Number(metrics.deviceZClearanceMm) >= 2 - .001, "world-Z-bounds-separation-not-general-distance", metrics.deviceZClearanceMm, ">=2 mm");
    check("neighbor-X-separation", Number(metrics.neighborXClearanceMm) >= 25 - .001, "world-X-bounds-separation-not-general-distance", metrics.neighborXClearanceMm, ">=25 mm");
  } else criteria.push({ id: "clearance", status: "unknown", source: "OpenCascade-bounds", reason: "Missing measured bounds" });
  const expectedVolume = (targetWidth * 80 - 4 * Math.PI * 3 ** 2) * 4;
  metrics.expectedVolumeMm3 = expectedVolume; if (plate?.volume !== undefined) metrics.nativeVolumeMm3 = plate.volume;
  check("native-volume", plate?.volume !== undefined && near(plate.volume, expectedVolume, .02), "OpenCascade-vs-independent-four-hole-volume", plate?.volume, expectedVolume);
  try { const roundtrip = deserializeDocument(serializeDocument(candidate)); check("serialization", same(JSON.parse(serializeDocument(roundtrip)), JSON.parse(serializeDocument(candidate))), "native-serialization-roundtrip"); }
  catch (e) { criteria.push({ id: "serialization", status: "fail", source: "native-serialization", reason: e instanceof Error ? e.message : String(e) }); }
  const success = criteria.every(c => c.status === "pass");
  return { status: success ? "passed-native-preview" : criteria.some(c => c.status === "unknown") ? "incomplete" : "rejected", success, criteria, metrics, measurements };
}

export function plateControl(f: PlateFixture) {
  const contract = copilotSolidContract(f.document, [f.plateId]);
  if (!contract.plate || !contract.plateVariables) throw Error("Fixture plate driver unavailable");
  return solidParameterPlan(contract, contract.plateVariables.width, contract.plate.width + 40);
}
export function runPlateEvaluation(f: PlateFixture, options: EvaluationOptions) {
  return runCadEvaluation({ id: PLATE_TASK.id, document: f.document, targetId: f.plateId, prompt: platePrompt(f, options.grounding !== false), excluded: PLATE_TASK.excluded,
    assess: (candidate, signal) => assessPlate(f, candidate, signal), feedback: (_candidate, assessment) => ({ source: "Native candidate verification", metrics: assessment.metrics }) }, options);
}
