import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {Vector3} from "three";
import {deserializeDocument,serializeDocument,type CadDocument} from "@agent-webcad/cad-document";
import type {CadCommand} from "@agent-webcad/cad-commands";
import {cadDocument} from "../src/state/cadDocument";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {createDocumentCommandExecutor} from "../src/state/commandBus";
import {assemblyMatrix,assertAssemblyPose} from "../src/state/assemblyCommands";
import {restoreTestDocument} from "./helpers/documentHarness";
import {undoDocument,redoDocument,cadHistory} from "../src/state/history";
import {previewCadCommand,applyCadPlan,discardCadPlan,getCadPlanFrameDocument} from "../src/state/documentPlans";
import {planCadModelingTools} from "../src/copilot/cadModelingTools";
import {createAssemblyJointGizmo,disposeAssemblyJointGizmo} from "../src/viewport/assemblyJointGizmo";
const source=new URL("../../../output/verification/assembly-phase-a/laptop-stand-assembly.webcad.json",import.meta.url);
async function load(){return deserializeDocument(await readFile(source,"utf8"));}
const pose=(d:CadDocument,id:string)=>assemblyMatrix(d.objects[id].transform!).elements;
function near(a:number[],b:number[]){assert.ok(a.every((x,i)=>Math.abs(x-b[i])<1e-7),JSON.stringify({a,b}));}
function poses(d:CadDocument){return Object.fromEntries(Object.keys(d.objects).map(id=>[id,pose(d,id)]));}
function same(d:CadDocument,p:ReturnType<typeof poses>){for(const id of Object.keys(p))near(pose(d,id),p[id]);}
async function at90(){const d=await load();await createDocumentCommandExecutor(d)({type:"assembly-joint-update",jointId:"bearing",angle:90});return d;}
test("delete bearing detaches subtree as free root, keeps all world poses/rest/geometry; downstream rotation still works",async()=>{
 const d=await at90(),p=poses(d),rest=structuredClone(d.assembly!.joints.support.rest),features=JSON.stringify(d.features),run=createDocumentCommandExecutor(d);
 await run({type:"assembly-joint-delete",jointId:"bearing"});same(d,p);assert.equal(d.assembly!.joints.bearing,undefined);assert.ok(!d.assembly!.grounded.includes("stand-turntable"));assert.deepEqual(d.assembly!.joints.support.rest,rest);
 await run({type:"rotate-object",objectId:"stand-turntable",rotation:[0,0,0]});assertAssemblyPose(d);assert.notDeepEqual(pose(d,"stand-lip"),p["stand-lip"]);assert.equal(JSON.stringify(d.features),features);
});
test("reparent preserve-world at nonzero angle recaptures inverse motion; preserve-local deliberately moves subtree",async()=>{
 for(const preserveWorld of [true,false]){const d=await at90(),p=poses(d),rest=structuredClone(d.assembly!.joints.bearing.rest),run=createDocumentCommandExecutor(d);
 await run({type:"assembly-joint-reparent",jointId:"bearing",parentId:"stand-shaft",preserveWorld});assertAssemblyPose(d);
 if(preserveWorld)same(d,p);else{assert.deepEqual(d.assembly!.joints.bearing.rest,rest);assert.ok(Math.abs(d.objects["stand-turntable"].transform!.translation[2]-p["stand-turntable"][14]-8)<1e-7);}
 await run({type:"assembly-joint-update",jointId:"bearing",angle:180});assertAssemblyPose(d);
 }
});
test("edit origin/axis/limits preserves world or uses existing Rest; null clears limits",async()=>{
 for(const preserveWorld of [true,false]){const d=await at90(),p=poses(d),run=createDocumentCommandExecutor(d),rest=structuredClone(d.assembly!.joints.bearing.rest);
 await run({type:"assembly-joint-edit",jointId:"bearing",edit:{origin:[10,20,30],axis:[1,0,0],min:0,max:180},preserveWorld});assertAssemblyPose(d);
 if(preserveWorld)same(d,p);else{assert.deepEqual(d.assembly!.joints.bearing.rest,rest);assert.notDeepEqual(pose(d,"stand-lip"),p["stand-lip"]);}
 await run({type:"assembly-joint-edit",jointId:"bearing",edit:{min:null,max:null},preserveWorld:true});assert.equal(d.assembly!.joints.bearing.max,undefined);
 }
});
test("invalid axes/limits/cycles/grounded child/locks and missing joint are atomic through public transactions",async()=>{
 const original=structuredClone(cadDocument);try{restoreTestDocument(await at90());
 for(const c of [
 {type:"assembly-joint-reparent",jointId:"bearing",parentId:"stand-lip",preserveWorld:true},
 {type:"assembly-joint-reparent",jointId:"bearing",parentId:"stand-turntable",preserveWorld:true},
 {type:"assembly-joint-edit",jointId:"bearing",edit:{axis:[0,0,0]},preserveWorld:true},
 {type:"assembly-joint-edit",jointId:"bearing",edit:{min:100},preserveWorld:true},
 {type:"assembly-joint-edit",jointId:"bearing",edit:{min:180,max:0},preserveWorld:true},
 {type:"assembly-ground",objectId:"stand-turntable",grounded:true},
 {type:"assembly-joint-delete",jointId:"missing"},
 {type:"assembly-joint-create",joint:{id:"duplicate",type:"fixed",parentId:"stand-base",childId:"stand-plate",origin:[0,0,0],axis:[0,0,1],angle:0}}
 ] as CadCommand[]){const before=serializeDocument(cadDocument);try{const r=await dispatchCadCommand(c);assert.equal(r.ok,false);}catch(e){assert.match(String(e),/Invalid CAD command/);}assert.equal(serializeDocument(cadDocument),before);}
 cadDocument.layers["layer-default"].locked=true;const before=serializeDocument(cadDocument);assert.equal((await dispatchCadCommand({type:"assembly-joint-delete",jointId:"bearing"})).ok,false);assert.equal(serializeDocument(cadDocument),before);
 }finally{restoreTestDocument(original);cadHistory.clear();}
});
test("lifecycle Preview/Cancel/Apply, history, reload and UI/MCP use identical canonical commands",async()=>{
 const original=structuredClone(cadDocument);try{
 for(const c of [
 {type:"assembly-joint-edit",jointId:"bearing",edit:{origin:[7,8,9],axis:[0,1,0],min:0,max:180},preserveWorld:true},
 {type:"assembly-joint-reparent",jointId:"bearing",parentId:"stand-shaft",preserveWorld:true},
 {type:"assembly-joint-delete",jointId:"bearing"}
 ] as CadCommand[]){restoreTestDocument(await at90());cadHistory.clear();const before=serializeDocument(cadDocument),review=await previewCadCommand(c);assert.equal(review.result.ok,true,review.result.reason);assert.equal(serializeDocument(cadDocument),before);discardCadPlan(review.planId);assert.equal(serializeDocument(cadDocument),before);
 const name=c.type==="assembly-joint-delete"?"assembly.joint.delete":c.type==="assembly-joint-reparent"?"assembly.joint.reparent":"assembly.joint.edit";
 const args=c.type==="assembly-joint-delete"?{jointId:c.jointId}:c.type==="assembly-joint-reparent"?{jointId:c.jointId,parentId:c.parentId,preserveWorld:c.preserveWorld}:{jointId:(c as any).jointId,editJson:JSON.stringify((c as any).edit),preserveWorld:true};
 const plan=await planCadModelingTools([{id:"lifecycle",name,arguments:args}],{document:cadDocument,selectionIds:["stand-turntable","stand-shaft"],layerId:"layer-default",workPlane:"XY"});assert.deepEqual(plan.command,c);
 const ui=await previewCadCommand(c),mcp=await previewCadCommand(plan.command);assert.deepEqual(getCadPlanFrameDocument(ui.planId),getCadPlanFrameDocument(mcp.planId));discardCadPlan(mcp.planId);assert.equal((await applyCadPlan(ui.planId)).ok,true);
 const after=serializeDocument(cadDocument),revision=cadDocument.revision;await undoDocument();const undone=JSON.parse(serializeDocument(cadDocument)).document,expectedBefore=JSON.parse(before).document;assert.ok(undone.revision>revision);assert.deepEqual({...undone,revision:0},{...expectedBefore,revision:0});const undoRevision=cadDocument.revision;await redoDocument();const redone=JSON.parse(serializeDocument(cadDocument)).document,expectedAfter=JSON.parse(after).document;assert.ok(redone.revision>undoRevision);assert.deepEqual({...redone,revision:0},{...expectedAfter,revision:0});
 const loaded=deserializeDocument(after);assertAssemblyPose(loaded);assert.deepEqual(loaded.assembly,cadDocument.assembly);
 }
 }finally{restoreTestDocument(original);cadHistory.clear();}
});
test("selected gizmo uses world parent frame, positive revolution direction, relation IDs and no document mutation",async()=>{
 const d=await at90(),before=serializeDocument(d),j=d.assembly!.joints.support,g=createAssemblyJointGizmo(d,j);
 near(g.userData.origin,new Vector3(...j.origin).applyMatrix4(assemblyMatrix(d.objects[j.parentId].transform!)).toArray());assert.equal(g.userData.jointId,"support");assert.equal(g.userData.childId,"stand-support");assert.equal(serializeDocument(d),before);disposeAssemblyJointGizmo(g);
 const rev=createAssemblyJointGizmo(d,d.assembly!.joints.bearing);assert.ok(rev.children.length>g.children.length);disposeAssemblyJointGizmo(rev);
});
