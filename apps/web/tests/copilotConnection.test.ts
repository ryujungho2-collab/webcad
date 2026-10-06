import assert from "node:assert/strict";
import {test} from "node:test";
import {copilotRequest,requestCopilotPlan,validateCopilotEndpoint,validateCopilotResponse} from "../src/copilot/copilotConnection";
import {cadDocument} from "../src/state/cadDocument";
import {resetTestDocument,documentState} from "./helpers/documentHarness";
import {previewCadCommand,applyCadPlan} from "../src/state/documentPlans";
import {cadHistory,undoDocument,redoDocument} from "../src/state/history";
const response={version:1,summary:["Circle, radius 12 mm"],command:{type:"create-drawing",id:"gateway-circle",drawing:"circle",params:{workPlane:"XY",center:[0,0,0],radius:12}}};

test("Gateway accepts only supported validated command proposals; server ghosts are ignored",()=>{
 assert.equal(validateCopilotResponse({...response,ghosts:[{code:"untrusted"}]}).ghosts[0].kind,"drawing");
 for(const bad of [{...response,version:2},{...response,summary:[]},{...response,command:{type:"delete-object",objectId:"one"}},{...response,command:{type:"batch",commands:Array(21).fill(response.command)}},{...response,command:{...response.command,params:{...response.command.params,radius:-1}}}])assert.throws(()=>validateCopilotResponse(bad));
 for(const endpoint of ["javascript:alert(1)","http://example.com/api","https://key:secret@example.com/","/api?key=secret","/api#key"])assert.throws(()=>validateCopilotEndpoint(endpoint,"https://webcad.example/"));
 assert.equal(validateCopilotEndpoint("/api/copilot/plan","https://webcad.example/"),"https://webcad.example/api/copilot/plan");
});

test("Gateway request sends bounded metadata and enters the same atomic CAD preview/apply/undo path",async()=>{
 resetTestDocument();const before=documentState(),body=copilotRequest("Create circle",cadDocument,[],"XY");
 let request:RequestInit|undefined;
 const plan=await requestCopilotPlan("/api/copilot/plan",body,{signal:new AbortController().signal,baseUrl:"https://webcad.example",fetcher:async(_url,init)=>{request=init;return new Response(JSON.stringify(response),{headers:{"Content-Type":"application/json"}});}});
 assert.equal(request?.credentials,"omit");assert.equal(request?.redirect,"error");
 assert.deepEqual(Object.keys(JSON.parse(request!.body as string).context).sort(),["documentId","revision","selected","selectionTruncated","units","workPlane"]);
 assert.deepEqual(documentState(),before);const preview=await previewCadCommand(plan.command);assert.deepEqual(documentState(),before);
 assert.equal((await applyCadPlan(preview.planId)).ok,true);assert.equal(cadDocument.features["feature-gateway-circle"].params.radius,12);assert.equal(cadHistory.getPastLabels().length,1);
 const after=documentState();assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),after);
});

test("Cancellation, HTTP errors, malformed and oversized responses never produce an applicable plan",async()=>{
 resetTestDocument();const before=JSON.stringify(cadDocument),body=copilotRequest("Circle",cadDocument,[],"XY"),base={signal:new AbortController().signal,baseUrl:"https://webcad.example"};
 for(const response of [new Response("error",{status:500}),new Response("<html>"),new Response("x".repeat(65537),{headers:{"Content-Type":"application/json"}}),new Response("{bad",{headers:{"Content-Type":"application/json"}})])await assert.rejects(requestCopilotPlan("/api",body,{...base,fetcher:async()=>response}));
 const controller=new AbortController();controller.abort();await assert.rejects(requestCopilotPlan("/api",body,{...base,signal:controller.signal}));
 await assert.rejects(requestCopilotPlan("/api",body,{...base,timeoutMs:5,fetcher:async(_url,init)=>new Promise((_resolve,reject)=>init!.signal!.addEventListener("abort",()=>reject(init!.signal!.reason),{once:true}))}),/timed out/);
 assert.equal(JSON.stringify(cadDocument),before);
});

test("Gateway creation cannot inject ownership, topology or nested command metadata",()=>{
 for(const extra of [{sketchId:"existing"},{topology:{version:1}},{pattern:{sourceId:"existing"}},{sourceObjectId:"existing"}])assert.throws(()=>validateCopilotResponse({...response,command:{...response.command,params:{...response.command.params,...extra}}}),/unsupported.*field/i);
 assert.throws(()=>validateCopilotResponse({...response,command:{type:"batch",commands:[{type:"batch",commands:[response.command]}]}}),/creation capabilities|nested/i);
 for(const drawing of ["toString","__proto__"])assert.throws(()=>validateCopilotResponse({...response,command:{...response.command,drawing}}),/invalid version or CAD command/);
 assert.throws(()=>validateCopilotResponse({...response,command:{type:"create-drawing",drawing:"polyline",params:{points:[[0,0,0],[1,0,0]],closed:"false"}}}),/must be boolean/);
 assert.throws(()=>validateCopilotResponse({...response,command:{type:"create-primitive",primitive:"sphere",params:{radius:Infinity}}}),/finite numbers/);
 assert.throws(()=>validateCopilotResponse({...response,command:{type:"batch",label:42,commands:[response.command]}}),/invalid version or CAD command/);
 assert.throws(()=>validateCopilotResponse({...response,command:{...response.command,params:{...response.command.params,kind:"line"}}}),/kind must match/);
});

test("A stalled response body releases its reader and reports the deadline",{timeout:1000},async()=>{
 let cancelled=false;
 const stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new TextEncoder().encode('{"version":1'));},cancel(){cancelled=true;}});
 await assert.rejects(requestCopilotPlan("/api",copilotRequest("Circle",cadDocument,[],"XY"),{signal:new AbortController().signal,baseUrl:"https://webcad.example",timeoutMs:10,fetcher:async()=>new Response(stream,{headers:{"Content-Type":"application/json"}})}),/timed out/);
 assert.equal(cancelled,true);assert.equal(stream.locked,false);
});

test("User cancellation interrupts a stalled body even if stream cancellation never settles",{timeout:1000},async()=>{
 const controller=new AbortController();let cancelled=false;
 const stream=new ReadableStream<Uint8Array>({start(c){c.enqueue(new TextEncoder().encode('{"version":1'));},cancel(){cancelled=true;return new Promise(()=>{});}});
 const request=requestCopilotPlan("/api",copilotRequest("Circle",cadDocument,[],"XY"),{signal:controller.signal,baseUrl:"https://webcad.example",fetcher:async()=>new Response(stream,{headers:{"Content-Type":"application/json"}})});
 await new Promise(resolve=>setTimeout(resolve,5));controller.abort(new Error("Cancelled by user"));
 await assert.rejects(request,/Cancelled by user/);assert.equal(cancelled,true);assert.equal(stream.locked,false);
});

test("A transport ignoring abort cannot hold the deadline or retain a late response body",{timeout:1000},async()=>{
 let respond!: (response:Response)=>void,cancelled=false;
 const request=requestCopilotPlan("/api",copilotRequest("Circle",cadDocument,[],"XY"),{signal:new AbortController().signal,baseUrl:"https://webcad.example",timeoutMs:10,fetcher:async()=>new Promise(resolve=>{respond=resolve;})});
 await assert.rejects(request,/timed out/);
 const stream=new ReadableStream<Uint8Array>({cancel(){cancelled=true;}});respond(new Response(stream,{headers:{"Content-Type":"application/json"}}));
 await new Promise(resolve=>setTimeout(resolve,0));assert.equal(cancelled,true);assert.equal(stream.locked,false);
});

test("Stream limits count UTF-8 bytes and preserve valid split multibyte summaries",async()=>{
 const body=copilotRequest("Circle",cadDocument,[],"XY"),options={signal:new AbortController().signal,baseUrl:"https://webcad.example"};
 const bytes=new TextEncoder().encode(JSON.stringify({...response,summary:["원 반지름 12 mm"]}));
 const stream=new ReadableStream<Uint8Array>({start(c){for(const byte of bytes)c.enqueue(Uint8Array.of(byte));c.close();}});
 const plan=await requestCopilotPlan("/api",body,{...options,fetcher:async()=>new Response(stream,{headers:{"Content-Type":"application/json"}})});assert.deepEqual(plan.summary,["원 반지름 12 mm"]);
 const oversized=new TextEncoder().encode("원".repeat(22000));assert.ok(oversized.length>65536);
 await assert.rejects(requestCopilotPlan("/api",body,{...options,fetcher:async()=>new Response(oversized,{headers:{"Content-Type":"application/json"}})}),/64 KiB/);
 await assert.rejects(requestCopilotPlan("/api",body,{...options,fetcher:async()=>new Response("{bad",{headers:{"Content-Type":"application/json"}})}),/malformed JSON.*Plan again/);
 for(const init of [{status:500},{headers:{"Content-Type":"text/html"}},{headers:{"Content-Type":"application/json","Content-Length":"65537"}}]){
  let cancelled=false;const refused=new ReadableStream<Uint8Array>({cancel(){cancelled=true;}});
  await assert.rejects(requestCopilotPlan("/api",body,{...options,fetcher:async()=>new Response(refused,init)}));assert.equal(cancelled,true);assert.equal(refused.locked,false);
 }
});
