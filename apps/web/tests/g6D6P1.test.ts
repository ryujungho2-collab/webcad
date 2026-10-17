import assert from "node:assert/strict";
import {test} from "node:test";
import {deserializeDocument,serializeDocument} from "@agent-webcad/cad-document";
import fixture from "../../../output/projects/courtyard-commons/courtyard-commons.webcad.json";
import hlrFixture from "../../../output/projects/courtyard-commons/p01-fixed/courtyard-commons.webcad.json";
import {cadDocument} from "../src/state/cadDocument";
import {cadHistory,undoDocument,redoDocument} from "../src/state/history";
import {previewCadCommand,applyCadPlan} from "../src/state/documentPlans";
import {restoreTestDocument,documentState} from "./helpers/documentHarness";
import type {CadCommand} from "@agent-webcad/cad-commands";
const count=()=>["agent-webcad:kernel-task:section","agent-webcad:kernel-task:projection","agent-webcad:section-cache-hit","agent-webcad:projection-cache-hit"].map(n=>performance.getEntriesByName(n).length);
function layout(viewIds:string[],denominators:number[]):Extract<CadCommand,{type:"layout-model-sheet-set"}>{const s=cadDocument.modelPresentation!.sheets!['studio-set'],b=cadDocument.artboards![s.artboardId];return {type:'layout-model-sheet-set',id:s.id,name:'Courtyard Commons',artboardId:s.artboardId,viewIds,fixedViewIds:[],denominators,origin:[...b.origin],size:[...b.size],margin:12,gap:10,maxPages:8,alignment:'none',template:'standard',fields:s.publication!.fields};}
test("56-part five-view reopened fixture shares source curves across all scale/page candidates and Apply/Undo",async()=>{
 restoreTestDocument(deserializeDocument(JSON.stringify(fixture)));assert.equal(Object.keys(cadDocument.modelPresentation!.parts).length,56);const ids=Object.keys(cadDocument.modelPresentation!.sections!);assert.equal(ids.length,5);
 const before=documentState(),depth=cadHistory.past.length,tasks=count(),r=await previewCadCommand(layout(ids,[50,100,200]));assert.ok(r.result.ok,r.result.reason);assert.deepEqual(count(),tasks);assert.deepEqual(documentState(),before);assert.equal(cadHistory.past.length,depth);
 assert.ok((await applyCadPlan(r.planId)).ok);assert.deepEqual(count(),tasks);const after=documentState();assert.equal(cadHistory.past.length,depth+1);assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),after);assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)),cadDocument);
});
test("reopened HLR views change paper scale/placement without kernel or cache queries and preserve model geometry",async()=>{
 restoreTestDocument(deserializeDocument(JSON.stringify(hlrFixture)));const parts=Object.values(cadDocument.modelPresentation!.parts).map(p=>p.objectId),features=new Map(Object.values(cadDocument.features).map(f=>[f.output,f])),source=parts.map(id=>structuredClone([cadDocument.objects[id],features.get(id)])),tasks=count();
 const r=await previewCadCommand(layout(['elevation-front','elevation-right'],[100,200]));assert.ok(r.result.ok,r.result.reason);assert.ok((await applyCadPlan(r.planId)).ok);assert.deepEqual(count(),tasks);
 const current=new Map(Object.values(cadDocument.features).map(f=>[f.output,f]));assert.deepEqual(parts.map(id=>[cadDocument.objects[id],current.get(id)]),source);assert.ok(Object.values(cadDocument.modelPresentation!.projections).every(v=>v.status==='resolved'));assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)),cadDocument);
});
