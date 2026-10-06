import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { CAD_PRECISION, type Sketch, type SketchConstraint, type SketchGeometry, type SketchPoint } from "@agent-webcad/cad-document";
import { controlSketchGrip } from "../src/precision/sketchGripMotion";
import { sketchPoint } from "../src/precision/sketchSolver";
import { cadDocument } from "../src/state/cadDocument";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { adjustDirectRequest, planDirectEdit, type DirectEditRequest } from "../src/state/directEditIntent";
import { applyCadPlan, getCadPlanSketchPreview, previewCadCommand } from "../src/state/documentPlans";
import { cadHistory, redoDocument, undoDocument } from "../src/state/history";
import { WORK_PLANES, planeToWorld } from "../src/precision/workPlane";
import { documentState, resetTestDocument } from "./helpers/documentHarness";
import { createVariablePlate } from "./helpers/variablePlate";

beforeEach(resetTestDocument);
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<=2*CAD_PRECISION.linearTolerance,`${a} ≈ ${b}`);
const point=(a:SketchPoint,b:SketchPoint)=>{near(a[0],b[0]);near(a[1],b[1]);};
const ref=(geometryId:string,pointId:string)=>({geometryId,pointId});
const line=(id="line",start:SketchPoint=[0,0],end:SketchPoint=[100,0]):SketchGeometry=>({id,kind:"line",startId:`${id}:a`,endId:`${id}:b`,segmentId:`${id}:edge`,start,end});
const base=(geometry:SketchGeometry[],constraints:SketchConstraint[]=[]):Sketch=>({id:"motion",layerId:"layer-default",workPlane:"XY",geometry,constraints,dimensions:[],solveState:{status:"under-constrained",degreesOfFreedom:0,rank:0,residual:0,tolerance:CAD_PRECISION.linearTolerance}});
const h:SketchConstraint={id:"horizontal",kind:"horizontal",first:ref("line","line:a"),second:ref("line","line:b")};
const length:SketchConstraint={id:"length",kind:"distance",first:ref("line","line:a"),second:ref("line","line:b"),value:100};
const target={kind:"control" as const,id:"line:b"};

test("horizontal grip projects a diagonal request; the opposite endpoint and every document field stay untouched",()=>{
  const g=line(),s=base([g],[h]),before=structuredClone(s),m=controlSketchGrip(s,g,target,[120,35],false);
  assert.equal(m.dof,1);assert.equal(m.kind,"line");assert.equal(m.projected,true);point(m.point,[120,0]);point(sketchPoint(m.geometry!,"line:a")!,[0,0]);assert.deepEqual(s,before);
  const off=controlSketchGrip(s,g,target,[100,35],false);assert.equal(off.unchanged,true);point(off.point,[100,0]);
});
test("vertical and fixed-angle grips use the actual permitted direction",()=>{
  const g=line("line",[0,0],[0,100]),s=base([g],[{...h,kind:"vertical"}]),m=controlSketchGrip(s,g,target,[30,120],false);point(m.point,[0,120]);assert.equal(m.dof,1);
  const angle=Math.PI/6,slanted=line("line",[0,0],[100*Math.cos(angle),100*Math.sin(angle)]),reference=line("reference",[0,200],[100,200]);
  const angled=base([slanted,reference],[{id:"angle",kind:"angle",firstLineId:"reference",secondLineId:"line",value:angle},
    {id:"ra",kind:"fixed-point",point:ref("reference","reference:a"),value:[0,200]},{id:"rb",kind:"fixed-point",point:ref("reference","reference:b"),value:[100,200]}]);
  const result=controlSketchGrip(angled,slanted,target,[120,90],false),along=120*Math.cos(angle)+90*Math.sin(angle);assert.equal(result.dof,1);point(result.point,[along*Math.cos(angle),along*Math.sin(angle)]);
});
test("a fixed-length grip follows the circle over a large drag and handles a request at its center",()=>{
  const g=line(),s=base([g],[length]),m=controlSketchGrip(s,g,target,[120,60],false);assert.equal(m.kind,"orbit");assert.equal(m.dof,1);point(m.orbit!.center,[0,0]);near(m.orbit!.radius,100);
  point(m.point,[120/Math.hypot(120,60)*100,60/Math.hypot(120,60)*100]);near(Math.hypot(...m.point),100);
  const center=controlSketchGrip(s,g,target,[0,0],false);point(center.point,[100,0]);assert.equal(center.unchanged,true);
});
test("locked grip is still locked with an unrelated free object and retains the raw conflict for real command review",async()=>{
  await dispatchCadCommand({type:"create-sketch",id:"motion",workPlane:"XY"});await dispatchCadCommand({type:"add-sketch-geometry",sketchId:"motion",geometry:line()});
  for(const constraint of [h,length])assert.ok((await dispatchCadCommand({type:"add-sketch-constraint",sketchId:"motion",constraint})).ok);
  await dispatchCadCommand({type:"add-sketch-geometry",sketchId:"motion",geometry:line("free",[0,200],[100,200])});
  const before=documentState(),past=cadHistory.getPastLabels().length,request:DirectEditRequest={objectId:"line",target:{...target,point:[120,30,0]},startWorld:[100,0,0],targetWorld:[120,30,0]};
  const intent=planDirectEdit(cadDocument,request,"geometry");assert.equal(intent.motion!.dof,0);assert.equal(intent.motion!.kind,"locked");point(intent.motion!.point,[100,0]);
  const review=await previewCadCommand(intent.command);assert.equal(review.result.ok,false);assert.equal(review.result.diagnostic?.kind,"sketch-conflict");assert.ok(review.result.diagnostic!.constraintIds.length);assert.deepEqual(documentState(),before);assert.equal(cadHistory.getPastLabels().length,past);
});
test("rigid segment cannot resize around its anchored endpoint; a free horizontal segment can translate in both directions",()=>{
  const g=line(),locked=base([g],[h,{id:"anchor",kind:"fixed-point",point:ref("line","line:a"),value:[0,0]}]);
  const m=controlSketchGrip(locked,g,{kind:"segment",id:"line:edge"},[20,30],false);assert.equal(m.dof,0);
  const free=controlSketchGrip(base([g],[h]),g,{kind:"segment",id:"line:edge"},[20,30],false);assert.equal(free.dof,2);point(sketchPoint(free.geometry!,"line:a")!,[20,30]);point(sketchPoint(free.geometry!,"line:b")!,[120,30]);
});
test("polyline grips preserve untouched vertices and rigid segment direction",()=>{
  const g:SketchGeometry={id:"poly",kind:"polyline",vertices:[{id:"a",point:[0,0]},{id:"b",point:[100,0]},{id:"c",point:[100,50]}],segmentIds:["ab","bc"],closed:false};
  const s=base([g],[{id:"ab-h",kind:"horizontal",first:ref("poly","a"),second:ref("poly","b")}]);
  const m=controlSketchGrip(s,g,{kind:"control",id:"b"},[120,20],false);assert.equal(m.dof,1);point(m.point,[120,0]);point(sketchPoint(m.geometry!,"c")!,[100,50]);
  const edge=controlSketchGrip(s,g,{kind:"segment",id:"bc"},[20,30],false);assert.equal(edge.dof,1);point(edge.point,[120,25]);point(sketchPoint(edge.geometry!,"a")!,[0,0]);
});
test("arc endpoint follows its retained radius while center drag keeps the complete arc shape",()=>{
  const g:SketchGeometry={id:"arc",kind:"arc",center:[0,0],radius:10,startAngle:0,endAngle:Math.PI/2,centerId:"center",startId:"a",endId:"b",curveId:"curve"};
  const s=base([g],[{id:"radius",kind:"radius",geometryId:"arc",value:10}]),m=controlSketchGrip(s,g,{kind:"control",id:"b"},[12,20],false);assert.equal(m.kind,"orbit");point(m.point,[120/Math.hypot(12,20),200/Math.hypot(12,20)]);point(sketchPoint(m.geometry!,"a")!,[10,0]);
  const center=controlSketchGrip(s,g,{kind:"control",id:"center"},[20,30],false);assert.equal(center.dof,2);if(center.geometry?.kind!=="arc")throw new Error("Arc missing");near(center.geometry.radius,10);near(center.geometry.startAngle,0);near(center.geometry.endAngle,Math.PI/2);
});
test("a radial handle uses its displayed radial axis and rejects crossing the center",()=>{
  const g:SketchGeometry={id:"circle",kind:"circle",center:[20,30],radius:10,centerId:"center",curveId:"curve"},s=base([g],[{id:"diameter",kind:"diameter",geometryId:"circle",value:20}]);
  const m=controlSketchGrip(s,g,{kind:"control",id:"circle:radius:0"},[35,45],true);assert.equal(m.dof,1);point(m.point,[35,30]);assert.deepEqual(m.driverIds,["diameter"]);
  assert.equal(controlSketchGrip(s,g,{kind:"control",id:"circle:radius:0"},[35,45],false).dof,0);
  assert.throws(()=>controlSketchGrip(s,g,{kind:"control",id:"circle:radius:0"},[10,45],true),/positive radial/);
});
test("driver guidance is grip-specific; retained duplicate dimensions lock the same grip",async()=>{
  await createVariablePlate();const s=cadDocument.sketches!["plate-sketch"],g=s.geometry.find(g=>g.id==="outline")!;
  const edge=controlSketchGrip(s,g,{kind:"segment",id:"bc"},[20,30],true);assert.equal(edge.dof,1);point(edge.point,[120,30]);assert.deepEqual(edge.driverIds,["width"]);
  assert.equal(controlSketchGrip(s,g,{kind:"segment",id:"bc"},[20,30],false).dof,0);
  const corner=controlSketchGrip(s,g,{kind:"control",id:"b"},[120,30],true);assert.equal(corner.dof,1);point(corner.point,[120,0]);assert.deepEqual(corner.driverIds,["width"]);
  const duplicate=structuredClone(s);duplicate.constraints.push({...s.constraints.find(c=>c.id==="width")!,id:"width-lock"});assert.equal(controlSketchGrip(duplicate,g,{kind:"segment",id:"bc"},[20,30],true).dof,0);
});
for(const workPlane of ["XY","XZ","YZ"] as const)test(`${workPlane}: rotated partially constrained corner projects in model coordinates and actual Apply is one Undo step`,async()=>{
  const angle=Math.PI/5,c=Math.cos(angle),s=Math.sin(angle),origin:SketchPoint=[20,30];
  await dispatchCadCommand({type:"create-sketch",id:"motion",workPlane});
  await dispatchCadCommand({type:"add-sketch-geometry",sketchId:"motion",geometry:{id:"rect",kind:"rectangle",origin,width:100,height:60,angle,cornerIds:["a","b","c","d"],edgeIds:["ab","bc","cd","da"]}});
  await dispatchCadCommand({type:"add-sketch-constraint",sketchId:"motion",constraint:{id:"height",kind:"distance",first:ref("rect","b"),second:ref("rect","c"),value:60}});
  const plane=WORK_PLANES[workPlane],start:SketchPoint=[20+100*c-60*s,30+100*s+60*c],raw:SketchPoint=[20+120*c-90*s,30+120*s+90*c],expected:SketchPoint=[20+120*c-60*s,30+120*s+60*c];
  const request:DirectEditRequest={objectId:"rect",target:{kind:"control",id:"c",point:planeToWorld(raw,plane)},startWorld:planeToWorld(start,plane),targetWorld:planeToWorld(raw,plane)};
  const before=documentState(),past=cadHistory.getPastLabels().length,intent=planDirectEdit(cadDocument,request,"geometry");assert.equal(intent.motion!.dof,1);point(intent.motion!.point,expected);
  const review=await previewCadCommand(intent.command);assert.ok(review.result.ok,review.result.reason);const after=getCadPlanSketchPreview(review.planId,"motion")!.after.geometry[0];if(after.kind!=="rectangle")throw new Error("Expected rectangle");near(after.width,120);near(after.height,60);point(after.origin,origin);assert.deepEqual(documentState(),before);
  assert.ok((await applyCadPlan(review.planId)).ok);assert.equal(cadHistory.getPastLabels().length,past+1);const applied=documentState();assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),applied);
});
test("linked coincident entities propagate the projected endpoint in the actual proposal, with no transient anchors in persistence",async()=>{
  await dispatchCadCommand({type:"create-sketch",id:"motion",workPlane:"XY"});for(const geometry of [line(),line("linked",[100,0],[160,0])])await dispatchCadCommand({type:"add-sketch-geometry",sketchId:"motion",geometry});
  for(const constraint of [h,{id:"coincident",kind:"coincident" as const,first:ref("line","line:b"),second:ref("linked","linked:a")},{id:"linked-h",kind:"horizontal" as const,first:ref("linked","linked:a"),second:ref("linked","linked:b")}])await dispatchCadCommand({type:"add-sketch-constraint",sketchId:"motion",constraint});
  const before=documentState(),request:DirectEditRequest={objectId:"line",target:{...target,point:[120,30,0]},startWorld:[100,0,0],targetWorld:[120,30,0]},intent=planDirectEdit(cadDocument,request,"geometry");point(intent.motion!.point,[120,0]);
  const review=await previewCadCommand(intent.command);assert.ok(review.result.ok,review.result.reason);const proposal=getCadPlanSketchPreview(review.planId,"motion")!.after;point(sketchPoint(proposal.geometry[1],"linked:a")!,[120,0]);point(sketchPoint(proposal.geometry[0],"line:a")!,[0,0]);assert.deepEqual(documentState(),before);
  assert.ok((await applyCadPlan(review.planId)).ok);assert.deepEqual(cadDocument.sketches!.motion.constraints.map(c=>c.id),["horizontal","coincident","linked-h"]);
  const precise=adjustDirectRequest(cadDocument,{...request,startWorld:[120,0,0]},150,55);point(planDirectEdit(cadDocument,precise,"geometry").motion!.point,[150,0]);
});
test("rank and projection remain stable at large coordinates and with redundant constraints",()=>{
  const g=line("line",[1e9,-1e9],[1e9+100,-1e9]),s=base([g],[h,{...h,id:"duplicate"}]);
  const m=controlSketchGrip(s,g,target,[1e9+120,-1e9+30],false);assert.equal(m.dof,1);point(m.point,[1e9+120,-1e9]);assert.ok(m.geometry);
});
test("large arcs keep independent radial and tangential movement despite mixed millimetre/radian variables",()=>{
  const g:SketchGeometry={id:"arc",kind:"arc",center:[0,0],radius:1e6,startAngle:0,endAngle:Math.PI/2,centerId:"center",startId:"a",endId:"b",curveId:"curve"};
  const free=controlSketchGrip(base([g]),g,{kind:"control",id:"b"},[100,1e6+100],false);assert.equal(free.dof,2);point(free.point,[100,1e6+100]);
  const fixed=controlSketchGrip(base([g],[{id:"radius",kind:"radius",geometryId:"arc",value:1e6}]),g,{kind:"control",id:"b"},[100,1e6+100],false);assert.equal(fixed.dof,1);assert.equal(fixed.kind,"orbit");near(Math.hypot(...fixed.point),1e6);
});
test("an indirectly fixed distance reports a local tangent and solves the curved path rather than applying a tangent approximation",()=>{
  const g=line(),center:SketchGeometry={id:"center",kind:"circle",center:[0,0],radius:10,centerId:"point",curveId:"curve"},anchor=line("anchor",[0,0],[0,50]);
  const s=base([g,center,anchor],[{id:"anchor",kind:"fixed-point",point:ref("anchor","anchor:a"),value:[0,0]},
    {id:"joint",kind:"coincident",first:ref("center","point"),second:ref("anchor","anchor:a")},
    {id:"distance",kind:"distance",first:ref("center","point"),second:ref("line","line:b"),value:100}]);
  const m=controlSketchGrip(s,g,target,[120,60],false);assert.equal(m.dof,1);assert.equal(m.kind,"local");assert.ok(m.geometry);near(Math.hypot(...m.point),100);point(sketchPoint(m.geometry!,"line:a")!,[0,0]);assert.ok(Math.abs(m.point[0]-100)>5);
});
