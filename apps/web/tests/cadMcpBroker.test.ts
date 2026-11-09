import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {once} from "node:events";
import {createCadMcpBroker} from "../server/cadMcpBroker";
async function harness(){const broker=createCadMcpBroker(),server=createServer((req,res)=>{void broker.handler(req,res,()=>{res.writeHead(404);res.end();});});server.listen(0,"127.0.0.1");await once(server,"listening");const url=`http://127.0.0.1:${(server.address() as any).port}`;
 const post=(path:string,body:unknown,token?:string,origin:string|false=url,signal?:AbortSignal)=>fetch(`${url}/api/mcp/${path}`,{method:"POST",headers:{"Content-Type":"application/json",...origin?{Origin:origin}:{},...token?{Authorization:`Bearer ${token}`}:{ }},body:JSON.stringify(body),signal});
 return {post,url,close:async()=>{broker.dispose();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}};}
test("MCP broker is disabled until same-origin registration, bound to one editor and revocable",async()=>{
 const h=await harness();try{assert.equal((await h.post("register",{},undefined,"https://evil.example")).status,403);assert.equal((await h.post("register",{},undefined,false)).status,403);assert.equal((await h.post("call",{method:"context"},"unknown",false)).status,401);
 const r=await(await h.post("register",{})).json(),env=r.configuration.mcpServers.agentwebcad.env,agent=env.AGENT_WEBCAD_BRIDGE_TOKEN;assert.equal(env.AGENT_WEBCAD_BRIDGE_URL,h.url);assert.notEqual(r.uiToken,agent);
 assert.equal((await h.post("poll",{},agent)).status,401);assert.equal((await h.post("call",{method:"context"},agent)).status,403);
 const waiting=h.post("call",{method:"context",params:{}},agent,false);const jobs=await(await h.post("poll",{},r.uiToken)).json();assert.equal(jobs.jobs[0].method,"context");const other=await(await h.post("register",{})).json();assert.equal((await h.post("result",{id:jobs.jobs[0].id,result:{ok:true,value:{documentId:"wrong-editor"}}},other.uiToken)).status,409);await h.post("result",{id:jobs.jobs[0].id,result:{ok:true,value:{documentId:"one"}}},r.uiToken);assert.deepEqual(await(await waiting).json(),{ok:true,value:{documentId:"one"}});
 const second=await(await h.post("register",{})).json();assert.equal((await h.post("result",{id:jobs.jobs[0].id,result:{}},second.uiToken)).status,409);assert.equal((await h.post("call",{method:"apply"},agent,false)).status,400);
 await h.post("close",{},r.uiToken);assert.equal((await h.post("call",{method:"context"},agent,false)).status,401);
 }finally{await h.close();}
});
test("MCP client cancellation removes an outstanding call and delivers cancellation to its editor",async()=>{
 const h=await harness();try{const r=await(await h.post("register",{})).json(),token=r.configuration.mcpServers.agentwebcad.env.AGENT_WEBCAD_BRIDGE_TOKEN,c=new AbortController();
 const waiting=h.post("call",{method:"read",params:{}},token,false,c.signal);const jobs=await(await h.post("poll",{},r.uiToken)).json();assert.equal(jobs.jobs[0].method,"read");c.abort();await assert.rejects(waiting);
 const cancel=await(await h.post("poll",{},r.uiToken)).json();assert.equal(cancel.jobs[0].method,"cancel");assert.equal(cancel.jobs[0].id,jobs.jobs[0].id);assert.equal((await h.post("result",{id:jobs.jobs[0].id,result:{}},r.uiToken)).status,409);
 }finally{await h.close();}
});
