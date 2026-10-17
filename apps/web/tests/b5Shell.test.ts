import assert from "node:assert/strict";
import {beforeEach,test} from "node:test";
import type {CadCommand} from "@agent-webcad/cad-commands";
import {serializeDocument,deserializeDocument} from "@agent-webcad/cad-document";
import {buildPrimitiveMesh,buildShellMesh,inspectSolid} from "../src/cad/kernelGeometryService";
import {cadDocument} from "../src/state/cadDocument";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {previewCadCommand,applyCadPlan} from "../src/state/documentPlans";
import {undoDocument,redoDocument} from "../src/state/history";
import {collectStepSolids,exportStepBytes,collectExportSolids} from "../src/export/exportModel";
import {documentState,resetTestDocument} from "./helpers/documentHarness";
import {getObjectWorldBounds} from "../src/precision/worldBounds";

beforeEach(resetTestDocument);
async function apply(command:CadCommand){const result=await dispatchCadCommand(command);assert.ok(result.ok,result.reason);return result;}
async function reject(command:CadCommand){const before=documentState();try{const result=await dispatchCadCommand(command);assert.equal(result.ok,false);}catch(cause){assert.match(String(cause),/Invalid CAD command payload/);}assert.deepEqual(documentState(),before);}
async function topFace(){const mesh=await buildPrimitiveMesh(cadDocument.features["feature-body"].params);return mesh.faces!.find(f=>f.key.split("|")[0].endsWith(",10.000000"))!.key;}
async function setup(){await apply({type:"create-primitive",id:"body",primitive:"box",params:{width:20,depth:16,height:10}});return [await topFace()];}
async function measure(){return inspectSolid({params:cadDocument.features["feature-shell"].params,transform:cadDocument.objects.shell.transform});}

test("inward Shell on a box retains exact walls and bottom",async()=>{
  const box={kind:"box",width:20,depth:16,height:10},mesh=await buildPrimitiveMesh(box);
  const top=mesh.faces!.find(face=>face.key.split("|")[0].endsWith(",10.000000"))!;assert.ok(top);
  const params={kind:"shell",thickness:2,faceKeys:[top.key],source:{params:box}};
  const result=await buildShellMesh(params,true);assert.ok(result.indices.length);
  const measured=await inspectSolid({params});assert.equal(measured.validity,"valid");
  assert.ok(Math.abs(measured.volume!-(3200-16*12*8))<1e-4,`volume ${measured.volume}`);
});

test("Shell review, exact area/volume, Undo/Redo, v21 reload and STEP/STL",async()=>{
  const faceKeys=await setup(),before=documentState();
  const plan=await previewCadCommand({type:"create-shell",targetId:"body",id:"shell",thickness:2,faceKeys});
  assert.ok(plan.result.ok,plan.result.reason);assert.deepEqual(documentState(),before);assert.ok(plan.changes.find(c=>c.objectId==="shell")?.after?.volume);
  assert.ok((await applyCadPlan(plan.planId)).ok);
  const measured=await measure();assert.equal(measured.validity,"valid");assert.ok(Math.abs(measured.volume!-1664)<1e-4);
  // Outer bottom/walls + top rim + inner bottom/walls = 320+720+128+192+448.
  assert.ok(Math.abs(measured.area!-1808)<1e-4,`area ${measured.area}`);
  assert.equal(cadDocument.objects.body.visible,false);assert.deepEqual(cadDocument.features["feature-shell"].inputs,["body"]);
  const bounds=getObjectWorldBounds(cadDocument,"shell");assert.ok(bounds);assert.deepEqual(bounds.min,[0,0,0]);assert.deepEqual(bounds.max,[20,16,10]);
  assert.ok((await collectExportSolids(["shell"])).length);assert.ok((await exportStepBytes(["shell"])).byteLength>100);
  const saved=serializeDocument(cadDocument);assert.equal(JSON.parse(saved).version,21);assert.deepEqual(deserializeDocument(saved).features["feature-shell"],cadDocument.features["feature-shell"]);
  const old=JSON.parse(saved);old.version=20;assert.throws(()=>deserializeDocument(JSON.stringify(old)),/version 21/);
  const after=documentState();assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),after);
});

test("Shell edits and source placement regenerate; changed face requires explicit rebind",async()=>{
  const faceKeys=await setup();await apply({type:"create-shell",id:"shell",targetId:"body",faceKeys,thickness:2});
  await apply({type:"update-shell",objectId:"shell",faceKeys,thickness:1});assert.ok(Math.abs((await measure()).volume!-932)<1e-4);
  await apply({type:"move-object",objectId:"body",translation:[10,5,0]});await apply({type:"rotate-object",objectId:"body",rotation:[0,0,90]});
  assert.ok(Math.abs((await measure()).volume!-932)<1e-4);assert.equal(cadDocument.features["feature-shell"].params.referenceStatus,"resolved");
  await apply({type:"update-primitive",objectId:"body",params:{width:24,depth:16,height:10}});
  assert.equal(cadDocument.features["feature-shell"].params.referenceStatus,"missing");assert.throws(()=>collectStepSolids(["shell"]),/unresolved/);
  await apply({type:"update-shell",objectId:"shell",faceKeys:[await topFace()],thickness:1});
  assert.ok(Math.abs((await measure()).volume!-(3840-22*14*9))<1e-4);assert.equal(collectStepSolids(["shell"]).length,1);
});

test("Shell rejects impossible thickness and invalid face references atomically",async()=>{
  const faceKeys=await setup();
  for(const thickness of [0,1e-8,8,10,100])await reject({type:"create-shell",targetId:"body",faceKeys,thickness});
  await reject({type:"create-shell",targetId:"body",thickness:2,faceKeys:["missing"]});
  await reject({type:"create-shell",targetId:"body",thickness:2,faceKeys:[...faceKeys,...faceKeys]});
  const mesh=await buildPrimitiveMesh(cadDocument.features["feature-body"].params);await reject({type:"create-shell",targetId:"body",thickness:2,faceKeys:mesh.faces!.map(f=>f.key)});
});

test("multiple removed faces and downstream Boolean rebuild from Shell",async()=>{
  const faceKeys=await setup(),mesh=await buildPrimitiveMesh(cadDocument.features["feature-body"].params);
  const bottom=mesh.faces!.find(f=>f.key.split("|")[0].endsWith(",0.000000"))!;
  await apply({type:"create-shell",id:"shell",targetId:"body",thickness:2,faceKeys:[...faceKeys,bottom.key]});
  assert.ok(Math.abs((await measure()).volume!-(3200-16*12*10))<1e-4);
  await apply({type:"create-primitive",id:"tool",primitive:"box",params:{width:2,depth:2,height:10}});
  await apply({type:"boolean-operation",id:"cut",operation:"cut",target:"shell",tool:"tool"});
  const volume=async()=>inspectSolid({params:cadDocument.features["feature-cut"].params});
  assert.ok(Math.abs((await volume()).volume!-1240)<1e-4);
  await apply({type:"update-shell",objectId:"shell",faceKeys:[...faceKeys,bottom.key],thickness:1});
  assert.ok(Math.abs((await volume()).volume!-650)<1e-4);
  await apply({type:"update-primitive",objectId:"body",params:{width:24,depth:16,height:10}});
  assert.throws(()=>collectStepSolids(["cut"]),/unresolved/);
});

test("cylinder Shell independently measures curved walls and bottom",async()=>{
  await apply({type:"create-primitive",id:"body",primitive:"cylinder",params:{radius:10,height:20}});
  const mesh=await buildPrimitiveMesh(cadDocument.features["feature-body"].params);
  const top=mesh.faces!.find(face=>face.key.split("|")[0].endsWith(",20.000000"))!;assert.ok(top);
  await apply({type:"create-shell",id:"shell",targetId:"body",thickness:2,faceKeys:[top.key]});
  const result=await measure();assert.equal(result.validity,"valid");assert.ok(Math.abs(result.volume!-848*Math.PI)<1e-4);
  // Outer bottom/wall, top ring, inner bottom/wall.
  assert.ok(Math.abs(result.area!-(100+400+36+64+288)*Math.PI)<1e-4);
});

test("Shell stale review and malformed saved face metadata cannot be applied",async()=>{
  const faceKeys=await setup();
  const plan=await previewCadCommand({type:"create-shell",targetId:"body",id:"shell",thickness:2,faceKeys});assert.ok(plan.result.ok);
  await apply({type:"move-object",objectId:"body",translation:[1,0,0]});const before=documentState();assert.equal((await applyCadPlan(plan.planId)).ok,false);assert.deepEqual(documentState(),before);
  await apply({type:"create-shell",targetId:"body",id:"shell",thickness:2,faceKeys});
  const file=JSON.parse(serializeDocument(cadDocument));file.document.features["feature-shell"].params.faceKeys=[];assert.throws(()=>deserializeDocument(JSON.stringify(file)),/feature/);
});

test("independent Shell copy saves and exports without live source dependencies",async()=>{
  const faceKeys=await setup();await apply({type:"create-shell",id:"shell",targetId:"body",thickness:2,faceKeys});
  const copy=(await apply({type:"duplicate-object",objectId:"shell",offset:[30,0,0]})).createdIds[0];assert.ok(copy);
  const feature=Object.values(cadDocument.features).find(f=>f.output===copy)!;assert.equal(feature.dependencyMode,"snapshot");assert.deepEqual(feature.inputs,[]);
  await apply({type:"update-shell",objectId:"shell",thickness:1,faceKeys});
  assert.ok(Math.abs((await inspectSolid({params:feature.params})).volume!-1664)<1e-4);
  const saved=serializeDocument(cadDocument);assert.equal(deserializeDocument(saved).features[feature.id].type,"shell");assert.equal(collectStepSolids([copy]).length,1);
  await reject({type:"update-shell",objectId:copy,thickness:1,faceKeys});
});
