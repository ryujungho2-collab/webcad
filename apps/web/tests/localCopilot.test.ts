import {test} from "node:test";
import assert from "node:assert/strict";
import {createServer,type Server} from "node:http";
import {once} from "node:events";
import {createLocalCopilot,localOllamaUrl,modelProposalIssue} from "../server/localCopilot";
import {copilotRequest} from "../src/copilot/copilotConnection";
import {confirmedIntent,parseDesignIntent} from "../src/copilot/designIntent";
import {emptyDesignStudy} from "../src/copilot/designStudy";
import {cadDocument} from "../src/state/cadDocument";
import {resetTestDocument,documentState} from "./helpers/documentHarness";
import {createCadToolSession} from "../src/copilot/cadToolSession";
import {previewCadCommand,applyCadPlan,discardCadPlan,getCadPlanFrameDocument} from "../src/state/documentPlans";
import {cadHistory,undoDocument,redoDocument} from "../src/state/history";
import {inspectFittedCurve} from "../src/copilot/fittedCurveTools";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
const json=(value:unknown)=>new Response(JSON.stringify(value),{headers:{"Content-Type":"application/json"}});
const model="unit-model:latest";
function mockProvider(reply:unknown,onChat?:(body:any,init?:RequestInit)=>Response|Promise<Response>){return (async(url,init)=>{
 const path=new URL(String(url)).pathname;if(path==="/api/tags")return json({models:[{name:model}]});if(path==="/api/show")return json({capabilities:["completion","tools"]});if(path==="/api/chat"){const body=JSON.parse(String(init?.body));if(onChat)return onChat(body,init);return json({model,done:true,done_reason:"stop",message:{content:JSON.stringify(reply)},prompt_eval_count:120,eval_count:60});}throw Error("Unexpected provider URL");}) as typeof fetch;}
const request=(task?:string)=>({...copilotRequest("Test design",cadDocument,[],"XY"),...task?{task,design:{brief:emptyDesignStudy(cadDocument.id).brief,visuals:[],marks:[]}}:{}});
async function httpServer(gateway:ReturnType<typeof createLocalCopilot>){const server=createServer((req,res)=>{void gateway.middleware(req,res,()=>{res.writeHead(404);res.end();});});server.listen(0,"127.0.0.1");await once(server,"listening");return {server,url:`http://127.0.0.1:${(server.address() as {port:number}).port}`};}
async function close(server:Server){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}

test("Local gateway accepts loopback only and does not download missing or cloud-routed models",async()=>{
 for(const u of ["https://example.com","http://127.0.0.1/path","http://user:pass@localhost","http://localhost/?key=x"])assert.throws(()=>localOllamaUrl(u));
 const gateway=createLocalCopilot({fetcher:mockProvider({version:1}),model});assert.equal((await gateway.status()).ready,true);await assert.rejects(gateway.status("not-installed"),/not installed/);
 const remote=createLocalCopilot({model,fetcher:async(url)=>new URL(String(url)).pathname==="/api/tags"?json({models:[{name:model}]}):json({remote_host:"https://cloud.example"})});await assert.rejects(remote.status(),/Cloud-routed/);
});
test("Local model receives server-owned schemas, bounded intent, structured JSON and returns honest inference metadata",async()=>{
 resetTestDocument();const reply={version:1,brief:emptyDesignStudy(cadDocument.id,"Interpreted goal").brief,questions:[],summary:["One open choice"]};let body:any;
 const gateway=createLocalCopilot({model,fetcher:mockProvider(reply,b=>{body=b;return json({done:true,done_reason:"stop",message:{content:JSON.stringify(reply)},prompt_eval_count:123,eval_count:45});})});const before=documentState(),result=await gateway.plan({...request("design-intent"),tools:{evil:"execute-python"}},new AbortController().signal);
 assert.equal(body.model,model);assert.equal(body.stream,false);assert.ok(body.format.properties.questions);assert.equal(body.messages[0].role,"system");assert.ok(!body.messages[1].content.includes('"evil"'));assert.equal(result.run.model,model);assert.equal(result.run.inputTokens,123);assert.deepEqual(documentState(),before);assert.equal(parseDesignIntent(result,cadDocument.id).brief.goal,"Interpreted goal");
});
test("Local gateway rejects non-vision image requests instead of pretending to inspect their content",async()=>{
 resetTestDocument();let chats=0;const gateway=createLocalCopilot({model,fetcher:mockProvider({},()=>{chats++;return json({});})});const value=request("design-explore") as any;value.design.visuals=[{id:"XY",dataUrl:"data:image/png;base64,eA=="}];await assert.rejects(gateway.plan(value,new AbortController().signal),/cannot read images/);assert.equal(chats,0);
});
test("Incomplete output, invalid tasks and invalid local model names never become CAD plans",async()=>{
 resetTestDocument();const gateway=createLocalCopilot({model,fetcher:mockProvider({},()=>json({done:true,done_reason:"length",message:{content:'{"version":1}'}}))});await assert.rejects(gateway.plan(request(),new AbortController().signal),/incomplete/);for(const value of [{...request(),task:"execute-python"},{...request(),model:"http://attacker/"},{...request(),prompt:""}])await assert.rejects(gateway.plan(value,new AbortController().signal));
});
test("HTTP gateway rejects cross-origin, wrong content type and oversized input before inference",async()=>{
 resetTestDocument();let chats=0;const gateway=createLocalCopilot({model,fetcher:mockProvider({},()=>{chats++;return json({});})}),{server,url}=await httpServer(gateway);
 try{assert.equal((await fetch(url+"/api/copilot/status")).status,200);assert.equal((await fetch(url+"/api/copilot/plan",{method:"POST",headers:{Origin:"https://foreign.example","Content-Type":"application/json"},body:JSON.stringify(request())})).status,403);assert.equal((await fetch(url+"/api/copilot/plan",{method:"POST",body:"x"})).status,415);assert.equal((await fetch(url+"/api/copilot/plan",{method:"POST",headers:{"Content-Type":"application/json"},body:"x".repeat(512001)})).status,413);assert.equal(chats,0);}finally{await close(server);}
});
test("Cancelling an HTTP client aborts provider inference and frees the local busy slot",async()=>{
 resetTestDocument();let entered=false,cancelled=false,finish=false;const gateway=createLocalCopilot({model,fetcher:mockProvider({},(_body,init)=>{if(finish)return json({done:true,message:{content:JSON.stringify({version:1,toolCalls:[{id:"ok",name:"curve.circle",arguments:{id:"circle",plane:"XY",center:[0,0,0],radius:10}}]})}});entered=true;return new Promise((_resolve,reject)=>{init!.signal!.addEventListener("abort",()=>{cancelled=true;reject(init!.signal!.reason);},{once:true});});})}),{server,url}=await httpServer(gateway);
 try{const controller=new AbortController(),pending=fetch(url+"/api/copilot/plan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(request()),signal:controller.signal}).catch(e=>e);for(let i=0;i<100&&!entered;i++)await new Promise(r=>setTimeout(r,5));assert.ok(entered);await assert.rejects(gateway.plan(request(),new AbortController().signal),/busy/);controller.abort();await pending;for(let i=0;i<100&&!cancelled;i++)await new Promise(r=>setTimeout(r,5));assert.ok(cancelled);finish=true;assert.equal((await gateway.plan(request(),new AbortController().signal)).version,1);}finally{await close(server);}
});
test("Intent questions preserve assumptions and require explicit answers before confirmation",()=>{
 resetTestDocument();const brief={...emptyDesignStudy(cadDocument.id,"Light hall").brief,requirements:"Preserve core",assumptions:"Tall hall is unconfirmed"},intent=parseDesignIntent({version:1,brief,questions:[{id:"light",prompt:"Light direction?",options:["North","South"]}],summary:[]},cadDocument.id);assert.throws(()=>confirmedIntent(intent.brief,intent.questions,{}),/Answer/);const confirmed=confirmedIntent(intent.brief,intent.questions,{light:"North"});assert.equal(confirmed.assumptions,brief.assumptions);assert.equal(brief.requirements,"Preserve core");assert.match(confirmed.requirements,/North/);assert.throws(()=>parseDesignIntent({version:1,brief,questions:Array(4).fill(intent.questions[0]),summary:[]},cadDocument.id));
});
test("Duplicate model geometry triggers at most one explicit preflight correction instead of a silent replacement",async()=>{
 resetTestDocument();let count=0;const alternative=(id:string,radius:number)=>({id,label:id,rationale:"Radius comparison",toolCalls:[{id,name:"curve.circle",arguments:{id,plane:"XY",center:[0,0,0],radius}}]});
 const initial={version:1,brief:emptyDesignStudy(cadDocument.id).brief,alternatives:[alternative("a",10),alternative("b",10)]};assert.match(modelProposalIssue(initial)!,/identical/);
 const gateway=createLocalCopilot({model,fetcher:mockProvider(initial,(body)=>{count++;if(count===2)assert.match(body.messages.at(-1).content,/preflight feedback/);return json({done:true,message:{content:JSON.stringify(count===1?initial:{...initial,alternatives:[alternative("a",10),alternative("b",20)]})},prompt_eval_count:10,eval_count:20});})});const result=await gateway.plan(request("design-explore"),new AbortController().signal);assert.equal(count,2);assert.equal(result.run.repairs,1);assert.equal(result.run.inputTokens,20);assert.equal(result.alternatives[1].toolCalls[0].arguments.radius,20);
 const failed=createLocalCopilot({model,fetcher:mockProvider(initial)});await assert.rejects(failed.plan(request("design-explore"),new AbortController().signal),/after one correction/);
});
test("Model schemas bind edits to the selected source and assign question identifiers in code",async()=>{
 resetTestDocument();const original={...request("design-intent"),design:{brief:emptyDesignStudy(cadDocument.id).brief,visuals:[],marks:[]}},gateway=createLocalCopilot({model,fetcher:mockProvider({version:1,brief:emptyDesignStudy(cadDocument.id).brief,questions:[{prompt:"Entry?",options:["Left","Right"]}],summary:[]})});const intent=await gateway.plan(original,new AbortController().signal);assert.equal(parseDesignIntent(intent,cadDocument.id).questions[0].id,"q1");
 const body={...request("design-explore"),context:{...request().context,selected:[{id:"selected",type:"drawing",kind:"spline"}]}},reply={version:1,brief:emptyDesignStudy(cadDocument.id).brief,alternatives:[100,200].map((x,i)=>({id:String(i),label:String(i),rationale:"Shift point",toolCalls:[{id:`shift-${i}`,name:"curve.adjust",arguments:{objectId:"selected",pointIndex:0,delta:[x,0,0]}}]}))};
 const selected=createLocalCopilot({model,fetcher:mockProvider(reply,(b)=>{const schema=b.format.anyOf[1].properties.alternatives.items.properties.toolCalls;assert.equal(schema.maxItems,1);const writes=schema.items.anyOf;assert.deepEqual(writes.map((t:any)=>t.properties.name.const).sort(),["curve.adjust","curve.reshape"]);assert.ok(writes.every((t:any)=>t.properties.arguments.properties.objectId.const==="selected"));return json({done:true,message:{content:JSON.stringify(reply)}});})});await selected.plan(body,new AbortController().signal);
});
test("Fitted spline tools create, read and reshape exact sources with selection, plane and ownership guards",async()=>{
 resetTestDocument();const points=[[0,0,0],[1000,0,0],[1200,800,0],[0,900,0]],context=()=>({document:cadDocument,selectionIds:[],layerId:"layer-default",workPlane:"XY" as const}),session=createCadToolSession(context()),plan=await session.plan([{id:"fit",name:"curve.fitted",arguments:{id:"source",plane:"XY",points,closed:true,tension:.8}}]),p=await previewCadCommand(plan.command);assert.ok(p.result.ok,p.result.reason);assert.ok((await applyCadPlan(p.planId)).ok);discardCadPlan(p.planId);const before=documentState(),past=cadHistory.getPastLabels().length;
 const read=await session.read({id:"read",name:"cad.curve",arguments:{objectId:"source"}}).catch(()=>null);assert.equal(read,null,"Old captured sessions are stale after publication");
 const fresh=createCadToolSession(context()),info=await fresh.read({id:"read",name:"cad.curve",arguments:{objectId:"source"}});assert.ok(info.ok);assert.deepEqual((info.result as any).points,points);
 const edit={id:"reshape",name:"curve.reshape",arguments:{objectId:"source",points:[[0,0,0],[900,0,0],[1100,800,0],[0,900,0]],tension:.8}};
 await assert.rejects(fresh.plan([edit]),/Select exactly/);const selected=createCadToolSession({...context(),selectionIds:["source"]}),proposal=await selected.plan([edit]),preview=await previewCadCommand(proposal.command);assert.ok(preview.result.ok,preview.result.reason);assert.equal(inspectFittedCurve(getCadPlanFrameDocument(preview.planId)!,"source").points[1][0],900);assert.deepEqual(documentState(),before);assert.ok((await applyCadPlan(preview.planId)).ok);assert.equal(cadHistory.getPastLabels().length,past+1);const after=documentState();assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),after);discardCadPlan(preview.planId);
 const current=createCadToolSession({...context(),selectionIds:["source"]});await assert.rejects(current.plan([{...edit,arguments:{...edit.arguments,points:points.map(p=>[p[0],p[1],1])}}]),/elevation/);await dispatchCadCommand({type:"set-layer-locked",layerId:"layer-default",locked:true});await assert.rejects(createCadToolSession({...context(),selectionIds:["source"]}).plan([edit]),/unlocked/);
});
