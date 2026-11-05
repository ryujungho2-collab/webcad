import test from "node:test";import assert from "node:assert/strict";
import {planCadToolPrompt} from "../src/copilot/cadToolPrompts";
import {resetTestDocument,documentState,restoreTestDocument} from "./helpers/documentHarness";
import {cadDocument} from "../src/state/cadDocument";import {cadHistory,undoDocument,redoDocument} from "../src/state/history";
import {previewCadCommand,applyCadPlan,discardCadPlan} from "../src/state/documentPlans";
import {measureDocumentObject} from "../src/state/documentQuery";
import {serializeDocument,deserializeDocument} from "@agent-webcad/cad-document";
test("natural language 2D sketch to linked extrusion, hole and edge finish is reversible and reloadable",async()=>{
 resetTestDocument();let selected:string[]=[];const stages:ReturnType<typeof documentState>[]=[];
 for(const prompt of ["80x50 사각형 스케치","선택한 윤곽 20mm 돌출","윗면 중심에 지름 6mm 관통 구멍","수직 모서리 반지름 2mm 필렛"]){
  const before=documentState(),plan=await planCadToolPrompt(prompt,{document:cadDocument,selectionIds:selected,layerId:"layer-default",workPlane:"XY"});assert.ok(plan?.ok,plan&&!plan.ok?plan.reason:prompt);
  const preview=await previewCadCommand(plan.plan.command);assert.ok(preview.result.ok,preview.result.reason);assert.deepEqual(documentState(),before);assert.ok((await applyCadPlan(preview.planId)).ok);discardCadPlan(preview.planId);selected=plan.plan.resultObjectIds!;stages.push(documentState());
 }
 const saved=documentState(),bad=await planCadToolPrompt("수직 모서리 반지름 100mm 필렛",{document:cadDocument,selectionIds:selected,layerId:"layer-default",workPlane:"XY"});
 if(bad?.ok){const failed=await previewCadCommand(bad.plan.command);assert.equal(failed.result.ok,false);discardCadPlan(failed.planId);}else assert.ok(bad&&!bad.ok);
 assert.deepEqual(documentState(),saved);
 const final=selected[0],measurement=await measureDocumentObject(cadDocument,final);assert.equal(measurement.validity,"valid");assert.ok(Math.abs(measurement.volume!-((80*50-(4-Math.PI)*4)*20-180*Math.PI))<.005);assert.equal(cadHistory.getPastLabels().length,4);
 const graph=Object.values(cadDocument.features);assert.equal(graph.filter(f=>f.type==="fillet").length,1);assert.equal(graph.filter(f=>!!f.params.faceHole).length,1);assert.equal(Object.keys(cadDocument.sketches!).length,1);
 undoDocument();assert.deepEqual(documentState(),stages[2]);redoDocument();assert.deepEqual(documentState(),stages[3]);restoreTestDocument(deserializeDocument(serializeDocument(cadDocument)));assert.deepEqual(documentState(),stages[3]);assert.ok(Math.abs((await measureDocumentObject(cadDocument,final)).volume!-measurement.volume!)<.005);
});
