import assert from "node:assert/strict";
import { test } from "node:test";
import { deserializeDocument, serializeDocument, type CadScene } from "@agent-webcad/cad-document";
import { cadDocument } from "../src/state/cadDocument";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { applyCadPlan, previewCadCommand } from "../src/state/documentPlans";
import { cadHistory, undoDocument, redoDocument } from "../src/state/history";
import { newScene } from "../src/state/sceneCommands";
import { evaluateScene } from "../src/scenes/sceneEvaluation";
import { resetTestDocument, documentState } from "./helpers/documentHarness";

async function fixture() {
  resetTestDocument();
  assert.equal((await dispatchCadCommand({type:"create-artboard",id:"board",workPlane:"XY",origin:[10,20],size:[100,80]})).ok,true);
  for (const id of ["one","two"]) assert.equal((await dispatchCadCommand({type:"create-drawing",id,drawing:"rectangle",params:{workPlane:"XY",points:[[0,0,0],[20,0,0],[20,10,0],[0,10,0]]}})).ok,true);
  cadHistory.clear();
  return {...newScene("board",["one","two"]),id:"scene",name:"Overview",layout:{direction:"row",gap:8,padding:5}} satisfies CadScene;
}
const snapshot=()=>JSON.stringify({document:cadDocument,past:cadHistory.getPastLabels(),future:cadHistory.getFutureLabels()});

test("Scene preview, layout, animation and persistence reference the original CAD identities",async()=>{
  const scene=await fixture(),before=documentState(),source=JSON.stringify(cadDocument.features);
  scene.tracks=[{objectId:"one",startMs:0,endMs:1000,from:[-10,0,0],to:[0,0,1],easing:"linear"}];
  scene.states=[{id:"hidden",name:"Without first",hiddenObjectIds:["one"]}];
  const initial=evaluateScene(cadDocument,scene,0),middle=evaluateScene(cadDocument,scene,500),end=evaluateScene(cadDocument,scene,1000);
  assert.equal(initial.frames[0].x,5); assert.equal(middle.frames[0].x,10); assert.equal(end.frames[0].x,15);
  assert.equal(end.frames[0].y,95); assert.equal(end.frames[1].x,43);
  assert.match(middle.svg,/opacity="0.5"/);
  assert.deepEqual(evaluateScene(cadDocument,scene,1000,"hidden").frames.map(f=>f.objectId),["two"]);
  const preview=await previewCadCommand({type:"upsert-scene",scene});
  assert.equal(preview.result.ok,true,preview.result.reason); assert.deepEqual(documentState(),before);
  assert.equal(preview.impact?.find(i=>i.kind==="Scenes")?.created,1);
  assert.equal((await applyCadPlan(preview.planId)).ok,true); assert.equal(cadHistory.getPastLabels().length,1);
  assert.equal(JSON.stringify(cadDocument.features),source);
  const saved=serializeDocument(cadDocument); assert.equal(JSON.parse(saved).version,12);
  assert.deepEqual(deserializeDocument(saved).scenes,cadDocument.scenes);
  assert.equal(evaluateScene(deserializeDocument(saved),scene,500).svg,middle.svg);
  const after=documentState(); assert.ok(undoDocument()); assert.deepEqual(documentState(),before);
  assert.ok(redoDocument()); assert.deepEqual(documentState(),after);
});

test("Invalid scene input, layout and reference changes are atomic",async()=>{
  const scene=await fixture();
  for (const invalid of [
    {...scene,objectIds:["missing"]}, {...scene,artboardId:"missing"},
    {...scene,layout:{direction:"row",gap:200,padding:5}},
    {...scene,links:[{objectId:"one",targetSceneId:"missing"}]},
  ]) {
    const before=snapshot(); const result=await dispatchCadCommand({type:"upsert-scene",scene:invalid as CadScene});
    assert.equal(result.ok,false); assert.equal(snapshot(),before);
  }
  const invalidBefore=snapshot();
  await assert.rejects(dispatchCadCommand({type:"upsert-scene",scene:{...scene,tracks:[{objectId:"one",startMs:0,endMs:9000,from:[0,0,0],to:[0,0,1],easing:"linear"}]}}),/Invalid CAD command/);
  assert.equal(snapshot(),invalidBefore);
  assert.equal((await dispatchCadCommand({type:"upsert-scene",scene})).ok,true);
  for(const command of [{type:"delete-object",objectId:"one"},{type:"delete-artboard",artboardId:"board"}] as const){
    const before=snapshot(); assert.equal((await dispatchCadCommand(command)).ok,false); assert.equal(snapshot(),before);
  }
  assert.equal((await dispatchCadCommand({type:"update-artboard",artboardId:"board",locked:true})).ok,true);
  const before=snapshot(); assert.equal((await dispatchCadCommand({type:"upsert-scene",scene:{...scene,notes:"change"}})).ok,false); assert.equal(snapshot(),before);
  assert.equal((await dispatchCadCommand({type:"delete-scene",sceneId:scene.id})).ok,false); assert.equal(snapshot(),before);
});

test("Prototype target states stay connected through edits and dangling links reject",async()=>{
  const first=await fixture(),second={...first,id:"second",name:"Detail",states:[{id:"alternate",name:"Alternative",hiddenObjectIds:["two"]}]};
  assert.equal((await dispatchCadCommand({type:"upsert-scene",scene:second})).ok,true);
  first.links=[{objectId:"one",targetSceneId:second.id,targetStateId:"alternate"}];
  assert.equal((await dispatchCadCommand({type:"upsert-scene",scene:first})).ok,true);
  const before=snapshot(); assert.equal((await dispatchCadCommand({type:"upsert-scene",scene:{...second,states:[]}})).ok,false); assert.equal(snapshot(),before);
  assert.equal((await dispatchCadCommand({type:"delete-scene",sceneId:second.id})).ok,false); assert.equal(snapshot(),before);
  assert.equal((await dispatchCadCommand({type:"delete-scene",sceneId:first.id})).ok,true);
  assert.equal((await dispatchCadCommand({type:"delete-scene",sceneId:second.id})).ok,true); assert.equal(cadDocument.scenes,undefined);
  assert.ok(undoDocument()); assert.deepEqual(cadDocument.scenes?.second,second);
});

test("Scene plans cannot apply after source changes; serialization rejects corrupt graph",async()=>{
  const scene=await fixture(),plan=await previewCadCommand({type:"upsert-scene",scene});
  assert.equal((await dispatchCadCommand({type:"rename-object",objectId:"one",name:"Changed"})).ok,true);
  const before=snapshot(); assert.equal((await applyCadPlan(plan.planId)).ok,false); assert.equal(snapshot(),before);
  assert.equal((await dispatchCadCommand({type:"upsert-scene",scene})).ok,true);
  const saved=JSON.parse(serializeDocument(cadDocument));
  const doc=saved.document??saved; doc.scenes.scene.objectIds=["missing"];
  assert.throws(()=>deserializeDocument(JSON.stringify(saved)),/missing/);
});

test("Hidden states collapse Auto Layout and preserve original geometry at every evaluated time",async()=>{
 const scene=await fixture(),before=documentState();scene.states=[{id:"hidden",name:"Second only",hiddenObjectIds:["one"]}];
 const frame=evaluateScene(cadDocument,scene,500,"hidden").frames[0];assert.equal(frame.objectId,"two");assert.equal(frame.x,15);assert.equal(frame.y,95);
 assert.deepEqual(documentState(),before);assert.throws(()=>evaluateScene(cadDocument,scene,NaN),/finite/);
});

test("Scene component instances resolve nested definitions and follow their update without copying CAD objects",async()=>{
 const scene=await fixture();
 assert.equal((await dispatchCadCommand({type:"define-block",id:"card",name:"Card",objectIds:["one"],base:[0,0,0]})).ok,true);
 assert.equal((await dispatchCadCommand({type:"insert-block",id:"inner",blockId:"card",position:[0,0,0]})).ok,true);
 assert.equal((await dispatchCadCommand({type:"define-block",id:"nested",name:"Nested",objectIds:["inner"],base:[0,0,0]})).ok,true);
 assert.equal((await dispatchCadCommand({type:"insert-block",id:"placement",blockId:"nested",position:[0,0,0]})).ok,true);
 scene.objectIds=["placement"];const source=structuredClone(cadDocument.objects.placement);assert.equal((await dispatchCadCommand({type:"upsert-scene",scene})).ok,true);
 assert.equal(evaluateScene(cadDocument,scene).frames[0].width,20);
 await dispatchCadCommand({type:"create-drawing",id:"wide",drawing:"rectangle",params:{workPlane:"XY",points:[[0,0,0],[30,0,0],[30,10,0],[0,10,0]]}});
 assert.equal((await dispatchCadCommand({type:"update-block",blockId:"card",objectIds:["wide"],base:[0,0,0]})).ok,true);
 assert.equal(evaluateScene(cadDocument,scene).frames[0].width,30);assert.deepEqual(cadDocument.objects.placement,source);
 const restored=deserializeDocument(serializeDocument(cadDocument));assert.equal(evaluateScene(restored,restored.scenes!.scene).svg,evaluateScene(cadDocument,scene).svg);
});

test("Components with unsupported text are rejected as a whole instead of partially exporting",async()=>{
 const scene=await fixture();await dispatchCadCommand({type:"create-drafting",id:"label",params:{kind:"text",workPlane:"XY",point:[0,0,0],text:"Label",height:3}});
 assert.equal((await dispatchCadCommand({type:"define-block",id:"mixed",name:"Mixed",objectIds:["one","label"],base:[0,0,0]})).ok,true);
 assert.equal((await dispatchCadCommand({type:"insert-block",id:"mixed-placement",blockId:"mixed",position:[0,0,0]})).ok,true);
 scene.objectIds=["mixed-placement"];const before=snapshot();const result=await dispatchCadCommand({type:"upsert-scene",scene});assert.equal(result.ok,false);assert.match(result.reason!,/unsupported component/);assert.equal(snapshot(),before);
});
