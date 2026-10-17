import assert from "node:assert/strict";
import {beforeEach,test} from "node:test";
import {validateCommand,type CadCommand} from "@agent-webcad/cad-commands";
import {serializeDocument,deserializeDocument} from "@agent-webcad/cad-document";
import {endpointRadiusArc} from "../src/precision/endpointRadiusArc";
import {planeToWorld,WORK_PLANES,type Vec3} from "../src/precision/workPlane";
import {cadDocument} from "../src/state/cadDocument";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {previewCadCommand,applyCadPlan} from "../src/state/documentPlans";
import {cadHistory,undoDocument,redoDocument} from "../src/state/history";
import {buildPrimitiveMesh,inspectSolid} from "../src/cad/kernelGeometryService";
import {encodeDxf} from "../src/interop/dxfWriter";
import {planDxfImport} from "../src/interop/dxfImport";
import {getWorldDrawingGeometry} from "../src/precision/worldGeometry";
import {collectArtboardExportDrawings} from "../src/export/exportModel";
import {encodeSvg} from "../src/export/svgWriter";
import type {DrawingTopology} from "../src/precision/drawingTopology";
import {documentState,resetTestDocument} from "./helpers/documentHarness";

beforeEach(resetTestDocument);
const near=(a:number,b:number,t=1e-7)=>assert.ok(Math.abs(a-b)<t,`${a} approximately ${b}`);
async function apply(c:CadCommand){const r=await dispatchCadCommand(c);assert.ok(r.ok,r.reason);return r;}
async function reject(c:CadCommand,reason:RegExp){const before=documentState(),past=cadHistory.getPastLabels();const r=await dispatchCadCommand(c);assert.equal(r.ok,false);assert.match(r.reason!,reason);assert.deepEqual(documentState(),before);assert.deepEqual(cadHistory.getPastLabels(),past);}
const command=(id="arc"):Extract<CadCommand,{type:"create-endpoint-radius-arc"}>=>({type:"create-endpoint-radius-arc",id,points:[[0,0,0],[6,0,0]],radius:5,centreSide:"left",direction:"ccw",workPlane:"XY"});
const f=(id:string)=>Object.values(cadDocument.features).find(f=>f.output===id)!;

test("independent 3-4-5 centres and both directions preserve exact endpoints",()=>{
  for(const side of ["left","right"] as const)for(const direction of ["cw","ccw"] as const){const r=endpointRadiusArc([0,0],[6,0],5,side,direction);assert.ok(r.ok);const c=r.curve;near(c.center[0],3);near(c.center[1],side==="left"?4:-4);assert.equal(Math.sign(c.endAngle-c.startAngle),direction==="ccw"?1:-1);
    for(const [a,p] of [[c.startAngle,[0,0]],[c.endAngle,[6,0]]] as const){near(c.center[0]+5*Math.cos(a),p[0]);near(c.center[1]+5*Math.sin(a),p[1]);}
    const minor=(side==="left")===(direction==="ccw");near(Math.abs(c.endAngle-c.startAngle),minor?2*Math.asin(.6):2*Math.PI-2*Math.asin(.6));}
});
test("rotated chords and translated large coordinates retain signed centre side",()=>{
  for(const offset of [0,1e9]){const r=endpointRadiusArc([offset,offset],[offset,offset+6],5,"left","cw");assert.ok(r.ok);near(r.curve.center[0],offset-4,1e-6);near(r.curve.center[1],offset+3,1e-6);near(Math.hypot(r.curve.center[0]-offset,r.curve.center[1]-offset),5,1e-6);}
});
test("diameter merges centre candidates while retaining CW/CCW semicircles",()=>{
  for(const side of ["left","right"] as const)for(const direction of ["cw","ccw"] as const){const r=endpointRadiusArc([-5,0],[5,0],5,side,direction);assert.ok(r.ok);assert.ok(r.curve.diametric);assert.deepEqual(r.curve.center,[0,0]);near(r.curve.endAngle-r.curve.startAngle,direction==="ccw"?Math.PI:-Math.PI);}
  assert.ok(endpointRadiusArc([0,0],[10+1e-8,0],5,"left","cw").ok);assert.equal(endpointRadiusArc([0,0],[10.001,0],5,"left","cw").ok,false);
});
test("invalid, insufficient-radius and angularly unresolved geometry rejects",()=>{
  for(const [a,b,r] of [[[0,0],[0,0],5],[[0,0],[6,0],2],[[0,0],[6,0],0],[[0,0],[Infinity,0],5],[[0,0],[1,0],1e15]] as const)assert.equal(endpointRadiusArc([...a],[...b],r,"left","ccw").ok,false);
});
test("public command validates endpoint, radius, centre and direction contracts",()=>{
  assert.ok(validateCommand(command()));for(const extra of [{radius:0},{radius:Infinity},{centreSide:"closest"},{direction:"shortest"},{points:[[0,0,0]]},{workPlane:"UCS"}])assert.equal(validateCommand({...command(),...extra}),false);
});
test("detached review creates an ordinary arc, one Undo and unchanged source schema",async()=>{
  const before=documentState(),past=cadHistory.getPastLabels().length,plan=await previewCadCommand(command());assert.ok(plan.result.ok,plan.result.reason);assert.deepEqual(documentState(),before);assert.equal(cadHistory.getPastLabels().length,past);assert.ok((await applyCadPlan(plan.planId)).ok);
  assert.equal(f("arc").params.kind,"arc");assert.equal(f("arc").construction,undefined);assert.deepEqual(f("arc").inputs,[]);near(Number(f("arc").params.radius),5);assert.equal(cadHistory.getPastLabels().length,past+1);const saved=serializeDocument(cadDocument);assert.equal(JSON.parse(saved).version,1);assert.deepEqual(deserializeDocument(saved),cadDocument);
  const after=documentState();assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),after);
});
test("XY/XZ/YZ use the ordered local chord",async()=>{
  for(const plane of ["XY","XZ","YZ"] as const){await apply({...command(plane),workPlane:plane,points:[[0,0],[6,0]].map(p=>planeToWorld(p as [number,number],WORK_PLANES[plane])) as [Vec3,Vec3]});const expected=planeToWorld([3,4],WORK_PLANES[plane]);(f(plane).params.center as number[]).forEach((v,i)=>near(v,expected[i]));}
});
test("invalid geometry, off-plane endpoints, missing sketch and locks reject atomically",async()=>{
  await reject({...command(),radius:2},/twice the radius/);await reject({...command(),points:[[0,0,0],[0,0,0]]},/distinct/);await reject({...command(),points:[[0,0,1],[6,0,1]]},/work plane/);await reject({...command(),sketchId:"missing"},/missing/);
  await apply({type:"create-sketch",id:"s",workPlane:"XY"});await reject({...command(),sketchId:"s",workPlane:"XZ"},/different/);await apply({type:"set-layer-locked",layerId:"layer-default",locked:true});await reject(command(),/locked/);await reject({...command(),sketchId:"s"},/locked/);
});
test("sketch radius driving retains endpoint identities and signed major sweep",async()=>{
  await apply({type:"create-sketch",id:"s",workPlane:"XY"});await apply({...command(),sketchId:"s",direction:"cw"});const first=cadDocument.sketches!.s.geometry[0];assert.equal(first.kind,"arc");if(first.kind!=="arc")return;assert.equal(cadDocument.sketches!.s.constraints.length,0);
  await apply({type:"add-sketch-constraint",sketchId:"s",constraint:{id:"r",kind:"radius",geometryId:first.id,value:5}});await apply({type:"set-sketch-dimension",sketchId:"s",constraintId:"r",value:7});const next=cadDocument.sketches!.s.geometry[0];assert.equal(next.kind,"arc");if(next.kind!=="arc")return;
  assert.equal(next.startId,first.startId);assert.equal(next.endId,first.endId);assert.equal(next.curveId,first.curveId);near(next.radius,7);near(next.endAngle-next.startAngle,first.endAngle-first.startAngle);assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)).sketches!.s.geometry[0],next);
});
test("closed sketch arc profile regenerates live extrusion after radius driving",async()=>{
  await apply({type:"create-sketch",id:"s",workPlane:"XY"});await apply({...command(),sketchId:"s",points:[[5,0,0],[-5,0,0]]});const a=cadDocument.sketches!.s.geometry[0];assert.equal(a.kind,"arc");if(a.kind!=="arc")return;
  await apply({type:"add-sketch-geometry",sketchId:"s",geometry:{id:"line",kind:"line",start:[-5,0],end:[5,0],startId:"ls",endId:"le",segmentId:"edge"}});
  for(const [id,pointId,endId] of [["c1",a.startId,"le"],["c2",a.endId,"ls"]])await apply({type:"add-sketch-constraint",sketchId:"s",constraint:{id,kind:"coincident",first:{geometryId:a.id,pointId},second:{geometryId:"line",pointId:endId}}});
  await apply({type:"add-sketch-constraint",sketchId:"s",constraint:{id:"r",kind:"radius",geometryId:a.id,value:5}});await apply({type:"create-extrude",id:"solid",profileObjectIds:[a.id,"line"],distance:3});near((await inspectSolid({params:f("solid").params})).volume!,37.5*Math.PI,1e-4);
  await apply({type:"set-sketch-dimension",sketchId:"s",constraintId:"r",value:6});near((await inspectSolid({params:f("solid").params})).volume!,54*Math.PI,1e-3);
});
test("face sketch uses its local frame and unresolved face rejects",async()=>{
  await apply({type:"create-primitive",id:"body",primitive:"box",params:{width:20,depth:16,height:10}});const mesh=await buildPrimitiveMesh(f("body").params),face=mesh.faces!.find(f=>f.key.split("|")[0].endsWith(",10.000000"))!;
  await apply({type:"attach-work-plane-face",id:"top",name:"Top",source:{kind:"brep-face",objectId:"body",topologyId:face.key}});await apply({type:"create-face-sketch",id:"s",planeId:"top"});const sketch=cadDocument.sketches!.s,frame={id:"top",...sketch.faceFrame!};
  await apply({...command(),sketchId:"s",workPlane:sketch.workPlane,points:[[0,0],[6,0]].map(p=>planeToWorld(p as [number,number],frame)) as [Vec3,Vec3]});const g=cadDocument.sketches!.s.geometry[0];assert.equal(g.kind,"arc");if(g.kind!=="arc")return;near(g.center[0],3);near(g.center[1],4);near((f("arc").params.center as number[])[2],10);
  cadDocument.sketches!.s.faceStatus="missing";await reject({...command("blocked"),sketchId:"s",workPlane:sketch.workPlane},/unresolved/);
});
test("existing standalone centre grip preserves source topology",async()=>{
  await apply(command());const topology=f("arc").params.topology as DrawingTopology,control=topology.controls.find(c=>c.role==="center")!;assert.ok(control);await apply({type:"edit-drawing-control",objectId:"arc",controlId:control.id,point:[13,4,0]});near((f("arc").params.center as number[])[0],13);near(Number(f("arc").params.radius),5);assert.deepEqual(f("arc").params.topology,topology);
});
test("major CW arc DXF roundtrip and artboard SVG reuse existing output",async()=>{
  await apply({...command(),direction:"cw"});const before=getWorldDrawingGeometry(cadDocument.objects.arc,f("arc"))!,encoded=encodeDxf(cadDocument,["arc"]);assert.equal(encoded.skipped,0);const plan=planDxfImport(encoded.text,new Map(),"endpoint-radius");assert.ok(plan.ok);await apply(plan.command);const id=cadDocument.rootObjects.at(-1)!,after=getWorldDrawingGeometry(cadDocument.objects[id],f(id))!;near(after.radius!,5);assert.equal(after.points!.length,before.points!.length);after.points!.forEach((p,i)=>p.forEach((v,j)=>near(v,before.points![i][j])));
  await apply({type:"create-artboard",id:"board",name:"Sheet",workPlane:"XY",origin:[-10,-10],size:[30,30]});const drawings=collectArtboardExportDrawings("board");assert.equal(drawings.length,2);assert.ok(drawings.every(d=>!d.closed));const svg=encodeSvg(drawings);assert.equal((svg.match(/<polyline/g)??[]).length,2);assert.ok(!/NaN|Infinity/.test(svg));
});
test("document changes prevent stale reviewed arc application",async()=>{
  const plan=await previewCadCommand(command());assert.ok(plan.result.ok);await apply({type:"create-drawing",id:"other",drawing:"point",params:{points:[[1,0,0]],workPlane:"XY"}});const before=documentState();assert.equal((await applyCadPlan(plan.planId)).ok,false);assert.deepEqual(documentState(),before);
});
