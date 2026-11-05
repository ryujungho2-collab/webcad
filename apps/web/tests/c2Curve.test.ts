import {serializeDocument,deserializeDocument} from "@agent-webcad/cad-document";
import test from "node:test";import assert from "node:assert/strict";
import {fitSpline,fittedSplineDefinition} from "../src/precision/fitSpline";
import {cubicJoinReport} from "../src/precision/cubicTangents";
import {splinePoint,splineArea} from "../src/precision/splineGeometry";
import {chairSeat,chairFrame,chairFrameInner,periodicArea} from "./helpers/chairFixture";
import {cadDocument} from "../src/state/cadDocument";
import {resetTestDocument,documentState} from "./helpers/documentHarness";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {createCadToolSession} from "../src/copilot/cadToolSession";
import {planCadToolPrompt} from "../src/copilot/cadToolPrompts";
import {inspectFittedCurve} from "../src/copilot/fittedCurveTools";
import {extractSketchLoops} from "../src/precision/sketchProfiles";
const context=(ids:string[]=["source"])=>({document:cadDocument,selectionIds:ids,layerId:"layer-default",workPlane:"XZ" as const});
async function source(continuity="C1"){resetTestDocument();const p=await createCadToolSession(context([])).plan([{id:"curve",name:"curve.fitted",arguments:{id:"source",plane:"XZ",points:chairSeat,closed:true,tension:continuity==="C2"?1:.7,continuity}}]);assert.ok((await dispatchCadCommand(p.command)).ok);}
test("natural and periodic C2 interpolation preserve every anchor, analytic join derivatives and closed seam",()=>{
 for(const closed of [false,true]){const s=fitSpline(chairSeat as any,closed,1,"C2"),r=cubicJoinReport(s.controlPoints,closed);for(let i=0;i<chairSeat.length;i++)assert.ok(Math.hypot(...splinePoint(s,i).map((x,j)=>x-chairSeat[i][j]))<1e-9);assert.ok(r.maxFirstDerivativeGap<1e-9&&r.maxSecondDerivativeGap<1e-9&&r.maxCurvatureVectorGap<1e-10);assert.equal(r.closedSeamIncluded,closed);assert.equal(fittedSplineDefinition(s)!.continuity,"C2");if(!closed){const p=s.controlPoints;for(const q of [[p[0],p[1],p[2]],[p.at(-1)!,p.at(-2)!,p.at(-3)!]])assert.ok(Math.hypot(...q[0].map((x,j)=>x-2*q[1][j]+q[2][j]))<1e-9);}}
 const c1=cubicJoinReport(fitSpline(chairSeat as any,true,.7).controlPoints,true);assert.ok(c1.maxCurvatureVectorGap>1e-4);assert.throws(()=>fitSpline(chairSeat as any,true,.7,"C2"),/strength 1/);
});
test("periodic cubic area agrees with an independent Fourier second-derivative oracle",()=>{for(const p of [chairSeat,chairFrame,chairFrameInner])assert.ok(Math.abs(splineArea(fitSpline(p as any,true,1,"C2"))!-periodicArea(p))<1e-6);});
test("C2 chair profiles remain simple, with a contained exact spline frame hole",async()=>{
 await source("C2");assert.ok(extractSketchLoops(cadDocument,["source"]).ok);for(const[id,points]of [["frame",chairFrame],["inner",chairFrameInner]] as const){const p=await createCadToolSession(context([])).plan([{id,name:"curve.fitted",arguments:{id,plane:"XZ",points,closed:true,tension:1,continuity:"C2"}}]);assert.ok((await dispatchCadCommand(p.command)).ok);}const frame=extractSketchLoops(cadDocument,["frame","inner"]);assert.ok(frame.ok,frame.ok?undefined:frame.reason);assert.equal(frame.loops[0].holes?.length,1);
});
test("human-equivalent reshape, bounded language and point edits retain C2 without inventing fit metadata",async()=>{
 await source();const before=documentState(),language=await planCadToolPrompt("곡선 C2 연속으로 변경",context());assert.ok(language?.ok);const p=await createCadToolSession(context()).plan([{id:"c2",name:"curve.reshape",arguments:{objectId:"source",points:chairSeat,tension:1,continuity:"C2"}}]);assert.deepEqual(language.plan.command,p.command);assert.deepEqual(documentState(),before);assert.ok((await dispatchCadCommand(p.command)).ok);let c=inspectFittedCurve(cadDocument,"source");assert.equal(c.continuity,"C2");assert.ok(c.continuityReport.maxCurvatureVectorGap<1e-10);const edit=await createCadToolSession(context()).plan([{id:"point",name:"curve.adjust",arguments:{objectId:"source",pointIndex:4,delta:[-5,0,0]}}]);assert.ok((await dispatchCadCommand(edit.command)).ok);c=inspectFittedCurve(cadDocument,"source");assert.equal(c.continuity,"C2");assert.equal(c.points[4][0],chairSeat[4][0]-5);assert.ok(c.continuityReport.maxSecondDerivativeGap<1e-8);assert.equal((await planCadToolPrompt("곡선 접선 강도 0.8",context()))?.ok,false);
});
test("C2 diagnostics mark stationary joins rather than claiming a defined curvature",()=>{const p:any=[[0,0,0],[1,0,0],[2,0,0],[2,0,0],[2,0,0],[2,1,0],[2,2,0]],r=cubicJoinReport(p,false);assert.equal(r.stationaryJoinCount,1);});

test("design-study point alternatives preserve C2 and strength-only smoothing is explicitly refused",async()=>{
 const {internalRefinement,defaultInternalEdit}=await import("../src/copilot/internalDesignEngine");await source("C2");const args={document:cadDocument,selectionIds:["source"],plane:"XZ" as const,layerId:"layer-default",settings:{width:1000,depth:1000,tension:1,variation:.1,parameter:"height"},edit:{...defaultInternalEdit(),kind:"point" as const,pointIndex:4,dx:-8,dy:0},marks:[]};const before=documentState(),rows=internalRefinement(args);assert.equal(rows.length,1);assert.equal(fittedSplineDefinition((rows[0].plan.command as any).spline)!.continuity,"C2");assert.deepEqual(documentState(),before);assert.throws(()=>internalRefinement({...args,edit:{...defaultInternalEdit(),kind:"smooth"}}),/C2 computes linked tangents/);
});

test("explicit C2 policy resolves symmetric ambiguity, survives version 53 and clears on C1 conversion or raw pole editing",async()=>{
 const points:any=[[0,0,0],[100,0,0],[100,100,0],[0,100,0]],cardinal=fitSpline(points,true,1.5),c2=fitSpline(points,true,1,"C2");assert.ok(cardinal.controlPoints.every((p,i)=>p.every((x,j)=>Math.abs(x-c2.controlPoints[i][j])<1e-9)));assert.equal(fittedSplineDefinition(cardinal)!.continuity,"C1");assert.equal(fittedSplineDefinition(c2)!.continuity,"C2");
 await source("C2");let file=JSON.parse(serializeDocument(cadDocument));assert.equal(file.version,53);assert.doesNotThrow(()=>deserializeDocument(JSON.stringify(file)));file.version=52;assert.throws(()=>deserializeDocument(JSON.stringify(file)),/version 53/);
 const corrupt=structuredClone(c2);corrupt.controlPoints[1][0]+=2;assert.equal(fittedSplineDefinition(corrupt),undefined);
 let change=await createCadToolSession(context()).plan([{id:"mode",name:"curve.reshape",arguments:{objectId:"source",points:chairSeat,tension:1,continuity:"C1"}}]);assert.ok((await dispatchCadCommand(change.command)).ok);assert.equal(cadDocument.features["feature-source"].params.fitContinuity,undefined);assert.equal(inspectFittedCurve(cadDocument,"source").continuity,"C1");
 await source("C2");const raw:any=structuredClone(cadDocument.features["feature-source"].params);delete raw.fitContinuity;assert.ok((await dispatchCadCommand({type:"update-spline",objectId:"source",spline:raw})).ok);assert.equal(cadDocument.features["feature-source"].params.fitContinuity,undefined);
});
