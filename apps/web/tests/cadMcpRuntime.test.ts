import {CAD_TOOLS as MESH_EXTENDED_TOOLS} from "../src/copilot/cadToolContract";
import test from "node:test";
import assert from "node:assert/strict";
import {cadDocument} from "../src/state/cadDocument";
import {resetTestDocument,documentState} from "./helpers/documentHarness";
import {createCadMcpRuntime,type McpProposalStatus} from "../src/copilot/cadMcpRuntime";
import {createCadToolSession} from "../src/copilot/cadToolSession";
import {previewCadCommand,applyCadPlan,discardCadPlan} from "../src/state/documentPlans";
import {cadHistory,undoDocument} from "../src/state/history";
const signal=()=>new AbortController().signal;
function harness(){resetTestDocument();let selectionIds:string[]=[],plane="XY" as "XY"|"XZ",layerId="layer-default";const receipts=new Map<string,McpProposalStatus>();
 const context=()=>({document:cadDocument,selectionIds,layerId,workPlane:plane});
 const runtime=createCadMcpRuntime({context,review:async(calls,sig)=>{const p=await createCadToolSession(context()).plan(calls,sig),preview=await previewCadCommand(p.command,{signal:sig});if(!preview.result.ok){discardCadPlan(preview.planId);throw Error(preview.result.reason);}const r:McpProposalStatus={proposalId:preview.planId,status:"pending-review",summary:p.summary};receipts.set(r.proposalId,r);return r;},proposal:id=>{const r=receipts.get(id);if(!r)throw Error("Unknown proposal ID.");return r;}});
 return {runtime,select:(ids:string[])=>selectionIds=ids,plane:()=>plane="XZ",layer:()=>layerId="other"};
}
test("MCP runtime queries the same captured catalog and never grants selection or exposes a raw document",async()=>{
 const {runtime}=harness(),before=documentState(),c:any=await runtime.invoke("context",{},signal());assert.equal(c.units,"mm");assert.ok(!c.objects&&!c.features&&!c.rasterAssets);
 const result:any=await runtime.invoke("read",{contextId:c.contextId,calls:[{id:"discover",name:"cad.tools",arguments:{}}]},signal());assert.equal(result.ok,true);assert.equal(result.result.tools.length,Object.keys(MESH_EXTENDED_TOOLS).length);assert.deepEqual(documentState(),before);
 await assert.rejects(runtime.invoke("read",{contextId:c.contextId,calls:[{id:"bad",name:"cad.inspect",arguments:{objectIds:[],script:"evil"}}]},signal()),/Invalid/);
 await assert.rejects(runtime.invoke("apply",{contextId:c.contextId,calls:[{id:"r",name:"cad.objects",arguments:{}}]},signal()),/modeling/);runtime.dispose();
});
test("MCP context rejects document, selection, plane and layer changes before executing a tool",async()=>{
 for(const kind of ["document","selection","plane","layer"]){const h=harness(),c:any=await h.runtime.invoke("context",{},signal());if(kind==="document")cadDocument.revision++;if(kind==="selection")h.select(["other"]);if(kind==="plane")h.plane();if(kind==="layer")h.layer();await assert.rejects(h.runtime.invoke("read",{contextId:c.contextId,calls:[{id:"r",name:"cad.objects",arguments:{}}]},signal()),/context changed/);h.runtime.dispose();}
});
test("MCP batch is a real detached native preview; only normal Apply mutates and one Undo restores",async()=>{
 const {runtime}=harness(),before=documentState(),c:any=await runtime.invoke("context",{},signal());
 const proposal:any=await runtime.invoke("propose",{contextId:c.contextId,calls:[{id:"wall",name:"wall.create",arguments:{id:"mcpWall",start:[0,0],end:[4000,0],height:3000,thickness:200,baseLevel:0,openings:[]}}]},signal());assert.equal(proposal.status,"pending-review");assert.deepEqual(documentState(),before);assert.equal(cadHistory.getPastLabels().length,0);
 assert.deepEqual(await runtime.invoke("proposal",{proposalId:proposal.proposalId},signal()),proposal);assert.ok((await applyCadPlan(proposal.proposalId)).ok);assert.ok(Object.values(cadDocument.features).find(f=>f.output==="mcpWall")?.params.architecturalWall);assert.equal(cadHistory.getPastLabels().length,1);assert.ok(undoDocument());assert.deepEqual(documentState(),before);discardCadPlan(proposal.proposalId);runtime.dispose();
});
test("MCP cannot turn reading an unselected target into editing it and cancels before CAD work",async()=>{
 const {runtime}=harness(),c:any=await runtime.invoke("context",{},signal());const controller=new AbortController();controller.abort();await assert.rejects(runtime.invoke("read",{contextId:c.contextId,calls:[{id:"r",name:"cad.objects",arguments:{}}]},controller.signal));
 await assert.rejects(runtime.invoke("propose",{contextId:c.contextId,calls:[{id:"r",name:"cad.objects",arguments:{}}]},signal()),/modeling/);
 await assert.rejects(runtime.invoke("propose",{contextId:c.contextId,calls:[{id:"edit",name:"wall.update",arguments:{objectId:"unselected",height:3000,thickness:200,baseLevel:0,refreshDrawings:true}}]},signal()),/Select/);runtime.dispose();
});
