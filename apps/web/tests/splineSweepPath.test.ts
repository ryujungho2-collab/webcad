import assert from "node:assert/strict";
import {test} from "node:test";
import {serializeDocument,deserializeDocument} from "@agent-webcad/cad-document";
import {cadDocument} from "../src/state/cadDocument";
import {resetTestDocument,documentState} from "./helpers/documentHarness";
import {createCadToolSession} from "../src/copilot/cadToolSession";
import {planCadToolPrompt} from "../src/copilot/cadToolPrompts";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {resolveSweepPath} from "../src/precision/sweepPath";
import {getWorldDrawingGeometry} from "../src/precision/worldGeometry";
import {inspectFittedCurve} from "../src/copilot/fittedCurveTools";
const context=(ids:string[]=[])=>({document:cadDocument,selectionIds:ids,layerId:"layer-default",workPlane:"XZ" as const});
const points:[number,number,number][]=[[0,0,18],[0,0,110],[100,0,260],[-60,0,430],[-20,0,620],[140,0,690],[220,0,690]];
async function source(closed=false){resetTestDocument();const plan=await createCadToolSession(context()).plan([{id:"path",name:"curve.fitted",arguments:{id:"path",plane:"XZ",points,closed,tension:.7}}]);assert.ok((await dispatchCadCommand(plan.command)).ok);}
test("exact open path resolver preserves the world NURBS basis under nonuniform placement",async()=>{
 await source();cadDocument.objects.path.transform={translation:[15,20,0],rotation:[0,0,25],scale:[2,1,.8]};
 const spine=resolveSweepPath(cadDocument,"path");assert.ok(!Array.isArray(spine));assert.deepEqual(spine.controlPoints,getWorldDrawingGeometry(cadDocument.objects.path,cadDocument.features["feature-path"])!.spline!.controlPoints);assert.equal(spine.degree,3);assert.equal(spine.controlPoints.length,19);assert.ok(spine.controlPoints.some(p=>Math.abs(p[1]-20)>1));
});
test("closed, hidden, locked and owned paths fail closed; regeneration may consume retained hidden sources",async()=>{
 await source(true);assert.throws(()=>resolveSweepPath(cadDocument,"path"),/open/);await source();cadDocument.objects.path.visible=false;assert.throws(()=>resolveSweepPath(cadDocument,"path"),/visible/);assert.doesNotThrow(()=>resolveSweepPath(cadDocument,"path",true));cadDocument.objects.path.visible=true;cadDocument.layers["layer-default"].locked=true;assert.throws(()=>resolveSweepPath(cadDocument,"path"),/unlocked/);cadDocument.layers["layer-default"].locked=false;cadDocument.features["feature-path"].pattern={} as any;assert.throws(()=>resolveSweepPath(cadDocument,"path",true),/independent/);
});
test("selected and earlier-proposal open fitted splines compile as sweep paths; reversed roles and closed paths reject",async()=>{
 await source();const calls:any=[{id:"circle",name:"curve.circle",arguments:{id:"section",plane:"XY",center:[0,0,18],radius:8}},{id:"sweep",name:"solid.sweep",arguments:{id:"stem",profileObjectIds:["section"],pathObjectId:"path"}}];assert.equal((await createCadToolSession(context(["path"])).plan(calls)).command.type,"batch");await assert.rejects(createCadToolSession(context()).plan(calls),/selected/);
 const created:any={id:"curve",name:"curve.fitted",arguments:{id:"newPath",plane:"XZ",points,closed:false,tension:.7}};calls[1].arguments.pathObjectId="newPath";assert.equal((await createCadToolSession(context()).plan([created,...calls])).command.type,"batch");created.arguments.closed=true;await assert.rejects(createCadToolSession(context()).plan([created,...calls]),/open/);
});
test("local tangent strength compiles to the existing reshape contract, retains points and rejects invalid strength",async()=>{
 await source();const before=documentState(),result=await planCadToolPrompt("곡선 접선 강도 1.0",context(["path"]));assert.ok(result?.ok);assert.deepEqual(documentState(),before);assert.ok((await dispatchCadCommand(result.plan.command)).ok);const actual=inspectFittedCurve(cadDocument,"path");assert.ok(Math.abs(actual.tension-1)<1e-9);assert.deepEqual(actual.points,points);for(const prompt of ["곡선 접선 강도 0","곡선 접선 강도 2","곡선 접선 강도 -1","곡선 접선 강도 1.0 그리고 다른 점 이동"]){const state=documentState();assert.equal((await planCadToolPrompt(prompt,context(["path"])))?.ok,false);assert.deepEqual(documentState(),state);}assert.equal((await planCadToolPrompt("곡선 접선 강도 1",context()))?.ok,false);
});
test("exact spline sweep paths require version 52, validate nested operands and reject corrupted bases",async()=>{
 await source();const spine=resolveSweepPath(cadDocument,"path");cadDocument.features["feature-path"]={id:"feature-path",type:"sweep",output:"path",inputs:[],dependencyMode:"snapshot",params:{kind:"sweep",spine,profile:{id:"p",normal:[0,0,1],segments:[{kind:"circle",topologyReference:"p/c",center:[0,0,18],radius:8}]}}};
 const encoded=JSON.parse(serializeDocument(cadDocument));assert.equal(encoded.version,52);assert.doesNotThrow(()=>deserializeDocument(JSON.stringify(encoded)));encoded.version=51;assert.throws(()=>deserializeDocument(JSON.stringify(encoded)),/version 52/);encoded.version=52;encoded.document.features["feature-path"].params.spine.weights[0]=0;assert.throws(()=>deserializeDocument(JSON.stringify(encoded)),/feature|spline/i);
 cadDocument.features["feature-path"].params={kind:"boolean",operation:"union",operands:[{params:{kind:"sweep",spine}},{params:{kind:"cylinder",radius:2,height:3}}]};const nested=JSON.parse(serializeDocument(cadDocument));assert.equal(nested.version,52);nested.version=51;assert.throws(()=>deserializeDocument(JSON.stringify(nested)),/version 52/);
});
