import assert from "node:assert/strict";
import {beforeEach,test} from "node:test";
import {deserializeDocument,serializeDocument} from "@agent-webcad/cad-document";
import type {CadCommand} from "@agent-webcad/cad-commands";
import {buildPrimitiveMesh,inspectSolid} from "../src/cad/kernelGeometryService";
import {cadDocument} from "../src/state/cadDocument";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {previewCadCommand,applyCadPlan} from "../src/state/documentPlans";
import {undoDocument,redoDocument} from "../src/state/history";
import {collectStepSolids,exportStepBytes} from "../src/export/exportModel";
import {documentState,resetTestDocument} from "./helpers/documentHarness";

beforeEach(resetTestDocument);
async function apply(command:CadCommand){const result=await dispatchCadCommand(command);assert.ok(result.ok,result.reason);return result;}
async function reject(command:CadCommand){const before=documentState();const result=await dispatchCadCommand(command);assert.equal(result.ok,false);assert.deepEqual(documentState(),before);return result.reason;}
async function setup(){
  await apply({type:"create-primitive",id:"body",primitive:"box",params:{width:20,depth:16,height:10}});
  const mesh=await buildPrimitiveMesh(cadDocument.features["feature-body"].params);
  const face=mesh.faces?.find(entry=>entry.key.split("|")[0].endsWith(",10.000000"));assert.ok(face);
  await apply({type:"attach-work-plane-face",id:"top",name:"Top",source:{kind:"brep-face",objectId:"body",topologyId:face.key}});
}
async function volume(id:string){const feature=cadDocument.features[`feature-${id}`],object=cadDocument.objects[id];return inspectSolid({params:feature.params,transform:object.transform});}

test("reviewed blind Hole uses face-local position and diameter, one Undo, v20 and STEP",async()=>{
  await setup();const before=documentState();
  const plan=await previewCadCommand({type:"create-face-hole",id:"hole",planeId:"top",center:[2,-1],diameter:4,depth:4});
  assert.ok(plan.result.ok,plan.result.reason);assert.equal(cadDocument.objects.hole,undefined);
  assert.ok(plan.changes.some(change=>change.objectId==="hole"&&change.after?.volume));
  const result=await applyCadPlan(plan.planId);assert.ok(result.ok,result.reason);assert.deepEqual(result.createdIds,["hole"]);
  assert.equal(cadDocument.objects.body.visible,false);assert.deepEqual(cadDocument.features["feature-hole"].inputs,["body"]);
  const measurement=await volume("hole");assert.equal(measurement.validity,"valid");assert.ok(measurement.area!>0);assert.ok(Math.abs(measurement.volume!-(3200-16*Math.PI))<1e-4);
  assert.equal(collectStepSolids(["hole"]).length,1);assert.ok((await exportStepBytes(["hole"])).byteLength>100);
  const saved=serializeDocument(cadDocument);assert.equal(JSON.parse(saved).version,20);assert.deepEqual(deserializeDocument(saved).features["feature-hole"].params.faceHole,cadDocument.features["feature-hole"].params.faceHole);
  const older=JSON.parse(saved);older.version=19;assert.throws(()=>deserializeDocument(JSON.stringify(older)),/version 20/);
  const after=documentState();assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),after);
});

test("Hole edit, through condition and source movement/rotation regenerate exact volume",async()=>{
  await setup();await apply({type:"create-face-hole",id:"hole",planeId:"top",center:[0,0],diameter:4,depth:4});
  await apply({type:"update-face-hole",objectId:"hole",center:[1,2],diameter:6,depth:5});
  assert.ok(Math.abs((await volume("hole")).volume!-(3200-45*Math.PI))<1e-4);
  assert.match((await reject({type:"update-face-hole",objectId:"hole",center:[9,0],diameter:6,depth:5}))??"",/entirely/);
  await apply({type:"update-face-hole",objectId:"hole",center:[1,2],diameter:6,depth:1,through:true});
  assert.ok(Math.abs((await volume("hole")).volume!-(3200-90*Math.PI))<1e-4);
  const edited=documentState();assert.ok(undoDocument());assert.ok(redoDocument());assert.deepEqual(documentState(),edited);
  await apply({type:"move-object",objectId:"body",translation:[10,5,0]});
  await apply({type:"rotate-object",objectId:"body",rotation:[0,0,90]});
  assert.ok(Math.abs((await volume("hole")).volume!-(3200-90*Math.PI))<1e-4);
  assert.equal(cadDocument.features["feature-hole"].params.faceHoleStatus,"resolved");
});

test("hole rejects edge-crossing and non-cutting input without changing the document",async()=>{
  await setup();
  assert.match((await reject({type:"create-face-hole",planeId:"top",center:[9,0],diameter:4,depth:2}))??"",/entirely/);
  assert.match((await reject({type:"create-face-hole",planeId:"top",center:[0,0],diameter:4,depth:.00000001}))??"",/modeling tolerance/);
});

test("changed source face blocks Hole STEP until explicit rebind",async()=>{
  await setup();await apply({type:"create-face-hole",id:"hole",planeId:"top",center:[0,0],diameter:4,depth:4});
  await apply({type:"update-primitive",objectId:"body",params:{width:24,depth:16,height:10}});
  assert.equal(cadDocument.features["feature-hole"].params.faceHoleStatus,"missing");
  assert.throws(()=>collectStepSolids(["hole"]),/unresolved/);
  const mesh=await buildPrimitiveMesh(cadDocument.features["feature-body"].params);
  const face=mesh.faces?.find(entry=>entry.key.split("|")[0].endsWith(",10.000000"));assert.ok(face);
  await apply({type:"set-object-visible",objectId:"body",visible:true});
  await apply({type:"rebind-work-plane-face",planeId:"top",source:{kind:"brep-face",objectId:"body",topologyId:face.key}});
  await apply({type:"set-object-visible",objectId:"body",visible:false});
  assert.equal(cadDocument.features["feature-hole"].params.faceHoleStatus,"resolved");
  assert.equal(collectStepSolids(["hole"]).length,1);
  assert.ok(Math.abs((await volume("hole")).volume!-(3840-16*Math.PI))<1e-4);
});

test("side-face Hole follows the selected face and locks its work plane from deletion",async()=>{
  await apply({type:"create-primitive",id:"body",primitive:"box",params:{width:20,depth:16,height:10}});
  const mesh=await buildPrimitiveMesh(cadDocument.features["feature-body"].params);
  const face=mesh.faces?.find(entry=>entry.key.split("|")[0].endsWith("20.000000,8.000000,5.000000"));assert.ok(face);
  await apply({type:"attach-work-plane-face",id:"side",name:"Side",source:{kind:"brep-face",objectId:"body",topologyId:face.key}});
  await apply({type:"create-face-hole",id:"hole",planeId:"side",center:[0,0],diameter:4,depth:4});
  assert.ok(Math.abs((await volume("hole")).volume!-(3200-16*Math.PI))<1e-4);
  assert.match((await reject({type:"delete-work-plane",planeId:"side"}))??"",/dependent Hole/);
});
