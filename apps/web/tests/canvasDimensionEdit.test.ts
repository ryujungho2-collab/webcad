import assert from "node:assert/strict";
import { test } from "node:test";
import { CAD_PRECISION } from "@agent-webcad/cad-document";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory, undoDocument, redoDocument } from "../src/state/history";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { applyCadPlan, discardCadPlan, getCadPlanSketchPreview, previewCadCommand } from "../src/state/documentPlans";
import { canvasDimensionDriver, dimensionEditWithReleases, sketchEditImpact } from "../src/state/canvasDimensionEdit";
import { createVariablePlate } from "./helpers/variablePlate";
import { resetTestDocument, documentState } from "./helpers/documentHarness";

const sketch=()=>cadDocument.sketches!["plate-sketch"];
const width=()=>sketch().constraints.find(c=>c.id==="width")!;
const near=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-5,`${actual} ≈ ${expected}`);
async function duplicateWidth(){assert.ok((await dispatchCadCommand({type:"add-sketch-constraint",sketchId:sketch().id,constraint:{...structuredClone(width()),id:"width-lock"}})).ok);}

test("canvas variable edit previews solved intent and exact dependent volume without exposing a writable proposal",async()=>{
  resetTestDocument();await createVariablePlate();const before=documentState(),history=cadHistory.getPastLabels().length;
  const driver=canvasDimensionDriver(cadDocument,sketch(),width());assert.equal(driver.kind,"variable");assert.equal(driver.draft,"100mm");
  const review=await previewCadCommand(driver.command("120"));assert.ok(review.result.ok);
  const sources=getCadPlanSketchPreview(review.planId,sketch().id)!;
  const outline=sources.after.geometry.find(g=>g.id==="outline")!;assert.equal(outline.kind,"rectangle");if(outline.kind!=="rectangle")return;
  near(outline.width,120);near(outline.height,60);near(outline.origin[0],0);near(outline.origin[1],0);
  for(let i=0;i<4;i++){const hole=sources.after.geometry.find(g=>g.id===`hole-${i}`)!;assert.equal(hole.kind,"circle");if(hole.kind!=="circle")continue;near(hole.center[0],10+100*i/3);near(hole.center[1],30);near(hole.radius,4);}
  const solid=review.changes.find(c=>c.objectId==="plate-solid")!;
  const volumeTolerance=(2*(120+60)+8*Math.PI*4)*8*CAD_PRECISION.linearTolerance;
  assert.equal(solid.after?.basis,"brep");assert.equal(solid.after?.validity,"valid");assert.ok(Math.abs(solid.after!.volume!-(120*60-4*Math.PI*16)*8)<volumeTolerance);assert.ok(Math.abs(solid.before!.volume!-(100*60-4*Math.PI*16)*8)<volumeTolerance);
  const impact=sketchEditImpact(sources.before,sources.after,"width");assert.ok(impact.changedGeometryIds.includes("outline"));assert.equal(impact.relations.find(r=>r.id==="height")?.status,"maintained");assert.equal(impact.relations.find(r=>r.id==="width")?.status,"changed");assert.equal(impact.relations.find(r=>r.id==="diameter-3")?.status,"maintained");
  assert.deepEqual(documentState(),before);assert.equal(cadHistory.getPastLabels().length,history);
  outline.width=900;sources.after.constraints=[]; // Rendering code receives detached copies.
  assert.ok((await applyCadPlan(review.planId)).ok);const after=documentState();near((sketch().geometry[0] as typeof outline).width,120);
  assert.equal(cadDocument.variables!.plateWidth.expression,"120mm");assert.equal(Object.keys(cadDocument.parameterBindings!).length,10);
  assert.equal(cadHistory.getPastLabels().length,history+1);assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),after);
});

test("a complex driver edits its binding expression while ordinary dimensions retain unit and signed-angle validation",async()=>{
  resetTestDocument();await createVariablePlate();assert.ok((await dispatchCadCommand({type:"set-parameter-binding",target:{kind:"sketch-constraint",sketchId:sketch().id,constraintId:"width"},expression:"plateWidth + 10mm"})).ok);
  const driver=canvasDimensionDriver(cadDocument,sketch(),width());assert.equal(driver.kind,"binding");const review=await previewCadCommand(driver.command("plateWidth + 20mm"));assert.ok(review.result.ok);assert.ok((await applyCadPlan(review.planId)).ok);
  assert.equal(cadDocument.variables!.plateWidth.expression,"100mm");near((width() as {value:number}).value,120);
  const ordinary=canvasDimensionDriver(cadDocument,sketch(),sketch().constraints.find(c=>c.id==="height")!);assert.equal(ordinary.kind,"dimension");assert.deepEqual(ordinary.command("7cm"),{type:"set-sketch-dimension",sketchId:sketch().id,constraintId:"height",value:70});assert.throws(()=>ordinary.command("-1mm"),/valid dimension/);assert.throws(()=>ordinary.command("70deg"),/valid dimension/);
  const angle=canvasDimensionDriver(cadDocument,sketch(),{id:"angle",kind:"angle",firstLineId:"a",secondLineId:"b",value:Math.PI/2});assert.equal((angle.command("-90deg") as {value:number}).value,-Math.PI/2);assert.throws(()=>angle.command("181deg"),/valid dimension/);
});

test("variable conflict exposes source constraints; explicitly reviewed release and edit form one reversible transaction",async()=>{
  resetTestDocument();await createVariablePlate();await duplicateWidth();const before=documentState(),history=cadHistory.getPastLabels().length;
  const command=canvasDimensionDriver(cadDocument,sketch(),width()).command("120mm");
  const failed=await previewCadCommand(command);assert.equal(failed.result.ok,false);assert.equal(failed.result.diagnostic?.kind,"sketch-conflict");assert.equal(failed.result.diagnostic?.sketchId,sketch().id);assert.ok(failed.result.diagnostic?.constraintIds.includes("width-lock"));assert.ok(failed.result.diagnostic?.geometryIds.includes("outline"));assert.equal(getCadPlanSketchPreview(failed.planId,sketch().id),undefined);assert.deepEqual(documentState(),before);assert.equal(cadHistory.getPastLabels().length,history);
  const preview=await previewCadCommand(dimensionEditWithReleases(command,sketch().id,["width-lock"]));assert.ok(preview.result.ok);
  const sources=getCadPlanSketchPreview(preview.planId,sketch().id)!;assert.equal(sketchEditImpact(sources.before,sources.after,"width").relations.find(r=>r.id==="width-lock")?.status,"released");assert.deepEqual(documentState(),before);
  assert.ok((await applyCadPlan(preview.planId)).ok);const after=documentState();assert.equal(cadHistory.getPastLabels().length,history+1);assert.equal(sketch().constraints.some(c=>c.id==="width-lock"),false);assert.equal(Object.keys(cadDocument.parameterBindings!).length,10);assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),after);
});

test("discarded or stale canvas review cannot apply; invalid driving units and profile failures never mutate history",async()=>{
  resetTestDocument();await createVariablePlate();const driver=canvasDimensionDriver(cadDocument,sketch(),width()),before=documentState(),history=cadHistory.getPastLabels().length;
  for(const draft of ["120deg","holePitch","15mm"]){const preview=await previewCadCommand(driver.command(draft));assert.equal(preview.result.ok,false);assert.deepEqual(documentState(),before);assert.equal(cadHistory.getPastLabels().length,history);if(draft==="15mm"){assert.equal(preview.result.diagnostic?.kind,"regeneration-failed");assert.ok(preview.result.diagnostic?.geometryIds.includes("outline"));}}
  const cancelled=await previewCadCommand(driver.command("120mm"));discardCadPlan(cancelled.planId);assert.equal(getCadPlanSketchPreview(cancelled.planId,sketch().id),undefined);await assert.rejects(applyCadPlan(cancelled.planId),/expired/);
  const stale=await previewCadCommand(driver.command("120mm"));await dispatchCadCommand({type:"rename-object",objectId:"plate-solid",name:"Reviewed plate"});undoDocument();const future=cadHistory.getFutureLabels().length;assert.equal((await applyCadPlan(stale.planId)).ok,false);assert.deepEqual(documentState(),before);assert.equal(cadHistory.getPastLabels().length,history);assert.equal(cadHistory.getFutureLabels().length,future);
});
