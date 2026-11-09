import test from "node:test";
import assert from "node:assert/strict";
import {cadDocument} from "../src/state/cadDocument";
import {resetTestDocument,documentState} from "./helpers/documentHarness";
import {createCadToolSession} from "../src/copilot/cadToolSession";
import {previewCadCommand,applyCadPlan,discardCadPlan} from "../src/state/documentPlans";
import {undoDocument} from "../src/state/history";
import {measureDocumentObject} from "../src/state/documentQuery";
import type {CadToolCall} from "../src/copilot/cadToolContract";
const c=(name:CadToolCall["name"],args:Record<string,unknown>,id=crypto.randomUUID()):CadToolCall=>({id,name,arguments:args});
const finish={name:"Warm plaster",color:"#ede6db",roughness:.8,metalness:0,opacity:1};
const ctx=(selectionIds:string[]=[])=>({document:cadDocument,selectionIds,layerId:"layer-default",workPlane:"XY" as const});
test("A basement floor with a linked stair hole, layer and material is one detached review and Undo",async()=>{
 resetTestDocument();const before=documentState(),calls=[c("curve.polyline",{id:"outer",plane:"XY",points:[[0,0,0],[6000,0,0],[6000,8000,0],[0,8000,0]],closed:true}),c("curve.polyline",{id:"hole",plane:"XY",points:[[3000,3000,0],[5000,3000,0],[5000,6000,0],[3000,6000,0]],closed:true}),c("slab.create",{id:"floor",profileObjectIds:["outer","hole"],kind:"floor",level:-3000,thickness:250}),c("scene.layer",{id:"basement",name:"B1 basement",color:"#a9aaa3"}),c("scene.objects",{objects:[{objectId:"floor",name:"B1 / floor -3.000"}],layerId:"basement",visible:true,finish})];
 const p=await createCadToolSession(ctx()).plan(calls),preview=await previewCadCommand(p.command);assert.ok(preview.result.ok,preview.result.reason);assert.deepEqual(documentState(),before);assert.ok((await applyCadPlan(preview.planId)).ok);assert.equal(cadDocument.objects.floor.name,"B1 / floor -3.000");assert.equal(cadDocument.objects.floor.layerId,"basement");assert.equal(cadDocument.objects.outer.visible,false);const f=Object.values(cadDocument.features).find(f=>f.output==="floor")!;assert.deepEqual(f.params.solidFinish,finish);assert.deepEqual(f.inputs,["outer","hole"]);assert.ok(Math.abs((await measureDocumentObject(cadDocument,"floor")).volume!-42000000*250)<1);assert.ok(undoDocument());assert.deepEqual(documentState(),before);discardCadPlan(preview.planId);
});
test("Scene tools preserve selection/lock boundaries and cannot style imaginary or non-solid outputs",async()=>{
 resetTestDocument();for(const calls of [[c("scene.objects",{objects:[{objectId:"missing"}],layerId:"layer-default",visible:true,finish})],[c("scene.layer",{id:"layer-default",name:"replace",color:"#000000"})],[c("curve.polyline",{id:"line",plane:"XY",points:[[0,0,0],[1,0,0]],closed:false}),c("scene.objects",{objects:[{objectId:"line"}],layerId:"layer-default",visible:true,finish})]])await assert.rejects(createCadToolSession(ctx()).plan(calls));
 const plan=await createCadToolSession(ctx()).plan([c("solid.primitive",{id:"box",primitive:"box",params:{width:100,depth:100,height:100},position:[0,0,0]})]);const preview=await previewCadCommand(plan.command);assert.ok((await applyCadPlan(preview.planId)).ok);discardCadPlan(preview.planId);await assert.rejects(createCadToolSession(ctx()).plan([c("scene.objects",{objects:[{objectId:"box"}],layerId:"layer-default",visible:true,finish})]),/Select/);
});
test("Architecture composition rejects open, elevated, forward or arbitrary tool sources atomically",async()=>{
 resetTestDocument();for(const props of [{closed:false,plane:"XY",points:[[0,0,0],[100,0,0],[100,100,0]]},{closed:true,plane:"XY",points:[[0,0,5],[100,0,5],[100,100,5]]}])await assert.rejects(createCadToolSession(ctx()).plan([c("curve.polyline",{id:"profile",...props}),c("slab.create",{id:"floor",profileObjectIds:["profile"],kind:"floor",level:0,thickness:200})]),/profiles/);
 await assert.rejects(createCadToolSession(ctx()).plan([c("slab.create",{id:"floor",profileObjectIds:["profile"],kind:"floor",level:0,thickness:200}),c("curve.polyline",{id:"profile",plane:"XY",points:[[0,0,0],[100,0,0],[100,100,0]],closed:true})]),/Select/);assert.equal(Object.keys(cadDocument.objects).length,0);
});


test("One explicit scene delta moves a selected fixture and its native symbol as one Undo",async()=>{
 resetTestDocument();const plan=await createCadToolSession(ctx()).plan([c("solid.primitive",{id:"fixture",primitive:"box",params:{width:400,depth:650,height:430},position:[9700,20200,3300]}),c("curve.polyline",{id:"symbol",plane:"XY",points:[[9700,20200,0],[10100,20200,0],[10100,20850,0],[9700,20850,0]],closed:true})]);const p=await previewCadCommand(plan.command);assert.ok((await applyCadPlan(p.planId)).ok);const before=documentState();
 const move=await createCadToolSession(ctx(["fixture","symbol"])).plan([c("scene.objects",{objects:[{objectId:"fixture",delta:[900,0,0]},{objectId:"symbol",delta:[900,0,0]}],layerId:"layer-default",visible:true})]);const preview=await previewCadCommand(move.command);assert.ok(preview.result.ok,preview.result.reason);assert.deepEqual(documentState(),before);assert.ok((await applyCadPlan(preview.planId)).ok);const m=await measureDocumentObject(cadDocument,"fixture");assert.equal(m.bounds!.min[0],10600);assert.ok(Math.abs(m.volume!-400*650*430)<1);assert.equal(cadDocument.objects.symbol.transform!.translation[0],900);const read=await createCadToolSession(ctx()).read(c("cad.measure",{objectIds:["symbol"]}));assert.ok(read.ok);assert.deepEqual((read.result as any)[0].measurement.bounds.min,[10600,20200,0]);assert.ok(undoDocument());assert.deepEqual(documentState(),before);
});
