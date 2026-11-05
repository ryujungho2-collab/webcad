import test from "node:test";
import assert from "node:assert/strict";
import {createLocalCopilot} from "../server/localCopilot";
import {taskToolScope,motionEvidenceSummary,preservationQuestionConflict} from "../src/copilot/copilotTaskScope";
import {copilotRequest,requestCopilotPlan} from "../src/copilot/copilotConnection";
import {resetTestDocument} from "./helpers/documentHarness";
import {cadDocument} from "../src/state/cadDocument";
import {readFile} from "node:fs/promises";
const json=(v:unknown)=>new Response(JSON.stringify(v),{headers:{"Content-Type":"application/json"}});
const context=()=>copilotRequest("간섭 관통 감소",cadDocument,[],"XY");
test("scope filters the original registry, never advertises joint-child move/axis/reparent",()=>{
 const s=taskToolScope("간섭을 줄여줘",{targetId:"support"});assert.equal(s.kind,"interference");assert.deepEqual(s.names,["cad.objects","cad.inspect","cad.measure","cad.parameters","assembly.inspect","assembly.motion.inspect","solid.parameter"]);
 assert.equal(taskToolScope("폭을60mm로 변경",{targetId:"box"}).names.length,5);
});
test("motion summary preserves all angles, raw exceptions/unknowns, measured volumes and native version",async()=>{
 const ev=JSON.parse(await readFile(new URL("../../../output/verification/ai-agent-phase-0/evaluation.json",import.meta.url),"utf8")),r=structuredClone(ev.baselineMotion.result),before=JSON.stringify(r),annotation=ev.logs.find((l:any)=>l.call?.name==="assembly.inspect").result.result.designIntents.entries[0];
 r.rows[0].baseStatus="unknown";r.rows[0].status="intentional-exception";r.rows[0].exception=true;const raw=JSON.stringify(r),s=motionEvidenceSummary(r,{[JSON.stringify(annotation.pair)]:annotation});
 assert.equal(JSON.stringify(r),raw);assert.equal(s.reportedRows,45);assert.deepEqual(s.version,r.version);assert.equal(s.pairs.flatMap(p=>p.observations).reduce((n,o)=>n+o.angles.length,0),45);
 assert.ok(s.pairs.flatMap(p=>p.observations).some(o=>o.measurement.rawStatus==="unknown"&&o.measurement.exception));assert.ok(s.pairs.some(p=>p.intent?.intent==="intentional-overlap"));assert.ok(JSON.stringify(s).length<before.length*.8);
});
test("Gateway uses scoped prompt AND schema, no-truncate, reservation and honest observed tokens",async()=>{
 resetTestDocument();let seen:any;const gateway=createLocalCopilot({model:"test",fetcher:async(url,init)=>{const path=new URL(String(url)).pathname;if(path==="/api/tags")return json({models:[{name:"test"}]});if(path==="/api/show")return json({});seen=JSON.parse(String(init?.body));return json({done:true,prompt_eval_count:500,eval_count:80,message:{content:JSON.stringify({version:1,toolCalls:[{id:"read",name:"assembly.inspect",arguments:{}}]})}});}});
 const r=await gateway.plan(context(),new AbortController().signal);assert.equal(seen.truncate,false);assert.equal(seen.options.num_ctx,16384);assert.equal(seen.options.num_predict,1024);assert.equal(r.run.inputTokens,500);assert.equal(r.run.context.outputReserved,1024);assert.ok(!seen.messages[1].content.includes('"sculpt.stroke"'));assert.ok(JSON.stringify(seen.format).includes('assembly.inspect'));assert.ok(!JSON.stringify(seen.format).includes('assembly.joint.edit'));
});
test("oversized context rejects before inference; observed reservation overflow never becomes success",async()=>{
 let chats=0;const g=createLocalCopilot({model:"test",fetcher:async(url)=>{const path=new URL(String(url)).pathname;if(path==="/api/tags")return json({models:[{name:"test"}]});if(path==="/api/show")return json({});chats++;return json({done:true,prompt_eval_count:16000,message:{content:'{"version":1}'}});}});
 await assert.rejects(g.plan({...context(),validationFeedback:["x".repeat(20000)]},new AbortController().signal),/CONTEXT_BUDGET/);assert.equal(chats,0);await assert.rejects(g.plan(context(),new AbortController().signal),/reservation/);assert.equal(chats,1);
});
test("native no-op feedback carries failed command/current value; corrected proposal can succeed",async()=>{
 resetTestDocument();const body=copilotRequest("폭 변경",cadDocument,[],"XY");let requests:any[]=[],plans=0;
 const session={assertCurrent(){},read:async()=>{throw Error("Unexpected read");},version:{documentId:cadDocument.id,revision:0,generation:0},plan:async()=>{if(++plans===1)throw Error("The dimension is unchanged. Enter a different value.");return {command:{type:"update-primitive",objectId:"box",params:{width:60}},ghosts:[],summary:["60"]} as any;}};
 const r=await requestCopilotPlan('/api',body,{baseUrl:"http://localhost",signal:new AbortController().signal,toolSession:session,fetcher:async(_u,init)=>{requests.push(JSON.parse(String(init?.body)));return json({version:1,toolCalls:[{id:"write",name:"solid.parameter",arguments:{key:"width",value:requests.length===1?50:60}}]});}});
 assert.equal(plans,2);assert.equal(requests[1].validationFeedback[0].code,"NO_OP");assert.equal(requests[1].validationFeedback[0].failed[0].arguments.value,50);assert.ok(requests[1].validationFeedback[0].current);assert.equal(r.command.type,"update-primitive");
});
test("same rejected proposal with a different call ID stops early; no validation bypass",async()=>{
 let n=0;const body=context(),session={assertCurrent(){},read:async()=>{throw Error('unexpected');},version:{} as any,plan:async()=>{throw Error("Should be blocked by read gate");}};
 await assert.rejects(requestCopilotPlan('/api',body,{baseUrl:"http://localhost",signal:new AbortController().signal,toolSession:session,fetcher:async()=>json({version:1,toolCalls:[{id:'attempt-'+(++n),name:"solid.parameter",arguments:{key:"height",value:10}}]})}),/Repeated rejected/);assert.equal(n,2);
});
test("Preview validation feedback is retried at most twice",async()=>{
 let calls=0,validations=0;await assert.rejects(requestCopilotPlan('/api',copilotRequest("width",cadDocument,[],"XY"),{baseUrl:"http://localhost",signal:new AbortController().signal,toolSession:{version:{} as any,assertCurrent(){},read:async()=>{throw Error("unexpected");},plan:async()=>({command:{type:"update-primitive",objectId:"box",params:{}},ghosts:[],summary:[]})},fetcher:async()=>json({version:1,toolCalls:[{id:"write",name:"solid.parameter",arguments:{key:"width",value:++calls}}]}),validatePlan:async()=>{validations++;throw Error("CONSTRAINT: did not decrease");}}),/did not decrease/);assert.equal(calls,3);assert.equal(validations,3);
});

test('target motion projection bounds a 45-row source to the annotated target pair without changing native evidence',async()=>{
 const ev=JSON.parse(await readFile(new URL('../../../output/verification/ai-agent-phase-0/evaluation.json',import.meta.url),'utf8'));
 const report=ev.baselineMotion.result,raw=JSON.stringify(report),annotation=ev.logs.find((l:any)=>l.call?.name==='assembly.inspect').result.result.designIntents.entries[0];
 const projected=motionEvidenceSummary(report,{[JSON.stringify([...annotation.pair].sort())]:annotation},'stand-support');
 assert.equal(projected.sourceRows,45);assert.equal(projected.reportedRows,3);assert.equal(projected.omittedRows,42);assert.equal(projected.pairs.length,1);assert.equal(JSON.stringify(report),raw);
});

test('clarification cannot offer editing a preserved Joint axis or origin',()=>{
 assert.match(preservationQuestionConflict({questions:[{options:['joint origin 또는 axis를 변경']} ]})!,/CONSTRAINT/);
 assert.equal(preservationQuestionConflict({questions:[{options:['지원되는 다른 작업으로 변경']}]}),undefined);
});
