import {createHash} from "node:crypto";
import test from "node:test";import assert from "node:assert/strict";
import {serializeDocument,deserializeDocument,validDrawingFrame,type CadCanvas} from "@agent-webcad/cad-document";
import {validateCommand} from "@agent-webcad/cad-commands";
import {flexFixture} from "./helpers/canvasFlexFixture";
import {cadDocument} from "../src/state/cadDocument";
import {documentState} from "./helpers/documentHarness";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {previewCadCommand,applyCadPlan,discardCadPlan} from "../src/state/documentPlans";
import {cadHistory,undoDocument,redoDocument} from "../src/state/history";
import {collectArtboardExportItems} from "../src/export/exportModel";
import {encodeSvg} from "../src/export/svgWriter";
import {planCanvasScale} from "../src/canvas/canvasScalePlan";
import {projectKernelMetrics} from "../src/cad/kernelGeometryService";
import {encodeProjectBundle,parseProjectBundle} from "../src/app/projectBundle";
const run=async(c:Parameters<typeof dispatchCadCommand>[0])=>{const r=await dispatchCadCommand(c);assert.ok(r.ok,r.reason);};
const command=(factor=2,keepPaperStyles=false)=>({type:"scale-canvas-contents" as const,canvasId:"flex",factor,keepPaperStyles});
const line=()=>collectArtboardExportItems("a").find(i=>i.type==="polyline")!;
async function label(){await run({type:"create-drafting",id:"label",params:{kind:"text",workPlane:"XY",point:[20,20,0],text:"ROOM",height:10,angle:0}});await run({type:"update-artboard",artboardId:"a",frame:{...cadDocument.artboards!.a.frame!,memberIds:["source","label"]}});}
const text=()=>collectArtboardExportItems("a").find(i=>i.type==="text")!;
test("uniform scale reviews detached placements and commits exactly one Undo without native source tasks",async()=>{
 await flexFixture();cadHistory.clear();const before=documentState(),sources=JSON.stringify([cadDocument.objects,cadDocument.features]),tasks=projectKernelMetrics().submittedTasks;
 const r=await previewCadCommand(command());assert.ok(r.result.ok,r.result.reason);assert.equal(r.canvasScale?.factor,2);assert.deepEqual(documentState(),before);await applyCadPlan(r.planId);
 assert.deepEqual(cadDocument.artboards!.a.origin,[800,600]);assert.deepEqual(cadDocument.artboards!.a.size,[200,120]);assert.equal(cadDocument.artboards!.a.frame!.denominator,10);assert.deepEqual(cadDocument.artboards!.a.frame!.sourceOrigin,[-10,-10]);assert.equal(JSON.stringify([cadDocument.objects,cadDocument.features]),sources);assert.equal(projectKernelMetrics().submittedTasks,tasks);assert.equal(cadHistory.getPastLabels().length,1);undoDocument();assert.deepEqual(documentState(),before);redoDocument();assert.equal(cadDocument.canvases!.flex.size[0],500);
});
test("frame geometry, text and strokes scale together; paper-fixed text and strokes remain unchanged",async()=>{
 await flexFixture();await label();const a=line(),b=text();await run(command());const x=line(),y=text();assert.equal(x.polyline.lineWeight,a.polyline.lineWeight!*2);assert.equal(y.text.size,b.text.size!*2);assert.equal(x.polyline.points[1][0]-x.polyline.points[0][0],2*(a.polyline.points[1][0]-a.polyline.points[0][0]));undoDocument();await run(command(2,true));assert.equal(line().polyline.lineWeight,a.polyline.lineWeight);assert.equal(text().text.size,b.text.size);await run(command(.5,true));assert.equal(text().text.size,b.text.size);assert.equal(line().polyline.lineWeight,a.polyline.lineWeight);
});
test("nested canvas scales around root origin, and Flex values scale without changing weights or modes",async()=>{
 const c=await flexFixture();
 const child:CadCanvas={...c,id:"child",name:"Child",origin:[200,100],members:c.members};await run({type:"upsert-canvas",canvas:{...c,members:[]}});await run({type:"upsert-canvas",canvas:child});await run({type:"upsert-canvas",canvas:{...c,origin:[100,50],members:[{kind:"canvas",id:"child",relation:"own"}]}});await run(command());assert.deepEqual(cadDocument.canvases!.child.origin,[300,150]);assert.deepEqual(cadDocument.canvases!.flex.origin,[100,50]);assert.equal(cadDocument.canvases!.child.layout!.gap,20);assert.equal(cadDocument.canvases!.child.layout!.padding,20);assert.deepEqual(cadDocument.artboards!.a.origin,[700,550]);
});
test("shared references stay pinned and review identifies exclusions",async()=>{const c=await flexFixture();await run({type:"upsert-canvas",canvas:{...c,members:c.members.map(m=>({...m,relation:"reference"}))}});const before=JSON.stringify(cadDocument.artboards);const r=await previewCadCommand(command());assert.equal(r.canvasScale?.skipped.length,3);await applyCadPlan(r.planId);assert.equal(JSON.stringify(cadDocument.artboards),before);});
test("late locked frame rejects the whole transaction and does not leak earlier placements",async()=>{await flexFixture();cadDocument.artboards!.c.locked=true;const before=documentState();const r=await dispatchCadCommand(command());assert.equal(r.ok,false);assert.deepEqual(documentState(),before);});
test("locked descendant and original constrained/source geometry reject with actionable handoff",async()=>{const c=await flexFixture();cadDocument.canvases!.flex.locked=true;assert.throws(()=>planCanvasScale(cadDocument,c.id,2),/locked/i);cadDocument.canvases!.flex.locked=false;await run({type:"upsert-canvas",canvas:{...c,units:"model-mm",members:[{kind:"object",id:"source",relation:"own"}]}});const before=documentState();const r=await dispatchCadCommand(command());assert.equal(r.ok,false);assert.match(r.reason!,/drawing frame/);assert.deepEqual(documentState(),before);});
test("invalid, non-uniform and excessive resulting scales reject before mutation",async()=>{await flexFixture();for(const factor of [0,-1,NaN,Infinity,1,1e8]){const before=documentState();if(validateCommand(command(factor)))assert.equal((await dispatchCadCommand(command(factor))).ok,false);else await assert.rejects(dispatchCadCommand(command(factor)),/Invalid CAD/);assert.deepEqual(documentState(),before);}assert.equal(validateCommand({...command(),factor:[2,3]}),false);cadDocument.artboards!.a.frame!.denominator=.001;assert.throws(()=>planCanvasScale(cadDocument,"flex",2),/supported range/);assert.equal(validDrawingFrame({...cadDocument.artboards!.a.frame!,paperStrokeScale:NaN}),false);});
test("connected frames and sheet-owned paper do not bypass owning tools",async()=>{await flexFixture();cadDocument.frameLinks={l:{id:"l",fromId:"a",toId:"b",placement:"right",gap:10,fixed:false,reference:{kind:"detail",number:"1"}}};const before=documentState();assert.equal((await dispatchCadCommand(command())).ok,false);assert.deepEqual(documentState(),before);});
test("work areas move their origin and scale each frame once",async()=>{const c=await flexFixture();await run({type:"upsert-workspace-section",section:{id:"area",name:"Area",workPlane:"XY",origin:[100,100],frameIds:["a","b","c"],size:[300,200],color:"#123456",collapsed:false}});await run({type:"upsert-canvas",canvas:{...c,members:[{kind:"workspace-section",id:"area",relation:"own"}]}});await run(command());assert.deepEqual(cadDocument.workspaceSections!.area.origin,[200,200]);assert.deepEqual(cadDocument.artboards!.a.origin,[800,600]);assert.equal(cadDocument.artboards!.a.frame!.denominator,10);});
test("cancel and stale reviews cannot scale newer document state",async()=>{await flexFixture();const cancelled=await previewCadCommand(command());discardCadPlan(cancelled.planId);await assert.rejects(applyCadPlan(cancelled.planId),/expired/);const r=await previewCadCommand(command());await run({type:"update-artboard",artboardId:"a",origin:[1,2]});const before=documentState();assert.equal((await applyCadPlan(r.planId)).ok,false);assert.deepEqual(documentState(),before);});
test("v45 portable and bundle preserve cumulative style factors and reject downgrade",async()=>{await flexFixture();await run(command());const s=serializeDocument(cadDocument);assert.equal(JSON.parse(s).version,45);assert.deepEqual(deserializeDocument(s),cadDocument);const downgraded=JSON.parse(s);downgraded.version=44;assert.throws(()=>deserializeDocument(JSON.stringify(downgraded)),/45/);const bundle=await parseProjectBundle(await encodeProjectBundle([{id:"p",title:"Scale",document:cadDocument}]));assert.deepEqual(bundle.projects[0].document.artboards,cadDocument.artboards);assert.match(encodeSvg([],{items:collectArtboardExportItems("a"),viewBox:cadDocument.artboards!.a}),/stroke-width=/);});

test("image scale retains immutable bitmap, crop, mask and color adjustments; exclusions pin placements",async()=>{
 const c=await flexFixture();const data="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p7sAAAAASUVORK5CYII=",bytes=Buffer.from(data,"base64"),hash=createHash("sha256").update(bytes).digest("hex");
 await run({type:"insert-image",id:"image",asset:{id:`asset-${hash}`,name:"pixel.png",mimeType:"image/png",width:1,height:1,byteLength:bytes.length,contentHash:hash,dataUrl:`data:image/png;base64,${data}`},workPlane:"XY",center:[25,30,0],width:100,height:50});
 await run({type:"update-image",objectId:"image",crop:{x:.1,y:.2,width:.5,height:.5},mask:"ellipse",opacity:.7,adjustments:{brightness:20,contrast:-10,saturation:30}});
 await run({type:"upsert-canvas",canvas:{...c,id:"images",units:"model-mm",origin:[10,10],members:[{kind:"object",id:"image",relation:"own"}]}});const source=JSON.stringify([cadDocument.rasterAssets,cadDocument.features]),before=JSON.stringify(cadDocument.objects.image);
 await run({type:"scale-canvas-contents",canvasId:"images",factor:2,includeImages:false});assert.equal(JSON.stringify(cadDocument.objects.image),before);undoDocument();
 await run({type:"scale-canvas-contents",canvasId:"images",factor:2});assert.deepEqual(cadDocument.objects.image.transform!.translation,[40,50,0]);assert.deepEqual(cadDocument.objects.image.transform!.scale,[2,2,2]);assert.equal(JSON.stringify([cadDocument.rasterAssets,cadDocument.features]),source);
});
test("analytic ellipse axes scale exactly through frame projection",async()=>{
 await flexFixture();await run({type:"create-drawing",id:"ellipse",drawing:"ellipse",params:{workPlane:"XY",center:[20,20,0],axisU:[10,0,0],axisV:[0,5,0],startParam:0,sweep:2*Math.PI}});await run({type:"update-artboard",artboardId:"a",frame:{...cadDocument.artboards!.a.frame!,memberIds:["ellipse"]}});const before=line().polyline.ellipse!;await run(command());const after=line().polyline.ellipse!;assert.deepEqual(after.axisU,before.axisU.map(n=>n*2));assert.deepEqual(after.axisV,before.axisV.map(n=>n*2));assert.equal(after.sweep,before.sweep);assert.match(encodeSvg([],{items:collectArtboardExportItems("a")}),/<ellipse/);
});

test("v45 detects styling retained only in published frame snapshots",async()=>{
 await flexFixture();await run(command());await run({type:"layout-frame-sheet-set",id:"set",name:"Scaled",frameIds:["a"],sectionIds:[],fixedFrameIds:[],denominators:[1],origin:[2000,0],size:[297,210],margin:10,gap:8,maxPages:4,alignment:"none",template:"standard",fields:{drawingName:"Scaled",author:"Author",revision:"A"}});
 for(const b of Object.values(cadDocument.artboards??{}))if(b.frame){delete b.frame.paperStrokeScale;delete b.frame.paperTextScale;}
 const saved=serializeDocument(cadDocument);assert.equal(JSON.parse(saved).version,45);assert.deepEqual(deserializeDocument(saved),cadDocument);const old=JSON.parse(saved);old.version=44;assert.throws(()=>deserializeDocument(JSON.stringify(old)),/45/);
});
