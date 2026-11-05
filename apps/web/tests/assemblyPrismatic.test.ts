import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {deserializeDocument,serializeDocument,validateAssembly,validJointInput,validJointEdit,resolveJointValues,type CadDocument,type JointInput} from "@agent-webcad/cad-document";
import {createDocumentCommandExecutor} from "../src/state/commandBus";
import {assemblyMatrix,assertAssemblyPose,evaluateAssembly} from "../src/state/assemblyCommands";
import {assemblyMotionGroups,drivenAssemblyParts,motionAngles,motionPose,inspectAssemblyMotion,type MotionRequest} from "../src/state/assemblyMotion";
import {planCadModelingTools} from "../src/copilot/cadModelingTools";
import {cadDocument} from "../src/state/cadDocument";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {cadHistory,undoDocument,redoDocument} from "../src/state/history";
import {restoreTestDocument} from "./helpers/documentHarness";

function fixture(){
 const d:CadDocument={id:"prismatic-test",revision:0,objects:{},features:{},layers:{"layer-default":{id:"layer-default",name:"Default",visible:true,locked:false,objectIds:[]}},rootObjects:[],rootLayers:["layer-default"]};
 for(const [i,id] of ["base","slide","follower","leaf","fixed","obstacle"].entries()){
  d.objects[id]={id,name:id,geometryId:"g-"+id,visible:true,layerId:"layer-default",transform:{translation:[i*10,0,0],rotation:[0,0,0],scale:[1,1,1]}};
  d.features["f-"+id]={id:"f-"+id,type:"primitive",inputs:[],output:id,params:{kind:"box",width:1,depth:1,height:1}};
  d.rootObjects.push(id);d.layers["layer-default"].objectIds.push(id);
 }return d;
}
const slide=(id:string,childId:string):JointInput=>({id,type:"prismatic",parentId:"base",childId,origin:[7,8,9],axis:[1,0,0],offset:0,min:0,max:100});
async function chain(){const d=fixture(),run=createDocumentCommandExecutor(d);
 await run({type:"assembly-joint-create",joint:slide("driver","slide")});
 await run({type:"assembly-joint-create",joint:{...slide("linked","follower"),coupling:{driverId:"driver",ratio:-.5,offset:5},min:-50,max:5}});
 await run({type:"assembly-joint-create",joint:{id:"roof",type:"revolute",parentId:"follower",childId:"leaf",origin:[0,0,0],axis:[0,0,1],angle:0,coupling:{driverId:"linked",ratio:2,offset:-10},min:-100,max:0}});
 await run({type:"assembly-joint-create",joint:{id:"weld",type:"fixed",parentId:"slide",childId:"fixed",origin:[0,0,0],axis:[0,0,1],angle:0}});return d;
}
const near=(a:number[],b:number[])=>assert.ok(a.every((v,i)=>Math.abs(v-b[i])<1e-7),JSON.stringify({a,b}));
test("prismatic is absolute parent-local translation under a rotated parent; nonzero origin does not add rotation",async()=>{
 const d=fixture();d.objects.base.transform!.rotation=[0,0,90];const run=createDocumentCommandExecutor(d);
 await run({type:"assembly-joint-create",joint:slide("driver","slide")});const rest=assemblyMatrix(d.assembly!.joints.driver.rest),geometry=JSON.stringify(d.features);
 for(const offset of [10,90,0,10]){await run({type:"assembly-joint-update",jointId:"driver",offset});near(d.objects.slide.transform!.translation,[10,offset,0]);near(assemblyMatrix(d.objects.slide.transform!).elements,assemblyMatrix(d.objects.base.transform!).multiply(new (await import("three")).Matrix4().makeTranslation(offset,0,0)).multiply(rest).elements);assertAssemblyPose(d);}
 assert.equal(JSON.stringify(d.features),geometry);
});
test("coupled mixed-unit chains resolve independently of joint insertion order, with negative and zero ratios",async()=>{
 const d=await chain(),run=createDocumentCommandExecutor(d);d.assembly!.joints=Object.fromEntries(Object.entries(d.assembly!.joints).reverse());
 await run({type:"assembly-joint-update",jointId:"driver",offset:20});assert.equal(d.assembly!.joints.linked.offset,-5);assert.equal(d.assembly!.joints.roof.angle,-20);near(d.objects.slide.transform!.translation,[30,0,0]);near(d.objects.follower.transform!.translation,[15,0,0]);assertAssemblyPose(d);
 assert.deepEqual([...drivenAssemblyParts(d,"driver")].sort(),["fixed","follower","leaf","slide"]);
 const groups=assemblyMotionGroups(d,"driver");assert.equal(groups.get("slide"),groups.get("fixed"));assert.notEqual(groups.get("slide"),groups.get("follower"));assert.notEqual(groups.get("leaf"),groups.get("follower"));
 await run({type:"assembly-joint-edit",jointId:"linked",edit:{coupling:{driverId:"driver",ratio:0,offset:0}},preserveWorld:false});assert.equal(drivenAssemblyParts(d,"driver").has("follower"),false);assert.equal(drivenAssemblyParts(d,"driver").has("leaf"),false);
});
test("invalid scalar/coupling schemas, missing/fixed drivers, both dependency cycles and resolved limits reject",async()=>{
 assert.equal(validJointInput(slide("a","slide")),true);for(const bad of [{offset:NaN},{offset:Infinity},{angle:2},{coupling:{driverId:"x",ratio:1,offset:0,extra:true}},{coupling:{driverId:"x",ratio:Infinity,offset:0}}])assert.equal(validJointInput({...slide("a","slide"),...bad}),false);
 assert.equal(validJointEdit({coupling:null}),true);assert.equal(validJointEdit({coupling:{driverId:"driver",ratio:2,offset:1}}),true);assert.equal(validJointEdit({coupling:{driverId:"driver",ratio:2}}),false);
 const source=await chain();for(const mutate of [(d:CadDocument)=>{d.assembly!.joints.linked.coupling!.driverId="missing";},(d:CadDocument)=>{d.assembly!.joints.linked.coupling!.driverId="weld";},(d:CadDocument)=>{d.assembly!.joints.driver.coupling={driverId:"roof",ratio:1,offset:0};},(d:CadDocument)=>{d.assembly!.joints.driver.parentId="fixed";},(d:CadDocument)=>{d.assembly!.joints.roof.min=-10;d.assembly!.joints.driver.offset=40;}]){const d=structuredClone(source);mutate(d);assert.throws(()=>validateAssembly(d));}
 const overflow=structuredClone(source);overflow.assembly!.joints.roof.coupling!.ratio=1e9;assert.throws(()=>validateAssembly(overflow),/limits/);
});
test("public driver commands are atomic on downstream limits, locks, follower edits and driver deletion",async()=>{
 const original=structuredClone(cadDocument);try{const d=await chain();d.assembly!.joints.roof.min=-10;restoreTestDocument(d);cadHistory.clear();
 for(const command of [{type:"assembly-joint-update",jointId:"driver",offset:20},{type:"assembly-joint-update",jointId:"driver",angle:5},{type:"assembly-joint-update",jointId:"linked",offset:0},{type:"assembly-joint-delete",jointId:"driver"},{type:"assembly-joint-edit",jointId:"driver",edit:{coupling:{driverId:"roof",ratio:1,offset:0}},preserveWorld:false}] as any[]){const before=serializeDocument(cadDocument);assert.equal((await dispatchCadCommand(command)).ok,false);assert.equal(serializeDocument(cadDocument),before);}
 cadDocument.layers.locked={id:"locked",name:"locked",visible:true,locked:true,objectIds:["leaf"]};cadDocument.rootLayers.push("locked");cadDocument.layers["layer-default"].objectIds=cadDocument.layers["layer-default"].objectIds.filter(id=>id!=="leaf");cadDocument.objects.leaf.layerId="locked";
 for(const command of [{type:"assembly-joint-update",jointId:"driver",offset:5},{type:"assembly-joint-edit",jointId:"linked",edit:{coupling:{driverId:"driver",ratio:0,offset:4}},preserveWorld:true}] as const){const before=serializeDocument(cadDocument);assert.equal((await dispatchCadCommand(command)).ok,false);assert.equal(serializeDocument(cadDocument),before);}
 }finally{restoreTestDocument(original);cadHistory.clear();}
});
test("prismatic coupling edits preserve selected world pose; null unlinks at the effective scalar",async()=>{
 const d=await chain(),run=createDocumentCommandExecutor(d);await run({type:"assembly-joint-update",jointId:"driver",offset:20});const before=Object.fromEntries(Object.keys(d.objects).map(id=>[id,assemblyMatrix(d.objects[id].transform!).elements]));
 await run({type:"assembly-joint-edit",jointId:"linked",edit:{axis:[0,1,0],coupling:{driverId:"driver",ratio:-1,offset:0}},preserveWorld:true});for(const id of Object.keys(d.objects))near(assemblyMatrix(d.objects[id].transform!).elements,before[id]);assertAssemblyPose(d);
 await run({type:"assembly-joint-edit",jointId:"linked",edit:{coupling:null,min:null,max:null},preserveWorld:true});assert.equal(d.assembly!.joints.linked.offset,-20);await run({type:"assembly-joint-update",jointId:"linked",offset:-15});assertAssemblyPose(d);
});
test("Undo/Redo and v65 reopen preserve every coupled value, rest frame and world pose; legacy v62-v64 reopen unchanged",async()=>{
 const original=structuredClone(cadDocument);try{restoreTestDocument(await chain());cadHistory.clear();const before=structuredClone(cadDocument);const result=await dispatchCadCommand({type:"assembly-joint-update",jointId:"driver",offset:30});assert.equal(result.ok,true,result.reason);const after=structuredClone(cadDocument);
 await undoDocument();assert.deepEqual(cadDocument.assembly,before.assembly);assert.deepEqual(cadDocument.objects,before.objects);await redoDocument();assert.deepEqual(cadDocument.assembly,after.assembly);assert.deepEqual(cadDocument.objects,after.objects);
 const file=serializeDocument(cadDocument);assert.equal(JSON.parse(file).version,65);const reopened=deserializeDocument(file);assertAssemblyPose(reopened);assert.deepEqual(reopened.assembly,after.assembly);assert.deepEqual(reopened.objects,after.objects);evaluateAssembly(reopened);assert.deepEqual(reopened.assembly,after.assembly);
 for(const version of [62,63,64]){const old=JSON.parse(file);old.version=version;assert.throws(()=>deserializeDocument(JSON.stringify(old)),/65/);}
 const legacy=await readFile(new URL("../../../output/verification/assembly-phase-a/laptop-stand-assembly.webcad.json",import.meta.url),"utf8");for(const version of [62,63,64]){const file=JSON.parse(legacy);file.version=version;const reopened=deserializeDocument(JSON.stringify(file));assertAssemblyPose(reopened);assert.deepEqual(reopened.assembly,file.document.assembly);}
 }finally{restoreTestDocument(original);cadHistory.clear();}
});
test("real OCCT prismatic/coupled sibling collision changes at the middle sample and is never reused as invariant",async()=>{
 const d=fixture(),run=createDocumentCommandExecutor(d);d.objects.slide.transform!.translation=[0,0,0];d.objects.follower.transform!.translation=[20,0,0];
 await run({type:"assembly-joint-create",joint:slide("driver","slide")});await run({type:"assembly-joint-create",joint:{...slide("linked","follower"),min:-100,coupling:{driverId:"driver",ratio:-1,offset:0}}});
 const r:MotionRequest={jointId:"driver",start:0,end:20,step:10,partIds:["slide","follower"],exceptions:[],tolerance:1e-6},before=serializeDocument(d),report=await inspectAssemblyMotion(d,r);
 assert.equal(report.state,"finished",report.reason);assert.deepEqual(report.rows.map(r=>r.baseStatus),["no-penetration","penetration","no-penetration"]);assert.equal(report.stats.invariantReuse,0);assert.ok(report.rows.every(r=>r.relativeMotion==="motion-dependent"));assert.ok(Math.abs(report.rows[1].commonVolume!-1)<1e-6);assert.equal(serializeDocument(d),before);
 const pose=motionPose(d,r,10);assert.equal(resolveJointValues(pose.assembly!).get("linked"),-10);assert.throws(()=>motionPose(d,{...r,jointId:"linked"},0),/independent/);
 d.assembly!.joints.linked.min=-5;await assert.rejects(()=>inspectAssemblyMotion(d,r),/limits/);
});
test("v65 migration restores optional prismatic compatibility angle and derived follower caches",async()=>{
 const d=await chain(),file=JSON.parse(serializeDocument(d));delete file.document.assembly.joints.driver.angle;file.document.assembly.joints.linked.offset=999;
 const reopened=deserializeDocument(JSON.stringify(file));assert.equal(reopened.assembly!.joints.driver.angle,0);assert.equal(reopened.assembly!.joints.linked.offset,5);assertAssemblyPose(reopened);assert.deepEqual(reopened.objects,d.objects);
});
test("prismatic sampling uses length limits beyond the legacy angular cap; tool planning accepts exactly one scalar",async()=>{
 const d=fixture(),run=createDocumentCommandExecutor(d);await run({type:"assembly-joint-create",joint:{...slide("driver","slide"),max:1e6}});
 const r:MotionRequest={jointId:"driver",start:400000,end:600000,step:100000,partIds:["slide","obstacle"],exceptions:[],tolerance:1e-6};assert.deepEqual(motionAngles(r),[400000,500000,600000]);assert.equal(motionPose(d,r,500000).assembly!.joints.driver.offset,500000);
 const c={document:d,selectionIds:["slide"],layerId:"layer-default",workPlane:"XY" as const},plan=await planCadModelingTools([{id:"slide",name:"assembly.joint.update",arguments:{jointId:"driver",offset:25}}],c);assert.deepEqual(plan.command,{type:"assembly-joint-update",jointId:"driver",offset:25});await run(plan.command);assert.equal(d.assembly!.joints.driver.offset,25);
 for(const args of [{jointId:"driver"},{jointId:"driver",angle:1,offset:1}])await assert.rejects(()=>planCadModelingTools([{id:"bad",name:"assembly.joint.update",arguments:args}],c));
});
