import {CAD_TOOLS as MESH_EXTENDED_TOOLS} from "../src/copilot/cadToolContract";
import assert from "node:assert/strict";
import { test } from "node:test";
import { serializeDocument, deserializeDocument } from "@agent-webcad/cad-document";
import { validateCommand } from "@agent-webcad/cad-commands";
import { createCadToolSession } from "../src/copilot/cadToolSession";
import { planCadToolPrompt } from "../src/copilot/cadToolPrompts";
import { validateCadToolCalls, cadToolCatalog, type CadToolCall } from "../src/copilot/cadToolContract";
import { requestCopilotPlan, copilotRequest } from "../src/copilot/copilotConnection";
import { cadDocument } from "../src/state/cadDocument";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { previewCadCommand, applyCadPlan, discardCadPlan, getCadPlanSolidGhosts } from "../src/state/documentPlans";
import { measureDocumentObject } from "../src/state/documentQuery";
import { cadHistory, undoDocument, redoDocument } from "../src/state/history";
import { resetTestDocument, documentState } from "./helpers/documentHarness";

const call=(name:CadToolCall["name"],args:Record<string,unknown>,id=name.replaceAll(".","-")):CadToolCall=>({id,name,arguments:args});
const context=(selectionIds:string[]=[])=>({document:cadDocument,selectionIds,layerId:"layer-default",workPlane:"XY" as const});
const session=(ids:string[]=[])=>createCadToolSession(context(ids));
const circle=(id:string,radius:number,z:number)=>call("curve.circle",{id,plane:"XY",center:[0,0,z],radius},id);
const path=(id:string)=>call("curve.polyline",{id,plane:"XZ",points:[[0,0,0],[0,0,30]],closed:false},id);
const section=()=>call("curve.polyline",{id:"section",plane:"XZ",points:[[5,0,0],[10,0,0],[10,0,20],[5,0,20]],closed:true},"section");
async function apply(calls:CadToolCall[],ids:string[]=[]){const plan=await session(ids).plan(calls),before=documentState();const preview=await previewCadCommand(plan.command);assert.ok(preview.result.ok,preview.result.reason);assert.deepEqual(documentState(),before);if(calls.some(c=>c.name.startsWith("solid.")))assert.ok(getCadPlanSolidGhosts(preview.planId).length);assert.ok((await applyCadPlan(preview.planId)).ok);return plan;}
async function volume(id:string,expected:number){const measured=await measureDocumentObject(cadDocument,id);assert.equal(measured.validity,"valid");assert.ok(Math.abs(measured.volume!-expected)<.005,`${id}: ${measured.volume} vs ${expected}`);}
async function box(){assert.ok((await dispatchCadCommand({type:"create-primitive",id:"box",primitive:"box",params:{width:40,depth:30,height:20},position:[10,20,0]})).ok);}
async function edges(){const read=await session(["box"]).read(call("cad.edges",{objectId:"box"}));assert.ok(read.ok,read.error);return (read.result as {edges:{key:string;points:number[][]}[]}).edges;}
const vertical=(edge:{points:number[][]})=>edge.points.every(p=>Math.abs(p[0]-edge.points[0][0])<1e-6&&Math.abs(p[1]-edge.points[0][1])<1e-6);

test("advanced schemas advertise bounded explicit units, ordered sections and exact references",()=>{
  assert.equal(cadToolCatalog().tools.length,Object.keys(MESH_EXTENDED_TOOLS).length);
  for(const invalid of [call("solid.revolve",{id:"r",profileObjectIds:["a"],axis:"z",angle:360}),call("solid.revolve",{id:"r",profileObjectIds:["a"],axis:"y",angle:361}),call("solid.loft",{id:"l",profileObjectIds:["a"],ruled:false}),call("solid.fillet",{id:"f",targetId:"a",edgeKeys:[],radius:2}),call("solid.shell",{id:"s",targetId:"a",faceKeys:["k"],thickness:-1})]) assert.throws(()=>validateCadToolCalls([invalid]));
  assert.equal(validateCommand({type:"fillet",id:42,target:"box",edges:["key"],radius:2}),false);
  assert.equal(validateCommand({type:"chamfer",id:42,target:"box",edges:["key"],distance:2}),false);
});
test("world profiles revolve around explicit plane-local axis with full and half analytic tube volumes",async()=>{
  for(const angle of [180,360]){resetTestDocument();const before=documentState();await apply([section(),call("solid.revolve",{id:"tube",profileObjectIds:["section"],axis:"y",angle})]);await volume("tube",Math.PI*(100-25)*20*angle/360);assert.equal(cadHistory.getPastLabels().length,1);assert.deepEqual(cadDocument.features["feature-tube"].inputs,["section"]);const after=documentState();assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),after);}
});
test("circle and open path sweep into an exact cylinder with live profile and path inputs",async()=>{
  resetTestDocument();await apply([circle("section",3,0),path("path"),call("solid.sweep",{id:"swept",profileObjectIds:["section"],pathObjectId:"path"})]);await volume("swept",Math.PI*9*30);assert.deepEqual(cadDocument.features["feature-swept"].inputs,["section","path"]);
});
test("ordered elevated sections loft a ruled frustum or smooth cylinder and survive serialization",async()=>{
  for(const ruled of [true,false]){resetTestDocument();const r=ruled?3:6;await apply([circle("bottom",6,0),circle("top",r,30),call("solid.loft",{id:"lofted",profileObjectIds:["bottom","top"],ruled})]);await volume("lofted",Math.PI*30*(36+6*r+r*r)/3);assert.deepEqual(cadDocument.features["feature-lofted"].inputs,["bottom","top"]);assert.deepEqual(documentState(deserializeDocument(serializeDocument(cadDocument))),documentState());}
});
test("edge queries transform samples into world coordinates and never expose explorer indices",async()=>{
  resetTestDocument();await box();const data=await edges();assert.equal(data.length,12);assert.equal(data.filter(vertical).length,4);assert.ok(data.every(e=>e.points.every(p=>p[0]>=10-1e-6&&p[1]>=20-1e-6)));assert.equal("index" in data[0],false);
  cadDocument.objects.box.transform!.rotation=[0,90,0];const rotated=await edges();assert.ok(rotated.some(e=>e.points.some(p=>p[2]<-39.99)));data[0].points[0][0]=999;assert.ok((await edges()).every(e=>e.points.every(p=>p[0]!==999)));
});
test("fillet and symmetric chamfer accept exact edges, deterministic IDs and follow-on Boolean in one Undo",async()=>{
  for(const kind of ["fillet","chamfer"] as const){resetTestDocument();await box();const keys=(await edges()).filter(vertical).map(e=>e.key),past=cadHistory.getPastLabels().length;
    await apply([call(`solid.${kind}`,{id:"finished",targetId:"box",edgeKeys:keys,...kind==="fillet"?{radius:2}:{distance:2}}),call("solid.primitive",{id:"tool",primitive:"box",params:{width:5,depth:5,height:20},position:[25,30,0]}),call("solid.boolean",{id:"final",operation:"cut",targetId:"finished",toolId:"tool"})],["box"]);
    await volume("final",(1200-(kind==="fillet"?(4-Math.PI)*4:8))*20-500);assert.equal(cadHistory.getPastLabels().length,past+1);assert.equal(cadDocument.features["feature-finished"].type,kind);assert.deepEqual(cadDocument.features["feature-final"].inputs,["finished","tool"]);
  }
});
test("top-open shell gives analytic wall/base volume and unresolved source faces remain blocked",async()=>{
  resetTestDocument();await box();const plan=await planCadToolPrompt("윗면 제거 두께 2mm 셸",context(["box"]));assert.ok(plan?.ok);const before=documentState();const preview=await previewCadCommand(plan.plan.command);assert.ok(preview.result.ok,preview.result.reason);assert.deepEqual(documentState(),before);assert.ok((await applyCadPlan(preview.planId)).ok);const id=plan.plan.resultObjectIds![0];await volume(id,24000-36*26*18);assert.equal(cadDocument.features[`feature-${id}`].params.referenceStatus,"resolved");
  assert.ok((await dispatchCadCommand({type:"update-primitive",objectId:"box",params:{width:41,depth:30,height:20}})).ok);const read=await session([id]).read(call("cad.edges",{objectId:id}));assert.equal(read.ok,false);assert.match(read.error!,/unresolved/);
});
test("impossible finishing rejects atomically; missing, duplicate, foreign and uncommitted keys reject before review",async()=>{
  resetTestDocument();await box();const keys=(await edges()).filter(vertical).map(e=>e.key),before=documentState(),past=cadHistory.getPastLabels().length;
  const plan=await session(["box"]).plan([call("solid.fillet",{id:"bad",targetId:"box",edgeKeys:keys,radius:1000})]);const preview=await previewCadCommand(plan.command);assert.equal(preview.result.ok,false);discardCadPlan(preview.planId);assert.deepEqual(documentState(),before);assert.equal(cadHistory.getPastLabels().length,past);
  for(const edgeKeys of [["missing"],[keys[0],keys[0]]]) await assert.rejects(session(["box"]).plan([call("solid.chamfer",{id:"bad",targetId:"box",edgeKeys,distance:1})]));
  await assert.rejects(session().plan([call("solid.fillet",{id:"bad",targetId:"box",edgeKeys:keys,radius:2})]),/selected/);
  await assert.rejects(session(["box"]).plan([call("solid.fillet",{id:"box",targetId:"box",edgeKeys:keys,radius:2})]),/already exists/);
  await assert.rejects(session().plan([call("solid.primitive",{id:"new",primitive:"box",params:{width:10,depth:10,height:10},position:[0,0,0]}),call("solid.fillet",{id:"bad",targetId:"new",edgeKeys:keys,radius:1})]),/Apply/);
  const collision=await dispatchCadCommand({type:"fillet",id:"box",target:"box",edges:keys,radius:2});assert.equal(collision.ok,false);assert.deepEqual(documentState(),before);
});
test("invalid profiles and nonplanar paths cannot publish a partial tool graph",async()=>{
  resetTestDocument();await assert.rejects(session().plan([call("curve.polyline",{id:"bad",plane:"XY",points:[[0,0,0],[1,0,1]],closed:false})]),/plane/);
  const before=documentState();const plan=await session().plan([path("path"),call("solid.revolve",{id:"bad",profileObjectIds:["path"],axis:"y",angle:360})]);const preview=await previewCadCommand(plan.command);assert.equal(preview.result.ok,false);assert.deepEqual(documentState(),before);
  await assert.rejects(session().plan([circle("p",3,0),circle("closedPath",20,0),call("solid.sweep",{id:"bad",profileObjectIds:["p"],pathObjectId:"closedPath"})]),/open/);
});
test("local shortcuts use ordered profile inputs and world vertical edges; incomplete requests never fall back",async()=>{
  for(const [prompt,type]of [["선택한 윤곽 Y축 360도 회전","create-revolve"],["스윕","create-sweep"],["직선 로프트","create-loft"]] as const){
    resetTestDocument();await apply(type==="create-revolve"?[section()]:type==="create-sweep"?[circle("section",3,0),path("second")]:[circle("section",6,0),circle("second",3,30)]);
    const ids=type==="create-revolve"?["section"]:["section","second"],result=await planCadToolPrompt(prompt,context(ids));assert.ok(result?.ok,result&&!result.ok?result.reason:undefined);assert.equal(result.plan.command.type,type);
    const preview=await previewCadCommand(result.plan.command);assert.ok(preview.result.ok,preview.result.reason);discardCadPlan(preview.planId);
  }
  for(const prompt of ["수직 모서리 반지름 2mm 필렛","수직 모서리 1mm 모따기"]){resetTestDocument();await box();const result=await planCadToolPrompt(prompt,context(["box"]));assert.ok(result?.ok);const preview=await previewCadCommand(result.plan.command);assert.ok(preview.result.ok,preview.result.reason);discardCadPlan(preview.planId);}
  for(const prompt of ["필렛","로프트 구멍 포함","선택한 윤곽 Z축 360도 회전","윗면 제거 셸"])assert.equal((await planCadToolPrompt(prompt,context()))?.ok,false);
});
test("gateway reads actual edge keys and proposes finishing through the shared review path",async()=>{
  resetTestDocument();await box();const before=documentState();let rounds=0;
  const plan=await requestCopilotPlan("/api",copilotRequest("Round vertical edges",cadDocument,["box"],"XY"),{signal:new AbortController().signal,baseUrl:"https://example.com",toolSession:session(["box"]),fetcher:async(_url,init)=>{
    const body=JSON.parse(String(init?.body));rounds++;const toolCalls=rounds===1?[call("cad.edges",{objectId:"box"})]:[call("solid.fillet",{id:"rounded",targetId:"box",edgeKeys:body.toolResults[0].result.edges.filter(vertical).map((e:{key:string})=>e.key),radius:2})];return new Response(JSON.stringify({version:1,toolCalls}),{headers:{"Content-Type":"application/json"}});
  }});assert.equal(rounds,2);assert.deepEqual(documentState(),before);const preview=await previewCadCommand(plan.command);assert.ok(preview.result.ok,preview.result.reason);assert.ok((await applyCadPlan(preview.planId)).ok);await volume("rounded",(1200-(4-Math.PI)*4)*20);
});
