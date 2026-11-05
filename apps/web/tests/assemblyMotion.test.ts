import test from "node:test";
import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {deserializeDocument,serializeDocument,type CadDocument} from "@agent-webcad/cad-document";
import {createDocumentCommandExecutor} from "../src/state/commandBus";
import {inspectAssemblyMotion,motionAngles,type MotionRequest} from "../src/state/assemblyMotion";
import {cadDocument} from "../src/state/cadDocument";
import {restoreTestDocument} from "./helpers/documentHarness";
import {cadHistory} from "../src/state/history";
import {notifyDocumentChanged} from "../src/state/documentSession";
import {createCadToolSession} from "../src/copilot/cadToolSession";
function shape(d:CadDocument,id:string,kind:string,params:Record<string,number>,position:[number,number,number]){d.objects[id]={id,name:id,geometryId:"g-"+id,visible:true,layerId:"layer-default",transform:{translation:position,rotation:[0,0,0],scale:[1,1,1]}};d.features["f-"+id]={id:"f-"+id,type:"primitive",inputs:[],output:id,params:{kind,...params}};d.rootObjects.push(id);d.layers["layer-default"].objectIds.push(id);}
export async function motionFixture(){const d:CadDocument={id:"motion-test",revision:0,objects:{},features:{},layers:{"layer-default":{id:"layer-default",name:"Default",visible:true,locked:false,objectIds:[]}},rootObjects:[],rootLayers:["layer-default"]};shape(d,"anchor","box",{width:.1,depth:.1,height:.1},[0,0,0]);shape(d,"arm","box",{width:4,depth:1,height:1},[2,-.5,0]);shape(d,"obstacle","box",{width:1,depth:1,height:1},[-.5,3,0]);await createDocumentCommandExecutor(d)({type:"assembly-joint-create",joint:{id:"turn",type:"revolute",parentId:"anchor",childId:"arm",origin:[0,0,0],axis:[0,0,1],angle:0}});return d;}
const request:MotionRequest={jointId:"turn",start:0,end:180,step:90,partIds:["arm","obstacle"],exceptions:[],tolerance:1e-6};
test("actual OCCT sweep detects rotating obstruction at90 only, Common volume1mm3; no history/source edits",async()=>{
 const d=await motionFixture(),before=serializeDocument(d),history=cadHistory.getPastLabels().length,r=await inspectAssemblyMotion(d,request);assert.equal(r.state,"finished",r.reason);assert.deepEqual(r.rows.map(x=>x.baseStatus),["no-penetration","penetration","no-penetration"]);assert.ok(Math.abs(r.rows[1].commonVolume!-1)<1e-6);assert.equal(r.stats.aabbRejected,2);assert.equal(r.stats.candidates,1);assert.equal(serializeDocument(d),before);assert.equal(cadHistory.getPastLabels().length,history);await writeFile(new URL("../../../output/verification/assembly-b2/obstacle.json",import.meta.url),JSON.stringify(r,null,2));
});
test("real BRep distinguishes contact, positive overlap and separated bodies; AABB overlap alone is insufficient",async()=>{
 const d=await motionFixture();shape(d,"touch","box",{width:1,depth:1,height:1},[6,-.5,0]);shape(d,"overlap","box",{width:1,depth:1,height:1},[5.5,-.5,0]);
 const r=await inspectAssemblyMotion(d,{...request,start:0,end:0,partIds:["arm","touch","overlap"]});assert.equal(r.rows.find(r=>r.pair[1]==="touch")!.baseStatus,"contact");assert.equal(r.rows.find(r=>r.pair[1]==="overlap")!.baseStatus,"penetration");assert.ok(Math.abs(r.rows.find(r=>r.pair[1]==="overlap")!.commonVolume!-.5)<1e-6);
 shape(d,"s1","sphere",{radius:1},[20,0,0]);shape(d,"s2","sphere",{radius:1},[21.9,1.9,0]);const clear=await inspectAssemblyMotion(d,{...request,start:0,end:0,partIds:["s1","s2"]});assert.equal(clear.stats.candidates,1);assert.equal(clear.rows[0].method,"brep");assert.equal(clear.rows[0].baseStatus,"no-penetration");
});
test("exceptions retain raw penetration, and invariant pair results are reused without hiding Joint-connected pairs",async()=>{
 const d=await motionFixture(),run=createDocumentCommandExecutor(d);shape(d,"arm2","box",{width:1,depth:1,height:1},[2,-.5,0]);await run({type:"assembly-joint-create",joint:{id:"fixed",type:"fixed",parentId:"arm",childId:"arm2",origin:[0,0,0],axis:[0,0,1],angle:0}});
 const r=await inspectAssemblyMotion(d,{...request,partIds:["arm","arm2"],exceptions:[["arm","arm2"]]});assert.equal(r.rows.length,3);assert.ok(r.rows.every(x=>x.baseStatus==="penetration"&&x.status==="intentional-exception"));assert.equal(r.stats.invariantReuse,2);assert.equal(r.rows[0].method,"brep");
});
test("invalid BRep and unsupported Mesh never become clear; limits and sample budget reject",async()=>{
 const d=await motionFixture();d.features["f-obstacle"].params.width=-1;const bad=await inspectAssemblyMotion(d,request);assert.equal(bad.state,"partial");assert.ok(bad.rows.every(r=>r.baseStatus==="unknown"));
 d.features["f-obstacle"].type="mesh";d.features["f-obstacle"].params={};const unsupported=await inspectAssemblyMotion(d,request);assert.ok(unsupported.rows.every(r=>r.baseStatus==="unsupported"));d.assembly!.joints.turn.max=90;await assert.rejects(()=>inspectAssemblyMotion(d,request),/limits/);assert.throws(()=>motionAngles({...request,step:.1}),/budget/);
});
test("cancelled and stale inspection discard late results; per-task failure is unknown, not collision-free",async()=>{
 const d=await motionFixture(),c=new AbortController();c.abort();const cancelled=await inspectAssemblyMotion(d,request,{signal:c.signal});assert.equal(cancelled.state,"cancelled");assert.equal(cancelled.rows.length,0);
 const original=structuredClone(cadDocument);try{restoreTestDocument(d);let resolve!:(x:any)=>void;const waiting=new Promise<any>(r=>resolve=r),pending=inspectAssemblyMotion(cadDocument,request,{dependencies:{inspect:()=>waiting,distance:async()=>{throw Error("must not run");},metrics:()=>({wasmCapacityBytes:0}) as any}});cadDocument.revision++;notifyDocumentChanged();resolve({validity:"valid",volume:1,bounds:{min:[0,0,0],max:[1,1,1]}});const stale=await pending;assert.equal(stale.state,"stale");assert.deepEqual(stale.rows,[]);
 }finally{restoreTestDocument(original);}
 const timeout=await inspectAssemblyMotion(d,request,{taskMs:1,dependencies:{inspect:async()=>{await new Promise(r=>setTimeout(r,5));throw Error("kernel timeout");},distance:async()=>{throw Error("must not run");},metrics:()=>({wasmCapacityBytes:0}) as any}});assert.equal(timeout.state,"partial");assert.ok(timeout.rows.every(r=>r.baseStatus==="unknown"));
});
test("original laptop0/90/180, actual contacts/exceptions and read-only MCP parity",async()=>{
 const d=deserializeDocument(await readFile(new URL("../../../output/verification/assembly-phase-a/laptop-stand-assembly.webcad.json",import.meta.url),"utf8")),before=serializeDocument(d);
 const r:MotionRequest={jointId:"bearing",start:0,end:180,step:90,partIds:["stand-base","stand-shaft","stand-turntable","stand-support","stand-plate","stand-lip"],exceptions:[["stand-base","stand-shaft"]],tolerance:1e-6};
 const result=await inspectAssemblyMotion(d,r);assert.equal(result.samplingFinished,true,result.reason);assert.equal(result.rows.length,45);assert.equal(serializeDocument(d),before);assert.ok(result.rows.some(x=>x.baseStatus==="penetration"||x.baseStatus==="contact"));assert.ok(result.rows.some(x=>x.exception));await writeFile(new URL("../../../output/verification/assembly-b2/laptop.json",import.meta.url),JSON.stringify(result,null,2));
 const session=createCadToolSession({document:d,selectionIds:[],layerId:"layer-default",workPlane:"XY"}),mcp=await session.read({id:"read",name:"assembly.motion.inspect",arguments:{optionsJson:JSON.stringify({...r,start:0,end:0,partIds:["stand-base","stand-shaft"]})}});assert.equal(mcp.ok,true,mcp.error);assert.equal((mcp.result as any).rows[0].baseStatus,result.rows[0].baseStatus);assert.equal(serializeDocument(d),before);
});

test("live geometry driven by moving sources is unsupported rather than frozen and declared clear",async()=>{
 const d=await motionFixture(),f=d.features["f-obstacle"];f.type="boolean";f.dependencyMode="live";f.inputs=["arm"];
 const r=await inspectAssemblyMotion(d,request);assert.equal(r.state,"partial");assert.ok(r.rows.every(x=>x.baseStatus==="unsupported"));assert.match(r.parts.find(p=>p.id==="obstacle")!.reason!,/Live geometry/);
});

test("bounded result budget retains partial rows and never marks unchecked samples finished",async()=>{
 const d=await motionFixture();for(let i=0;i<6;i++)shape(d,"p"+i,"box",{width:1,depth:1,height:1},[100+i*10,0,0]);
 const r=await inspectAssemblyMotion(d,{...request,end:360,step:30,partIds:["arm","obstacle",...Array.from({length:6},(_,i)=>"p"+i)]},{dependencies:{inspect:async()=>({validity:"valid",volume:1,bounds:{min:[0,0,0],max:[1,1,1]}}) as any,distance:async()=>({relationship:"coincident",commonVolume:1,volumeTolerance:1e-9,boundaryDistance:0}) as any,metrics:()=>({wasmCapacityBytes:0}) as any}});
 assert.equal(r.state,"partial");assert.equal(r.samplingFinished,false);assert.ok(r.rows.length>0&&r.rows.length<=128);assert.ok(r.stats.completedSamples<r.angles.length);assert.match(r.reason!,/budget/);
});
