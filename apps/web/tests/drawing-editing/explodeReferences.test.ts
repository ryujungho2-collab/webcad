import assert from "node:assert/strict";
import {beforeEach,test} from "node:test";
import {deserializeDocument,serializeDocument} from "@agent-webcad/cad-document";
import type {CadCommand,ContourReferenceRoute} from "@agent-webcad/cad-commands";
import {cadDocument} from "../../src/state/cadDocument";
import {cadHistory,undoDocument,redoDocument} from "../../src/state/history";
import {dispatchCadCommand} from "../../src/state/dispatchCadCommand";
import {previewCadCommand,applyCadPlan,discardCadPlan} from "../../src/state/documentPlans";
import {newScene} from "../../src/state/sceneCommands";
import {contourReferenceRequirements} from "../../src/features/drawing-editing/commands/contourReferences";
import {exactDrawingContour,contourLength} from "../../src/features/drawing-editing/geometry/contourEditing";
import {buildExtrudeMesh} from "../../src/cad/kernelGeometryService";
import {resetTestDocument,documentState,meshVolume} from "../helpers/documentHarness";
beforeEach(resetTestDocument);
const feature=(id:string)=>Object.values(cadDocument.features).find(f=>f.output===id)!;
const topology=(id:string)=>feature(id).params.topology as any;
async function apply(c:CadCommand){const r=await dispatchCadCommand(c);assert.ok(r.ok,r.reason);return r;}
async function reject(c:CadCommand,reason:RegExp){const before=JSON.stringify(cadDocument),h=cadHistory.getPastLabels();let r;try{r=await dispatchCadCommand(c);}catch(e){r={ok:false,reason:String(e)};}assert.equal(r.ok,false);assert.match(r.reason!,reason);assert.equal(JSON.stringify(cadDocument),before);assert.deepEqual(cadHistory.getPastLabels(),h);}
const route=(dependentId:string,extra:Partial<ContourReferenceRoute>={}):ContourReferenceRoute=>({dependentId,sourceId:"source",resultIndices:[0],...extra});
const explode=(referenceRoutes:ContourReferenceRoute[]=[]):CadCommand=>({type:"explode-drawings",objectIds:["source"],referenceRoutes});
async function outline(){await apply({type:"create-drawing",id:"source",drawing:"polyline",params:{workPlane:"XY",points:[[0,0,0],[80,0,0],[100,20,0],[100,60,0],[0,60,0]],bulges:[0,Math.tan(Math.PI/8),0,0,0],closed:true}});}
function roundtrip(before:ReturnType<typeof documentState>){const after=documentState();assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),after);assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)),cadDocument);}
async function dimensions(){await apply({type:"create-dimension",id:"D",dimension:"linear",params:{workPlane:"XY",points:[[0,0],[80,0]],sourceObjectId:"source",sourceSegmentId:topology("source").segments[0].id,offset:10}});await apply({type:"create-dimension",id:"R",dimension:"radius",params:{workPlane:"XY",center:[80,20],radius:20,sourceObjectId:"source",sourceSegmentId:topology("source").segments[1].id,offset:10}});await apply({type:"create-construction",id:"M",workPlane:"XY",definition:{operation:"midpoint",segmentId:"source",elements:{segment:{topologyId:topology("source").segments[0].id}}}});}
const elementRoutes=()=>[route("D",{segmentIndex:0}),route("R",{resultIndices:[1],segmentIndex:0}),route("M")];
const joinedRoutes=(ids:string[])=>contourReferenceRequirements(cadDocument,ids).map(r=>({dependentId:r.dependentId,sourceId:r.sourceId,...("referenceSlot" in r&&r.referenceSlot?{referenceSlot:r.referenceSlot}:{}),resultIndices:[0],...(r.kind==="dimension"?{segmentIndex:r.dimensionKind==="radius"?1:0}:r.kind==="construction"?{segmentIndex:0}:{})}));
test("mixed bulge Explode preserves edge IDs, exact radius, references, editing and Join roundtrip",async()=>{
 await outline();await dimensions();const edgeIds=topology("source").segments.map((s:any)=>s.id),before=documentState(),h=cadHistory.getPastLabels().length,p=await previewCadCommand(explode(elementRoutes()));assert.ok(p.result.ok,p.result.reason);assert.deepEqual(documentState(),before);
 const r=await applyCadPlan(p.planId);assert.ok(r.ok,r.reason);discardCadPlan(p.planId);const ids=r.createdIds;assert.equal(ids.length,5);assert.deepEqual(ids.map(id=>topology(id).segments[0]?.id??topology(id).curves[0].id),edgeIds);assert.equal(exactDrawingContour(cadDocument.objects[ids[1]],feature(ids[1])).segments[0].radius,20);assert.equal(feature("R").params.radius,20);assert.deepEqual(feature("M").params.points,[[40,0,0]]);assert.equal(cadHistory.getPastLabels().length,h+1);roundtrip(before);
 await apply({type:"batch",label:"Move exploded outline",commands:ids.map(objectId=>({type:"move-object",objectId,translation:[10,20,0]}))});assert.deepEqual(feature("M").params.points,[[50,20,0]]);const edited=documentState();await apply({type:"join-drawings",objectIds:ids,id:"joined",referenceRoutes:joinedRoutes(ids)});const path=exactDrawingContour(cadDocument.objects.joined,feature("joined"));assert.ok(path.closed);assert.ok(Math.abs(contourLength(path)-(280+10*Math.PI))<1e-6);assert.deepEqual(topology("joined").segments.map((s:any)=>s.id),edgeIds);assert.deepEqual(feature("M").params.points,[[50,20,0]]);roundtrip(edited);
});
test("whole exploded edge set keeps a live extrusion, coupled shared-vertex edits rebuild once, then Join restores one input",async()=>{
 await apply({type:"create-drawing",id:"source",drawing:"rectangle",params:{points:[[0,0,0],[100,0,0],[100,50,0],[0,50,0]],workPlane:"XY"}});await apply({type:"create-extrude",id:"E",profileObjectIds:["source"],distance:10});await reject(explode([route("E")]),/closed|loop/i);
 const before=documentState(),r=await apply(explode([route("E",{resultIndices:[0,1,2,3]})])),ids=r.createdIds;assert.deepEqual(feature("E").inputs,ids);assert.ok(Math.abs(meshVolume(await buildExtrudeMesh(feature("E").params,true))-50000)<.1);roundtrip(before);
 const edited=documentState();await apply({type:"batch",label:"Move shared corner",commands:[{type:"edit-drawing-control",objectId:ids[0],controlId:topology(ids[0]).controls[1].id,point:[120,0,0]},{type:"edit-drawing-control",objectId:ids[1],controlId:topology(ids[1]).controls[0].id,point:[120,0,0]}]});assert.ok(Math.abs(meshVolume(await buildExtrudeMesh(feature("E").params,true))-55000)<.1);roundtrip(edited);
 await apply({type:"join-drawings",objectIds:ids,id:"joined",referenceRoutes:joinedRoutes(ids)});assert.deepEqual(feature("E").inputs,["joined"]);assert.ok(Math.abs(meshVolume(await buildExtrudeMesh(feature("E").params,true))-55000)<.1);
});
test("scene identity, hidden states, links and tracks expand and deduplicate across Explode and Join",async()=>{
 await outline();await apply({type:"create-artboard",id:"board",workPlane:"XY",origin:[-50,-50],size:[300,200]});const scene=newScene("board",["source"]);scene.id="S";scene.states=[{id:"hide",name:"Hidden",hiddenObjectIds:["source"]}];scene.links=[{objectId:"source",targetSceneId:"S",targetStateId:"hide"}];scene.tracks=[{objectId:"source",startMs:0,endMs:1000,from:[0,0,1],to:[10,20,.5],easing:"linear"}];await apply({type:"upsert-scene",scene});
 const before=documentState(),r=await apply(explode([route("scene-reference:S",{resultIndices:[0,1,2,3,4]})])),ids=r.createdIds;const expanded=cadDocument.scenes!.S;assert.deepEqual(expanded.objectIds,ids);assert.deepEqual(expanded.states[0].hiddenObjectIds,ids);assert.equal(expanded.tracks.length,5);assert.equal(expanded.links.length,5);roundtrip(before);
 await apply({type:"join-drawings",objectIds:ids,id:"joined",referenceRoutes:joinedRoutes(ids)});assert.deepEqual(cadDocument.scenes!.S,{...scene,objectIds:["joined"],states:[{...scene.states[0],hiddenObjectIds:["joined"]}],links:[{...scene.links[0],objectId:"joined"}],tracks:[{...scene.tracks[0],objectId:"joined"}]});
});
test("scene behavior conflicts and locked artboards reject Join or Explode atomically",async()=>{
 await outline();await apply({type:"create-artboard",id:"board",workPlane:"XY",origin:[-50,-50],size:[300,200]});const scene=newScene("board",["source"]);scene.id="S";await apply({type:"upsert-scene",scene});await apply({type:"update-artboard",artboardId:"board",locked:true});await reject(explode([route("scene-reference:S",{resultIndices:[0,1,2,3,4]})]),/Unlock scene/);await apply({type:"update-artboard",artboardId:"board",locked:false});const ids=(await apply(explode([route("scene-reference:S",{resultIndices:[0,1,2,3,4]})]))).createdIds;
 const expanded=structuredClone(cadDocument.scenes!.S);expanded.states=[{id:"mixed",name:"Mixed",hiddenObjectIds:[ids[0]]}];await apply({type:"upsert-scene",scene:expanded});await reject({type:"join-drawings",objectIds:ids,referenceRoutes:joinedRoutes(ids)},/conflicting states/);
});
test("missing, duplicate, ambiguous, wrong-kind and locked reference mappings preserve the complete document",async()=>{
 await outline();await dimensions();await reject(explode(),/Reconnect every/);await reject(explode([...elementRoutes(),route("D")]),/Invalid/);await reject(explode(elementRoutes().map(r=>r.dependentId==="D"?{...r,resultIndices:[0,2]}:r)),/exactly one/);await reject(explode(elementRoutes().map(r=>r.dependentId==="R"?{...r,resultIndices:[0]}:r)),/circular edge/);await reject(explode(elementRoutes().map(r=>r.dependentId==="D"?{...r,resultIndices:[9]}:r)),/no longer exists/);await apply({type:"create-layer",id:"locked",name:"Locked"});await apply({type:"move-object-to-layer",objectId:"D",layerId:"locked"});await apply({type:"set-layer-locked",layerId:"locked",locked:true});await reject(explode(elementRoutes()),/Unlock/);
});
test("sketch projections, pattern relationships, partial hatch subsets and expression-driven source remain explicit boundaries",async()=>{
 await apply({type:"create-sketch",id:"S",workPlane:"XY"});await apply({type:"add-sketch-geometry",sketchId:"S",geometry:{id:"source",kind:"rectangle",origin:[0,0],width:100,height:50,cornerIds:["a","b","c","d"],edgeIds:["ab","bc","cd","da"]}});await reject(explode(),/ownership adapters/);resetTestDocument();await outline();await apply({type:"create-pattern",id:"P",sourceObjectIds:["source"],spec:{kind:"linear",columns:2,rows:1,spacing:[150,0],workPlane:"XY"}});await reject(explode(),/ownership adapters/);resetTestDocument();await outline();await apply({type:"create-drafting",id:"H",params:{kind:"hatch",sourceObjectIds:["source"],spacing:5,angle:0,workPlane:"XY"}});await reject(explode([route("H")]),/cannot hatch/);
});
test("stale Explode preview and invalid coupled edit leave history and scene/profile relations intact",async()=>{
 await outline();const p=await previewCadCommand(explode());assert.ok(p.result.ok);await apply({type:"rename-object",objectId:"source",name:"Changed"});const before=documentState(),h=cadHistory.getPastLabels();assert.equal((await applyCadPlan(p.planId)).ok,false);discardCadPlan(p.planId);assert.deepEqual(documentState(),before);assert.deepEqual(cadHistory.getPastLabels(),h);
});
