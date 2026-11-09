import test from "node:test";
import assert from "node:assert/strict";
import {serializeDocument,type CadDocument} from "@agent-webcad/cad-document";
import {createDocumentCommandExecutor} from "../src/state/commandBus";
import {clampDriveAngle,driveRange,drivePose,followerParts,interferenceAtAngle,interferenceSamples,stepDrive} from "../src/state/assemblyDrive";
import type {MotionReport,MotionRow} from "../src/state/assemblyMotion";
function shape(d:CadDocument,id:string,position:[number,number,number]){d.objects[id]={id,name:id,geometryId:"g-"+id,visible:true,layerId:"layer-default",transform:{translation:position,rotation:[0,0,0],scale:[1,1,1]}};d.features["f-"+id]={id:"f-"+id,type:"primitive",inputs:[],output:id,params:{kind:"box",width:2,depth:1,height:1}};d.rootObjects.push(id);d.layers["layer-default"].objectIds.push(id);}
async function chain(){
 const d:CadDocument={id:"drive-test",revision:0,objects:{},features:{},layers:{"layer-default":{id:"layer-default",name:"Default",visible:true,locked:false,objectIds:[]}},rootObjects:[],rootLayers:["layer-default"]};
 shape(d,"base",[0,0,0]);shape(d,"arm",[2,0,0]);shape(d,"hand",[4,0,0]);const run=createDocumentCommandExecutor(d);
 await run({type:"assembly-ground",objectId:"base",grounded:true});
 await run({type:"assembly-joint-create",joint:{id:"shoulder",type:"revolute",parentId:"base",childId:"arm",origin:[0,0,0],axis:[0,0,1],angle:0,min:0,max:90}});
 await run({type:"assembly-joint-create",joint:{id:"elbow",type:"revolute",parentId:"arm",childId:"hand",origin:[3,0,0],axis:[0,0,1],angle:0}});
 return d;
}
const opts={min:0,max:100,speed:50,repeat:false};
test("stepDrive plays to the far end and stops without repeat",()=>{
 let s={angle:0,dir:1 as 1|-1};s={...stepDrive(s,1000,opts)};assert.equal(s.angle,50);
 const end=stepDrive(s,5000,opts);assert.equal(end.angle,100);assert.equal(end.finished,true);
});
test("stepDrive bounces with repeat and stays inside the range",()=>{
 const o={...opts,repeat:true};const a=stepDrive({angle:90,dir:1},400,o);assert.equal(a.angle,90);assert.equal(a.dir,-1);assert.equal(a.finished,false);
 let s={angle:0,dir:1 as 1|-1};for(let i=0;i<500;i++){const n=stepDrive(s,70,o);assert.ok(n.angle>=0&&n.angle<=100);s={angle:n.angle,dir:n.dir};}
 assert.equal(stepDrive({angle:0,dir:1},10,{...o,speed:0}).finished,true);assert.equal(stepDrive({angle:0,dir:1},10,{...o,max:0}).finished,true);
});
test("driveRange uses Joint limits, otherwise the explicit fallback; angles clamp into it",()=>{
 assert.deepEqual(driveRange({min:10,max:80}),{min:10,max:80,limited:true});
 assert.deepEqual(driveRange({},[0,720]),{min:0,max:720,limited:false});
 assert.equal(clampDriveAngle(200,{min:0,max:90}),90);assert.equal(clampDriveAngle(Number.NaN,{min:5,max:90}),5);
});
test("drivePose moves the driver child and downstream Joint chain without touching the document",async()=>{
 const d=await chain(),before=serializeDocument(d),p=drivePose(d,"shoulder",90);
 assert.equal(serializeDocument(d),before);assert.equal(d.assembly!.joints.shoulder.angle,0);assert.equal(p.joint.angle,90);
 assert.ok(Math.abs(p.poses.arm.translation[0])<1e-9&&Math.abs(p.poses.arm.translation[1]-2)<1e-9);
 assert.ok(Math.abs(p.poses.hand.translation[1]-4)<1e-9,"downstream part follows");
 assert.ok(Math.abs(p.poses.base.translation[0])<1e-9);
 assert.deepEqual(followerParts(d,"shoulder").sort(),["arm","hand"]);assert.deepEqual(followerParts(d,"elbow"),["hand"]);
 assert.throws(()=>drivePose(d,"shoulder",120),/limits/);
});
const row=(angle:number,status:MotionRow["status"],pair:[string,string]=["arm","wall"]):MotionRow=>({angle,pair,baseStatus:status==="intentional-exception"?"penetration":status,status,method:"brep",exception:status==="intentional-exception"});
const report=(rows:MotionRow[]):MotionReport=>({request:{jointId:"shoulder",start:0,end:90,step:30,partIds:["arm","wall"],exceptions:[],tolerance:1e-6},rows} as unknown as MotionReport);
test("interference highlights only measured penetrating samples near the pose",()=>{
 const r=report([row(0,"no-penetration"),row(30,"penetration"),row(60,"intentional-exception"),row(90,"penetration",["hand","wall"])]);
 assert.deepEqual(interferenceSamples(r,"shoulder").map(s=>s.sampleAngle),[30,90]);
 assert.equal(interferenceAtAngle(r,"shoulder",30)!.sampleAngle,30);assert.equal(interferenceAtAngle(r,"shoulder",40)!.sampleAngle,30);
 assert.equal(interferenceAtAngle(r,"shoulder",60),null,"intentional exceptions are not flagged");assert.equal(interferenceAtAngle(r,"shoulder",0),null);
 assert.deepEqual(interferenceAtAngle(r,"shoulder",85)!.pairs,[["hand","wall"]]);
 assert.equal(interferenceAtAngle(r,"elbow",30),null);assert.equal(interferenceAtAngle(null,"shoulder",30),null);
});
