import {CAD_TOOLS as MESH_EXTENDED_TOOLS} from "../src/copilot/cadToolContract";
import test from "node:test";
import assert from "node:assert/strict";
import {Client,InMemoryTransport} from "@modelcontextprotocol/client";
import {StdioClientTransport} from "@modelcontextprotocol/client/stdio";
import {createServer} from "node:http";
import {once} from "node:events";
import {createCadMcpServer,createCadMcpForward} from "../server/cadMcpServer";
import {createCadMcpBroker} from "../server/cadMcpBroker";

test("Official SDK advertises the same CAD schemas, rejects malformed inputs and returns review receipts",async()=>{
 const seen:any[]=[],server=createCadMcpServer(async(method,params)=>{seen.push({method,params});return {ok:true,value:method==="propose"?{proposalId:"one",status:"pending-review"}:{contextId:"context"}};}),client=new Client({name:"cad-test",version:"1"}),[a,b]=InMemoryTransport.createLinkedPair();
 try{await server.connect(a);await client.connect(b);const tools=await client.listTools();assert.equal(tools.tools.length,Object.keys(MESH_EXTENDED_TOOLS).length+3);const wall=tools.tools.find(t=>t.name==="wall.create")!;assert.ok(wall.inputSchema.properties!._context);assert.ok(wall.inputSchema.properties!.openings);assert.equal(wall.annotations!.readOnlyHint,false);assert.equal(tools.tools.find(t=>t.name==="cad.measure")!.annotations!.readOnlyHint,true);assert.ok(!tools.tools.some(t=>t.name!=="sculpt.apply"&&/apply|script|execute/.test(t.name)));assert.match(tools.tools.find(t=>t.name==="sculpt.apply")!.description!,/Returns pending-review, never applies/);
 const bad=await client.callTool({name:"wall.create",arguments:{_context:"context",script:"evil"}});assert.equal(bad.isError,true);assert.equal(seen.length,0);
 const c=await client.callTool({name:"cad.context",arguments:{}});assert.equal(c.isError,undefined);assert.equal(seen[0].method,"context");
 const proposal=await client.callTool({name:"solid.primitive",arguments:{_context:"context",id:"box",primitive:"box",params:{width:10,depth:20,height:30},position:[0,0,0]}});assert.equal((proposal.structuredContent as any).result.status,"pending-review");assert.equal(seen[1].method,"propose");assert.equal(seen[1].params.calls[0].name,"solid.primitive");assert.ok(!Object.hasOwn(seen[1].params.calls[0].arguments,"_context"));
 const sculpt=await client.callTool({name:"sculpt.apply",arguments:{_context:"context",objectId:"mesh",previewId:"validated"}});assert.equal((sculpt.structuredContent as any).result.status,"pending-review");assert.equal(seen[2].method,"propose");assert.equal(seen[2].params.calls[0].name,"sculpt.apply");
 }finally{await client.close();await server.close();}
});
test("Official MCP result marks native errors and disconnected editors as errors rather than success",async()=>{
 let mode=0;const server=createCadMcpServer(async()=>mode++?{ok:true,value:{ok:false,error:"missing face"}}:{ok:false,error:"expired context"}),client=new Client({name:"cad-test",version:"1"}),[a,b]=InMemoryTransport.createLinkedPair();try{await server.connect(a);await client.connect(b);const first=await client.callTool({name:"cad.context",arguments:{}});assert.equal(first.isError,true);const second=await client.callTool({name:"cad.measure",arguments:{_context:"x",objectIds:["body"]}});assert.equal(second.isError,true);assert.match(JSON.stringify(second.structuredContent),/missing face/);}finally{await client.close();await server.close();}
});
test("official MCP schema forwards explicit deferred validation and keeps publication out of the API",async()=>{
 const requests:any[]=[],server=createCadMcpServer(async(method,params)=>{requests.push({method,params});return {ok:true,value:{proposalId:"ticket",status:"validating"}};}),client=new Client({name:"deferred-test",version:"1"}),[a,b]=InMemoryTransport.createLinkedPair();
 try{await server.connect(a);await client.connect(b);const args={contextId:"captured",calls:[{id:"fit",name:"curve.adjust",arguments:{objectId:"inner",pointIndex:0,delta:[1,0,0]}}],waitForReview:false};const response=await client.callTool({name:"cad.propose",arguments:args});assert.equal((response.structuredContent as any).result.status,"validating");assert.equal(requests[0].params.waitForReview,false);const bad=await client.callTool({name:"cad.propose",arguments:{...args,waitForReview:"no"}});assert.equal(bad.isError,true);assert.equal(requests.length,1);assert.equal((await client.listTools()).tools.length,Object.keys(MESH_EXTENDED_TOOLS).length+3);}finally{await client.close();await server.close();}
});
test("MCP forwarding accepts only bounded authenticated loopback endpoints",()=>{
 for(const url of ["https://example.com","http://127.0.0.1/path","http://user:pass@localhost","http://127.0.0.1/?key=x"])assert.throws(()=>createCadMcpForward(url,"a".repeat(64)));
 assert.throws(()=>createCadMcpForward("http://127.0.0.1:5188","bad"));assert.doesNotThrow(()=>createCadMcpForward("http://127.0.0.1:5188","a".repeat(64)));
});
test("Real stdio initialize/tools/list/call/cancellation reach the exact paired browser queue",async()=>{
 const broker=createCadMcpBroker(),http=createServer((req,res)=>{void broker.handler(req,res,()=>{res.writeHead(404);res.end();});});http.listen(0,"127.0.0.1");await once(http,"listening");const url=`http://127.0.0.1:${(http.address() as any).port}`;
 const post=(path:string,body:unknown,token?:string)=>fetch(`${url}/api/mcp/${path}`,{method:"POST",headers:{Origin:url,"Content-Type":"application/json",...token?{Authorization:`Bearer ${token}`}:{ }},body:JSON.stringify(body)});
 const registration=await(await post("register",{})).json(),config=registration.configuration.mcpServers.agentwebcad,client=new Client({name:"real-stdio-test",version:"1"});
 try{await client.connect(new StdioClientTransport({...config,stderr:"pipe"}));assert.equal(client.getServerVersion()!.name,"agent-webcad");assert.equal((await client.listTools()).tools.length,Object.keys(MESH_EXTENDED_TOOLS).length+3);
 const context=client.callTool({name:"cad.context",arguments:{}});const jobs=await(await post("poll",{},registration.uiToken)).json();assert.equal(jobs.jobs[0].method,"context");await post("result",{id:jobs.jobs[0].id,result:{ok:true,value:{contextId:"real-stdio",version:{revision:1}}}},registration.uiToken);assert.equal(((await context).structuredContent as any).result.contextId,"real-stdio");
 const controller=new AbortController(),read=client.callTool({name:"cad.objects",arguments:{_context:"real-stdio"}},{signal:controller.signal});const request=await(await post("poll",{},registration.uiToken)).json();assert.equal(request.jobs[0].method,"read");controller.abort();await assert.rejects(read);const cancel=await(await post("poll",{},registration.uiToken)).json();assert.equal(cancel.jobs[0].method,"cancel");assert.equal(cancel.jobs[0].id,request.jobs[0].id);
 await post("close",{},registration.uiToken);assert.equal((await client.callTool({name:"cad.context",arguments:{}})).isError,true);
 }finally{await client.close();broker.dispose();http.closeAllConnections();await new Promise<void>(r=>http.close(()=>r()));}
});
