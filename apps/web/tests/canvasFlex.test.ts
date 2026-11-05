import {flexFixture} from "./helpers/canvasFlexFixture";
import test from "node:test";import assert from "node:assert/strict";
import {defaultCanvasFlex,solveCanvasFlex,serializeDocument,deserializeDocument,type FlexNode,type FlexInput,type CadCanvas,type CanvasFlexLayout} from "@agent-webcad/cad-document";
import {cadDocument} from "../src/state/cadDocument";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {previewCadCommand,applyCadPlan,discardCadPlan} from "../src/state/documentPlans";
import {cadHistory,undoDocument,redoDocument} from "../src/state/history";
import {resetTestDocument,documentState} from "./helpers/documentHarness";
import {planCanvasFlex} from "../src/canvas/canvasFlexPlan";
import {projectKernelMetrics} from "../src/cad/kernelGeometryService";
import {encodeProjectBundle,parseProjectBundle} from "../src/app/projectBundle";
const item=(key:string,w=100,h=60):FlexInput=>({key,natural:[w,h],style:{position:"flow"}});
const node=(items:FlexInput[],layout:Partial<CanvasFlexLayout>={},size:[number,number]=[250,200]):FlexNode=>({key:"root",natural:size,layout:{...defaultCanvasFlex(),gap:10,...layout},items});
const run=async(c:Parameters<typeof dispatchCadCommand>[0])=>{const r=await dispatchCadCommand(c);assert.equal(r.ok,true,r.reason);return r;};


test("row wrapping and Hug cross size have deterministic gaps and padding",()=>{const r=solveCanvasFlex(node([item("a"),item("b"),item("c")],{wrap:true,height:{mode:"hug"}}));assert.deepEqual(r.root.children.map(c=>c.origin),[[10,10],[120,10],[10,80]]);assert.deepEqual(r.root.size,[250,150]);assert.equal(r.overflow.length,0);});
test("column alignment, distribution, and bounded weighted Fill redistribute capped space",()=>{
 const column=solveCanvasFlex(node([item("a",50,80),item("b",80,80)],{direction:"column",align:"center",justify:"end",gap:5},[300,250]));assert.deepEqual(column.root.children.map(c=>c.origin),[[125,75],[110,160]]);
 const a=item("a"),b=item("b"),c=item("c");b.style.width={mode:"fill",min:20,max:50};c.style.width={mode:"fill",min:20,weight:1};const fill=solveCanvasFlex(node([a,b,c],{padding:0,gap:0},[300,100]));assert.deepEqual(fill.root.children.map(c=>c.size[0]),[100,50,150]);
});
test("absolute children stay outside Hug and report overflow without entering flow",()=>{const a=item("a",20,10);a.style={position:"absolute",offset:[500,0]};const r=solveCanvasFlex(node([item("flow",30,20),a],{width:{mode:"hug"},height:{mode:"hug"}}));assert.deepEqual(r.root.size,[50,40]);assert.equal(r.overflow[0].key,"a");assert.equal(r.root.children[1].absolute,true);});
test("Hug/Fill cycles, unbounded root Fill and wrap/Hug main axes reject deterministically",()=>{const a=item("a");a.style.width={mode:"fill"};assert.throws(()=>solveCanvasFlex(node([a],{width:{mode:"hug"}})),/Hug\/Fill/);assert.throws(()=>solveCanvasFlex(node([],{width:{mode:"fill"}})),/parent/);assert.throws(()=>solveCanvasFlex(node([],{wrap:true,width:{mode:"hug"}})),/Wrap requires/);});
test("nested Fill canvases inherit available parent space and retain fixed source content",()=>{const child=node([item("leaf",20,10)],{width:{mode:"fill"},padding:0},[80,60]);child.key="nested";const input=item("nested-slot",80,60);input.child=child;const r=solveCanvasFlex(node([input],{padding:0},[300,200]));assert.equal(r.root.children[0].size[0],300);assert.equal(r.root.children[0].children[0].size[0],20);});
test("frame layout is detached, one Undo, preserves crop/scale/model fields, and submits no native geometry",async()=>{
 await flexFixture();const before=documentState(),source=JSON.stringify([cadDocument.objects,cadDocument.features]),frames=Object.values(cadDocument.artboards!).map(b=>JSON.stringify([b.size,b.frame])),tasks=projectKernelMetrics().submittedTasks;cadHistory.clear();const review=await previewCadCommand({type:"apply-canvas-flex",canvasId:"flex"});assert.equal(review.result.ok,true,review.result.reason);assert.ok(review.canvasFlex);assert.deepEqual(documentState(),before);await applyCadPlan(review.planId);assert.deepEqual(Object.values(cadDocument.artboards!).map(b=>b.origin),[[10,10],[120,10],[10,80]]);assert.equal(JSON.stringify([cadDocument.objects,cadDocument.features]),source);assert.deepEqual(Object.values(cadDocument.artboards!).map(b=>JSON.stringify([b.size,b.frame])),frames);assert.equal(projectKernelMetrics().submittedTasks,tasks);assert.equal(cadHistory.getPastLabels().length,1);undoDocument();assert.deepEqual(documentState(),before);redoDocument();assert.deepEqual(cadDocument.artboards!.c.origin,[10,80]);
});
test("style and placement edits commit atomically and invalid later placements rollback the entire proposal",async()=>{
 const c=await flexFixture(),before=documentState();const review=await previewCadCommand({type:"batch",commands:[{type:"upsert-canvas",canvas:{...c,layout:{...c.layout!,gap:20}}},{type:"apply-canvas-flex",canvasId:c.id,allowNoMovement:true}]});assert.equal(review.result.ok,true,review.result.reason);assert.ok(review.canvasFlex);await applyCadPlan(review.planId);assert.deepEqual(cadDocument.artboards!.b.origin,[130,10]);undoDocument();assert.deepEqual(documentState(),before);
 cadDocument.artboards!.c.locked=true;const locked=documentState();const result=await dispatchCadCommand({type:"apply-canvas-flex",canvasId:c.id});assert.equal(result.ok,false);assert.deepEqual(documentState(),locked);
});
test("flow overflow and too-small source slots cannot partially publish",async()=>{
 const c=await flexFixture();const over={...c,size:[100,60] as [number,number],layout:{...c.layout!,wrap:false}};await run({type:"upsert-canvas",canvas:over});const before=documentState();assert.throws(()=>planCanvasFlex(cadDocument,c.id),/overflow/i);assert.deepEqual(documentState(),before);
 await run({type:"upsert-canvas",canvas:{...c,members:c.members.map((m,i)=>i?m:{...m,layout:{position:"flow",width:{mode:"fixed",value:20}}})}});assert.throws(()=>planCanvasFlex(cadDocument,c.id),/source exceeds/);
});
test("original model translation requires explicit intent and never changes dimensions",async()=>{
 resetTestDocument();await run({type:"create-drawing",id:"line",drawing:"line",params:{workPlane:"XY",points:[[30,40,0],[50,40,0]]}});const canvas:CadCanvas={id:"m",name:"Model",units:"model-mm",workPlane:"XY",origin:[0,0],size:[100,100],locked:false,layout:defaultCanvasFlex(),members:[{kind:"object",id:"line",relation:"own",layout:{position:"flow"}}]};await run({type:"upsert-canvas",canvas});const params=JSON.stringify(cadDocument.features);const before=documentState();assert.equal((await dispatchCadCommand({type:"apply-canvas-flex",canvasId:"m"})).ok,false);assert.deepEqual(documentState(),before);await run({type:"apply-canvas-flex",canvasId:"m",allowModelMoves:true});assert.deepEqual(cadDocument.objects.line.transform!.translation,[-20,-30,0]);assert.equal(JSON.stringify(cadDocument.features),params);
});
test("stale/cancelled Flex plans cannot overwrite source placement and schema44/bundle preserve constraints",async()=>{
 const c=await flexFixture();const text=serializeDocument(cadDocument);assert.equal(JSON.parse(text).version,44);assert.deepEqual(deserializeDocument(text),cadDocument);const bad=JSON.parse(text);bad.version=43;assert.throws(()=>deserializeDocument(JSON.stringify(bad)),/44/);const bundle=await parseProjectBundle(await encodeProjectBundle([{id:"p",title:"Flex",document:cadDocument}]));assert.deepEqual(bundle.projects[0].document.canvases,cadDocument.canvases);
 const plan=await previewCadCommand({type:"apply-canvas-flex",canvasId:c.id});await run({type:"update-artboard",artboardId:"a",origin:[777,333]});const before=documentState();assert.equal((await applyCadPlan(plan.planId)).ok,false);assert.deepEqual(documentState(),before);const cancelled=await previewCadCommand({type:"apply-canvas-flex",canvasId:c.id});discardCadPlan(cancelled.planId);await assert.rejects(applyCadPlan(cancelled.planId),/expired/);
});

test("locked descendants, shared/cross-unit flow and connected-frame partial moves are rejected atomically",async()=>{
 const c=await flexFixture();await run({type:"upsert-canvas",canvas:{...c,members:[...c.members,{kind:"object",id:"source",relation:"reference",layout:{position:"flow"}}]}});assert.throws(()=>planCanvasFlex(cadDocument,c.id),/matching units/);
 await run({type:"upsert-canvas",canvas:c});cadDocument.frameLinks={link:{id:"link",fromId:"a",toId:"b",placement:"right",gap:50,fixed:false,reference:{kind:"section",number:"A",cut:[[0,0],[1,0]],direction:"left"}}};assert.throws(()=>planCanvasFlex(cadDocument,c.id),/Connected frames/);delete cadDocument.frameLinks;
 const child:CadCanvas={...c,id:"child",name:"Child",origin:[500,500],size:[100,60],layout:undefined,members:[],locked:true};await run({type:"upsert-canvas",canvas:child});
 const next={...c,members:[{kind:"canvas" as const,id:"child",relation:"own" as const}]};cadDocument.canvases!.child.locked=false;await run({type:"upsert-canvas",canvas:next});cadDocument.canvases!.child.locked=true;const before=documentState();const result=await dispatchCadCommand({type:"apply-canvas-flex",canvasId:c.id});assert.equal(result.ok,false);assert.deepEqual(documentState(),before);
});
test("late rejection of explicit source movement restores earlier paper placement and layout settings",async()=>{
 const c=await flexFixture();const model:CadCanvas={id:"model",name:"Model",units:"model-mm",workPlane:"XY",origin:[0,0],size:[200,200],locked:false,layout:defaultCanvasFlex(),members:[{kind:"object",id:"source",relation:"own",layout:{position:"flow"}}]};await run({type:"upsert-canvas",canvas:model});cadDocument.layers["layer-default"].locked=true;const before=documentState();const result=await dispatchCadCommand({type:"batch",commands:[{type:"apply-canvas-flex",canvasId:c.id},{type:"apply-canvas-flex",canvasId:model.id,allowModelMoves:true}]});assert.equal(result.ok,false);assert.deepEqual(documentState(),before);
});

test("an explicit fixed member boundary resolves the child's intrinsic Hug/Fill dependency",()=>{
 const leaf=item("leaf",20,10);leaf.style.width={mode:"fill"};const child=node([leaf],{width:{mode:"hug"},padding:0},[80,40]);child.key="child";const slot=item("slot",80,40);slot.child=child;slot.style.width={mode:"fixed",value:120};const r=solveCanvasFlex(node([slot],{padding:0}));assert.equal(r.root.children[0].size[0],120);assert.equal(r.root.children[0].children[0].size[0],120);
});
