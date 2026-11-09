import test from "node:test";
import assert from "node:assert/strict";
import {createPolygonMesh,createGeometryGraph,serializeDocument,deserializeDocument,validateEditableMesh,meshEdges,meshTriangles,remeshMesh,type MeshVector} from "@agent-webcad/cad-document";
import {cadDocument} from "../src/state/cadDocument";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {previewCadCommand,applyCadPlan,discardCadPlan,getCadPlanFrameDocument} from "../src/state/documentPlans";
import {undoDocument,redoDocument} from "../src/state/history";
import {captureHybridReference,resolveHybridReference,hybridSource,assertHybridFeatureResolved} from "../src/state/hybridReferences";
import {editableFromPlanarBrep} from "../src/state/hybridCommands";
import {documentMesh} from "../src/state/meshCommands";
import {buildExtrudeMesh,buildPrimitiveMesh,inspectSolid} from "../src/cad/kernelGeometryService";
import {planCadModelingTools} from "../src/copilot/cadModelingTools";
import {createCadToolSession} from "../src/copilot/cadToolSession";
import {assertResolvedFaceSource} from "../src/export/exportModel";
import {resetTestDocument,documentState,meshVolume} from "./helpers/documentHarness";
const ray={origin:[3,4,30] as MeshVector,direction:[0,0,-1] as MeshVector};
const reference=()=>({type:"hybrid-reference" as const,objectId:"cube",referenceId:"datum",...ray});
const datum=()=>({type:"hybrid-datum" as const,referenceId:"datum",id:"prism",width:4,depth:6,height:5});
async function run(command:Parameters<typeof dispatchCadCommand>[0]){const r=await dispatchCadCommand(command);assert.equal(r.ok,true,r.reason);return r;}
async function setup(){resetTestDocument();await run({type:"create-polygon-mesh",id:"cube",size:10,shape:"cube"});}
test("surface ray captures material coordinates and document identity without guessed face mapping",async()=>{
 await setup();const r=captureHybridReference(cadDocument,"cube",ray.origin,ray.direction),resolved=resolveHybridReference(cadDocument,r);assert.ok("frame" in resolved);assert.ok(Math.hypot(...resolved.frame.origin.map((n,i)=>n-[3,4,10][i]))<1e-9);assert.deepEqual(resolved.frame.normal,[0,0,1]);assert.equal(r.barycentric.reduce((a,b)=>a+b),1);assert.equal(r.triangle.length,3);assert.equal(resolveHybridReference({...cadDocument,id:"another"},r).status,"invalid");assert.throws(()=>captureHybridReference(cadDocument,"cube",[30,30,30],[0,0,-1]),/missed/);assert.throws(()=>captureHybridReference(cadDocument,"cube",ray.origin,ray.direction,"0".repeat(16)),/stale/);
});
test("review/cancel then exact datum prism preserves source and creates a real OpenCascade solid",async()=>{
 await setup();const before=documentState(),p=await previewCadCommand(reference());assert.ok(p.result.ok,p.result.reason);assert.deepEqual(documentState(),before);assert.ok(getCadPlanFrameDocument(p.planId)!.workPlanes!.datum.hybrid);discardCadPlan(p.planId);assert.deepEqual(documentState(),before);
 await run(reference());const plan=await previewCadCommand(datum());assert.ok(plan.result.ok,plan.result.reason);assert.equal(cadDocument.objects.prism,undefined);assert.ok((await applyCadPlan(plan.planId)).ok);const f=cadDocument.features["feature-prism"],mesh=await buildExtrudeMesh(f.params,true);assert.ok(Math.abs(meshVolume(mesh)-120)<1e-7);const measure=await inspectSolid({params:f.params});assert.equal(measure.validity,"valid");assert.equal(measure.basis,"brep");assert.ok(Math.abs(measure.volume!-120)<1e-7);assert.deepEqual(documentMesh(cadDocument,"cube"),documentMesh(before,"cube"));assert.deepEqual(f.inputs,["cube"]);
});
test("source deformation and transformed placement regenerate the datum and exact dimensions atomically",async()=>{
 await setup();await run(reference());await run(datum());const original=structuredClone(cadDocument.features["feature-prism"].params.profile);
 await run({type:"sculpt-stroke",objectId:"cube",stroke:{brush:"grab",radius:20,strength:.2,falloff:"smooth",spacing:.15,symmetry:false,samples:[{...ray,delta:[0,0,2]}]}});
 assert.notDeepEqual(cadDocument.features["feature-prism"].params.profile,original);assert.equal(resolveHybridReference(cadDocument,cadDocument.workPlanes!.datum.hybrid!).status,"updated");assert.doesNotThrow(()=>assertHybridFeatureResolved(cadDocument,"prism"));assert.ok(Math.abs(meshVolume(await buildExtrudeMesh(cadDocument.features["feature-prism"].params,true))-120)<1e-7);
 const state=documentState();undoDocument();assert.deepEqual(cadDocument.features["feature-prism"].params.profile,original);redoDocument();assert.deepEqual(documentState(),state);
});
test("topology edits invalidate references, retain last shape and block export/use; explicit reselect repairs",async()=>{
 await setup();await run(reference());await run(datum());const profile=structuredClone(cadDocument.features["feature-prism"].params.profile);
 await run({type:"edit-polygon-mesh",objectId:"cube",operation:{kind:"extrude",faceIds:["f1"],distance:2}} as any);
 assert.equal(resolveHybridReference(cadDocument,cadDocument.workPlanes!.datum.hybrid!).status,"unresolved");assert.deepEqual(cadDocument.features["feature-prism"].params.profile,profile);assert.throws(()=>assertResolvedFaceSource(cadDocument.features["feature-prism"],cadDocument),/unresolved|stale/);
 const bad=await dispatchCadCommand({type:"hybrid-to-mesh",objectId:"prism"});assert.equal(bad.ok,false);
 await run(reference());assert.doesNotThrow(()=>assertHybridFeatureResolved(cadDocument,"prism"));
});
test("Remesh/Bake do not steal source references and identity/provenance replacement is rejected",async()=>{
 await setup();await run(reference());const r=structuredClone(cadDocument.workPlanes!.datum.hybrid!);await run({type:"remesh-mesh",objectId:"cube",id:"remesh",options:{method:"surface",iterations:1,relaxation:0}});assert.equal(resolveHybridReference(cadDocument,r).status,"valid");assert.equal(resolveHybridReference(cadDocument,{...r,objectId:"remesh"}).status,"invalid");
 const replaced=structuredClone(cadDocument);replaced.features["feature-cube"].params.mesh=documentMesh(cadDocument,"remesh");assert.equal(resolveHybridReference(replaced,r).status,"unresolved");
 await run({type:"create-geometry-graph",id:"nodes",graph:createGeometryGraph()});assert.throws(()=>captureHybridReference(cadDocument,"nodes",ray.origin,ray.direction),/Bake/);await run({type:"bake-mesh",objectId:"nodes",id:"baked"});assert.equal(resolveHybridReference(cadDocument,captureHybridReference(cadDocument,"baked",ray.origin,ray.direction)).status,"valid");
});
test("planar BRep conversion welds seams, validates closed topology and records exact face ownership",async()=>{
 await setup();await run(reference());await run(datum());const source=structuredClone(cadDocument.features["feature-prism"]);await run({type:"hybrid-to-mesh",objectId:"prism",id:"converted"});const mesh=documentMesh(cadDocument,"converted")!,receipt=cadDocument.features["feature-converted"].params.hybridConversion as any;assert.ok(validateEditableMesh(mesh));assert.equal(mesh.vertices.length,8);assert.equal(mesh.faces.length,12);assert.ok(meshEdges(mesh).every(e=>e.faceIds.length===2));assert.equal(Object.keys(receipt.faceMap).length,6);assert.equal(Object.values(receipt.faceMap).flat().length,12);assert.ok(receipt.maxWeldDistance<=1e-7);assert.deepEqual(cadDocument.features["feature-prism"],source);
 const original=documentState();undoDocument();assert.equal(cadDocument.objects.converted,undefined);redoDocument();assert.deepEqual(documentState(),original);
});
test("conversion refuses unsupported surfaces, corrupted correspondence and allocation budgets",async()=>{
 await setup();await run({type:"create-primitive",id:"cylinder",primitive:"cylinder",params:{radius:5,height:10},position:[0,0,0]});const state=documentState();assert.equal((await dispatchCadCommand({type:"hybrid-to-mesh",objectId:"cylinder"})).ok,false);assert.deepEqual(documentState(),state);
 const data=await buildPrimitiveMesh({kind:"box",width:4,depth:6,height:5});assert.equal(editableFromPlanarBrep(data).mesh.vertices.length,8);assert.throws(()=>editableFromPlanarBrep({...data,faces:undefined}),/correspondence/);assert.throws(()=>editableFromPlanarBrep({...data,positions:new Float64Array(30003)}),/budget/);
});
test("v59 persists reference and live dependency; legacy documents keep their format and malformed references reject",async()=>{
 await setup();assert.equal(JSON.parse(serializeDocument(cadDocument)).version,56);await run(reference());await run(datum());await run({type:"hybrid-to-mesh",objectId:"prism",id:"converted"});const saved=serializeDocument(cadDocument),loaded=deserializeDocument(saved);assert.equal(JSON.parse(saved).version,59);assert.equal(JSON.stringify(documentState(loaded)),JSON.stringify(documentState()));assert.doesNotThrow(()=>assertHybridFeatureResolved(loaded,"prism"));
 const old=JSON.parse(saved);old.version=58;assert.throws(()=>deserializeDocument(JSON.stringify(old)),/59/);const broken=JSON.parse(saved);broken.document.workPlanes.datum.hybrid.barycentric=[5,5,5];assert.throws(()=>deserializeDocument(JSON.stringify(broken)));
});
test("MCP planning and native UI commands produce identical reviewed geometry; read tools never mutate",async()=>{
 await setup();const context={document:cadDocument,selectionIds:["cube"],layerId:"layer-default",workPlane:"XY" as const},plan=await planCadModelingTools([{id:"call",name:"hybrid.reference.create",arguments:{objectId:"cube",referenceId:"datum",rayJson:JSON.stringify(ray)}}],context);assert.deepEqual(JSON.parse(JSON.stringify(plan.command)),reference());await run(plan.command);
 const session=createCadToolSession(context),state=documentState();const read=await session.read({id:"call",name:"hybrid.reference.validate",arguments:{referenceId:"datum"}});assert.ok(JSON.stringify(read).includes("valid"));assert.deepEqual(documentState(),state);
 const planned=await planCadModelingTools([{id:"call",name:"hybrid.datum.create",arguments:{referenceId:"datum",id:"prism",width:4,depth:6,height:5}}],context);assert.deepEqual(planned.command,datum());const a=await previewCadCommand(datum()),b=await previewCadCommand(planned.command);assert.ok(a.result.ok&&b.result.ok);assert.deepEqual(getCadPlanFrameDocument(a.planId),getCadPlanFrameDocument(b.planId));discardCadPlan(a.planId);discardCadPlan(b.planId);
});
test("locked outputs, invalid dimensions and stale previews roll back the whole hybrid edit",async()=>{
 await setup();await run(reference());const original=documentState();await assert.rejects(()=>dispatchCadCommand({...datum(),width:0}),/Invalid/);assert.deepEqual(documentState(),original);const preview=await previewCadCommand(datum());await run({type:"rename-object",objectId:"cube",name:"changed"});assert.equal((await applyCadPlan(preview.planId)).ok,false);assert.equal(cadDocument.objects.prism,undefined);
});

test("nonuniform source transforms preserve orthonormal world datum and dimensions",async()=>{
 await setup();await run(reference());await run(datum());
 await run({type:"move-object",objectId:"cube",translation:[30,40,50]});await run({type:"rotate-object",objectId:"cube",rotation:[10,20,30]});await run({type:"scale-object",objectId:"cube",scale:[1.2,.8,1.1]});
 const resolved=resolveHybridReference(cadDocument,cadDocument.workPlanes!.datum.hybrid!);assert.ok("frame" in resolved);assert.ok(Math.abs(Math.hypot(...resolved.frame.normal)-1)<1e-9);assert.ok(Math.abs(meshVolume(await buildExtrudeMesh(cadDocument.features["feature-prism"].params,true))-120)<1e-7);assert.doesNotThrow(()=>assertHybridFeatureResolved(cadDocument,"prism"));
 const snapshot=documentState();assert.equal((await dispatchCadCommand({type:"scale-object",objectId:"prism",scale:[2,2,2]})).ok,false);assert.deepEqual(documentState(),snapshot);
});
test("locked dependent BRep atomically rolls back source Sculpt",async()=>{
 await setup();await run(reference());await run(datum());
 cadDocument.layers.output={id:"output",name:"Output",visible:true,locked:true,objectIds:["prism"]};cadDocument.rootLayers.push("output");cadDocument.layers["layer-default"].objectIds=cadDocument.layers["layer-default"].objectIds.filter(id=>id!=="prism");cadDocument.objects.prism.layerId="output";
 const snapshot=documentState();const result=await dispatchCadCommand({type:"sculpt-stroke",objectId:"cube",stroke:{brush:"grab",radius:20,strength:.2,falloff:"smooth",spacing:.15,symmetry:false,samples:[{...ray,delta:[0,0,2]}]}});assert.equal(result.ok,false);assert.match(result.reason??"",/locked/);assert.deepEqual(documentState(),snapshot);
});
test("converted Mesh is independently editable and original correspondence becomes a historical receipt",async()=>{
 await setup();await run(reference());await run(datum());await run({type:"hybrid-to-mesh",objectId:"prism",id:"converted"});const source=JSON.stringify(cadDocument.features["feature-prism"]);
 await run({type:"edit-polygon-mesh",objectId:"converted",operation:{kind:"extrude",faceIds:["f0"],distance:1}} as any);
 const loaded=deserializeDocument(serializeDocument(cadDocument));assert.ok(documentMesh(loaded,"converted"));assert.equal(JSON.stringify(cadDocument.features["feature-prism"]),source);
 const session=createCadToolSession({document:cadDocument,selectionIds:["converted"],layerId:"layer-default",workPlane:"XY"});const read=await session.read({id:"inspect",name:"hybrid.inspect",arguments:{objectId:"converted"}});assert.equal(read.ok,true);assert.equal((read.result as any).conversionMapCurrent,false);
});
