import test from "node:test";import assert from "node:assert/strict";
import {DEFAULT_RECONSTRUCTION,meshContentSignature,serializeDocument,deserializeDocument,type EditableMesh} from "@agent-webcad/cad-document";
import {cadDocument} from "../src/state/cadDocument";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {previewCadCommand,applyCadPlan,discardCadPlan,getCadPlanFrameDocument} from "../src/state/documentPlans";
import {undoDocument,redoDocument} from "../src/state/history";
import {evaluateReconstruction,reconstructionSource} from "../src/state/reconstructionCommands";
import {documentMesh} from "../src/state/meshCommands";
import {buildPrimitiveMesh,inspectSolid} from "../src/cad/kernelGeometryService";
import {planCadModelingTools} from "../src/copilot/cadModelingTools";
import {createCadToolSession} from "../src/copilot/cadToolSession";
import {resetTestDocument,documentState} from "./helpers/documentHarness";
import {trianglePrism,squareTube,triangulateFixture} from "./helpers/reconstructionFixtures";
async function setup(mesh:EditableMesh=trianglePrism()){resetTestDocument();const r=await dispatchCadCommand({type:"create-mesh",id:"source",size:10});assert.ok(r.ok,r.reason);cadDocument.features["feature-source"].params.mesh=structuredClone(mesh);}
const command=()=>({type:"reconstruct-planar-mesh" as const,objectId:"source",id:"solid",options:{...DEFAULT_RECONSTRUCTION}});
test("reconstruction quality: max/RMS, analytic area/volume, closed shell and face correspondence",async()=>{
 for(const [mesh,volume,faces] of [[trianglePrism(),1000,6],[trianglePrism(4,6,5),120,6],[triangulateFixture(squareTube()),420,10]] as const){await setup(mesh);const result=await evaluateReconstruction(cadDocument,"source",DEFAULT_RECONSTRUCTION);assert.equal(result.report.brepFaces,faces);assert.equal(result.report.shellClosed,true);assert.equal(result.report.kernelValidity,"valid");assert.ok(Math.abs(result.report.resultVolume-volume)<1e-7);assert.ok(result.report.sampledMaxDistance<1e-7);assert.ok(result.report.sampledRmsDistance<1e-7);assert.ok(result.report.absoluteAreaDifference<1e-7);assert.equal(Object.keys(result.report.faceMap).length,faces);assert.ok(result.report.sourceToBrep.samples>0&&result.report.brepToSource.samples>0);assert.equal(result.report.classification,"merged-planar");}
});
test("source-preserving review/cancel/apply, Undo/Redo and real BRep result",async()=>{
 await setup();const before=documentState(),preview=await previewCadCommand(command());assert.ok(preview.result.ok,preview.result.reason);assert.deepEqual(documentState(),before);assert.equal(getCadPlanFrameDocument(preview.planId)!.features["feature-solid"].params.kind,"planar-reconstruction");discardCadPlan(preview.planId);assert.deepEqual(documentState(),before);
 const p=await previewCadCommand(command());assert.ok((await applyCadPlan(p.planId)).ok);assert.deepEqual(documentMesh(cadDocument,"source"),documentMesh(before,"source"));const after=documentState();undoDocument();assert.deepEqual(documentState(),before);redoDocument();assert.deepEqual(documentState(),after);const params=cadDocument.features["feature-solid"].params;assert.equal((await buildPrimitiveMesh(params)).faces!.length,6);assert.equal((await inspectSolid({params})).validity,"valid");
});
test("open, invalid, locked and cancelled inputs cannot publish or overwrite original",async()=>{
 const open=trianglePrism();open.faces.pop();await setup(open);const before=documentState(),r=await dispatchCadCommand(command());assert.equal(r.ok,false);assert.match(r.reason??"",/Open/);assert.deepEqual(documentState(),before);
 await setup();cadDocument.layers["layer-default"].locked=true;assert.equal((await dispatchCadCommand(command())).ok,false);assert.equal(cadDocument.objects.solid,undefined);cadDocument.layers["layer-default"].locked=false;
 const abort=new AbortController();abort.abort();await assert.rejects(()=>evaluateReconstruction(cadDocument,"source",DEFAULT_RECONSTRUCTION,{signal:abort.signal}));assert.equal(cadDocument.objects.solid,undefined);
});
test("world-mm tolerances respect source placement; planar polyhedron reconstructs",async()=>{
 const poly=trianglePrism();poly.vertices.forEach(v=>{v.position[0]+=.3*v.position[2];v.position[1]+=.2*v.position[2];});await setup(poly);
 for(const c of [{type:"move-object",objectId:"source",translation:[20,30,40]},{type:"rotate-object",objectId:"source",rotation:[15,20,30]},{type:"scale-object",objectId:"source",scale:[2,.5,1.5]}] as const){const r=await dispatchCadCommand(c as any);assert.ok(r.ok,r.reason);}
 const result=await evaluateReconstruction(cadDocument,"source",DEFAULT_RECONSTRUCTION);assert.equal(result.report.brepFaces,6);assert.ok(Math.abs(result.report.resultVolume-1500)<1e-6);assert.ok(result.report.sampledMaxDistance<1e-7);
});
test("v61 keeps independent source/definition/quality; malformed receipts and older version reject",async()=>{
 await setup();assert.equal(JSON.parse(serializeDocument(cadDocument)).version,55);assert.ok((await dispatchCadCommand(command())).ok);const saved=serializeDocument(cadDocument);assert.equal(JSON.parse(saved).version,61);const loaded=deserializeDocument(saved);assert.equal(JSON.stringify(documentState(loaded)),JSON.stringify(documentState()));assert.equal((await inspectSolid({params:loaded.features["feature-solid"].params})).validity,"valid");
 const bad=JSON.parse(saved);bad.version=60;assert.throws(()=>deserializeDocument(JSON.stringify(bad)),/61/);const changed=JSON.parse(saved);changed.document.features["feature-solid"].params.reconstruction.regions[0].loops[0][0][0]+=1;assert.throws(()=>deserializeDocument(JSON.stringify(changed)));
});
test("MCP/native commands evaluate identical geometry; reads and source-change state are explicit",async()=>{
 await setup();const context={document:cadDocument,selectionIds:["source"],layerId:"layer-default",workPlane:"XY" as const};const plan=await planCadModelingTools([{id:"rebuild",name:"reconstruction.create",arguments:{objectId:"source",id:"solid"}}],context);assert.deepEqual(plan.command,command());const session=createCadToolSession(context),before=documentState();const read=await session.read({id:"analysis",name:"reconstruction.analyze",arguments:{objectId:"source"}});assert.ok(read.ok,read.error);assert.equal((read.result as any).planarFaces,6);assert.deepEqual(documentState(),before);
 const p=await previewCadCommand(plan.command);assert.ok(p.result.ok,p.result.reason);const expected=getCadPlanFrameDocument(p.planId)!.features["feature-solid"].params;await applyCadPlan(p.planId);assert.deepEqual(cadDocument.features["feature-solid"].params,expected);
 const original=JSON.stringify(cadDocument.features["feature-solid"]);await dispatchCadCommand({type:"move-object",objectId:"source",translation:[5,0,0]});assert.equal(JSON.stringify(cadDocument.features["feature-solid"]),original);const newer=createCadToolSession({...context,selectionIds:["solid"]}),status=await newer.read({id:"result",name:"reconstruction.result",arguments:{objectId:"solid"}});assert.ok(status.ok,status.error);assert.equal((status.result as any).sourceMatches,false);
});
test("stale reconstruction review is rejected after source mutation",async()=>{await setup();const p=await previewCadCommand(command());assert.ok(p.result.ok,p.result.reason);await dispatchCadCommand({type:"rename-object",objectId:"source",name:"changed"});assert.equal((await applyCadPlan(p.planId)).ok,false);assert.equal(cadDocument.objects.solid,undefined);});

test("quality is historical after result placement changes; nested reconstruction keeps v61",async()=>{
 await setup();assert.ok((await dispatchCadCommand(command())).ok);assert.ok((await dispatchCadCommand({type:"move-object",objectId:"solid",translation:[2,0,0]})).ok);const context={document:cadDocument,selectionIds:["solid"],layerId:"layer-default",workPlane:"XY" as const},read=await createCadToolSession(context).read({id:"inspect",name:"reconstruction.result",arguments:{objectId:"solid"}});assert.ok(read.ok,read.error);assert.equal((read.result as any).sourceMatches,true);assert.equal((read.result as any).qualityCurrent,false);
 const nested=structuredClone(cadDocument),solid=nested.features["feature-solid"];nested.features["feature-solid"]={...solid,type:"boolean",params:{operation:"union",operands:[{params:solid.params},{params:{kind:"box",width:1,depth:1,height:1}}]}};
 const text=serializeDocument(nested);assert.equal(JSON.parse(text).version,61);const old=JSON.parse(text);old.version=60;assert.throws(()=>deserializeDocument(JSON.stringify(old)),/61/);
});


test("previous noisy fixture is healed only within unchanged movement and surface budgets",async()=>{
 const noisy=(await import("@agent-webcad/cad-document")).createPolygonMesh(10),top=noisy.faces.find(f=>f.vertices.every(id=>noisy.vertices.find(v=>v.id===id)!.position[2]===10))!;noisy.faces=noisy.faces.filter(f=>f!==top);noisy.vertices.push({id:"noise",position:[.00001,.00001,10.000001]});top.vertices.forEach((id,i)=>noisy.faces.push({id:"noise"+i,vertices:[id,top.vertices[(i+1)%4],"noise"]}));
 await setup(noisy);const before=JSON.stringify(documentMesh(cadDocument,"source")),result=await evaluateReconstruction(cadDocument,"source",DEFAULT_RECONSTRUCTION);assert.equal(result.report.kernelValidity,"valid");assert.equal(result.report.kernelSelfInterference,"valid");assert.ok(result.report.healing!.applied);assert.ok(result.report.healing!.maxInputMovement<=DEFAULT_RECONSTRUCTION.absoluteTolerance);assert.ok(result.report.sampledMaxDistance<1e-6);
 const p=await previewCadCommand(command());assert.ok(p.result.ok,p.result.reason);assert.equal(JSON.stringify(documentMesh(cadDocument,"source")),before);await applyCadPlan(p.planId);assert.equal(JSON.stringify(documentMesh(cadDocument,"source")),before);const after=documentState();undoDocument();assert.equal(cadDocument.objects.solid,undefined);redoDocument();assert.deepEqual(documentState(),after);
 const loaded=deserializeDocument(serializeDocument(cadDocument));assert.equal((await inspectSolid({params:loaded.features["feature-solid"].params})).validity,"valid");
});
test("legacy v60 reconstruction remains readable without shared-topology semantics",async()=>{
 await setup();assert.ok((await dispatchCadCommand(command())).ok);const legacy=structuredClone(cadDocument),p=legacy.features["feature-solid"].params,d=p.reconstruction as any;delete d.sharedTopology;d.regions.forEach((r:any)=>delete r.loopVertexIds);const receipt=p.reconstructionReceipt as any;delete receipt.healing;receipt.definitionFingerprint=meshContentSignature(d);
 const saved=serializeDocument(legacy);assert.equal(JSON.parse(saved).version,60);const loaded=deserializeDocument(saved);assert.equal((await inspectSolid({params:loaded.features["feature-solid"].params})).validity,"valid");
});
