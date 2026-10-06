import assert from "node:assert/strict";
import { test, beforeEach, afterEach } from "node:test";
import * as THREE from "three";
import { serializeDocument, deserializeDocument } from "@agent-webcad/cad-document";
import type { CadCommand } from "@agent-webcad/cad-commands";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory, undoDocument, redoDocument } from "../src/state/history";
import { dispatchCadCommand, prepareCadCommand } from "../src/state/dispatchCadCommand";
import { queryCadDocument } from "../src/state/documentQuery";
import { assertConstructionEvaluation, linearCircleBranches } from "../src/precision/constructionGeometry";
import { clipLinearToCamera, createDrawingRenderObject } from "../src/viewport/drawingRenderer";
import { getObjectWorldBounds } from "../src/precision/worldBounds";
import { getWorldDrawingGeometry } from "../src/precision/worldGeometry";
import { querySnap } from "../src/precision/snapEngine";
import { validateCommand } from "@agent-webcad/cad-commands";
import { extractSketchLoops } from "../src/precision/sketchProfiles";
import { encodeDxf } from "../src/interop/dxfWriter";
import { WORK_PLANES } from "../src/precision/workPlane";
import { resetTestDocument, restoreTestDocument, documentState } from "./helpers/documentHarness";
import { createConstructionChain } from "./helpers/constructionChain";
const original = structuredClone(cadDocument); beforeEach(resetTestDocument); afterEach(() => { restoreTestDocument(original); cadHistory.clear(); });
async function apply(command: CadCommand) { const result = await dispatchCadCommand(command); assert.ok(result.ok, result.reason); return result; }
const feature = (id: string) => Object.values(cadDocument.features).find(f => f.output === id)!;
const points = (id: string) => feature(id).params.points as [number,number,number][];
const near = (a: number, b: number, tolerance = 1e-6) => assert.ok(Math.abs(a-b) <= tolerance, `${a} ≈ ${b}`);
const moveA = (x: number): CadCommand => ({ type: "edit-drawing-control", objectId: "A", controlId: (feature("A").params.topology as any).controls[0].id, point: [x,0,0] });

test("point → segment → midpoint → bisector → selected intersections recalculate as one transaction and persist", async () => {
  await createConstructionChain(apply); const before = documentState(), past = cadHistory.getPastLabels().length, topology = JSON.stringify(Object.values(cadDocument.features).map(f => f.params.topology));
  near(points("P")[0][1], 80); near(points("Q")[0][1], -80);
  const proposal = await prepareCadCommand(cadDocument, moveA(20)); assert.ok(proposal.result.ok); assert.deepEqual(documentState(),before);
  await apply(moveA(20)); near(points("M")[0][0],60); near(points("P")[0][0],60); near(points("P")[0][1],Math.sqrt(6300)); near(points("Q")[0][1],-Math.sqrt(6300));
  assert.equal(JSON.stringify(Object.values(cadDocument.features).map(f => f.params.topology)),topology); assert.equal(cadHistory.getPastLabels().length,past+1);
  const saved = serializeDocument(cadDocument); assert.equal(JSON.parse(saved).version,4); const loaded = deserializeDocument(saved); assertConstructionEvaluation(loaded); assert.deepEqual(loaded,cadDocument);
  const query = await queryCadDocument(["P"]); assert.equal(query.objects[0].dependencies!.object!.operation,"intersection(L, O, branch=positive)"); assert.ok(query.objects[0].dependencies!.upstream.some(n=>n.sourceId==="A"));
  const after = documentState(); await undoDocument(); assert.deepEqual(documentState(),before); await redoDocument(); assert.deepEqual(documentState(),after);
});
test("tangent branch coalescence retains both identities and separates into the same signed branches again", async () => {
  await createConstructionChain(apply); await apply(moveA(160)); near(points("P")[0][0],130); near(points("P")[0][1],0); assert.deepEqual(points("P"),points("Q"));
  await apply(moveA(20)); assert.ok(points("P")[0][1]>0&&points("Q")[0][1]<0); assert.equal((feature("Q").construction as any).branch,"negative");
});
test("no intersection, collapsed source, deleted input and derived point edits reject atomically", async () => {
  await createConstructionChain(apply); const before = documentState(), past = cadHistory.getPastLabels().length;
  for (const command of [moveA(300),moveA(100),{type:"delete-object",objectId:"A"},{type:"move-object",objectId:"P",translation:[10,0,0]},{type:"edit-drawing-control",objectId:"M",controlId:(feature("M").params.topology as any).controls[0].id,point:[60,0,0]}] as CadCommand[]) {
    const result = await dispatchCadCommand(command); assert.equal(result.ok,false,result.reason); assert.deepEqual(documentState(),before); assert.equal(cadHistory.getPastLabels().length,past);
  }
});
test("version gates, missing inputs, cycles and wrong evaluated caches are diagnosed on reopen", async () => {
  await createConstructionChain(apply); const saved = JSON.parse(serializeDocument(cadDocument)); saved.version=3; assert.throws(()=>deserializeDocument(JSON.stringify(saved)),/version 4/);
  saved.version=4; saved.document.features["feature-M"].construction.segmentId="missing"; saved.document.features["feature-M"].inputs=["missing"]; assert.throws(()=>deserializeDocument(JSON.stringify(saved)),/Missing construction source/);
  const cyclic = JSON.parse(serializeDocument(cadDocument)); cyclic.document.features["feature-AB"].construction.firstId="M"; cyclic.document.features["feature-AB"].inputs=["M","B"]; assert.throws(()=>deserializeDocument(JSON.stringify(cyclic)),/Cyclic construction/);
  const stale = deserializeDocument(serializeDocument(cadDocument)); (stale.features["feature-P"].params.points as number[][])[0][1]=40; assert.throws(()=>assertConstructionEvaluation(stale),/Stale construction geometry/);
});
for(const plane of ["XY","XZ","YZ"] as const) test(`construction preserves ${plane} plane, elevated and survey coordinates`,async()=>{
  await createConstructionChain(apply,plane,17,1e8); const result=points("P")[0]; const axes=plane==="XY"?[0,1,2]:plane==="XZ"?[0,2,1]:[1,2,0]; near(result[axes[0]],1e8+50,1e-5); near(result[axes[1]],1e8+80,1e-5); near(result[axes[2]],17); assertConstructionEvaluation(cadDocument);
});
test("infinite line and ray domains differ from stored finite segments for intersections and snaps",async()=>{
  assert.equal(linearCircleBranches([0,0],[1,0],[10,0],2,"line").length,0); assert.equal(linearCircleBranches([0,0],[1,0],[10,0],2,"infinite-line").length,2); assert.equal(linearCircleBranches([0,0],[1,0],[-10,0],2,"ray").length,0);
  const base={point:[-10,0,0] as [number,number,number],plane:WORK_PLANES.XY,gridStep:1,tolerancePx:3,project:(p:[number,number,number])=>[p[0]*10,p[1]*10] as [number,number],enabled:{grid:false}};
  const infinite=querySnap({...base,entities:[{objectId:"L",kind:"infinite-line",points:[[0,0,0],[1,0,0]]}]}); assert.equal(infinite.objectId,"L"); near(infinite.point[0],-10);
  const ray=querySnap({...base,entities:[{objectId:"R",kind:"ray",points:[[0,0,0],[1,0,0]]}]}); assert.equal(ray.objectId,undefined);
  const point=querySnap({...base,entities:[{objectId:"P",kind:"point",points:[[-10,0,0]]}]}); assert.equal(point.type,"endpoint"); assert.equal(point.objectId,"P");
});
test("camera clipping changes display extents but never authoring bounds or point coordinates",async()=>{
  await apply({type:"create-drawing",id:"L",drawing:"infinite-line",params:{points:[[0,0,0],[1,0,0]]}});
  const camera=new THREE.OrthographicCamera(-100,100,50,-50,.1,100);camera.position.z=10;camera.lookAt(0,0,0);camera.updateMatrixWorld(); const local=[new THREE.Vector3(),new THREE.Vector3(1,0,0)];
  const clipped=clipLinearToCamera(local,new THREE.Matrix4(),camera,false); near(clipped[0].x,-100); near(clipped[1].x,100); const ray=clipLinearToCamera(local,new THREE.Matrix4(),camera,true); near(ray[0].x,0);near(ray[1].x,100);
  camera.zoom=2;camera.updateProjectionMatrix(); near(clipLinearToCamera(local,new THREE.Matrix4(),camera,false)[1].x,50);
  const rendered = createDrawingRenderObject("L", { kind: "infinite-line", points: [[0,0,0],[1,0,0]], construction: true }), geometry = rendered.geometry;
  const attribute = geometry.getAttribute("instanceStart");
  const frame = () => (rendered.onBeforeRender as Function)({ getSize: (v: THREE.Vector2) => v.set(1000,500) }, null, camera);
  frame(); assert.equal(geometry.getAttribute("instanceStart"), attribute); near(geometry.getAttribute("instanceDistanceEnd").getX(0), 100);
  const buffer = (attribute as THREE.InterleavedBufferAttribute).data, version = buffer.version; frame(); assert.equal(buffer.version, version, "A stationary camera must not reallocate or upload line buffers each frame");
  assert.deepEqual(getObjectWorldBounds(cadDocument,"L"),{min:[0,0,0],max:[1,0,0]}); assert.deepEqual(getWorldDrawingGeometry(cadDocument.objects.L,feature("L"))!.points,[[0,0,0],[1,0,0]]);
});

test("editing an independent point and a circular source propagates through the stored definitions", async () => {
  await createConstructionChain(apply);
  const control = (feature("A").params.topology as { controls: { id: string }[] }).controls[0].id;
  await apply({ type: "edit-drawing-control", objectId: "A", controlId: control, point: [20, 0, 0] });
  near(points("M")[0][0], 60); near(points("P")[0][1], Math.sqrt(6300));
  const radiusControl = (feature("O").params.topology as { controls: { id: string; role: string }[] }).controls.find(c => c.role === "radius")!.id;
  await apply({ type: "edit-drawing-control", objectId: "O", controlId: radiusControl, point: [150, 0, 0] });
  near(points("P")[0][1], Math.sqrt(9900)); near(points("Q")[0][1], -Math.sqrt(9900));
  assertConstructionEvaluation(cadDocument);
});

test("saved line intersections obey infinite-line and forward-ray domains beyond the through point", async () => {
  for (const [id, drawing, points] of [["L", "infinite-line", [[0,0,0],[1,0,0]]], ["R", "ray", [[0,0,0],[1,0,0]]], ["V", "infinite-line", [[10,-1,0],[10,1,0]]]] as const)
    await apply({ type: "create-drawing", id, drawing, params: { points } });
  await apply({ type: "create-construction", id: "P", workPlane: "XY", definition: { operation: "intersection", firstId: "R", secondId: "V", branch: "positive" } });
  near(points("P")[0][0], 10); near(points("P")[0][1], 0);
  const before = documentState(), past = cadHistory.getPastLabels().length;
  const result = await dispatchCadCommand({ type: "move-object", objectId: "V", translation: [-20,0,0] });
  assert.equal(result.ok, false); assert.deepEqual(documentState(), before); assert.equal(cadHistory.getPastLabels().length, past);
  await apply({ type: "create-construction", id: "Q", workPlane: "XY", definition: { operation: "intersection", firstId: "L", secondId: "V", branch: "negative" } });
  await apply({ type: "delete-object", objectId: "P" }); await apply({ type: "move-object", objectId: "V", translation: [-20,0,0] });
  near(points("Q")[0][0], -10); assertConstructionEvaluation(cadDocument);
});

test("different source elevations and noncircular transforms reject without partial construction updates", async () => {
  await createConstructionChain(apply); const before = documentState(), past = cadHistory.getPastLabels().length;
  for (const command of [{ type: "move-object", objectId: "A", translation: [0,0,10] }, { type: "scale-object", objectId: "O", scale: [2,1,1] }] as CadCommand[]) {
    const result = await dispatchCadCommand(command); assert.equal(result.ok, false); assert.deepEqual(documentState(), before); assert.equal(cadHistory.getPastLabels().length, past);
  }
});

test("new object kinds validate their definitions and cannot become finite profiles or fake DXF segments", async () => {
  assert.equal(validateCommand({ type: "create-drawing", drawing: "ray", params: { kind: "infinite-line", points: [[0,0,0],[1,0,0]] } }), false);
  for (const [drawing, points] of [["point", [[0,0,0],[1,0,0]]], ["infinite-line", [[0,0,0],[0,0,0]]], ["ray", [[0,0,0],[Infinity,0,0]]]] as const) assert.equal(validateCommand({ type: "create-drawing", drawing, params: { points } }), false);
  await apply({ type: "create-drawing", id: "L", drawing: "infinite-line", params: { points: [[0,0,0],[1,0,0]], construction: false } });
  assert.equal(extractSketchLoops(cadDocument,["L"]).ok, false);
  const output = encodeDxf(cadDocument); assert.equal(output.entities, 0); assert.equal(output.skipped, 1); assert.ok(!output.text.includes("\nAcDbLine\n"));
});
