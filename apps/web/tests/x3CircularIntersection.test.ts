import assert from "node:assert/strict";
import {beforeEach,test} from "node:test";
import type {CadCommand} from "@agent-webcad/cad-commands";
import {serializeDocument,deserializeDocument,validConstructionDefinition,type CadConstructionDefinition} from "@agent-webcad/cad-document";
import {circularIntersections,pointOnCircularDomain} from "../src/precision/circularIntersection";
import {assertConstructionEvaluation} from "../src/precision/constructionGeometry";
import {cadDocument} from "../src/state/cadDocument";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {previewCadCommand,applyCadPlan,getCadPlanConstructionStatus} from "../src/state/documentPlans";
import {cadHistory,undoDocument,redoDocument} from "../src/state/history";
import {planeToWorld,WORK_PLANES,type WorkPlaneId} from "../src/precision/workPlane";
import {queryCadDocument} from "../src/state/documentQuery";
import {collectArtboardExportDrawings} from "../src/export/exportModel";
import {resetTestDocument,documentState} from "./helpers/documentHarness";

beforeEach(resetTestDocument);
const f=(id:string)=>cadDocument.features[`feature-${id}`];
const p=(id:string)=>(f(id).params.points as number[][])[0];
const near=(a:number,b:number,t=1e-6)=>assert.ok(Math.abs(a-b)<t,`${a} ≈ ${b}`);
async function apply(c:CadCommand){const r=await dispatchCadCommand(c);assert.ok(r.ok,r.reason);return r;}
async function reject(c:CadCommand,reason:RegExp){const before=documentState(),past=cadHistory.getPastLabels();const r=await dispatchCadCommand(c);assert.equal(r.ok,false);assert.match(r.reason!,reason);assert.deepEqual(documentState(),before);assert.deepEqual(cadHistory.getPastLabels(),past);}
async function circle(id:string,x:number,radius=5,plane:WorkPlaneId="XY",elevation=0){const center=planeToWorld([x,0],WORK_PLANES[plane]).map((v,i)=>v+elevation*WORK_PLANES[plane].normal[i]);await apply({type:"create-drawing",id,name:id,drawing:"circle",params:{center,radius,workPlane:plane}});}
async function pair(){await circle("a",0);await circle("b",6);}
const definition=(branch:"positive"|"negative"="positive",firstId="a",secondId="b"):CadConstructionDefinition=>({operation:"intersection",firstId,secondId,branch});
const create=(id="hit",branch:"positive"|"negative"="positive",firstId="a",secondId="b"):CadCommand=>({type:"create-construction",id,construction:false,workPlane:"XY",definition:definition(branch,firstId,secondId)});
const move=(id:string,x:number):CadCommand=>({type:"move-object",objectId:id,translation:[x,0,0]});

test("independent 3-4-5 geometry and large translated centres preserve both signed branches",()=>{
  for(const offset of [0,1e9]){
    const r=circularIntersections([offset,offset],5,[offset+6,offset],5);assert.equal(r.status,"two-points");assert.equal(r.branches.length,2);
    for(const b of r.branches){near(b.point[0],offset+3);near(b.point[1],offset+(b.branch==="positive"?4:-4));near(Math.hypot(b.point[0]-offset,b.point[1]-offset),5);near(Math.hypot(b.point[0]-offset-6,b.point[1]-offset),5);}
  }
});
test("unequal radii, rotated centre axis and reversed source order use signed side rather than array index",()=>{
  const r=circularIntersections([0,0],5,[0,4],3),positive=r.branches.find(b=>b.branch==="positive")!;near(positive.point[0],-3);near(positive.point[1],4);
  const reversed=circularIntersections([0,4],3,[0,0],5).branches.find(b=>b.branch==="negative")!;reversed.point.forEach((v,i)=>near(v,positive.point[i]));
});
test("external/internal tangency, separation, containment, concentric and coincident support circles are distinct",()=>{
  for(const [r1,d,r2,status] of [[5,10,5,"tangent"],[5,2,3,"tangent"],[5,11,5,"separated"],[5,1,2,"contained"],[5,0,2,"concentric"],[5,0,5,"coincident"]] as const){const r=circularIntersections([0,0],r1,[d,0],r2);assert.equal(r.status,status);assert.equal(r.branches.length,status==="tangent"?2:0);if(status==="tangent"){assert.deepEqual(r.branches[0].point,r.branches[1].point);near(Math.hypot(...r.branches[0].point),r1);}}
  assert.equal(circularIntersections([0,0],5,[10+1e-8,0],5).status,"tangent");assert.equal(circularIntersections([0,0],5,[10+1e-4,0],5).status,"separated");
  assert.throws(()=>circularIntersections([0,0],0,[1,0],1),/positive radii/);
});
test("CW/CCW, wrapped angles and closed arc endpoints filter exact points",()=>{
  assert.ok(pointOnCircularDomain([3,4],[0,0],5,0,Math.PI));assert.equal(pointOnCircularDomain([3,-4],[0,0],5,0,Math.PI),false);
  assert.ok(pointOnCircularDomain([3,-4],[0,0],5,0,-Math.PI));assert.ok(pointOnCircularDomain([5,0],[0,0],5,1.5*Math.PI,2.5*Math.PI));assert.ok(pointOnCircularDomain([0,-5],[0,0],5,0,-Math.PI/2));assert.equal(pointOnCircularDomain([-5,0],[0,0],5,0,-Math.PI/2),false);
});
test("circle pair Review persists ordered basis, exact cache status, one Undo and v22",async()=>{
  await pair();const before=documentState(),past=cadHistory.getPastLabels().length,plan=await previewCadCommand(create());assert.ok(plan.result.ok,plan.result.reason);assert.deepEqual(documentState(),before);assert.equal(getCadPlanConstructionStatus(plan.planId,"hit"),"two-points");
  assert.ok((await applyCadPlan(plan.planId)).ok);assert.deepEqual(p("hit"),[3,4,0]);assert.deepEqual(f("hit").inputs,["a","b"]);assert.equal(f("hit").construction?.operation,"intersection");assert.equal((f("hit").construction as any).branchBasis,"center-line");assert.equal(cadHistory.getPastLabels().length,past+1);
  const saved=serializeDocument(cadDocument);assert.equal(JSON.parse(saved).version,22);const loaded=deserializeDocument(saved);assertConstructionEvaluation(loaded);assert.deepEqual(loaded,cadDocument);
  const old=JSON.parse(saved);old.version=21;assert.throws(()=>deserializeDocument(JSON.stringify(old)),/version 22/);
  const after=documentState();assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),after);
});
test("circle-arc and arc-arc accept only the saved branch inside both finite domains",async()=>{
  await pair();await apply({type:"create-drawing",id:"arc",drawing:"arc",params:{center:[0,0,0],radius:5,startAngle:0,endAngle:Math.PI,workPlane:"XY"}});
  await apply(create("upper","positive","arc","b"));near(p("upper")[1],4);assert.equal(f("upper").params.intersectionStatus,"one-domain-point");await reject(create("lower","negative","arc","b"),/does not exist in the source domains/);
  await apply({type:"create-drawing",id:"arc2",drawing:"arc",params:{center:[6,0,0],radius:5,startAngle:Math.PI,endAngle:0,workPlane:"XY"}});await apply(create("arc-hit","positive","arc","arc2"));near(p("arc-hit")[1],4);
  await apply({type:"create-drawing",id:"bottom",drawing:"arc",params:{center:[6,0,0],radius:5,startAngle:0,endAngle:-Math.PI,workPlane:"XY"}});await reject(create("none","positive","arc","bottom"),/does not exist/);
});
test("source edits coalesce at tangency then split with both IDs and signed branches intact",async()=>{
  await pair();await apply(create("positive"));await apply(create("negative","negative"));const topology=JSON.stringify([f("positive").params.topology,f("negative").params.topology]);
  await apply(move("b",4));assert.deepEqual(p("positive"),[5,0,0]);assert.deepEqual(p("negative"),p("positive"));assert.equal(f("positive").params.intersectionStatus,"tangent");
  await apply(move("b",0));near(p("positive")[1],4);near(p("negative")[1],-4);assert.equal(JSON.stringify([f("positive").params.topology,f("negative").params.topology]),topology);assertConstructionEvaluation(cadDocument);
});
test("lost circular branch rejects source change without switching to another arc solution",async()=>{
  await pair();await apply({type:"create-drawing",id:"arc",drawing:"arc",params:{center:[0,0,0],radius:5,startAngle:0,endAngle:Math.PI,workPlane:"XY"}});await apply(create("hit","positive","arc","b"));
  await reject({type:"lengthen-drawing",objectId:"arc",endpoint:"end",mode:"angle",value:20},/does not exist|defined|rejected/i);
  await reject(move("b",6),/separated/);
});
test("explicit reassignment changes branch and source order without replacing point topology",async()=>{
  await pair();await apply(create());const topology=structuredClone(f("hit").params.topology);
  await apply({type:"update-construction",objectId:"hit",definition:definition("negative")});near(p("hit")[1],-4);await apply({type:"update-construction",objectId:"hit",definition:definition("positive","b","a")});near(p("hit")[1],-4);assert.deepEqual(f("hit").params.topology,topology);
  const query=await queryCadDocument(["hit"]);assert.match(query.objects[0].dependencies!.object!.operation!,/basis=center-line/);
});
test("dependent segment/midpoint follow circular source movement; locked dependents roll back",async()=>{
  await pair();await apply(create());await apply({type:"create-drawing",id:"origin",drawing:"point",params:{points:[[0,0,0]],workPlane:"XY"}});await apply({type:"create-construction",id:"segment",workPlane:"XY",definition:{operation:"segment",firstId:"origin",secondId:"hit"}});await apply({type:"create-construction",id:"mid",workPlane:"XY",definition:{operation:"midpoint",segmentId:"segment"}});
  await apply(move("b",2));near(p("mid")[0],2);near(p("mid")[1],1.5);await apply({type:"create-layer",id:"refs",name:"Refs"});await apply({type:"move-object-to-layer",objectId:"mid",layerId:"refs"});await apply({type:"set-layer-locked",layerId:"refs",locked:true});await reject(move("b",0),/output layer is locked/);
});
test("circular pairs use XY/XZ/YZ planes and common elevation; different heights reject",async()=>{
  for(const plane of ["XY","XZ","YZ"] as const){await circle(`${plane}a`,0,5,plane,7);await circle(`${plane}b`,6,5,plane,7);await apply({type:"create-construction",id:plane,workPlane:plane,definition:definition("positive",`${plane}a`,`${plane}b`)});const expected=planeToWorld([3,4],WORK_PLANES[plane]).map((v,i)=>v+7*WORK_PLANES[plane].normal[i]);p(plane).forEach((v,i)=>near(v,expected[i]));}
  await circle("high",6,5,"XY",10);await reject(create("wrong","positive","XYa","high"),/different elevations/);
});
test("nonuniform circles, absent domains and coincident supports reject; stale/status caches diagnose",async()=>{
  await pair();const before=documentState(),past=cadHistory.getPastLabels();
  await assert.rejects(dispatchCadCommand(create("coincident","positive","a","a")),/Invalid CAD command/);assert.deepEqual(documentState(),before);assert.deepEqual(cadHistory.getPastLabels(),past);
  await circle("same",0);await reject(create("coincident","positive","a","same"),/coincident/);await circle("small",0,2);await reject(create("concentric","positive","a","small"),/concentric/);await circle("inside",1,2);await reject(create("contained","positive","a","inside"),/contained/);
  await apply({type:"scale-object",objectId:"b",scale:[2,1,1]});await reject(create(),/exact circular source/);
  await apply({type:"scale-object",objectId:"b",scale:[1,1,1]});await apply(create());const bad=deserializeDocument(serializeDocument(cadDocument));bad.features["feature-hit"].params.intersectionStatus="tangent";assert.throws(()=>assertConstructionEvaluation(bad),/Stale construction intersection status/);
});
test("legacy line-circle semantics remain version 4 and cannot silently become centre-axis branches",async()=>{
  await pair();await apply({type:"create-drawing",id:"line",drawing:"infinite-line",params:{points:[[0,0,0],[1,0,0]],workPlane:"XY"}});await apply(create("legacy","positive","line","a"));near(p("legacy")[0],5);assert.equal((f("legacy").construction as any).branchBasis,undefined);assert.equal(JSON.parse(serializeDocument(cadDocument)).version,4);
  assert.equal(validConstructionDefinition({...definition(),branchBasis:"wrong"}),false);
  const malformed=structuredClone(cadDocument);malformed.features["feature-legacy"].construction=definition();malformed.features["feature-legacy"].inputs=["a","b"];assert.throws(()=>assertConstructionEvaluation(malformed),/explicit centre-line branch/);
});
test("artboard output follows a finite segment driven by a circular intersection",async()=>{
  await pair();await apply(create());await apply({type:"create-drawing",id:"origin",drawing:"point",params:{points:[[0,0,0]],workPlane:"XY"}});
  await apply({type:"create-construction",id:"edge",construction:false,workPlane:"XY",definition:{operation:"segment",firstId:"origin",secondId:"hit"}});
  await apply({type:"create-artboard",id:"board",name:"Sheet",workPlane:"XY",origin:[-10,-10],size:[30,30]});
  const output=()=>collectArtboardExportDrawings("board").find(d=>d.objectId==="edge")!;
  near(output().points[1][0],3);near(output().points[1][1],4);
  await apply(move("b",2));near(output().points[1][0],4);near(output().points[1][1],3);
  assert.ok(output().points.flat().every(Number.isFinite));
});
