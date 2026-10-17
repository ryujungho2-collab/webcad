import assert from "node:assert/strict";
import {beforeEach,test} from "node:test";
import {serializeDocument,deserializeDocument,validateModelPresentation} from "@agent-webcad/cad-document";
import type {CadCommand} from "@agent-webcad/cad-commands";
import {cadDocument} from "../src/state/cadDocument";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {previewCadCommand,applyCadPlan,discardCadPlan} from "../src/state/documentPlans";
import {undoDocument,redoDocument,cadHistory} from "../src/state/history";
import {explodedDisplayOffset,hasExplodedDisplay,projectModelPart} from "../src/precision/modelPresentation";
import {getWorldDrawingGeometry} from "../src/precision/worldGeometry";
import {measureDocumentObject} from "../src/state/documentQuery";
import {collectStepSolids,collectArtboardExportDrawings} from "../src/export/exportModel";
import {encodeDxf} from "../src/interop/dxfWriter";
import {encodeSvg} from "../src/export/svgWriter";
import {documentState,resetTestDocument} from "./helpers/documentHarness";
beforeEach(resetTestDocument);
const apply=async(c:CadCommand)=>{const r=await dispatchCadCommand(c);assert.ok(r.ok,r.reason);return r;};
const feature=(id:string)=>Object.values(cadDocument.features).find(f=>f.output===id)!;
const part=()=>cadDocument.modelPresentation!.parts;
const projection=(id="view")=>cadDocument.modelPresentation!.projections[id];
const outline=(partId="p1")=>{const id=projection().outputs[partId].objectId;return getWorldDrawingGeometry(cadDocument.objects[id],feature(id))!;};
const fixture=async()=>{await apply({type:"create-box",id:"box",width:20,depth:10,height:5});await apply({type:"create-primitive",id:"cylinder",primitive:"cylinder",params:{radius:3,height:12}});for(const [id,objectId] of [["p1","box"],["p2","cylinder"]])await apply({type:"register-model-part",part:{id,objectId,name:id}});};
const view=()=>({type:"upsert-model-projection",id:"view",name:"Top",partIds:["p1","p2"],basis:"XY",origin:[100,200],scale:2,layerId:"layer-default"} as const);
const explosion=()=>({type:"upsert-exploded-view",view:{id:"exploded",name:"Exploded",amount:.5,offsets:{p1:{direction:[1,0,0],distance:40},p2:{direction:[0,0,1],distance:30}}}} as const);
const reject=async(c:CadCommand)=>{const state=documentState(),h=cadHistory.getPastLabels().length,r=await dispatchCadCommand(c);assert.equal(r.ok,false);assert.deepEqual(documentState(),state);assert.equal(cadHistory.getPastLabels().length,h);};
test("stable part registration/placement Review and one Undo preserve solid identity and exact measurements",async()=>{
 await fixture();const before=documentState(),review=await previewCadCommand({type:"place-model-part",partId:"p1",translation:[30,40,50],rotation:[0,0,90]});assert.ok(review.result.ok,review.result.reason);assert.deepEqual(documentState(),before);assert.ok((await applyCadPlan(review.planId)).ok);discardCadPlan(review.planId);assert.equal(part().p1.objectId,"box");assert.deepEqual(cadDocument.objects.box.transform!.translation,[30,40,50]);assert.ok(Math.abs((await measureDocumentObject(cadDocument,"box")).volume!-1000)<1e-6);assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.equal(part().p1.id,"p1");
 await reject({type:"register-model-part",part:{id:"duplicate",objectId:"box",name:"Duplicate"}});await apply({type:"remove-model-part",partId:"p2"});assert.ok(cadDocument.objects.cylinder);
});
test("exploded display is persisted, normalized and exactly reversible; STEP and measurements ignore offsets",async()=>{
 await fixture();const model=structuredClone(cadDocument.objects),operands=collectStepSolids(),m=await measureDocumentObject(cadDocument,"box");await apply(explosion());await apply({type:"activate-exploded-view",viewId:"exploded"});assert.deepEqual(explodedDisplayOffset(cadDocument,"box"),[20,0,0]);assert.deepEqual(explodedDisplayOffset(cadDocument,"cylinder"),[0,0,15]);assert.deepEqual(cadDocument.objects,model);assert.deepEqual(collectStepSolids(),operands);assert.deepEqual(await measureDocumentObject(cadDocument,"box"),m);
 const saved=serializeDocument(cadDocument);assert.equal(JSON.parse(saved).version,24);assert.deepEqual(deserializeDocument(saved),cadDocument);await apply({...explosion(),view:{...explosion().view,amount:0}});assert.deepEqual(explodedDisplayOffset(cadDocument,"box"),[0,0,0]);assert.equal(hasExplodedDisplay(cadDocument),false);await apply({type:"activate-exploded-view",viewId:null});assert.deepEqual(cadDocument.objects,model);assert.ok(undoDocument());assert.equal(cadDocument.modelPresentation!.activeExplosionId,"exploded");
});
test("part references survive source deletion and require explicit rebind; referenced part removal rejects",async()=>{
 await fixture();await apply(explosion());await reject({type:"remove-model-part",partId:"p1"});await apply(view());await apply({type:"delete-object",objectId:"box"});assert.equal(part().p1.objectId,"box");assert.equal(projection().status,"unresolved");assert.match(projection().reason!,/Missing part/);assert.throws(()=>encodeDxf(cadDocument),/Rebind/);assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)),cadDocument);
 await apply({type:"create-box",id:"replacement",width:25,depth:10,height:5});await apply({type:"register-model-part",part:{id:"p1",name:"p1",objectId:"replacement"}});assert.equal(projection().status,"resolved");assert.equal(part().p1.objectId,"replacement");assert.equal(outline().points![1][0],150);
});
for(const basis of ["XY","XZ","YZ"] as const)test(`${basis} exact box/cylinder silhouettes follow assembled placement and sheet scale`,async()=>{
 await fixture();await apply({...view(),basis});const box=projectModelPart(cadDocument,projection(),"p1"),cylinder=projectModelPart(cadDocument,projection(),"p2");assert.equal(box.kind,"rectangle");assert.equal(cylinder.kind,basis==="XY"?"circle":"rectangle");assert.equal(box.sourceEdges.length,8);const width=basis==="YZ"?10:20,height=basis==="XY"?10:5;assert.deepEqual((box.params.points as number[][])[2],[100+2*width,200+2*height,0]);if(basis==="XY")assert.equal(cylinder.params.radius,6);
 const before=structuredClone(outline());await apply(explosion());await apply({type:"activate-exploded-view",viewId:"exploded"});assert.deepEqual(outline(),before);await apply({type:"place-model-part",partId:"p1",translation:[5,7,9],rotation:[0,0,0]});assert.equal(projection().status,"resolved");assert.notDeepEqual(outline(),before);
});
test("dimension edits regenerate existing projection output IDs/topology, artboard SVG and DXF",async()=>{
 await fixture();await apply(view());const ids=structuredClone(projection().outputs),topology=structuredClone(feature(ids.p1.objectId).params.topology);await apply({type:"update-primitive",objectId:"box",params:{width:35,depth:10,height:8}});assert.equal(projection().outputs.p1.objectId,ids.p1.objectId);assert.deepEqual(feature(ids.p1.objectId).params.topology,topology);assert.equal(outline().points![1][0],170);
 await apply({type:"create-artboard",id:"board",name:"Sheet",workPlane:"XY",origin:[80,180],size:[100,70]});const drawings=collectArtboardExportDrawings("board");assert.ok(drawings.some(d=>d.objectId===ids.p1.objectId));assert.ok(encodeSvg(drawings).includes("poly"));assert.equal(encodeDxf(cadDocument,[ids.p1.objectId,ids.p2.objectId]).skipped,0);assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)),cadDocument);
});
test("changed source edge correspondence freezes and hides stale output until explicit rebind",async()=>{
 await fixture();await apply(view());const id=projection().outputs.p1.objectId,old=structuredClone(feature(id).params.topology);await apply({type:"rotate-object",objectId:"box",rotation:[0,90,0]});assert.equal(projection().status,"unresolved");assert.match(projection().reason!,/correspondence/);assert.equal(cadDocument.objects[id].visible,false);await assert.rejects(measureDocumentObject(cadDocument,id),/unresolved/);await apply(view());assert.equal(projection().status,"resolved");assert.equal(cadDocument.objects[id].visible,true);assert.notDeepEqual(feature(id).params.topology,old);
});
test("conic fallback, output ownership, locks and stale Review are atomic",async()=>{
 await fixture();await apply({type:"rotate-object",objectId:"cylinder",rotation:[0,35,0]});await apply(view());assert.equal(projection().method,"brep-hlr");await apply({type:"rotate-object",objectId:"cylinder",rotation:[0,0,0]});await apply(view());const id=Object.values(projection().outputs).find(e=>e.partId==="p1")!.objectId;await reject({type:"move-object",objectId:id,translation:[1,0,0]});await reject({type:"delete-object",objectId:id});await apply({type:"set-layer-locked",layerId:"layer-default",locked:true});await reject({type:"update-primitive",objectId:"box",params:{width:30,depth:10,height:5}});await apply({type:"set-layer-locked",layerId:"layer-default",locked:false});
 const review=await previewCadCommand({...view(),name:"Front",basis:"XZ"});await apply({type:"rename-object",objectId:"box",name:"Changed"});const before=documentState();assert.equal((await applyCadPlan(review.planId)).ok,false);assert.deepEqual(documentState(),before);discardCadPlan(review.planId);
});
test("v24 guards malformed payloads and older files; no duplicate part/source or dangling view references",async()=>{
 await fixture();const file=JSON.parse(serializeDocument(cadDocument));file.version=23;assert.throws(()=>deserializeDocument(JSON.stringify(file)),/version 24/);const p=structuredClone(cadDocument.modelPresentation!);p.parts.duplicate={...p.parts.p1,id:"duplicate"};assert.throws(()=>validateModelPresentation(p),/duplicated/);assert.throws(()=>validateModelPresentation({...p,parts:{},explosions:{exploded:explosion().view}}));
 await apply(view());await apply({type:"delete-model-projection",projectionId:"view"});assert.equal(cadDocument.modelPresentation!.projections.view,undefined);assert.ok(cadDocument.objects.box);await apply({type:"remove-model-part",partId:"p1"});assert.ok(cadDocument.objects.box);
});
