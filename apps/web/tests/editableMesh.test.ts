import assert from "node:assert/strict";
import {test} from "node:test";
import * as THREE from "three";
import {createMeshCube,meshEdges,meshElementIds,extrudeMeshFace,transformMesh,validateEditableMesh,serializeDocument,deserializeDocument,geometryOwnership,geometryConversionSupport} from "@agent-webcad/cad-document";
import {cadDocument} from "../src/state/cadDocument";
import {documentMesh} from "../src/state/meshCommands";
import {dispatchCadCommand,prepareCadCommand} from "../src/state/dispatchCadCommand";
import {previewCadCommand,applyCadPlan} from "../src/state/documentPlans";
import {undoDocument,redoDocument,cadHistory} from "../src/state/history";
import {measureDocumentObject} from "../src/state/documentQuery";
import {getObjectWorldBounds} from "../src/precision/worldBounds";
import {createCadToolSession} from "../src/copilot/cadToolSession";
import {planCadModelingTools} from "../src/copilot/cadModelingTools";
import {createEditableMeshSceneObject,pickEditableMeshElement} from "../src/viewport/editableMeshRenderer";
import {resetTestDocument,documentState} from "./helpers/documentHarness";

const mesh=()=>documentMesh(cadDocument,"editable")!;
const context=(selected=true)=>({document:cadDocument,selectionIds:selected?["editable"]:[],layerId:"layer-default",workPlane:"XY" as const});
async function create(){resetTestDocument();assert.equal((await dispatchCadCommand({type:"create-mesh",id:"editable",size:10})).ok,true);}
test("cube has oriented manifold topology and independent render buffers",()=>{
 const m=createMeshCube(10);assert.equal(validateEditableMesh(m),true);assert.equal(m.vertices.length,8);assert.equal(m.faces.length,12);assert.equal(meshEdges(m).length,18);assert.ok(meshEdges(m).every(e=>e.faceIds.length===2));
 const renderer=createEditableMeshSceneObject("test",m);const surface=renderer.children[0] as THREE.Mesh;assert.equal(surface.geometry.getAttribute("position").count,36);surface.geometry.getAttribute("position").setX(0,999);assert.equal(m.vertices[0].position[0],0);
});
test("validator rejects dangling, duplicate, degenerate, nonfinite, winding and bow-tie topology",()=>{
 for(const damage of [(m:ReturnType<typeof createMeshCube>)=>{m.faces[0].vertices[0]="missing";},m=>{m.faces[1].id=m.faces[0].id;},m=>{m.vertices[0].position=[NaN,0,0];},m=>{m.vertices[1].position=[0,0,0];},m=>{m.faces[0].vertices.reverse();},m=>{m.edit.ids=["missing"];}] as ((m:ReturnType<typeof createMeshCube>)=>void)[]){const m=createMeshCube(10);damage(m);assert.equal(validateEditableMesh(m),false);}
 const bow={version:1,vertices:[{id:"a",position:[0,0,0]},{id:"b",position:[1,0,0]},{id:"c",position:[0,1,0]},{id:"d",position:[-1,0,0]},{id:"e",position:[0,-1,0]}],faces:[{id:"one",vertices:["a","b","c"]},{id:"two",vertices:["a","d","e"]}],edit:{enabled:false,mode:"face",ids:[]}};assert.equal(validateEditableMesh(bow),false);
});
test("vertex, edge and face transforms preserve IDs and use each selected vertex once",()=>{
 const original=createMeshCube(10);
 for(const mode of ["vertex","edge","face"] as const){const id=meshElementIds(original,mode)[0],next=transformMesh(original,mode,[id],"move",[0,0,2]);assert.deepEqual(next.vertices.map(v=>v.id),original.vertices.map(v=>v.id));assert.deepEqual(next.faces,original.faces);assert.deepEqual(meshEdges(next).map(e=>e.id),meshEdges(original).map(e=>e.id));assert.ok(next.vertices.some((v,i)=>v.position[2]!==original.vertices[i].position[2]));assert.equal(validateEditableMesh(next),true);}
 const scaled=transformMesh(original,"vertex",original.vertices.map(v=>v.id),"scale",[2,3,4],[5,5,5]);assert.deepEqual(scaled.vertices[0].position,[-5,-10,-15]);assert.deepEqual(original.vertices[0].position,[0,0,0]);
 assert.throws(()=>transformMesh(original,"vertex",["v0"],"move",[10,0,0]),/degenerate/);
});
test("face extrusion keeps a closed oriented manifold and explicit old-to-new lineage",()=>{
 const original=createMeshCube(10),next=extrudeMeshFace(original,"f2",5,"test");assert.equal(validateEditableMesh(next),true);assert.equal(next.vertices.length,11);assert.equal(next.faces.length,18);assert.equal(next.faces.some(f=>f.id==="f2"),false);assert.equal(next.lastTopologyChange?.sourceFaceId,"f2");assert.equal(next.lastTopologyChange?.generatedFaceIds.length,7);assert.ok(meshEdges(next).every(e=>e.faceIds.length===2));assert.deepEqual(next.edit.ids,["test_cap"]);assert.equal(next.vertices.find(v=>v.id==="test_v0")!.position[2],15);
 assert.equal(validateEditableMesh(extrudeMeshFace(next,"test_cap",2,"again")),true);
});
test("shared preview/apply, history and v55 roundtrip keep mesh edit state and BRep",async()=>{
 await create();assert.equal((await dispatchCadCommand({type:"create-primitive",id:"solid",primitive:"box",params:{width:3,depth:4,height:5},position:[30,0,0]})).ok,true);
 await dispatchCadCommand({type:"select-mesh-elements",objectId:"editable",enabled:true,mode:"face",elementIds:["f2"]});
 const before=documentState(),history=cadHistory.getPastLabels().length,preview=await previewCadCommand({type:"extrude-mesh-face",objectId:"editable",faceId:"f2",distance:5});assert.equal(preview.result.ok,true);assert.deepEqual(documentState(),before);assert.equal(preview.changes.find(c=>c.objectId==="editable")?.after?.basis,"mesh");
 assert.equal((await applyCadPlan(preview.planId)).ok,true);const after=documentState();assert.equal(cadHistory.getPastLabels().length,history+1);await applyCadPlan(preview.planId);assert.equal(cadHistory.getPastLabels().length,history+1);
 undoDocument();assert.deepEqual(documentState(),before);redoDocument();assert.deepEqual(documentState(),after);
 const serialized=serializeDocument(cadDocument);assert.equal(JSON.parse(serialized).version,55);const loaded=deserializeDocument(serialized);assert.deepEqual(documentMesh(loaded,"editable"),mesh());assert.deepEqual(loaded.features["feature-solid"],cadDocument.features["feature-solid"]);
 const old=JSON.parse(serialized);old.version=54;assert.throws(()=>deserializeDocument(JSON.stringify(old)),/version 55/);
 const corrupt=JSON.parse(serialized);corrupt.document.features["feature-editable"].params.mesh.faces[0].vertices[0]="missing";assert.throws(()=>deserializeDocument(JSON.stringify(corrupt)));
 assert.ok(Math.abs((await measureDocumentObject(cadDocument,"solid")).volume!-60)<1e-8);assert.equal(geometryOwnership(cadDocument.features["feature-editable"]).representation,"polygon-mesh");assert.equal(geometryConversionSupport("polygon-mesh","brep").supported,false);
});
test("failed batch, stale review, locked layer and wrong representation cannot mutate",async()=>{
 await create();const before=documentState();
 const result=await dispatchCadCommand({type:"batch",commands:[{type:"transform-mesh-elements",objectId:"editable",mode:"vertex",elementIds:["v0"],operation:"move",value:[0,0,1]},{type:"extrude-mesh-face",objectId:"editable",faceId:"missing",distance:5}]});assert.equal(result.ok,false);assert.deepEqual(documentState(),before);
 const preview=await previewCadCommand({type:"extrude-mesh-face",objectId:"editable",faceId:"f2",distance:5});await dispatchCadCommand({type:"rename-object",objectId:"editable",name:"changed"});assert.equal((await applyCadPlan(preview.planId)).ok,false);
 cadDocument.layers["layer-default"].locked=true;const locked=documentState();assert.equal((await dispatchCadCommand({type:"extrude-mesh-face",objectId:"editable",faceId:"f2",distance:5})).ok,false);assert.deepEqual(documentState(),locked);
 cadDocument.layers["layer-default"].locked=false;assert.equal((await prepareCadCommand(cadDocument,{type:"fillet",target:"editable",edges:["edge"],radius:1})).result.ok,false);
});
test("world measurements and bounds follow object placement, never BRep fallback",async()=>{
 await create();cadDocument.objects.editable.transform={translation:[100,20,0],rotation:[0,0,0],scale:[2,2,2]};const measured=await measureDocumentObject(cadDocument,"editable");assert.equal(measured.basis,"mesh");assert.equal(measured.area,2400);assert.equal(measured.volume,undefined);assert.deepEqual(measured.bounds,{min:[100,20,0],max:[120,40,20]});assert.deepEqual(getObjectWorldBounds(cadDocument,"editable"),measured.bounds);
});
test("mesh tools provide bounded topology reads and compile selected edits into shared validation",async()=>{
 await create();const session=createCadToolSession(context()),read=await session.read({id:"read",name:"mesh.inspect",arguments:{objectId:"editable",mode:"vertex",limit:3}});assert.equal(read.ok,true);const data=read.result as {elements:unknown[];nextOffset:number};assert.equal(data.elements.length,3);assert.equal(data.nextOffset,3);
 const calls=[{id:"edit",name:"mesh.extrude",arguments:{objectId:"editable",faceId:"f2",distance:5}}];await assert.rejects(()=>planCadModelingTools(calls,context(false)),/Select/);
 const plan=await planCadModelingTools(calls,context());assert.equal(plan.command.type,"extrude-mesh-face");assert.equal((await dispatchCadCommand(plan.command)).ok,true);assert.equal(mesh().faces.length,18);await assert.rejects(()=>session.read({id:"stale",name:"mesh.inspect",arguments:{objectId:"editable",mode:"face"}}),/context changed/);
});
test("viewport picking maps triangle, edge and vertex hits back to persistent IDs",()=>{
 const m=createMeshCube(10),root=createEditableMeshSceneObject("mesh",m),camera=new THREE.OrthographicCamera(-10,10,10,-10,.1,100);camera.position.set(5,5,30);camera.lookAt(5,5,0);camera.updateMatrixWorld();root.updateMatrixWorld(true);const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(0,0),camera);const hit=ray.intersectObjects([root],true).find(h=>h.object.userData.meshSurface)!;assert.ok(hit);m.edit.mode="face";assert.equal(pickEditableMeshElement(m,root,hit,camera,{x:100,y:100},{width:200,height:200}),m.faces[hit.faceIndex!].id);
 const face=m.faces[hit.faceIndex!],v=m.vertices.find(v=>v.id===face.vertices[0])!,p=new THREE.Vector3(...v.position).project(camera);m.edit.mode="vertex";assert.equal(pickEditableMeshElement(m,root,hit,camera,{x:(p.x+1)*100,y:(1-p.y)*100},{width:200,height:200}),v.id);m.edit.mode="edge";const edge=meshEdges(m).find(e=>e.faceIds.includes(face.id))!,a=m.vertices.find(v=>v.id===edge.vertices[0])!.position,b=m.vertices.find(v=>v.id===edge.vertices[1])!.position,mid=new THREE.Vector3(...a).add(new THREE.Vector3(...b)).multiplyScalar(.5).project(camera);assert.equal(pickEditableMeshElement(m,root,hit,camera,{x:(mid.x+1)*100,y:(1-mid.y)*100},{width:200,height:200}),edge.id);
 const stale=extrudeMeshFace(m,m.faces[hit.faceIndex!].id,2,"pending");assert.equal(pickEditableMeshElement(stale,root,hit,camera,{x:100,y:100},{width:200,height:200}),null,"A render buffer from an older source must not resolve current topology");
});
