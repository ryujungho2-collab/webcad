import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { deserializeDocument, serializeDocument, type AngularDimensionDefinition } from "@agent-webcad/cad-document";
import { validateCommand, type CadCommand } from "@agent-webcad/cad-commands";
import { cadDocument } from "../src/state/cadDocument";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { previewCadCommand, applyCadPlan, discardCadPlan } from "../src/state/documentPlans";
import { cadHistory, undoDocument, redoDocument } from "../src/state/history";
import { resolveDimension } from "../src/precision/dimensionGeometry";
import type { DrawingTopology } from "../src/precision/drawingTopology";
import { documentState, resetTestDocument } from "./helpers/documentHarness";
import { contourReferenceRequirements } from "../src/features/drawing-editing/commands/contourReferences";
import { assertAngularEvaluation } from "../src/precision/angularDimensionSource";
import { refreshAssociativeDimensions } from "../src/state/dimensionRefresh";
import { openDocumentFile } from "../src/state/documentFile";

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

test("Join reverses a reference ray, then Trim routes both slots of the same source without changing its angle region", async () => {
  await sources(); await apply(create());
  const before = documentState();
  await rejected({ type: "join-drawings", objectIds: ["a","b"], id: "joined", referenceRoutes: [] }, /reconnect every/i);
  await apply({ type: "join-drawings", objectIds: ["a","b"], id: "joined", referenceRoutes: [
    { dependentId: "angle", sourceId: "a", referenceSlot: "first", resultIndices: [0], segmentIndex: 0 },
    { dependentId: "angle", sourceId: "b", referenceSlot: "second", resultIndices: [0], segmentIndex: 1 },
  ] });
  assert.equal(angle().value, Math.PI / 2); assert.equal((feature("angle").params.branch as any).firstRay, -1);
  assert.deepEqual(feature("angle").inputs, ["joined"]);
  const joined = documentState(); assert.ok(undoDocument()); assert.deepEqual(documentState(), before); assert.ok(redoDocument()); assert.deepEqual(documentState(), joined);
  const requirements = contourReferenceRequirements(cadDocument, ["joined"]);
  assert.deepEqual(requirements.map(r => "referenceSlot" in r && r.referenceSlot), ["first","second"]);
  await apply({ type: "create-drawing", id: "cutter", drawing: "line", params: { workPlane: "XY", points: [[20,-10,0],[20,10,0]] } });
  const trim: Extract<CadCommand,{type:"trim-contour"}> = { type: "trim-contour", objectId: "joined", cutterIds: ["cutter"], pickPoint: [30,0,0], referenceRoutes: [
    { dependentId: "angle", sourceId: "joined", referenceSlot: "first", resultIndices: [0], segmentIndex: 0 },
    { dependentId: "angle", sourceId: "joined", referenceSlot: "second", resultIndices: [0], segmentIndex: 1 },
  ] };
  await rejected({ ...trim, referenceRoutes: trim.referenceRoutes!.slice(0,1) }, /reconnect every/i);
  await rejected({ ...trim, referenceRoutes: trim.referenceRoutes!.map(r=>({...r,segmentIndex:0})) }, /direction|distinct/i);
  await apply(trim); assert.equal(angle().value, Math.PI / 2);
  const saved = serializeDocument(cadDocument); assert.equal(JSON.parse(saved).version, 14);
  const restored = deserializeDocument(saved); assertAngularEvaluation(restored); assert.equal(refreshAssociativeDimensions(restored), false); assert.deepEqual(restored, cadDocument);
});

test("Angular v14 verifies both inputs and topology; file load rejects stale geometry before replacing the document", async () => {
  await sources(); await apply(create()); const data = serializeDocument(cadDocument);
  const old = JSON.parse(data); old.version = 13; assert.throws(()=>deserializeDocument(JSON.stringify(old)), /version 14/i);
  for (const damage of [
    (d: any)=>{d.features[feature("angle").id].inputs=["a"];},
    (d: any)=>{d.features[feature("angle").id].params.second.segmentId="missing";},
    (d: any)=>{d.features[feature("angle").id].params.branch.sweep="random";},
  ]) { const bad=JSON.parse(data); damage(bad.document); assert.throws(()=>deserializeDocument(JSON.stringify(bad)), /angular|feature/i); }
  const bad=JSON.parse(data); bad.document.features[feature("angle").id].params.lines[1].end=[30,30,0];
  const before=structuredClone(cadDocument), history=cadHistory.getPastLabels();
  await assert.rejects(openDocumentFile(new File([JSON.stringify(bad)], "bad.webcad.json")), /outdated measurement/i);
  assert.deepEqual(cadDocument,before); assert.deepEqual(cadHistory.getPastLabels(),history);
  assert.equal(JSON.parse(serializeDocument({ ...cadDocument, features: { ...cadDocument.features, [feature("angle").id]: { ...feature("angle"), params: { ...feature("angle").params } } } })).version,14);
});

test("Sketch driving angle refreshes the independent annotation after solve and projection", async () => {
  await apply({type:"create-sketch",id:"s",workPlane:"XY"});
  for (const [id, end] of [["a",[40,0]],["b",[0,30]]] as const) await apply({type:"add-sketch-geometry",sketchId:"s",geometry:{id,kind:"line",start:[0,0],end:[...end],startId:`${id}:start`,endId:`${id}:end`,segmentId:`${id}:edge`}});
  await apply({type:"add-sketch-constraint",sketchId:"s",constraint:{id:"driver",kind:"angle",firstLineId:"a",secondLineId:"b",value:Math.PI/2}});
  await apply(create()); const identity=feature("angle").id;
  await apply({type:"set-sketch-dimension",sketchId:"s",constraintId:"driver",value:Math.PI/3});
  assert.ok(Math.abs(angle().value-Math.PI/3)<1e-5); assert.equal(feature("angle").id,identity); assertAngularEvaluation(cadDocument);
});

test("Nested pattern child angular reference follows explicit root Trim routing and regenerated members", async () => {
  await sources();
  for (const [id, source] of [["p","a"],["q","p:a:1"]]) {
    const sourceId = id === "p" ? source : Object.values(cadDocument.features).find(f=>f.pattern?.id==="p")!.output;
    await apply({type:"create-pattern",id,sourceObjectIds:[sourceId],spec:{kind:"linear",workPlane:"XY",columns:2,rows:1,spacing:[50,0]}});
  }
  const child=Object.values(cadDocument.features).find(f=>f.pattern?.id==="q")!.output;
  await apply({type:"create-dimension",id:"angle",dimension:"angular",params:{...definition(),first:reference(child)}});
  await apply({type:"create-drawing",id:"cutter",drawing:"line",params:{workPlane:"XY",points:[[20,-10,0],[20,10,0]]}});
  const routes = contourReferenceRequirements(cadDocument,["a"]).map(r=>({dependentId:r.dependentId,sourceId:r.sourceId,resultIndices:[0],...(r.kind==="dimension"?{referenceSlot:r.referenceSlot,segmentIndex:0}:{})}));
  await apply({type:"trim-contour",objectId:"a",cutterIds:["cutter"],pickPoint:[30,0,0],referenceRoutes:routes});
  assert.equal((feature("angle").params.first as any).objectId,child); assert.equal(angle().value,Math.PI/2); assertAngularEvaluation(cadDocument);
  assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)),cadDocument);
});
