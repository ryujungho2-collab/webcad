import assert from "node:assert/strict";
import { test, beforeEach, afterEach } from "node:test";
import { validateCommand, type CadCommand } from "@agent-webcad/cad-commands";
import { serializeDocument, deserializeDocument } from "@agent-webcad/cad-document";
import { cadDocument } from "../../src/state/cadDocument";
import { dispatchCadCommand } from "../../src/state/dispatchCadCommand";
import { previewCadCommand, applyCadPlan, discardCadPlan } from "../../src/state/documentPlans";
import { cadHistory, undoDocument, redoDocument } from "../../src/state/history";
import { exactDrawingContour, contourLength } from "../../src/features/drawing-editing/geometry/contourEditing";
import { planeToWorld, WORK_PLANES, type Vec3 } from "../../src/precision/workPlane";
import { resetTestDocument, restoreTestDocument, documentState } from "../helpers/documentHarness";
const original=structuredClone(cadDocument);
beforeEach(resetTestDocument); afterEach(()=>{restoreTestDocument(original);cadHistory.clear();});
const feature=(id:string)=>Object.values(cadDocument.features).find(f=>f.output===id)!;
const path=(id:string)=>exactDrawingContour(cadDocument.objects[id],feature(id));
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-6,`${a} ≈ ${b}`);
const point=(a:Vec3,b:Vec3)=>a.forEach((v,i)=>near(v,b[i]));
async function apply(c:CadCommand){const r=await dispatchCadCommand(c);assert.ok(r.ok,r.reason);return r;}
async function line(id:string,points:Vec3[],workPlane:"XY"|"XZ"|"YZ"="XY"){await apply({type:"create-drawing",id,drawing:"line",params:{points,workPlane}});}
const command=(extra:Partial<Extract<CadCommand,{type:"connect-drawings"}>>={}):CadCommand=>({type:"connect-drawings",firstId:"a",secondId:"b",firstPoint:[5,0,0],secondPoint:[0,5,0],treatment:"chamfer",distance:3,secondDistance:7,id:"connector",...extra});
async function setup(){await line("a",[[0,0,0],[20,0,0]]);await line("b",[[0,0,0],[0,20,0]]);}
async function rejected(c:CadCommand,reason:RegExp){const before=structuredClone(cadDocument),h=cadHistory.getPastLabels().length;const r=await dispatchCadCommand(c);assert.equal(r.ok,false);assert.match(r.reason!,reason);assert.deepEqual(cadDocument,before);assert.equal(cadHistory.getPastLabels().length,h);}

test("D2 is positive finite, exclusive to 2D Chamfer, and omission keeps legacy symmetry",async()=>{
  assert.ok(validateCommand(command()));
  for(const secondDistance of [0,-1,NaN,Infinity,"7mm",null]) assert.equal(validateCommand({...command(),secondDistance}),false);
  assert.equal(validateCommand(command({treatment:"fillet"})),false);
  await setup();await apply(command({secondDistance:undefined}));point(path("connector").segments[0].start,[3,0,0]);point(path("connector").segments[0].end,[0,3,0]);
});
test("reviewed asymmetric chamfer keeps topology, updates dimension/construction and restores one transaction",async()=>{
  await setup();await apply({type:"create-dimension",id:"dim",dimension:"linear",params:{sourceObjectId:"a",points:[[0,0],[20,0]]}});
  await apply({type:"create-construction",id:"mid",workPlane:"XY",definition:{operation:"midpoint",segmentId:"b"}});
  const before=structuredClone(cadDocument),h=cadHistory.getPastLabels().length,topologies=[feature("a").params.topology,feature("b").params.topology];
  const preview=await previewCadCommand(command());assert.ok(preview.result.ok,preview.result.reason);assert.deepEqual(cadDocument,before);assert.equal(cadHistory.getPastLabels().length,h);
  assert.ok(preview.changes.some(c=>c.objectId==="dim"));assert.ok(preview.changes.some(c=>c.objectId==="mid"));
  assert.ok((await applyCadPlan(preview.planId)).ok);discardCadPlan(preview.planId);
  point(path("connector").segments[0].start,[3,0,0]);point(path("connector").segments[0].end,[0,7,0]);near(contourLength(path("connector")),Math.sqrt(58));
  assert.deepEqual([feature("a").params.topology,feature("b").params.topology],topologies);assert.deepEqual(feature("dim").params.points,[[3,0],[20,0]]);point((feature("mid").params.points as Vec3[])[0],[0,13.5,0]);
  assert.equal(cadHistory.getPastLabels().length,h+1);assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)),cadDocument);
  const after=documentState();await undoDocument();assert.deepEqual(documentState(),documentState(before));await redoDocument();assert.deepEqual(documentState(),after);
});
for(const angle of [35,125])test(`D1/D2 are independent setbacks at ${angle} degrees with reversed source orientation`,async()=>{
  const theta=angle*Math.PI/180,ray:Vec3=[Math.cos(theta),Math.sin(theta),0];
  await line("a",[[20,0,0],[0,0,0]]);await line("b",[ray.map(v=>v*20) as Vec3,[0,0,0]]);
  await apply(command({secondPoint:ray.map(v=>v*5) as Vec3}));point(path("connector").segments[0].start,[3,0,0]);point(path("connector").segments[0].end,ray.map(v=>v*7) as Vec3);
  near(contourLength(path("connector")),Math.sqrt(9+49-42*Math.cos(theta)));
});
test("swapping setback values and negative retained branches preserves target identity",async()=>{
  await line("a",[[-20,0,0],[0,0,0]]);await line("b",[[0,0,0],[0,-20,0]]);
  await apply(command({firstPoint:[-5,0,0],secondPoint:[0,-5,0],distance:7,secondDistance:3}));point(path("connector").segments[0].start,[-7,0,0]);point(path("connector").segments[0].end,[0,-3,0]);
});
test("world-mm asymmetric setbacks preserve elevated XY/XZ/YZ frames under rotation, scale and reflection",async()=>{
  for(const plane of ["XY","XZ","YZ"] as const){
    const from=(p:number[]):Vec3=>planeToWorld([p[0],p[1]],WORK_PLANES[plane]).map((v,i)=>v+9*WORK_PLANES[plane].normal[i]) as Vec3;
    const a=`a${plane}`,b=`b${plane}`,c=`c${plane}`;await line(a,[from([0,0]),from([20,0])],plane);await line(b,[from([0,0]),from([0,20])],plane);
    // Independent world oracle: reflection then rotation about the bounds-centre pivot (10, 0).
    const turn=(p:number[])=>from([10-2*(p[0]-10)*Math.cos(Math.PI/6)-2*p[1]*Math.sin(Math.PI/6),-2*(p[0]-10)*Math.sin(Math.PI/6)+2*p[1]*Math.cos(Math.PI/6)]);
    cadDocument.objects[a].transform={translation:[0,0,0],rotation:plane==="XY"?[0,0,30]:plane==="XZ"?[0,-30,0]:[30,0,0],scale:plane==="YZ"?[1,-2,2]:plane==="XZ"?[-2,1,2]:[-2,2,1]};
    feature(b).params.points=[turn([0,0]),turn([0,20])];
    await apply(command({firstId:a,secondId:b,id:c,firstPoint:turn([5,0]),secondPoint:turn([0,5])}));point(path(c).segments[0].start,turn([1.5,0]));point(path(c).segments[0].end,turn([0,3.5]));
  }
});
test("D2 oversize, locked downstream, unavailable construction and stale review reject without partial mutation",async()=>{
  await setup();await rejected(command({secondDistance:20}),/D2.*second curve/);await rejected(command({distance:20}),/D1.*target/);
  await apply({type:"create-dimension",id:"dim",dimension:"linear",params:{sourceObjectId:"b",points:[[0,0],[0,20]]}});
  await apply({type:"create-layer",id:"locked",name:"Locked"});await apply({type:"move-object-to-layer",objectId:"dim",layerId:"locked"});cadDocument.layers.locked.locked=true;
  await rejected(command(),/lock/i);cadDocument.layers.locked.locked=false;
  await line("circle-spoke",[[0,0,0],[20,0,0]]);await apply({type:"create-drawing",id:"circle",drawing:"circle",params:{workPlane:"XY",center:[0,0,0],radius:2}});
  await apply({type:"create-construction",id:"cross",workPlane:"XY",definition:{operation:"intersection",firstId:"a",secondId:"circle",branch:"positive"}});await rejected(command(),/intersection|domain|branch/i);
  const p=await previewCadCommand(command({distance:1}));assert.ok(p.result.ok,p.result.reason);await apply({type:"move-object",objectId:"circle-spoke",translation:[0,1,0]});
  const before=structuredClone(cadDocument);assert.equal((await applyCadPlan(p.planId)).ok,false);assert.deepEqual(cadDocument,before);discardCadPlan(p.planId);
});
test("asymmetric chamfer hands an exact three-part contour to Join and curved-independent Offset",async()=>{
  await setup();await apply(command());await apply({type:"join-drawings",objectIds:["a","b","connector"],id:"joined"});
  near(contourLength(path("joined")),30+Math.sqrt(58));assert.equal(path("joined").segments.length,3);
  const offset=await apply({type:"offset-drawing",objectId:"joined",distance:1});assert.equal(path(offset.createdIds[0]).segments.length,3);assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)),cadDocument);
});
