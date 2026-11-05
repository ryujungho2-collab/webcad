import test from "node:test";import assert from "node:assert/strict";
import {parsePlateCreation} from "../src/copilot/platePrompt";
import {planCadToolPrompt} from "../src/copilot/cadToolPrompts";
import {planCopilotCommand,withCopilotLayer} from "../src/copilot/copilotPlan";
import {copilotSolidContract} from "../src/copilot/copilotSolid";
import {resetTestDocument,documentState,restoreTestDocument} from "./helpers/documentHarness";
import {cadDocument} from "../src/state/cadDocument";
import {cadHistory,undoDocument,redoDocument} from "../src/state/history";
import {previewCadCommand,applyCadPlan,discardCadPlan} from "../src/state/documentPlans";
import {measureDocumentObject} from "../src/state/documentQuery";
import {serializeDocument,deserializeDocument} from "@agent-webcad/cad-document";
const prompt="가로 100mm, 세로 60mm, 두께 5mm 판에 지름 8mm 구멍 네 개를 각 모서리에서 10mm 안쪽에 만들어줘";
const follow="가로를 120mm로 늘려줘. 구멍은 모서리에서 10mm 간격을 유지해줘";
const context=(selectionIds:string[]=[])=>({document:cadDocument,selectionIds,layerId:"layer-default",workPlane:"XY" as const});
test("named Korean dimensions and count words parse actual values and independent units",()=>{
 assert.deepEqual(parsePlateCreation(prompt),{width:100,depth:60,thickness:5,margin:10,holeDiameter:8});
 assert.deepEqual(parsePlateCreation(prompt.replace("100mm","12cm").replace("60mm","0.08m").replace("5mm","0.6cm").replace("8mm","1cm").replace("10mm","1.5cm")),{width:120,depth:80,thickness:6,margin:15,holeDiameter:10});
 assert.equal(parsePlateCreation("a box"),undefined);
});
test("missing, duplicated and unsupported requirements never silently become a different plate",()=>{
 for(const text of [prompt.replace("100mm","-100mm"),prompt+" 가로 200mm",prompt+" 필렛 2mm",prompt.replace("네 개","다섯 개"),prompt.replace("세로 60mm,", ""),prompt.replace("관통","깊이 2mm")+" 깊이 2mm",prompt+" 회전 30도",prompt.replace("5mm 판","5mm 80x50x4mm 판")])assert.equal(planCopilotCommand(text).ok,false,text);
});
test("the App's local tool route creates then edits a real parametric solid while preserving margin",async()=>{
 resetTestDocument();const before=documentState(),creation=await planCadToolPrompt(prompt,context());assert.ok(creation?.ok);const preview=await previewCadCommand(withCopilotLayer(creation.plan.command,"layer-default"));assert.ok(preview.result.ok,preview.result.reason);assert.deepEqual(documentState(),before);assert.ok((await applyCadPlan(preview.planId)).ok);discardCadPlan(preview.planId);
 const id=creation.plan.resultObjectIds![0],original=documentState(),ids=Object.keys(cadDocument.objects).sort(),edit=await planCadToolPrompt(follow,context([id]));assert.ok(edit?.ok,edit&&!edit.ok?edit.reason:"");assert.match(edit.plan.summary.join(" "),/retain 10 mm/);
 const proposal=await previewCadCommand(edit.plan.command);assert.ok(proposal.result.ok,proposal.result.reason);assert.deepEqual(documentState(),original);assert.ok((await applyCadPlan(proposal.planId)).ok);discardCadPlan(proposal.planId);
 const holes=Object.values(cadDocument.sketches!)[0].geometry.filter(g=>g.kind==="circle");assert.deepEqual(holes.map(h=>h.kind==="circle"?h.center.map(v=>Math.round(v*1e6)/1e6):[]),[[10,10],[110,10],[10,50],[110,50]]);
 assert.ok(Math.abs((await measureDocumentObject(cadDocument,id)).volume!-(120*60-64*Math.PI)*5)<.003);assert.deepEqual(Object.keys(cadDocument.objects).sort(),ids);assert.equal(cadHistory.getPastLabels().length,2);
 const after=documentState();undoDocument();assert.deepEqual(documentState(),original);redoDocument();assert.deepEqual(documentState(),after);restoreTestDocument(deserializeDocument(serializeDocument(cadDocument)));assert.deepEqual(documentState(),after);assert.equal(copilotSolidContract(cadDocument,[id]).plate?.margin,10);
 for(const request of [follow.replace("10mm","12mm"),follow.replace("120mm","80mm"),follow+" 구멍 하나 삭제",follow.replace("가로를","여백을")]){const r=await planCadToolPrompt(request,context([id]));assert.ok(!r||!r.ok,request);assert.deepEqual(documentState(),after);}
 assert.equal((await planCadToolPrompt(follow,context()))?.ok,false);
});
