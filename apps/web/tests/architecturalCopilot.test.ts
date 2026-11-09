import test,{beforeEach} from "node:test";
import assert from "node:assert/strict";
import {cadDocument} from "../src/state/cadDocument";
import {resetTestDocument,documentState} from "./helpers/documentHarness";
import {planCadToolPrompt} from "../src/copilot/cadToolPrompts";
import {architecturalScopeIssue} from "../src/copilot/architecturalScope";
import {planCopilotCommand} from "../src/copilot/copilotPlan";
import {internalCandidates} from "../src/copilot/internalDesignEngine";
import {emptyDesignStudy} from "../src/copilot/designStudy";
import {previewCadCommand,applyCadPlan,discardCadPlan} from "../src/state/documentPlans";
import {undoDocument} from "../src/state/history";
import {collectExportAnnotations} from "../src/export/exportModel";
const context=()=>({document:cadDocument,selectionIds:[],layerId:"layer-default",workPlane:"XY" as const});
export const academicPrompt="84m × 66m 대지에 2층 도시수리학교 졸업설계. 기존 24m × 18m 건물 보존, 공공 동선, 작업실·강의실·도서관 프로그램, 두 계단과 승강기, 1층·2층 평면도와 단면을 설계해줘. 사각형 외곽과 실별 면적도 포함.";
beforeEach(()=>resetTestDocument());
test("Architectural brief is not silently reduced to one rectangle by either internal planner",async()=>{
 const before=documentState();for(const result of [planCopilotCommand(academicPrompt),await planCadToolPrompt(academicPrompt,context())]){assert.ok(result&&!result.ok);if(result&&!result.ok)assert.match(result.reason,/건축 과제 범위 미지원/);}assert.deepEqual(documentState(),before);
 const study=emptyDesignStudy(cadDocument.id,academicPrompt);assert.throws(()=>internalCandidates(cadDocument,[],"XY","layer-default",study,{width:24000,depth:18000,tension:.8,variation:.15,parameter:""}),/범위 미지원/);
 assert.equal(planCopilotCommand("24000x18000mm 사각형 외곽만").ok,true);assert.equal(architecturalScopeIssue("전시관 코어 보존 / 오목한 진입면"),undefined);
});
test("Designer-supplied structured text and measured dimensions are native, detached and one Undo",async()=>{
 const before=documentState(),result=await planCadToolPrompt(JSON.stringify({version:1,toolCalls:[{id:"label",name:"draft.text",arguments:{id:"label",plane:"XY",point:[1000,2000,0],text:"수리학교 / <literal>",height:200}},{id:"dimension",name:"draft.linearDimension",arguments:{id:"dim",plane:"XY",points:[[0,0],[24000,0]],orientation:"horizontal",offset:1000,paperScale:100}}]}),context());assert.ok(result?.ok);if(!result?.ok)return;
 const p=await previewCadCommand(result.plan.command);assert.ok(p.result.ok,p.result.reason);assert.deepEqual(documentState(),before);assert.ok((await applyCadPlan(p.planId)).ok);const a=collectExportAnnotations("XY");assert.ok(a.texts.some(t=>t.text.includes("수리학교")));assert.ok(a.texts.some(t=>t.text.replaceAll(",","").includes("24000")));assert.ok(undoDocument());assert.deepEqual(documentState(),before);discardCadPlan(p.planId);
});
test("Structured input cannot bypass tool schema, ownership or nonzero measured-span validation",async()=>{
 for(const toolCalls of [[{id:"x",name:"execute-python",arguments:{code:"x"}}],[{id:"x",name:"draft.linearDimension",arguments:{id:"d",plane:"XY",points:[[0,0],[0,1000]],orientation:"horizontal",offset:100,paperScale:100}}],[{id:"x",name:"draft.text",arguments:{id:"t",plane:"XY",point:[0,0,0],text:"x",height:1,html:"script"}}]]){const result=await planCadToolPrompt(JSON.stringify({version:1,toolCalls}),context());assert.ok(result&&!result.ok);}
});
