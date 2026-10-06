import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { CAD_PRECISION, type Sketch } from "@agent-webcad/cad-document";
import type { CadCommand } from "@agent-webcad/cad-commands";
import { cadDocument } from "../src/state/cadDocument";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { applyCadPlan, discardCadPlan, getCadPlanDrawingPaths, getCadPlanSketchPreview, previewCadCommand } from "../src/state/documentPlans";
import { adjustDirectRequest, directEditWithReleases, directRequestCoordinates, planDirectEdit, type DirectEditRequest } from "../src/state/directEditIntent";
import { cadHistory, undoDocument, redoDocument } from "../src/state/history";
import { sketchEditImpact } from "../src/state/canvasDimensionEdit";
import { WORK_PLANES, planeToWorld } from "../src/precision/workPlane";
import { documentState, resetTestDocument } from "./helpers/documentHarness";
import { createVariablePlate } from "./helpers/variablePlate";

beforeEach(resetTestDocument);
const near=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-5,`${actual} ≈ ${expected}`);
const sketch=()=>cadDocument.sketches!["plate-sketch"];
const edge=(delta=20):DirectEditRequest=>({objectId:"outline",target:{kind:"segment",id:"bc",delta:[delta,0,0]},startWorld:[100,30,0],targetWorld:[100+delta,30,0]});
const corner=(x=120,y=80):DirectEditRequest=>({objectId:"outline",target:{kind:"control",id:"c",point:[x,y,0]},startWorld:[100,60,0],targetWorld:[x,y,0]});
async function command(value:CadCommand){const result=await dispatchCadCommand(value);assert.ok(result.ok,result.reason);return result;}
function rectangle(source:Sketch,id="outline"){const geometry=source.geometry.find(g=>g.id===id)!;assert.equal(geometry.kind,"rectangle");if(geometry.kind!=="rectangle")throw new Error("Expected rectangle");return geometry;}
function volume(review:Awaited<ReturnType<typeof previewCadCommand>>,width:number,height:number,radius=4,depth=8,holes=4){
  const measurement=review.changes.find(c=>c.objectId==="plate-solid")!.after!;
  assert.equal(measurement.basis,"brep");assert.equal(measurement.validity,"valid");
  const tolerance=(2*(width+height)+holes*2*Math.PI*radius)*depth*CAD_PRECISION.linearTolerance;
  assert.ok(Math.abs(measurement.volume!-(width*height-holes*Math.PI*radius**2)*depth)<tolerance);
}
function undoRoundtrip(before:ReturnType<typeof documentState>,past:number){const after=documentState();assert.equal(cadHistory.getPastLabels().length,past+1);assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),after);}

test("right-edge intent resizes its variable and all linked holes, previews without mutation and applies one exact Undo step",async()=>{
  await createVariablePlate();const before=documentState(),past=cadHistory.getPastLabels().length;
  const intent=planDirectEdit(cadDocument,edge());assert.equal(intent.command.type,"set-variable");assert.equal(intent.drivers[0].constraintId,"width");
  near(rectangle(intent.requestedSketch!).width,120);
  const review=await previewCadCommand(intent.command);assert.ok(review.result.ok,review.result.reason);
  const sources=getCadPlanSketchPreview(review.planId,sketch().id)!;
  const outline=rectangle(sources.after);near(outline.width,120);near(outline.height,60);assert.deepEqual(outline.origin,[0,0]);assert.deepEqual(outline.cornerIds,["a","b","c","d"]);assert.deepEqual(outline.edgeIds,["ab","bc","cd","da"]);
  for(let i=0;i<4;i++){const hole=sources.after.geometry.find(g=>g.id===`hole-${i}`)!;assert.equal(hole.kind,"circle");if(hole.kind==="circle"){near(hole.center[0],10+100*i/3);near(hole.center[1],30);near(hole.radius,4);}}
  const impact=sketchEditImpact(sources.before,sources.after,"",["outline"]);assert.equal(impact.relations.find(r=>r.id==="width")!.status,"changed");assert.equal(impact.relations.find(r=>r.id==="height")!.status,"maintained");volume(review,120,60);
  assert.deepEqual(documentState(),before);assert.equal(cadHistory.getPastLabels().length,past);
  outline.width=900; // A renderer cannot alter the private evaluated proposal.
  assert.ok((await applyCadPlan(review.planId)).ok);near(rectangle(sketch()).width,120);assert.equal(cadDocument.variables!.plateWidth.expression,"120mm");assert.equal(Object.keys(cadDocument.parameterBindings!).length,10);undoRoundtrip(before,past);
});

test("corner intent changes width and height together without losing anchored geometry or bindings",async()=>{
  await createVariablePlate();const before=documentState(),past=cadHistory.getPastLabels().length;
  const intent=planDirectEdit(cadDocument,corner());assert.equal(intent.command.type,"batch");assert.deepEqual(intent.drivers.map(d=>d.constraintId),["width","height"]);
  const review=await previewCadCommand(intent.command);assert.ok(review.result.ok,review.result.reason);volume(review,120,80);
  assert.deepEqual(documentState(),before);assert.ok((await applyCadPlan(review.planId)).ok);near(rectangle(sketch()).width,120);near(rectangle(sketch()).height,80);assert.equal(Object.keys(cadDocument.parameterBindings!).length,10);undoRoundtrip(before,past);
});

test("coupled driver resize validates the final solid, even when width alone would temporarily intersect a hole with the plate boundary",async()=>{
  await command({type:"create-sketch",id:"plate-sketch",workPlane:"XY"});
  await command({type:"add-sketch-geometry",sketchId:"plate-sketch",geometry:{id:"outline",kind:"rectangle",origin:[0,0],width:100,height:60,cornerIds:["a","b","c","d"],edgeIds:["ab","bc","cd","da"]}});
  for(const constraint of [
    {id:"origin",kind:"fixed-point" as const,point:{geometryId:"outline",pointId:"a"},value:[0,0] as [number,number]},
    {id:"width",kind:"distance" as const,first:{geometryId:"outline",pointId:"a"},second:{geometryId:"outline",pointId:"b"},value:100},
    {id:"height",kind:"distance" as const,first:{geometryId:"outline",pointId:"b"},second:{geometryId:"outline",pointId:"c"},value:60},
  ])await command({type:"add-sketch-constraint",sketchId:"plate-sketch",constraint});
  await command({type:"add-sketch-geometry",sketchId:"plate-sketch",geometry:{id:"hole",kind:"circle",center:[62,30],radius:4,centerId:"center",curveId:"curve"}});
  await command({type:"add-sketch-constraint",sketchId:"plate-sketch",constraint:{id:"center",kind:"fixed-point",point:{geometryId:"hole",pointId:"center"},value:[62,30]}});
  await command({type:"create-extrude",id:"plate-solid",profileObjectIds:["outline","hole"],distance:5});
  await command({type:"batch",label:"Coupled drivers",commands:[{type:"set-variable",name:"w",quantity:"length",expression:"100mm"},{type:"set-variable",name:"h",quantity:"length",expression:"60mm"},
    {type:"set-parameter-binding",target:{kind:"sketch-constraint",sketchId:"plate-sketch",constraintId:"width"},expression:"w"},
    {type:"set-parameter-binding",target:{kind:"sketch-constraint",sketchId:"plate-sketch",constraintId:"height"},expression:"h"},
    {type:"set-parameter-binding",target:{kind:"sketch-constraint",sketchId:"plate-sketch",constraintId:"center",component:"x"},expression:"h + 2mm"},
    {type:"set-parameter-binding",target:{kind:"sketch-constraint",sketchId:"plate-sketch",constraintId:"center",component:"y"},expression:"h / 2"}]});
  const before=documentState(),past=cadHistory.getPastLabels().length;
  const invalid=await previewCadCommand({type:"set-variable",name:"w",quantity:"length",expression:"60mm"});assert.equal(invalid.result.ok,false);discardCadPlan(invalid.planId);
  const review=await previewCadCommand(planDirectEdit(cadDocument,corner(60,30)).command);assert.ok(review.result.ok,review.result.reason);volume(review,60,30,4,5,1);
  const hole=getCadPlanSketchPreview(review.planId,sketch().id)!.after.geometry.find(g=>g.id==="hole")!;assert.equal(hole.kind,"circle");if(hole.kind==="circle"){near(hole.center[0],32);near(hole.center[1],15);}
  assert.deepEqual(documentState(),before);assert.ok((await applyCadPlan(review.planId)).ok);assert.equal(cadDocument.variables!.w.expression,"60mm");assert.equal(cadDocument.variables!.h.expression,"30mm");undoRoundtrip(before,past);
});

test("grip adjustments preserve the dependency of a variable formula and a complex binding expression",async()=>{
  await createVariablePlate();await command({type:"set-variable",name:"plateWidth",quantity:"length",expression:"edgeMargin * 10"});
  let review=await previewCadCommand(planDirectEdit(cadDocument,edge()).command);assert.ok(review.result.ok);assert.ok((await applyCadPlan(review.planId)).ok);
  assert.equal(cadDocument.variables!.plateWidth.expression,"(edgeMargin * 10) + (20mm)");near(rectangle(sketch()).width,120);
  await command({type:"set-variable",name:"edgeMargin",quantity:"length",expression:"11mm"});near(rectangle(sketch()).width,130);
  await command({type:"set-parameter-binding",target:{kind:"sketch-constraint",sketchId:"plate-sketch",constraintId:"width"},expression:"plateWidth + 10mm"});
  review=await previewCadCommand(planDirectEdit(cadDocument,{...edge(10),startWorld:[140,30,0],targetWorld:[150,30,0]}).command);assert.ok(review.result.ok);assert.ok((await applyCadPlan(review.planId)).ok);
  const binding=Object.values(cadDocument.parameterBindings!).find(b=>b.target.kind==="sketch-constraint"&&b.target.constraintId==="width")!;
  assert.equal(binding.expression,"(plateWidth + 10mm) + (10mm)");near(rectangle(sketch()).width,150);assert.equal(cadDocument.variables!.plateWidth.expression,"(edgeMargin * 10) + (20mm)");
});

test("keep-dimensions drag rejects without relaxing relations; explicit release removes its owned binding and edits atomically",async()=>{
  await createVariablePlate();const before=documentState(),past=cadHistory.getPastLabels().length;
  const strict=planDirectEdit(cadDocument,edge(),"geometry");const rejected=await previewCadCommand(strict.command);assert.equal(rejected.result.ok,false);assert.equal(rejected.result.diagnostic?.kind,"sketch-conflict");assert.ok(rejected.result.diagnostic?.constraintIds.includes("width"));assert.deepEqual(documentState(),before);assert.equal(cadHistory.getPastLabels().length,past);discardCadPlan(rejected.planId);
  const review=await previewCadCommand(directEditWithReleases(strict.command,sketch().id,["width"]));assert.ok(review.result.ok,review.result.reason);volume(review,120,60);
  assert.equal(review.bindingChanges.filter(b=>!b.after).length,1);assert.deepEqual(documentState(),before);assert.ok((await applyCadPlan(review.planId)).ok);
  assert.equal(cadDocument.variables!.plateWidth.expression,"100mm");assert.equal(Object.keys(cadDocument.parameterBindings!).length,9);assert.ok(!sketch().constraints.some(c=>c.id==="width"));near(rectangle(sketch()).width,120);undoRoundtrip(before,past);
});

for(const planeId of ["XY","XZ","YZ"] as const)test(`${planeId}: rotated rectangle edge changes its local width while preserving orientation, origin and stable handles`,async()=>{
  const angle=30*Math.PI/180;await command({type:"create-sketch",id:"plate-sketch",workPlane:planeId});
  await command({type:"add-sketch-geometry",sketchId:"plate-sketch",geometry:{id:"outline",kind:"rectangle",origin:[10,20],width:100,height:60,angle,cornerIds:["a","b","c","d"],edgeIds:["ab","bc","cd","da"]}});
  await command({type:"add-sketch-constraint",sketchId:"plate-sketch",constraint:{id:"width",kind:"distance",first:{geometryId:"outline",pointId:"a"},second:{geometryId:"outline",pointId:"b"},value:100}});
  const delta=planeToWorld([20*Math.cos(angle),20*Math.sin(angle)],WORK_PLANES[planeId]);
  const request={...edge(),target:{kind:"segment" as const,id:"bc",delta},startWorld:planeToWorld([96.6025403784,70],WORK_PLANES[planeId]),targetWorld:planeToWorld([113.9230484541,80],WORK_PLANES[planeId])};
  const review=await previewCadCommand(planDirectEdit(cadDocument,request).command);assert.ok(review.result.ok,review.result.reason);const outline=rectangle(getCadPlanSketchPreview(review.planId,sketch().id)!.after);
  near(outline.width,120);near(outline.height,60);near(outline.angle!,angle);assert.deepEqual(outline.origin,[10,20]);assert.deepEqual(outline.edgeIds,["ab","bc","cd","da"]);assert.ok((await applyCadPlan(review.planId)).ok);
});

test("radius grip edits a diameter variable and previews every linked hole plus exact dependent volume",async()=>{
  await createVariablePlate();const before=documentState(),past=cadHistory.getPastLabels().length;
  const request:DirectEditRequest={objectId:"hole-3",target:{kind:"control",id:"hole-3:radius:0",point:[95,30,0]},startWorld:[94,30,0],targetWorld:[95,30,0]};
  const intent=planDirectEdit(cadDocument,request);assert.equal(intent.drivers[0].constraintId,"diameter-3");near(intent.drivers[0].after,10);
  const review=await previewCadCommand(intent.command);assert.ok(review.result.ok,review.result.reason);volume(review,100,60,5);
  for(const g of getCadPlanSketchPreview(review.planId,sketch().id)!.after.geometry.filter(g=>g.kind==="circle"))near(g.radius,5);
  assert.deepEqual(documentState(),before);assert.ok((await applyCadPlan(review.planId)).ok);assert.equal(cadDocument.variables!.holeDiameter.expression,"10mm");assert.equal(Object.keys(cadDocument.parameterBindings!).length,10);undoRoundtrip(before,past);
});

test("ordinary handle and segment intent preserve drawing elevation, expose detached paths and reject stale Apply",async()=>{
  await command({type:"create-drawing",id:"line",drawing:"line",params:{workPlane:"XY",points:[[0,0,7],[100,0,7]]}});
  const feature=()=>Object.values(cadDocument.features).find(f=>f.output==="line")!;
  const topology=feature().params.topology as {controls:{id:string}[];segments:{id:string}[]};
  const request:DirectEditRequest={objectId:"line",target:{kind:"control",id:topology.controls[1].id,point:[120,20,7]},startWorld:[100,0,7],targetWorld:[120,20,7]};
  assert.deepEqual(directRequestCoordinates(cadDocument,request),[120,20]);const adjusted=adjustDirectRequest(cadDocument,request,130,30);assert.deepEqual(adjusted.target.kind==="control"&&adjusted.target.point,[130,30,7]);assert.deepEqual(adjusted.targetWorld,[130,30,7]);
  const before=documentState(),past=cadHistory.getPastLabels().length,review=await previewCadCommand(planDirectEdit(cadDocument,adjusted).command);assert.ok(review.result.ok);
  const paths=getCadPlanDrawingPaths(review.planId,"line")!;assert.deepEqual(paths.before,[[0,0,7],[100,0,7]]);assert.deepEqual(paths.after,[[0,0,7],[130,30,7]]);paths.after![1][0]=999;
  assert.deepEqual(documentState(),before);assert.ok((await applyCadPlan(review.planId)).ok);assert.deepEqual(feature().params.points,[[0,0,7],[130,30,7]]);undoRoundtrip(before,past);
  const move:DirectEditRequest={objectId:"line",target:{kind:"segment",id:topology.segments[0].id,delta:[20,10,0]},startWorld:[65,15,7],targetWorld:[85,25,7]};
  const moved=adjustDirectRequest(cadDocument,move,30,20);assert.deepEqual(moved.targetWorld,[95,35,7]);
  const pending=await previewCadCommand(planDirectEdit(cadDocument,moved).command);assert.ok(pending.result.ok);assert.deepEqual(getCadPlanDrawingPaths(pending.planId,"line")!.after,[[30,20,7],[160,50,7]]);
  assert.ok(undoDocument());const staleBefore=documentState();assert.equal((await applyCadPlan(pending.planId)).ok,false);assert.deepEqual(documentState(),staleBefore);
});

test("a rotated and scaled drawing handle stays at its world target and leaves the opposite endpoint fixed",async()=>{
  await command({type:"create-drawing",id:"line",drawing:"line",params:{workPlane:"XY",points:[[0,0,7],[100,0,7]]}});
  await command({type:"batch",commands:[{type:"move-object",objectId:"line",translation:[10,20,0]},{type:"rotate-object",objectId:"line",rotation:[0,0,90]},{type:"scale-object",objectId:"line",scale:[2,2,1]}]});
  const feature=()=>Object.values(cadDocument.features).find(f=>f.output==="line")!;
  const topology=feature().params.topology as {controls:{id:string}[];segments:{id:string}[]};
  const request:DirectEditRequest={objectId:"line",target:{kind:"control",id:topology.controls[1].id,point:[120,20,7]},startWorld:[60,120,7],targetWorld:[20,160,7]};
  const adjusted=adjustDirectRequest(cadDocument,request,130,30);near(adjusted.targetWorld[0],0);near(adjusted.targetWorld[1],180);near(adjusted.targetWorld[2],7);
  const before=documentState(),past=cadHistory.getPastLabels().length,intent=planDirectEdit(cadDocument,adjusted),review=await previewCadCommand(intent.command);assert.ok(review.result.ok,review.result.reason);
  const paths=getCadPlanDrawingPaths(review.planId,"line")!;
  for(const path of [paths.after,intent.requestedPath]){near(path![0][0],60);near(path![0][1],-80);near(path![1][0],0);near(path![1][1],180);near(path![1][2],7);}
  assert.deepEqual(documentState(),before);assert.ok((await applyCadPlan(review.planId)).ok);undoRoundtrip(before,past);
  const move:DirectEditRequest={objectId:"line",target:{kind:"segment",id:topology.segments[0].id,delta:[30,20,0]},startWorld:[30,50,7],targetWorld:[-10,110,7]};
  const moved=await previewCadCommand(planDirectEdit(cadDocument,move).command);assert.ok(moved.result.ok);const after=getCadPlanDrawingPaths(moved.planId,"line")!.after!;
  near(after[0][0],20);near(after[0][1],-20);near(after[1][0],-40);near(after[1][1],240);assert.ok((await applyCadPlan(moved.planId)).ok);
});
