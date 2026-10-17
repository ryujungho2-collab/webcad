import assert from "node:assert/strict";
import {beforeEach,test} from "node:test";
import type {CadCommand} from "@agent-webcad/cad-commands";
import {serializeDocument,deserializeDocument} from "@agent-webcad/cad-document";
import {cadDocument} from "../../src/state/cadDocument";
import {dispatchCadCommand} from "../../src/state/dispatchCadCommand";
import {previewCadCommand,applyCadPlan,discardCadPlan} from "../../src/state/documentPlans";
import {cadHistory,undoDocument,redoDocument} from "../../src/state/history";
import {exactDrawingContour,segmentPoint} from "../../src/features/drawing-editing/geometry/contourEditing";
import {curveCornerSolutions} from "../../src/features/drawing-editing/geometry/arcCorners";
import {documentState,resetTestDocument} from "../helpers/documentHarness";
import {WORK_PLANES,planeToWorld,type Vec3} from "../../src/precision/workPlane";
import {drawingModelToWorld} from "../../src/precision/worldGeometry";
import type {DrawingTopology} from "../../src/precision/drawingTopology";
beforeEach(resetTestDocument);
const f=(id:string)=>Object.values(cadDocument.features).find(f=>f.output===id)!;
const e=(id:string)=>({object:cadDocument.objects[id],feature:f(id)});
const path=(id:string)=>exactDrawingContour(e(id).object,f(id));
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-6,`${a} ≈ ${b}`);
const point=(a:Vec3,b:Vec3)=>a.forEach((v,i)=>near(v,b[i]));
async function apply(c:CadCommand){const r=await dispatchCadCommand(c);assert.ok(r.ok,r.reason);return r;}
async function setup(plane:"XY"|"XZ"|"YZ"="XY",reverse=false){
 const p=(x:number,y:number)=>planeToWorld([x,y],WORK_PLANES[plane]).map((v,i)=>v+7*WORK_PLANES[plane].normal[i]) as Vec3;
 await apply({type:"create-drawing",id:"a",drawing:"arc",params:{workPlane:plane,center:p(0,10),radius:10,startAngle:reverse?1.5*Math.PI:Math.PI,endAngle:reverse?Math.PI:1.5*Math.PI}});
 await apply({type:"create-drawing",id:"b",drawing:"arc",params:{workPlane:plane,center:p(-10,0),radius:10,startAngle:reverse?Math.PI/2:0,endAngle:reverse?0:Math.PI/2}});return p;
}
function command(treatment:"fillet"|"chamfer"="fillet",reverse=false):Extract<CadCommand,{type:"connect-drawings"}>{return {type:"connect-drawings",firstId:"a",secondId:"b",firstPoint:segmentPoint(path("a").segments[0],reverse?1:0,path("a").workPlane),secondPoint:segmentPoint(path("b").segments[0],reverse?0:1,path("b").workPlane),treatment,distance:2,...(treatment==="chamfer"?{secondDistance:3}:{}),id:"result"};}
function choose(c:Extract<CadCommand,{type:"connect-drawings"}>){const ss=curveCornerSolutions(e(c.firstId),e(c.secondId),c.firstPoint,c.secondPoint,c.treatment,c.distance,c.secondDistance);assert.ok(ss.length);return {...c,solutionIndex:ss.findIndex(s=>c.treatment==="fillet"?s.center![0]>-5:s.corner[0]>-5)};}
test("arc–arc Fillet independently solves the inward circle tangencies and one reversible reviewed transaction",async()=>{
 const p=await setup(),c=choose(command()),before=documentState(),h=cadHistory.getPastLabels().length,topology=[f("a").params.topology,f("b").params.topology],review=await previewCadCommand(c);assert.ok(review.result.ok,review.result.reason);assert.deepEqual(documentState(),before);assert.ok((await applyCadPlan(review.planId)).ok);discardCadPlan(review.planId);
 const q=5-Math.sqrt(7),s=path("result").segments[0];point(s.center!,p(-q,q));near(s.radius!,2);point(s.start,p(-q*1.25,10+(q-10)*1.25));point(s.end,p(-10+(10-q)*1.25,q*1.25));
 point(path("a").segments[0].end,s.start);point(path("b").segments[0].start,s.end);assert.deepEqual([f("a").params.topology,f("b").params.topology],topology);assert.equal(cadHistory.getPastLabels().length,h+1);const after=documentState();assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),after);assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)),cadDocument);
});
test("arc–arc Chamfer D1/D2 are independent source arc lengths, not chord lengths",async()=>{
 const p=await setup();await apply(choose(command("chamfer")));const s=path("result").segments[0];point(s.start,p(-10*Math.sin(.2),10-10*Math.cos(.2)));point(s.end,p(-10+10*Math.cos(.3),10*Math.sin(.3)));near((Math.PI/2-Math.abs(path("a").segments[0].sweep!))*10,2);near((Math.PI/2-Math.abs(path("b").segments[0].sweep!))*10,3);
});
test("finite arc corners preserve elevated work planes, source order and clockwise sweeps",async()=>{
 for(const plane of ["XY","XZ","YZ"] as const)for(const reverse of [false,true])for(const treatment of ["fillet","chamfer"] as const){resetTestDocument();const p=await setup(plane,reverse),base=command(treatment,reverse),ss=curveCornerSolutions(e("a"),e("b"),base.firstPoint,base.secondPoint,treatment,2,base.secondDistance),index=ss.findIndex(s=>Math.hypot(...(s.center??s.corner).map((v,i)=>v-p(0,0)[i]))<5);assert.ok(index>=0);await apply({...base,solutionIndex:index});const s=path("result").segments[0];if(treatment==="fillet")point(s.center!,p(-(5-Math.sqrt(7)),5-Math.sqrt(7)));else point(s.start,p(-10*Math.sin(.2),10-10*Math.cos(.2)));}
});
async function lens(){await apply({type:"create-drawing",id:"lens",drawing:"polyline",params:{workPlane:"XY",closed:true,points:[[0,0,0],[-10,10,0]],bulges:[Math.tan(Math.PI/8),Math.tan(Math.PI/8)]}});}
function corner(treatment:"fillet"|"chamfer",index=0):CadCommand{return {type:"edit-drawing-corner",objectId:"lens",controlId:(f("lens").params.topology as DrawingTopology).controls.find(c=>c.index===index)!.id,treatment,distance:2,...(treatment==="chamfer"?{secondDistance:3}:{}),distanceSpace:"world"};}
function connected(id:string){const p=path(id);assert.ok(p.closed);p.segments.forEach((s,i)=>point(s.end,p.segments[(i+1)%p.segments.length].start));}
test("closed arc–arc Fillet retains stable edges and closure including the wrapping vertex",async()=>{
 for(const index of [0,1]){resetTestDocument();await lens();const topology=structuredClone(f("lens").params.topology as DrawingTopology),before=documentState();await apply(corner("fillet",index));connected("lens");assert.equal(path("lens").segments.length,3);const t=f("lens").params.topology as DrawingTopology;assert.ok(topology.segments.every(s=>t.segments.some(n=>n.id===s.id)));assert.ok(topology.controls.every(c=>t.controls.some(n=>n.id===c.id)));assert.equal(path("lens").segments.filter(s=>Math.abs(s.radius!-2)<1e-6).length,1);assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());connected("lens");await apply({type:"offset-drawing",objectId:"lens",distance:.1,side:"left"});connected(cadDocument.rootObjects.find(id=>id.startsWith("offset-"))!);}
});
test("closed arc–arc Chamfer keeps both trims connected and supports subsequent Offset",async()=>{
 await lens();await apply(corner("chamfer"));connected("lens");const points=f("lens").params.points as Vec3[];point(points[0],[-10*Math.sin(.2),10-10*Math.cos(.2),0]);point(points[1],[-10+10*Math.cos(.3),10*Math.sin(.3),0]);await apply({type:"offset-drawing",objectId:"lens",distance:.2,side:"left"});connected(cadDocument.rootObjects.find(id=>id.startsWith("offset-"))!);assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)),cadDocument);
});
test("impossible radius/setbacks and unavailable solutions are atomic; stale review cannot apply",async()=>{
 await setup();for(const c of [{...command(),distance:1000},{...command("chamfer"),distance:20},{...command(),solutionIndex:7}]){const before=documentState(),h=cadHistory.getPastLabels().length;assert.equal((await dispatchCadCommand(c)).ok,false);assert.deepEqual(documentState(),before);assert.equal(cadHistory.getPastLabels().length,h);}
 const r=await previewCadCommand(choose(command()));assert.ok(r.result.ok);await apply({type:"rename-object",objectId:"a",name:"Changed"});const before=documentState();assert.equal((await applyCadPlan(r.planId)).ok,false);assert.deepEqual(documentState(),before);discardCadPlan(r.planId);
});
test("closed corner consumption and source lock reject without geometry or history publication",async()=>{
 await lens();const c=corner("chamfer"),before=documentState();assert.equal((await dispatchCadCommand({...c,distance:100} as CadCommand)).ok,false);assert.deepEqual(documentState(),before);cadDocument.layers[cadDocument.objects.lens.layerId].locked=true;const locked=documentState(),h=cadHistory.getPastLabels().length;assert.equal((await dispatchCadCommand(c)).ok,false);assert.deepEqual(documentState(),locked);assert.equal(cadHistory.getPastLabels().length,h);
});

test("externally touching sources use the external R+r loci with independently calculated G1 contacts",async()=>{
 for(const swap of [false,true]){resetTestDocument();for(const [id,x] of [["a",0],["b",20]] as const)await apply({type:"create-drawing",id,drawing:"arc",params:{workPlane:"XY",center:[x,0,0],radius:10,startAngle:0,endAngle:Math.PI}});
 const ids=swap?["b","a"]:["a","b"],picks=ids.map(id=>segmentPoint(path(id).segments[0],id==="a"?.8:.2,"XY"));await apply({type:"connect-drawings",firstId:ids[0],secondId:ids[1],firstPoint:picks[0],secondPoint:picks[1],treatment:"fillet",distance:2,id:"result"});const s=path("result").segments[0];point(s.center!,[10,Math.sqrt(44),0]);point(swap?s.end:s.start,[100/12,Math.sqrt(44)*10/12,0]);point(swap?s.start:s.end,[20-100/12,Math.sqrt(44)*10/12,0]);near(s.radius!,2);}
});
test("rotated, uniformly scaled and reflected arc frames preserve exact contacts and retained endpoints",async()=>{
 for(const reflect of [false,true])for(const treatment of ["fillet","chamfer"] as const){resetTestDocument();await setup();const angle=.4,k=reflect?-2:2,map=(p:Vec3):Vec3=>[100+k*p[0]*Math.cos(angle)-2*p[1]*Math.sin(angle),200+k*p[0]*Math.sin(angle)+2*p[1]*Math.cos(angle),p[2]];
 for(const id of ["a","b"]){const o=cadDocument.objects[id];o.transform={translation:[0,0,0],rotation:[0,0,angle*180/Math.PI],scale:[k,2,1]};const origin=drawingModelToWorld(o,f(id),[0,0,0])!;o.transform.translation=[100-origin[0],200-origin[1],-origin[2]];}
 const c=command(treatment),endpoints=[path("a").segments[0].start,path("b").segments[0].end];c.distance=4;if(treatment==="chamfer")c.secondDistance=6;const solutions=curveCornerSolutions(e("a"),e("b"),c.firstPoint,c.secondPoint,treatment,4,c.secondDistance),expected=treatment==="fillet"?map([-(5-Math.sqrt(7)),5-Math.sqrt(7),7]):map([0,0,7]),index=solutions.findIndex(s=>Math.hypot(...(s.center??s.corner).map((v,i)=>v-expected[i]))<1e-6);assert.ok(index>=0);await apply({...c,solutionIndex:index});const s=path("result").segments[0];if(treatment==="fillet")point(s.center!,expected);else point(s.start,map([-10*Math.sin(.2),10-10*Math.cos(.2),7]));point(path("a").segments[0].start,endpoints[0]);point(path("b").segments[0].end,endpoints[1]);}
});
test("closed line–arc Chamfer and Fillet retain unrelated edges and can Offset their results",async()=>{
 for(const treatment of ["fillet","chamfer"] as const){resetTestDocument();await apply({type:"create-drawing",id:"lens",drawing:"polyline",params:{workPlane:"XY",closed:true,points:[[0,0,0],[20,0,0],[20,10,0],[0,10,0]],bulges:[.2,0,0,0]}});const old=f("lens").params.topology as DrawingTopology;await apply(corner(treatment,1));connected("lens");const t=f("lens").params.topology as DrawingTopology;assert.ok(old.segments.every(s=>t.segments.some(n=>n.id===s.id)));assert.equal(path("lens").segments.length,5);await apply({type:"offset-drawing",objectId:"lens",distance:.1,side:"left"});connected(cadDocument.rootObjects.find(id=>id.startsWith("offset-"))!);}
});
