import assert from "node:assert/strict";
import {beforeEach,test} from "node:test";
import {serializeDocument,deserializeDocument,type SketchGeometry} from "@agent-webcad/cad-document";
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
async function setup(){
  await apply({type:"create-primitive",id:"body",primitive:"box",params:{width:20,depth:16,height:10}});
  const mesh=await buildPrimitiveMesh(cadDocument.features["feature-body"].params);
  const face=mesh.faces?.find(entry=>entry.key.split("|")[0].endsWith(",10.000000"));assert.ok(face);
  await apply({type:"attach-work-plane-face",id:"top",name:"Top",source:{kind:"brep-face",objectId:"body",topologyId:face.key}});
  await apply({type:"create-face-sketch",id:"sketch",planeId:"top"});
  const rectangle:SketchGeometry={id:"rect",kind:"rectangle",origin:[-3,-2],width:6,height:4,cornerIds:["p0","p1","p2","p3"],edgeIds:["e0","e1","e2","e3"]};
  await apply({type:"add-sketch-geometry",sketchId:"sketch",geometry:rectangle});
  return rectangle;
}
function volume(id:string){const f=cadDocument.features[`feature-${id}`],o=cadDocument.objects[id];return inspectSolid({params:f.params,transform:o.transform});}

test("reviewed face cut removes volume and applies one owned result with one Undo",async()=>{
  await setup();const before=documentState();
  const review=await previewCadCommand({type:"create-face-cut",id:"cut",sketchId:"sketch",targetId:"body",distance:3});
  assert.ok(review.result.ok,review.result.reason);assert.equal(cadDocument.objects.cut,undefined);
  const next=review.changes.find(change=>change.objectId==="cut");assert.ok(next?.after?.volume&&next.after.volume<3200);
  const applied=await applyCadPlan(review.planId);assert.ok(applied.ok,applied.reason);assert.deepEqual(applied.createdIds,["cut"]);
  assert.equal(cadDocument.objects.body.visible,false);assert.equal(cadDocument.rootObjects.includes("body"),true);
  assert.deepEqual(cadDocument.features["feature-cut"].inputs,["body","rect"]);
  const measured=await volume("cut");assert.ok(Math.abs(measured.volume!-3128)<1e-5);assert.equal(measured.validity,"valid");assert.ok(measured.area!>0);
  assert.equal(collectStepSolids(["cut"]).length,1);
  assert.ok((await exportStepBytes(["cut"])).byteLength>100);
  const after=documentState();assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),after);
  assert.ok(deserializeDocument(serializeDocument(cadDocument)).features["feature-cut"]);
});

test("through cut and driving dimension regenerate; reversed cut is rejected atomically",async()=>{
  await setup();
  const original=documentState();const rejected=await dispatchCadCommand({type:"create-face-cut",sketchId:"sketch",targetId:"body",distance:-3});
  assert.equal(rejected.ok,false);assert.deepEqual(documentState(),original);
  await apply({type:"add-sketch-constraint",sketchId:"sketch",constraint:{id:"width",kind:"distance",first:{geometryId:"rect",pointId:"p0"},second:{geometryId:"rect",pointId:"p1"},value:6}});
  await apply({type:"create-face-cut",id:"cut",sketchId:"sketch",targetId:"body",distance:1,through:true});
  assert.ok(Math.abs((await volume("cut")).volume!-2960)<1e-5);
  await apply({type:"set-sketch-dimension",sketchId:"sketch",constraintId:"width",value:8});
  assert.ok(Math.abs((await volume("cut")).volume!-2880)<1e-5);
  await apply({type:"move-object",objectId:"body",translation:[10,0,0]});
  assert.ok(Math.abs((await volume("cut")).volume!-2880)<1e-5);
  await apply({type:"rotate-object",objectId:"body",rotation:[0,0,90]});
  assert.ok(Math.abs((await volume("cut")).volume!-2880)<1e-5);
});

test("changed face identity preserves the reviewed cut for rebind but blocks STEP export",async()=>{
  await setup();await apply({type:"create-face-cut",id:"cut",sketchId:"sketch",targetId:"body",distance:3});
  await apply({type:"update-primitive",objectId:"body",params:{width:24,depth:16,height:10}});
  assert.equal(cadDocument.sketches!.sketch.faceStatus,"missing");
  assert.throws(()=>collectStepSolids(["cut"]),/unresolved/);
  const mesh=await buildPrimitiveMesh(cadDocument.features["feature-body"].params);
  const face=mesh.faces?.find(entry=>entry.key.split("|")[0].endsWith(",10.000000"));assert.ok(face);
  await apply({type:"set-object-visible",objectId:"body",visible:true});
  await apply({type:"rebind-work-plane-face",planeId:"top",source:{kind:"brep-face",objectId:"body",topologyId:face.key}});
  await apply({type:"set-object-visible",objectId:"body",visible:false});
  assert.equal(cadDocument.sketches!.sketch.faceStatus,"resolved");
  assert.ok((await volume("cut")).volume!<3840);
  assert.equal(collectStepSolids(["cut"]).length,1);
});

test("side-face circular sketch cuts along its local normal",async()=>{
  await apply({type:"create-primitive",id:"body",primitive:"box",params:{width:20,depth:16,height:10}});
  const mesh=await buildPrimitiveMesh(cadDocument.features["feature-body"].params);
  const face=mesh.faces?.find(entry=>entry.key.split("|")[0].endsWith("20.000000,8.000000,5.000000"));assert.ok(face);
  await apply({type:"attach-work-plane-face",id:"side",name:"Side",source:{kind:"brep-face",objectId:"body",topologyId:face.key}});
  await apply({type:"create-face-sketch",id:"sketch",planeId:"side"});
  await apply({type:"add-sketch-geometry",sketchId:"sketch",geometry:{id:"circle",kind:"circle",centerId:"c",curveId:"edge",center:[0,0],radius:2}});
  await apply({type:"create-face-cut",id:"cut",sketchId:"sketch",targetId:"body",distance:4});
  assert.ok(Math.abs((await volume("cut")).volume!-(3200-16*Math.PI))<1e-4);
});
