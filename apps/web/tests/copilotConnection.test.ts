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
