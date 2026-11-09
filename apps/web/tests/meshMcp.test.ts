import test from "node:test";
import assert from "node:assert/strict";
import {Client,InMemoryTransport} from "@modelcontextprotocol/client";
import {createCadMcpServer} from "../server/cadMcpServer";
import {createCadMcpRuntime,type McpProposalStatus} from "../src/copilot/cadMcpRuntime";
import {createCadToolSession} from "../src/copilot/cadToolSession";
import {previewCadCommand,applyCadPlan} from "../src/state/documentPlans";
import {cadDocument} from "../src/state/cadDocument";
import {documentMesh} from "../src/state/meshCommands";
import {resetTestDocument,documentState} from "./helpers/documentHarness";
import {undoDocument,redoDocument,cadHistory} from "../src/state/history";

test("official MCP mesh tools reach native reviewed transactions, structural reads and Undo",async()=>{
 resetTestDocument();let selectionIds:string[]=[];const receipts=new Map<string,McpProposalStatus>();
 const context=()=>({document:cadDocument,selectionIds,layerId:"layer-default",workPlane:"XY" as const});
 const runtime=createCadMcpRuntime({context,review:async(calls,signal)=>{const plan=await createCadToolSession(context()).plan(calls,signal),preview=await previewCadCommand(plan.command,{signal});if(!preview.result.ok)throw Error(preview.result.reason);const receipt:McpProposalStatus={proposalId:preview.planId,status:"pending-review",resultObjectIds:plan.resultObjectIds};receipts.set(preview.planId,receipt);return receipt;},proposal:id=>receipts.get(id)!});
 const server=createCadMcpServer(async(method,params,signal)=>{try{return {ok:true,value:await runtime.invoke(method,params,signal)};}catch(e){return {ok:false,error:String(e)};}}),client=new Client({name:"mesh-integration",version:"1"}),[a,b]=InMemoryTransport.createLinkedPair();
 const call=async(name:string,args:Record<string,unknown>={})=>{const result=await client.callTool({name,arguments:args});assert.notEqual(result.isError,true,JSON.stringify(result));return (result.structuredContent as any).result;};
 try{await server.connect(a);await client.connect(b);const listed=await client.listTools();for(const name of ["mesh.create","mesh.inspect","mesh.transform","mesh.extrude"])assert.ok(listed.tools.some(t=>t.name===name));assert.equal(listed.tools.find(t=>t.name==="mesh.inspect")!.annotations!.readOnlyHint,true);
  const initial=documentState(),ctx=await call("cad.context"),creation=await call("mesh.create",{_context:ctx.contextId,id:"mcpMesh",size:20});assert.equal(creation.status,"pending-review");assert.deepEqual(documentState(),initial);assert.equal((await applyCadPlan(creation.proposalId)).ok,true);assert.equal(documentMesh(cadDocument,"mcpMesh")!.faces.length,12);
  const unselected=await call("cad.context"),rejected=await client.callTool({name:"mesh.extrude",arguments:{_context:unselected.contextId,objectId:"mcpMesh",faceId:"f2",distance:3}});assert.equal(rejected.isError,true);
  selectionIds=["mcpMesh"];const selected=await call("cad.context"),read=await call("mesh.inspect",{_context:selected.contextId,objectId:"mcpMesh",mode:"face",limit:2});assert.equal(read.ok,true);assert.equal(read.result.elements.length,2);
  const before=documentState(),proposal=await call("mesh.extrude",{_context:selected.contextId,objectId:"mcpMesh",faceId:"f2",distance:3});assert.deepEqual(documentState(),before);assert.equal((await applyCadPlan(proposal.proposalId)).ok,true);assert.equal(cadHistory.getPastLabels().length,2);const after=documentState();undoDocument();assert.deepEqual(documentState(),before);redoDocument();assert.deepEqual(documentState(),after);
  const invalidContext=await call("cad.context"),snapshot=documentState(),bad=await client.callTool({name:"mesh.transform",arguments:{_context:invalidContext.contextId,objectId:"mcpMesh",mode:"vertex",elementIds:["missing"],operation:"move",value:[1,0,0]}});assert.equal(bad.isError,true);assert.deepEqual(documentState(),snapshot);
 }finally{runtime.dispose();await client.close();await server.close();}
});
