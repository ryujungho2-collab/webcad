import test from "node:test";
import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {deserializeDocument,serializeDocument,interferencePairKey,type CadDocument} from "@agent-webcad/cad-document";
import {inspectAssemblyMotion,drivenAssemblyParts,motionSourceSignature,type MotionReport,type MotionRow} from "../src/state/assemblyMotion";
import {triageMotionReport,triageCategory,explainInterference,TRIAGE_ORDER} from "../src/state/interferenceTriage";
import {cadDocument} from "../src/state/cadDocument";
import {restoreTestDocument} from "./helpers/documentHarness";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {cadHistory,undoDocument,redoDocument} from "../src/state/history";
import {previewCadCommand,applyCadPlan,discardCadPlan,getCadPlanFrameDocument} from "../src/state/documentPlans";
import {projectKernelMetrics} from "../src/cad/kernelGeometryService";
import {createCadToolSession} from "../src/copilot/cadToolSession";
const pair:[string,string]=["stand-support","stand-plate"];
let fixture:Promise<{d:CadDocument;r:MotionReport}>;
function load(){return fixture??=(async()=>{const d=deserializeDocument(await readFile(new URL("../../../output/verification/assembly-phase-a/laptop-stand-assembly.webcad.json",import.meta.url),"utf8"));const r=await inspectAssemblyMotion(d,{jointId:"bearing",start:0,end:180,step:90,partIds:["stand-base","stand-shaft","stand-turntable","stand-support","stand-plate","stand-lip"],exceptions:[],tolerance:1e-6});assert.equal(r.state,"finished",r.reason);return {d,r};})();}
test("laptop Fixed overlap is structurally invariant, scalar equality never proves invariant",async()=>{
 const {d,r}=await load(),raw=JSON.stringify(r),rows=triageMotionReport(r,d),support=rows.filter(t=>t.row.pair.includes("stand-support")&&t.row.pair.includes("stand-plate"));
 assert.equal(support.length,3);assert.ok(support.every(t=>t.category==="invariant-penetration"&&Math.abs(t.row.commonVolume!-964.6170736148)<1e-5));
 const moving=drivenAssemblyParts(d,"bearing");assert.ok(moving.has("stand-plate")&&!moving.has("stand-base"));
 const same:MotionRow={...support[0].row,relativeMotion:"motion-dependent"};assert.equal(triageCategory(same),"motion-dependent-penetration");
 const legacy={...same,relativeMotion:undefined};assert.equal(triageCategory(legacy),"unverified");
 assert.equal(JSON.stringify(r),raw);assert.match(support[0].explanation,/964.617 mm³/);assert.match(support[0].explanation,/구조적으로 불변/);
});
test("real angle-dependent obstacle with equal sampled volumes remains motion-dependent",async()=>{
 const {d}=await load(),copy=structuredClone(d);copy.objects.obstacle={id:"obstacle",geometryId:"g-obstacle",name:"Obstacle",layerId:"layer-default",visible:true,transform:{translation:[-400,-400,-50],rotation:[0,0,0],scale:[1,1,1]}};copy.features["f-obstacle"]={id:"f-obstacle",type:"primitive",inputs:[],output:"obstacle",params:{kind:"box",width:800,depth:800,height:400}};copy.rootObjects.push("obstacle");copy.layers["layer-default"].objectIds.push("obstacle");
 const r=await inspectAssemblyMotion(copy,{jointId:"bearing",start:0,end:360,step:360,partIds:["stand-plate","obstacle"],exceptions:[],tolerance:1e-6});
 assert.ok(r.rows.every(x=>x.baseStatus==="penetration"&&x.relativeMotion==="motion-dependent"));assert.ok(Math.abs(r.rows[0].commonVolume!-r.rows[1].commonVolume!)<1e-7);assert.ok(triageMotionReport(r,copy).every(t=>t.category==="motion-dependent-penetration"));
});
test("triage prioritizes raw penetration independently of intents/exceptions and preserves unknown",async()=>{
 const {d,r}=await load(),row=r.rows[0],sample:MotionReport={...r,rows:[
 {...row,baseStatus:"unknown",status:"intentional-exception",exception:true,relativeMotion:"invariant"},
 {...row,baseStatus:"no-penetration"},{...row,baseStatus:"contact"},
 {...row,baseStatus:"penetration",relativeMotion:"invariant"},
 {...row,baseStatus:"penetration",relativeMotion:"motion-dependent"}]};
 assert.deepEqual(triageMotionReport(sample,d).map(t=>t.category),TRIAGE_ORDER);
 assert.match(explainInterference(sample.rows[0],["a","b"]),/충돌 없음으로 해석하지/);
});
test("intent Preview/Apply/Undo/remove and v63 load change metadata only, without kernel calls",async()=>{
 const {d,r}=await load(),original=structuredClone(cadDocument);try{restoreTestDocument(d);cadHistory.clear();const signature=motionSourceSignature(cadDocument),before=serializeDocument(cadDocument),measurements=JSON.stringify(r.rows),tasks=projectKernelMetrics().submittedTasks;
 const c={type:"assembly-pair-intent" as const,pair:[...pair].reverse() as [string,string],intent:"intentional-overlap" as const,note:"Designed mounting insertion"};
 const preview=await previewCadCommand(c);assert.equal(preview.result.ok,true,preview.result.reason);assert.equal(serializeDocument(cadDocument),before);assert.equal(getCadPlanFrameDocument(preview.planId)!.interferenceIntents![interferencePairKey(pair)].intent,"intentional-overlap");discardCadPlan(preview.planId);
 const second=await previewCadCommand(c);assert.equal((await applyCadPlan(second.planId)).ok,true);assert.equal(motionSourceSignature(cadDocument),signature);
 const triage=triageMotionReport(r,cadDocument).find(t=>t.category==="invariant-penetration")!;assert.equal(triage.annotation?.intent,"intentional-overlap");assert.match(triage.explanation,/원래 기하 판정과 Common 체적은 유지/);assert.equal(JSON.stringify(r.rows),measurements);
 const file=serializeDocument(cadDocument);assert.equal(JSON.parse(file).version,63);assert.deepEqual(deserializeDocument(file).interferenceIntents,cadDocument.interferenceIntents);
 const old=JSON.parse(file);old.version=62;assert.throws(()=>deserializeDocument(JSON.stringify(old)),/63/);
 await undoDocument();assert.equal(cadDocument.interferenceIntents,undefined);await redoDocument();assert.equal(cadDocument.interferenceIntents![interferencePairKey(pair)].note,c.note);
 assert.equal((await dispatchCadCommand({type:"assembly-pair-intent",pair,intent:null,note:""})).ok,true);assert.equal(cadDocument.interferenceIntents,undefined);assert.equal(JSON.parse(serializeDocument(cadDocument)).version,62);assert.equal(motionSourceSignature(cadDocument),signature);assert.equal(projectKernelMetrics().submittedTasks,tasks);
 await writeFile(new URL("../../../output/verification/assembly-b25/annotated-laptop.webcad.json",import.meta.url),file);
 }finally{restoreTestDocument(original);cadHistory.clear();}
});
test("all intent types stay separate from measured geometry; invalid annotations reject atomically",async()=>{
 const {d,r}=await load(),original=structuredClone(cadDocument);try{restoreTestDocument(d);for(const intent of ["intended-contact","intentional-overlap","forbidden-interference","undecided"] as const){assert.equal((await dispatchCadCommand({type:"assembly-pair-intent",pair,intent,note:intent})).ok,true);const t=triageMotionReport(r,cadDocument).find(x=>x.category==="invariant-penetration")!;assert.equal(t.row.baseStatus,"penetration");assert.equal(t.annotation?.intent,intent);}
 const before=serializeDocument(cadDocument);assert.equal((await dispatchCadCommand({type:"assembly-pair-intent",pair:["missing",pair[0]],intent:"undecided",note:""})).ok,false);assert.equal(serializeDocument(cadDocument),before);await assert.rejects(()=>dispatchCadCommand({type:"assembly-pair-intent",pair,intent:"undecided",note:"x".repeat(1001)}),/Invalid CAD command/);assert.equal(serializeDocument(cadDocument),before);
 const session=createCadToolSession({document:cadDocument,selectionIds:[],layerId:"layer-default",workPlane:"XY"}),read=await session.read({id:"inspect",name:"assembly.inspect",arguments:{intentOffset:0,intentLimit:1}});assert.equal(read.ok,true,read.error);assert.equal((read.result as any).designIntents.entries[0].intent,"undecided");
 }finally{restoreTestDocument(original);cadHistory.clear();}
});
