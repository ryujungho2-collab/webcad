import test from "node:test";
import assert from "node:assert/strict";
import {Client,InMemoryTransport} from "@modelcontextprotocol/client";
import {edgeKey,meshEdges,evaluateMeshModifiers,type EditableMesh} from "@agent-webcad/cad-document";
import type {CadCommand} from "@agent-webcad/cad-commands";
import {createCadMcpServer} from "../server/cadMcpServer";
import {createCadMcpRuntime,type McpProposalStatus} from "../src/copilot/cadMcpRuntime";
import {createCadToolSession} from "../src/copilot/cadToolSession";
import {previewCadCommand,applyCadPlan} from "../src/state/documentPlans";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {cadDocument} from "../src/state/cadDocument";
import {documentMesh} from "../src/state/meshCommands";
import {resetTestDocument,documentState} from "./helpers/documentHarness";

function shape(mesh:EditableMesh){const positions=new Map(mesh.vertices.map(v=>[v.id,v.position]));return {vertices:mesh.vertices.map(v=>v.position).sort(),faces:mesh.faces.map(f=>{const corners=f.vertices.map(id=>JSON.stringify(positions.get(id)));return corners.map((_,i)=>[...corners.slice(i),...corners.slice(0,i)].join(";")).sort()[0];}).sort()};}
test("official MCP Polygon tools and UI Preview/Apply produce equivalent topology; reads expose control/evaluation separately",async()=>{
 const receipts=new Map<string,McpProposalStatus>(),context=()=>({document:cadDocument,selectionIds:["poly"],layerId:"layer-default",workPlane:"XY" as const});
 const runtime=createCadMcpRuntime({context,review:async(calls,signal)=>{const plan=await createCadToolSession(context()).plan(calls,signal),preview=await previewCadCommand(plan.command,{signal});if(!preview.result.ok)throw Error(preview.result.reason);const receipt:McpProposalStatus={proposalId:preview.planId,status:"pending-review",resultObjectIds:plan.resultObjectIds};receipts.set(preview.planId,receipt);return receipt;},proposal:id=>receipts.get(id)!});
 const server=createCadMcpServer(async(method,params,signal)=>{try{return {ok:true,value:await runtime.invoke(method,params,signal)};}catch(e){return {ok:false,error:String(e)};}}),client=new Client({name:"polygon-parity",version:"2"}),[a,b]=InMemoryTransport.createLinkedPair();
 const call=async(name:string,args:Record<string,unknown>={})=>{const r=await client.callTool({name,arguments:args});assert.notEqual(r.isError,true,JSON.stringify(r));return (r.structuredContent as any).result;};
 const fixture=async(kind="cube")=>{resetTestDocument();assert.equal((await dispatchCadCommand(kind==="triangles"?{type:"create-mesh",id:"poly",size:10}:{type:"create-polygon-mesh",id:"poly",size:10,shape:"cube"})).ok,true);if(kind==="triangles")await dispatchCadCommand({type:"upgrade-mesh",objectId:"poly"});if(kind==="loops")await dispatchCadCommand({type:"edit-polygon-mesh",objectId:"poly",operation:{kind:"delete",mode:"face",elementIds:["f2","f3","f4","f5"]}});};
 try{await server.connect(a);await client.connect(b);
  const cases:{name:string;fixture?:string;args:Record<string,unknown>;operation:any}[]=[
   {name:"mesh.extrudeRegion",fixture:"triangles",args:{faceIds:["f2","f3"],distance:2},operation:{kind:"extrude",faceIds:["f2","f3"],distance:2}},
   {name:"mesh.inset",args:{faceIds:["f1"],distance:1},operation:{kind:"inset",faceIds:["f1"],distance:1}},
   {name:"mesh.bevel",args:{edgeId:edgeKey("v0","v1"),distance:1},operation:{kind:"bevel",edgeId:edgeKey("v0","v1"),distance:1}},
   {name:"mesh.bridge",fixture:"loops",args:{offset:0},operation:{kind:"bridge",offset:0}},
   {name:"mesh.loopCut",args:{edgeId:edgeKey("v0","v1"),factor:.25},operation:{kind:"loop-cut",edgeId:edgeKey("v0","v1"),factor:.25}},
   {name:"mesh.merge",args:{vertexIds:["v0","v1"]},operation:{kind:"merge",vertexIds:["v0","v1"]}},
   {name:"mesh.dissolve",fixture:"triangles",args:{edgeId:edgeKey("v4","v6")},operation:{kind:"dissolve",edgeId:edgeKey("v4","v6")}},
   {name:"mesh.delete",args:{mode:"face",elementIds:["f0"]},operation:{kind:"delete",mode:"face",elementIds:["f0"]}}
  ];
  const tools=await client.listTools();for(const entry of cases)assert.ok(tools.tools.some(t=>t.name===entry.name));
  for(const entry of cases){await fixture(entry.fixture);if(entry.fixture==="loops"){const edgeIds=meshEdges(documentMesh(cadDocument,"poly")!).map(e=>e.id);entry.args.edgeIds=edgeIds;entry.operation.edgeIds=edgeIds;}
   const command={type:"edit-polygon-mesh",objectId:"poly",operation:entry.operation} as CadCommand,uiReview=await previewCadCommand(command);assert.equal(uiReview.result.ok,true,uiReview.result.reason);await applyCadPlan(uiReview.planId);const expected=shape(documentMesh(cadDocument,"poly")!);
   await fixture(entry.fixture);const before=documentState(),ctx=await call("cad.context"),proposal=await call(entry.name,{_context:ctx.contextId,objectId:"poly",...entry.args});assert.deepEqual(documentState(),before);assert.equal(proposal.status,"pending-review");assert.equal((await applyCadPlan(proposal.proposalId)).ok,true);assert.deepEqual(shape(documentMesh(cadDocument,"poly")!),expected,entry.name);
  }
  await fixture();const original=structuredClone(documentMesh(cadDocument,"poly")!),ctx=await call("cad.context"),modifiers=[{id:"smooth",type:"catmull-clark",level:1,enabled:true,boundary:"smooth",creaseEdges:[]}],proposal=await call("mesh.modifiers",{_context:ctx.contextId,objectId:"poly",modifiers});assert.equal((await applyCadPlan(proposal.proposalId)).ok,true);assert.deepEqual(documentMesh(cadDocument,"poly")!.faces,original.faces);
  const current=await call("cad.context"),control=await call("mesh.inspect",{_context:current.contextId,objectId:"poly",mode:"face",limit:2}),evaluated=await call("mesh.evaluation",{_context:current.contextId,objectId:"poly",mode:"face",limit:2});assert.equal(control.result.total,6);assert.equal(evaluated.result.total,24);assert.equal(evaluated.result.elements.length,2);assert.equal(evaluated.result.editable,false);assert.ok(original.faces.some(f=>f.id===evaluated.result.elements[0].source));assert.equal(evaluateMeshModifiers(documentMesh(cadDocument,"poly")!).mesh.faces.length,24);
  const before=documentState(),bad=await client.callTool({name:"mesh.modifiers",arguments:{_context:current.contextId,objectId:"poly",modifiers:[{...modifiers[0],level:1.5}]}});assert.equal(bad.isError,true);assert.deepEqual(documentState(),before);
  resetTestDocument();const empty=await call("cad.context"),create=await call("mesh.createPolygon",{_context:empty.contextId,id:"poly",shape:"ngon",sides:7,size:10});assert.equal((await applyCadPlan(create.proposalId)).ok,true);assert.equal(documentMesh(cadDocument,"poly")!.faces[0].vertices.length,7);
  resetTestDocument();await dispatchCadCommand({type:"create-mesh",id:"poly",size:10});const old=await call("cad.context"),upgrade=await call("mesh.upgrade",{_context:old.contextId,objectId:"poly"});assert.equal((await applyCadPlan(upgrade.proposalId)).ok,true);assert.equal(documentMesh(cadDocument,"poly")!.version,2);
 }finally{runtime.dispose();await client.close();await server.close();}
});
