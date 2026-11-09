import assert from "node:assert/strict";
import { test } from "node:test";
import { serializeDocument, deserializeDocument } from "@agent-webcad/cad-document";
import { cadToolCatalog, validateCadToolCalls, type CadToolCall } from "../src/copilot/cadToolContract";
import { createCadToolSession } from "../src/copilot/cadToolSession";
import { planCadToolPrompt } from "../src/copilot/cadToolPrompts";
import { copilotRequest, requestCopilotPlan } from "../src/copilot/copilotConnection";
import { cadDocument } from "../src/state/cadDocument";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { previewCadCommand, applyCadPlan, discardCadPlan, getCadPlanSolidGhosts } from "../src/state/documentPlans";
import { measureDocumentObject } from "../src/state/documentQuery";
import { cadHistory, undoDocument, redoDocument } from "../src/state/history";
import { resetTestDocument, documentState } from "./helpers/documentHarness";
import { notifyDocumentChanged } from "../src/state/documentSession";

const call = (name: CadToolCall["name"], args: Record<string, unknown>, id = name.replaceAll(".", "-")): CadToolCall => ({ id, name, arguments: args });
const context = (selectionIds: string[] = []) => ({ document: cadDocument, selectionIds, layerId: "layer-default", workPlane: "XY" as const });
const session = (selection: string[] = []) => createCadToolSession(context(selection));
const response = (value: unknown) => new Response(JSON.stringify(value), { headers: {"Content-Type":"application/json"} });
const graph = (): CadToolCall[] => [
  call("sketch.create", {id:"outlineSketch",plane:"XY"}, "s1"),
  call("sketch.rectangle", {id:"outline",sketchId:"outlineSketch",origin:[0,0],width:40,height:30}, "r1"),
  call("solid.extrude", {id:"body",profileObjectIds:["outline"],distance:10}, "e1"),
  call("sketch.create", {id:"toolSketch",plane:"XY"}, "s2"),
  call("sketch.circle", {id:"toolProfile",sketchId:"toolSketch",center:[20,15],radius:4}, "c1"),
  call("solid.extrude", {id:"tool",profileObjectIds:["toolProfile"],distance:10}, "e2"),
  call("solid.boolean", {id:"result",operation:"cut",targetId:"body",toolId:"tool"}, "cut"),
];
async function box(id="box") { const result=await dispatchCadCommand({type:"create-primitive",id,primitive:"box",params:{width:40,depth:30,height:20}}); assert.ok(result.ok,result.reason); }
async function faceKey(current: ReturnType<typeof session>, id="box") {
  const read=await current.read(call("cad.faces",{objectId:id})); assert.ok(read.ok,read.error);
  const result=read.result as {faces:{key:string;frame?:{origin:number[];normal:number[]}}[]};
  const top=result.faces.find(face=>face.frame && face.frame.normal[2]>.999)!; assert.ok(top);
  return top.key;
}

test("tool catalog validates exact schemas, names, IDs, bounds and nested input without executable metadata", () => {
  const catalog=cadToolCatalog(); assert.equal(catalog.version,1); assert.ok(catalog.tools.some(tool=>tool.name==="solid.hole"));
  for(const invalid of [[],Array(21).fill(graph()[0]),[{...graph()[0],name:"toString"}],[{...graph()[0],extra:true}],[graph()[0],graph()[0]],[call("solid.extrude",{id:"out",profileObjectIds:["a"],distance:NaN})],[call("sketch.circle",{id:"out",sketchId:"s",center:[0,0,0],radius:4})],[call("solid.boolean",{id:"out",operation:"cut",targetId:"a",toolId:"b",layerId:"foreign"})],[call("sketch.create",{id:"bad/path",plane:"XY"})]]) assert.throws(()=>validateCadToolCalls(invalid));
  assert.equal(validateCadToolCalls(graph()).length,7);
});

test("common sketch/extrude/Boolean tools build an editable linked BRep as one detached review and Undo", async () => {
  resetTestDocument(); const before=documentState(), planned=await session().plan(graph());
  assert.deepEqual(documentState(),before); assert.deepEqual(planned.resultObjectIds,["result"]);
  const preview=await previewCadCommand(planned.command); assert.ok(preview.result.ok,preview.result.reason); assert.deepEqual(documentState(),before);
  assert.equal(getCadPlanSolidGhosts(preview.planId).length,1);
  const expected=40*30*10-Math.PI*4**2*10;
  assert.ok(Math.abs(preview.changes.find(c=>c.objectId==="result")!.after!.volume!-expected)<.001);
  assert.ok((await applyCadPlan(preview.planId)).ok); assert.equal(cadHistory.getPastLabels().length,1);
  const features=Object.values(cadDocument.features);
  assert.deepEqual(features.find(f=>f.output==="result")!.inputs,["body","tool"]);
  assert.equal(cadDocument.objects.body.visible,false); assert.equal(cadDocument.objects.tool.visible,false);
  assert.equal(Object.keys(cadDocument.sketches!).length,2);
  const after=documentState(); assert.deepEqual(documentState(deserializeDocument(serializeDocument(cadDocument))),after);
  assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),after);
});

test("inner profile circles extrude as holes and preview failure rolls back the entire construction graph", async () => {
  resetTestDocument();
  const calls=graph().slice(0,2).concat(call("sketch.circle",{id:"inner",sketchId:"outlineSketch",center:[20,15],radius:3}),call("solid.extrude",{id:"holed",profileObjectIds:["outline","inner"],distance:5}));
  const planned=await session().plan(calls),before=documentState();
  const preview=await previewCadCommand(planned.command); assert.ok(preview.result.ok,preview.result.reason);
  assert.ok(Math.abs(preview.changes.find(c=>c.objectId==="holed")!.after!.volume!-(40*30-Math.PI*9)*5)<.001);
  discardCadPlan(preview.planId); assert.deepEqual(documentState(),before);assert.equal(cadHistory.getPastLabels().length,0);
  const invalid=await session().plan([call("solid.primitive",{id:"a",primitive:"box",params:{width:10,depth:10,height:10},position:[0,0,0]},"a"),call("solid.primitive",{id:"b",primitive:"box",params:{width:10,depth:10,height:10},position:[50,0,0]},"b"),call("solid.boolean",{id:"bad",operation:"intersect",targetId:"a",toolId:"b"},"intersect")]);
  const rejected=await previewCadCommand(invalid.command); assert.equal(rejected.result.ok,false);assert.deepEqual(documentState(),before);assert.equal(cadHistory.getPastLabels().length,0);
});

test("all three Boolean operations honor ordered selected inputs and require edit selection rather than a read grant", async () => {
  for(const [operation,volume]of [["union",6000],["cut",2000],["intersect",2000]] as const){
    resetTestDocument(); for(const [id,x]of [["a",0],["b",10]] as const)assert.ok((await dispatchCadCommand({type:"create-primitive",id,primitive:"box",params:{width:20,depth:20,height:10},position:[x,0,0]})).ok);
    const tool=call("solid.boolean",{id:"combined",operation,targetId:"a",toolId:"b"});
    assert.ok((await session(["a"]).read(call("cad.inspect",{objectIds:["b"]}))).ok);
    await assert.rejects(session(["a"]).plan([tool]),/selected/);
    const plan=await session(["a","b"]).plan([tool]),preview=await previewCadCommand(plan.command);assert.ok(preview.result.ok,preview.result.reason);assert.ok((await applyCadPlan(preview.planId)).ok);
    assert.ok(Math.abs((await measureDocumentObject(cadDocument,"combined")).volume!-volume)<.001);
  }
});

test("face query and hole tool retain an exact face-bound definition with through/blind analytic volumes", async () => {
  for(const through of [false,true]){
    resetTestDocument();await box();const current=session(["box"]),key=await faceKey(current),before=documentState();
    const plan=await current.plan([call("solid.hole",{id:"hole",targetId:"box",faceKey:key,center:[0,0],diameter:6,through,...through?{}:{depth:5}})]);
    const preview=await previewCadCommand(plan.command);assert.ok(preview.result.ok,preview.result.reason);assert.deepEqual(documentState(),before);
    assert.ok((await applyCadPlan(preview.planId)).ok);
    const measurement=await measureDocumentObject(cadDocument,"hole"),expected=24000-Math.PI*9*(through?20:5);
    assert.equal(measurement.validity,"valid");assert.ok(Math.abs(measurement.volume!-expected)<.001);
    assert.equal(cadDocument.workPlanes!["plane-hole"].source!.topologyId,key);
    assert.equal(Object.values(cadDocument.features).find(f=>f.output==="hole")!.params.faceHoleStatus,"resolved");
    assert.ok((await dispatchCadCommand({type:"update-primitive",objectId:"box",params:{width:40,depth:30,height:21}})).ok);
    const unresolved=session(["hole"]),diagnostic=await unresolved.read(call("cad.inspect",{objectIds:["hole"]}));
    assert.match((diagnostic.result as {referenceIssue:string}[])[0].referenceIssue,/unresolved/);
    assert.equal((await unresolved.read(call("cad.measure",{objectIds:["hole"]}))).ok,false);
    assert.equal((await unresolved.read(call("cad.faces",{objectId:"hole"}))).ok,false);
    await assert.rejects(unresolved.plan([call("solid.hole",{id:"another",targetId:"hole",faceKey:key,center:[0,0],diameter:2,through:true})]),/unresolved/);
  }
});

test("queries are bounded detached DTOs and stale generation, cancellation, invalid references and hidden/locked inputs reject", async () => {
  resetTestDocument();await box();await box("other");const current=session(["box"]),before=documentState();
  const read=await current.read(call("cad.inspect",{objectIds:["box"]}));assert.ok(read.ok);(read.result as {name:string}[])[0].name="poison";
  assert.notEqual(((await current.read(call("cad.inspect",{objectIds:["box"]}))).result as {name:string}[])[0].name,"poison");
  assert.equal((await current.read(call("cad.measure",{objectIds:["missing"]}))).ok,false);
  await assert.rejects(current.plan([call("solid.hole",{id:"hole",targetId:"box",faceKey:"face:missing",center:[0,0],diameter:6,through:true})]),/missing/);
  await assert.rejects(current.plan([call("solid.hole",{id:"hole",targetId:"box",faceKey:await faceKey(current),center:[0,0],diameter:6,through:false})]),/depth/);
  await assert.rejects(current.plan([call("solid.primitive",{id:"box",primitive:"sphere",params:{radius:3},position:[0,0,0]})]),/already exists/);
  const aborted=new AbortController();aborted.abort();await assert.rejects(current.read(call("cad.objects",{}),aborted.signal));
  assert.deepEqual(documentState(),before);
  notifyDocumentChanged();await assert.rejects(current.read(call("cad.objects",{})),/context changed/);
  cadDocument.layers["layer-default"].locked=true;await assert.rejects(session(["box","other"]).plan([call("solid.boolean",{id:"out",operation:"cut",targetId:"box",toolId:"other"})]),/unlocked/);
});

test("gateway discovers, inspects, measures and queries faces before proposing a hole without publishing between rounds", async () => {
  resetTestDocument();await box();const before=documentState(),labels=cadHistory.getPastLabels().length,current=session(["box"]);let round=0;
  const plan=await requestCopilotPlan("/api",copilotRequest("Add a through hole",cadDocument,["box"],"XY"),{signal:new AbortController().signal,baseUrl:"https://webcad.example",toolSession:current,fetcher:async(_url,init)=>{
    const body=JSON.parse(String(init?.body));assert.deepEqual(documentState(),before);assert.equal(JSON.stringify(body).includes("rasterAssets"),false);
    if(round++===0)return response({version:1,toolCalls:[call("cad.tools",{},"discover"),call("cad.inspect",{objectIds:["box"]},"inspect")]});
    if(round===2){assert.equal(body.toolResults.length,2);return response({version:1,toolCalls:[call("cad.measure",{objectIds:["box"]},"measure"),call("cad.faces",{objectId:"box"},"faces")]});}
    assert.equal(body.toolResults.length,4);const faces=body.toolResults[3].result.faces as {key:string;frame?:{normal:number[]}}[];
    return response({version:1,toolCalls:[call("solid.hole",{id:"gatewayHole",targetId:"box",faceKey:faces.find(f=>f.frame&&f.frame.normal[2]>.999)!.key,center:[0,0],diameter:6,through:true},"hole")]});
  }});
  assert.equal(round,3);assert.equal(plan.toolSteps!.length,5);assert.deepEqual(documentState(),before);
  const preview=await previewCadCommand(plan.command);assert.ok(preview.result.ok,preview.result.reason);assert.ok((await applyCadPlan(preview.planId)).ok);assert.equal(cadHistory.getPastLabels().length,labels+1);
});

test("gateway rejects mixed/unknown/repeated/excessive calls and global deadline covers stalled local reads", async () => {
  resetTestDocument();await box();
  const body=copilotRequest("model",cadDocument,["box"],"XY"),base={signal:new AbortController().signal,baseUrl:"https://webcad.example",toolSession:session(["box"])};
  const before=documentState();
  for(const toolCalls of [[call("cad.objects",{}),graph()[0]],[{id:"unknown",name:"eval",arguments:{code:"..."}}]])await assert.rejects(requestCopilotPlan("/api",body,{...base,fetcher:async()=>response({version:1,toolCalls})}));
  await assert.rejects(requestCopilotPlan("/api",body,{...base,fetcher:async()=>response({version:1,toolCalls:[call("cad.objects",{},"repeat")]})}),/unique/);
  let count=0;await assert.rejects(requestCopilotPlan("/api",body,{...base,fetcher:async()=>response({version:1,toolCalls:[call("cad.objects",{},`read${count++}`)]})}),/limit reached/);assert.equal(count,5);
  await assert.rejects(requestCopilotPlan("/api",body,{...base,timeoutMs:5,toolSession:{...base.toolSession,read:async()=>new Promise(()=>{})},fetcher:async()=>response({version:1,toolCalls:[call("cad.objects",{})]})}),/timed out/);
  const controller=new AbortController();await assert.rejects(requestCopilotPlan("/api",body,{...base,signal:controller.signal,fetcher:async()=>{controller.abort(new Error("cancelled"));return response({version:1,toolCalls:[call("cad.objects",{})]});}}),/cancelled/);
  assert.deepEqual(documentState(),before);
});

test("local shortcuts call common sketch/extrude/face-hole tools with actual source relationships", async () => {
  resetTestDocument();
  const creation=await planCadToolPrompt("80x50 사각형 스케치 20mm 돌출",context());assert.ok(creation?.ok,creation&&!creation.ok?creation.reason:"");
  const preview=await previewCadCommand(creation.plan.command);assert.ok(preview.result.ok,preview.result.reason);assert.ok((await applyCadPlan(preview.planId)).ok);
  const id=creation.plan.resultObjectIds![0],hole=await planCadToolPrompt("윗면 중심에 지름 6mm 관통 구멍",context([id]));assert.ok(hole?.ok,hole&&!hole.ok?hole.reason:"");
  const review=await previewCadCommand(hole.plan.command);assert.ok(review.result.ok,review.result.reason);assert.ok((await applyCadPlan(review.planId)).ok);
  assert.ok(Math.abs((await measureDocumentObject(cadDocument,hole.plan.resultObjectIds![0])).volume!-(80000-180*Math.PI))<.001);
  assert.equal(await planCadToolPrompt("폭을 100mm로 바꿔줘",context()),undefined);
  assert.equal(await planCadToolPrompt("구멍 지름을 8mm로 바꿔줘",context()),undefined);
  for(const input of ["80x50 사각형 스케치 -20mm 돌출","윗면 중심에 지름 6mm 구멍","윗면 중심에 지름 6mm 관통 구멍 필렛 3mm"])assert.equal((await planCadToolPrompt(input,context()))?.ok,false,input);
});

test("cad.tools returns a compact index by default and full schemas only for requested names", async () => {
  resetTestDocument();const current=session(),bytes=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v)).byteLength;
  const index=await current.read(call("cad.tools",{},"index"));assert.ok(index.ok,index.error);
  const tools=(index.result as {tools:{name:string;inputSchema?:unknown}[]}).tools;
  assert.equal(tools.length,cadToolCatalog().tools.length);assert.ok(tools.every(t=>t.inputSchema===undefined));
  // The discovery read must leave most of the 64 KiB transcript budget for document facts.
  assert.ok(bytes(index)<16384,`index uses ${bytes(index)} bytes`);
  const detail=await current.read(call("cad.tools",{names:["solid.hole","cad.faces"]},"detail"));assert.ok(detail.ok,detail.error);
  assert.deepEqual((detail.result as {tools:{name:string;inputSchema:unknown}[]}).tools.map(t=>[t.name,!!t.inputSchema]).sort(),[["cad.faces",true],["solid.hole",true]]);
  const unknown=await current.read(call("cad.tools",{names:["eval"]},"unknown"));assert.equal(unknown.ok,false);assert.match(unknown.error!,/Unknown CAD tool/);
});
