import assert from "node:assert/strict";
import {beforeEach,afterEach,test} from "node:test";
import {serializeDocument,deserializeDocument,parameterTargets,type CadPatternSpec} from "@agent-webcad/cad-document";
import {validateCommand,type CadCommand} from "@agent-webcad/cad-commands";
import {cadDocument} from "../src/state/cadDocument";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {cadHistory,undoDocument,redoDocument} from "../src/state/history";
import {previewCadCommand,applyCadPlan,discardCadPlan} from "../src/state/documentPlans";
import {buildExtrudeMesh} from "../src/cad/kernelGeometryService";
import {getWorldDrawingGeometry} from "../src/precision/worldGeometry";
import {measureDocumentObject} from "../src/state/documentQuery";
import {encodeDxf} from "../src/interop/dxfWriter";
import {parseDxf} from "../src/interop/dxfParser";
import {collectExportDrawings} from "../src/export/exportModel";
import {planeToWorld,WORK_PLANES,type WorkPlaneId} from "../src/precision/workPlane";
import {resetTestDocument,restoreTestDocument,documentState,meshVolume} from "./helpers/documentHarness";
const original=structuredClone(cadDocument);beforeEach(resetTestDocument);afterEach(()=>{restoreTestDocument(original);cadHistory.clear();});
const feature=(id:string)=>Object.values(cadDocument.features).find(f=>f.output===id)!;
const members=(id="array")=>Object.values(cadDocument.features).filter(f=>f.pattern?.id===id);
const linear:CadPatternSpec={kind:"linear",workPlane:"XY",columns:3,rows:2,spacing:[20,30]};
async function apply(command:CadCommand){const result=await dispatchCadCommand(command);assert.ok(result.ok,result.reason);return result;}
async function seed(center:[number,number,number]=[10,10,0]){await apply({type:"create-drawing",id:"seed",drawing:"circle",params:{center,radius:2,workPlane:"XY"}});}
const near=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} ≈ ${expected}`);
async function radius(value:number){const control=(feature("seed").params.topology as any).controls.find((c:any)=>c.role==="radius");await apply({type:"edit-drawing-control",objectId:"seed",controlId:control.id,point:[10+value,10,0]});}
test("a grid includes originals once, preserves stable instance references when resized, and roundtrips a live recipe",async()=>{
  await seed();cadHistory.clear();const before=documentState();
  const result=await apply({type:"create-pattern",id:"array",sourceObjectIds:["seed"],spec:linear});assert.equal(result.createdIds.length,5);
  assert.deepEqual(members().map(f=>f.params.center),[[30,10,0],[50,10,0],[10,40,0],[30,40,0],[50,40,0]]);
  assert.equal(cadDocument.objects.seed.visible,true);const after=documentState();assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),after);
  const topology=structuredClone(feature("array:seed:r0:c1").params.topology);
  const secondRow=structuredClone(feature("array:seed:r1:c0"));
  await apply({type:"update-pattern",patternId:"array",spec:{...linear,columns:2,rows:2,spacing:[25,-30]}});
  assert.deepEqual(feature("array:seed:r0:c1").params.topology,topology);assert.equal(members().length,3);assert.deepEqual(feature("array:seed:r1:c1").params.center,[35,-20,0]);
  assert.deepEqual(feature("array:seed:r1:c0").params.topology,secondRow.params.topology);assert.equal(feature("array:seed:r1:c0").pattern?.index,2);assert.deepEqual(feature("array:seed:r1:c0").params.center,[10,-20,0]);
  const encoded=serializeDocument(cadDocument);assert.equal(JSON.parse(encoded).version,3);assert.deepEqual(deserializeDocument(encoded),cadDocument);
  await radius(4);for(const f of members())assert.equal(f.params.radius,4);
  assert.ok(!parameterTargets(cadDocument).some(t=>t.target.kind==="feature"&&t.target.objectId.startsWith("array:")));
});
for(const planeId of ["XY","XZ","YZ"] as WorkPlaneId[])test(`${planeId} mirrors exact bulges and arc sweeps about an arbitrary axis`,async()=>{
  const plane=WORK_PLANES[planeId],point=(p:[number,number])=>planeToWorld(p,plane);
  await apply({type:"create-drawing",id:"poly",drawing:"polyline",params:{points:[point([2,0]),point([4,0]),point([4,2])],bulges:[0.5,0,0],closed:true,workPlane:planeId}});
  await apply({type:"create-drawing",id:"arc",drawing:"arc",params:{center:point([3,0]),radius:2,startAngle:0,endAngle:Math.PI*1.5,workPlane:planeId}});
  await apply({type:"create-pattern",id:"mirror",sourceObjectIds:["poly","arc"],spec:{kind:"mirror",workPlane:planeId,axisStart:[0,0],axisEnd:[10,10]}});
  const mirrored=feature("mirror:poly:1");assert.deepEqual(mirrored.params.points,[point([0,2]),point([0,4]),point([2,4])]);assert.deepEqual(mirrored.params.bulges,[-0.5,-0,-0]);
  const arc=feature("mirror:arc:1");near(Number(arc.params.startAngle),Math.PI/2);near(Number(arc.params.endAngle)-Number(arc.params.startAngle),-Math.PI*1.5);assert.equal(arc.params.radius,2);
  const exact=getWorldDrawingGeometry(cadDocument.objects[mirrored.output],mirrored)!;near(exact.profileSegments![0].radius!,1.25);
});
test("radial positive and negative steps rotate about the specified centre without duplicating the full circle",async()=>{
  await seed([12,5,0]);for(const angle of [90,-90]){
    const id=angle>0?"cw":"ccw";await apply({type:"create-pattern",id,sourceObjectIds:["seed"],spec:{kind:"radial",workPlane:"XY",count:4,center:[2,5],angle}});
    const centers=members(id).map(f=>f.params.center as number[]);near(centers[0][0],2);near(centers[0][1],angle>0?15:-5);near(centers[1][0],-8);near(centers[2][1],angle>0?-5:15);
  }
  assert.equal(validateCommand({type:"create-pattern",sourceObjectIds:["seed"],spec:{kind:"radial",workPlane:"XY",count:5,center:[2,5],angle:90}}),false);
});
test("source placement is baked exactly and nested arrays propagate edits in source order",async()=>{
  await apply({type:"create-drawing",id:"line",drawing:"line",params:{points:[[0,0,0],[10,0,0]],workPlane:"XY"}});
  await apply({type:"rotate-object",objectId:"line",rotation:[0,0,90]});await apply({type:"move-object",objectId:"line",translation:[3,4,0]});
  await apply({type:"create-pattern",id:"mirror",sourceObjectIds:["line"],spec:{kind:"mirror",workPlane:"XY",axisStart:[0,0],axisEnd:[0,10]}});
  const points=feature("mirror:line:1").params.points as number[][];near(points[0][0],-8);near(points[0][1],-1);near(points[1][1],9);
  await apply({type:"create-pattern",id:"nested",sourceObjectIds:["mirror:line:1"],spec:{...linear,columns:2,rows:1}});
  await apply({type:"move-object",objectId:"line",translation:[5,4,0]});near((members("nested")[0].params.points as number[][])[0][0],10);
});
test("preview has no document or history effects; Apply, Undo and Redo retain the evaluated IDs",async()=>{
  await seed();cadHistory.clear();const before=structuredClone(cadDocument);
  const preview=await previewCadCommand({type:"create-pattern",id:"array",sourceObjectIds:["seed"],spec:linear});assert.ok(preview.result.ok,preview.result.reason);assert.equal(preview.changes.length,5);assert.deepEqual(cadDocument,before);assert.deepEqual(cadHistory.getPastLabels(),[]);
  const result=await applyCadPlan(preview.planId);assert.ok(result.ok);assert.deepEqual(result.createdIds,preview.result.createdIds);assert.equal(cadHistory.getPastLabels().length,1);const after=documentState();assert.ok(undoDocument());assert.deepEqual(documentState(),documentState(before));assert.ok(redoDocument());assert.deepEqual(documentState(),after);assert.equal((await applyCadPlan(preview.planId)).changed,false);discardCadPlan(preview.planId);
});
test("repeat holes remain exact and changing the seed updates the downstream BRep with one Undo",async()=>{
  await apply({type:"create-drawing",id:"outline",drawing:"rectangle",params:{points:[[0,0,0],[70,0,0],[70,60,0],[0,60,0]],workPlane:"XY"}});await seed();
  await apply({type:"create-pattern",id:"array",sourceObjectIds:["seed"],spec:linear});
  await apply({type:"create-extrude",id:"plate",profileObjectIds:["outline","seed",...members().map(f=>f.output)],distance:5});
  const checkVolume=async(r:number)=>{const expected=(70*60-6*Math.PI*r*r)*5,measurement=await measureDocumentObject(cadDocument,"plate");assert.equal(measurement.basis,"brep");assert.equal(measurement.validity,"valid");near(measurement.volume!,expected);const mesh=await buildExtrudeMesh(feature("plate").params);assert.ok(Math.abs(meshVolume(mesh)-expected)/expected<0.001);};await checkVolume(2);
  const before=documentState();cadHistory.clear();await radius(3);await checkVolume(3);assert.deepEqual(cadHistory.getPastLabels(),["edit-drawing-control"]);const after=documentState();assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),after);
  const unchanged=structuredClone(cadDocument),past=cadHistory.getPastLabels();for(const command of [{type:"update-pattern",patternId:"array",spec:{...linear,columns:2}},{type:"delete-pattern",patternId:"array"}] as CadCommand[]){const result=await dispatchCadCommand(command);assert.equal(result.ok,false);assert.match(result.reason??"",/input|source/i);assert.deepEqual(cadDocument,unchanged);assert.deepEqual(cadHistory.getPastLabels(),past);}
});
test("individual edits are rejected; copying and detaching create independent drawings; group delete keeps sources",async()=>{
  await seed();await apply({type:"create-pattern",id:"array",sourceObjectIds:["seed"],spec:linear});const id=members()[0].output,before=structuredClone(cadDocument);
  for(const command of [{type:"delete-object",objectId:id},{type:"move-object",objectId:id,translation:[1,0,0]},{type:"edit-drawing-control",objectId:id,controlId:(feature(id).params.topology as any).controls[1].id,point:[35,10,0]}] as CadCommand[]){assert.equal((await dispatchCadCommand(command)).ok,false);assert.deepEqual(cadDocument,before);}
  const copied=await apply({type:"duplicate-object",objectId:id});assert.equal(feature(copied.createdIds[0]).pattern,undefined);
  await apply({type:"detach-pattern",patternId:"array"});assert.equal(members().length,0);await radius(3);assert.equal(feature(id).params.radius,2);await apply({type:"move-object",objectId:id,translation:[1,0,0]});
  await apply({type:"create-pattern",id:"mirror",sourceObjectIds:["seed"],spec:{kind:"mirror",workPlane:"XY",axisStart:[0,0],axisEnd:[0,10]}});await apply({type:"delete-pattern",patternId:"mirror"});assert.equal(members("mirror").length,0);assert.ok(cadDocument.objects.seed);
});
test("locked outputs and nonuniform curved sources reject atomically, including downstream regeneration",async()=>{
  await seed();await apply({type:"create-pattern",id:"array",sourceObjectIds:["seed"],spec:linear});await apply({type:"create-layer",id:"output"});await apply({type:"move-object-to-layer",objectId:members()[0].output,layerId:"output"});await apply({type:"set-layer-locked",layerId:"output",locked:true});
  const before=structuredClone(cadDocument);const control=(feature("seed").params.topology as any).controls[1].id;const result=await dispatchCadCommand({type:"edit-drawing-control",objectId:"seed",controlId:control,point:[13,10,0]});assert.equal(result.ok,false);assert.match(result.reason??"",/locked/);assert.deepEqual(cadDocument,before);
  await apply({type:"set-layer-locked",layerId:"output",locked:false});const state=structuredClone(cadDocument);const scaled=await dispatchCadCommand({type:"scale-object",objectId:"seed",scale:[2,1,1]});assert.equal(scaled.ok,false);assert.match(scaled.reason??"",/uniform/);assert.deepEqual(cadDocument,state);
});
test("a stale proposal, damaged group, cycle and old-version recipe are refused",async()=>{
  await seed();const preview=await previewCadCommand({type:"create-pattern",id:"array",sourceObjectIds:["seed"],spec:linear});await apply({type:"rename-object",objectId:"seed",name:"Updated"});const before=structuredClone(cadDocument);assert.equal((await applyCadPlan(preview.planId)).ok,false);assert.deepEqual(cadDocument,before);discardCadPlan(preview.planId);
  await apply({type:"create-pattern",id:"array",sourceObjectIds:["seed"],spec:{...linear,columns:2,rows:1}});const encoded=JSON.parse(serializeDocument(cadDocument));const bad=structuredClone(encoded);bad.version=2;assert.throws(()=>deserializeDocument(JSON.stringify(bad)),/version 3/);
  const cyclic=structuredClone(encoded),f=Object.values(cyclic.document.features).find((f:any)=>f.pattern) as any;f.pattern.sourceId=f.output;f.pattern.sourceObjectIds=[f.output];f.inputs=[f.output];assert.throws(()=>deserializeDocument(JSON.stringify(cyclic)),/Cyclic/);
  const displaced=structuredClone(encoded);displaced.document.objects["array:seed:r0:c1"].transform.translation=[1,0,0];assert.throws(()=>deserializeDocument(JSON.stringify(displaced)),/placement/);
  const planeMismatch=structuredClone(encoded);planeMismatch.document.features["feature-array:seed:r0:c1"].pattern.spec.workPlane="YZ";assert.throws(()=>deserializeDocument(JSON.stringify(planeMismatch)),/work plane/);
  await apply({type:"update-pattern",patternId:"array",spec:linear});const incomplete=JSON.parse(serializeDocument(cadDocument));delete incomplete.document.features["feature-array:seed:r0:c1"];assert.throws(()=>deserializeDocument(JSON.stringify(incomplete)),/Incomplete|feature/i);
});
test("invalid counts, zero axes, excessive outputs and mixed planes never enter a transaction",async()=>{
  await seed();for(const spec of [{...linear,columns:0},{...linear,columns:3.2},{...linear,spacing:[0,20]},{kind:"mirror",workPlane:"XY",axisStart:[1,1],axisEnd:[1,1]},{kind:"radial",workPlane:"XY",count:6,center:[0,0],angle:0}])assert.equal(validateCommand({type:"create-pattern",sourceObjectIds:["seed"],spec}),false);
  await apply({type:"create-drawing",id:"xz",drawing:"line",params:{points:[[0,0,0],[10,0,0]],workPlane:"XZ"}});const before=structuredClone(cadDocument);const result=await dispatchCadCommand({type:"create-pattern",sourceObjectIds:["seed","xz"],spec:linear});assert.equal(result.ok,false);assert.deepEqual(cadDocument,before);
  assert.equal(validateCommand({type:"create-pattern",sourceObjectIds:["seed","xz","other"],spec:{...linear,columns:128,rows:1}}),false);
});
test("sketch driven radius propagates through arrays to dimensions and editable DXF circles",async()=>{
  await apply({type:"create-sketch",id:"sketch",workPlane:"XY"});await apply({type:"add-sketch-geometry",sketchId:"sketch",geometry:{id:"sketch-circle",kind:"circle",centerId:"center",curveId:"curve",center:[10,10],radius:2}});
  await apply({type:"add-sketch-constraint",sketchId:"sketch",constraint:{id:"driving-radius",kind:"radius",geometryId:"sketch-circle",value:2}});
  await apply({type:"create-pattern",id:"array",sourceObjectIds:["sketch-circle"],spec:{...linear,columns:3,rows:1}});
  await apply({type:"create-dimension",id:"dimension",dimension:"radius",params:{sourceObjectId:"array:sketch-circle:r0:c1",center:[30,10],radius:2,workPlane:"XY"}});
  await apply({type:"set-sketch-dimension",sketchId:"sketch",constraintId:"driving-radius",value:4});
  near(Number(feature("array:sketch-circle:r0:c1").params.radius),4);near(Number(feature("dimension").params.radius),4);assert.equal(feature("array:sketch-circle:r0:c1").params.sketchId,undefined);
  assert.equal(collectExportDrawings("XY").length,3);const dxf=encodeDxf(cadDocument);assert.equal(dxf.skipped,0);assert.equal((dxf.text.match(/\nCIRCLE\n/g)??[]).length,3);
  const circles=parseDxf(dxf.text).entities.filter(e=>e.kind==="circle");assert.equal(circles.length,3);
  circles.forEach((circle,index)=>{near(circle.radius,4);near(circle.center[0],10+20*index);near(circle.center[1],10);near(circle.center[2],0);});
});
test("rotated plane normals and scaled sources preserve the real arc sweep",async()=>{
  await apply({type:"create-drawing",id:"arc",drawing:"arc",params:{center:[3,5,0],radius:2,startAngle:0,endAngle:Math.PI/2,workPlane:"XY"}});
  await apply({type:"rotate-object",objectId:"arc",rotation:[180,0,0]});
  await apply({type:"create-pattern",id:"mirror",sourceObjectIds:["arc"],spec:{kind:"mirror",workPlane:"XY",axisStart:[0,0],axisEnd:[0,50]}});
  const reflected=feature("mirror:arc:1");near(Number(reflected.params.endAngle)-Number(reflected.params.startAngle),Math.PI/2);const center=reflected.params.center as number[];near(center[0],-3);near(center[1],7);
  await apply({type:"scale-object",objectId:"arc",scale:[2,2,1]});const updated=feature("mirror:arc:1");near(Number(updated.params.radius),4);near(Number(updated.params.endAngle)-Number(updated.params.startAngle),Math.PI/2);
});
test("out-of-plane sources cannot create or regenerate a 2D pattern with flattened geometry",async()=>{
  await seed();await apply({type:"move-object",objectId:"seed",translation:[0,0,5]});const before=structuredClone(cadDocument);
  const rejected=await dispatchCadCommand({type:"create-pattern",id:"array",sourceObjectIds:["seed"],spec:linear});assert.equal(rejected.ok,false);assert.match(rejected.reason??"",/work plane/);assert.deepEqual(cadDocument,before);
  await apply({type:"move-object",objectId:"seed",translation:[0,0,0]});await apply({type:"create-pattern",id:"array",sourceObjectIds:["seed"],spec:linear});const state=structuredClone(cadDocument),history=cadHistory.getPastLabels();
  for(const command of [{type:"move-object",objectId:"seed",translation:[0,0,5]},{type:"rotate-object",objectId:"seed",rotation:[10,0,0]}] as CadCommand[]){const result=await dispatchCadCommand(command);assert.equal(result.ok,false);assert.match(result.reason??"",/work plane/);assert.deepEqual(cadDocument,state);assert.deepEqual(cadHistory.getPastLabels(),history);}
});
