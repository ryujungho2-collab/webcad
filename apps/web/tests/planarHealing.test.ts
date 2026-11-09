import test from "node:test";import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {analyzePlanarMesh,sharedPlaneVertex,DEFAULT_RECONSTRUCTION,validPlanarDefinition,type EditableMesh} from "@agent-webcad/cad-document";
import {CadEngine,reconstructPlanarSolid,inspectShape} from "@agent-webcad/cad-kernel";
import {trianglePrism,squareTube,triangulateFixture} from "./helpers/reconstructionFixtures";
test("shared source IDs have one position and exactly two opposite edge uses",async()=>{
 for(const mesh of [trianglePrism(),trianglePrism(4,6,5),triangulateFixture(squareTube())]){const a=analyzePlanarMesh(mesh),t=a.definition.sharedTopology!;assert.ok(t);assert.ok(t.edges.every(e=>e.uses.length===2&&e.uses[0].forward!==e.uses[1].forward));assert.equal(t.report.correctedVertices,0);assert.ok(t.report.maxInputMovement<=a.definition.tolerance);const shape=await reconstructPlanarSolid(a.definition);try{const oc=(await CadEngine.create()).oc as any,exp=new oc.TopExp_Explorer_2(shape,oc.TopAbs_ShapeEnum.TopAbs_EDGE,oc.TopAbs_ShapeEnum.TopAbs_SHAPE),unique:any[]=[],counts:number[]=[];try{while(exp.More()){const edge=exp.Current(),i=unique.findIndex(other=>edge.IsSame(other));if(i<0){unique.push(edge);counts.push(1);}else{counts[i]++;edge.delete();}exp.Next();}assert.equal(unique.length,t.edges.length);assert.ok(counts.every(n=>n===2));}finally{unique.forEach(e=>e.delete());exp.delete();}}finally{shape.delete();}}
});
test("frozen Phase 5B definition reproduces native failure without relaxing tolerances",async()=>{
 const d=JSON.parse(await readFile(new URL("./fixtures/phase5b-noisy-definition.json",import.meta.url),"utf8"));assert.equal(d.tolerance,1e-5);await assert.rejects(()=>reconstructPlanarSolid(d),/solid validity/);
});
test("nearly parallel and overdetermined plane intersections fail without large motion",()=>{
 assert.deepEqual(sharedPlaneVertex([0,0,0],[{normal:[0,0,1],origin:[0,0,1e-6]},{normal:[0,0,1],origin:[0,0,1e-6]}],1e-5),[0,0,1e-6]);
 assert.throws(()=>sharedPlaneVertex([0,0,0],[{normal:[0,0,1],origin:[0,0,0]},{normal:[1e-8,0,Math.sqrt(1-1e-16)],origin:[0,0,1e-6]}],1e-5),/Nearly parallel/);
 assert.throws(()=>sharedPlaneVertex([0,0,0],[{normal:[1,0,0],origin:[8e-6,0,0]},{normal:[0,1,0],origin:[0,8e-6,0]}],1e-5),/movement exceeds/);
 assert.throws(()=>sharedPlaneVertex([1e9,0,0],[{normal:[0,0,1],origin:[1e9,0,0]}],1e-7),/precision/);
});
test("small holes and thin walls retain loops and valid volume; unsafe clearance rejects",async()=>{
 for(const kind of ["small-hole","thin-wall"]){const mesh=squareTube();for(const v of mesh.vertices){const i=Number(v.id.slice(1))%8;if(i>=4){v.position[0]=v.position[0]===3?(kind==="small-hole"?4.9995:.001):(kind==="small-hole"?5.0005:9.999);v.position[1]=v.position[1]===3?(kind==="small-hole"?4.9995:.001):(kind==="small-hole"?5.0005:9.999);}}
  const a=analyzePlanarMesh(triangulateFixture(mesh));assert.equal(a.definition.sharedTopology!.report.retainedHoleCount,2);const solid=await reconstructPlanarSolid(a.definition);try{const m=await inspectShape(solid),expected=kind==="small-hole"?(100-.001**2)*5:(100-9.998**2)*5;assert.equal(m.validity,"valid");assert.ok(Math.abs(m.volume-expected)<1e-7);}finally{solid.delete();}}
 assert.throws(()=>analyzePlanarMesh(trianglePrism(10,10,.00002)),/thin wall|short edge/);
});
test("T-junction, nonmanifold and altered shared topology cannot be accepted",()=>{
 const mesh:EditableMesh={version:1,vertices:[{id:"a",position:[0,0,0]},{id:"b",position:[2,0,0]},{id:"c",position:[0,1,0]},{id:"m",position:[1,0,0]},{id:"d",position:[1,-1,0]},{id:"e",position:[2,-1,0]}],faces:[{id:"f0",vertices:["a","b","c"]},{id:"f1",vertices:["m","d","e"]}],edit:{enabled:false,mode:"face",ids:[]}};
 assert.throws(()=>analyzePlanarMesh(mesh),/T-junction/);const bad=trianglePrism();bad.faces.push({...bad.faces[0],id:"dup"});assert.throws(()=>analyzePlanarMesh(bad),/Invalid/);
 const d=analyzePlanarMesh(trianglePrism()).definition;d.sharedTopology!.edges[0].uses[1].forward=d.sharedTopology!.edges[0].uses[0].forward;assert.equal(validPlanarDefinition(d),false);assert.equal(validPlanarDefinition({}),false);
});
