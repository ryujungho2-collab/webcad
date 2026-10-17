import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { deserializeDocument, serializeDocument, type SketchGeometry } from "@agent-webcad/cad-document";
import type { CadCommand } from "@agent-webcad/cad-commands";
import { buildPrimitiveMesh } from "../src/cad/kernelGeometryService";
import { cadDocument } from "../src/state/cadDocument";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { undoDocument, redoDocument } from "../src/state/history";
import { previewCadCommand, applyCadPlan } from "../src/state/documentPlans";
import { drawingRenderPoints } from "../src/viewport/drawingRenderer";
import { worldToWorkPlane } from "../src/precision/workPlane";
import { collectStepSolids } from "../src/export/exportModel";
import { resetTestDocument, documentState } from "./helpers/documentHarness";

beforeEach(resetTestDocument);
async function apply(command:CadCommand){const result=await dispatchCadCommand(command);assert.ok(result.ok,result.reason);return result;}
async function reject(command:CadCommand){const before=documentState();const result=await dispatchCadCommand(command);assert.equal(result.ok,false);assert.deepEqual(documentState(),before);return result.reason;}
async function boxFace(id:string,face:(key:string)=>boolean){const mesh=await buildPrimitiveMesh(cadDocument.features[`feature-${id}`].params);const found=mesh.faces?.find(entry=>face(entry.key));assert.ok(found);return {kind:"brep-face" as const,objectId:id,topologyId:found.key};}
const rect:SketchGeometry={id:"face-rectangle",kind:"rectangle",origin:[-3,-2],width:6,height:4,cornerIds:["r0","r1","r2","r3"],edgeIds:["e0","e1","e2","e3"]};

test("face sketch projects a solved dimensioned profile and rebuilds its extrusion after source movement",async()=>{
  await apply({type:"create-primitive",id:"body",primitive:"box",params:{width:20,depth:16,height:5},position:[0,0,0]});
  const source=await boxFace("body",key=>key.split("|")[0].endsWith(",5.000000"));
  await apply({type:"attach-work-plane-face",id:"top",name:"Top face",source});
  const proposal=await previewCadCommand({type:"create-face-sketch",id:"face-sketch",planeId:"top"});assert.ok(proposal.result.ok,proposal.result.reason);assert.equal(cadDocument.sketches?.["face-sketch"],undefined);
  assert.ok((await applyCadPlan(proposal.planId)).ok);const sketch=cadDocument.sketches!["face-sketch"];assert.equal(sketch.faceStatus,"resolved");
  await apply({type:"add-sketch-geometry",sketchId:sketch.id,geometry:rect});
  const projection=cadDocument.features["feature-face-rectangle"],firstPoint=(projection.params.points as number[][])[0];
  assert.deepEqual(worldToWorkPlane(firstPoint as [number,number,number],{id:"top",...sketch.faceFrame!}).slice(0,2),[-3,-2]);
  await apply({type:"add-sketch-constraint",sketchId:sketch.id,constraint:{id:"width",kind:"distance",first:{geometryId:rect.id,pointId:"r0"},second:{geometryId:rect.id,pointId:"r1"},value:6}});
  assert.equal(cadDocument.sketches![sketch.id].dimensions.length,1);
  await apply({type:"set-sketch-dimension",sketchId:sketch.id,constraintId:"width",value:8});
  assert.ok(Math.abs((cadDocument.sketches![sketch.id].geometry[0] as Extract<SketchGeometry,{kind:"rectangle"}>).width-8)<1e-6);
  const extrusion=await apply({type:"create-face-extrude",sketchId:sketch.id,distance:3,id:"raised"});assert.deepEqual(extrusion.createdIds,["raised"]);
  const oldProfile=structuredClone(cadDocument.features["feature-raised"].params.profile);
  const oldPoint=(cadDocument.features["feature-face-rectangle"].params.points as number[][])[0];
  await apply({type:"move-object",objectId:"body",translation:[10,0,0]});
  const shifted=(cadDocument.features["feature-face-rectangle"].params.points as number[][])[0];
  assert.ok(Math.abs(shifted[0]-oldPoint[0]-10)<1e-6);
  assert.notDeepEqual(cadDocument.features["feature-raised"].params.profile,oldProfile);
  assert.equal(cadDocument.sketches![sketch.id].faceStatus,"resolved");
  const movedFrame=structuredClone(cadDocument.sketches![sketch.id].faceFrame);
  await apply({type:"rotate-object",objectId:"body",rotation:[0,0,90]});
  const rotatedFrame=cadDocument.sketches![sketch.id].faceFrame!;
  assert.notDeepEqual(rotatedFrame.xAxis,movedFrame!.xAxis);
  const rotatedPoint=(cadDocument.features["feature-face-rectangle"].params.points as [number,number,number][])[0];
  assert.ok(Math.abs(worldToWorkPlane(rotatedPoint,{id:"top",...rotatedFrame})[0]+3)<1e-6);
  const saved=serializeDocument(cadDocument);assert.equal(JSON.parse(saved).version,19);assert.equal(deserializeDocument(saved).sketches?.[sketch.id].facePlaneId,"top");
  const older=JSON.parse(saved);older.version=18;assert.throws(()=>deserializeDocument(JSON.stringify(older)),/version 19/);
  const after=documentState();assert.ok(undoDocument());assert.ok(redoDocument());assert.deepEqual(documentState(),after);
});

test("changed face key remains unresolved until explicit rebind, then updates projection and extrusion",async()=>{
  await apply({type:"create-primitive",id:"body",primitive:"box",params:{width:20,depth:16,height:5}});
  await apply({type:"attach-work-plane-face",id:"top",name:"Top",source:await boxFace("body",key=>key.split("|")[0].endsWith(",5.000000"))});
  await apply({type:"create-face-sketch",id:"face-sketch",planeId:"top"});
  await apply({type:"add-sketch-geometry",sketchId:"face-sketch",geometry:rect});
  await apply({type:"create-face-extrude",sketchId:"face-sketch",distance:3,id:"raised"});
  const oldPoints=structuredClone(cadDocument.features["feature-face-rectangle"].params.points),oldKey=cadDocument.workPlanes!.top.source!.topologyId;
  await apply({type:"update-primitive",objectId:"body",params:{width:24,depth:16,height:5}});
  assert.equal(cadDocument.sketches!["face-sketch"].faceStatus,"missing");
  assert.equal(cadDocument.workPlanes!.top.source!.topologyId,oldKey);
  assert.deepEqual(cadDocument.features["feature-face-rectangle"].params.points,oldPoints);
  assert.throws(()=>collectStepSolids(["raised"]),/unresolved/);
  assert.match((await reject({type:"create-face-extrude",sketchId:"face-sketch",distance:2}))??"",/unresolved/);
  assert.match((await reject({type:"set-sketch-construction",sketchId:"face-sketch",geometryIds:[rect.id],construction:true}))??"",/missing/);
  const next=await boxFace("body",key=>key.split("|")[0].endsWith(",5.000000"));
  await apply({type:"rebind-work-plane-face",planeId:"top",source:next});
  assert.equal(cadDocument.sketches!["face-sketch"].faceStatus,"resolved");
  assert.notEqual(cadDocument.workPlanes!.top.source!.topologyId,oldKey);
  assert.notDeepEqual(cadDocument.features["feature-face-rectangle"].params.points,oldPoints);
  assert.equal(collectStepSolids(["raised"]).length,1);
  assert.equal(JSON.parse(serializeDocument(cadDocument)).version,19);
});

test("arbitrary side-face circle renders on its frame and produces an exact profile",async()=>{
  await apply({type:"create-primitive",id:"body",primitive:"box",params:{width:20,depth:16,height:5}});
  const side=await boxFace("body",key=>key.split("|")[0].endsWith("20.000000,8.000000,2.500000"));
  await apply({type:"attach-work-plane-face",id:"side",name:"Side",source:side});
  await apply({type:"create-face-sketch",id:"side-sketch",planeId:"side"});
  const circle:SketchGeometry={id:"side-circle",kind:"circle",centerId:"center",curveId:"curve",center:[0,0],radius:2};
  await apply({type:"add-sketch-geometry",sketchId:"side-sketch",geometry:circle});
  const feature=cadDocument.features["feature-side-circle"],frame=cadDocument.sketches!["side-sketch"].faceFrame!;
  const sampled=drawingRenderPoints(feature.params,"XY");
  assert.ok(sampled.length>60&&sampled.every(point=>Math.abs(worldToWorkPlane(point,{id:"side",...frame})[2])<1e-6));
  await apply({type:"add-sketch-constraint",sketchId:"side-sketch",constraint:{id:"radius",kind:"radius",geometryId:circle.id,value:2}});
  await apply({type:"set-sketch-dimension",sketchId:"side-sketch",constraintId:"radius",value:3});
  await apply({type:"create-face-extrude",sketchId:"side-sketch",distance:4,id:"side-boss"});
  assert.ok(Math.abs((cadDocument.features["feature-side-boss"].params.profile as {segments:{kind:string;radius:number}[]}).segments[0].radius-3)<1e-6);
});
