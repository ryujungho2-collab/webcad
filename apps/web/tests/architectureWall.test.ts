import test from "node:test";import assert from "node:assert/strict";
import {serializeDocument,deserializeDocument,type ArchitectureWall,type WallOpening} from "@agent-webcad/cad-document";
import {cadDocument} from "../src/state/cadDocument";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {previewCadCommand,applyCadPlan} from "../src/state/documentPlans";
import {measureDocumentObject} from "../src/state/documentQuery";
import {cadHistory,undoDocument,redoDocument} from "../src/state/history";
import {resetTestDocument,documentState} from "./helpers/documentHarness";
import {wallFootprint} from "../src/precision/architectureWall";
test.beforeEach(resetTestDocument);
const run=async(c:Parameters<typeof dispatchCadCommand>[0])=>{const r=await dispatchCadCommand(c);assert.ok(r.ok,r.reason);return r;};
const wall=(patch:Partial<ArchitectureWall>={}):ArchitectureWall=>({mode:"centerline",sourceObjectIds:["axis"],height:2400,thickness:200,baseLevel:0,openings:[],...patch});
const opening=(patch:Partial<WallOpening>={}):WallOpening=>({id:"door",kind:"door",side:"left",along:1500,width:900,height:2100,sill:0,...patch});
const feature=(id="wall")=>Object.values(cadDocument.features).find(f=>f.output===id)!;
const volume=async(id="wall")=>(await measureDocumentObject(cadDocument,id)).volume!;
async function axis(){await run({type:"create-drawing",id:"axis",drawing:"line",params:{points:[[0,0,0],[6000,0,0]],workPlane:"XY"}});}
test("wall Review is detached; signed height/base level, batch/Undo and v41 reopen retain physical volume",async()=>{
 await axis();const before=documentState(),count=cadHistory.getPastLabels().length,p=await previewCadCommand({type:"create-wall",id:"wall",definition:wall({height:-2400,baseLevel:300})});assert.ok(p.result.ok,p.result.reason);assert.deepEqual(documentState(),before);assert.ok((await applyCadPlan(p.planId)).ok);assert.equal(await volume(),6000*200*2400);assert.equal(cadHistory.getPastLabels().length,count+1);assert.deepEqual((feature().params.bounds as any).min,[0,-100,-2100]);
 const after=documentState(),text=serializeDocument(cadDocument);assert.equal(JSON.parse(text).version,41);assert.deepEqual(deserializeDocument(text),cadDocument);assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),after);const bad=JSON.parse(text);bad.version=40;assert.throws(()=>deserializeDocument(JSON.stringify(bad)),/version 41/);
});
test("door/window through cuts keep host identity; thickness/height/source transforms regenerate and remove restores material",async()=>{
 await axis();await run({type:"create-wall",id:"wall",definition:wall()});const id=feature().id;
 await run({type:"upsert-wall-opening",objectId:"wall",opening:opening()});assert.equal(feature().id,id);assert.ok(Math.abs(await volume()-(6000*200*2400-900*200*2100))<1);
 await run({type:"upsert-wall-opening",objectId:"wall",opening:opening({id:"window",kind:"window",along:4200,width:1200,height:1000,sill:900,side:"right"})});assert.ok(Math.abs(await volume()-(6000*200*2400-900*200*2100-1200*200*1000))<1);
 await run({type:"update-wall",objectId:"wall",height:3000,thickness:300,baseLevel:500});assert.ok(Math.abs(await volume()-(6000*300*3000-900*300*2100-1200*300*1000))<1);
 await run({type:"move-object",objectId:"axis",translation:[100,200,0]});assert.equal((feature().params.architecturalWall as ArchitectureWall).openings[0].id,"door");assert.ok((feature().params.bounds as any).min[0]>=99.999);
 const v=await volume();await run({type:"rotate-object",objectId:"wall",rotation:[0,0,45]});await run({type:"move-object",objectId:"wall",translation:[50,25,10]});assert.ok(Math.abs(await volume()-v)<1);
 await run({type:"delete-wall-opening",objectId:"wall",openingId:"door"});await run({type:"delete-wall-opening",objectId:"wall",openingId:"window"});assert.equal(feature().type,"extrude");assert.ok(Math.abs(await volume()-6000*300*3000)<1);assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)),cadDocument);
});
test("outside, overlap, excessive top, negative sill, lock and source deletion reject atomically",async()=>{
 await axis();await run({type:"create-wall",id:"wall",definition:wall()});await run({type:"upsert-wall-opening",objectId:"wall",opening:opening()});
 for(const o of [opening({id:"bad",along:100}),opening({id:"bad",along:1600}),opening({id:"bad",kind:"window",along:4000,sill:2000}),opening({id:"bad",sill:-1})]){const before=documentState();assert.equal((await dispatchCadCommand({type:"upsert-wall-opening",objectId:"wall",opening:o}).catch(()=>({ok:false}))).ok,false);assert.deepEqual(documentState(),before);}
 let before=documentState();assert.equal((await dispatchCadCommand({type:"update-wall",objectId:"wall",height:1800,thickness:200,baseLevel:0})).ok,false);assert.deepEqual(documentState(),before);assert.equal((await dispatchCadCommand({type:"delete-object",objectId:"axis"})).ok,false);
 await run({type:"set-layer-locked",layerId:"layer-default",locked:true});before=documentState();assert.equal((await dispatchCadCommand({type:"delete-wall-opening",objectId:"wall",openingId:"door"})).ok,false);assert.deepEqual(documentState(),before);
});
test("rectangular prepared footprint drives thickness; complex footprint denies unsupported opening and XY contract is explicit",async()=>{
 await run({type:"create-drawing",id:"strip",drawing:"rectangle",params:{points:[[0,0,0],[6000,0,0],[6000,150,0],[0,150,0]],workPlane:"XY"}});await run({type:"create-wall",id:"wall",definition:wall({mode:"footprint",sourceObjectIds:["strip"]})});assert.equal((feature().params.architecturalWall as ArchitectureWall).thickness,150);await run({type:"upsert-wall-opening",objectId:"wall",opening:opening()});assert.ok(Math.abs(await volume()-(6000*150*2400-900*150*2100))<1);
 const before=documentState();assert.equal((await dispatchCadCommand({type:"update-wall",objectId:"wall",height:2400,thickness:300,baseLevel:0})).ok,false);assert.deepEqual(documentState(),before);
 await run({type:"create-drawing",id:"circle",drawing:"circle",params:{center:[9000,0,0],radius:500,workPlane:"XY"}});assert.throws(()=>wallFootprint(cadDocument,wall({mode:"footprint",sourceObjectIds:["circle"],openings:[opening()]})),/rectangular/);
});
test("opening revision stale refusal and one Undo restore wall material with stable IDs",async()=>{
 await axis();await run({type:"create-wall",id:"wall",definition:wall()});const before=documentState(),count=cadHistory.getPastLabels().length,p=await previewCadCommand({type:"upsert-wall-opening",objectId:"wall",opening:opening()});assert.deepEqual(documentState(),before);assert.ok((await applyCadPlan(p.planId)).ok);assert.equal(cadHistory.getPastLabels().length,count+1);assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.equal((await applyCadPlan(p.planId)).changed,false);
 const stale=await previewCadCommand({type:"upsert-wall-opening",objectId:"wall",opening:opening()});await run({type:"rename-object",objectId:"wall",name:"Edited wall"});const edited=documentState();assert.equal((await applyCadPlan(stale.planId)).ok,false);assert.deepEqual(documentState(),edited);
});
test("wall/window changes regenerate an associated plan, elevation and section; locked output rejects whole edit",async()=>{
 await axis();await run({type:"create-wall",id:"wall",definition:wall()});await run({type:"register-model-part",part:{id:"wall-part",objectId:"wall",name:"Wall"}});await run({type:"create-layer",id:"drawings",name:"Drawings"});
 await run({type:"upsert-model-section",view:{id:"plan",name:"Plan",partIds:["wall-part"],basis:"XY",height:1200,origin:[0,0],scale:1,layerId:"drawings"}});await run({type:"upsert-model-projection",id:"elevation",name:"Elevation",partIds:["wall-part"],basis:"XZ",origin:[0,0],scale:1,layerId:"drawings"});
 const before=JSON.stringify(cadDocument.modelPresentation!.sections!.plan.outputs);await run({type:"batch",commands:[{type:"upsert-wall-opening",objectId:"wall",opening:opening()},{type:"refresh-wall-drawings",objectId:"wall"}]});assert.equal(cadDocument.modelPresentation!.sections!.plan.status,"resolved",cadDocument.modelPresentation!.sections!.plan.reason);assert.notEqual(JSON.stringify(cadDocument.modelPresentation!.sections!.plan.outputs),before);assert.equal(cadDocument.modelPresentation!.projections.elevation.status,"resolved",cadDocument.modelPresentation!.projections.elevation.reason);
 const after=documentState();assert.ok(undoDocument());assert.deepEqual(JSON.stringify(cadDocument.modelPresentation!.sections!.plan.outputs),before);assert.ok(redoDocument());assert.deepEqual(documentState(),after);
 await run({type:"set-layer-locked",layerId:"drawings",locked:true});const locked=documentState();assert.equal((await dispatchCadCommand({type:"update-wall",objectId:"wall",height:3000,thickness:250,baseLevel:0})).ok,false);assert.deepEqual(documentState(),locked);
});
test("multiple walls are one transaction; negative signed walls cut downward with sill/lintel preserved",async()=>{
 await axis();await run({type:"create-drawing",id:"second",drawing:"line",params:{points:[[0,3000,0],[6000,3000,0]],workPlane:"XY"}});const before=documentState(),count=cadHistory.getPastLabels().length;
 await run({type:"batch",commands:[{type:"create-wall",id:"wall",definition:wall({height:-2400})},{type:"create-wall",id:"wall2",definition:wall({sourceObjectIds:["second"]})}]});assert.equal(cadHistory.getPastLabels().length,count+1);assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());
 await run({type:"upsert-wall-opening",objectId:"wall",opening:opening({kind:"window",sill:900,height:1000})});assert.ok(Math.abs(await volume()-(6000*200*2400-900*200*1000))<1);
 const state=documentState();assert.equal((await dispatchCadCommand({type:"upsert-wall-opening",objectId:"wall2",opening:opening()})).ok,false);assert.deepEqual(documentState(),state);
});

test("source rotation preserves the opening frame; generic scale/copy/extrude edits cannot detach wall semantics",async()=>{
 await axis();await run({type:"create-wall",id:"wall",definition:wall({openings:[opening()]})});const v=await volume();
 await run({type:"rotate-object",objectId:"axis",rotation:[0,0,90]});assert.ok(Math.abs(await volume()-v)<1);const bounds=feature().params.bounds as {min:number[];max:number[]};assert.ok(Math.abs(bounds.max[1]-bounds.min[1]-6000)<.001);assert.ok(Math.abs(bounds.max[0]-bounds.min[0]-200)<.001);
 for(const command of [{type:"scale-object",objectId:"wall",scale:[2,2,2]},{type:"duplicate-object",objectId:"wall"},{type:"update-extrude",objectId:"wall",distance:5000}] as const){const before=documentState();assert.equal((await dispatchCadCommand(command)).ok,false);assert.deepEqual(documentState(),before);}
});

test("v41 rejects malformed wall metadata, missing source and duplicate opening identities",async()=>{
 await axis();await run({type:"create-wall",id:"wall",definition:wall({openings:[opening()]})});const portable=serializeDocument(cadDocument);
 for(const mutate of [(d:any)=>{d.features["feature-wall"].params.architecturalWall.openings[0].sill=-1;},(d:any)=>{delete d.objects.axis;},(d:any)=>{d.features["feature-wall"].params.architecturalWall.openings.push(opening());},(d:any)=>{d.features["feature-wall"].dependencyMode="snapshot";}]){const d=JSON.parse(portable);mutate(d.document??d);assert.throws(()=>deserializeDocument(JSON.stringify(d)));}
});


