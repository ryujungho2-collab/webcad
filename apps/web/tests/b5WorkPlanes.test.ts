import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { deserializeDocument, serializeDocument, validWorkPlaneFrame, type CadWorkPlane } from "@agent-webcad/cad-document";
import { validateCommand, type CadCommand } from "@agent-webcad/cad-commands";
import { buildPrimitiveMesh } from "../src/cad/kernelGeometryService";
import { exactFaceRange, resolveFaceWorkPlane, resolveStoredWorkPlane } from "../src/state/attachedWorkPlane";
import { planeToWorld, workPlaneToWorld, worldToWorkPlane, WORK_PLANES } from "../src/precision/workPlane";
import { cadDocument } from "../src/state/cadDocument";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { previewCadCommand, applyCadPlan } from "../src/state/documentPlans";
import { cadHistory, undoDocument, redoDocument } from "../src/state/history";
import { documentState, resetTestDocument } from "./helpers/documentHarness";

const free:CadWorkPlane={id:"fixture",name:"Fixture",origin:[10,20,30],xAxis:[0,1,0],yAxis:[0,0,1],normal:[1,0,0]};
async function apply(command:CadCommand){const result=await dispatchCadCommand(command);assert.ok(result.ok,result.reason);return result;}
async function reject(command:CadCommand){const before=documentState(),past=cadHistory.getPastLabels().length;const result=await dispatchCadCommand(command);assert.equal(result.ok,false);assert.deepEqual(documentState(),before);assert.equal(cadHistory.getPastLabels().length,past);}
beforeEach(resetTestDocument);

test("custom orthonormal frame maps world and local millimetres without changing legacy axes",async()=>{
  assert.ok(validWorkPlaneFrame(free));
  const world=planeToWorld([7,-3],free);assert.deepEqual(world,[10,27,27]);assert.deepEqual(worldToWorkPlane(world,free),[7,-3,0]);
  assert.deepEqual(worldToWorkPlane([12,27,27],free),[7,-3,2]);
  assert.deepEqual(workPlaneToWorld([7,-3,2],free),[12,27,27]);
  for(const legacy of Object.values(WORK_PLANES)){const p=planeToWorld([3,4],legacy);assert.deepEqual(worldToWorkPlane(p,legacy),[3,4,0]);}
  assert.equal(validateCommand({type:"upsert-work-plane",plane:{...free,yAxis:[1,0,0]}}),false);
  assert.equal(validateCommand({type:"upsert-work-plane",plane:{...free,id:"__proto__"}}),false);
});

test("free plane previews, applies, saves as v18 and restores through Undo/Redo",async()=>{
  const before=documentState(),past=cadHistory.getPastLabels().length;
  const proposal=await previewCadCommand({type:"upsert-work-plane",plane:free});assert.ok(proposal.result.ok,proposal.result.reason);assert.deepEqual(documentState(),before);assert.equal(proposal.impact?.find(entry=>entry.kind==="Work planes")?.created,1);
  assert.ok((await applyCadPlan(proposal.planId)).ok);assert.equal(cadHistory.getPastLabels().length,past+1);assert.deepEqual(cadDocument.workPlanes?.fixture,free);
  const saved=serializeDocument(cadDocument);assert.equal(JSON.parse(saved).version,18);assert.deepEqual(deserializeDocument(saved).workPlanes?.fixture,free);
  const old=JSON.parse(saved);old.version=17;assert.throws(()=>deserializeDocument(JSON.stringify(old)),/version 18/);
  const after=documentState();assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),after);
  await apply({type:"delete-work-plane",planeId:"fixture"});assert.equal(cadDocument.workPlanes,undefined);assert.ok(undoDocument());assert.deepEqual(cadDocument.workPlanes?.fixture,free);
});

test("exact planar face binding follows placement; lost faces require explicit rebind",async()=>{
  await apply({type:"create-primitive",id:"block",primitive:"box",params:{width:20,depth:10,height:5},position:[3,4,5]});
  const mesh=await buildPrimitiveMesh(cadDocument.features["feature-block"].params),top=mesh.faces!.find(face=>face.key.split("|")[0].endsWith(",5.000000"));assert.ok(top);
  const source={kind:"brep-face" as const,objectId:"block",topologyId:top.key};
  await apply({type:"attach-work-plane-face",id:"top",name:"Top",source});const saved=cadDocument.workPlanes!.top;
  const initial=await resolveStoredWorkPlane(cadDocument,saved);assert.equal(initial.status,"resolved");if(initial.status!=="resolved")return;
  assert.deepEqual(saved.source,source);assert.ok(Math.abs(initial.frame.normal[2]-1)<1e-6,JSON.stringify({normal:initial.frame.normal,key:top.key}));
  await apply({type:"move-object",objectId:"block",translation:[13,4,5]});const moved=await resolveStoredWorkPlane(cadDocument,saved);assert.equal(moved.status,"resolved");if(moved.status==="resolved")assert.ok(Math.abs(moved.frame.origin[0]-initial.frame.origin[0]-10)<1e-6);
  await apply({type:"update-primitive",objectId:"block",params:{width:25,depth:10,height:5}});const missing=await resolveStoredWorkPlane(cadDocument,saved);assert.equal(missing.status,"missing");assert.deepEqual(cadDocument.workPlanes!.top.source,source,"source identity must never drift to a nearest face");
  const revised=await buildPrimitiveMesh(cadDocument.features["feature-block"].params),newTop=revised.faces!.find(face=>face.key.split("|")[0].endsWith(",5.000000"));assert.ok(newTop);
  await apply({type:"rebind-work-plane-face",planeId:"top",source:{...source,topologyId:newTop.key}});assert.equal((await resolveStoredWorkPlane(cadDocument,cadDocument.workPlanes!.top)).status,"resolved");
  assert.equal(JSON.parse(serializeDocument(cadDocument)).version,18);
  await apply({type:"delete-object",objectId:"block"});assert.equal((await resolveStoredWorkPlane(cadDocument,cadDocument.workPlanes!.top)).status,"missing");assert.equal(deserializeDocument(serializeDocument(cadDocument)).workPlanes!.top.source?.objectId,"block");assert.ok(undoDocument());assert.equal((await resolveStoredWorkPlane(cadDocument,cadDocument.workPlanes!.top)).status,"resolved");
});

test("curved, absent and ambiguous face keys reject attachment without document changes",async()=>{
  assert.equal(exactFaceRange([{key:"face:a",start:0,count:2},{key:"face:a",start:2,count:2}],"face:a").status,"ambiguous");
  assert.equal(exactFaceRange([{key:"face:b",start:0,count:2}],"face:a").status,"missing");
  await apply({type:"create-primitive",id:"sphere",primitive:"sphere",params:{radius:10}});
  const mesh=await buildPrimitiveMesh(cadDocument.features["feature-sphere"].params),key=mesh.faces![0].key;
  await reject({type:"attach-work-plane-face",id:"missing",name:"Missing",source:{kind:"brep-face",objectId:"sphere",topologyId:"face:missing"}});
  const curved=await resolveFaceWorkPlane(cadDocument,{kind:"brep-face",objectId:"sphere",topologyId:key});assert.equal(curved.status,"non-planar");
  await reject({type:"attach-work-plane-face",id:"sphere-plane",name:"Sphere",source:{kind:"brep-face",objectId:"sphere",topologyId:key}});
});
