import assert from "node:assert/strict";
import {test} from "node:test";
import {cadDocument} from "../src/state/cadDocument";
import {createCadToolSession} from "../src/copilot/cadToolSession";
import {planCadToolPrompt} from "../src/copilot/cadToolPrompts";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {inspectFittedCurve} from "../src/copilot/fittedCurveTools";
import {resetTestDocument,documentState} from "./helpers/documentHarness";
import {serializeDocument,deserializeDocument} from "@agent-webcad/cad-document";
import {extractSketchLoops} from "../src/precision/sketchProfiles";
import {profileRegionMeasurement,profileBoundaryPoints,profileContainsPoint} from "../src/precision/profileRegions";
const context=(ids=["outline"])=>({document:cadDocument,selectionIds:ids,layerId:"layer-default",workPlane:"XY" as const});
async function source(){resetTestDocument();const plan=await createCadToolSession(context([])).plan([{id:"fit",name:"curve.fitted",arguments:{id:"outline",plane:"XY",points:[[0,0,12],[120,0,12],[100,80,12],[0,60,12]],closed:true,tension:.7}}]);assert.ok((await dispatchCadCommand(plan.command)).ok);}
test("one-based language maps signed unit deltas to the exact zero-based shared point tool",async()=>{
 await source();const before=documentState(),language=await planCadToolPrompt("곡선 4번 점 X -2cm 이동",context());assert.ok(language?.ok);
 const structured=await createCadToolSession(context()).plan([{id:"edit",name:"curve.adjust",arguments:{objectId:"outline",pointIndex:3,delta:[-20,0,0]}}]);assert.deepEqual(language.plan.command,structured.command);assert.deepEqual(documentState(),before);
 assert.ok((await dispatchCadCommand(language.plan.command)).ok);assert.deepEqual(inspectFittedCurve(cadDocument,"outline").points,[[0,0,12],[120,0,12],[100,80,12],[-20,60,12]]);
});
test("invalid point indices, zero and normal deltas do not mutate the source",async()=>{
 await source();const before=documentState();for(const prompt of ["곡선 0번 점 X 1mm 이동","곡선 5번 점 X 1mm 이동","곡선 2번 점 X 0mm 이동","곡선 2번 점 Z 1mm 이동","곡선 4번 점 X 1mm 이동 그리고 2번 점 삭제"]){assert.equal((await planCadToolPrompt(prompt,context()))?.ok,false,prompt);assert.deepEqual(documentState(),before);}
});
test("point shortcuts respect exact edit selection and locked source policy",async()=>{
 await source();assert.equal((await planCadToolPrompt("곡선 2번 점 Y 1mm 이동",context([])))?.ok,false);assert.equal((await planCadToolPrompt("곡선 2번 점 Y 1mm 이동",context(["outline","other"])))?.ok,false);
 cadDocument.layers["layer-default"].locked=true;const before=documentState();assert.equal((await planCadToolPrompt("곡선 2번 점 Y 1mm 이동",context()))?.ok,false);assert.deepEqual(documentState(),before);
});
test("closed spline extraction retains the exact basis, stable source key, display and region measurements",async()=>{
 await source();const result=extractSketchLoops(cadDocument,["outline"]);assert.ok(result.ok);const loop=result.loops[0];assert.equal(loop.segments.length,1);assert.equal(loop.segments[0].kind,"spline");assert.equal(loop.sourceObjectIds[0],"outline");assert.equal(loop.normal[2],1);
 const measurement=profileRegionMeasurement(loop,"XY");assert.ok(measurement.area>7000&&measurement.length>300);assert.ok(profileBoundaryPoints(loop,"XY").length>20);assert.equal(profileContainsPoint(loop,[40,30],"XY"),true);assert.equal(profileContainsPoint(loop,[400,300],"XY"),false);
 const key=loop.id;const plan=await planCadToolPrompt("곡선 4번 점 X -20mm 이동",context());assert.ok(plan?.ok);assert.ok((await dispatchCadCommand(plan.plan.command)).ok);const next=extractSketchLoops(cadDocument,["outline"]);assert.ok(next.ok);assert.equal(next.loops[0].id,key);assert.ok(profileRegionMeasurement(next.loops[0],"XY").area>measurement.area);
});
test("exact spline profiles require version 50, including captured operands after source removal",async()=>{
 await source();const result=extractSketchLoops(cadDocument,["outline"]);assert.ok(result.ok);const profile=result.loops[0];
 cadDocument.features.solid={id:"solid",type:"extrude",output:"outline",inputs:[],dependencyMode:"snapshot",params:{kind:"extrude",distance:10,profile}};
 delete cadDocument.features["feature-outline"];const encoded=JSON.parse(serializeDocument(cadDocument));assert.equal(encoded.version,50);assert.doesNotThrow(()=>deserializeDocument(JSON.stringify(encoded)));encoded.version=49;assert.throws(()=>deserializeDocument(JSON.stringify(encoded)),/version 50/);
 encoded.version=50;encoded.document.features.solid.params.profile.segments[0].weights[0]=0;assert.throws(()=>deserializeDocument(JSON.stringify(encoded)),/feature|spline/i);
});
test("self-intersecting and open splines reject while separate contained circle boundaries form holes",async()=>{
 await source();for(const[id,points,closed]of [["cross",[[0,0,0],[100,100,0],[0,100,0],[100,0,0]],true],["open",[[0,0,0],[100,100,0],[0,100,0]],false]] as [string,number[][],boolean][]){const plan=await createCadToolSession(context([])).plan([{id,name:"curve.fitted",arguments:{id,plane:"XY",points,closed,tension:.7}}]);assert.ok((await dispatchCadCommand(plan.command)).ok);assert.equal(extractSketchLoops(cadDocument,[id]).ok,false);}
 const second=await createCadToolSession(context([])).plan([{id:"second",name:"curve.circle",arguments:{id:"circle",plane:"XY",center:[30,30,12],radius:5}}]);assert.ok((await dispatchCadCommand(second.command)).ok);const mixed=extractSketchLoops(cadDocument,["outline","circle"]);assert.ok(mixed.ok);assert.equal(mixed.loops[0].holes?.length,1);
});
