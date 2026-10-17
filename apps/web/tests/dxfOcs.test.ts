import assert from "node:assert/strict";
import {beforeEach,test} from "node:test";
import {serializeDocument,deserializeDocument} from "@agent-webcad/cad-document";
import {parseDxf} from "../src/interop/dxfParser";
import {planDxfImport} from "../src/interop/dxfImport";
import {encodeDxf} from "../src/interop/dxfWriter";
import {dxfOcs,dxfWcsPlane} from "../src/interop/dxfOcs";
import {cadDocument} from "../src/state/cadDocument";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {previewCadCommand,applyCadPlan,discardCadPlan,getCadPlanDrawingPaths} from "../src/state/documentPlans";
import {cadHistory,undoDocument,redoDocument} from "../src/state/history";
import {getWorldDrawingGeometry} from "../src/precision/worldGeometry";
import {documentState,resetTestDocument} from "./helpers/documentHarness";
import type {Vec3} from "../src/precision/workPlane";
beforeEach(resetTestDocument);
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} ≈ ${b}`),point=(a:Vec3,b:Vec3)=>a.forEach((v,i)=>near(v,b[i]));
export const fixture=(body:(string|number)[],units=4)=>[0,"SECTION",2,"HEADER",9,"$INSUNITS",70,units,0,"ENDSEC",0,"SECTION",2,"ENTITIES",...body,0,"ENDSEC",0,"EOF"].join("\n")+"\n";
const feature=(id:string)=>Object.values(cadDocument.features).find(f=>f.output===id)!,world=(id:string)=>getWorldDrawingGeometry(cadDocument.objects[id],feature(id))!;
async function load(text:string,tag="ocs"){const p=planDxfImport(text,new Map(),tag);assert.ok(p.ok,p.ok?"":p.reason);assert.equal(p.stats.skipped.length,0,p.stats.skipped.join(";"));const r=await dispatchCadCommand(p.command);assert.ok(r.ok,r.reason);return cadDocument.rootObjects.at(-1)!;}
test("Autodesk arbitrary-axis basis matches independent principal, reverse and tilted normal coordinates",()=>{
 point(dxfOcs([0,0,-1]).toWorld([2,3,7]),[-2,3,-7]);point(dxfOcs([0,2,0]).toWorld([2,3,7]),[-2,7,3]);const q=Math.SQRT1_2;point(dxfOcs([0,1,1]).toWorld([2,3,7]),[-2,(7-3)*q,(7+3)*q]);for(const n of [[0,0,1],[.01,0,1],[.1,.2,1]] as Vec3[]){const f=dxfOcs(n);point(f.toLocal(f.toWorld([2,3,7])),[2,3,7]);}
});
test("OCS circle review applies exact center, units, tilted sample positions and one persisted Undo",async()=>{
 const before=documentState(),text=fixture([0,"CIRCLE",8,"Curve",10,2,20,3,30,7,40,5,210,0,220,1,230,1],5),p=planDxfImport(text,new Map(),"ocs");assert.ok(p.ok);const review=await previewCadCommand(p.command);assert.ok(review.result.ok,review.result.reason);assert.deepEqual(documentState(),before);const previewId="dxf-ocs-entity-0";point(getCadPlanDrawingPaths(review.planId,previewId,"authoring")!.after![0],[70,30,70]);point(getCadPlanDrawingPaths(review.planId,previewId)!.after![0],[-70,40*Math.SQRT1_2,100*Math.SQRT1_2]);assert.ok((await applyCadPlan(review.planId)).ok);discardCadPlan(review.planId);const id=cadDocument.rootObjects[0],q=Math.SQRT1_2;point(world(id).center!,[-20,40*q,100*q]);point(world(id).points![0],[-70,40*q,100*q]);near(Number(feature(id).params.radius),50);assert.equal(world(id).planeAligned,false);assert.equal(cadHistory.getPastLabels().length,1);const after=documentState();assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),after);assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)),cadDocument);
});
test("wrapped ARC and reverse extrusion preserve exact finite CCW OCS sweep and world endpoints",async()=>{
 const id=await load(fixture([0,"ARC",10,2,20,3,30,7,40,5,50,350,51,10,230,-1]));near(Number(feature(id).params.endAngle)-Number(feature(id).params.startAngle),Math.PI/9);const a=350*Math.PI/180,b=370*Math.PI/180;point(world(id).points![0],[-2-5*Math.cos(a),3+5*Math.sin(a),-7]);point(world(id).points!.at(-1)!,[-2-5*Math.cos(b),3+5*Math.sin(b),-7]);
});
test("LWPOLYLINE and elevated R12 POLYLINE retain outgoing bulges under OCS placement",async()=>{
 const base=[0,"LWPOLYLINE",90,2,70,0,38,7,210,0,220,1,230,0,10,0,20,0,42,-1,10,2,20,0];const id=await load(fixture(base));point(world(id).points![0],[0,7,0]);point(world(id).points!.at(-1)!,[-2,7,0]);assert.deepEqual(feature(id).params.bulges,[-1]);
 resetTestDocument();const legacy=await load(fixture([0,"POLYLINE",70,0,30,7,210,0,220,1,230,0,0,"VERTEX",10,0,20,0,42,-1,0,"VERTEX",10,2,20,0,0,"SEQEND"]));point(world(legacy).points![0],[0,7,0]);point(world(legacy).points!.at(-1)!,[-2,7,0]);assert.deepEqual(feature(legacy).params.bulges,[-1]);
});
test("analytic tilted circle/arc and signed bulge export/reimport preserve world geometry without facets",async()=>{
 for(const body of [[0,"CIRCLE",10,2,20,3,30,7,40,5],[0,"ARC",10,2,20,3,30,7,40,5,50,20,51,240],[0,"LWPOLYLINE",90,2,70,1,38,7,10,0,20,0,42,1,10,2,20,0,42,-.5]]){resetTestDocument();const id=await load(fixture([...body,210,1,220,2,230,3])),before=world(id).points!,out=encodeDxf(cadDocument,[id]);assert.equal(out.skipped,0,out.warnings.join(";"));assert.ok(!out.text.includes("\nVERTEX\n"));const parsed=parseDxf(out.text);assert.equal(parsed.warnings.length,0);assert.ok(parsed.entities[0].normal);const next=await load(out.text,"again"),after=world(next).points!;assert.equal(after.length,before.length);after.forEach((p,i)=>point(p,before[i]));}
});
test("native XZ/YZ and rotated clockwise/reflected models export analytic OCS geometry",async()=>{
 for(const plane of ["XZ","YZ"] as const){resetTestDocument();await dispatchCadCommand({type:"create-drawing",id:"a",drawing:"arc",params:{workPlane:plane,center:plane==="XZ"?[2,7,3]:[7,2,3],radius:5,startAngle:1.2,endAngle:-.8}});await dispatchCadCommand({type:"rotate-object",objectId:"a",rotation:[23,34,45]});cadDocument.objects.a.transform!.scale=[-2,2,2];const before=world("a").points!,out=encodeDxf(cadDocument,["a"]);assert.equal(out.skipped,0);const next=await load(out.text);const after=world(next).points!;assert.equal(after.length,before.length);after.forEach((p,i)=>point(p,before[i]));}
});
test("LINE extrusion remains WCS; tilted planar 3D polyline imports while nonplanar data is excluded",async()=>{
 const id=await load(fixture([0,"LINE",10,1,20,2,30,3,11,4,21,6,31,8,210,0,220,1,230,0]));point(world(id).points![0],[1,2,3]);point(world(id).points!.at(-1)!,[4,6,8]);
 const valid=fixture([0,"POLYLINE",70,8,0,"VERTEX",10,0,20,0,30,0,0,"VERTEX",10,1,20,1,30,1,0,"VERTEX",10,2,20,0,30,2,0,"SEQEND"]);const next=await load(valid,"poly");world(next).points!.forEach((p,i)=>point(p,[[0,0,0],[1,1,1],[2,0,2]][i] as Vec3));
 const invalid=valid.replace('0\nSEQEND','0\nVERTEX\n10\n0\n20\n1\n30\n2\n0\nSEQEND');const result=planDxfImport(invalid,new Map(),"bad");assert.equal(result.ok,false);assert.ok(result.stats.skipped.some(s=>s.includes("not planar")));assert.equal(dxfWcsPlane([[0,0,0],[1e9,0,1e9],[0,1e9,0],[0,0,1]]),null);
});
test("invalid normals, unsupported TEXT/INSERT semantics, thickness and nonuniform circular transforms are explicit exclusions",async()=>{
 for(const body of [[0,"CIRCLE",40,5,210,0,220,0,230,0],[0,"ARC",40,5,50,0,51,90,210,"NaN"],[0,"TEXT",1,"Label",40,2,41,2,230,-1],[0,"INSERT",2,"Block",70,2,210,1],[0,"CIRCLE",40,5,39,2]]){const p=parseDxf(fixture(body));assert.equal(p.entities.length,0);assert.equal(p.warnings.length,1);assert.match(p.warnings[0],/skipped/);}
 await load(fixture([0,"CIRCLE",40,5,210,0,220,1,230,1]));const id=cadDocument.rootObjects[0];await dispatchCadCommand({type:"scale-object",objectId:id,scale:[2,1,1]});const before=documentState(),out=encodeDxf(cadDocument,[id]);assert.equal(out.skipped,1);assert.match(out.warnings[0],/uniform/);assert.deepEqual(documentState(),before);
});

test("OCS batch respects target layer locks and stale reviews without publishing its placement commands",async()=>{
 const text=fixture([0,"CIRCLE",8,"Curve",10,2,20,3,30,7,40,5,210,0,220,1,230,1]);await dispatchCadCommand({type:"create-layer",id:"locked",name:"Curve"});await dispatchCadCommand({type:"set-layer-locked",layerId:"locked",locked:true});const p=planDxfImport(text,new Map([["Curve","locked"]]),"locked");assert.ok(p.ok);const before=documentState(),h=cadHistory.getPastLabels();assert.equal((await dispatchCadCommand(p.command)).ok,false);assert.deepEqual(documentState(),before);assert.deepEqual(cadHistory.getPastLabels(),h);
 await dispatchCadCommand({type:"set-layer-locked",layerId:"locked",locked:false});const r=await previewCadCommand(p.command);assert.ok(r.result.ok);await dispatchCadCommand({type:"create-layer",id:"other",name:"Other"});const current=documentState();assert.equal((await applyCadPlan(r.planId)).ok,false);assert.deepEqual(documentState(),current);discardCadPlan(r.planId);
});
