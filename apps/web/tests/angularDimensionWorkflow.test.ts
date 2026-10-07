import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import type { AngularDimensionDefinition } from "@agent-webcad/cad-document";
import { validateCommand, type CadCommand } from "@agent-webcad/cad-commands";
import { cadDocument } from "../src/state/cadDocument";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { previewCadCommand, applyCadPlan, discardCadPlan } from "../src/state/documentPlans";
import { cadHistory, undoDocument, redoDocument } from "../src/state/history";
import { resolveDimension } from "../src/precision/dimensionGeometry";
import type { DrawingTopology } from "../src/precision/drawingTopology";
import { documentState, resetTestDocument } from "./helpers/documentHarness";

beforeEach(resetTestDocument);
const feature = (id: string) => Object.values(cadDocument.features).find(f => f.output === id)!;
const topology = (id: string) => feature(id).params.topology as DrawingTopology;
const reference = (objectId: string, edge = 0) => ({ objectId, segmentId: topology(objectId).segments[edge].id });
async function apply(command: CadCommand) { const r = await dispatchCadCommand(command); assert.ok(r.ok, r.reason); return r; }
async function sources() {
  await apply({ type: "create-drawing", id: "a", drawing: "line", params: { workPlane: "XY", points: [[0,0,0],[40,0,0]] } });
  await apply({ type: "create-drawing", id: "b", drawing: "line", params: { workPlane: "XY", points: [[0,0,0],[0,30,0]] } });
}
const definition = (): AngularDimensionDefinition => ({ first: reference("a"), second: reference("b"), branch: { firstRay: 1, secondRay: 1, sweep: "ccw" }, radius: 10 });
const create = (): CadCommand => ({ type: "create-dimension", id: "angle", dimension: "angular", params: definition() });
const angle = () => resolveDimension(feature("angle").params)!;
async function rejected(command: CadCommand, reason: RegExp) {
  const before = structuredClone(cadDocument), history = cadHistory.getPastLabels();
  const r = await dispatchCadCommand(command); assert.equal(r.ok, false); assert.match(r.reason ?? "", reason);
  assert.deepEqual(cadDocument, before); assert.deepEqual(cadHistory.getPastLabels(), history);
}

test("Two-edge detached angular preview, apply and source refresh share one history transaction", async () => {
  await sources(); const before = structuredClone(cadDocument), h = cadHistory.getPastLabels().length;
  const preview = await previewCadCommand(create()); assert.ok(preview.result.ok, preview.result.reason); assert.deepEqual(cadDocument, before);
  assert.ok((await applyCadPlan(preview.planId)).ok); discardCadPlan(preview.planId);
  assert.equal(cadHistory.getPastLabels().length, h + 1); assert.deepEqual(feature("angle").inputs, ["a", "b"]);
  assert.equal(angle().unit, "rad"); assert.equal(angle().value, Math.PI / 2); assert.equal(angle().text, "90.00°");
  const initial = documentState();
  await apply({ type: "edit-drawing-control", objectId: "b", controlId: topology("b").controls[1].id, point: [30,30,0] });
  assert.equal(angle().value, Math.PI / 4); assert.equal(angle().text, "45.00°");
  assert.deepEqual(feature("angle").params.second, definition().second);
  const changed = documentState(); assert.ok(undoDocument()); assert.deepEqual(documentState(), initial); assert.ok(redoDocument()); assert.deepEqual(documentState(), changed);
});

test("Angular source deletion, parallel/out-of-plane changes and generic annotation transforms are atomic failures", async () => {
  await sources(); await apply(create());
  await rejected({ type: "delete-object", objectId: "b" }, /source is missing/i);
  await rejected({ type: "edit-drawing-control", objectId: "b", controlId: topology("b").controls[1].id, point: [30,0,0] }, /coincident|parallel/i);
  await rejected({ type: "move-object", objectId: "b", translation: [0,0,5] }, /coplanar|plane/i);
  await rejected({ type: "move-object", objectId: "angle", translation: [1,0,0] }, /radius and angle region/i);
});

test("Angular branch, placement and text edits preserve the two references; locked annotation blocks source changes", async () => {
  await sources(); await apply(create());
  await apply({ type: "update-dimension", objectId: "angle", params: { radius: 15, branch: { firstRay: 1, secondRay: 1, sweep: "cw" }, text: "" } });
  assert.equal(angle().text, "270.00°"); assert.equal(angle().value, 3 * Math.PI / 2);
  assert.deepEqual(feature("angle").inputs, ["a", "b"]);
  await apply({ type: "create-layer", id: "annotations", name: "Annotations" });
  await apply({ type: "move-object-to-layer", objectId: "angle", layerId: "annotations" });
  await apply({ type: "set-layer-locked", layerId: "annotations", locked: true });
  await rejected({ type: "edit-drawing-control", objectId: "b", controlId: topology("b").controls[1].id, point: [30,30,0] }, /unlock/i);
  await apply({ type: "rename-object", objectId: "a", name: "Horizontal" });
  assert.equal(angle().text, "270.00°");
});

test("Distinct straight edges on one polyline are allowed; curved, missing and duplicate references are refused", async () => {
  await apply({ type: "create-drawing", id: "a", drawing: "polyline", params: { workPlane: "XY", points: [[0,0,0],[20,0,0],[20,20,0]], closed: false } });
  const params: AngularDimensionDefinition = { first: reference("a"), second: reference("a",1), radius: 8, branch: { firstRay: 1, secondRay: 1, sweep: "ccw" } };
  await apply({ type: "create-dimension", id: "angle", dimension: "angular", params });
  assert.equal(angle().value, Math.PI / 2); assert.deepEqual(feature("angle").inputs, ["a"]);
  assert.equal(validateCommand({ type: "create-dimension", dimension: "angular", params: { ...params, second: params.first } }), false);
  await rejected({ type: "update-dimension", objectId: "angle", params: { second: { objectId: "a", segmentId: "missing" } } }, /referenced edge/i);
  await apply({ type: "create-drawing", id: "curve", drawing: "polyline", params: { workPlane: "XY", points: [[0,0,0],[20,20,0]], bulges: [1] } });
  await rejected({ type: "update-dimension", objectId: "angle", params: { second: reference("curve") } }, /straight/i);
});
