import test,{beforeEach} from "node:test";
import assert from "node:assert/strict";
import {serializeDocument,deserializeDocument,type ArchitectureWall} from "@agent-webcad/cad-document";
import {cadDocument} from "../src/state/cadDocument";
import {resetTestDocument,documentState} from "./helpers/documentHarness";
import {createCadToolSession} from "../src/copilot/cadToolSession";
import {planCadToolPrompt} from "../src/copilot/cadToolPrompts";
import {previewCadCommand,applyCadPlan,discardCadPlan,getCadPlanFrameDocument} from "../src/state/documentPlans";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {measureDocumentObject} from "../src/state/documentQuery";
import {cadHistory,undoDocument,redoDocument} from "../src/state/history";
import type {CadToolCall} from "../src/copilot/cadToolContract";
import {checkWallPath} from "../src/copilot/architecturePath";
const ctx=(selectionIds:string[]=[])=>({document:cadDocument,selectionIds,layerId:"layer-default",workPlane:"XY" as const});
const call=(name:CadToolCall["name"],args:Record<string,unknown>,id="step"):CadToolCall=>({id,name,arguments:args});
const f=(id="wall")=>Object.values(cadDocument.features).find(f=>f.output===id)!;
const create=()=>call("wall.create",{id:"wall",start:[0,0],end:[6000,0],height:3000,thickness:200,baseLevel:0,openings:[]});
async function apply(calls:CadToolCall[],ids:string[]=[]){const plan=await createCadToolSession(ctx(ids)).plan(calls),before=documentState(),p=await previewCadCommand(plan.command);assert.ok(p.result.ok,p.result.reason);assert.deepEqual(documentState(),before);assert.ok((await applyCadPlan(p.planId)).ok);discardCadPlan(p.planId);return plan;}
beforeEach(()=>resetTestDocument());
test("Native wall tools create real semantic host/source relationships and read exact hosted openings",async()=>{
 await apply([create()]);assert.ok(f().params.architecturalWall);assert.deepEqual(f().inputs,["wall_axis"]);assert.equal(cadDocument.objects.wall_axis.visible,false);assert.ok(Math.abs((await measureDocumentObject(cadDocument,"wall")).volume!-6000*200*3000)<1);
 const opening={id:"entry",kind:"door",side:"left",along:1500,width:900,height:2100,sill:0};await apply([call("wall.opening",{objectId:"wall",opening,refreshDrawings:true})],["wall"]);
 const r=await createCadToolSession(ctx()).read(call("cad.architecture",{objectIds:["wall"]}));assert.equal(r.ok,true);assert.deepEqual((r.result as any)[0].wall.openings,[opening]);assert.equal((r.result as any)[0].sourceFrame.length,6000);assert.ok(Math.abs((await measureDocumentObject(cadDocument,"wall")).volume!-(6000*200*3000-900*200*2100))<1);
 await assert.rejects(createCadToolSession(ctx()).plan([call("wall.opening",{objectId:"wall",opening:{...opening,width:1200},refreshDrawings:true})]),/Select/);
});
test("Door change rebuilds actual BRep plan and section as one Undo, retaining host and source IDs",async()=>{
 await apply([create(),call("drawing.section",{id:"plan",name:"Plan",objectIds:["wall"],basis:"XY",height:1200,origin:[0,-6000],scale:1},"plan"),call("drawing.section",{id:"section",name:"Cut",objectIds:["wall"],basis:"XZ",height:0,origin:[8000,-6000],scale:1},"section")]);
 assert.equal(cadDocument.modelPresentation!.sections!.plan.status,"resolved");const initial=Object.keys(cadDocument.modelPresentation!.sections!.plan.outputs).length;
 await apply([call("wall.opening",{objectId:"wall",opening:{id:"entry",kind:"door",side:"left",along:1500,width:900,height:2100,sill:0},refreshDrawings:true})],["wall"]);
 const before=documentState(),past=cadHistory.getPastLabels().length,hostId=f().id,planBefore=JSON.stringify(Object.values(cadDocument.features).filter(f=>f.params.modelSection==="plan").map(f=>f.params));
 const r=await planCadToolPrompt("선택한 벽 문 폭 1200",ctx(["wall"]));assert.ok(r?.ok);if(!r?.ok)return;const p=await previewCadCommand(r.plan.command);assert.ok(p.result.ok,p.result.reason);assert.deepEqual(documentState(),before);assert.equal(getCadPlanFrameDocument(p.planId)!.modelPresentation!.sections!.plan.status,"resolved");assert.ok((await applyCadPlan(p.planId)).ok);
 assert.equal(f().id,hostId);assert.deepEqual(f().inputs,["wall_axis"]);assert.equal((f().params.architecturalWall as ArchitectureWall).openings[0].width,1200);assert.equal(cadHistory.getPastLabels().length,past+1);assert.notEqual(JSON.stringify(Object.values(cadDocument.features).filter(f=>f.params.modelSection==="plan").map(f=>f.params)),planBefore);assert.ok(Object.keys(cadDocument.modelPresentation!.sections!.plan.outputs).length>initial);assert.equal(cadDocument.modelPresentation!.sections!.section.status,"resolved");
 const after=documentState();assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),after);assert.equal(serializeDocument(deserializeDocument(serializeDocument(cadDocument))),serializeDocument(cadDocument));discardCadPlan(p.planId);
});
test("Overlapping or outside openings and locked dependent output block the whole native proposal",async()=>{
 await apply([create()]);const opening={id:"entry",kind:"door",side:"left",along:1500,width:900,height:2100,sill:0};await apply([call("wall.opening",{objectId:"wall",opening,refreshDrawings:false})],["wall"]);
 for(const bad of [{...opening,id:"bad",along:1700},{...opening,width:6000},{...opening,height:4000}]){const before=documentState(),plan=await createCadToolSession(ctx(["wall"])).plan([call("wall.opening",{objectId:"wall",opening:bad,refreshDrawings:true})]),p=await previewCadCommand(plan.command);assert.equal(p.result.ok,false);assert.deepEqual(documentState(),before);discardCadPlan(p.planId);}
 await dispatchCadCommand({type:"create-layer",id:"views",name:"Views"});const plan=await createCadToolSession({...ctx(["wall"]),layerId:"views"}).plan([call("drawing.section",{id:"plan",name:"Plan",objectIds:["wall"],basis:"XY",height:1200,origin:[0,-6000],scale:1})]);let p=await previewCadCommand(plan.command);assert.ok(p.result.ok,p.result.reason);assert.ok((await applyCadPlan(p.planId)).ok);discardCadPlan(p.planId);await dispatchCadCommand({type:"set-layer-locked",layerId:"views",locked:true});const before=documentState(),r=await planCadToolPrompt("선택한 벽 문 폭 1200",ctx(["wall"]));assert.ok(r?.ok);if(!r?.ok)return;p=await previewCadCommand(r.plan.command);assert.equal(p.result.ok,false);assert.deepEqual(documentState(),before);discardCadPlan(p.planId);
});
test("Native slab keeps an actual courtyard hole and uses top-level floor level semantics",async()=>{
 for(const [id,points]of [["outer",[[0,0,0],[6000,0,0],[6000,4000,0],[0,4000,0]]],["void",[[2000,1000,0],[4000,1000,0],[4000,3000,0],[2000,3000,0]]]] as const)await dispatchCadCommand({type:"create-drawing",id,drawing:"polyline",params:{points,closed:true,workPlane:"XY"}});
 const r=await planCadToolPrompt("선택한 윤곽 바닥 레벨 4200 두께 200",ctx(["outer","void"]));assert.ok(r?.ok);if(!r?.ok)return;const p=await previewCadCommand(r.plan.command);assert.ok(p.result.ok,p.result.reason);assert.ok((await applyCadPlan(p.planId)).ok);const id=r.plan.resultObjectIds![0],measurement=await measureDocumentObject(cadDocument,id);assert.ok(Math.abs(measurement.volume!-(6000*4000-2000*2000)*200)<1);assert.deepEqual((f(id).params.bounds as any).min,[0,0,4000]);assert.deepEqual(f(id).inputs,["outer","void"]);discardCadPlan(p.planId);
});
test("Local grammar shares tool limits and asks about ambiguous hosts instead of guessing",async()=>{
 for(const prompt of ["벽 시작 0,0 끝 6000,0 두께 200 높이 3000","벽 시작 0,0 끝 6000,0 두께 20cm 높이 3m 레벨 4.2m"]){const r=await planCadToolPrompt(prompt,ctx());assert.ok(r?.ok,r&&!r.ok?r.reason:prompt);}
 for(const prompt of ["벽 시작 0,0 끝 6000,0 두께 0 높이 3000","벽 시작 0,0 끝 6000,0 두께 200 높이 30000"]){const r=await planCadToolPrompt(prompt,ctx());assert.ok(r&&!r.ok);}
 await apply([create()]);const r=await planCadToolPrompt("선택한 벽 창 추가 중심 3000 폭 1800 높이 1200",ctx(["wall"]));assert.ok(r&&!r.ok);if(r&&!r.ok)assert.match(r.reason,/창턱/);
 await apply([call("wall.opening",{objectId:"wall",opening:{id:"d1",kind:"door",side:"left",along:1500,width:800,height:2100,sill:0},refreshDrawings:false})],["wall"]);await apply([call("wall.opening",{objectId:"wall",opening:{id:"d2",kind:"door",side:"left",along:4000,width:800,height:2100,sill:0},refreshDrawings:false})],["wall"]);const ambiguous=await planCadToolPrompt("선택한 벽 문 폭 1000",ctx(["wall"]));assert.ok(ambiguous&&!ambiguous.ok);if(ambiguous&&!ambiguous.ok)assert.match(ambiguous.reason,/정확히 하나/);
});
test("Wall/body path clearance responds to actual host doorway width, height and path without mutation",async()=>{
 await apply([create()]);const door={id:"entry",kind:"door",side:"left",along:1500,width:900,height:2100,sill:0};await apply([call("wall.opening",{objectId:"wall",opening:door,refreshDrawings:false})],["wall"]);
 const args={objectIds:["wall"],points:[[1500,-1000],[1500,1000]] as [number,number][],level:0,radius:300,height:1800},before=documentState();assert.equal(checkWallPath(cadDocument,args).status,"clear");assert.equal(checkWallPath(cadDocument,{...args,radius:500}).status,"blocked");assert.equal(checkWallPath(cadDocument,{...args,height:2200}).status,"blocked");assert.equal(checkWallPath(cadDocument,{...args,points:[[3000,-1000],[3000,1000]]}).status,"blocked");assert.deepEqual(documentState(),before);
 await apply([call("wall.opening",{objectId:"wall",opening:{...door,width:500},refreshDrawings:false})],["wall"]);const r=await createCadToolSession(ctx()).read(call("cad.pathClearance",args));assert.equal(r.ok,true);assert.equal((r.result as any).status,"blocked");assert.ok(undoDocument());assert.equal(checkWallPath(cadDocument,args).status,"clear");
});
test("Wall path clearance handles end corners, diagonal paths and transformed upright hosts conservatively",async()=>{
 await apply([create()]);const args={objectIds:["wall"],points:[[-1000,0],[-500,0]] as [number,number][],level:0,radius:300,height:1800};assert.equal(checkWallPath(cadDocument,args).status,"clear");assert.equal(checkWallPath(cadDocument,{...args,points:[[-1000,0],[-200,0]]}).status,"blocked");assert.equal(checkWallPath(cadDocument,{...args,points:[[-1000,-1000],[1000,1000]]}).status,"blocked");
 await dispatchCadCommand({type:"move-object",objectId:"wall",translation:[10000,20000,0]});assert.equal(checkWallPath(cadDocument,{...args,points:[[11500,19000],[11500,21000]]}).status,"blocked");assert.equal(checkWallPath(cadDocument,{...args,points:[[500,19000],[500,21000]]}).status,"clear");
 await dispatchCadCommand({type:"rotate-object",objectId:"wall",rotation:[30,0,0]});assert.throws(()=>checkWallPath(cadDocument,args),/tilted/);
});
test("A window opening never becomes a walk-through door in the bounded clearance check",async()=>{
 await apply([create()]);await apply([call("wall.opening",{objectId:"wall",opening:{id:"window",kind:"window",side:"left",along:1500,width:1800,height:2100,sill:0},refreshDrawings:false})],["wall"]);assert.equal(checkWallPath(cadDocument,{objectIds:["wall"],points:[[1500,-1000],[1500,1000]],level:0,radius:300,height:1800}).status,"blocked");
});
test("Diagonal reversed centerlines and nonzero floor levels retain doorway coordinates in path checks",async()=>{
 await apply([call("wall.create",{id:"diagonal",start:[6000,6000],end:[0,0],height:3000,thickness:200,baseLevel:4200,openings:[{id:"door",kind:"door",side:"right",along:3000,width:900,height:2100,sill:0}]})]);
 const c=6000-3000/Math.sqrt(2),r=1000/Math.sqrt(2),args={objectIds:["diagonal"],points:[[c-r,c+r],[c+r,c-r]] as [number,number][],level:4200,radius:300,height:1800};assert.equal(checkWallPath(cadDocument,args).status,"clear");assert.equal(checkWallPath(cadDocument,{...args,height:2300}).status,"blocked");assert.equal(checkWallPath(cadDocument,{...args,points:args.points.map(([x,y])=>[x-1500,y-1500])}).status,"blocked");
});


test("Explicit section membership replacement includes a new facade, retains the view ID and is one Undo",async()=>{
 await apply([create(),call("drawing.section",{id:"plan",name:"Plan",objectIds:["wall"],basis:"XY",height:1200,origin:[0,-6000],scale:1},"plan")]);
 await apply([call("wall.create",{id:"skin",start:[0,-180],end:[6000,-180],height:3000,thickness:60,baseLevel:0,openings:[]})]);
 const a={id:"plan",name:"Plan with facade",objectIds:["wall","skin"],basis:"XY",height:1200,origin:[0,-6000],scale:1};
 await assert.rejects(createCadToolSession(ctx(["wall","skin"])).plan([call("drawing.section",a)]),/already exists/);
 await assert.rejects(createCadToolSession(ctx(["wall"])).plan([call("drawing.section",{...a,replaceExisting:true})]),/Select/);
 await assert.rejects(createCadToolSession(ctx(["wall","skin"])).plan([call("drawing.section",{...a,id:"missing",replaceExisting:true})]),/existing section/);
 const before=documentState(),past=cadHistory.getPastLabels().length;await apply([call("drawing.section",{...a,replaceExisting:true})],["wall","skin"]);
 assert.equal(Object.keys(cadDocument.modelPresentation!.sections!).length,1);assert.equal(cadDocument.modelPresentation!.sections!.plan.partIds.length,2);assert.equal(cadDocument.modelPresentation!.sections!.plan.status,"resolved");assert.equal(cadHistory.getPastLabels().length,past+1);assert.ok(undoDocument());assert.deepEqual(documentState(),before);
});
