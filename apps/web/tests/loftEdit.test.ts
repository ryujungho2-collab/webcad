import test from "node:test";
import assert from "node:assert/strict";
import {Client,InMemoryTransport} from "@modelcontextprotocol/client";
import {serializeDocument,deserializeDocument} from "@agent-webcad/cad-document";
import {validateCommand} from "@agent-webcad/cad-commands";
import {createCadMcpServer} from "../server/cadMcpServer";
import {createCadMcpRuntime,type McpProposalStatus} from "../src/copilot/cadMcpRuntime";
import {createCadToolSession} from "../src/copilot/cadToolSession";
import {planCadToolPrompt} from "../src/copilot/cadToolPrompts";
import {cadDocument} from "../src/state/cadDocument";
import {previewCadCommand,applyCadPlan,discardCadPlan,getCadPlanSolidGhosts} from "../src/state/documentPlans";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {measureDocumentObject} from "../src/state/documentQuery";
import {cadHistory,undoDocument,redoDocument} from "../src/state/history";
import {resetTestDocument,documentState,restoreTestDocument} from "./helpers/documentHarness";
import {loftContext,loftEdit,installEditableLoft} from "./helpers/loftFixture";
const feature=()=>cadDocument.features["feature-editableLoft"];
async function setup(){resetTestDocument();await installEditableLoft();cadHistory.clear();}
async function preview(ruled:boolean){const p=await createCadToolSession(loftContext()).plan([loftEdit(ruled)]);const r=await previewCadCommand(p.command);assert.ok(r.result.ok,r.result.reason);return r;}

test("three-section loft changes real curvature, retains identity and source graph, restores with one Undo and reopen",async()=>{
 await setup();await dispatchCadCommand({type:"move-object",objectId:"editableLoft",translation:[70,40,10]});cadHistory.clear();
 assert.ok((await dispatchCadCommand({type:"set-solid-finish",objectId:"editableLoft",finish:{name:"Ceramic",color:"#dfddd4",roughness:.8,metalness:0,opacity:1}})).ok);cadHistory.clear();
 const before=documentState(),object=structuredClone(cadDocument.objects.editableLoft),sources=structuredClone(feature().inputs);
 const ruled=await measureDocumentObject(cadDocument,"editableLoft");
 // Two conical frusta, independently calculated from the three circle radii.
 assert.ok(Math.abs(ruled.volume!-Math.PI*10*(400+200+100+100+250+625))<.01);
 const p=await preview(false);assert.deepEqual(documentState(),before);assert.ok(getCadPlanSolidGhosts(p.planId).length);
 assert.ok((await applyCadPlan(p.planId)).ok);discardCadPlan(p.planId);
 const smooth=await measureDocumentObject(cadDocument,"editableLoft");assert.equal(smooth.validity,"valid");assert.ok(Math.abs(smooth.volume!-ruled.volume!)>100);
 assert.deepEqual(cadDocument.objects.editableLoft,object);assert.deepEqual(feature().inputs,sources);assert.equal(feature().params.ruled,false);
 const after=documentState();assert.equal(cadHistory.getPastLabels().length,1);assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),after);
 assert.deepEqual(feature().params.solidFinish,before.features["feature-editableLoft"].params.solidFinish);
 restoreTestDocument(deserializeDocument(serializeDocument(cadDocument)));assert.deepEqual(documentState(),after);
 const reverse=await preview(true);assert.ok((await applyCadPlan(reverse.planId)).ok);discardCadPlan(reverse.planId);assert.deepEqual(documentState(),before);
});

test("source edits still regenerate after smooth conversion and rollback cleanly",async()=>{
 await setup();const p=await preview(false);assert.ok((await applyCadPlan(p.planId)).ok);discardCadPlan(p.planId);const before=documentState();
 const m=await measureDocumentObject(cadDocument,"editableLoft");
 const result=await dispatchCadCommand({type:"move-object",objectId:"section1",translation:[4,0,4]});assert.ok(result.ok,result.reason);
 assert.equal(feature().params.ruled,false);assert.deepEqual(feature().inputs,["section0","section1","section2"]);
 assert.equal((await measureDocumentObject(cadDocument,"editableLoft")).validity,"valid");assert.notEqual((await measureDocumentObject(cadDocument,"editableLoft")).volume,m.volume);
 assert.ok(undoDocument());assert.deepEqual(documentState(),before);
});

test("natural-language edits compile to the same tool; missing selection, no-op, lock and stale preview are safe",async()=>{
 await setup();assert.equal(validateCommand({type:"update-loft",objectId:"editableLoft",ruled:"false"}),false);
 const nl=await planCadToolPrompt("선택한 로프트를 부드러운 곡면으로 바꿔줘",loftContext());assert.ok(nl?.ok);if(nl?.ok)assert.deepEqual(nl.plan.command,(await createCadToolSession(loftContext()).plan([loftEdit(false)])).command);
 const noSelection=await planCadToolPrompt("선택한 곡면을 직선 연결로 바꿔줘",loftContext([]));assert.equal(noSelection?.ok,false);
 await assert.rejects(createCadToolSession(loftContext()).plan([loftEdit(true)]),/unchanged/);
 await assert.rejects(createCadToolSession(loftContext(["section0"])).plan([loftEdit(false)]));
 cadDocument.layers["layer-default"].locked=true;const locked=documentState();assert.equal((await dispatchCadCommand({type:"update-loft",objectId:"editableLoft",ruled:false})).ok,false);assert.deepEqual(documentState(),locked);cadDocument.layers["layer-default"].locked=false;
 const p=await preview(false);await dispatchCadCommand({type:"rename-object",objectId:"editableLoft",name:"Changed"});const changed=documentState();assert.equal((await applyCadPlan(p.planId)).ok,false);assert.deepEqual(documentState(),changed);discardCadPlan(p.planId);
});

test("official MCP SDK edits a native loft via the shared runtime, preserves manual review and rejects stale context",async()=>{
 await setup();const receipts=new Map<string,McpProposalStatus>();
 const runtime=createCadMcpRuntime({context:loftContext,review:async(calls,signal)=>{const plan=await createCadToolSession(loftContext()).plan(calls,signal),p=await previewCadCommand(plan.command,{signal});assert.ok(p.result.ok,p.result.reason);const receipt:McpProposalStatus={proposalId:p.planId,status:"pending-review",summary:plan.summary};receipts.set(p.planId,receipt);return receipt;},proposal:id=>receipts.get(id)!});
 const server=createCadMcpServer(async(method,params,signal)=>({ok:true,value:await runtime.invoke(method,params,signal)})),client=new Client({name:"loft-edit-test",version:"1"}),[a,b]=InMemoryTransport.createLinkedPair();
 try{await server.connect(a);await client.connect(b);const c=await client.callTool({name:"cad.context",arguments:{}}),contextId=(c.structuredContent as any).result.contextId,before=documentState();
 const r=await client.callTool({name:"solid.loft.update",arguments:{_context:contextId,objectId:"editableLoft",ruled:false}});assert.ok(!r.isError,JSON.stringify(r));assert.deepEqual(documentState(),before);const p=(r.structuredContent as any).result;assert.equal(p.status,"pending-review");assert.ok((await applyCadPlan(p.proposalId)).ok);discardCadPlan(p.proposalId);assert.equal(feature().params.ruled,false);
 assert.equal((await client.callTool({name:"solid.loft.update",arguments:{_context:contextId,objectId:"editableLoft",ruled:true}})).isError,true);
 assert.ok(undoDocument());assert.deepEqual(documentState(),before);
 }finally{runtime.dispose();await client.close();await server.close();}
});
