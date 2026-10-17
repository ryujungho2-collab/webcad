import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { deserializeDocument, serializeDocument } from "@agent-webcad/cad-document";
import type { CadCommand, ContourReferenceRoute } from "@agent-webcad/cad-commands";
import { cadDocument } from "../../src/state/cadDocument";
import { dispatchCadCommand } from "../../src/state/dispatchCadCommand";
import { previewCadCommand, applyCadPlan, discardCadPlan } from "../../src/state/documentPlans";
import { cadHistory, undoDocument, redoDocument } from "../../src/state/history";
import { assertConstructionEvaluation } from "../../src/precision/constructionGeometry";
import { resolveParameterBindings } from "@agent-webcad/cad-document";
import { resetTestDocument, documentState } from "../helpers/documentHarness";
beforeEach(resetTestDocument);
const feature = (id: string) => Object.values(cadDocument.features).find(f => f.output === id)!;
const near = (a: number, b: number, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance, `${a} ??${b}`);
async function apply(command: CadCommand) { const r = await dispatchCadCommand(command); assert.ok(r.ok, r.reason); return r; }
async function reject(command: CadCommand, reason: RegExp) {
  const before = JSON.stringify(cadDocument), h = cadHistory.getPastLabels();
  const r = await dispatchCadCommand(command);
  assert.equal(r.ok, false); assert.match(r.reason!, reason);
  assert.equal(JSON.stringify(cadDocument), before); assert.deepEqual(cadHistory.getPastLabels(), h);
}
const bindingId = () => Object.keys(cadDocument.parameterBindings ?? {})[0];
const bindingIdFor = (objectId: string) => Object.entries(cadDocument.parameterBindings ?? {}).find(([, b]) => b.target.kind === "feature" && b.target.objectId === objectId)![0];
const bindingRoute = (sourceId: string, extra: Partial<ContourReferenceRoute> = {}): ContourReferenceRoute => ({ dependentId: bindingId(), sourceId, resultIndices: [0], ...extra });
async function radiusDrivenArc(id = "source") {
  await apply({ type: "create-drawing", id, drawing: "arc", params: { workPlane: "XY", center: [0, 0, 0], radius: 3, startAngle: 0, endAngle: Math.PI } });
  await apply({ type: "set-variable", name: "d", quantity: "length", expression: "5mm" });
  await apply({ type: "set-parameter-binding", target: { kind: "feature", objectId: id, parameter: "radius" }, expression: "d * 2" });
  near(Number(feature(id).params.radius), 10);
}
function roundtrip(before: ReturnType<typeof documentState>) {
  const after = documentState();
  assert.ok(undoDocument()); assert.deepEqual(documentState(), before);
  assert.ok(redoDocument()); assert.deepEqual(documentState(), after);
  const loaded = deserializeDocument(serializeDocument(cadDocument));
  assert.deepEqual(loaded, cadDocument); assertConstructionEvaluation(loaded);
}

test("broken arc keeps its driven radius on the reviewed piece", async () => {
  await radiusDrivenArc();
  const before = documentState(), h = cadHistory.getPastLabels().length;
  const planned = await previewCadCommand({ type: "break-drawing", objectId: "source", firstPoint: [0, 10, 0], referenceRoutes: [] });
  assert.equal(planned.result.ok, false); assert.match(planned.result.reason!, /Reconnect every/);
  discardCadPlan(planned.planId);
  const r = await apply({ type: "break-drawing", objectId: "source", firstPoint: [0, 10, 0], referenceRoutes: [bindingRoute("source")] });
  assert.equal(r.createdIds.length, 2);
  const arc = r.createdIds[0];
  assert.equal(feature(arc).params.kind, "arc");
  assert.deepEqual((cadDocument.parameterBindings![bindingId()].target as { objectId: string }).objectId, arc);
  near(Number(feature(arc).params.radius), 10);
  assert.equal(resolveParameterBindings(cadDocument).length, 1);
  assert.equal(cadHistory.getPastLabels().length, h + 1);
  roundtrip(before);
});

test("changed parameter meanings need explicit reassignment", async () => {
  await apply({ type: "create-drawing", id: "loop", drawing: "circle", params: { workPlane: "XY", center: [0, 0, 0], radius: 3 } });
  await apply({ type: "set-variable", name: "d", quantity: "length", expression: "5mm" });
  await apply({ type: "set-parameter-binding", target: { kind: "feature", objectId: "loop", parameter: "radius" }, expression: "d * 2" });
  await reject({ type: "break-drawing", objectId: "loop", firstPoint: [10, 0, 0], secondPoint: [0, 10, 0], referenceRoutes: [{ dependentId: bindingId(), sourceId: "loop", resultIndices: [0] }] }, /no longer provides/);
  await apply({ type: "create-drawing", id: "arc", drawing: "arc", params: { workPlane: "XY", center: [0, 0, 0], radius: 10, startAngle: 0, endAngle: Math.PI / 2 } });
  await apply({ type: "set-parameter-binding", target: { kind: "feature", objectId: "arc", parameter: "radius" }, expression: "d * 2" });
  await reject({ type: "convert-contour-edge", objectId: "arc", segmentIndex: 0, target: "line", referenceRoutes: [{ dependentId: bindingIdFor("arc"), sourceId: "arc", resultIndices: [0] }] }, /no longer provides/);
  await apply({ type: "create-drawing", id: "tail", drawing: "line", params: { workPlane: "XY", points: [[10, 0, 0], [20, 0, 0]] } });
  await reject({ type: "join-drawings", objectIds: ["arc", "tail"], id: "joined", referenceRoutes: [{ dependentId: bindingIdFor("arc"), sourceId: "arc", resultIndices: [0] }] }, /no longer provides/);
});

test("trimmed arcs take one reviewed piece; split mappings fail atomically", async () => {
  await apply({ type: "create-drawing", id: "arc", drawing: "arc", params: { workPlane: "XY", center: [0, 0, 0], radius: 10, startAngle: 0, endAngle: Math.PI } });
  await apply({ type: "create-drawing", id: "cut", drawing: "line", params: { workPlane: "XY", points: [[-20, 5, 0], [20, 5, 0]] } });
  await apply({ type: "set-variable", name: "d", quantity: "length", expression: "5mm" });
  await apply({ type: "set-parameter-binding", target: { kind: "feature", objectId: "arc", parameter: "radius" }, expression: "d * 2" });
  await reject({ type: "trim-contour", objectId: "arc", cutterIds: ["cut"], pickPoint: [0, 10, 0], referenceRoutes: [{ dependentId: bindingId(), sourceId: "arc", resultIndices: [0, 1] }] }, /exactly one result/);
  await reject({ type: "trim-contour", objectId: "arc", cutterIds: ["cut"], pickPoint: [0, 10, 0], referenceRoutes: [{ dependentId: bindingId(), sourceId: "arc", resultIndices: [0], segmentIndex: 0 }] }, /exactly one result/);
  const before = documentState();
  const r = await apply({ type: "trim-contour", objectId: "arc", cutterIds: ["cut"], pickPoint: [0, 10, 0], referenceRoutes: [{ dependentId: bindingId(), sourceId: "arc", resultIndices: [0] }] });
  assert.deepEqual((cadDocument.parameterBindings![bindingId()].target as { objectId: string }).objectId, r.createdIds[0]);
  near(Number(feature(r.createdIds[0]).params.radius), 10);
  roundtrip(before);
});

test("sketch-constraint bindings survive contour replacement without routes", async () => {
  await apply({ type: "create-sketch", id: "sketch", workPlane: "XY" });
  await apply({ type: "add-sketch-geometry", sketchId: "sketch", geometry: { id: "source", kind: "rectangle", origin: [0, 0], width: 100, height: 60, cornerIds: ["a", "b", "c", "d"], edgeIds: ["ab", "bc", "cd", "da"] } });
  await apply({ type: "add-sketch-constraint", sketchId: "sketch", constraint: { id: "width", kind: "distance", first: { geometryId: "source", pointId: "a" }, second: { geometryId: "source", pointId: "b" }, value: 100 } as never });
  await apply({ type: "set-variable", name: "w", quantity: "length", expression: "120mm" });
  await apply({ type: "set-parameter-binding", target: { kind: "sketch-constraint", sketchId: "sketch", constraintId: "width" }, expression: "w" });
  const before = documentState();
  await apply({ type: "edit-polyline", objectId: "source", operation: "open", referenceRoutes: [
    { dependentId: `sketch-reference:${JSON.stringify(["sketch", "width", "first"])}`, sourceId: "source", resultIndices: [0], pointIndex: 0 },
    { dependentId: `sketch-reference:${JSON.stringify(["sketch", "width", "second"])}`, sourceId: "source", resultIndices: [0], pointIndex: 1 },
  ] });
  const resolved = resolveParameterBindings(cadDocument);
  assert.equal(resolved.length, 1);
  assert.equal((cadDocument.sketches!.sketch.constraints.find(c => c.id === "width") as { value: number }).value, 120);
  roundtrip(before);
});
