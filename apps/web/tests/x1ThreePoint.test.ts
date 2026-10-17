import assert from "node:assert/strict";
import {beforeEach,test} from "node:test";
import type {CadCommand} from "@agent-webcad/cad-commands";
import {serializeDocument,deserializeDocument} from "@agent-webcad/cad-document";
import {threePointCurve} from "../src/precision/threePointCurve";
import {resolveDrawingPointInput} from "../src/precision/drawingPointInput";
import {planeToWorld,WORK_PLANES,type Vec3} from "../src/precision/workPlane";
import {measureDrawing} from "../src/precision/measurements";
import {cadDocument} from "../src/state/cadDocument";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {previewCadCommand,applyCadPlan} from "../src/state/documentPlans";
import {undoDocument,redoDocument} from "../src/state/history";
import {buildPrimitiveMesh,inspectSolid} from "../src/cad/kernelGeometryService";
import {encodeDxf} from "../src/interop/dxfWriter";
import {planDxfImport} from "../src/interop/dxfImport";
import {getWorldDrawingGeometry} from "../src/precision/worldGeometry";
import {documentState,resetTestDocument} from "./helpers/documentHarness";

beforeEach(resetTestDocument);
const near=(a:number,b:number,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<tolerance,`${a} ≈ ${b}`);
async function apply(command:CadCommand){const result=await dispatchCadCommand(command);assert.ok(result.ok,result.reason);return result;}
async function reject(command:CadCommand){const before=documentState();const result=await dispatchCadCommand(command);assert.equal(result.ok,false);assert.deepEqual(documentState(),before);}
const points:[[number,number,number],[number,number,number],[number,number,number]]=[[10,0,0],[0,10,0],[-10,0,0]];
const command=(id="curve",drawing:"circle"|"arc"="circle"):CadCommand=>({type:"create-three-point-curve",drawing,id,workPlane:"XY",points});

test("translated normalized circumcenter remains accurate at large coordinates",()=>{
  for(const offset of [0,1e9])for(const angles of [[0,Math.PI/2,Math.PI],[.4,1.6,4.7],[0,Math.PI,Math.PI/2]]){
    const result=threePointCurve(angles.map(a=>[offset+3+10*Math.cos(a),offset-4+10*Math.sin(a)]));assert.ok(result.ok,result.ok?"":result.reason);
    near(result.curve.center[0],offset+3,1e-5);near(result.curve.center[1],offset-4,1e-5);near(result.curve.radius,10,1e-5);
  }
});

test("ordered three-point arcs preserve CW/CCW, major sweep and 180-degree boundary",()=>{
  for(const [middle,end,sweep] of [[Math.PI/2,Math.PI,Math.PI],[-Math.PI/2,Math.PI,-Math.PI],[Math.PI,Math.PI/2,-1.5*Math.PI],[Math.PI,1.5*Math.PI,1.5*Math.PI]]){
    const result=threePointCurve([[10,0],[10*Math.cos(middle),10*Math.sin(middle)],[10*Math.cos(end),10*Math.sin(end)]]);assert.ok(result.ok);
    near(result.curve.endAngle-result.curve.startAngle,sweep);near(result.curve.radius,10);
    const wrapped=(v:number)=>(v%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
    assert.ok(wrapped(Math.sign(sweep)*(middle-result.curve.startAngle))<=Math.abs(sweep)+1e-8);
  }
});

test("duplicate, collinear, nearly collinear and non-finite points reject",()=>{
  for(const p of [[[0,0],[0,0],[1,1]],[[0,0],[1,1],[2,2]],[[0,0],[1,0],[2,1e-12]],[[0,0],[1e6,0],[2e6,.001]],[[0,0],[Infinity,1],[2,3]]] as [number,number][][])assert.equal(threePointCurve(p).ok,false);
});

test("three-point numeric input treats the third point as coordinates/polar, not a sweep",()=>{
  assert.deepEqual(resolveDrawingPointInput("arc-3point","#0,10",[[10,0],[0,-10]])?.point,[0,10]);
  const relative=resolveDrawingPointInput("circle-3point","@1cm<90deg",[[10,0],[0,0]])!.point;near(relative[0],0);near(relative[1],10);
});

test("standalone creation uses existing source schema, detached review and one Undo",async()=>{
  const before=documentState(),plan=await previewCadCommand(command());assert.ok(plan.result.ok,plan.result.reason);assert.deepEqual(documentState(),before);
  assert.ok((await applyCadPlan(plan.planId)).ok);const feature=cadDocument.features["feature-curve"];assert.equal(feature.type,"drawing");assert.equal(feature.params.kind,"circle");
  near(Number(feature.params.radius),10);near(measureDrawing(feature.params).area!,100*Math.PI);
  const saved=serializeDocument(cadDocument);assert.deepEqual(deserializeDocument(saved).features[feature.id],feature);
  const after=documentState();assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),after);
  await apply({type:"create-extrude",id:"solid",profileObjectIds:["curve"],distance:3});near((await inspectSolid({params:cadDocument.features["feature-solid"].params})).volume!,300*Math.PI,1e-4);
});

test("existing exact DXF path round-trips a major clockwise three-point arc",async()=>{
  await apply({...command("arc","arc"),points:[[10,0,0],[-10,0,0],[0,10,0]]} as CadCommand);
  const feature=cadDocument.features["feature-arc"];near(measureDrawing(feature.params).distance!,15*Math.PI);
  const before=getWorldDrawingGeometry(cadDocument.objects.arc,feature)!;
  const encoded=encodeDxf(cadDocument,["arc"]);assert.equal(encoded.skipped,0);
  const plan=planDxfImport(encoded.text,new Map(),"three-point");assert.ok(plan.ok);await apply(plan.command);
  const id=cadDocument.rootObjects.at(-1)!,after=getWorldDrawingGeometry(cadDocument.objects[id],Object.values(cadDocument.features).find(f=>f.output===id)!)!;
  near(after.radius!,10);assert.equal(after.points!.length,before.points!.length);after.points!.forEach((p,i)=>p.forEach((v,j)=>near(v,before.points![i][j])));
});

test("sketch creation has editable IDs and existing radius driver/regeneration",async()=>{
  await apply({type:"create-sketch",id:"sketch",workPlane:"XY"});await apply({...command(),sketchId:"sketch"} as CadCommand);
  const circle=cadDocument.sketches!.sketch.geometry[0];assert.equal(circle.kind,"circle");assert.equal(cadDocument.sketches!.sketch.constraints.length,0);
  await apply({type:"add-sketch-constraint",sketchId:"sketch",constraint:{id:"radius",kind:"radius",geometryId:circle.id,value:10}});
  await apply({type:"create-extrude",id:"solid",profileObjectIds:[circle.id],distance:3});
  await apply({type:"set-sketch-dimension",sketchId:"sketch",constraintId:"radius",value:12});
  near((await inspectSolid({params:cadDocument.features["feature-solid"].params})).volume!,432*Math.PI,1e-4);
});

test("three-point arc retains endpoint identities and signed sweep under radius editing",async()=>{
  await apply({type:"create-sketch",id:"sketch",workPlane:"XY"});
  await apply({type:"create-three-point-curve",id:"arc",drawing:"arc",sketchId:"sketch",workPlane:"XY",points:[[3,0,0],[0,-3,0],[-3,0,0]]});
  const first=cadDocument.sketches!.sketch.geometry[0];assert.equal(first.kind,"arc");if(first.kind!=="arc")return;
  await apply({type:"add-sketch-constraint",sketchId:"sketch",constraint:{id:"radius",kind:"radius",geometryId:first.id,value:3}});
  await apply({type:"set-sketch-dimension",sketchId:"sketch",constraintId:"radius",value:6});
  const next=cadDocument.sketches!.sketch.geometry[0];assert.equal(next.kind,"arc");if(next.kind!=="arc")return;
  assert.equal(next.startId,first.startId);assert.equal(next.endId,first.endId);assert.equal(next.curveId,first.curveId);near(next.radius,6);near(next.endAngle-next.startAngle,-Math.PI);
  const saved=serializeDocument(cadDocument);assert.deepEqual(deserializeDocument(saved).sketches!.sketch.geometry[0],next);
});

test("XZ/YZ and face sketches use the intended frame",async()=>{
  for(const workPlane of ["XZ","YZ"] as const){
    const p=points.map(p=>planeToWorld([p[0],p[1]],WORK_PLANES[workPlane])) as [Vec3,Vec3,Vec3];
    await apply({type:"create-three-point-curve",id:workPlane,drawing:"arc",workPlane,points:p});near(Number(cadDocument.features[`feature-${workPlane}`].params.radius),10);
  }
  await apply({type:"create-primitive",id:"body",primitive:"box",params:{width:20,depth:16,height:10}});
  const mesh=await buildPrimitiveMesh(cadDocument.features["feature-body"].params),face=mesh.faces!.find(f=>f.key.split("|")[0].endsWith(",10.000000"))!;
  await apply({type:"attach-work-plane-face",id:"top",name:"Top",source:{kind:"brep-face",objectId:"body",topologyId:face.key}});await apply({type:"create-face-sketch",id:"face",planeId:"top"});
  const sketch=cadDocument.sketches!.face,frame={id:"top",...sketch.faceFrame!};
  await apply({type:"create-three-point-curve",id:"face-circle",drawing:"circle",sketchId:"face",workPlane:sketch.workPlane,points:[[2,0],[0,2],[-2,0]].map(p=>planeToWorld(p as [number,number],frame)) as [Vec3,Vec3,Vec3]});
  const circle=cadDocument.sketches!.face.geometry[0];assert.equal(circle.kind,"circle");if(circle.kind==="circle"){near(circle.center[0],0);near(circle.center[1],0);near(circle.radius,2);}
  near(Number(cadDocument.features["feature-face-circle"].params.radius),2);
});

test("invalid points, off-plane points and locks reject without mutation",async()=>{
  await reject({...command(),points:[[0,0,0],[1,0,0],[2,0,0]]} as CadCommand);
  await reject({...command(),points:[[10,0,1],[0,10,1],[-10,0,1]]} as CadCommand);
  await apply({type:"set-layer-locked",layerId:"layer-default",locked:true});await reject(command());
});
