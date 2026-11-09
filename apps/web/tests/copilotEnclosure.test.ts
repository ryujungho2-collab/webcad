import test from "node:test";import assert from "node:assert/strict";
import {planCadToolPrompt} from "../src/copilot/cadToolPrompts";
import {resetTestDocument,documentState,restoreTestDocument} from "./helpers/documentHarness";
import {cadDocument} from "../src/state/cadDocument";import {cadHistory,undoDocument,redoDocument} from "../src/state/history";
import {previewCadCommand,applyCadPlan,discardCadPlan} from "../src/state/documentPlans";
import {measureDocumentObject} from "../src/state/documentQuery";
import {serializeDocument,deserializeDocument} from "@agent-webcad/cad-document";
const roundedArea=(w:number,d:number,r:number)=>w*d-(4-Math.PI)*r*r;
export const enclosureSteps=["100x70 사각형 스케치","선택한 윤곽 30mm 돌출","수직 모서리 반지름 4mm 필렛","윗면 제거 두께 2mm 셸","안쪽 바닥 중심에 지름 8mm 관통 구멍","앞면 중심에 지름 10mm 깊이 2mm 구멍"];
test("a rounded open enclosure retains 2D sources through shell, inner-floor hole and front-wall port",async()=>{
 resetTestDocument();let selected:string[]=[];const expected=[0,210000,roundedArea(100,70,4)*30,roundedArea(100,70,4)*30-roundedArea(96,66,2)*28,roundedArea(100,70,4)*30-roundedArea(96,66,2)*28-32*Math.PI,roundedArea(100,70,4)*30-roundedArea(96,66,2)*28-82*Math.PI],states:ReturnType<typeof documentState>[]=[];
 for(const [i,prompt]of enclosureSteps.entries()){
  const before=documentState(),plan=await planCadToolPrompt(prompt,{document:cadDocument,selectionIds:selected,layerId:"layer-default",workPlane:"XY"});assert.ok(plan?.ok,plan&&!plan.ok?plan.reason:prompt);const preview=await previewCadCommand(plan.plan.command);assert.ok(preview.result.ok,`${prompt}: ${preview.result.reason}`);assert.deepEqual(documentState(),before);assert.ok((await applyCadPlan(preview.planId)).ok);discardCadPlan(preview.planId);selected=plan.plan.resultObjectIds!;states.push(documentState());
  if(i){const m=await measureDocumentObject(cadDocument,selected[0]);assert.equal(m.validity,"valid");assert.ok(Math.abs(m.volume!-expected[i])<.02,`${prompt}: ${m.volume} != ${expected[i]}`);}
 }
 assert.equal(cadHistory.getPastLabels().length,6);assert.equal(Object.values(cadDocument.features).filter(f=>f.params.faceHole).length,2);undoDocument();assert.deepEqual(documentState(),states[4]);redoDocument();assert.deepEqual(documentState(),states[5]);restoreTestDocument(deserializeDocument(serializeDocument(cadDocument)));assert.equal(JSON.stringify(documentState()),JSON.stringify(states[5]));
 const planes=Object.values(cadDocument.workPlanes!);assert.equal(planes.length,2);
 for(const [i,expectedOrigin]of [[50,35,2],[50,0,15]].entries())assert.ok(planes[i].origin.every((v,j)=>Math.abs(v-expectedOrigin[j])<.001));
 const final=selected[0],baseline=documentState();for(const prompt of ["안쪽 바닥 중심에 지름 500mm 관통 구멍","앞면 중심에 지름 500mm 깊이 2mm 구멍"]){const plan=await planCadToolPrompt(prompt,{document:cadDocument,selectionIds:[final],layerId:"layer-default",workPlane:"XY"});if(plan?.ok){const preview=await previewCadCommand(plan.plan.command);assert.equal(preview.result.ok,false);discardCadPlan(preview.planId);}else assert.ok(plan&&!plan.ok);assert.deepEqual(documentState(),baseline);}
});
test("inner-floor requests reject a solid block instead of drilling its top face",async()=>{
 resetTestDocument();const plan=await planCadToolPrompt("80x50 사각형 스케치 20mm 돌출",{document:cadDocument,selectionIds:[],layerId:"layer-default",workPlane:"XY"});assert.ok(plan?.ok);const preview=await previewCadCommand(plan.plan.command);assert.ok((await applyCadPlan(preview.planId)).ok);discardCadPlan(preview.planId);const before=documentState(),floor=await planCadToolPrompt("안쪽 바닥 중심에 지름 8mm 관통 구멍",{document:cadDocument,selectionIds:plan.plan.resultObjectIds!,layerId:"layer-default",workPlane:"XY"});assert.ok(floor&&!floor.ok);assert.match(floor.reason,/inner floor/);assert.deepEqual(documentState(),before);
});
