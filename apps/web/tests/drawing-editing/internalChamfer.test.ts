import assert from "node:assert/strict";
import { test, beforeEach, afterEach } from "node:test";
import { validateCommand, type CadCommand } from "@agent-webcad/cad-commands";
import { serializeDocument, deserializeDocument } from "@agent-webcad/cad-document";
import { cadDocument } from "../../src/state/cadDocument";
import { dispatchCadCommand } from "../../src/state/dispatchCadCommand";
import { previewCadCommand, applyCadPlan, discardCadPlan } from "../../src/state/documentPlans";
import { cadHistory, undoDocument, redoDocument } from "../../src/state/history";
import { editDrawingCornerParams } from "../../src/features/drawing-editing/geometry/drawingOperations";
import { createDrawingTopology, type DrawingTopology } from "../../src/precision/drawingTopology";
import { profileSegments } from "../../src/precision/profileGeometry";
import { drawingModelToWorld } from "../../src/precision/worldGeometry";
import { resolveDimension } from "../../src/precision/dimensionGeometry";
import { buildExtrudeMesh } from "../../src/cad/kernelGeometryService";
import type { Vec3 } from "../../src/precision/workPlane";
import { resetTestDocument, restoreTestDocument, documentState, meshVolume } from "../helpers/documentHarness";
const original = structuredClone(cadDocument);
beforeEach(resetTestDocument); afterEach(() => { restoreTestDocument(original);cadHistory.clear(); });
const feature = (id = "profile") => Object.values(cadDocument.features).find(f => f.output === id)!;
const topology = () => feature().params.topology as DrawingTopology;
const near = (a:number,b:number) => assert.ok(Math.abs(a-b)<1e-6,`${a} ≈ ${b}`);
async function apply(c:CadCommand) { const r=await dispatchCadCommand(c);assert.ok(r.ok,r.reason);return r; }
async function setup() { await apply({type:"create-drawing",id:"profile",drawing:"rectangle",params:{workPlane:"XY",points:[[0,0,0],[20,0,0],[20,10,0],[0,10,0]]}}); }
const command = (extra:Partial<Extract<CadCommand,{type:"edit-drawing-corner"}>>={}):CadCommand => ({type:"edit-drawing-corner",objectId:"profile",controlId:topology().controls.find(c=>c.index===1)!.id,treatment:"chamfer",distance:3,secondDistance:7,distanceSpace:"world",...extra});
async function rejected(c:CadCommand, reason:RegExp) { const before=structuredClone(cadDocument),h=cadHistory.getPastLabels();const r=await dispatchCadCommand(c);assert.equal(r.ok,false);assert.match(r.reason!,reason);assert.deepEqual(cadDocument,before);assert.deepEqual(cadHistory.getPastLabels(),h); }

test("internal D2 validation is finite, positive and chamfer-only; omitted distances preserve symmetry", async()=>{
  await setup();assert.ok(validateCommand(command()));
  for(const secondDistance of [0,-1,NaN,Infinity,"7mm",null]) assert.equal(validateCommand({...command(),secondDistance}),false);
  assert.equal(validateCommand(command({treatment:"fillet"})),false);assert.equal(validateCommand({...command(),distanceSpace:"screen"}),false);
  await apply(command({secondDistance:undefined,distanceSpace:undefined}));assert.deepEqual((feature().params.points as Vec3[]).slice(1,3),[[17,0,0],[20,3,0]]);
});
test("reviewed internal corner updates edge and angular dimensions and a real solid in one persisted transaction", async()=>{
  await setup(); const incoming=topology().segments[0].id,outgoing=topology().segments[1].id,ids=topology().controls.map(c=>c.id),edges=topology().segments.map(s=>s.id);
  await apply({type:"create-dimension",id:"length",dimension:"linear",params:{sourceObjectId:"profile",sourceSegmentId:incoming,workPlane:"XY",points:[[0,0],[20,0]]}});
  await apply({type:"create-dimension",id:"angle",dimension:"angular",params:{first:{objectId:"profile",segmentId:incoming},second:{objectId:"profile",segmentId:outgoing},branch:{firstRay:1,secondRay:1,sweep:"ccw"},radius:4}});
  await apply({type:"create-construction",id:"mid",workPlane:"XY",definition:{operation:"midpoint",segmentId:"profile",elements:{segment:{topologyId:incoming}}}});
  await apply({type:"create-extrude",id:"plate",profileObjectIds:["profile"],distance:5});
  const before=structuredClone(cadDocument),h=cadHistory.getPastLabels().length,p=await previewCadCommand(command());assert.ok(p.result.ok,p.result.reason);
  assert.deepEqual(cadDocument,before);assert.equal(cadHistory.getPastLabels().length,h);assert.ok(p.changes.some(c=>c.objectId==="length"));assert.ok(p.changes.some(c=>c.objectId==="plate"));
  assert.ok((await applyCadPlan(p.planId)).ok);discardCadPlan(p.planId);
  assert.deepEqual(feature("length").params.points,[[0,0],[17,0]]);near(resolveDimension(feature("angle").params)!.value,Math.PI/2);
  assert.deepEqual(feature("mid").params.points,[[8.5,0,0]]);assert.deepEqual(feature("mid").construction!.elements,{segment:{topologyId:incoming}});
  assert.deepEqual(feature("angle").params.first,{objectId:"profile",segmentId:incoming});assert.deepEqual(feature("angle").params.second,{objectId:"profile",segmentId:outgoing});
  assert.ok(ids.every(id=>topology().controls.some(c=>c.id===id)));assert.ok(edges.every(id=>topology().segments.some(s=>s.id===id)));
  near(meshVolume(await buildExtrudeMesh(feature("plate").params)),(200-3*7/2)*5);assert.equal(cadHistory.getPastLabels().length,h+1);
  assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)),cadDocument);
  const after=documentState();await undoDocument();assert.deepEqual(documentState(),documentState(before));await redoDocument();assert.deepEqual(documentState(),after);
});
test("closing and first corner retain incoming/outgoing identities with D1/D2 assigned in contour order",async()=>{
  for(const index of [0,3]){resetTestDocument();await setup();const t=structuredClone(topology());await apply(command({controlId:t.controls[index].id}));
    const p=feature().params.points as Vec3[];assert.deepEqual(p.slice(index,index+2),index===0?[[0,3,0],[7,0,0]]:[[3,10,0],[0,3,0]]);
    assert.ok(t.segments.every(s=>topology().segments.some(n=>n.id===s.id)));assert.equal(feature().params.closed,true);
  }
});
for(const angle of [35,125]) test(`non-right ${angle} degree corner uses independent setback distances`,()=>{
  const theta=angle*Math.PI/180,points:Vec3[]=[[20,0,0],[0,0,0],[20*Math.cos(theta),20*Math.sin(theta),0]];
  const source={kind:"polyline",workPlane:"XY",points,topology:createDrawingTopology("polyline",{points},"path")};
  const p=editDrawingCornerParams(source,"path:vertex:1","chamfer",3,7)!;assert.ok(p);
  const a=(p.points as Vec3[])[1],b=(p.points as Vec3[])[2];near(a[0],3);near(b[0],7*Math.cos(theta));near(b[1],7*Math.sin(theta));near(Math.hypot(...a.map((v,i)=>v-b[i])),Math.sqrt(58-42*Math.cos(theta)));assert.equal(source.points.length,3);
});
test("unaffected analytic arc, bulge and curve identity survive another corner chamfer and fillet",()=>{
  const points:Vec3[]=[[0,0,0],[20,0,0],[20,10,0],[0,10,0]],source={kind:"polyline",closed:true,points,bulges:[0,0,.2,0],workPlane:"XY",topology:createDrawingTopology("polyline",{points,closed:true,bulges:[0,0,.2,0]},"arc-profile")};
  source.topology.curves.push({id:source.topology.segments[2].id,kind:"arc"});const arc=profileSegments("polyline",source)[2];
  for(const treatment of ["chamfer","fillet"] as const){const p=editDrawingCornerParams(source,"arc-profile:vertex:1",treatment,2,treatment==="chamfer"?4:undefined)!;assert.ok(p);
    const t=p.topology as DrawingTopology,edge=t.segments.find(s=>s.id===source.topology.segments[2].id)!;assert.equal(edge.kind,"arc");assert.equal((p.bulges as number[])[edge.index!],.2);assert.deepEqual(t.curves.find(c=>c.id===edge.id),source.topology.curves[0]);
    const kept=profileSegments("polyline",p)[edge.index!];assert.deepEqual(kept.center,arc.center);near(kept.radius!,arc.radius!);near(kept.sweep!,arc.sweep!);
  }
});
test("world mm works in elevated XY/XZ/YZ with rotation, reflection and uniform scaling; legacy stays local",async()=>{
  for(const plane of ["XY","XZ","YZ"] as const){resetTestDocument();const from=(x:number,y:number):Vec3=>plane==="XZ"?[x,9,y]:plane==="YZ"?[9,x,y]:[x,y,9];
    await apply({type:"create-drawing",id:"profile",drawing:"polyline",params:{workPlane:plane,points:[from(0,0),from(20,0),from(20,10)]}});
    cadDocument.objects.profile.transform={translation:[5,6,7],rotation:plane==="XY"?[0,0,30]:plane==="XZ"?[0,-30,0]:[30,0,0],scale:plane==="XY"?[-2,2,1]:plane==="XZ"?[-2,1,2]:[1,-2,2]};
    const obj=structuredClone(cadDocument.objects.profile),f=structuredClone(feature()),corner=drawingModelToWorld(obj,f,from(20,0))!;
    await apply(command());const pts=feature().params.points as Vec3[];assert.deepEqual(pts.slice(1,3),[from(18.5,0),from(20,3.5)]);
    pts.slice(1,3).forEach((p,i)=>{const world=drawingModelToWorld(cadDocument.objects.profile,feature(),p)!;near(Math.hypot(...world.map((v,j)=>v-corner[j])),i?7:3);});
    for(const p of [from(0,0),from(20,10)]) assert.deepEqual(drawingModelToWorld(cadDocument.objects.profile,feature(),p),drawingModelToWorld(obj,f,p));
  }
  resetTestDocument();await setup();cadDocument.objects.profile.transform!.scale=[2,2,1];await apply(command({secondDistance:undefined,distanceSpace:undefined}));assert.deepEqual((feature().params.points as Vec3[]).slice(1,3),[[17,0,0],[20,3,0]]);
});
test("edge consumption, nonuniform scale, adjacent arcs, invalid target and downstream locks are atomic",async()=>{
  await setup();await rejected(command({distance:20}),/D1.*previous edge/);await rejected(command({secondDistance:10}),/D2.*next edge/);
  await rejected(command({controlId:"missing"}),/internal corner/);
  cadDocument.objects.profile.transform!.scale=[2,1,1];await rejected(command(),/uniform/);cadDocument.objects.profile.transform!.scale=[1,1,1];
  feature().params.bulges=[.2,0,0,0];await rejected(command(),/Adjacent arcs/);delete feature().params.bulges;
  await apply({type:"create-dimension",id:"length",dimension:"linear",params:{sourceObjectId:"profile",sourceSegmentId:topology().segments[0].id,points:[[0,0],[20,0]]}});
  await apply({type:"create-layer",id:"locked",name:"Locked dimensions"});await apply({type:"move-object-to-layer",objectId:"length",layerId:"locked"});cadDocument.layers.locked.locked=true;
  await rejected(command(),/locked/);cadDocument.layers.locked.locked=false;cadDocument.layers["layer-default"].locked=true;await rejected(command(),/unlock/);
});
test("open-contour new self-intersection and degenerate/nonplanar corners are rejected without flattening",()=>{
  const make=(points:Vec3[])=>({kind:"polyline",workPlane:"XY",points,topology:createDrawingTopology("polyline",{points},"p")});
  const source=make([[0,0,0],[10,0,0],[10,10,0],[9,10,0],[9,1,0],[8.5,1,0]]);const before=structuredClone(source);assert.equal(editDrawingCornerParams(source,"p:vertex:1","chamfer",3,7),null);assert.deepEqual(source,before);
  for(const points of [[[0,0,0],[10,0,0],[20,0,0]],[[0,0,0],[10,0,0],[10,10,1]]] as Vec3[][])assert.equal(editDrawingCornerParams(make(points),"p:vertex:1","chamfer",1,2),null);
});
test("stale reviewed corner plan cannot overwrite a concurrent edit",async()=>{
  await setup();const p=await previewCadCommand(command());assert.ok(p.result.ok,p.result.reason);await apply({type:"move-object",objectId:"profile",translation:[1,2,0]});const before=structuredClone(cadDocument),h=cadHistory.getPastLabels();assert.equal((await applyCadPlan(p.planId)).ok,false);assert.deepEqual(cadDocument,before);assert.deepEqual(cadHistory.getPastLabels(),h);discardCadPlan(p.planId);
});
