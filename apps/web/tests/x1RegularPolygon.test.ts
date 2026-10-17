import assert from "node:assert/strict";
import {beforeEach,test} from "node:test";
import type {CadCommand} from "@agent-webcad/cad-commands";
import {serializeDocument,deserializeDocument} from "@agent-webcad/cad-document";
import type {DrawingTopology} from "../src/precision/drawingTopology";
import {regularPolygon} from "../src/precision/regularPolygon";
import {cadDocument} from "../src/state/cadDocument";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {previewCadCommand,applyCadPlan} from "../src/state/documentPlans";
import {undoDocument,redoDocument} from "../src/state/history";
import {measureDrawing} from "../src/precision/measurements";
import {buildPrimitiveMesh,inspectSolid} from "../src/cad/kernelGeometryService";
import {encodeDxf} from "../src/interop/dxfWriter";
import {planDxfImport} from "../src/interop/dxfImport";
import {collectArtboardExportDrawings} from "../src/export/exportModel";
import {encodeSvg} from "../src/export/svgWriter";
import {documentState,resetTestDocument} from "./helpers/documentHarness";

beforeEach(resetTestDocument);
const near=(a:number,b:number,t=1e-7)=>assert.ok(Math.abs(a-b)<t,`${a} ≈ ${b}`);
const command=(id="polygon"):Extract<CadCommand,{type:"create-regular-polygon"}>=>({type:"create-regular-polygon",id,center:[3,-4],sides:6,radius:10,radiusMode:"inscribed",rotation:0,workPlane:"XY"});
async function apply(c:CadCommand){const result=await dispatchCadCommand(c);assert.ok(result.ok,result.reason);return result;}
async function reject(c:CadCommand){const before=documentState();try{const result=await dispatchCadCommand(c);assert.equal(result.ok,false);}catch(cause){assert.match(String(cause),/Invalid CAD command payload/);}assert.deepEqual(documentState(),before);}

test("inscribed triangle, square and hexagon match independently known lengths and areas",()=>{
  for(const [sides,perimeter,area] of [[3,30*Math.sqrt(3),75*Math.sqrt(3)],[4,40*Math.sqrt(2),200],[6,60,150*Math.sqrt(3)]]){
    const p=regularPolygon([3,-4],sides,10,"inscribed",90);assert.ok(p.ok);near(p.points[0][0],3);near(p.points[0][1],6);
    const measured=measureDrawing({kind:"polyline",closed:true,points:p.points.map(v=>[...v,0])});near(measured.distance!,perimeter);near(measured.area!,area);
    for(const v of p.points)near(Math.hypot(v[0]-3,v[1]+4),10);
    assert.equal(new Set(p.points.map(p=>p.join(","))).size,sides);
  }
});
test("circumscribed square defines apothem and first edge outward normal",()=>{
  const p=regularPolygon([0,0],4,10,"circumscribed",0);assert.ok(p.ok);near(p.area,400);near(p.perimeter,80);
  near(p.points[0][0],10);near(p.points[0][1],-10);near(p.points[1][0],10);near(p.points[1][1],10);
  for(let i=0;i<4;i++){const a=p.points[i],b=p.points[(i+1)%4];near(Math.abs(a[0]*b[1]-a[1]*b[0])/Math.hypot(b[0]-a[0],b[1]-a[1]),10);}
});
test("bounded counts, degenerate edges and numeric overflow reject",()=>{
  for(const n of [0,2,3.5,129,Infinity])assert.equal(regularPolygon([0,0],n,10,"inscribed",0).ok,false);
  for(const r of [0,-1,1e-8,Infinity,1e200])assert.equal(regularPolygon([0,0],6,r,"inscribed",0).ok,false);
  assert.equal(regularPolygon([1e15,1e15],128,1,"inscribed",0).ok,false);
  assert.equal(regularPolygon([0,0],128,10,"inscribed",0).ok,true);
  assert.equal(regularPolygon([NaN,0],6,10,"inscribed",0).ok,false);
  assert.equal(regularPolygon([0,0],6,10,"inscribed",NaN).ok,false);
});
test("large translated centres preserve independent measurements",()=>{
  const p=regularPolygon([1e9,-1e9],4,10,"circumscribed",0);assert.ok(p.ok);const m=measureDrawing({kind:"polyline",closed:true,points:p.points.map(v=>[...v,0])});near(m.area!,400,1e-5);near(m.distance!,80,1e-5);
});
test("review is detached; one Undo/Redo and serialization restore ordinary polyline",async()=>{
  const before=documentState(),plan=await previewCadCommand(command());assert.ok(plan.result.ok,plan.result.reason);assert.deepEqual(documentState(),before);assert.ok((await applyCadPlan(plan.planId)).ok);
  const f=cadDocument.features["feature-polygon"];assert.equal(f.type,"drawing");assert.equal(f.params.kind,"polyline");assert.equal(f.params.closed,true);assert.equal((f.params.points as number[][]).length,6);
  const topology=f.params.topology as DrawingTopology;assert.equal(topology.controls.length,6);assert.equal(topology.segments.length,6);assert.equal(new Set([...topology.controls.map(c=>c.id),...topology.segments.map(s=>s.id)]).size,12);
  assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)).features[f.id],f);
  const after=documentState();assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),after);
  await apply({type:"create-extrude",id:"solid",profileObjectIds:["polygon"],distance:3});near((await inspectSolid({params:cadDocument.features["feature-solid"].params})).volume!,450*Math.sqrt(3),1e-4);
});
test("sketch has unique topology; free vertex editing regenerates dependent extrusion",async()=>{
  await apply({type:"create-sketch",id:"sketch",workPlane:"XY"});await apply({...command(),center:[0,0],sides:4,radiusMode:"circumscribed",sketchId:"sketch"});
  const sketch=cadDocument.sketches!.sketch,p=sketch.geometry[0];assert.equal(p.kind,"polyline");if(p.kind!=="polyline")return;
  assert.equal(p.vertices.length,4);assert.equal(p.segmentIds.length,4);assert.equal(new Set([...p.vertices.map(v=>v.id),...p.segmentIds]).size,8);assert.equal(sketch.constraints.length,0);
  await apply({type:"create-extrude",id:"solid",profileObjectIds:[p.id],distance:3});near((await inspectSolid({params:cadDocument.features["feature-solid"].params})).volume!,1200,1e-4);
  await apply({type:"move-sketch-point",sketchId:"sketch",point:{geometryId:p.id,pointId:p.vertices[0].id},position:[12,-10]});
  const next=cadDocument.sketches!.sketch.geometry[0];assert.equal(next.kind,"polyline");if(next.kind!=="polyline")return;
  assert.deepEqual(next.segmentIds,p.segmentIds);assert.deepEqual(next.vertices.map(v=>v.id),p.vertices.map(v=>v.id));near(next.vertices[0].point[0],12);
  near((await inspectSolid({params:cadDocument.features["feature-solid"].params})).volume!,1260,1e-4);
  assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)).sketches!.sketch.geometry[0],next);
});
test("XY/XZ/YZ and resolved face sketch map local polygon to the intended plane",async()=>{
  for(const plane of ["XY","XZ","YZ"] as const){await apply({...command(plane),workPlane:plane});const m=measureDrawing(cadDocument.features[`feature-${plane}`].params);near(m.area!,150*Math.sqrt(3));}
  await apply({type:"create-primitive",id:"body",primitive:"box",params:{width:20,depth:16,height:10}});
  const mesh=await buildPrimitiveMesh(cadDocument.features["feature-body"].params),face=mesh.faces!.find(f=>f.key.split("|")[0].endsWith(",10.000000"))!;
  await apply({type:"attach-work-plane-face",id:"top",name:"Top",source:{kind:"brep-face",objectId:"body",topologyId:face.key}});await apply({type:"create-face-sketch",id:"face",planeId:"top"});
  const sketch=cadDocument.sketches!.face;await apply({...command("face-polygon"),center:[0,0],radius:2,sketchId:sketch.id,workPlane:sketch.workPlane});
  const p=cadDocument.sketches!.face.geometry[0];assert.equal(p.kind,"polyline");if(p.kind!=="polyline")return;near(p.vertices[0].point[0],2);near(p.vertices[0].point[1],0);
  const world=cadDocument.features["feature-face-polygon"].params.points as number[][];assert.ok(world.every(p=>Math.abs(p[2]-10)<1e-7));
});
test("DXF closed polyline roundtrip and artboard SVG retain every polygon edge",async()=>{
  await apply({...command(),rotation:30});const original=cadDocument.features["feature-polygon"].params.points as number[][];
  const encoded=encodeDxf(cadDocument,["polygon"]);assert.equal(encoded.skipped,0);const imported=planDxfImport(encoded.text,new Map(),"polygon");assert.ok(imported.ok);await apply(imported.command);
  const id=cadDocument.rootObjects.at(-1)!,f=Object.values(cadDocument.features).find(f=>f.output===id)!;assert.equal(f.params.closed,true);const points=f.params.points as number[][];assert.equal(points.length,6);points.forEach((p,i)=>p.forEach((v,j)=>near(v,original[i][j])));
  await apply({type:"create-artboard",id:"board",name:"Sheet",workPlane:"XY",origin:[-20,-20],size:[40,40]});const drawings=collectArtboardExportDrawings("board");assert.equal(drawings.length,2);assert.ok(drawings.every(d=>d.closed));const svg=encodeSvg(drawings);assert.equal((svg.match(/<polygon/g)??[]).length,2);
});
test("invalid command and locked targets reject atomically",async()=>{
  await reject({...command(),sides:2});await reject({...command(),radius:-1});await reject({...command(),sketchId:"missing"});
  await apply({type:"create-sketch",id:"sketch",workPlane:"XY"});await reject({...command(),sketchId:"sketch",workPlane:"XZ"});
  await apply({type:"set-layer-locked",layerId:"layer-default",locked:true});await reject(command());await reject({...command(),sketchId:"sketch"});
});
test("changing document after review prevents stale apply",async()=>{
  const plan=await previewCadCommand(command());assert.ok(plan.result.ok);await apply({type:"create-drawing",id:"other",drawing:"line",params:{points:[[0,0,0],[10,0,0]],workPlane:"XY"}});const before=documentState();const result=await applyCadPlan(plan.planId);assert.equal(result.ok,false);assert.deepEqual(documentState(),before);
});
