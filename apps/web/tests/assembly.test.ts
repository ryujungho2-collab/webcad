import test from "node:test";
import assert from "node:assert/strict";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {Vector3,Matrix4} from "three";
import {deserializeDocument,serializeDocument,validateAssembly,type JointInput} from "@agent-webcad/cad-document";
import {createDocumentCommandExecutor} from "../src/state/commandBus";
import {evaluateAssembly,assemblyMatrix,assertAssemblyPose} from "../src/state/assemblyCommands";
import {cadDocument} from "../src/state/cadDocument";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {undoDocument,redoDocument,cadHistory} from "../src/state/history";
import {previewCadCommand,applyCadPlan,discardCadPlan,getCadPlanFrameDocument} from "../src/state/documentPlans";
import {restoreTestDocument} from "./helpers/documentHarness";
import {planCadModelingTools} from "../src/copilot/cadModelingTools";
import {createCadToolSession} from "../src/copilot/cadToolSession";
const source=new URL("../../../output/projects/rotating-laptop-stand/laptop-stand.webcad.json",import.meta.url);
const load=async()=>deserializeDocument(await readFile(source,"utf8"));
const input=(id:string,parentId:string,childId:string,type:"fixed"|"revolute"="fixed"):JointInput=>({id,parentId,childId,type,origin:[0,0,20],axis:[0,0,1],angle:0});
const near=(a:number[],b:number[],e=1e-7)=>assert.ok(a.every((v,i)=>Math.abs(v-b[i])<e),JSON.stringify({a,b}));
async function stand(){const d=await load(),run=createDocumentCommandExecutor(d);await run({type:"assembly-ground",objectId:"stand-base",grounded:true});for(const j of [input("bearing","stand-base","stand-turntable","revolute"),input("shaft","stand-base","stand-shaft"),input("support","stand-turntable","stand-support"),input("plate","stand-support","stand-plate"),input("lip","stand-plate","stand-lip")])await run({type:"assembly-joint-create",joint:j});return d;}
test("laptop original is readable; 0/90/180 rotate whole upper assembly absolutely without geometry changes",async()=>{
 const raw=await readFile(source,"utf8"),d=await stand(),run=createDocumentCommandExecutor(d),geometry=JSON.stringify(d.features),initial=structuredClone(d.objects);
 for(const angle of [90,180,0,90,0]){await run({type:"assembly-joint-update",jointId:"bearing",angle});for(const id of ["stand-turntable","stand-support","stand-plate","stand-lip"]){const expected=new Vector3(...initial[id].transform!.translation).applyAxisAngle(new Vector3(0,0,1),angle*Math.PI/180);near(d.objects[id].transform!.translation,expected.toArray());near(assemblyMatrix(d.objects[id].transform!).elements,new Matrix4().makeRotationZ(angle*Math.PI/180).multiply(assemblyMatrix(initial[id].transform!)).elements);}near(d.objects["stand-base"].transform!.translation,[0,0,0]);assert.equal(JSON.stringify(d.features),geometry);}
 assert.equal(await readFile(source,"utf8"),raw);assert.equal(JSON.parse(serializeDocument(d)).version,62);assert.deepEqual(deserializeDocument(serializeDocument(d)).assembly,d.assembly);
 const rel=(child:string,parent:string)=>assemblyMatrix(d.objects[parent].transform!).invert().multiply(assemblyMatrix(d.objects[child].transform!)).elements;
 near(rel("stand-lip","stand-plate"),assemblyMatrix(d.assembly!.joints.lip.rest).elements);
 await mkdir(new URL("../../../output/verification/assembly-phase-a/",import.meta.url),{recursive:true});await writeFile(new URL("../../../output/verification/assembly-phase-a/laptop-stand-assembly.webcad.json",import.meta.url),serializeDocument(d));
});
test("off-origin arbitrary parent-local axis and Fixed propagation after free parent transform",async()=>{
 const d=await load(),run=createDocumentCommandExecutor(d);const j=input("x","stand-base","stand-support","revolute");j.origin=[10,20,30];j.axis=[1,0,0];await run({type:"assembly-joint-create",joint:j});
 const bind=assemblyMatrix(d.assembly!.joints.x.rest);await run({type:"assembly-joint-update",jointId:"x",angle:90});const expected=new Matrix4().makeTranslation(10,20,30).multiply(new Matrix4().makeRotationX(Math.PI/2)).multiply(new Matrix4().makeTranslation(-10,-20,-30)).multiply(bind);near(assemblyMatrix(d.objects["stand-support"].transform!).elements,expected.elements);
 await run({type:"assembly-joint-create",joint:input("f","stand-support","stand-plate")});
 await run({type:"rotate-object",objectId:"stand-base",rotation:[15,20,45]});near(assemblyMatrix(d.objects["stand-plate"].transform!).elements,assemblyMatrix(d.objects["stand-support"].transform!).multiply(assemblyMatrix(d.assembly!.joints.f.rest)).elements);
});
test("cycles, duplicate children, missing parts, scale, grounding and limits reject atomically",async()=>{
 const d=await stand(),run=createDocumentCommandExecutor(d);
 for(const command of [{type:"assembly-joint-create",joint:input("bad","stand-lip","stand-turntable")},{type:"assembly-joint-create",joint:input("bad","missing","stand-base")},{type:"assembly-ground",objectId:"stand-plate",grounded:true},{type:"move-object",objectId:"stand-base",translation:[1,2,3]},{type:"move-object",objectId:"stand-lip",translation:[1,2,3]}] as any[]){const candidate=structuredClone(d);await assert.rejects(()=>createDocumentCommandExecutor(candidate)(command));}
 const cyclic=await load();const r=createDocumentCommandExecutor(cyclic);await r({type:"assembly-joint-create",joint:input("a","stand-base","stand-turntable")});await assert.rejects(()=>r({type:"assembly-joint-create",joint:input("b","stand-turntable","stand-base")}),/cycle/);
 d.assembly!.joints.bearing.min=0;d.assembly!.joints.bearing.max=180;await assert.rejects(()=>run({type:"assembly-joint-update",jointId:"bearing",angle:181}),/Invalid/);
 const scaled=await load();scaled.objects["stand-base"].transform!.scale=[2,1,1];await assert.rejects(()=>createDocumentCommandExecutor(scaled)({type:"assembly-joint-create",joint:input("bad","stand-base","stand-plate")}),/unit scale/);
});
test("review/cancel, stale apply, Undo/Redo, serialization and MCP share validated commands",async()=>{
 const original=structuredClone(cadDocument);
 try{restoreTestDocument(await stand());cadHistory.clear();const before=serializeDocument(cadDocument),p=await previewCadCommand({type:"assembly-joint-update",jointId:"bearing",angle:90});assert.equal(p.result.ok,true,p.result.reason);assert.equal(serializeDocument(cadDocument),before);assert.equal(getCadPlanFrameDocument(p.planId)!.assembly!.joints.bearing.angle,90);discardCadPlan(p.planId);assert.equal(serializeDocument(cadDocument),before);
 const c={document:cadDocument,selectionIds:["stand-turntable"],layerId:"layer-default",workPlane:"XY" as const},plan=await planCadModelingTools([{id:"turn",name:"assembly.joint.update",arguments:{jointId:"bearing",angle:90}}],c);
 const review=await previewCadCommand(plan.command);assert.equal((await applyCadPlan(review.planId)).ok,true);const after=serializeDocument(cadDocument);await undoDocument();assert.deepEqual(cadDocument.assembly,JSON.parse(before).document.assembly);await redoDocument();assert.equal(cadDocument.assembly!.joints.bearing.angle,90);
 const a=createCadToolSession({...c,document:cadDocument});assert.equal((await a.read({id:"read",name:"assembly.joint.validate",arguments:{}})).ok,true);
 const stale=await previewCadCommand({type:"assembly-joint-update",jointId:"bearing",angle:0});await dispatchCadCommand({type:"assembly-joint-update",jointId:"bearing",angle:180});assert.equal((await applyCadPlan(stale.planId)).ok,false);
 const snap=serializeDocument(cadDocument);const bad=await dispatchCadCommand({type:"assembly-joint-create",joint:input("missing","nope","stand-plate")});assert.equal(bad.ok,false);assert.equal(serializeDocument(cadDocument),snap);
 }finally{restoreTestDocument(original);cadHistory.clear();}
});

test("Mesh parts use existing transforms; stored incompatible poses and missing refs reject",async()=>{
 const d=await load(),mesh=Object.values(d.features).find(f=>f.type==="mesh")!.output;d.objects[mesh].visible=true;const geometry=JSON.stringify(d.features),run=createDocumentCommandExecutor(d);
 await run({type:"assembly-joint-create",joint:input("mesh-bind","stand-base",mesh)});
 await run({type:"rotate-object",objectId:"stand-base",rotation:[0,0,90]});assertAssemblyPose(d);assert.equal(JSON.stringify(d.features),geometry);
 const corrupt=structuredClone(d);corrupt.objects[mesh].transform!.translation[0]+=1;assert.throws(()=>assertAssemblyPose(corrupt),/pose/);
 delete corrupt.objects[mesh];assert.throws(()=>validateAssembly(corrupt),/reference/);
 const old=JSON.parse(serializeDocument(d));old.version=61;assert.throws(()=>deserializeDocument(JSON.stringify(old)),/62/);
});
test("public transaction rejects limit errors, cycles and dependent edits without publication",async()=>{
 const original=structuredClone(cadDocument);try{const d=await stand();d.assembly!.joints.bearing.min=0;d.assembly!.joints.bearing.max=180;restoreTestDocument(d);
 for(const cmd of [{type:"assembly-joint-update",jointId:"bearing",angle:181},{type:"assembly-joint-create",joint:input("cycle","stand-lip","stand-base")},{type:"move-object",objectId:"stand-support",translation:[999,0,0]}] as any[]){const before=serializeDocument(cadDocument),r=await dispatchCadCommand(cmd);assert.equal(r.ok,false);assert.equal(serializeDocument(cadDocument),before);}
 }finally{restoreTestDocument(original);cadHistory.clear();}
});
