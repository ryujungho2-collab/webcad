import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { inspectSolid } from "../src/cad/kernelGeometryService";
import { CAD_PRECISION, linearToleranceAt } from "@agent-webcad/cad-document";
import {measureDrawing} from "../src/precision/measurements";
import {parseAngle,parseLength} from "../src/precision/units";

const close = (actual:number|undefined, expected:number, tolerance=1e-6) => assert.ok(actual!==undefined && Math.abs(actual-expected)<=tolerance, `${actual} ≈ ${expected}`);

test("BRep sphere measurements do not inherit tessellation error", async()=>{
  const result=await inspectSolid({params:{kind:"sphere",radius:7}});
  assert.equal(result.basis,"brep");assert.equal(result.validity,"valid");
  close(result.volume,4*Math.PI*7**3/3);close(result.area,4*Math.PI*7**2);
  assert.deepEqual(result.bounds,{min:[-7,-7,-7],max:[7,7,7]});
});

test("repeated solid inspection shares exact work without exposing cached bounds or mixing placements",async()=>{
  const operand={params:{kind:"box",width:11,depth:13,height:17},transform:{translation:[21,34,55],scale:[1,1,1]}};
  const start=performance.getEntriesByName("agent-webcad:kernel-task:inspect").length;
  const [first,second]=await Promise.all([inspectSolid(operand),inspectSolid(structuredClone(operand))]);
  close(first.volume,11*13*17);assert.equal(performance.getEntriesByName("agent-webcad:kernel-task:inspect").length-start,1);
  first.bounds!.min[0]=999;second.volume=0;
  const repeated=await inspectSolid(operand);close(repeated.volume,11*13*17);close(repeated.bounds!.min[0],21);
  operand.transform.translation[0]=89;
  const moved=await inspectSolid(operand);close(moved.bounds!.min[0],89);close(moved.volume,11*13*17);
  operand.params.width=19;
  close((await inspectSolid(operand)).volume,19*13*17);
  assert.equal(performance.getEntriesByName("agent-webcad:kernel-task:inspect").length-start,3);
});

test("inspection reuse distinguishes nested source edits and evicts rejected work",async()=>{
  const operand={params:{operation:"cut",operands:[{params:{kind:"box",width:20,depth:20,height:20}},{params:{kind:"box",width:5,depth:5,height:5}}]}};
  close((await inspectSolid(operand)).volume,8000-125);
  operand.params.operands[1].params.width=10;
  close((await inspectSolid(operand)).volume,8000-250);
  const started=performance.getEntriesByName("agent-webcad:kernel-task:inspect").length;
  for(let i=0;i<2;i++)await assert.rejects(inspectSolid({params:{kind:"unknown-retry"}}),/Unsupported primitive/);
  assert.equal(performance.getEntriesByName("agent-webcad:kernel-task:inspect").length-started,2);
});

test("solid translation and XYZ rotation match the viewport convention", async()=>{
  const transform={translation:[2000,-300,100],rotation:[17,29,41],scale:[1,1,1]};
  const result=await inspectSolid({params:{kind:"box",width:10,depth:20,height:30},transform});
  close(result.volume,6000);close(result.area,2200);
  const matrix=new THREE.Matrix4().compose(new THREE.Vector3(...transform.translation),new THREE.Quaternion().setFromEuler(new THREE.Euler(...transform.rotation.map(THREE.MathUtils.degToRad) as [number,number,number])),new THREE.Vector3(...transform.scale));
  const corners=[0,10].flatMap(x=>[0,20].flatMap(y=>[0,30].map(z=>new THREE.Vector3(x,y,z).applyMatrix4(matrix))));
  const bounds=new THREE.Box3().setFromPoints(corners);
  result.bounds!.min.forEach((v,i)=>close(v,bounds.min.toArray()[i]));result.bounds!.max.forEach((v,i)=>close(v,bounds.max.toArray()[i]));
});

test("nonuniform solid scale is reflected in BRep properties and world bounds", async()=>{
  const result=await inspectSolid({params:{kind:"box",width:2,depth:3,height:4},transform:{scale:[2,3,4],translation:[100,200,300]}});
  assert.equal(result.validity,"valid");
  close(result.volume,4*9*16);close(result.area,2*(4*9+9*16+4*16));
  result.bounds!.min.forEach((v,i)=>close(v,[100,200,300][i]));result.bounds!.max.forEach((v,i)=>close(v,[104,209,316][i]));
  await assert.rejects(inspectSolid({params:{kind:"box",width:2,depth:3,height:4},transform:{scale:[1,0,1]}}),/Invalid solid transform/);
});

test("scaled curved solids remain valid with the expected transformed volume",async()=>{
  const result=await inspectSolid({params:{kind:"sphere",radius:3},transform:{scale:[2,2,4],rotation:[17,29,41],translation:[100,200,300]}});
  assert.equal(result.validity,"valid");
  close(result.volume,4*Math.PI*3**3/3*16,1e-4);
  const a=6,c=12,e=Math.sqrt(1-a*a/(c*c));
  close(result.area,2*Math.PI*a*a*(1+c/(a*e)*Math.asin(e)),1e-4);
});

test("survey-coordinate drawing area and explicit radian input preserve numerical meaning",()=>{
  const offset=1e9;
  const result=measureDrawing({kind:"rectangle",workPlane:"XY",points:[[offset,offset,0],[offset+10,offset,0],[offset+10,offset+20,0],[offset,offset+20,0]]});
  assert.equal(result.area,200);assert.equal(result.distance,60);
  close(parseAngle(`${Math.PI/2}rad`)!,90,1e-12);assert.equal(parseLength("2m"),2000);
  assert.equal(parseLength("9".repeat(307)+"m"),null);
});

test("small parts and large placements keep independent numerical policies",async()=>{
  assert.equal(CAD_PRECISION.lengthUnit,"mm");assert.equal(CAD_PRECISION.sketchAngleUnit,"rad");
  assert.equal(linearToleranceAt(0,100),1e-6);assert.ok(linearToleranceAt(1e12)>1e-6);
  await assert.rejects(inspectSolid({params:{kind:"unknown"}}),/Unsupported primitive/);
  const result=await inspectSolid({params:{kind:"box",width:0.1,depth:0.2,height:0.3},transform:{translation:[1e6,-1e6,0]}});
  close(result.volume,0.006,1e-8);close(result.area,0.22,1e-8);
});
