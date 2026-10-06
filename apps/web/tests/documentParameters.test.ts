import assert from "node:assert/strict";
import {test} from "node:test";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {cadDocument} from "../src/state/cadDocument";
import {cadHistory,undoDocument,redoDocument} from "../src/state/history";
import {previewCadCommand,applyCadPlan} from "../src/state/documentPlans";
import {queryCadDocument} from "../src/state/documentQuery";
import {measureDocumentObject} from "../src/state/documentQuery";
import {serializeDocument,deserializeDocument} from "@agent-webcad/cad-document";
import {documentState,resetTestDocument} from "./helpers/documentHarness";
import {createVariablePlate} from "./helpers/variablePlate";

test("one plate-width edit drives pitch, anchored hole centers, exact extrusion and complete Undo/Redo",async()=>{
  resetTestDocument();await createVariablePlate();const before=documentState();cadHistory.clear();
  const preview=await previewCadCommand({type:"set-variable",name:"plateWidth",quantity:"length",expression:"120mm"});
  assert.equal(preview.result.ok,true,preview.result.reason);assert.deepEqual(documentState(),before);
  assert.equal(preview.variables.after.holePitch.value,100/3);
  const previewVolume=preview.changes.find(change=>change.objectId==="plate-solid")!.after!.volume!;
  // Propagate the 1e-6 mm solver tolerance through the requested plate's area and depth.
  assert.ok(Math.abs(previewVolume-(120*60-4*Math.PI*16)*8)<0.003,`actual ${previewVolume}, expected ${(120*60-4*Math.PI*16)*8}`);
  assert.equal((await applyCadPlan(preview.planId)).ok,true);
  const geometry=cadDocument.sketches!["plate-sketch"].geometry;
  assert.equal(geometry[0].kind,"rectangle");assert.ok(Math.abs((geometry[0] as {width:number}).width-120)<1e-6);
  for(let i=0;i<4;i++){const hole=geometry.find(entry=>entry.id===`hole-${i}`)!;assert.equal(hole.kind,"circle");if(hole.kind==="circle")assert.ok(Math.abs(hole.center[0]-(10+100*i/3))<1e-6);}
  const outline=geometry[0];if(outline.kind!=="rectangle")throw new Error("Missing outline");
  const exactArea=outline.width*outline.height-geometry.reduce((sum,entry)=>sum+(entry.kind==="circle"?Math.PI*entry.radius**2:0),0);
  assert.ok(Math.abs(previewVolume-exactArea*8)<1e-5,"BRep volume must match the solved analytic geometry separately from solver target error");
  assert.equal(cadHistory.getPastLabels().length,1);
  const after=documentState();assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),after);
  assert.deepEqual(documentState(deserializeDocument(serializeDocument(cadDocument))),after);
  const query=await queryCadDocument(["plate-solid"]);assert.equal(query.variables.plateWidth.value,120);assert.equal(Object.keys(query.bindings).length,10);
});
test("driven extrusion depth rebuilds bounds, negative depth and downstream solids without stale caches",async()=>{
  resetTestDocument();await createVariablePlate();
  assert.equal((await dispatchCadCommand({type:"create-box",id:"notch",width:5,depth:5,height:40,position:[40,5,-20]})).ok,true);
  assert.equal((await dispatchCadCommand({type:"boolean-operation",id:"cut-plate",operation:"cut",target:"plate-solid",tool:"notch"})).ok,true);
  const result=await dispatchCadCommand({type:"set-variable",name:"thickness",quantity:"length",expression:"-12mm"});assert.ok(result.ok,result.reason);
  const measured=await measureDocumentObject(cadDocument,"plate-solid");assert.ok(Math.abs(measured.bounds!.min[2]+12)<1e-6);assert.equal(measured.bounds!.max[2],0);
  assert.ok(Math.abs(measured.volume!-(100*60-4*Math.PI*16)*12)<1e-5);
  const cut=await measureDocumentObject(cadDocument,"cut-plate");assert.ok(Math.abs(cut.volume!-((100*60-4*Math.PI*16)-25)*12)<1e-5);assert.equal(cut.validity,"valid");
});
test("invalid units, cycles, missing variables, blocked dependents and touching holes roll back variables, geometry and redo",async()=>{
  resetTestDocument();await createVariablePlate();await dispatchCadCommand({type:"rename-object",objectId:"plate-solid",name:"Rename"});undoDocument();
  const before=structuredClone(cadDocument),past=cadHistory.getPastLabels(),future=cadHistory.getFutureLabels();
  for(const expression of ["120deg","holePitch","missing","0mm","15mm"]){
    const result=await dispatchCadCommand({type:"set-variable",name:"plateWidth",quantity:"length",expression});assert.equal(result.ok,false,expression);
    assert.deepEqual(cadDocument,before);assert.deepEqual(cadHistory.getPastLabels(),past);assert.deepEqual(cadHistory.getFutureLabels(),future);
  }
  const removed=await dispatchCadCommand({type:"remove-variable",name:"edgeMargin"});assert.equal(removed.ok,false);assert.match(removed.reason!,/Unknown variable/);assert.deepEqual(cadDocument,before);
  await dispatchCadCommand({type:"set-layer-locked",layerId:"layer-default",locked:true});const locked=structuredClone(cadDocument);
  assert.equal((await dispatchCadCommand({type:"set-variable",name:"plateWidth",quantity:"length",expression:"120mm"})).ok,false);assert.deepEqual(cadDocument,locked);
  assert.equal((await dispatchCadCommand({type:"set-parameter-binding",target:{kind:"feature",objectId:"plate-solid",parameter:"distance"},expression:"thickness"})).ok,false);
  assert.equal((await dispatchCadCommand({type:"remove-parameter-binding",bindingId:Object.keys(cadDocument.parameterBindings!)[0]})).ok,false);assert.deepEqual(cadDocument,locked);
});
test("bound values require an explicit unbind before direct editing and deleting a target cleans its binding",async()=>{
  resetTestDocument();await dispatchCadCommand({type:"create-box",id:"box",width:10,depth:20,height:30});
  await dispatchCadCommand({type:"set-variable",name:"width",quantity:"length",expression:"10mm"});
  await dispatchCadCommand({type:"set-parameter-binding",target:{kind:"feature",objectId:"box",parameter:"width"},expression:"width"});
  const before=documentState();const result=await dispatchCadCommand({type:"update-box",objectId:"box",width:12,depth:20,height:30});assert.equal(result.ok,false);assert.match(result.reason!,/driven/);assert.deepEqual(documentState(),before);
  const id=Object.keys(cadDocument.parameterBindings!)[0];await dispatchCadCommand({type:"remove-parameter-binding",bindingId:id});assert.equal((await dispatchCadCommand({type:"update-box",objectId:"box",width:12,depth:20,height:30})).ok,true);
  await dispatchCadCommand({type:"set-parameter-binding",target:{kind:"feature",objectId:"box",parameter:"width"},expression:"width"});
  await dispatchCadCommand({type:"delete-object",objectId:"box"});assert.deepEqual(cadDocument.parameterBindings,{});assert.doesNotThrow(()=>deserializeDocument(serializeDocument(cadDocument)));
});
test("all primitive bindings are resolved together and saved files reject mismatched cached parameters",async()=>{
  resetTestDocument();await dispatchCadCommand({type:"create-primitive",id:"torus",primitive:"torus",params:{majorRadius:20,minorRadius:10}});
  await dispatchCadCommand({type:"set-variable",name:"factor",quantity:"scalar",expression:"1"});
  for(const [parameter,expression] of [["majorRadius","20mm*factor"],["minorRadius","10mm*factor"]])assert.equal((await dispatchCadCommand({type:"set-parameter-binding",target:{kind:"feature",objectId:"torus",parameter},expression})).ok,true);
  const result=await dispatchCadCommand({type:"set-variable",name:"factor",quantity:"scalar",expression:"0.1"});assert.equal(result.ok,true,result.reason);
  const params=cadDocument.features["feature-torus"].params;assert.equal(params.majorRadius,2);assert.equal(params.minorRadius,1);
  const bad=structuredClone(cadDocument);bad.features["feature-torus"].params.majorRadius=3;assert.throws(()=>deserializeDocument(serializeDocument(bad)),/driven parameter/);
});

test("angle variables use radians internally and drive degree-based revolution without changing units",async()=>{
  resetTestDocument();
  assert.equal((await dispatchCadCommand({type:"create-drawing",id:"profile",drawing:"rectangle",params:{workPlane:"XY",points:[[10,0,0],[20,0,0],[20,5,0],[10,5,0]]}})).ok,true);
  assert.equal((await dispatchCadCommand({type:"create-revolve",id:"tube",profileObjectIds:["profile"],axis:"y",angle:360})).ok,true);
  await dispatchCadCommand({type:"set-variable",name:"turn",quantity:"angle",expression:"180deg"});
  const result=await dispatchCadCommand({type:"set-parameter-binding",target:{kind:"feature",objectId:"tube",parameter:"angle"},expression:"turn"});assert.equal(result.ok,true,result.reason);
  assert.equal(cadDocument.features["feature-tube"].params.angle,180);
  const query=await queryCadDocument(["tube"]);assert.equal(query.variables.turn.value,Math.PI);assert.equal(query.variables.turn.unit,"rad");assert.ok(Math.abs(query.objects[0].measurement!.volume!-750*Math.PI)<1e-5);
});

test("an independent copied extrusion can have its own depth binding without becoming a live source instance",async()=>{
  resetTestDocument();await createVariablePlate();
  const copy=(await dispatchCadCommand({type:"duplicate-object",objectId:"plate-solid"})).createdIds[0];assert.ok(copy);
  const result=await dispatchCadCommand({type:"set-parameter-binding",target:{kind:"feature",objectId:copy,parameter:"distance"},expression:"thickness * 2"});assert.equal(result.ok,true,result.reason);
  const copied=Object.values(cadDocument.features).find(feature=>feature.output === copy)!;
  assert.equal(copied.params.distance,16);assert.equal(copied.dependencyMode,"snapshot");assert.deepEqual(copied.inputs,[]);
  assert.ok(Math.abs((await measureDocumentObject(cadDocument,copy)).volume!-(100*60-4*Math.PI*16)*16)<1e-5);
  assert.equal(cadDocument.features["feature-plate-solid"].params.distance,8);
});

test("preview exposes expression-only and binding-only changes without leaking the stored definition",async()=>{
  resetTestDocument();await dispatchCadCommand({type:"set-variable",name:"width",quantity:"length",expression:"100mm"});
  const preview=await previewCadCommand({type:"set-variable",name:"width",quantity:"length",expression:"10cm"});
  assert.equal(preview.variableChanges[0].before!.expression,"100mm");assert.equal(preview.variableChanges[0].after!.expression,"10cm");assert.deepEqual(preview.changes,[]);
  preview.variableChanges[0].after!.expression="2mm";await applyCadPlan(preview.planId);assert.equal(cadDocument.variables!.width.expression,"10cm");
  await dispatchCadCommand({type:"create-box",id:"box",width:100,depth:2,height:3});
  const binding=await previewCadCommand({type:"set-parameter-binding",target:{kind:"feature",objectId:"box",parameter:"width"},expression:"width"});
  assert.equal(binding.bindingChanges.length,1);assert.equal(binding.bindingChanges[0].after!.expression,"width");assert.deepEqual(binding.changes,[]);
});

test("relationship files use version 2 while existing version 1 geometry remains readable",async()=>{
  resetTestDocument();const legacy=serializeDocument(cadDocument);assert.equal(JSON.parse(legacy).version,1);assert.deepEqual(deserializeDocument(legacy),cadDocument);
  await dispatchCadCommand({type:"set-variable",name:"width",quantity:"length",expression:"100mm"});
  const current=JSON.parse(serializeDocument(cadDocument));assert.equal(current.version,2);assert.deepEqual(deserializeDocument(JSON.stringify(current)),cadDocument);
  current.version=99;assert.throws(()=>deserializeDocument(JSON.stringify(current)),/Unsupported CAD file format/);
  const large=structuredClone(cadDocument);
  large.variables!.width.expression="1e9mm";
  large.objects.box={id:"box",geometryId:"box-geometry",name:"Box",visible:true,layerId:"layer-default"};
  large.features.box={id:"box",type:"primitive",inputs:[],output:"box",params:{width:1e9,depth:10,height:10}};
  large.parameterBindings={width:{id:"width",target:{kind:"feature",objectId:"box",parameter:"width"},expression:"width"}};
  assert.doesNotThrow(()=>deserializeDocument(serializeDocument(large)));
  large.features.box.params.width=1e9+0.5;
  assert.throws(()=>deserializeDocument(serializeDocument(large)),/driven parameter/); // Relative-only checking would hide this 0.5 mm error.
});
