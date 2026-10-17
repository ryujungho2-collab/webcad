import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { deserializeDocument, serializeDocument } from "@agent-webcad/cad-document";
import type { CadCommand, ContourReferenceRoute } from "@agent-webcad/cad-commands";
import { cadDocument } from "../../src/state/cadDocument";
import { dispatchCadCommand } from "../../src/state/dispatchCadCommand";
import { previewCadCommand, applyCadPlan, discardCadPlan } from "../../src/state/documentPlans";
import { cadHistory, undoDocument, redoDocument } from "../../src/state/history";
import { assertConstructionEvaluation } from "../../src/precision/constructionGeometry";
import { exactDrawingContour, contourLength } from "../../src/features/drawing-editing/geometry/contourEditing";
import { resetTestDocument, documentState } from "../helpers/documentHarness";
import {newScene} from "../../src/state/sceneCommands";
beforeEach(resetTestDocument);
const feature = (id:string) => Object.values(cadDocument.features).find(f=>f.output===id)!;
async function apply(c:CadCommand){const r=await dispatchCadCommand(c);assert.ok(r.ok,r.reason);return r;}
async function reject(c:CadCommand,reason:RegExp){const before=JSON.stringify(cadDocument),h=cadHistory.getPastLabels();let r;try{r=await dispatchCadCommand(c);}catch(e){r={ok:false,reason:String(e)};}assert.equal(r.ok,false);assert.match(r.reason!,reason);assert.equal(JSON.stringify(cadDocument),before);assert.deepEqual(cadHistory.getPastLabels(),h);}
const line=(id="source",a=[0,0,0],b=[100,0,0])=>apply({type:"create-drawing",id,drawing:"line",params:{points:[a,b],workPlane:"XY"}});
const route=(dependentId:string,extra:Partial<ContourReferenceRoute>={}):ContourReferenceRoute=>({dependentId,sourceId:"source",resultIndices:[0],...extra});
const command=(routes:ContourReferenceRoute[]=[],extra:Record<string,unknown>={}):CadCommand=>({type:"break-drawing",objectId:"source",firstPoint:[40,0,0],secondPoint:[60,0,0],referenceRoutes:routes,...extra});
async function dim(){await apply({type:"create-dimension",id:"D",dimension:"linear",params:{sourceObjectId:"source",points:[[0,0],[100,0]],workPlane:"XY",offset:10}});}
function roundtrip(before:ReturnType<typeof documentState>){const after=documentState();assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),after);const loaded=deserializeDocument(serializeDocument(cadDocument));assert.deepEqual(loaded,cadDocument);assertConstructionEvaluation(loaded);}
test("Break remaps dimension and midpoint span, regenerates downstream bisector, previews atomically and survives history/reload",async()=>{
 await line();await dim();await apply({type:"create-construction",id:"M",definition:{operation:"midpoint",segmentId:"source"},workPlane:"XY"});await apply({type:"create-construction",id:"L",definition:{operation:"perpendicular-bisector",segmentId:"source",midpointId:"M"},workPlane:"XY"});
 const before=documentState(),h=cadHistory.getPastLabels().length,p=await previewCadCommand(command([route("D",{resultIndices:[1],segmentIndex:0}),route("M"),route("L")]));assert.ok(p.result.ok,p.result.reason);assert.deepEqual(documentState(),before);assert.equal(cadHistory.getPastLabels().length,h);
 const r=await applyCadPlan(p.planId);assert.ok(r.ok,r.reason);discardCadPlan(p.planId);assert.equal(feature("D").params.sourceObjectId,r.createdIds[1]);assert.deepEqual(feature("D").params.points,[[60,0],[100,0]]);assert.deepEqual(feature("M").params.points,[[20,0,0]]);assert.equal(feature("L").construction!.operation,"perpendicular-bisector");assert.equal(cadHistory.getPastLabels().length,h+1);roundtrip(before);
 await apply({type:"break-drawing",objectId:r.createdIds[1],firstPoint:[80,0,0],referenceRoutes:[{dependentId:"D",sourceId:r.createdIds[1],resultIndices:[0]}]});assert.deepEqual(feature("D").params.points,[[60,0],[80,0]]);
});
test("keep only the second piece remaps point construction to its new start, then Join remains usable",async()=>{
 await line();await line("other",[0,20,0],[10,20,0]);const t=feature("source").params.topology as any;
 await apply({type:"create-construction",id:"C",workPlane:"XY",definition:{operation:"segment",firstId:"source",secondId:"other",elements:{first:{topologyId:t.controls[1].id},second:{topologyId:(feature("other").params.topology as any).controls[0].id}}}});
 const before=documentState(),r=await apply(command([route("C",{pointIndex:0})],{keepResultIndices:[1]}));assert.equal(r.createdIds.length,1);assert.deepEqual(feature("C").params.points,[[60,0,0],[0,20,0]]);roundtrip(before);
 await line("tail",[100,0,0],[120,0,0]);await apply({type:"join-drawings",objectIds:[r.createdIds[0],"tail"],id:"joined",referenceRoutes:[{dependentId:"C",sourceId:r.createdIds[0],resultIndices:[0],pointIndex:0}]});assert.equal((feature("C").construction as any).firstId,"joined");
});
test("signed intersection rejects a removed branch and supports explicitly selecting the remaining branch",async()=>{
 await line();await apply({type:"create-drawing",id:"O",drawing:"circle",params:{center:[50,0,0],radius:30,workPlane:"XY"}});await apply({type:"create-construction",id:"P",workPlane:"XY",definition:{operation:"intersection",firstId:"source",secondId:"O",branch:"positive"}});
 await reject(command([route("P",{segmentIndex:0})]),/intersection.*positive/i);await apply(command([route("P",{segmentIndex:0,branch:"negative"})]));assert.deepEqual(feature("P").params.points,[[20,0,0]]);assert.equal((feature("P").construction as any).branch,"negative");
});
test("circle Break preserves exact radius dimension and analytic arc",async()=>{
 await apply({type:"create-drawing",id:"source",drawing:"circle",params:{center:[0,0,0],radius:10,workPlane:"XY"}});await apply({type:"create-dimension",id:"R",dimension:"radius",params:{sourceObjectId:"source",center:[0,0],radius:10,workPlane:"XY",offset:10}});
 const before=documentState(),r=await apply(command([route("R",{segmentIndex:0})],{firstPoint:[10,0,0],secondPoint:[0,10,0]}));assert.equal(exactDrawingContour(cadDocument.objects[r.createdIds[0]],feature(r.createdIds[0])).segments[0].radius,10);assert.ok(Math.abs(contourLength(exactDrawingContour(cadDocument.objects[r.createdIds[0]],feature(r.createdIds[0])))-15*Math.PI)<1e-6);assert.equal(feature("R").params.radius,10);roundtrip(before);
});
test("missing, extra, duplicate, ambiguous and nonexistent mappings fail without mutation",async()=>{
 await line();await dim();await reject(command(),/Reconnect every/);await reject(command([route("D"),route("D")]),/invalid/i);await reject(command([route("D",{resultIndices:[0,1]})]),/exactly one/);await reject(command([route("D",{resultIndices:[2]})]),/no longer exists/);await reject(command([route("D",{segmentIndex:99})]),/existing result edge/);await reject(command([route("D"),route("missing")]),/Stale or extra/);await reject(command([route("D")],{keepResultIndices:[]}),/invalid/i);await reject(command([route("D")],{firstPoint:[0,0,0],keepResultIndices:[1]}),/existing Break result/);
});
test("locked dependent and missing source fail atomically",async()=>{
 await line();await apply({type:"create-layer",id:"refs",name:"Refs"});await apply({type:"create-dimension",id:"D",layerId:"refs",dimension:"linear",params:{sourceObjectId:"source",points:[[0,0],[100,0]],workPlane:"XY",offset:10}});await apply({type:"set-layer-locked",layerId:"refs",locked:true});await reject(command([route("D")]),/Unlock/);await reject({...command(),objectId:"missing"},/standalone/);
});
test("sketch and pattern ownership remain explicit unsupported boundaries",async()=>{
 await apply({type:"create-sketch",id:"S",workPlane:"XY"});await apply({type:"add-sketch-geometry",sketchId:"S",geometry:{id:"source",kind:"line",start:[0,0],end:[100,0],startId:"a",endId:"b",segmentId:"edge"}});await reject(command(),/standalone drawings/);resetTestDocument();await line();await apply({type:"create-pattern",id:"pattern",sourceObjectIds:["source"],spec:{kind:"linear",workPlane:"XY",columns:2,rows:1,spacing:[20,0]}});await reject(command(),/sketch or pattern/);
});
test("stale reviewed Break cannot commit after an intervening edit",async()=>{
 await line();const p=await previewCadCommand(command());assert.ok(p.result.ok);await line("new");const before=documentState(),h=cadHistory.getPastLabels();const r=await applyCadPlan(p.planId);assert.equal(r.ok,false);assert.deepEqual(documentState(),before);assert.deepEqual(cadHistory.getPastLabels(),h);discardCadPlan(p.planId);
});

test("two angular slots on one polyline remap to different Break pieces and preserve the measured sector",async()=>{
 await apply({type:"create-drawing",id:"source",drawing:"polyline",params:{points:[[0,0,0],[100,0,0],[100,80,0]],workPlane:"XY"}});const t=feature("source").params.topology as any;
 await apply({type:"create-dimension",id:"A",dimension:"angular",params:{first:{objectId:"source",segmentId:t.segments[0].id},second:{objectId:"source",segmentId:t.segments[1].id},radius:10,branch:{firstRay:1,secondRay:1,sweep:"ccw"}}});
 const before=documentState();await reject(command([route("A",{referenceSlot:"first",segmentIndex:0})]),/Reconnect every/);
 const r=await apply(command([route("A",{referenceSlot:"first",segmentIndex:0}),route("A",{referenceSlot:"second",resultIndices:[1],segmentIndex:1})]));assert.equal((feature("A").params.first as any).objectId,r.createdIds[0]);assert.equal((feature("A").params.second as any).objectId,r.createdIds[1]);assert.deepEqual(feature("A").params.branch,{firstRay:1,secondRay:1,sweep:"ccw"});roundtrip(before);
});
test("hatch that loses its closed boundary and invalid live solid profile cannot leave orphan references",async()=>{
 await apply({type:"create-drawing",id:"source",drawing:"rectangle",params:{points:[[0,0,0],[100,0,0],[100,50,0],[0,50,0]],workPlane:"XY"}});await apply({type:"create-drafting",id:"H",params:{kind:"hatch",sourceObjectIds:["source"],spacing:5,angle:0,workPlane:"XY"}});await reject(command([route("H")]),/cannot hatch/);
 resetTestDocument();await apply({type:"create-drawing",id:"source",drawing:"rectangle",params:{points:[[0,0,0],[100,0,0],[100,50,0],[0,50,0]],workPlane:"XY"}});await apply({type:"create-extrude",id:"E",profileObjectIds:["source"],distance:10});await reject(command([route("E")]),/closed|profile/i);await apply({type:"create-artboard",id:"board",workPlane:"XY",origin:[0,0],size:[200,200]});await apply({type:"upsert-scene",scene:newScene("board",["source"])});await reject(command([route("E")]),/scene relationship/);
});
