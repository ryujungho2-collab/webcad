import assert from "node:assert/strict";
import {test} from "node:test";
import {cadDocument} from "../src/state/cadDocument";
import {cadHistory,undoDocument,redoDocument} from "../src/state/history";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {previewCadCommand,applyCadPlan,discardCadPlan,getCadPlanDrawingPaths} from "../src/state/documentPlans";
import {queryCadDocument} from "../src/state/documentQuery";
import {resetTestDocument,documentState} from "./helpers/documentHarness";
import {solveSketch} from "../src/precision/sketchSolver";
import {CAD_PRECISION,type Sketch} from "@agent-webcad/cad-document";

test("actual geometry preview creates no document/history change and applies its evaluated IDs once",async()=>{
  resetTestDocument();const initial=documentState(),revision=cadDocument.revision;
  const preview=await previewCadCommand({type:"create-box",width:10,depth:20,height:30});
  assert.equal(preview.result.ok,true);assert.deepEqual(documentState(),initial);assert.equal(cadDocument.revision,revision);assert.equal(cadHistory.getPastLabels().length,0);
  assert.equal(preview.changes[0].after?.volume,6000);
  const id=preview.result.createdIds[0];
  // Public review data is detached from the stored proposal.
  preview.result.createdIds.length=0;preview.changes[0].after!.volume=99;
  const applied=await applyCadPlan(preview.planId);assert.equal(applied.createdIds[0],id);
  const duplicate=await applyCadPlan(preview.planId);assert.equal(duplicate.alreadyApplied,true);assert.equal(duplicate.changed,false);assert.equal(cadHistory.getPastLabels().length,1);
  const after=documentState();assert.equal((await queryCadDocument([id])).objects[0].measurement?.volume,6000);
  assert.ok(undoDocument());assert.deepEqual(documentState(),initial);assert.ok(redoDocument());assert.deepEqual(documentState(),after);
});

test("stale edit after a document change and Undo cannot overwrite the user's history",async()=>{
  resetTestDocument();await dispatchCadCommand({type:"create-box",id:"box",width:10,depth:20,height:30});
  const preview=await previewCadCommand({type:"update-box",objectId:"box",width:12,depth:20,height:30});
  await dispatchCadCommand({type:"rename-object",objectId:"box",name:"User change"});undoDocument();
  const before=documentState(),history=cadHistory.getPastLabels().length,future=cadHistory.getFutureLabels().length;
  const result=await applyCadPlan(preview.planId);assert.equal(result.ok,false);assert.match(result.reason!,/document changed/);
  assert.deepEqual(documentState(),before);assert.equal(cadHistory.getPastLabels().length,history);assert.equal(cadHistory.getFutureLabels().length,future);
});

test("indexed path reads stay detached across repeated reads, Apply and plan disposal",async()=>{
  resetTestDocument();const before=documentState();
  const plan=await previewCadCommand({type:"create-drawing",id:"indexed",drawing:"line",params:{points:[[0,0,0],[25,0,0]],workPlane:"XY"}});
  const original=getCadPlanDrawingPaths(plan.planId,"indexed")!;
  assert.deepEqual(original.after,[[0,0,0],[25,0,0]]);
  const changed=getCadPlanDrawingPaths(plan.planId,"indexed")!;changed.after![1][0]=999;changed.afterClosed=true;
  assert.deepEqual(getCadPlanDrawingPaths(plan.planId,"indexed"),original);assert.deepEqual(documentState(),before);
  assert.equal((await applyCadPlan(plan.planId)).ok,true);
  assert.deepEqual(getCadPlanDrawingPaths(plan.planId,"indexed"),original);
  assert.equal((await queryCadDocument(["indexed"])).objects[0].measurement?.length,25);
  discardCadPlan(plan.planId);assert.equal(getCadPlanDrawingPaths(plan.planId,"indexed"),undefined);
});

test("failed batch preview, invalid payload, abort and discarded plans preserve the complete document",async()=>{
  resetTestDocument();const before=documentState();
  const preview=await previewCadCommand({type:"batch",commands:[{type:"create-box",id:"new",width:1,depth:2,height:3},{type:"delete-object",objectId:"missing"}]});
  assert.equal(preview.result.ok,false);assert.deepEqual(preview.changes,[]);assert.deepEqual(documentState(),before);assert.equal((await applyCadPlan(preview.planId)).changed,false);
  await assert.rejects(previewCadCommand({type:"create-box",width:NaN,depth:1,height:1}),/Invalid CAD command/);
  const abort=new AbortController();abort.abort();await assert.rejects(previewCadCommand({type:"create-layer"},{signal:abort.signal}),/abort/i);
  discardCadPlan(preview.planId);await assert.rejects(applyCadPlan(preview.planId),/expired/);assert.equal(cadHistory.getPastLabels().length,0);
});

test("queries report exact source, public units, dependent objects and locked editability without writable references",async()=>{
  resetTestDocument();await dispatchCadCommand({type:"create-primitive",id:"sphere",primitive:"sphere",params:{radius:3}});
  await dispatchCadCommand({type:"set-layer-locked",layerId:"layer-default",locked:true});
  const before=documentState(),query=await queryCadDocument(["sphere","missing"]);
  assert.equal(query.stale,false);assert.equal(query.units.sketchAngleUnit,"rad");assert.equal(query.objects[0].editable,false);
  assert.equal(query.objects[0].contract?.representation,"brep");assert.equal(query.objects[0].contract?.parameters[0].unit,"mm");
  assert.ok(Math.abs(query.objects[0].measurement!.volume!-36*Math.PI)<1e-6);assert.equal(query.objects[1].error,"Object does not exist");
  query.objects[0].feature!.params.radius=99;assert.deepEqual(documentState(),before);
});

test("local sketch solving separates angle tolerance and preserves geometry at large coordinates",()=>{
  for(const offset of [0,1e9]){
    const sketch:Sketch={id:"precision",layerId:"layer-default",workPlane:"XY",geometry:[
      {id:"a",kind:"line",startId:"as",endId:"ae",segmentId:"ax",start:[offset,offset],end:[offset+10,offset]},
      {id:"b",kind:"line",startId:"bs",endId:"be",segmentId:"bx",start:[offset,offset],end:[offset+0.1,offset+9.9]},
    ],constraints:[{id:"anchor-a",kind:"fixed-point",point:{geometryId:"a",pointId:"as"},value:[offset,offset]},
      {id:"end-a",kind:"fixed-point",point:{geometryId:"a",pointId:"ae"},value:[offset+10,offset]},
      {id:"anchor-b",kind:"fixed-point",point:{geometryId:"b",pointId:"bs"},value:[offset,offset]},
      {id:"length",kind:"distance",first:{geometryId:"b",pointId:"bs"},second:{geometryId:"b",pointId:"be"},value:10},
      {id:"angle",kind:"angle",firstLineId:"a",secondLineId:"b",value:Math.PI/2}],dimensions:[],solveState:{status:"under-constrained",degreesOfFreedom:8,rank:0,residual:0,tolerance:1e-6}};
    const solved=solveSketch(sketch);assert.ok(solved.ok);if(!solved.ok)continue;
    const b=solved.sketch.geometry[1];assert.equal(b.kind,"line");if(b.kind!=="line")continue;
    assert.ok(Math.abs(b.end[0]-offset)<=solved.sketch.solveState.tolerance);assert.ok(Math.abs(b.end[1]-offset-10)<=solved.sketch.solveState.tolerance);
    assert.equal(solved.sketch.solveState.angularTolerance,CAD_PRECISION.angularTolerance);
    if(!offset)assert.ok(Math.abs(Math.atan2(b.end[1]-b.start[1],b.end[0]-b.start[0])-Math.PI/2)<=CAD_PRECISION.angularTolerance);
  }
});
