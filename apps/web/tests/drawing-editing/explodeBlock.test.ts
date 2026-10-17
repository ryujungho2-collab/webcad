import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { deserializeDocument, serializeDocument } from "@agent-webcad/cad-document";
import type { CadCommand } from "@agent-webcad/cad-commands";
import { cadDocument } from "../../src/state/cadDocument";
import { cadHistory, undoDocument, redoDocument } from "../../src/state/history";
import { dispatchCadCommand } from "../../src/state/dispatchCadCommand";
import { previewCadCommand, applyCadPlan, discardCadPlan } from "../../src/state/documentPlans";
import { newScene } from "../../src/state/sceneCommands";
import { worldDraftingGeometry } from "../../src/precision/draftingGeometry";
import { getWorldDrawingGeometry } from "../../src/precision/worldGeometry";
import { resetTestDocument, documentState } from "../helpers/documentHarness";
beforeEach(resetTestDocument);
const feature = (id: string) => Object.values(cadDocument.features).find(f => f.output === id)!;
const near = (a: number, b: number, tolerance = 1e-6) => assert.ok(Math.abs(a - b) <= tolerance, `${a} ≈ ${b}`);
async function apply(command: CadCommand) { const r = await dispatchCadCommand(command); assert.ok(r.ok, r.reason); return r; }
async function reject(command: CadCommand, reason: RegExp) {
  const before = JSON.stringify(cadDocument), h = cadHistory.getPastLabels();
  const r = await dispatchCadCommand(command);
  assert.equal(r.ok, false); assert.match(r.reason!, reason);
  assert.equal(JSON.stringify(cadDocument), before); assert.deepEqual(cadHistory.getPastLabels(), h);
}
function roundtrip(before: ReturnType<typeof documentState>) {
  const after = documentState();
  assert.ok(undoDocument()); assert.deepEqual(documentState(), before);
  assert.ok(redoDocument()); assert.deepEqual(documentState(), after);
  assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)), cadDocument);
}
async function door() {
  await apply({ type: "create-drawing", id: "symbol", drawing: "line", params: { workPlane: "XY", points: [[10, 0, 0], [30, 0, 0]] } });
  await apply({ type: "create-drawing", id: "arc", drawing: "arc", params: { workPlane: "XY", center: [10, 0, 0], radius: 10, startAngle: 0, endAngle: Math.PI / 2 } });
  await apply({ type: "create-drafting", id: "label", params: { kind: "text", workPlane: "XY", point: [10, 5, 0], text: "거실", height: 175, angle: 0 } });
  await apply({ type: "define-block", id: "door", name: "Door", objectIds: ["symbol", "arc", "label"], base: [10, 0, 0] });
}
const worldPoints = (id: string) => getWorldDrawingGeometry(cadDocument.objects[id], feature(id))!.points!;

test("rotated instance disbands to exact world lines, arcs and text while the definition and sibling stay intact", async () => {
  await door();
  await apply({ type: "insert-block", id: "keep", blockId: "door", position: [0, 0, 0] });
  await apply({ type: "insert-block", id: "instance", blockId: "door", position: [100, 200, 0], angle: 90 });
  const before = documentState(), h = cadHistory.getPastLabels().length;
  const planned = await previewCadCommand({ type: "explode-block", objectId: "instance" });
  assert.ok(planned.result.ok, planned.result.reason); assert.deepEqual(documentState(), before);
  const r = await applyCadPlan(planned.planId); assert.ok(r.ok, r.reason); discardCadPlan(planned.planId);
  assert.equal(r.createdIds.length, 3); assert.equal(cadHistory.getPastLabels().length, h + 1);
  assert.ok(!cadDocument.objects.instance);
  assert.ok(cadDocument.blocks?.door && cadDocument.objects.keep);
  const [line, arc, text] = r.createdIds;
  assert.deepEqual(worldPoints(line).map(p => p.map(Math.round)), [[100, 200, 0], [100, 220, 0]]);
  const arcFeature = feature(arc);
  assert.equal(arcFeature.params.kind, "arc"); near(Number(arcFeature.params.radius), 10);
  near(Number(arcFeature.params.startAngle), Math.PI / 2); near(Number(arcFeature.params.endAngle), Math.PI);
  const textParams = feature(text).params;
  assert.equal(textParams.kind, "text"); assert.equal(textParams.text, "거실");
  assert.deepEqual((textParams.point as number[]).map(Math.round), [95, 200, 0]);
  near(Number(textParams.angle), 90); near(Number(textParams.height), 175);
  assert.equal(feature(text).type, "drafting");
  roundtrip(before);
});

test("shallow disband keeps one composed nested instance; recursive disband flattens it", async () => {
  await apply({ type: "create-drawing", id: "leaf-source", drawing: "line", params: { workPlane: "XY", points: [[0, 0, 0], [50, 0, 0]] } });
  await apply({ type: "define-block", id: "leaf", name: "Leaf", objectIds: ["leaf-source"], base: [0, 0, 0] });
  await apply({ type: "insert-block", id: "leaf-instance", blockId: "leaf", position: [20, 30, 0] });
  await apply({ type: "define-block", id: "assembly", name: "Assembly", objectIds: ["leaf-instance"], base: [20, 30, 0] });
  await apply({ type: "insert-block", id: "assembly-instance", blockId: "assembly", position: [100, 200, 0] });
  const shallow = await apply({ type: "explode-block", objectId: "assembly-instance" });
  assert.equal(shallow.createdIds.length, 1);
  const nested = feature(shallow.createdIds[0]);
  assert.equal(nested.params.kind, "block"); assert.equal(nested.params.blockId, "leaf");
  const geometry = worldDraftingGeometry(cadDocument, cadDocument.objects[shallow.createdIds[0]], nested);
  assert.deepEqual(geometry.lines[0].points.map(p => p.map(Math.round)), [[100, 200, 0], [150, 200, 0]]);
  assert.ok(cadDocument.blocks?.assembly && cadDocument.blocks?.leaf);
  undoDocument();
  const deep = await apply({ type: "explode-block", objectId: "assembly-instance", recursive: true });
  assert.equal(deep.createdIds.length, 1);
  assert.equal(feature(deep.createdIds[0]).params.kind, "line");
  assert.deepEqual(worldPoints(deep.createdIds[0]).map(p => p.map(Math.round)), [[100, 200, 0], [150, 200, 0]]);
});

test("non-uniform instance scale on curved members and floor-plan members fail atomically", async () => {
  await apply({ type: "create-drawing", id: "ring", drawing: "circle", params: { workPlane: "XY", center: [0, 0, 0], radius: 10 } });
  await apply({ type: "define-block", id: "round", name: "Round", objectIds: ["ring"], base: [0, 0, 0] });
  await apply({ type: "insert-block", id: "round-instance", blockId: "round", position: [0, 0, 0] });
  cadDocument.objects["round-instance"].transform!.scale = [2, 1, 1];
  await reject({ type: "explode-block", objectId: "round-instance" }, /non-uniform/);
  cadDocument.objects["round-instance"].transform!.scale = [2, 2, 1];
  const scaled = await apply({ type: "explode-block", objectId: "round-instance" });
  near(Number(feature(scaled.createdIds[0]).params.radius), 20);
  undoDocument(); undoDocument();
  await apply({ type: "create-drafting", id: "room", params: { kind: "floor-plan", workPlane: "XY", width: 6000, depth: 4000, wall: 150, doorCenter: 1500, doorWidth: 900, windowCenter: 4000, windowWidth: 1200, text: "ROOM" } });
  await apply({ type: "define-block", id: "plan", name: "Plan", objectIds: ["room"], base: [0, 0, 0] });
  await apply({ type: "insert-block", id: "plan-instance", blockId: "plan", position: [0, 0, 0] });
  await reject({ type: "explode-block", objectId: "plan-instance" }, /floor-plan/);
});

test("missing, locked, driven and scene-bound instances fail without mutation", async () => {
  await door();
  await apply({ type: "insert-block", id: "instance", blockId: "door", position: [0, 0, 0] });
  await reject({ type: "explode-block", objectId: "missing" }, /placed block instance/);
  await apply({ type: "set-layer-locked", layerId: "layer-default", locked: true });
  await reject({ type: "explode-block", objectId: "instance" }, /unlock/);
  await apply({ type: "set-layer-locked", layerId: "layer-default", locked: false });
  cadDocument.parameterBindings = { b: { id: "b", target: { kind: "feature", objectId: "instance", parameter: "radius" }, expression: "10mm" } };
  await reject({ type: "explode-block", objectId: "instance" }, /binding/);
  delete cadDocument.parameterBindings;
  await apply({ type: "create-drawing", id: "plain", drawing: "line", params: { workPlane: "XY", points: [[0, 0, 0], [10, 0, 0]] } });
  await apply({ type: "define-block", id: "simple", name: "Simple", objectIds: ["plain"], base: [0, 0, 0] });
  await apply({ type: "insert-block", id: "simple-instance", blockId: "simple", position: [0, 0, 0] });
  await apply({ type: "create-artboard", id: "board", workPlane: "XY", origin: [-50, -50], size: [500, 500] });
  const scene = newScene("board", ["simple-instance"]); scene.id = "S"; await apply({ type: "upsert-scene", scene });
  await reject({ type: "explode-block", objectId: "simple-instance" }, /scene/);
});

test("stale reviewed disband cannot commit after an intervening edit", async () => {
  await door();
  await apply({ type: "insert-block", id: "instance", blockId: "door", position: [0, 0, 0] });
  const planned = await previewCadCommand({ type: "explode-block", objectId: "instance" });
  assert.ok(planned.result.ok);
  await apply({ type: "rename-object", objectId: "instance", name: "Changed" });
  const before = documentState(), h = cadHistory.getPastLabels();
  const r = await applyCadPlan(planned.planId);
  assert.equal(r.ok, false); assert.deepEqual(documentState(), before); assert.deepEqual(cadHistory.getPastLabels(), h);
  discardCadPlan(planned.planId);
});

test("disbanded lines stay editable and join back to a closed profile", async () => {
  await apply({ type: "create-drawing", id: "a", drawing: "line", params: { workPlane: "XY", points: [[0, 0, 0], [100, 0, 0]] } });
  await apply({ type: "create-drawing", id: "b", drawing: "line", params: { workPlane: "XY", points: [[100, 0, 0], [100, 60, 0]] } });
  await apply({ type: "create-drawing", id: "c", drawing: "line", params: { workPlane: "XY", points: [[100, 60, 0], [0, 60, 0]] } });
  await apply({ type: "create-drawing", id: "d", drawing: "line", params: { workPlane: "XY", points: [[0, 60, 0], [0, 0, 0]] } });
  await apply({ type: "define-block", id: "frame", name: "Frame", objectIds: ["a", "b", "c", "d"], base: [0, 0, 0] });
  await apply({ type: "insert-block", id: "frame-instance", blockId: "frame", position: [10, 20, 0] });
  const r = await apply({ type: "explode-block", objectId: "frame-instance" });
  assert.equal(r.createdIds.length, 4);
  const joined = await apply({ type: "join-drawings", objectIds: r.createdIds, id: "rebuilt" });
  assert.equal(feature("rebuilt").params.closed, true);
  assert.deepEqual(worldPoints(joined.createdIds[0])[0].map(Math.round), [10, 20, 0]);
  void joined;
});

test("nested rotation under non-uniform scale cannot silently approximate sheared circles or placements", async () => {
  await apply({type:"create-drawing",id:"ring",drawing:"circle",params:{workPlane:"XY",center:[0,0,0],radius:10}});
  await apply({type:"define-block",id:"leaf",name:"Leaf",objectIds:["ring"],base:[0,0,0]});
  await apply({type:"insert-block",id:"nested",blockId:"leaf",position:[0,0,0],angle:45});
  await apply({type:"define-block",id:"assembly",name:"Assembly",objectIds:["nested"],base:[0,0,0]});
  await apply({type:"insert-block",id:"instance",blockId:"assembly",position:[0,0,0]});
  cadDocument.objects.instance.transform!.scale=[2,1,1];
  await reject({type:"explode-block",objectId:"instance",recursive:true},/non-uniform|shear/);
  await reject({type:"explode-block",objectId:"instance"},/shear|affine/);
});
test("recursive affine line baking remains exact when a shallow sheared placement is unrepresentable", async () => {
  await apply({type:"create-drawing",id:"line",drawing:"line",params:{workPlane:"XY",points:[[0,0,0],[50,0,0]]}});
  await apply({type:"define-block",id:"leaf",name:"Leaf",objectIds:["line"],base:[0,0,0]});
  await apply({type:"insert-block",id:"nested",blockId:"leaf",position:[0,0,0],angle:45});
  await apply({type:"define-block",id:"assembly",name:"Assembly",objectIds:["nested"],base:[0,0,0]});
  await apply({type:"insert-block",id:"instance",blockId:"assembly",position:[0,0,0]});
  cadDocument.objects.instance.transform!.scale=[2,1,1];
  const before=documentState();await reject({type:"explode-block",objectId:"instance"},/shear|affine/);
  const r=await apply({type:"explode-block",objectId:"instance",recursive:true});
  const points=worldPoints(r.createdIds[0]);near(points[1][0],50*Math.SQRT2);near(points[1][1],25*Math.SQRT2);roundtrip(before);
});
