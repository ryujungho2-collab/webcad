import assert from "node:assert/strict";
import {beforeEach,test} from "node:test";
import type {CadCommand} from "@agent-webcad/cad-commands";
import {validateCommand} from "@agent-webcad/cad-commands";
import {serializeDocument,deserializeDocument,DEFAULT_VECTOR_STYLE,type CadConstructionDefinition} from "@agent-webcad/cad-document";
import {cadDocument} from "../src/state/cadDocument";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {previewCadCommand,applyCadPlan,getCadPlanDrawingPaths} from "../src/state/documentPlans";
import {cadHistory,undoDocument,redoDocument} from "../src/state/history";
import {assertConstructionEvaluation} from "../src/precision/constructionGeometry";
import {constructionReferenceChoices,reassignConstructionSource} from "../src/precision/constructionReferences";
import type {DrawingTopology} from "../src/precision/drawingTopology";
import {buildDependencyGraph} from "../src/state/dependencyGraph";
import {queryCadDocument} from "../src/state/documentQuery";
import {collectArtboardExportDrawings} from "../src/export/exportModel";
import {resetTestDocument,documentState} from "./helpers/documentHarness";
import {createConstructionChain} from "./helpers/constructionChain";

beforeEach(resetTestDocument);
const f=(id:string)=>Object.values(cadDocument.features).find(f=>f.output===id)!;
const points=(id:string)=>f(id).params.points as [number,number,number][];
const topo=(id:string)=>f(id).params.topology as DrawingTopology;
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-6,`${a} ≈ ${b}`);
async function apply(c:CadCommand){const result=await dispatchCadCommand(c);assert.ok(result.ok,result.reason);return result;}
async function reject(c:CadCommand,reason:RegExp){const before=documentState(),history=cadHistory.getPastLabels();const result=await dispatchCadCommand(c);assert.equal(result.ok,false);assert.match(result.reason!,reason);assert.deepEqual(documentState(),before);assert.deepEqual(cadHistory.getPastLabels(),history);}
const update=(id:string,definition:CadConstructionDefinition):CadCommand=>({type:"update-construction",objectId:id,definition});
async function point(id:string,x:number,y=0,z=0){await apply({type:"create-drawing",id,name:id,drawing:"point",params:{points:[[x,y,z]],workPlane:"XY",construction:true}});}

test("source reassignment updates graph, caches, dependent constructions and dimensions in one reviewed Undo",async()=>{
  await createConstructionChain(apply);await point("C",20);
  await apply({type:"create-dimension",id:"dim",dimension:"linear",params:{workPlane:"XY",sourceObjectId:"AB",points:[[0,0],[100,0]],orientation:"aligned",offset:10}});
  const before=documentState(),history=cadHistory.getPastLabels().length,topology=JSON.stringify(Object.values(cadDocument.features).map(f=>f.params.topology));
  const command=update("AB",{operation:"segment",firstId:"C",secondId:"B"}),plan=await previewCadCommand(command);assert.ok(plan.result.ok,plan.result.reason);assert.deepEqual(documentState(),before);
  for(const id of ["AB","M","L","P","Q","dim"])assert.ok(plan.changes.some(c=>c.objectId===id),id);
  assert.deepEqual(getCadPlanDrawingPaths(plan.planId,"AB")!.after,[[20,0,0],[100,0,0]]);
  assert.ok((await applyCadPlan(plan.planId)).ok);assert.deepEqual(f("AB").inputs,["C","B"]);near(points("M")[0][0],60);near(points("P")[0][1],Math.sqrt(6300));near(points("Q")[0][1],-Math.sqrt(6300));
  assert.deepEqual(f("dim").params.points,[[20,0],[100,0]]);assert.equal(JSON.stringify(Object.values(cadDocument.features).map(f=>f.params.topology)),topology);assert.equal(cadHistory.getPastLabels().length,history+1);assertConstructionEvaluation(cadDocument);
  const query=await queryCadDocument(["AB"]);assert.equal(query.objects[0].dependencies!.object!.operation,"segment(C, B)");
  assert.ok(buildDependencyGraph(cadDocument));const after=documentState();assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),after);
  const loaded=deserializeDocument(serializeDocument(cadDocument));assertConstructionEvaluation(loaded);assert.deepEqual(loaded,cadDocument);
});
test("rebinding first/second point elements preserves names, IDs and styles; obsolete source no longer drives",async()=>{
  await point("A",0);await point("B",10);await apply({type:"create-drawing",id:"path",drawing:"polyline",params:{points:[[20,5,0],[30,5,0],[30,15,0]],workPlane:"XY"}});
  await apply({type:"create-construction",id:"line",name:"Named line",construction:false,workPlane:"XY",definition:{operation:"segment",firstId:"A",secondId:"B"}});
  const object=structuredClone(cadDocument.objects.line),topology=structuredClone(topo("line"));f("line").params.vectorStyle={...DEFAULT_VECTOR_STYLE,stroke:"#ff0000",strokeWidth:2};
  await apply(update("line",{operation:"segment",firstId:"path",secondId:"B",elements:{first:{topologyId:topo("path").controls[1].id}}}));assert.deepEqual(points("line")[0],[30,5,0]);assert.deepEqual(cadDocument.objects.line,object);assert.deepEqual(topo("line"),topology);assert.deepEqual(f("line").params.vectorStyle,{...DEFAULT_VECTOR_STYLE,stroke:"#ff0000",strokeWidth:2});assert.equal(f("line").params.construction,false);
  await apply({type:"edit-drawing-control",objectId:"A",controlId:topo("A").controls[0].id,point:[100,100,0]});assert.deepEqual(points("line")[0],[30,5,0]);
  await apply({type:"edit-drawing-control",objectId:"path",controlId:topo("path").controls[1].id,point:[40,5,0]});assert.deepEqual(points("line")[0],[40,5,0]);
});
test("midpoint reassigns edges and whole endpoint span; bisector reassigns the matching midpoint",async()=>{
  await createConstructionChain(apply);await apply({type:"create-drawing",id:"path",drawing:"polyline",params:{points:[[0,20,0],[100,20,0],[100,60,0]],workPlane:"XY"}});
  await apply({type:"create-construction",id:"M2",workPlane:"XY",definition:{operation:"midpoint",segmentId:"path",elements:{segment:{topologyId:topo("path").segments[0].id}}}});
  await apply(update("M2",{operation:"midpoint",segmentId:"path",elements:{segment:{topologyId:topo("path").segments[1].id}}}));assert.deepEqual(points("M2")[0],[100,40,0]);
  await apply(update("M2",{operation:"midpoint",segmentId:"path",elements:{segment:{span:"endpoints"}}}));assert.deepEqual(points("M2")[0],[50,40,0]);
  await apply(update("M2",{operation:"midpoint",segmentId:"path",elements:{segment:{topologyId:topo("path").segments[0].id}}}));
  await apply(update("L",{operation:"perpendicular-bisector",segmentId:"path",midpointId:"M2",elements:{segment:{topologyId:topo("path").segments[0].id}}}));
  assert.deepEqual(points("L")[0],[50,20,0]);assert.deepEqual(f("L").inputs,["path","M2"]);assertConstructionEvaluation(cadDocument);

});
test("signed intersection branch and circular element reassign explicitly",async()=>{
  await createConstructionChain(apply);const id=topo("P").controls[0].id;
  await apply(update("P",{operation:"intersection",firstId:"L",secondId:"O",branch:"negative",elements:{second:{topologyId:topo("O").curves[0].id}}}));near(points("P")[0][1],-80);assert.equal(topo("P").controls[0].id,id);
  await apply({type:"create-drawing",id:"circle2",drawing:"circle",params:{center:[50,0,0],radius:60,workPlane:"XY"}});await apply(update("P",{operation:"intersection",firstId:"L",secondId:"circle2",branch:"positive"}));near(points("P")[0][1],60);
});
for(const operation of ["line-through","ray-through"] as const)test(`${operation} changes sources without converting result kind`,async()=>{
  await point("A",0);await point("B",10);await point("C",20,5);await apply({type:"create-construction",id:"result",workPlane:"XY",definition:{operation,firstId:"A",secondId:"B"}});const kind=f("result").params.kind;
  await apply(update("result",{operation,firstId:"A",secondId:"C"}));assert.deepEqual(points("result"),[[0,0,0],[20,5,0]]);assert.equal(f("result").params.kind,kind);
});
test("self/indirect cycles, operation changes and missing sources reject atomically",async()=>{
  await createConstructionChain(apply);
  await reject(update("AB",{operation:"segment",firstId:"AB",secondId:"B"}),/Cyclic/);
  await reject(update("AB",{operation:"segment",firstId:"M",secondId:"B"}),/Cyclic/);
  await reject(update("AB",{operation:"ray-through",firstId:"A",secondId:"B"}),/preserve the operation/);
  await reject(update("AB",{operation:"segment",firstId:"missing",secondId:"B"}),/Missing construction source/);
  await reject(update("A",{operation:"midpoint",segmentId:"AB"}),/saved live construction/);
});
test("wrong plane/elevation, invalid topology and lost branches reject without changing definition",async()=>{
  await createConstructionChain(apply);await point("high",20,0,10);await apply({type:"create-drawing",id:"xz",drawing:"point",params:{workPlane:"XZ",points:[[20,0,10]]}});
  await reject(update("AB",{operation:"segment",firstId:"xz",secondId:"B"}),/another work plane/);
  await reject(update("AB",{operation:"segment",firstId:"high",secondId:"B"}),/different elevations/);
  await reject(update("M",{operation:"midpoint",segmentId:"AB",elements:{segment:{topologyId:"missing"}}}),/missing or on another/);
  await apply({type:"create-drawing",id:"away",drawing:"circle",params:{center:[300,0,0],radius:10,workPlane:"XY"}});
  await reject(update("P",{operation:"intersection",firstId:"L",secondId:"away",branch:"positive"}),/does not exist/);
});
test("output and downstream locks reject; locked source remains usable for read-only reassignment",async()=>{
  await createConstructionChain(apply);await point("C",20);await apply({type:"create-layer",id:"locked",name:"Locked"});
  await apply({type:"move-object-to-layer",objectId:"P",layerId:"locked"});await apply({type:"set-layer-locked",layerId:"locked",locked:true});
  await reject(update("AB",{operation:"segment",firstId:"C",secondId:"B"}),/output layer is locked/);
  await reject(update("P",{operation:"intersection",firstId:"L",secondId:"O",branch:"negative"}),/output layer is locked/);
  await apply({type:"set-layer-locked",layerId:"locked",locked:false});await apply({type:"move-object-to-layer",objectId:"P",layerId:"layer-default"});await apply({type:"move-object-to-layer",objectId:"C",layerId:"locked"});await apply({type:"set-layer-locked",layerId:"locked",locked:true});
  await apply(update("AB",{operation:"segment",firstId:"C",secondId:"B"}));near(points("M")[0][0],60);
});
test("locked associative annotation rejects geometry and graph edits together",async()=>{
  await createConstructionChain(apply);await point("C",20);await apply({type:"create-dimension",id:"dim",dimension:"linear",params:{workPlane:"XY",sourceObjectId:"AB",points:[[0,0],[100,0]],orientation:"aligned",offset:10}});await apply({type:"create-layer",id:"refs",name:"Refs"});await apply({type:"move-object-to-layer",objectId:"dim",layerId:"refs"});await apply({type:"set-layer-locked",layerId:"refs",locked:true});await reject(update("AB",{operation:"segment",firstId:"C",secondId:"B"}),/locked layer/);
});
test("source/element choices match evaluation and reset obsolete IDs on source change",async()=>{
  await createConstructionChain(apply);await apply({type:"create-drawing",id:"path",drawing:"polyline",params:{points:[[0,10,0],[100,10,0],[100,30,0]],workPlane:"XY"}});
  const choices=constructionReferenceChoices(cadDocument,"path",f("M").construction!,"segment","XY");assert.ok(choices.some(c=>c.element?.span==="endpoints"));assert.equal(choices.filter(c=>c.label.startsWith("Edge")).length,2);
  const next=reassignConstructionSource({...f("M").construction!,elements:{segment:{topologyId:"old"}}},"segment","AB");assert.equal(next.elements,undefined);assert.equal(next.operation,"midpoint");assert.ok(validateCommand(update("M",next)));
  assert.equal(validateCommand({type:"update-construction",objectId:"M",definition:{operation:"midpoint",segmentId:""}}),false);
});
test("unchanged definition has no history; stale reviews cannot publish",async()=>{
  await createConstructionChain(apply);const history=cadHistory.getPastLabels().length;const result=await dispatchCadCommand(update("AB",f("AB").construction!));assert.equal(result.changed,false);assert.equal(cadHistory.getPastLabels().length,history);
  const plan=await previewCadCommand(update("P",{operation:"intersection",firstId:"L",secondId:"O",branch:"negative"}));assert.ok(plan.result.ok);await point("other",50,10);const before=documentState();assert.equal((await applyCadPlan(plan.planId)).ok,false);assert.deepEqual(documentState(),before);
});
test("artboard rendering export reads updated construction coordinates",async()=>{
  await createConstructionChain(apply);await apply({type:"create-artboard",id:"board",name:"Sheet",workPlane:"XY",origin:[-100,-100],size:[300,300]});await point("C",20);await apply(update("AB",{operation:"segment",firstId:"C",secondId:"B"}));const p=collectArtboardExportDrawings("board").find(d=>d.objectId==="AB");assert.ok(p);near(p.points[0][0],20);
});
