import test,{beforeEach} from "node:test";
import assert from "node:assert/strict";
import {cadDocument} from "../src/state/cadDocument";
import {resetTestDocument,documentState} from "./helpers/documentHarness";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {previewCadCommand,applyCadPlan,discardCadPlan} from "../src/state/documentPlans";
import {undoDocument,cadHistory} from "../src/state/history";
import {emptyDesignStudy,type DesignSettings} from "../src/copilot/designStudy";
import {confirmedIntent} from "../src/copilot/designIntent";
import {internalIntent,internalAnswerSettings,internalCandidates,internalRefinement,defaultInternalEdit} from "../src/copilot/internalDesignEngine";
import {fitSpline,fittedSplineDefinition} from "../src/precision/fitSpline";
import {inspectFittedCurve} from "../src/copilot/fittedCurveTools";
const settings:DesignSettings={width:10000,depth:8000,tension:.8,variation:.15,parameter:"height"};
const points:[number,number,number][]=[[0,0,0],[10000,0,0],[10000,8000,0],[0,8000,0]];
const args=()=>({document:cadDocument,selectionIds:["curve"],plane:"XY" as const,layerId:"layer-default",settings,edit:{...defaultInternalEdit(),kind:"point" as const,pointIndex:2,dx:-1000,dy:500},marks:[]});
async function curve(){const r=await dispatchCadCommand({type:"create-drawing",id:"curve",drawing:"spline",params:{...fitSpline(points,true,.8),workPlane:"XY"}});assert.ok(r.ok,r.reason);}
beforeEach(()=>resetTestDocument());
test("Internal intent proposes dimensions without mutating requirements or committing unanswered choices",()=>{
 const study=emptyDesignStudy(cadDocument.id,"24m × 18m 유기적인 전시관"),before=documentState();study.brief.requirements="코어 보존";
 const result=internalIntent(study,settings,[],cadDocument);assert.equal(result.settings.width,24000);assert.equal(result.settings.depth,18000);assert.equal(settings.width,10000);assert.equal(result.brief.requirements,"코어 보존");assert.throws(()=>confirmedIntent(result.brief,result.questions,{}),/Answer/);assert.deepEqual(documentState(),before);
 const answers={direction:"오목한 진입면",variation:"강한 차이 / 25%"},brief=confirmedIntent(result.brief,result.questions,answers),updated=internalAnswerSettings(result.settings,answers);
 const rows=internalCandidates(cadDocument,[],"XY","layer-default",{...study,brief},updated);assert.equal(rows[0].id,"threshold");assert.equal(updated.variation,.25);assert.equal(rows.length,3);
 const subtle=internalCandidates(cadDocument,[],"XY","layer-default",{...study,brief},{...updated,variation:.08});assert.notDeepEqual((rows[0].plan.command as any).params.controlPoints,(subtle[0].plan.command as any).params.controlPoints);
});
test("Internal precise point refinement preserves every other source point and publishes with one exact Undo",async()=>{
 await curve();await dispatchCadCommand({type:"move-object",objectId:"curve",translation:[500,300,0]});const before=documentState(),past=cadHistory.getPastLabels().length,transform=structuredClone(cadDocument.objects.curve.transform);
 const row=internalRefinement(args())[0],p=await previewCadCommand(row.plan.command);assert.ok(p.result.ok,p.result.reason);assert.deepEqual(documentState(),before);assert.ok((await applyCadPlan(p.planId)).ok);
 const fit=inspectFittedCurve(cadDocument,"curve");assert.deepEqual(fit.points,points.map((p,i)=>i===2?[p[0]-1000,p[1]+500,p[2]]:p));assert.deepEqual(cadDocument.objects.curve.transform!.rotation,transform!.rotation);assert.deepEqual(cadDocument.objects.curve.transform!.scale,transform!.scale);cadDocument.objects.curve.transform!.translation.forEach((v,i)=>assert.ok(Math.abs(v-transform!.translation[i])<1e-9));assert.equal(cadDocument.rootObjects.length,1);assert.equal(cadHistory.getPastLabels().length,past+1);assert.ok(undoDocument());assert.deepEqual(documentState(),before);discardCadPlan(p.planId);
});
test("Internal marked-region editing uses the exact work plane and only points inside the mark",async()=>{
 await curve();const rows=internalRefinement({...args(),edit:{...defaultInternalEdit(),kind:"inset"},marks:[{viewId:"XY",box:[.9,0,.1,.1],note:"right top"}],view:{id:"XY",label:"Plan",paths:[],bounds:[0,0,10000,8000]}});
 assert.equal(rows.length,3);for(const row of rows){const next=fittedSplineDefinition((row.plan.command as any).spline)!;assert.deepEqual(next.points.filter((_,i)=>i!==2),points.filter((_,i)=>i!==2));assert.notDeepEqual(next.points[2],points[2]);}
 assert.throws(()=>internalRefinement({...args(),plane:"XZ"}),/source curve work plane/);
 assert.throws(()=>internalRefinement({...args(),edit:{...defaultInternalEdit(),kind:"smooth"},marks:[{viewId:"XY",box:[0,0,1,1],note:""}]}),/whole-curve/);
});
test("Internal ambiguous feedback and locked targets cannot silently become edits",async()=>{
 await curve();assert.throws(()=>internalRefinement({...args(),edit:defaultInternalEdit()}),/Internal refinement action/);await dispatchCadCommand({type:"set-layer-locked",layerId:"layer-default",locked:true});assert.throws(()=>internalRefinement(args()),/unlocked/);
});
test("Internal refinement of a staged alternative stays separate and does not require a model",async()=>{
 const study=emptyDesignStudy(cadDocument.id,"전시관"),base=internalCandidates(cadDocument,[],"XY","layer-default",study,settings)[0],before=documentState(),rows=internalRefinement({...args(),selectionIds:[],edit:{...defaultInternalEdit(),kind:"inset"},revision:{label:base.label,feedback:"오목하게",command:base.plan.command}});
 assert.equal(rows.length,3);for(const row of rows){assert.equal(row.origin,"local");const p=await previewCadCommand(row.plan.command);assert.ok(p.result.ok,p.result.reason);discardCadPlan(p.planId);}assert.deepEqual(documentState(),before);
});
test("Internal solid dimension alternatives preserve source identity and use native geometry",async()=>{
 await dispatchCadCommand({type:"create-primitive",id:"box",primitive:"box",params:{width:100,depth:60,height:30}});const before=documentState(),rows=internalRefinement({...args(),selectionIds:["box"],edit:{...defaultInternalEdit(),amount:5}});assert.equal(rows.length,2);
 for(const [i,row] of rows.entries()){const p=await previewCadCommand(row.plan.command);assert.ok(p.result.ok,p.result.reason);assert.ok(Math.abs(p.changes[0].after!.volume!-100*60*[25,35][i])<1e-4);discardCadPlan(p.planId);}assert.deepEqual(documentState(),before);
});
