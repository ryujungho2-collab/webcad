import test from "node:test";
import assert from "node:assert/strict";
import {deserializeDocument,serializeDocument,validateCanvasHierarchy,legacyCanvasHierarchy,type CadCanvas,type CanvasMember} from "@agent-webcad/cad-document";
import {cadDocument} from "../src/state/cadDocument";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {previewCadCommand,applyCadPlan,discardCadPlan} from "../src/state/documentPlans";
import {cadHistory,undoDocument,redoDocument} from "../src/state/history";
import {documentState,resetTestDocument} from "./helpers/documentHarness";
import {projectTreeFixture} from "./helpers/projectTreeFixture";
import {projectTargets} from "../src/explorer/projectTree";
import {projectKernelMetrics} from "../src/cad/kernelGeometryService";
import {collectArtboardExportItems} from "../src/export/exportModel";
import {encodeProjectBundle,parseProjectBundle} from "../src/app/projectBundle";
import {openDocumentFile} from "../src/state/documentFile";
const member=(kind:CanvasMember["kind"],id:string,relation:CanvasMember["relation"]="own"):CanvasMember=>({kind,id,relation});
const node=(id:string,members:CanvasMember[]=[],units:CadCanvas["units"]="model-mm"):CadCanvas=>({id,name:id,units,workPlane:"XY",origin:[0,0],size:[400,300],locked:false,members});
const run=async(command:Parameters<typeof dispatchCadCommand>[0])=>{const result=await dispatchCadCommand(command);assert.equal(result.ok,true,result.reason);return result;};

test("legacy section/frame/model adapter adds a reviewed hierarchy without touching references, transforms, export scenes or native geometry",async()=>{
 await projectTreeFixture();await run({type:"upsert-workspace-section",section:{id:"area",name:"Work area",color:"#ffffff",workPlane:"XY",origin:[780,-20],size:[300,150],frameIds:["frame","detail"],collapsed:false}});
 const before=documentState(),items=JSON.stringify(collectArtboardExportItems("paper")),tasks=projectKernelMetrics().submittedTasks,depth=cadHistory.getPastLabels().length;
 const preview=await previewCadCommand({type:"organize-canvases"});assert.equal(preview.result.ok,true,preview.result.reason);assert.deepEqual(documentState(),before);assert.ok(preview.impact?.some(r=>r.kind==="Canvases"));
 assert.equal((await applyCadPlan(preview.planId)).ok,true);const nodes=cadDocument.canvases!,after=documentState();delete after.canvases;assert.deepEqual(after,before);assert.equal(cadHistory.getPastLabels().length,depth+1);assert.equal(projectKernelMetrics().submittedTasks,tasks);
 assert.equal(JSON.stringify(collectArtboardExportItems("paper")),items);assert.ok(Object.values(nodes).some(c=>c.members.some(m=>m.kind==="workspace-section"&&m.id==="area"&&m.relation==="own")));assert.ok(Object.values(nodes).some(c=>c.members.some(m=>m.kind==="section"&&m.id==="cut"&&m.relation==="reference")));
 undoDocument();assert.equal(cadDocument.canvases,undefined);assert.deepEqual(documentState(),before);redoDocument();assert.deepEqual(cadDocument.canvases,nodes);
 const text=serializeDocument(cadDocument);assert.equal(JSON.parse(text).version,43);assert.deepEqual(deserializeDocument(text),cadDocument);
 const bundle=await parseProjectBundle(await encodeProjectBundle([{id:"same",title:"Canvas project",document:cadDocument}]));assert.deepEqual(bundle.projects[0].document.canvases,nodes);
});

test("shared references are allowed; duplicate ownership, self/indirect reference cycles and unit/plane ownership crossings reject atomically",async()=>{
 resetTestDocument();await run({type:"upsert-canvas",canvas:node("child")});await run({type:"upsert-canvas",canvas:node("parent",[member("canvas","child")])});
 await run({type:"upsert-canvas",canvas:node("shared",[member("canvas","child","reference")],"paper-mm")});
 const before=documentState(),depth=cadHistory.getPastLabels().length;
 for(const canvas of [node("second",[member("canvas","child")]),node("child",[member("canvas","parent","reference")]),node("loop",[member("canvas","loop","reference")]),node("bad-units",[member("canvas","parent")],"paper-mm"),{...node("bad-plane",[member("canvas","parent")]),workPlane:"XZ" as const}]){
  const result=await dispatchCadCommand({type:"upsert-canvas",canvas});assert.equal(result.ok,false);assert.deepEqual(documentState(),before);assert.equal(cadHistory.getPastLabels().length,depth);
 }
});

test("parent reassign and membership edits share one undo boundary; failed batch restores every canvas",async()=>{
 resetTestDocument();for(const c of [node("child"),node("a",[member("canvas","child")]),node("b")])await run({type:"upsert-canvas",canvas:c});
 const before=documentState();cadHistory.clear();const review=await previewCadCommand({type:"batch",commands:[{type:"upsert-canvas",canvas:node("a")},{type:"upsert-canvas",canvas:node("b",[member("canvas","child")])}]});assert.equal(review.result.ok,true);assert.deepEqual(documentState(),before);await applyCadPlan(review.planId);assert.equal(cadHistory.getPastLabels().length,1);undoDocument();assert.deepEqual(documentState(),before);redoDocument();
 const moved=documentState();const result=await dispatchCadCommand({type:"batch",commands:[{type:"upsert-canvas",canvas:node("b")},{type:"upsert-canvas",canvas:node("child",[member("canvas","child","reference")])}]});assert.equal(result.ok,false);assert.deepEqual(documentState(),moved);
});

test("canvas locks cover descendants and incoming references, while explicit unlock restores editing",async()=>{
 resetTestDocument();await run({type:"upsert-canvas",canvas:node("child")});await run({type:"upsert-canvas",canvas:{...node("root",[member("canvas","child")]),locked:true}});
 let result=await dispatchCadCommand({type:"upsert-canvas",canvas:{...node("child"),name:"Blocked"}});assert.equal(result.ok,false);assert.match(result.reason!,/locked/);
 result=await dispatchCadCommand({type:"delete-canvas",canvasId:"child"});assert.equal(result.ok,false);
 await run({type:"upsert-canvas",canvas:{...cadDocument.canvases!.root,locked:false}});await run({type:"upsert-canvas",canvas:{...node("child"),locked:true}});result=await dispatchCadCommand({type:"delete-canvas",canvasId:"root"});assert.equal(result.ok,false);await run({type:"upsert-canvas",canvas:node("child")});
 await run({type:"upsert-canvas",canvas:{...node("reference",[member("canvas","root","reference")]),locked:true}});result=await dispatchCadCommand({type:"delete-canvas",canvasId:"root"});assert.equal(result.ok,false);assert.match(result.reason!,/locked/);
});

test("deleting containers keeps sources and child canvases; source deletion requires explicit membership release",async()=>{
 resetTestDocument();await run({type:"create-drawing",id:"line",drawing:"line",params:{workPlane:"XY",points:[[0,0,0],[10,0,0]]}});await run({type:"upsert-canvas",canvas:node("child",[member("object","line")])});await run({type:"upsert-canvas",canvas:node("root",[member("canvas","child")])});
 const before=documentState(),result=await dispatchCadCommand({type:"delete-object",objectId:"line"});assert.equal(result.ok,false);assert.match(result.reason!,/references missing/);assert.deepEqual(documentState(),before);
 await run({type:"delete-canvas",canvasId:"root"});assert.ok(cadDocument.canvases!.child);assert.ok(cadDocument.objects.line);await run({type:"delete-canvas",canvasId:"child"});assert.equal(cadDocument.canvases,undefined);assert.ok(cadDocument.objects.line);undoDocument();assert.ok(cadDocument.canvases!.child);
});

test("stale plans and cancelled reviews cannot overwrite a later hierarchy",async()=>{
 resetTestDocument();await run({type:"upsert-canvas",canvas:node("a")});const review=await previewCadCommand({type:"upsert-canvas",canvas:{...node("a"),name:"Stale"}});await run({type:"upsert-canvas",canvas:node("b")});const before=documentState();assert.equal((await applyCadPlan(review.planId)).ok,false);assert.deepEqual(documentState(),before);
 const cancelled=await previewCadCommand({type:"delete-canvas",canvasId:"a"});discardCadPlan(cancelled.planId);await assert.rejects(applyCadPlan(cancelled.planId),/expired/);assert.deepEqual(documentState(),before);
});

test("v43 guards and legacy migration preserve old files; loading a flat document removes the prior canvas graph",async()=>{
 resetTestDocument();const old=serializeDocument(cadDocument);assert.equal(JSON.parse(old).version,1);assert.equal(deserializeDocument(old).canvases,undefined);const legacy=legacyCanvasHierarchy(cadDocument);assert.ok(legacy["canvas-model-xy"]);assert.equal(cadDocument.canvases,undefined);
 await run({type:"upsert-canvas",canvas:node("a")});const file=JSON.parse(serializeDocument(cadDocument));file.version=42;assert.throws(()=>deserializeDocument(JSON.stringify(file)),/43/);file.version=43;file.document.canvases.a.members=[member("canvas","missing")];assert.throws(()=>deserializeDocument(JSON.stringify(file)),/missing/);await openDocumentFile(new File([old],"legacy.webcad.json"));assert.equal(cadDocument.canvases,undefined);
});

test("hierarchy budgets and section/frame ownership aliases validate before mutation",async()=>{
 resetTestDocument();cadDocument.artboards={board:{id:"board",name:"Frame",workPlane:"XY",origin:[0,0],size:[100,80],visible:true,locked:false,background:"#fff",backgroundOpacity:1,showGrid:false,frame:{memberIds:[],sourceOrigin:[0,0],denominator:50}}};cadDocument.workspaceSections={area:{id:"area",name:"Area",workPlane:"XY",origin:[0,0],size:[100,80],color:"#ffffff",frameIds:["board"],collapsed:false}};
 const nodes={a:node("a",[member("workspace-section","area")],"paper-mm"),b:node("b",[member("artboard","board")],"paper-mm")};assert.throws(()=>validateCanvasHierarchy({...cadDocument,canvases:nodes}),/Duplicate/);
 const deep=Object.fromEntries(Array.from({length:33},(_,i)=>[`n${i}`,node(`n${i}`,i===32?[]:[member("canvas",`n${i+1}`)])]));assert.throws(()=>validateCanvasHierarchy({...cadDocument,canvases:deep}),/32 levels/);
 assert.throws(()=>validateCanvasHierarchy({...cadDocument,canvases:Object.fromEntries(Array.from({length:257},(_,i)=>[`n${i}`,node(`n${i}`)]))}),/256/);
});

test("canvas navigation exposes empty bounds and typed references without changing revision/history",async()=>{
 resetTestDocument();await run({type:"upsert-canvas",canvas:node("empty")});await run({type:"upsert-canvas",canvas:node("parent",[member("canvas","empty","reference")],"paper-mm")});const before=documentState(),depth=cadHistory.getPastLabels().length,rows=projectTargets(cadDocument);assert.equal(rows.find(r=>r.key==="canvas:empty")!.unavailable,undefined);assert.equal(rows.find(r=>r.key==="canvas:empty")!.canvasId,"empty");assert.deepEqual(documentState(),before);assert.equal(cadHistory.getPastLabels().length,depth);
});

test("prototype property names are never accepted as existing canvas sources",()=>{
 resetTestDocument();for(const kind of ["object","artboard","canvas","workspace-section","scene","projection","section","sheet"] as const){assert.throws(()=>validateCanvasHierarchy({...cadDocument,canvases:{root:node("root",[member(kind,"toString","reference")])}}),/missing/);}
});
