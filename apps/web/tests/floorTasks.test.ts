import test from "node:test";
import assert from "node:assert/strict";
import {serializeDocument,deserializeDocument} from "@agent-webcad/cad-document";
import {analyzeFloorSelection,floorPurgeCandidates,planFloorTask,type FloorTaskIntent} from "../src/precision/floorPlanWorkflow";
import {cadDocument} from "../src/state/cadDocument";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {applyCadPlan,previewCadCommand} from "../src/state/documentPlans";
import {documentState,resetTestDocument} from "./helpers/documentHarness";
import {cadHistory,undoDocument,redoDocument} from "../src/state/history";
import {worldDraftingGeometry} from "../src/precision/draftingGeometry";
import {getWorldDrawingGeometry} from "../src/precision/worldGeometry";
import {createDraftingRenderObject} from "../src/viewport/draftingRenderer";
import {encodeDxf} from "../src/interop/dxfWriter";
import {encodeSvg} from "../src/export/svgWriter";
import {collectExportDrawings,collectFrameExportItems} from "../src/export/exportModel";
import {encodeFrameDxf} from "../src/export/frameDxf";
import {measureDocumentObject} from "../src/state/documentQuery";
import {planDxfImport} from "../src/interop/dxfImport";
import {floorPlanDxf} from "./helpers/floorPlanFixture";
import type {Vec3} from "../src/precision/workPlane";
import {pickDxfPreviewPoint} from "../src/interop/dxfPreviewPick";
test.beforeEach(resetTestDocument);
const feature=(id:string)=>Object.values(cadDocument.features).find(f=>f.output===id)!;
const run=async(command:Parameters<typeof dispatchCadCommand>[0])=>{const r=await dispatchCadCommand(command);assert.ok(r.ok,r.reason);return r;};
const line=(id:string,a:Vec3,b:Vec3)=>run({type:"create-drawing",id,drawing:"line",params:{points:[a,b],workPlane:"XY"}});
const intent=(targetIds:string[],patch:Partial<FloorTaskIntent>={}):FloorTaskIntent=>({requestId:"fixture",documentId:cadDocument.id,revision:cadDocument.revision,kind:"make-face",targetIds,toleranceMm:.1,repair:false,layerId:"layer-default",...patch});
async function gap(size:number){await line("a",[0,0,0],[10,0,0]);await line("b",[10,0,0],[10,10,0]);await line("c",[10,10,0],[0,10,0]);await line("d",[0,10,0],[0,size,0]);return ["a","b","c","d"];}
test("0.1/1 mm gaps require explicit bounded repair; original curves/points survive one Undo",async()=>{
  for(const size of [.1,1]){resetTestDocument();const ids=await gap(size),before=documentState(),count=cadHistory.getPastLabels().length;
    assert.equal(analyzeFloorSelection(cadDocument,ids,size/2,true).loops.length,0);
    assert.equal(analyzeFloorSelection(cadDocument,ids,size,false).loops.length,0);
    const task=planFloorTask(cadDocument,intent(ids,{toleranceMm:size,repair:true}));assert.equal(task.analysis!.bridges.length,1);
    const p=await previewCadCommand(task.command);assert.ok(p.result.ok,p.result.reason);assert.deepEqual(documentState(),before);assert.ok((await applyCadPlan(p.planId)).ok);
    assert.equal(feature("floor-face-fixture").params.kind,"face");assert.equal(cadHistory.getPastLabels().length,count+1);
    for(const id of ids)assert.deepEqual(cadDocument.features[feature(id).id],before.features[feature(id).id]);
    const after=documentState();assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),after);
  }
});
test("duplicates, T branches, nonplanar and self-crossing input refuse face mutation with witnesses",async()=>{
  let ids=await gap(0);await line("duplicate",[10,0,0],[0,0,0]);assert.ok(analyzeFloorSelection(cadDocument,[...ids,"duplicate"],.1,true).issues.some(i=>i.kind==="duplicate"&&i.point));
  resetTestDocument();ids=await gap(0);await line("tee",[5,0,0],[5,5,0]);assert.ok(analyzeFloorSelection(cadDocument,[...ids,"tee"],.1,true).issues.some(i=>i.kind==="branch"));
  resetTestDocument();ids=await gap(0);await run({type:"move-object",objectId:"a",translation:[0,0,.01]});assert.ok(analyzeFloorSelection(cadDocument,ids,.1,true).issues.some(i=>i.kind==="nonplanar"));
  resetTestDocument();await run({type:"create-drawing",id:"cross",drawing:"polyline",params:{points:[[0,0,0],[10,10,0],[0,10,0],[10,0,0]],closed:true,workPlane:"XY"}});const before=documentState();assert.ok(analyzeFloorSelection(cadDocument,["cross"],1,true).issues.length);assert.throws(()=>planFloorTask(cadDocument,intent(["cross"])),/area|intersect/i);assert.deepEqual(documentState(),before);
});
test("ambiguous three-endpoint clusters and over-budget tolerances never auto bridge",async()=>{
  const ids=await gap(.1);await line("third",[0,.05,0],[-5,5,0]);const result=analyzeFloorSelection(cadDocument,[...ids,"third"],.2,true);assert.ok(result.issues.some(i=>i.message.includes("Ambiguous")));assert.equal(result.bridges.length,0);assert.throws(()=>analyzeFloorSelection(cadDocument,ids,11,true),/tolerance/);
});
test("mixed arc + line face preserves analytic arc and exact-hole extrusion volume, SVG hole and reopen",async()=>{
  await run({type:"create-drawing",id:"arc",drawing:"arc",params:{center:[0,0,0],radius:10,startAngle:0,endAngle:Math.PI,workPlane:"XY"}});await line("diameter",[-10,0,0],[10,0,0]);
  await run({type:"create-drawing",id:"hole",drawing:"circle",params:{center:[0,4,0],radius:1,workPlane:"XY"}});
  const task=planFloorTask(cadDocument,intent(["arc","diameter","hole"])),p=await previewCadCommand(task.command);assert.ok(p.result.ok,p.result.reason);assert.ok((await applyCadPlan(p.planId)).ok);
  const face=feature("floor-face-fixture"),regions=face.params.regions as any[];assert.equal(regions.length,1);assert.equal(regions[0].holes.length,1);assert.ok(regions[0].segments.some((s:any)=>s.kind==="arc"));
  const data=worldDraftingGeometry(cadDocument,cadDocument.objects[face.output],face);assert.equal(data.lines[0].holes!.length,1);
  assert.ok(Math.abs((await measureDocumentObject(cadDocument,face.output)).area!-49*Math.PI)<1e-8);
  const group=createDraftingRenderObject(face.output,cadDocument);const mesh=group.children.find(c=>(c as any).isMesh) as any;assert.ok(mesh?.geometry.index.count>0);let area=0;const pos=mesh.geometry.attributes.position,indices=mesh.geometry.index;
  for(let i=0;i<indices.count;i+=3){const a=indices.getX(i),b=indices.getX(i+1),c=indices.getX(i+2);area+=Math.abs((pos.getX(b)-pos.getX(a))*(pos.getY(c)-pos.getY(a))-(pos.getY(b)-pos.getY(a))*(pos.getX(c)-pos.getX(a)))/2;}
  assert.ok(Math.abs(area-(49*Math.PI))<.05);
  const svg=encodeSvg(collectExportDrawings("XY",cadDocument,[face.output]));assert.match(svg,/fill-rule="evenodd"/);const dxf=encodeDxf(cadDocument,[face.output]);assert.equal(dxf.skipped,0);assert.ok(dxf.warnings.some(w=>w.includes("boundary")));
  await run({type:"create-artboard",id:"frame",workPlane:"XY",origin:[20,30],size:[20,20],frame:{memberIds:[face.output],sourceOrigin:[-10,0],denominator:2}});
  const items=collectFrameExportItems(cadDocument.artboards!.frame),frameLine=items.find(i=>i.type==="polyline")!;assert.ok(frameLine.type==="polyline");const original=collectExportDrawings("XY",cadDocument,[face.output])[0].holes![0][0];assert.deepEqual(frameLine.polyline.holes![0][0],[20+(original[0]+10)/2,30+original[1]/2]);assert.match(encodeSvg([],{items}),/fill-rule="evenodd"/);assert.equal((encodeFrameDxf(cadDocument.artboards!.frame,items).match(/LWPOLYLINE/g)??[]).length,2);
  await run({type:"create-extrude",id:"solid",profileObjectIds:[face.output],distance:2});const measured=await measureDocumentObject(cadDocument,"solid");assert.ok(Math.abs(measured.volume!-98*Math.PI)<1e-5);
  assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)),cadDocument);
  const before=documentState();assert.equal((await dispatchCadCommand({type:"move-object",objectId:face.output,translation:[1,0,0]})).ok,false);assert.deepEqual(documentState(),before);
});
test("purge follows hidden definitions and protects locked and sketch layer references",async()=>{
  await line("source",[0,0,0],[10,0,0]);await run({type:"define-block",id:"used",name:"Used",objectIds:["source"],base:[0,0,0]});await run({type:"define-block",id:"unused",name:"Unused",objectIds:["source"],base:[0,0,0]});await run({type:"insert-block",id:"instance",blockId:"used",position:[0,0,0]});await run({type:"set-object-visible",objectId:"instance",visible:false});
  await run({type:"create-layer",id:"empty",name:"Empty"});await run({type:"create-layer",id:"locked",name:"Locked"});await run({type:"set-layer-locked",layerId:"locked",locked:true});await run({type:"create-layer",id:"sketch",name:"Sketch"});await run({type:"create-sketch",id:"sk",workPlane:"XY",layerId:"sketch"});
  const candidates=floorPurgeCandidates(cadDocument);assert.deepEqual(candidates.blockIds,["unused"]);assert.deepEqual(candidates.layerIds,["empty"]);
  const before=documentState(),task=planFloorTask(cadDocument,intent([],{kind:"purge"})),p=await previewCadCommand(task.command);assert.ok(p.result.ok,p.result.reason);assert.deepEqual(documentState(),before);assert.ok((await applyCadPlan(p.planId)).ok);assert.ok(cadDocument.blocks!.used);assert.ok(!cadDocument.blocks!.unused);assert.ok(!cadDocument.layers.empty);assert.ok(undoDocument());assert.deepEqual(documentState(),before);
  assert.equal((await dispatchCadCommand({type:"purge-unused",blockIds:["used"],layerIds:[]})).ok,false);
});
test("DXF source receipt reverses origin/unit once, survives import Undo and portable reopen",async()=>{
  const p=planDxfImport(floorPlanDxf,new Map(),"receipt",{includedLayers:["A-WALL"],usedOnly:true,sourceName:"library.dxf",originMm:[10000,20000,0]});assert.ok(p.ok);await run(p.command);
  const id=cadDocument.rootObjects.find(id=>feature(id).type==="drawing")!,f=feature(id),receipt=f.params.floorPlanSource as any,world=getWorldDrawingGeometry(cadDocument.objects[id],f)!;
  assert.equal(receipt.sourceName,"library.dxf");assert.equal(receipt.unitMm,10);assert.deepEqual(world.points![0].map((v,i)=>(v+receipt.originMm[i])/receipt.unitMm),[1000,2000,0]);
  assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)),cadDocument);assert.ok(undoDocument());assert.equal(cadDocument.rootObjects.length,0);
});
test("stale request and reviewed plan cannot publish after document revision/generation change",async()=>{
  const ids=await gap(0),request=intent(ids),plan=await previewCadCommand(planFloorTask(cadDocument,request).command);await run({type:"create-layer",id:"new",name:"New"});const before=documentState();assert.throws(()=>planFloorTask(cadDocument,request),/changed/);assert.equal((await applyCadPlan(plan.planId)).ok,false);assert.deepEqual(documentState(),before);
});
test("linked face and extrusion regenerate on source placement; broken closure and locked output roll back",async()=>{
  const ids=await gap(0);await run(planFloorTask(cadDocument,intent(ids)).command);await run({type:"create-extrude",id:"solid",profileObjectIds:["floor-face-fixture"],distance:2});
  await run({type:"batch",commands:ids.map(objectId=>({type:"move-object",objectId,translation:[3,4,0]}))});
  const profile=feature("solid").params.profile as any;assert.ok(profile.segments.every((s:any)=>s.start[0]>=3&&s.start[1]>=4));assert.ok(Math.abs((await measureDocumentObject(cadDocument,"solid")).volume!-200)<1e-6);
  const before=documentState();assert.equal((await dispatchCadCommand({type:"move-object",objectId:"a",translation:[4,4,0]})).ok,false);assert.deepEqual(documentState(),before);
  await run({type:"create-layer",id:"face-layer",name:"Face"});await run({type:"move-object-to-layer",objectId:"floor-face-fixture",layerId:"face-layer"});await run({type:"set-layer-locked",layerId:"face-layer",locked:true});const locked=documentState();assert.equal((await dispatchCadCommand({type:"batch",commands:ids.map(objectId=>({type:"move-object",objectId,translation:[4,4,0]}))})).ok,false);assert.deepEqual(documentState(),locked);
});
test("a locked CAD reference can be read to make a separate editable face and exact extrusion",async()=>{
  const ids=await gap(0);await run({type:"create-layer",id:"reference",name:"CAD"});for(const id of ids)await run({type:"move-object-to-layer",objectId:id,layerId:"reference"});await run({type:"set-layer-locked",layerId:"reference",locked:true});const before=structuredClone(cadDocument.objects);
  await run(planFloorTask(cadDocument,intent(ids)).command);await run({type:"create-extrude",id:"solid",profileObjectIds:["floor-face-fixture"],distance:2});assert.ok(Math.abs((await measureDocumentObject(cadDocument,"solid")).volume!-200)<1e-6);for(const id of ids)assert.deepEqual(cadDocument.objects[id],before[id]);
});
test("v40 rejects downgrade, missing face source/invalid regions and malformed source metadata",async()=>{
  await run(planFloorTask(cadDocument,intent(await gap(0))).command);const text=serializeDocument(cadDocument);assert.equal(JSON.parse(text).version,40);
  const downgrade=JSON.parse(text);downgrade.version=39;assert.throws(()=>deserializeDocument(JSON.stringify(downgrade)),/version 40/);
  const invalid=JSON.parse(text);invalid.document.features["feature-floor-face-fixture"].params.regions[0].segments[0].end=[null,0,0];assert.throws(()=>deserializeDocument(JSON.stringify(invalid)),/feature/);
  const missing=JSON.parse(text);missing.document.features["feature-floor-face-fixture"].params.sourceObjectIds=["missing"];missing.document.features["feature-floor-face-fixture"].inputs=["missing"];assert.throws(()=>deserializeDocument(JSON.stringify(missing)),/face sources/);
  const metadata=JSON.parse(text);metadata.document.features["feature-a"].params.floorPlanSource={unitMm:-1};assert.throws(()=>deserializeDocument(JSON.stringify(metadata)),/feature/);
});
test("preview point mapping accounts for letterboxing, world Y sign and endpoint snaps",()=>{
  const svg='<svg viewBox="10 -120 100 100"/>',box={left:100,top:50,width:400,height:200};
  assert.deepEqual(pickDxfPreviewPoint(svg,box,[200,50],[[10,120]]),[10,120]);assert.equal(pickDxfPreviewPoint(svg,box,[150,50],[]),null);assert.deepEqual(pickDxfPreviewPoint(svg,box,[204,52],[[10,120]]),[10,120]);
});
test("large survey coordinates retain small face area and display budget refuses enormous curves atomically",async()=>{
  const ids=await gap(0);await run({type:"batch",commands:ids.map(objectId=>({type:"move-object",objectId,translation:[1e9,1e9,0]}))});await run(planFloorTask(cadDocument,intent(ids)).command);assert.equal((await measureDocumentObject(cadDocument,"floor-face-fixture")).area,100);
  resetTestDocument();await run({type:"create-drawing",id:"huge",drawing:"circle",params:{center:[0,0,0],radius:1e9,workPlane:"XY"}});const before=documentState(),plan=await previewCadCommand(planFloorTask(cadDocument,intent(["huge"])).command);assert.equal(plan.result.ok,false);assert.match(plan.result.reason!,/point budget/);assert.deepEqual(documentState(),before);
});
test("imported source provenance survives ordinary drawing duplication without claiming a new import",async()=>{
  const task=planDxfImport(floorPlanDxf,new Map(),"copy-source",{includedLayers:["A-WALL"],usedOnly:true});assert.ok(task.ok);await run(task.command);const original=cadDocument.rootObjects.find(id=>feature(id).type==="drawing")!,source=structuredClone(feature(original).params.floorPlanSource);const result=await run({type:"duplicate-object",objectId:original});assert.deepEqual(feature(result.createdIds[0]).params.floorPlanSource,source);assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)),cadDocument);
});
