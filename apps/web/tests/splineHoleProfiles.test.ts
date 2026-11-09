import assert from "node:assert/strict";
import {test} from "node:test";
import {serializeDocument,deserializeDocument,type CadSpline} from "@agent-webcad/cad-document";
import {cadDocument} from "../src/state/cadDocument";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {measureDocumentObject} from "../src/state/documentQuery";
import {cadHistory} from "../src/state/history";
import {extractSketchLoops} from "../src/precision/sketchProfiles";
import {profileRegionMeasurement,regionContainsPoint} from "../src/precision/profileRegions";
import {resetTestDocument,documentState} from "./helpers/documentHarness";
import {inspectProfileSelection} from "../src/precision/profileSelection";
import {createCadMcpRuntime} from "../src/copilot/cadMcpRuntime";
const circle=(r:number,clockwise=false):CadSpline=>({degree:2,controlPoints:[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1],[1,0]].map(([x,y])=>[x*r,y*r*(clockwise?-1:1),0]),weights:[1,Math.SQRT1_2,1,Math.SQRT1_2,1,Math.SQRT1_2,1,Math.SQRT1_2,1],knots:[0,0,0,1,1,2,2,3,3,4,4,4],domain:[0,4]});
async function spline(id:string,r:number,cw=false){assert.ok((await dispatchCadCommand({type:"create-drawing",id,drawing:"spline",params:{...circle(r,cw),workPlane:"XY"}})).ok);}
async function round(id:string,r:number,center=[0,0,0]){assert.ok((await dispatchCadCommand({type:"create-drawing",id,drawing:"circle",params:{center,radius:r,workPlane:"XY"}})).ok);}
async function volume(id:string,v:number){const m=await measureDocumentObject(cadDocument,id);assert.equal(m.validity,"valid");assert.ok(Math.abs(m.volume!-v)<v*1e-8,`${m.volume} vs ${v}`);}
test("mixed analytic / NURBS loops classify holes independent of selection and source winding",async()=>{
 for(const cw of [false,true]){resetTestDocument();await spline("outer",10,cw);await round("drain",3);const a=extractSketchLoops(cadDocument,["outer","drain"]),b=extractSketchLoops(cadDocument,["drain","outer"]);assert.ok(a.ok&&b.ok);assert.deepEqual(a,b);assert.equal(a.loops.length,1);assert.equal(a.loops[0].holes?.length,1);assert.ok(Math.abs(profileRegionMeasurement(a.loops[0],"XY").area-91*Math.PI)<1e-6);assert.equal(regionContainsPoint(a.loops[0],[0,0],"XY"),false);assert.equal(regionContainsPoint(a.loops[0],[3,0],"XY"),false);assert.equal(regionContainsPoint(a.loops[0],[5,0],"XY"),true);assert.ok((await dispatchCadCommand({type:"create-extrude",id:"ring",profileObjectIds:["drain","outer"],distance:12})).ok);await volume("ring",1092*Math.PI);}
});
test("NURBS holes in analytic boundaries and nested islands retain exact net area and volume",async()=>{
 resetTestDocument();await round("outer",15);await spline("hole",10,true);await spline("island",5);const result=extractSketchLoops(cadDocument,["island","outer","hole"]);assert.ok(result.ok);assert.equal(result.loops.length,2);assert.equal(result.loops.reduce((n,l)=>n+(l.holes?.length??0),0),1);assert.ok((await dispatchCadCommand({type:"create-extrude",id:"regions",profileObjectIds:["island","outer","hole"],distance:12})).ok);await volume("regions",1800*Math.PI);
});
test("touching, crossing and noncoplanar boundaries are refused without publishing a solid",async()=>{
 for(const x of [8,9]){resetTestDocument();await spline("outer",10);await round("hole",2,[x,0,0]);const result=extractSketchLoops(cadDocument,["outer","hole"]);assert.equal(result.ok,false);const before=documentState(),history=cadHistory.getPastLabels().length;assert.equal((await dispatchCadCommand({type:"create-extrude",id:"invalid",profileObjectIds:["outer","hole"],distance:12})).ok,false);assert.deepEqual(documentState(),before);assert.equal(cadHistory.getPastLabels().length,history);}
 resetTestDocument();await spline("outer",10);await round("hole",2,[0,0,1]);assert.equal(extractSketchLoops(cadDocument,["outer","hole"]).ok,false);
});
test("live NURBS hole edits regenerate and impossible boundary crossings restore the complete transaction",async()=>{
 resetTestDocument();await round("outer",10);await spline("hole",3);assert.ok((await dispatchCadCommand({type:"create-extrude",id:"ring",profileObjectIds:["hole","outer"],distance:12})).ok);assert.ok((await dispatchCadCommand({type:"update-spline",objectId:"hole",spline:circle(4)})).ok);await volume("ring",1008*Math.PI);const before=documentState(),history=cadHistory.getPastLabels().length;
 const bad=await dispatchCadCommand({type:"update-spline",objectId:"hole",spline:{...circle(4),controlPoints:circle(4).controlPoints.map(p=>[p[0]+8,p[1],p[2]])}});assert.equal(bad.ok,false);assert.deepEqual(documentState(),before);assert.equal(cadHistory.getPastLabels().length,history);
 const encoded=JSON.parse(serializeDocument(cadDocument));assert.equal(encoded.version,51);assert.doesNotThrow(()=>deserializeDocument(JSON.stringify(encoded)));encoded.version=50;assert.throws(()=>deserializeDocument(JSON.stringify(encoded)),/version 51/);
});
test("human profile read and MCP context share bounded detached hole roles without changing edit selection",async()=>{
 resetTestDocument();await spline("outer/with/slash",10);await round("hole",3);let selectionIds=["outer/with/slash","hole"];
 const runtime=createCadMcpRuntime({context:()=>({document:cadDocument,selectionIds,layerId:"layer-default",workPlane:"XY"}),review:async()=>{throw Error("Read must never request a review.");},proposal:()=>{throw Error("No proposal exists.");}}),before=documentState(),expected=inspectProfileSelection(cadDocument,selectionIds),signal=new AbortController().signal;
 const context:any=await runtime.invoke("context",{},signal);assert.deepEqual(context.profile,expected);assert.equal(context.profile.regions[0].outerObjectIds[0],"outer/with/slash");context.profile.areaMm2=0;assert.deepEqual((await runtime.invoke("context",{},signal) as any).profile,expected);selectionIds=["hole","outer/with/slash"];assert.deepEqual((await runtime.invoke("context",{},signal) as any).profile,expected);selectionIds=[];assert.equal((await runtime.invoke("context",{},signal) as any).profile,undefined);assert.deepEqual(documentState(),before);runtime.dispose();
});
test("elevated XZ / YZ mixed profiles use the proper signed normal and retain the exact hole volume",async()=>{
 for(const plane of ["XZ","YZ"] as const){resetTestDocument();const s=circle(10,true);s.controlPoints=s.controlPoints.map(([x,y])=>plane==="XZ"?[x,7,y]:[7,x,y]);assert.ok((await dispatchCadCommand({type:"create-drawing",id:"outer",drawing:"spline",params:{...s,workPlane:plane}})).ok);assert.ok((await dispatchCadCommand({type:"create-drawing",id:"hole",drawing:"circle",params:{center:plane==="XZ"?[0,7,0]:[7,0,0],radius:3,workPlane:plane}})).ok);assert.ok((await dispatchCadCommand({type:"create-extrude",id:"ring",profileObjectIds:["outer","hole"],distance:12})).ok);await volume("ring",1092*Math.PI);const m=await measureDocumentObject(cadDocument,"ring");assert.ok(Math.abs(m.bounds!.min[plane==="XZ"?1:0]-(plane==="XZ"?-5:7))<1e-5);}
});
test("a native bulge-arc boundary becomes an exact hole inside a NURBS outer boundary",async()=>{
 resetTestDocument();await spline("outer",20);assert.ok((await dispatchCadCommand({type:"create-drawing",id:"arcHole",drawing:"polyline",params:{workPlane:"XY",closed:true,points:[[5,0,0],[0,5,0],[-5,0,0],[0,-5,0]],bulges:Array(4).fill(Math.SQRT2-1)}})).ok);const p=inspectProfileSelection(cadDocument,["arcHole","outer"]);assert.ok(p?.ok);assert.equal(p.holeCount,1);assert.ok(Math.abs(p.areaMm2-375*Math.PI)<1e-6);assert.ok((await dispatchCadCommand({type:"create-extrude",id:"ring",profileObjectIds:["outer","arcHole"],distance:12})).ok);await volume("ring",4500*Math.PI);
});
