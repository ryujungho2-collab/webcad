import assert from "node:assert/strict";
import {test} from "node:test";
import * as THREE from "three";
import {createMeshCube,createPolygonMesh,upgradePolygonMesh,applyPolygonMeshOperation,validateEditableMesh,meshTriangles,meshEdges,buildMeshTopology,boundaryLoops,edgeKey,evaluateMeshModifiers,clearMeshEvaluationCache,meshEvaluationStats,transformMesh,type EditableMesh,type MeshModifier,type PolygonMeshOperation,serializeDocument,deserializeDocument} from "@agent-webcad/cad-document";
import {cadDocument} from "../src/state/cadDocument";
import {documentMesh} from "../src/state/meshCommands";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {previewCadCommand,applyCadPlan} from "../src/state/documentPlans";
import {undoDocument,redoDocument} from "../src/state/history";
import {resetTestDocument,documentState} from "./helpers/documentHarness";
import {createEditableMeshSceneObject,pickEditableMeshElement} from "../src/viewport/editableMeshRenderer";

const cc=(level=1,boundary:"smooth"|"fixed"="smooth",creaseEdges:string[]=[]):MeshModifier=>({id:"subdivision",type:"catmull-clark",enabled:true,level,boundary,creaseEdges});
const edit=(m:EditableMesh,operation:PolygonMeshOperation)=>applyPolygonMeshOperation(m,operation,"test");
const valid=(m:EditableMesh)=>{assert.equal(validateEditableMesh(m),true);assert.deepEqual(buildMeshTopology(m).diagnostics,[]);return m;};
test("Polygon topology derives manifold half edges and preserves triangle/quad/ngon boundaries",()=>{
 for(const m of [upgradePolygonMesh(createMeshCube(10)),createPolygonMesh(10),createPolygonMesh(10,"ngon",7)]){valid(m);assert.equal(meshTriangles(m).length,m.faces.reduce((n,f)=>n+f.vertices.length-2,0));const t=buildMeshTopology(m);for(const h of t.halfEdges.values()){assert.equal(t.halfEdges.get(h.next)!.previous,h.id);if(h.twin)assert.equal(t.halfEdges.get(h.twin)!.twin,h.id);}}
 const cube=createPolygonMesh(10);assert.equal(meshEdges(cube).length,12);assert.equal(boundaryLoops(cube).length,0);const ngon=createPolygonMesh(10,"ngon",7);assert.equal(boundaryLoops(ngon)[0].length,7);assert.equal(buildMeshTopology(ngon).boundary.length,7);
});
test("Polygon validation rejects winding, nonmanifold links, bow ties and degeneracy",()=>{
 const cube=createPolygonMesh(10);cube.faces[0].vertices.reverse();assert.equal(validateEditableMesh(cube),false);assert.match(buildMeshTopology(cube).diagnostics.join(),/winding/);
 const duplicate=createPolygonMesh(10);duplicate.faces.push({...duplicate.faces[0],id:"extra"});assert.equal(validateEditableMesh(duplicate),false);assert.match(buildMeshTopology(duplicate).diagnostics.join(),/Non-manifold/);
 const crossed=createPolygonMesh(10,"ngon",4);crossed.faces[0].vertices=["v0","v2","v1","v3"];assert.equal(validateEditableMesh(crossed),false);
 const flat=createPolygonMesh(10,"ngon",4);flat.vertices[1].position=[...flat.vertices[0].position];assert.equal(validateEditableMesh(flat),false);
});
test("multiple coplanar triangle extrusion shares new vertices and omits internal walls",()=>{
 const source=upgradePolygonMesh(createMeshCube(10)),before=structuredClone(source),next=valid(edit(source,{kind:"extrude",faceIds:["f2","f3"],distance:3}));assert.deepEqual(source,before);assert.equal(next.vertices.length,12);assert.equal(next.faces.length,16);assert.ok(meshEdges(next).every(e=>e.faceIds.length===2));assert.equal(next.topologyChange!.faces.f2.length,1);assert.equal(next.topologyChange!.generated.vertices.length,4);
 for(const m of [createPolygonMesh(10),createPolygonMesh(10,"ngon",7)])valid(edit(m,{kind:"extrude",faceIds:[m.faces[0].id],distance:2}));
 assert.throws(()=>edit(createPolygonMesh(10),{kind:"extrude",faceIds:["f0","f1"],distance:1}),/coplanar/);
});
test("individual inset creates true constant-distance planar rims for triangles, quads and ngons",()=>{
 for(const source of [upgradePolygonMesh(createMeshCube(10)),createPolygonMesh(10),createPolygonMesh(10,"ngon",7)]){const f=source.faces[0],next=valid(edit(source,{kind:"inset",faceIds:[f.id],distance:1}));assert.equal(next.faces.length,source.faces.length+f.vertices.length);assert.equal(next.topologyChange!.faces[f.id].length,f.vertices.length+1);}
 const next=edit(createPolygonMesh(10),{kind:"inset",faceIds:["f1"],distance:1});const points=next.vertices.filter(v=>next.edit.ids.some(id=>next.faces.find(f=>f.id===id)!.vertices.includes(v.id)));assert.deepEqual(points.map(v=>v.position).sort(),[[1,1,10],[1,9,10],[9,1,10],[9,9,10]].sort());
 assert.throws(()=>edit(createPolygonMesh(10),{kind:"inset",faceIds:["f0"],distance:6}),/collapses/);
});
test("convex trivalent bevel produces a closed surface and explicit split references",()=>{
 const source=createPolygonMesh(10),edge=edgeKey("v0","v1"),next=valid(edit(source,{kind:"bevel",edgeId:edge,distance:1}));assert.equal(next.vertices.length,10);assert.equal(next.faces.length,7);assert.ok(meshEdges(next).every(e=>e.faceIds.length===2));assert.equal(next.topologyChange!.vertices.v0.length,2);assert.equal(next.topologyChange!.edges[edge].length,2);assert.throws(()=>edit(source,{kind:"bevel",edgeId:edge,distance:6}),/half/);
});
test("bridge joins two complete boundary loops and rejects partial selection",()=>{
 const m=createPolygonMesh(10);m.faces=m.faces.filter(f=>["f0","f1"].includes(f.id));valid(m);const edges=meshEdges(m).map(e=>e.id),next=valid(edit(m,{kind:"bridge",edgeIds:edges,offset:0}));assert.equal(next.faces.length,6);assert.equal(boundaryLoops(next).length,0);assert.throws(()=>edit(m,{kind:"bridge",edgeIds:edges.slice(1),offset:0}),/complete loop/);
});
test("quad ring Loop Cut preserves winding, propagates factor and maps split edges",()=>{
 const m=createPolygonMesh(10),edge=edgeKey("v0","v1"),next=valid(edit(m,{kind:"loop-cut",edgeId:edge,factor:.3}));assert.equal(next.vertices.length,12);assert.equal(next.faces.length,10);assert.ok(meshEdges(next).every(e=>e.faceIds.length===2));assert.equal(next.topologyChange!.edges[edge].length,2);assert.ok(next.vertices.filter(v=>v.id.startsWith("test")).every(v=>Math.abs(v.position[0]-3)<1e-8));assert.throws(()=>edit(upgradePolygonMesh(createMeshCube(10)),{kind:"loop-cut",edgeId:edge,factor:.5}),/non-quad/);
});
test("merge, dissolve and delete retain surviving IDs and declare losses",()=>{
 const cube=createPolygonMesh(10),merged=valid(edit(cube,{kind:"merge",vertexIds:["v0","v1"]}));assert.equal(merged.vertices.length,7);assert.deepEqual(merged.topologyChange!.vertices.v1,["v0"]);
 const triangles=upgradePolygonMesh(createMeshCube(10)),diagonal=meshEdges(triangles).find(e=>e.faceIds.includes("f2")&&e.faceIds.includes("f3"))!;const dissolved=valid(edit(triangles,{kind:"dissolve",edgeId:diagonal.id}));assert.equal(dissolved.faces.length,11);assert.deepEqual(dissolved.topologyChange!.edges[diagonal.id],[]);assert.equal(dissolved.faces.find(f=>f.id===dissolved.edit.ids[0])!.vertices.length,4);
 for(const mode of ["face","edge","vertex"] as const){const id=mode==="face"?"f0":mode==="edge"?edgeKey("v0","v1"):"v0";const deleted=valid(edit(cube,{kind:"delete",mode,elementIds:[id]}));assert.ok(deleted.faces.length<6);assert.ok(boundaryLoops(deleted).length>0);}
 assert.throws(()=>edit(cube,{kind:"delete",mode:"face",elementIds:cube.faces.map(f=>f.id)}),/entire surface/);
});
test("Catmull–Clark cube matches analytic vertex positions and convex stencils",()=>{
 const source=createPolygonMesh(10);source.modifiers=[cc()];const before=structuredClone(source),result=evaluateMeshModifiers(source);assert.deepEqual(source,before);assert.equal(result.mesh.vertices.length,26);assert.equal(result.mesh.faces.length,24);valid(result.mesh);assert.ok(result.mesh.vertices.some(v=>v.position.every(n=>Math.abs(n-20/9)<1e-9)));
 for(const v of result.mesh.vertices){const weights=result.vertexStencils[v.id];assert.ok(Math.abs(weights.reduce((sum,w)=>sum+w.weight,0)-1)<1e-10);for(let axis=0;axis<3;axis++)assert.ok(Math.abs(v.position[axis]-weights.reduce((sum,w)=>sum+source.vertices.find(s=>s.id===w.id)!.position[axis]*w.weight,0))<1e-9);}
 assert.equal(new Set(Object.values(result.faceSources)).size,6);assert.ok(Object.values(result.edgeSources).includes(null));source.modifiers=[cc(2)];assert.equal(evaluateMeshModifiers(source).mesh.faces.length,96);
});
test("boundary rules and infinitely sharp crease edges are evaluated, not metadata only",()=>{
 const m=createPolygonMesh(10,"ngon",4);m.modifiers=[cc(1,"fixed")];const fixed=evaluateMeshModifiers(m);for(const v of m.vertices)assert.ok(fixed.mesh.vertices.some(p=>p.position.every((x,i)=>Math.abs(x-v.position[i])<1e-9)));m.modifiers=[cc()];const smooth=evaluateMeshModifiers(m);assert.ok(Math.max(...smooth.mesh.vertices.map(v=>v.position[0]))<10);
 const cube=createPolygonMesh(10);cube.modifiers=[cc(2,"smooth",meshEdges(cube).map(e=>e.id))];const sharp=evaluateMeshModifiers(cube);for(const v of cube.vertices)assert.ok(sharp.mesh.vertices.some(p=>p.position.every((x,i)=>x===v.position[i])));
});
test("modifier cache is detached, ignores selection, invalidates geometry/stack and never caches failure",()=>{
 clearMeshEvaluationCache();const m=createPolygonMesh(10);m.modifiers=[cc()];const a=evaluateMeshModifiers(m);a.mesh.vertices[0].position=[999,999,999];m.edit={enabled:true,mode:"face",ids:["f0"]};const b=evaluateMeshModifiers(m);assert.notEqual(b.mesh.vertices[0].position[0],999);assert.equal(meshEvaluationStats().hits,1);const moved=transformMesh(m,"vertex",m.vertices.map(v=>v.id),"move",[0,0,1]);evaluateMeshModifiers(moved);assert.equal(meshEvaluationStats().evaluations,2);m.modifiers=[cc(3),{...cc(3),id:"more"}];const before=structuredClone(m),count=meshEvaluationStats().evaluations;assert.throws(()=>evaluateMeshModifiers(m),/budget/);assert.deepEqual(m,before);assert.equal(meshEvaluationStats().evaluations,count);
});
test("Polygon commands preview atomically, persist v57 provenance and restore control, selection and modifiers with history",async()=>{
 resetTestDocument();assert.equal((await dispatchCadCommand({type:"create-polygon-mesh",id:"poly",shape:"cube",size:10})).ok,true);const before=documentState();const review=await previewCadCommand({type:"edit-polygon-mesh",objectId:"poly",operation:{kind:"inset",faceIds:["f1"],distance:1}});assert.equal(review.result.ok,true,review.result.reason);assert.deepEqual(documentState(),before);assert.equal((await applyCadPlan(review.planId)).ok,true);const after=documentState();undoDocument();assert.deepEqual(documentState(),before);redoDocument();assert.deepEqual(documentState(),after);
 assert.equal((await dispatchCadCommand({type:"set-mesh-modifiers",objectId:"poly",modifiers:[cc()]})).ok,true);const saved=serializeDocument(cadDocument);assert.equal(JSON.parse(saved).version,57);assert.deepEqual(documentMesh(deserializeDocument(saved),"poly"),documentMesh(cadDocument,"poly"));const checkpoint=documentState();const bad=await dispatchCadCommand({type:"batch",commands:[{type:"set-mesh-modifiers",objectId:"poly",modifiers:[]},{type:"edit-polygon-mesh",objectId:"poly",operation:{kind:"inset",faceIds:["missing"],distance:1}}]});assert.equal(bad.ok,false);assert.deepEqual(documentState(),checkpoint);const failed=await dispatchCadCommand({type:"set-mesh-modifiers",objectId:"poly",modifiers:[cc(3),{...cc(3),id:"over"}]});assert.equal(failed.ok,false);assert.deepEqual(documentState(),checkpoint);
});
test("legacy v55 remains triangle-editable; only explicit upgrade writes v56",async()=>{
 resetTestDocument();await dispatchCadCommand({type:"create-mesh",id:"old",size:10});const v55=serializeDocument(cadDocument);assert.equal(JSON.parse(v55).version,55);assert.equal(documentMesh(deserializeDocument(v55),"old")!.version,1);assert.equal((await dispatchCadCommand({type:"upgrade-mesh",objectId:"old"})).ok,true);assert.equal(documentMesh(cadDocument,"old")!.faces.length,12);const upgraded=JSON.parse(serializeDocument(cadDocument));assert.equal(upgraded.version,56);upgraded.version=55;assert.throws(()=>deserializeDocument(JSON.stringify(upgraded)),/version 56/);undoDocument();assert.equal(documentMesh(cadDocument,"old")!.version,1);
});
test("concave N-gon triangulates with preserved area and one selectable face, no editable diagonals",()=>{
 const m:EditableMesh={version:2,vertices:[[0,0,0],[2,0,0],[2,1,0],[1,1,0],[1,2,0],[0,2,0]].map((position,i)=>({id:`v${i}`,position:position as [number,number,number]})),faces:[{id:"L",vertices:["v0","v1","v2","v3","v4","v5"]}],edit:{enabled:true,mode:"face",ids:[]}};valid(m);const positions=new Map(m.vertices.map(v=>[v.id,v.position]));const area=meshTriangles(m).reduce((sum,t)=>{const [a,b,c]=t.vertices.map(id=>positions.get(id)!);return sum+((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2;},0);assert.equal(area,3);assert.equal(meshEdges(m).length,6);
 const root=createEditableMeshSceneObject("L",m),camera=new THREE.OrthographicCamera(-2,2,2,-2,.1,100);camera.position.set(1,1,10);camera.lookAt(1,1,0);camera.updateMatrixWorld();root.updateMatrixWorld(true);const ray=new THREE.Raycaster();for(const point of [new THREE.Vector2(-.25,0),new THREE.Vector2(.25,-.25)]){ray.setFromCamera(point,camera);const hit=ray.intersectObject(root,true).find(h=>h.object.userData.meshSurface)!;assert.ok(hit);assert.equal(pickEditableMeshElement(m,root,hit,camera,{x:0,y:0},{width:200,height:200}),"L");}
 assert.throws(()=>edit(m,{kind:"inset",faceIds:["L"],distance:.1}),/strictly convex/);
});
test("v55 rendering retains legacy thin-triangle tolerance without silently applying Polygon ear-clipping rules",()=>{
 const legacy:EditableMesh={version:1,vertices:[{id:"a",position:[0,0,0]},{id:"b",position:[1e6,0,0]},{id:"c",position:[0,1e-8,0]}],faces:[{id:"thin",vertices:["a","b","c"]}],edit:{enabled:false,mode:"face",ids:[]}};assert.equal(validateEditableMesh(legacy),true);assert.deepEqual(meshTriangles(legacy)[0].vertices,["a","b","c"]);const root=createEditableMeshSceneObject("legacy",legacy);assert.equal((root.children[0] as THREE.Mesh).geometry.getAttribute("position").count,3);
});
test("lineage propagates sharp edge splits and refuses unresolvable crease deletion",()=>{
 const source=createPolygonMesh(10),edge=edgeKey("v0","v1");source.modifiers=[cc(1,"smooth",[edge])];const extruded=valid(edit(source,{kind:"extrude",faceIds:["f0"],distance:2}));assert.equal(extruded.topologyChange!.edges[edge].length,2);assert.deepEqual(extruded.modifiers![0].creaseEdges,extruded.topologyChange!.edges[edge]);valid(evaluateMeshModifiers(extruded).mesh);
 const cut=valid(edit(source,{kind:"loop-cut",edgeId:edge,factor:.4}));assert.deepEqual(cut.modifiers![0].creaseEdges,cut.topologyChange!.edges[edge]);const before=structuredClone(source);assert.throws(()=>edit(source,{kind:"delete",mode:"vertex",elementIds:["v0"]}),/crease reference/);assert.deepEqual(source,before);
});
test("modifier order changes evaluation, disabled entries are no-ops and triangles/ngons refine to quads",()=>{
 const source=createPolygonMesh(10,"ngon",4),fixed={...cc(1,"fixed"),id:"fixed"},smooth=cc();source.modifiers=[fixed,smooth];const a=evaluateMeshModifiers(source);source.modifiers=[smooth,fixed];const b=evaluateMeshModifiers(source);assert.notDeepEqual(a.mesh.vertices,b.mesh.vertices);assert.equal(a.mesh.faces.length,16);source.modifiers=[{...fixed,enabled:false},smooth];const disabled=evaluateMeshModifiers(source);source.modifiers=[smooth];assert.deepEqual(evaluateMeshModifiers(source).mesh,disabled.mesh);
 for(const m of [upgradePolygonMesh(createMeshCube(10)),createPolygonMesh(10,"ngon",7)]){m.modifiers=[cc(2)];const result=evaluateMeshModifiers(m);valid(result.mesh);assert.ok(result.mesh.faces.every(f=>f.vertices.length===4));assert.equal(result.mesh.faces.length,m.faces.reduce((n,f)=>n+f.vertices.length,0)*4);}
});
test("malformed Polygon metadata, stacks and deserialized evaluation cannot bypass validation",async()=>{
 const edited=edit(createPolygonMesh(10),{kind:"inset",faceIds:["f1"],distance:1});for(const change of [null,{...edited.topologyChange,operation:"unknown"},{...edited.topologyChange,faces:{f1:["missing"]}},{...edited.topologyChange,generated:{...edited.topologyChange!.generated,vertices:["v0","v0"]}}])assert.equal(validateEditableMesh({...edited,topologyChange:change}),false);
 resetTestDocument();await dispatchCadCommand({type:"create-polygon-mesh",id:"poly",shape:"cube",size:10});const saved=JSON.parse(serializeDocument(cadDocument));for(const modifiers of [[{...cc(),type:"unimplemented"}],[{...cc(),creaseEdges:["missing"]}],[cc(3),{...cc(3),id:"budget"}]]){saved.document.features["feature-poly"].params.mesh.modifiers=modifiers;assert.throws(()=>deserializeDocument(JSON.stringify(saved)));}
 const invalid:PolygonMeshOperation[]=[{kind:"extrude",faceIds:["f0","f1"],distance:1},{kind:"inset",faceIds:["f0"],distance:20},{kind:"bevel",edgeId:edgeKey("v0","v1"),distance:9},{kind:"bridge",edgeIds:[edgeKey("v0","v1")],offset:0},{kind:"loop-cut",edgeId:"missing",factor:.5},{kind:"merge",vertexIds:["v0","v6"]},{kind:"dissolve",edgeId:edgeKey("v0","v1")},{kind:"delete",mode:"face",elementIds:["f0","f1","f2","f3","f4","f5"]}];
 for(const operation of invalid){const before=documentState(),result=await dispatchCadCommand({type:"edit-polygon-mesh",objectId:"poly",operation});assert.equal(result.ok,false,operation.kind);assert.ok(result.reason);assert.deepEqual(documentState(),before,operation.kind);}
});
