import test from "node:test";
import assert from "node:assert/strict";
import {cadDocument} from "../src/state/cadDocument";
import {resetTestDocument,documentState} from "./helpers/documentHarness";
import {createCadMcpRuntime,type McpProposalStatus} from "../src/copilot/cadMcpRuntime";
const calls=[{id:"box",name:"solid.primitive",arguments:{id:"box",primitive:"box",params:{width:10,depth:10,height:10},position:[0,0,0]}}];
const signal=()=>new AbortController().signal;
const flush=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
test("deferred MCP acknowledges before native validation, then resolves the same UI receipt without remote Apply",async()=>{
 resetTestDocument();let resolve!:(r:McpProposalStatus)=>void,receipt:McpProposalStatus={proposalId:"native",status:"pending-review"};
 const runtime=createCadMcpRuntime({context:()=>({document:cadDocument,selectionIds:[],layerId:"layer-default",workPlane:"XY"}),review:async()=>new Promise<McpProposalStatus>(r=>resolve=r),proposal:id=>{assert.equal(id,"native");return receipt;}}),before=documentState();
 try{const c:any=await runtime.invoke("context",{},signal()),ticket:any=await runtime.invoke("propose",{contextId:c.contextId,calls,waitForReview:false},signal());assert.equal(ticket.status,"validating");assert.equal((await runtime.invoke("proposal",ticket,signal()) as any).status,"validating");await assert.rejects(runtime.invoke("propose",{contextId:c.contextId,calls},signal()),/Another/);resolve(receipt);await flush();assert.equal((await runtime.invoke("proposal",ticket,signal()) as any).status,"pending-review");receipt={proposalId:"native",status:"applied",resultObjectIds:["box"]};const applied:any=await runtime.invoke("proposal",ticket,signal());assert.equal(applied.proposalId,ticket.proposalId);assert.equal(applied.status,"applied");assert.deepEqual(documentState(),before);}finally{runtime.dispose();}
});
test("deferred native work aborts on changed context and on bridge disposal",async()=>{
 for(const dispose of [false,true]){resetTestDocument();let selectionIds:string[]=[],received:AbortSignal|undefined;const runtime=createCadMcpRuntime({context:()=>({document:cadDocument,selectionIds,layerId:"layer-default",workPlane:"XY"}),review:async(_calls,s)=>{received=s;return new Promise((_r,reject)=>s.addEventListener("abort",()=>reject(Error("Aborted native preview")),{once:true}));},proposal:()=>{throw Error("No native review.");}});const before=documentState(),c:any=await runtime.invoke("context",{},signal()),ticket:any=await runtime.invoke("propose",{contextId:c.contextId,calls,waitForReview:false},signal());if(dispose)runtime.dispose();else{selectionIds=["different"];assert.equal((await runtime.invoke("proposal",ticket,signal()) as any).status,"cancelled");runtime.dispose();}assert.equal(received?.aborted,true);await flush();assert.deepEqual(documentState(),before);}
});
test("deferred validation has a bounded deadline and records native failures as rejected",async t=>{
 t.mock.timers.enable({apis:["setTimeout"]});resetTestDocument();let received:AbortSignal|undefined;
 const runtime=createCadMcpRuntime({context:()=>({document:cadDocument,selectionIds:[],layerId:"layer-default",workPlane:"XY"}),review:async(_c,s)=>{received=s;return new Promise((_r,reject)=>s.addEventListener("abort",()=>reject(Error("Timeout cancelled native preview")),{once:true}));},proposal:()=>{throw Error("No native review.");}});
 try{const c:any=await runtime.invoke("context",{},signal()),ticket:any=await runtime.invoke("propose",{contextId:c.contextId,calls,waitForReview:false},signal());t.mock.timers.tick(180001);await flush();const rejected:any=await runtime.invoke("proposal",ticket,signal());assert.equal(rejected.status,"rejected");assert.match(rejected.reason,/180 second/);assert.equal(received?.aborted,true);}finally{runtime.dispose();t.mock.timers.reset();}
});
test("completed deferred failures keep only bounded receipt metadata",async()=>{
 resetTestDocument();const runtime=createCadMcpRuntime({context:()=>({document:cadDocument,selectionIds:[],layerId:"layer-default",workPlane:"XY"}),review:async()=>{throw Error("x".repeat(5000));},proposal:()=>{throw Error("No native review.");}});
 try{const c:any=await runtime.invoke("context",{},signal()),ticket:any=await runtime.invoke("propose",{contextId:c.contextId,calls,waitForReview:false},signal());await flush();const rejected:any=await runtime.invoke("proposal",ticket,signal());assert.equal(rejected.status,"rejected");assert.equal(rejected.reason.length,1000);assert.ok(!Object.hasOwn(rejected,"session"));}finally{runtime.dispose();}
});
