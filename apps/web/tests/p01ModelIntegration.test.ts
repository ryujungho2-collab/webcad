import assert from "node:assert/strict";
import {beforeEach,test} from "node:test";
import {serializeDocument,deserializeDocument} from "@agent-webcad/cad-document";
import {cadDocument} from "../src/state/cadDocument";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {previewCadCommand,applyCadPlan} from "../src/state/documentPlans";
import {cadHistory,undoDocument,redoDocument} from "../src/state/history";
import {resetTestDocument,documentState} from "./helpers/documentHarness";
import {modelSheetSvg,modelSheetDxf} from "../src/export/modelSheetExport";
import {projectSolids} from "../src/cad/kernelGeometryService";
import {preserveSectionCorrespondence} from "../src/precision/sectionCorrespondence";
import type {SectionDrawing} from "../src/precision/modelSection";
import type {CadCommand} from "@agent-webcad/cad-commands";
beforeEach(resetTestDocument);
const apply=async(c:CadCommand)=>{const r=await dispatchCadCommand(c);assert.ok(r.ok,r.reason);return r;};
const feature=(id:string)=>Object.values(cadDocument.features).find(f=>f.output===id)!;
const section=()=>cadDocument.modelPresentation!.sections!.cut;
async function walls(){
 for(const [id,width,depth,height] of [["outer",4000,3000,2800],["inner",3600,2600,2800],["door",900,400,2100]] as const)await apply({type:"create-box",id,width,depth,height});
 await apply({type:"move-object",objectId:"inner",translation:[200,200,0]});await apply({type:"move-object",objectId:"door",translation:[1550,-100,0]});
 await apply({type:"boolean-operation",operation:"cut",target:"outer",tool:"inner",id:"walls"});await apply({type:"boolean-operation",operation:"cut",target:"walls",tool:"door",id:"building"});
 await apply({type:"register-model-part",part:{id:"part",name:"Building",objectId:"building"}});
 await apply({type:"create-layer",id:"drawings",name:"Drawings"});
 await apply({type:"upsert-model-section",view:{id:"cut",name:"Plan",partIds:["part"],basis:"XY",height:1200,origin:[20,30],scale:.02,layerId:"drawings"}});
}
test("presentation commands do not recalculate source sections; changed geometry still regenerates",async()=>{
 await walls();const count=()=>performance.getEntriesByName("agent-webcad:kernel-task:section").length,prior=count();
 await apply({type:"rename-object",objectId:"building",name:"Renamed"});await apply({type:"set-object-visible",objectId:"door",visible:true});
 const source=Object.values(section().outputs)[0].objectId;
 await apply({type:"upsert-model-note",id:"note",sourceObjectId:source,anchor:"center",mode:"live",quantity:"text",text:"Library",point:[30,50],height:3,layerId:"drawings"});
 assert.equal(count(),prior);await apply({type:"update-primitive",objectId:"door",params:{width:1100,depth:400,height:2100}});assert.ok(count()>prior);
});
test("anchored opening edit preserves section IDs, dimensions, annotations, sheet and Undo; layout keeps correspondence",async()=>{
 await walls();const outputs=structuredClone(section().outputs),source=Object.values(outputs)[0].objectId;
 await apply({type:"upsert-model-dimension",id:"dim",sourceObjectId:source,dimension:"linear",offset:5,angle:45,orientation:"aligned",height:3,layerId:"drawings"});
 await apply({type:"upsert-model-note",id:"note",sourceObjectId:source,anchor:"center",mode:"live",quantity:"text",text:"Wall",point:[50,60],height:3,layerId:"drawings"});
 await apply({type:"upsert-model-sheet",id:"sheet",name:"Plan",artboardId:"board",denominator:50,placements:{cut:[20,40]},origin:[0,0],size:[210,297]});
 await apply({type:"set-object-visible",objectId:"door",visible:true});const before=documentState();await apply({type:"update-primitive",objectId:"door",params:{width:1100,depth:400,height:2300}});
 assert.equal(section().status,"resolved");assert.deepEqual(section().outputs,outputs);assert.equal(feature("note").params.referenceStatus,"resolved");assert.equal(feature("dim").params.referenceStatus,"resolved");assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());
 await apply({type:"upsert-model-sheet",id:"sheet",name:"Plan",artboardId:"board",denominator:25,placements:{cut:[25,50]},origin:[0,0],size:[300,297]});assert.equal(section().status,"resolved");assert.deepEqual(section().outputs,outputs);assert.equal(modelSheetDxf("sheet").skipped,0);assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)),cadDocument);
});
test("graph correspondence rejects disconnected moving, reversed and ambiguous branches",()=>{
 const line=(key:string,a:number[],b:number[]):SectionDrawing=>({sourceKey:key,partId:"part",kind:"line",params:{points:[a,b]}});
 const a=[line("old",[0,0],[10,0])];const resize=[line("new",[0,0],[15,0])];assert.equal(preserveSectionCorrespondence(a,resize)[0].sourceKey,"old");
 for(const n of [[line("new",[2,0],[12,0])],[line("new",[0,0],[-10,0])],[...resize,line("branch",[0,0],[2,0])]])assert.equal(preserveSectionCorrespondence(a,n)[0].sourceKey,"new");
});
test("an affected view reuses unchanged part curves instead of querying their kernel cache",async()=>{
 await walls();await apply({type:"create-box",id:"column",width:100,depth:100,height:2000});await apply({type:"move-object",objectId:"column",translation:[500,500,0]});await apply({type:"register-model-part",part:{id:"column-part",name:"Column",objectId:"column"}});
 await apply({type:"upsert-model-section",view:{id:"cut",name:"Plan",partIds:["part","column-part"],basis:"XY",height:1200,origin:[20,30],scale:.02,layerId:"drawings"}});
 await apply({type:"set-object-visible",objectId:"door",visible:true});const ids=Object.values(section().outputs).filter(e=>feature(e.objectId).params.sourcePartId==="column-part").map(e=>e.objectId),previous=ids.map(id=>structuredClone(feature(id))),hits=performance.getEntriesByName("agent-webcad:section-cache-hit").length;
 await apply({type:"update-primitive",objectId:"door",params:{width:1379,depth:400,height:2100}});assert.equal(section().status,"resolved");assert.deepEqual(ids.map(feature),previous);assert.equal(performance.getEntriesByName("agent-webcad:section-cache-hit").length,hits);
});
test("exact HLR classifies front/back parts and suppresses no source geometry",async()=>{
 const r=await projectSolids([{params:{kind:"box",width:20,depth:10,height:10}},{params:{kind:"box",width:6,depth:6,height:6},transform:{translation:[7,20,2]}}],[0,-1,0],[1,0,0]);
 assert.ok(r.some(e=>e.sourceIndex===0&&!e.hidden));assert.ok(r.some(e=>e.sourceIndex===1&&e.hidden));assert.equal(r.some(e=>e.sourceIndex===1&&!e.hidden),false);
});
test("Boolean opening HLR Review/Apply, hidden style, sheets, schema36 and stale/locked edits remain atomic",async()=>{
 await walls();const c:CadCommand={type:"upsert-model-projection",id:"front",name:"Front",partIds:["part"],basis:"XZ",origin:[10,10],scale:.02,layerId:"drawings"};
 const before=documentState(),review=await previewCadCommand(c);assert.ok(review.result.ok,review.result.reason);assert.deepEqual(documentState(),before);assert.ok((await applyCadPlan(review.planId)).ok);
 const v=cadDocument.modelPresentation!.projections.front;assert.equal(v.method,"brep-hlr");assert.ok(Object.keys(v.outputs).length>4);assert.ok(Object.values(v.outputs).every(e=>e.partId==="part"));
 assert.ok(Object.values(v.outputs).some(e=>(feature(e.objectId).params.points as number[][])?.some(p=>Math.abs(p[1]-52)<1e-6)));
 await apply({type:"upsert-model-sheet",id:"sheet",name:"Elevation",artboardId:"board",denominator:50,placements:{front:[20,40]},origin:[0,0],size:[210,297]});assert.equal(modelSheetDxf("sheet").skipped,0);assert.match(modelSheetSvg("sheet"),/svg/);
 const saved=serializeDocument(cadDocument);assert.equal(JSON.parse(saved).version,36);assert.deepEqual(deserializeDocument(saved),cadDocument);const bad=JSON.parse(saved);bad.version=32;assert.throws(()=>deserializeDocument(JSON.stringify(bad)),/version 33/);
 const stale=await previewCadCommand({...c,origin:[20,40]});await apply({type:"rename-object",objectId:"building",name:"New name"});assert.equal((await applyCadPlan(stale.planId)).ok,false);
 await apply({type:"set-layer-locked",layerId:"drawings",locked:true});await apply({type:"set-object-visible",objectId:"door",visible:true});const state=documentState(),depth=cadHistory.past.length;const r=await dispatchCadCommand({type:"update-primitive",objectId:"door",params:{width:1500,depth:400,height:2100}});assert.equal(r.ok,false);assert.deepEqual(documentState(),state);assert.equal(cadHistory.past.length,depth);
});
