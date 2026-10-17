import assert from "node:assert/strict";
import {beforeEach,test} from "node:test";
import {deserializeDocument,serializeDocument} from "@agent-webcad/cad-document";
import {cadDocument} from "../src/state/cadDocument";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {previewCadCommand,applyCadPlan,discardCadPlan} from "../src/state/documentPlans";
import {cadHistory,undoDocument,redoDocument} from "../src/state/history";
import {parseSketchDimension} from "../src/precision/sketchAnnotations";
import {queryCadDocument} from "../src/state/documentQuery";
import {exportStepBytes} from "../src/export/exportModel";
import {documentState,resetTestDocument} from "./helpers/documentHarness";
beforeEach(resetTestDocument);
const apply=async(command:Parameters<typeof dispatchCadCommand>[0])=>{const r=await dispatchCadCommand(command);assert.ok(r.ok,r.reason);return r;};
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<.001,`${a} ≈ ${b}`);
const feature=(id:string)=>Object.values(cadDocument.features).find(f=>f.output===id)!;
async function sketch(){await apply({type:"create-sketch",id:"sketch",workPlane:"XY"});await apply({type:"add-sketch-geometry",sketchId:"sketch",geometry:{id:"circle",kind:"circle",center:[0,0],radius:5,centerId:"center",curveId:"curve"}});await apply({type:"add-sketch-constraint",sketchId:"sketch",constraint:{id:"diameter",kind:"diameter",geometryId:"circle",value:10}});await apply({type:"create-extrude",id:"solid",profileObjectIds:["circle"],distance:10});}
test("R/Ø unit input preserves driver kind and rejects incompatible dimensions",()=>{
 const radius={id:"r",kind:"radius" as const,geometryId:"circle",value:5},diameter={...radius,kind:"diameter" as const};
 assert.equal(parseSketchDimension(radius,"Ø 2cm"),10);assert.equal(parseSketchDimension(diameter,"R 1in"),50.8);assert.equal(parseSketchDimension(radius,"R 1cm"),10);assert.equal(parseSketchDimension(diameter,"⌀ 1cm"),10);
 for(const value of ["Ø -2mm","R 0mm","R 2deg","Ø NaN","Ø 1e999","R 1/0"] )assert.equal(parseSketchDimension(radius,value),null);
 assert.equal(parseSketchDimension({id:"a",kind:"angle",first:{geometryId:"a"},second:{geometryId:"b"},value:1},"R 2cm"),null);
});
test("cylinder detached review updates exact source and independent copy in one Apply, Undo, reload and STEP",async()=>{
 await apply({type:"create-primitive",id:"cylinder",primitive:"cylinder",params:{radius:5,height:10}});
 const copy=(await apply({type:"duplicate-object",objectId:"cylinder",offset:[20,0,0]})).createdIds[0],copyBefore=structuredClone(feature(copy));
 const before=documentState(),history=cadHistory.getPastLabels().length,review=await previewCadCommand({type:"update-primitive",objectId:"cylinder",params:{radius:10,height:25.4}});
 assert.ok(review.result.ok,review.result.reason);assert.deepEqual(documentState(),before);assert.equal(cadHistory.getPastLabels().length,history);near(review.changes.find(c=>c.objectId==="cylinder")!.after!.volume!,Math.PI*100*25.4);
 assert.ok((await applyCadPlan(review.planId)).ok);discardCadPlan(review.planId);assert.equal(cadHistory.getPastLabels().length,history+1);assert.equal(feature("cylinder").params.radius,10);assert.deepEqual(feature(copy),copyBefore);const after=documentState();assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),after);assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)),cadDocument);assert.ok((await exportStepBytes(["cylinder"])).byteLength>100);
});
test("sketch diameter edit regenerates only connected extrusion; extrusion distance remains independently reviewable",async()=>{
 await sketch();await apply({type:"create-primitive",id:"unrelated",primitive:"cylinder",params:{radius:3,height:4}});const untouched=structuredClone(feature("unrelated")),before=documentState(),history=cadHistory.getPastLabels().length;
 const review=await previewCadCommand({type:"set-sketch-dimension",sketchId:"sketch",constraintId:"diameter",value:parseSketchDimension(cadDocument.sketches!.sketch.constraints[0],"R 1cm")!});assert.ok(review.result.ok,review.result.reason);assert.deepEqual(documentState(),before);assert.ok(review.changes.some(c=>c.objectId==="solid"));assert.ok(!review.changes.some(c=>c.objectId==="unrelated"));near(review.changes.find(c=>c.objectId==="solid")!.after!.volume!,Math.PI*100*10);assert.ok((await applyCadPlan(review.planId)).ok);discardCadPlan(review.planId);assert.equal(cadHistory.getPastLabels().length,history+1);assert.deepEqual(feature("unrelated"),untouched);
 const edit=await previewCadCommand({type:"update-extrude",objectId:"solid",distance:-20});assert.ok(edit.result.ok,edit.result.reason);near(edit.changes.find(c=>c.objectId==="solid")!.after!.volume!,Math.PI*100*20);assert.ok((await applyCadPlan(edit.planId)).ok);discardCadPlan(edit.planId);assert.equal(feature("solid").params.distance,-20);assert.ok((await exportStepBytes(["solid"])).byteLength>100);
});
test("bound driver rejects direct edit; variables review regeneration is atomic and stale reviews cannot apply",async()=>{
 await sketch();await apply({type:"set-variable",name:"size",quantity:"length",expression:"1cm"});await apply({type:"set-parameter-binding",target:{kind:"sketch-constraint",sketchId:"sketch",constraintId:"diameter"},expression:"size"});const before=documentState(),bad=await previewCadCommand({type:"set-sketch-dimension",sketchId:"sketch",constraintId:"diameter",value:20});assert.equal(bad.result.ok,false);assert.match(bad.result.reason!,/driven/);assert.deepEqual(documentState(),before);discardCadPlan(bad.planId);
 const good=await previewCadCommand({type:"set-variable",name:"size",quantity:"length",expression:"2cm"});assert.ok(good.result.ok,good.result.reason);assert.ok(good.changes.some(c=>c.objectId==="solid"));assert.deepEqual(documentState(),before);assert.ok((await applyCadPlan(good.planId)).ok);discardCadPlan(good.planId);near((await queryCadDocument(["solid"])).objects[0].measurement!.volume!,Math.PI*100*10);
 const stale=await previewCadCommand({type:"update-extrude",objectId:"solid",distance:20});await apply({type:"rename-object",objectId:"solid",name:"New name"});const now=documentState();assert.equal((await applyCadPlan(stale.planId)).ok,false);assert.deepEqual(documentState(),now);discardCadPlan(stale.planId);
});
test("locked dependent regeneration blocks the source edit without changing model or history",async()=>{
 await sketch();await apply({type:"create-layer",id:"locked",name:"Locked solid"});await apply({type:"move-object-to-layer",objectId:"solid",layerId:"locked"});await apply({type:"set-layer-locked",layerId:"locked",locked:true});const before=documentState(),history=cadHistory.getPastLabels().length,review=await previewCadCommand({type:"set-sketch-dimension",sketchId:"sketch",constraintId:"diameter",value:20});assert.equal(review.result.ok,false);assert.deepEqual(documentState(),before);assert.equal(cadHistory.getPastLabels().length,history);discardCadPlan(review.planId);
});

test("hidden cylinder source review regenerates live Boolean; locked dependent blocks Apply atomically",async()=>{
 await apply({type:"create-primitive",id:"cylinder",primitive:"cylinder",params:{radius:5,height:10}});
 await apply({type:"create-primitive",id:"tool",primitive:"cylinder",params:{radius:2,height:20}});
 await apply({type:"boolean-operation",id:"cut",operation:"cut",target:"cylinder",tool:"tool"});
 assert.equal(cadDocument.objects.cylinder.visible,false);
 const before=documentState(),review=await previewCadCommand({type:"update-primitive",objectId:"cylinder",params:{radius:10,height:20}});
 assert.ok(review.result.ok,review.result.reason);assert.deepEqual(documentState(),before);near(review.changes.find(c=>c.objectId==="cut")!.after!.volume!,Math.PI*(100-4)*20);
 assert.ok((await applyCadPlan(review.planId)).ok);discardCadPlan(review.planId);
 await apply({type:"create-layer",id:"locked",name:"Locked"});await apply({type:"move-object-to-layer",objectId:"cut",layerId:"locked"});await apply({type:"set-layer-locked",layerId:"locked",locked:true});
 const current=documentState(),blocked=await previewCadCommand({type:"update-primitive",objectId:"cylinder",params:{radius:12,height:20}});assert.equal(blocked.result.ok,false);assert.match(blocked.result.reason!,/locked/);assert.deepEqual(documentState(),current);discardCadPlan(blocked.planId);
});
