import test from "node:test";
import assert from "node:assert/strict";
import {enumerateSolidTopology,measureSelectedDistance,measureSolidDistance,kernelResourceControl} from "../src/cad/kernelGeometryService";
const box={params:{kind:"box",width:10,depth:10,height:10}};
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
const topology=()=>enumerateSolidTopology(box.params);
test("chosen far faces measure their trimmed BRep rather than closest whole bodies",async()=>{
 const t=await topology(),other={...box,transform:{translation:[20,0,0]}};let max=0;
 for(const face of t.faces){const ref={kind:"brep-face" as const,key:face.key};const r=await measureSelectedDistance(box,other,ref,ref);max=Math.max(max,r.distance);near(Math.hypot(...r.source.map((v,i)=>v-r.target[i])),r.distance);}
 near(max,20);near((await measureSolidDistance(box,other)).boundaryDistance,10);
});
test("edge distances honor placement and nonuniform scale",async()=>{const t=await topology(),key=t.edges.find(e=>e.points.every(p=>p[0]===10))!.key,ref={kind:"brep-edge" as const,key};const r=await measureSelectedDistance({...box,transform:{scale:[2,1,1]}},{...box,transform:{translation:[30,0,0]}},ref,ref);near(r.distance,20);});
test("missing reference fails closed and releases active operations; retry succeeds",async()=>{const t=await topology(),ref={kind:"brep-face" as const,key:t.faces[0].key};await assert.rejects(measureSelectedDistance(box,box,ref,{...ref,key:"missing"}),/missing or ambiguous/);assert.equal((await kernelResourceControl()).activeOperations,0);near((await measureSelectedDistance(box,box,ref,ref)).distance,0);});
test("cancelled selected query never starts and results are detached",async()=>{const t=await topology(),ref={kind:"brep-edge" as const,key:t.edges[0].key},c=new AbortController();c.abort();await assert.rejects(measureSelectedDistance(box,box,ref,ref,{signal:c.signal}));const r=await measureSelectedDistance(box,box,ref,ref);r.source[0]=999;assert.notEqual((await measureSelectedDistance(box,box,ref,ref)).source[0],999);});
test("curved trimmed face witnesses use OCCT, with world rotation",async()=>{const sphere={params:{kind:"sphere",radius:5}},t=await enumerateSolidTopology(sphere.params),ref={kind:"brep-face" as const,key:t.faces[0].key};const r=await measureSelectedDistance(sphere,{...sphere,transform:{translation:[20,0,0],rotation:[0,0,37]}},ref,ref);near(r.distance,10);});

test("document pair validates same-object faces, stale geometry and Undo without writing history",async()=>{
 const {resetTestDocument,documentState}=await import("./helpers/documentHarness"),{cadDocument}=await import("../src/state/cadDocument"),{dispatchCadCommand}=await import("../src/state/dispatchCadCommand"),{cadHistory,undoDocument}=await import("../src/state/history"),{measureSelectedPair}=await import("../src/state/selectedDistance");
 resetTestDocument();await dispatchCadCommand({type:"create-box",id:"a",width:10,depth:10,height:10});await dispatchCadCommand({type:"create-box",id:"b",width:10,depth:10,height:10});await dispatchCadCommand({type:"move-object",objectId:"b",translation:[20,0,0]});
 const t=await topology(),a={objectId:"a",kind:"brep-face" as const,topologyId:t.faces[0].key},b={...a,objectId:"b"},before=documentState(),past=cadHistory.getPastLabels().length;
 const initial=await measureSelectedPair(cadDocument,a,b);assert.deepEqual(documentState(),before);assert.equal(cadHistory.getPastLabels().length,past);
 await dispatchCadCommand({type:"move-object",objectId:"b",translation:[30,0,0]});assert.ok((await measureSelectedPair(cadDocument,a,b)).distance>initial.distance);undoDocument();near((await measureSelectedPair(cadDocument,a,b)).distance,initial.distance);
 await assert.rejects(measureSelectedPair(cadDocument,a,a),/different/);await assert.rejects(measureSelectedPair(cadDocument,a,{...b,topologyId:"missing"}),/missing or ambiguous/);
 const sameObject=await measureSelectedPair(cadDocument,a,{...a,topologyId:t.faces[1].key});assert.ok(Number.isFinite(sameObject.distance));
});

const metric=async(a:typeof box&{transform?:{translation?:number[];rotation?:number[]}},b:typeof a,mode:import("@agent-webcad/cad-kernel").SelectedDistanceMode)=>{const t=await topology(),edge=t.edges.find(e=>e.points.every(p=>p[1]===0&&p[2]===0))!,ref={kind:"brep-edge" as const,key:edge.key};return measureSelectedDistance(a,b,ref,ref,{},mode);};
test("all six projected/axis modes minimize the chosen finite edges and report numerical precision",async()=>{
 const b={...box,transform:{translation:[20,5,7],rotation:[0,0,45]}};
 const expected={"project-XY":Math.hypot(10,5),"project-XZ":Math.hypot(10,7),"project-YZ":Math.hypot(5,7),"axis-X":10,"axis-Y":5,"axis-Z":7};
 for(const [mode,value] of Object.entries(expected)){const r=await metric(box,b,mode as keyof typeof expected);assert.ok(Math.abs(r.distance-value)<.001,`${mode}: ${r.distance} != ${value}`);assert.equal(r.mode,mode);assert.ok(r.lower<=value+.001&&r.upper>=value-.001);assert.ok(r.source.every(Number.isFinite));assert.ok(["within-tolerance","approximate"].includes(r.accuracy));}
});
test("projected minimizer differs from the components of the 3D closest pair",async()=>{
 const a={...box,transform:{rotation:[0,45,0]}},b={...box,transform:{translation:[5,-5,0],rotation:[0,0,90]}};
 const native=await metric(a,b,"shortest"),xy=await metric(a,b,"project-XY");assert.ok(native.distance>3);assert.ok(Math.hypot(native.source[0]-native.target[0],native.source[1]-native.target[1])>2);assert.ok(xy.distance<.001);assert.ok(Math.abs(xy.source[2]-xy.target[2])>4.9);assert.ok(xy.upper-xy.lower<=.001);
});
test("mixed face-edge is symmetric, supports world elevation and projected overlap",async()=>{
 const t=await topology(),face={kind:"brep-face" as const,key:t.faces[0].key},edge={kind:"brep-edge" as const,key:t.edges[0].key},b={...box,transform:{translation:[20,0,50]}};
 for(const mode of ["shortest","project-XY","axis-Z"] as const){const ab=await measureSelectedDistance(box,b,face,edge,{},mode),ba=await measureSelectedDistance(b,box,edge,face,{},mode);assert.ok(Math.abs(ab.distance-ba.distance)<.001);}
});
test("curved face projections retain actual native surface witnesses",async()=>{
 const sphere={params:{kind:"sphere",radius:5}},t=await enumerateSolidTopology(sphere.params),ref={kind:"brep-face" as const,key:t.faces[0].key};
 for(const translation of [[20,0,20],[0,0,20]]){const r=await measureSelectedDistance(sphere,{...sphere,transform:{translation}},ref,ref,{},"project-XY");assert.ok(Math.abs(r.distance-(translation[0]?10:0))<.001,`${r.distance}`);assert.ok(Math.abs(Math.hypot(...r.source)-5)<1e-5);assert.ok(Math.abs(Math.hypot(...r.target.map((v,i)=>v-translation[i]))-5)<1e-5);}
});
test("unknown modes cannot silently return the 3D metric",async()=>{await assert.rejects(metric(box,box,"bad" as any),/Unsupported selected distance metric/);});

test("large omitted-axis separation is disclosed as approximate rather than claiming convergence",async()=>{const r=await metric(box,{...box,transform:{translation:[20,0,1000000]}},"project-XY");near(r.distance,10);assert.equal(r.accuracy,"approximate");assert.ok(r.upper-r.lower>r.tolerance);assert.ok(r.lower<=10&&r.upper>=10);});
test("survey translations preserve projected small distances and original witness coordinates",async()=>{const a={...box,transform:{translation:[1e7,2e7,3e7]}},b={...box,transform:{translation:[1e7+20,2e7+5,3e7+70]}};const r=await metric(a,b,"project-XY");assert.ok(Math.abs(r.distance-Math.hypot(10,5))<.001);assert.ok(r.source[0]>=1e7&&r.source[0]<=1e7+10);assert.ok(r.target[2]>=3e7+70-1e-5);});
test("projection respects holes of trimmed faces instead of filling their bounds",async()=>{
 const ring={params:{kind:"boolean",operation:"cut",operands:[{params:{kind:"box",width:20,depth:20,height:20}},{params:{kind:"box",width:10,depth:10,height:22},transform:{translation:[5,5,-1]}}]}},small={params:{kind:"box",width:1,depth:1,height:1},transform:{translation:[10,10,30]}},t=await enumerateSolidTopology(ring.params),e=await enumerateSolidTopology(small.params),top=t.faces.find(f=>f.key.includes("|0.000000,0.000000,1.000000|"))!;
 assert.ok(top);const edge=e.edges.find(e=>e.points.every(p=>p[1]===0&&p[2]===0))!;const r=await measureSelectedDistance(ring,small,{kind:"brep-face",key:top.key},{kind:"brep-edge",key:edge.key},{},"project-XY");assert.ok(Math.abs(r.distance-4)<.001,`${r.distance}`);assert.ok(r.lower<=4+.001&&r.upper>=4-.001);
});
