import test from "node:test";
import assert from "node:assert/strict";
import type {CadCommand} from "@agent-webcad/cad-commands";
import {resetTestDocument,documentState} from "./helpers/documentHarness";
import {cadDocument} from "../src/state/cadDocument";
import {cadHistory,undoDocument,redoDocument} from "../src/state/history";
import {previewCadCommand,applyCadPlan,discardCadPlan} from "../src/state/documentPlans";
import {enqueueDocumentCommand} from "../src/state/documentCommandQueue";
const batch:CadCommand={type:"batch",commands:[{type:"create-layer",id:"import-layer",name:"Import"},...Array.from({length:200},(_,i)=>({type:"create-drawing" as const,id:`import-${i}`,layerId:"import-layer",drawing:"line" as const,params:{points:[[i,0,0],[i,10,0]],workPlane:"XY"}}))]};
test("abort during detached preparation leaves live document and history untouched",async()=>{
 resetTestDocument();const before=documentState(),controller=new AbortController();let calls=0;
 await assert.rejects(previewCadCommand(batch,{signal:controller.signal,onProgress:()=>{calls++;controller.abort();}}),{name:"AbortError"});
 assert.ok(calls);assert.deepEqual(documentState(),before);assert.equal(cadHistory.getPastLabels().length,0);
});
test("cancel queued Apply then retry the same review remains one atomic Undo",async()=>{
 resetTestDocument();const before=documentState(),plan=await previewCadCommand(batch);
 let release!:()=>void;const gate=enqueueDocumentCommand(()=>new Promise<void>(resolve=>{release=resolve;}));await Promise.resolve();
 const controller=new AbortController(),pending=applyCadPlan(plan.planId,{signal:controller.signal});controller.abort();release();await gate;
 await assert.rejects(pending,{name:"AbortError"});assert.deepEqual(documentState(),before);assert.equal(cadHistory.getPastLabels().length,0);
 assert.ok((await applyCadPlan(plan.planId)).ok);const after=documentState();assert.equal(Object.keys(cadDocument.objects).length,200);assert.equal(cadHistory.getPastLabels().length,1);
 undoDocument();assert.deepEqual(documentState(),before);redoDocument();assert.deepEqual(documentState(),after);discardCadPlan(plan.planId);
});
test("discarded review and already aborted request cannot publish",async()=>{
 resetTestDocument();const before=documentState(),plan=await previewCadCommand(batch);discardCadPlan(plan.planId);
 await assert.rejects(applyCadPlan(plan.planId),/expired/);const controller=new AbortController();controller.abort();await assert.rejects(previewCadCommand(batch,{signal:controller.signal}),{name:"AbortError"});assert.deepEqual(documentState(),before);
});
