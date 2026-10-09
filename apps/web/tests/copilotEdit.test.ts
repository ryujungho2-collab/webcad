import assert from "node:assert/strict";
import { test } from "node:test";
import { serializeDocument, deserializeDocument } from "@agent-webcad/cad-document";
import { copilotRequest, validateCopilotResponse } from "../src/copilot/copilotConnection";
import { copilotMoveContract, validateCopilotEdit } from "../src/copilot/copilotEdit";
import { withCopilotLayer } from "../src/copilot/copilotPlan";
import { cadDocument } from "../src/state/cadDocument";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { previewCadCommand, applyCadPlan, discardCadPlan, getCadPlanDrawingPaths } from "../src/state/documentPlans";
import { cadHistory, undoDocument, redoDocument } from "../src/state/history";
import { documentState, resetTestDocument, restoreTestDocument } from "./helpers/documentHarness";
const move = { type: "move-object" as const, objectId: "line", translation: [10,20,0] as [number,number,number] };
const response = (command: unknown = move) => ({ version: 1, summary: ["Untrusted description"], command, ghosts: [{ kind: "drawing", params: { points: [[999,999,0]] } }] });
const history = () => ({ past: cadHistory.getPastLabels(), future: cadHistory.getFutureLabels() });
async function fixture() {
  resetTestDocument();
  assert.ok((await dispatchCadCommand({ type: "create-drawing", id: "line", name: "Source", drawing: "line", params: { workPlane: "XY", points: [[0,0,0],[30,40,0]] } })).ok);
  assert.ok((await dispatchCadCommand({ type: "create-dimension", id: "dim", dimension: "linear", params: { points: [[0,0],[30,40]], sourceObjectId: "line" } })).ok);
  assert.ok((await dispatchCadCommand({ type:"create-construction", id:"mid",workPlane:"XY",definition:{operation:"midpoint",segmentId:"line"} })).ok);
}

test("Move advertises bounded selected placement, derives its summary locally and rejects read-only authorization", async () => {
  await fixture();
  const body = copilotRequest("Move the selection", cadDocument, ["line"], "XY"), bytes = JSON.stringify(cadDocument), labels = history();
  assert.deepEqual(body.edit.target, { id: "line", name: "Source", workPlane: "XY", translation: [0,0,0] });
  assert.ok(body.capabilities.includes("move-object")); assert.equal(JSON.stringify(body).includes('"points"'), false);
  const plan = validateCopilotResponse(response(), body.edit);
  assert.equal(plan.ghosts.length, 0); assert.match(plan.summary[0], /Source.*10, 20, 0.*mm/); assert.ok(!plan.summary.includes("Untrusted description"));
  assert.deepEqual(withCopilotLayer(plan.command, "another-active-layer"), move);
  for (const selection of [[], ["line","dim"], ["missing"]]) assert.throws(() => validateCopilotResponse(response(), copilotMoveContract(cadDocument, selection, "XY")));
  assert.throws(() => validateCopilotResponse(response()), /captured edit selection/);
  assert.equal(JSON.stringify(cadDocument), bytes); assert.deepEqual(history(), labels);
});

test("Move rejects unselected objects, off-plane/nonfinite/no-op values, batches and injected metadata atomically", async () => {
  await fixture(); const contract = copilotMoveContract(cadDocument,["line"],"XY"), bytes=JSON.stringify(cadDocument), labels=history();
  for (const command of [
    {...move,objectId:"dim"}, {...move,translation:[10,20,1]}, {...move,translation:[NaN,0,0]},
    {...move,translation:[1e6+1,0,0]}, {...move,translation:[0,0,0]}, {...move,translation:["10",20,0]},
    {...move,layerId:"other"}, {...move,topology:{version:1}}, {...move,params:{points:[[0,0,0]]}},
    {type:"batch",commands:[move]}, {type:"batch",commands:[move,{type:"delete-object",objectId:"dim"}]},
    {type:"rotate-object",objectId:"line",rotation:[0,0,30]},
  ]) assert.throws(() => validateCopilotResponse(response(command),contract));
  assert.equal(JSON.stringify(cadDocument),bytes); assert.deepEqual(history(),labels);
});

test("Move validates actual ownership, representation, visibility and captured work plane", async () => {
  await fixture(); const baseline=structuredClone(cadDocument);
  const mutations=[
    ()=>{cadDocument.layers["layer-default"].locked=true;}, ()=>{cadDocument.layers["layer-default"].visible=false;},
    ()=>{cadDocument.objects.line.visible=false;}, ()=>{cadDocument.features["feature-line"].params.sketchId="owned";},
    ()=>{cadDocument.features["feature-line"].inputs=["source"];}, ()=>{cadDocument.features["feature-line"].type="primitive";},
    ()=>{cadDocument.features["feature-line"].params.kind="ray";}, ()=>{cadDocument.objects.line.transform={translation:[0,0,0],rotation:[0,30,0],scale:[1,1,1]};},
    ()=>{cadDocument.objects.line.transform={translation:[0,0,0],rotation:[0,0,0],scale:[2,1,1]};},
  ];
  for(const mutate of mutations){restoreTestDocument(baseline);mutate();assert.equal(copilotMoveContract(cadDocument,["line"],"XY").target,undefined);}
  restoreTestDocument(baseline);
  for(const id of ["mid","dim"])assert.equal(copilotMoveContract(cadDocument,[id],"XY").target,undefined);
  assert.match(copilotMoveContract(cadDocument,["line"],"XZ").disabledReason!,/Switch.*XY/);
});

test("Move preview matches independent world coordinates and updates dimension/construction with stable IDs, persistence and history", async () => {
  await fixture(); const start=documentState(), labels=cadHistory.getPastLabels().length;
  const plan=validateCopilotResponse(response(),copilotMoveContract(cadDocument,["line"],"XY"));
  const preview=await previewCadCommand(plan.command); assert.ok(preview.result.ok); assert.deepEqual(documentState(),start);
  const paths=getCadPlanDrawingPaths(preview.planId,"line")!;
  assert.deepEqual(paths.after,[[10,20,0],[40,60,0]]); paths.after![0][0]=999;
  assert.equal(getCadPlanDrawingPaths(preview.planId,"line")!.after![0][0],10);
  assert.ok(preview.changes.some(c=>c.objectId==="dim")); assert.ok(preview.changes.some(c=>c.objectId==="mid"));
  assert.ok((await applyCadPlan(preview.planId)).ok); assert.equal(cadHistory.getPastLabels().length,labels+1);
  assert.deepEqual(cadDocument.features["feature-mid"].params.points,[[25,40,0]]);
  assert.deepEqual(cadDocument.features["feature-line"].params,start.features["feature-line"].params);
  assert.deepEqual(cadDocument.features["feature-line"].params.topology,start.features["feature-line"].params.topology);
  const result=documentState(), json=serializeDocument(cadDocument); assert.deepEqual(documentState(deserializeDocument(json)),result);
  assert.ok(undoDocument());assert.deepEqual(documentState(),start);assert.ok(redoDocument());assert.deepEqual(documentState(),result);
  discardCadPlan(preview.planId);
  assert.ok(undoDocument());assert.ok((await dispatchCadCommand(move)).ok);assert.deepEqual(documentState(),result);
});

test("Move revalidation rejects changed selection/lock and stale Apply without altering history", async () => {
  await fixture(); let preview=await previewCadCommand(move); const bytes=JSON.stringify(cadDocument),labels=history();
  const rejected=await applyCadPlan(preview.planId,{validate:()=>{try{validateCopilotEdit(move,cadDocument,[],"XY");}catch(e){return (e as Error).message;}}});
  assert.equal(rejected.ok,false);assert.equal(JSON.stringify(cadDocument),bytes);assert.deepEqual(history(),labels);discardCadPlan(preview.planId);
  preview=await previewCadCommand(move); await dispatchCadCommand({type:"set-layer-locked",layerId:"layer-default",locked:true});
  const locked=JSON.stringify(cadDocument),lockedHistory=history(); assert.equal((await applyCadPlan(preview.planId)).ok,false);
  assert.equal(JSON.stringify(cadDocument),locked); assert.deepEqual(history(),lockedHistory);discardCadPlan(preview.planId);
});

test("Move retains nonzero plane elevation and interprets translation as absolute rather than relative", async () => {
  for(const plane of ["XZ","YZ"] as const){
    resetTestDocument();const points=plane==="XZ"?[[0,7,0],[30,7,40]]:[[7,0,0],[7,30,40]];
    await dispatchCadCommand({type:"create-drawing",id:"line",drawing:"line",params:{workPlane:plane,points}});
    const translation:[number,number,number]=plane==="XZ"?[10,0,20]:[0,10,20];
    const preview=await previewCadCommand(validateCopilotResponse(response({...move,translation}),copilotMoveContract(cadDocument,["line"],plane)).command);
    assert.deepEqual(getCadPlanDrawingPaths(preview.planId,"line")!.after,plane==="XZ"?[[10,7,20],[40,7,60]]:[[7,10,20],[7,40,60]]);
    assert.ok((await applyCadPlan(preview.planId)).ok);discardCadPlan(preview.planId);
    const next={...move,translation:plane==="XZ"?[20,0,30] as [number,number,number]:[0,20,30] as [number,number,number]};
    validateCopilotEdit(next,cadDocument,["line"],plane);await dispatchCadCommand(next);assert.deepEqual(cadDocument.objects.line.transform!.translation,next.translation);
  }
});

test("Move refuses locked downstream updates and generated pattern members atomically", async () => {
  await fixture();
  await dispatchCadCommand({type:"create-layer",id:"locked-dependency"});
  await dispatchCadCommand({type:"move-object-to-layer",objectId:"dim",layerId:"locked-dependency"});
  await dispatchCadCommand({type:"set-layer-locked",layerId:"locked-dependency",locked:true});
  const bytes=JSON.stringify(cadDocument),labels=history(),preview=await previewCadCommand(move);
  assert.equal(preview.result.ok,false);assert.match(preview.result.reason!,/locked/i);
  assert.equal((await applyCadPlan(preview.planId)).ok,false);assert.equal(JSON.stringify(cadDocument),bytes);assert.deepEqual(history(),labels);discardCadPlan(preview.planId);
  await dispatchCadCommand({type:"set-layer-locked",layerId:"locked-dependency",locked:false});
  const pattern=await dispatchCadCommand({type:"create-pattern",id:"pattern",sourceObjectIds:["line"],spec:{kind:"linear",columns:3,rows:1,spacing:[20,0],workPlane:"XY"}});
  assert.ok(pattern.ok,pattern.reason);
  const member=Object.values(cadDocument.features).find(f=>f.pattern)!;
  assert.match(copilotMoveContract(cadDocument,[member.output],"XY").disabledReason!,/owner|Pattern/);
});

test("Circle, arc and bulged polyline Move preserve exact source geometry and transformed analytic measures", async () => {
  for(const [drawing,params] of [
    ["circle",{center:[5,6,0],radius:10}], ["arc",{center:[5,6,0],radius:10,startAngle:0,endAngle:Math.PI/2}],
    ["polyline",{points:[[0,0,0],[20,0,0]],bulges:[1,0]}],
  ] as const){
    resetTestDocument();await dispatchCadCommand({type:"create-drawing",id:"line",drawing,params:{...params,workPlane:"XY"}});
    await dispatchCadCommand({type:"rotate-object",objectId:"line",rotation:[0,0,30]});
    const source=structuredClone(cadDocument.features["feature-line"]),plan=validateCopilotResponse(response(),copilotMoveContract(cadDocument,["line"],"XY"));
    const preview=await previewCadCommand(plan.command),change=preview.changes.find(c=>c.objectId==="line")!;
    assert.ok(preview.result.ok);
    const expectedLength=drawing==="circle"?20*Math.PI:drawing==="arc"?5*Math.PI:10*Math.PI;
    assert.ok(Math.abs(change.after!.length!-expectedLength)<1e-8);
    if(drawing==="circle")assert.ok(Math.abs(change.after!.area!-100*Math.PI)<1e-8);
    assert.ok((await applyCadPlan(preview.planId)).ok);
    assert.deepEqual(cadDocument.features["feature-line"],source);discardCadPlan(preview.planId);
  }
});
