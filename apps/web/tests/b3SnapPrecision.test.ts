import assert from "node:assert/strict";
import {test} from "node:test";
import {linearToleranceAt} from "@agent-webcad/cad-document";
import {querySnap,segmentCircleIntersections,circleCircleIntersections,type SnapEntity,type SnapType} from "../src/precision/snapEngine";
import {linearCircleBranches} from "../src/precision/constructionGeometry";
import {circularIntersections} from "../src/precision/circularIntersection";
import {WORK_PLANES,planeToWorld,worldToPlane} from "../src/precision/workPlane";

const near=(a:number,b:number,t=1e-6)=>assert.ok(Math.abs(a-b)<=t,`${a} vs ${b}`);
const onlyIntersection=Object.fromEntries((["intersection","endpoint","midpoint","center","quadrant","perpendicular","tangent","extension","nearest","grid"] as SnapType[]).map(t=>[t,t==="intersection"]));
test("large finite line circle roots match independent exact positions and radial residuals",()=>{
  const roots=segmentCircleIntersections([0,0],[1e9,0],[5e8,0],5);assert.equal(roots.length,2);
  roots.forEach((p,i)=>{near(p[0],5e8+(i===0?-5:5));near(p[1],0);near(Math.hypot(p[0]-5e8,p[1]),5);});
});
test("translated 3-4-5 line circle solutions retain both roots rather than parameter-based merging",()=>{
  for(const offset of [0,1e9]){const roots=segmentCircleIntersections([offset,offset],[offset+1e9,offset],[offset+5e8,offset+4],5);assert.equal(roots.length,2);roots.forEach((p,i)=>near(p[0],offset+5e8+(i===0?-3:3)));}
  const tinyParameterGap=segmentCircleIntersections([0,0],[1e12,0],[5e11,0],5);assert.equal(tinyParameterGap.length,2);
});
test("circle tangency uses construction tolerance and emits one physical snap point",()=>{
  for(const distance of [10,10+1e-8,10-1e-8]){const result=circularIntersections([0,0],5,[distance,0],5);assert.equal(result.status,"tangent");const roots=circleCircleIntersections([0,0],5,[distance,0],5);assert.equal(roots.length,1);near(roots[0][0],distance/2);near(roots[0][1],0);}
  assert.equal(circleCircleIntersections([0,0],5,[10.001,0],5).length,0);
});
test("unequal circle radii and ordered rotated centres satisfy independent radial residuals",()=>{
  for(const offset of [0,1e9]){const roots=circleCircleIntersections([offset,offset],5,[offset,offset+4],3);assert.equal(roots.length,2);for(const p of roots){near(Math.hypot(p[0]-offset,p[1]-offset),5);near(Math.hypot(p[0]-offset,p[1]-offset-4),3);}}
  assert.equal(circleCircleIntersections([0,0],5,[2,0],3).length,1);assert.equal(circleCircleIntersections([0,0],5,[0,0],3).length,0);assert.equal(circleCircleIntersections([0,0],5,[0,0],5).length,0);
});
test("finite endpoint tolerance retains boundary roots but excludes intersections past the domain",()=>{
  near(segmentCircleIntersections([0,0],[5,0],[10,0],5)[0][0],5);
  assert.equal(segmentCircleIntersections([0,0],[5-1e-8,0],[10,0],5).length,1);
  assert.equal(segmentCircleIntersections([0,0],[4.99,0],[10,0],5).length,0);
  const roots=linearCircleBranches([0,0],[1,0],[10,0],5,"ray");assert.equal(roots.length,2);
});
test("degenerate or invalid geometry is ineligible for snap without throwing",()=>{
  for(const radius of [0,-1,Infinity]){assert.deepEqual(segmentCircleIntersections([0,0],[10,0],[5,0],radius),[]);assert.deepEqual(circleCircleIntersections([0,0],radius,[10,0],5),[]);}
  assert.deepEqual(segmentCircleIntersections([0,0],[0,0],[5,0],5),[]);assert.deepEqual(segmentCircleIntersections([NaN,0],[1,0],[0,0],5),[]);
});
test("actual query selects large-coordinate intersection within pixel tolerance with stable source metadata",()=>{
  const entities:SnapEntity[]=[{objectId:"line",kind:"line",points:[[0,0,0],[1e9,0,0]]},{objectId:"circle",kind:"circle",center:[5e8,0,0],radius:5}];
  const snap=querySnap({point:[5e8-5+.2,0,0],entities,plane:WORK_PLANES.XY,gridStep:1,tolerancePx:.5,project:p=>[p[0]-5e8,p[1]],enabled:onlyIntersection});assert.equal(snap.type,"intersection");near(snap.point[0],5e8-5);assert.equal(snap.objectId,"line");assert.equal(snap.metadata?.otherObjectId,"circle");assert.equal(snap.topologyReference,"segment:0|curve");
});
test("both signed arc domains and closed endpoints filter snap circle intersections in all base planes",()=>{
  for(const plane of Object.values(WORK_PLANES)){
    const entities:SnapEntity[]=[{objectId:"a",kind:"arc",center:planeToWorld([0,0],plane),radius:5,startAngle:0,endAngle:Math.PI},{objectId:"b",kind:"arc",center:planeToWorld([6,0],plane),radius:5,startAngle:Math.PI,endAngle:0}];
    const run=(p:[number,number])=>querySnap({point:planeToWorld(p,plane),entities,plane,gridStep:1,tolerancePx:.5,project:p=>worldToPlane(p,plane),enabled:onlyIntersection});near(worldToPlane(run([3,4]).point,plane)[1],4);assert.equal(run([3,-4]).screenDistance,Infinity);
    entities[0].endAngle=Math.atan2(4,3)-1e-8;assert.equal(run([3,4]).type,"intersection");entities[0].endAngle=Math.atan2(4,3)-.01;assert.equal(run([3,4]).screenDistance,Infinity);
  }
});
test("line arc query admits tolerance tangency, CW wrapping and respects ray direction",()=>{
  const query={point:[0,5+1e-8,0] as [number,number,number],plane:WORK_PLANES.XY,gridStep:1,tolerancePx:1,project:(p:[number,number,number])=>[p[0],p[1]] as [number,number],enabled:onlyIntersection};
  const line:SnapEntity={objectId:"line",kind:"line",points:[[-10,5+1e-8,0],[10,5+1e-8,0]]},arc:SnapEntity={objectId:"arc",kind:"arc",center:[0,0,0],radius:5,startAngle:Math.PI,endAngle:0};
  assert.equal(querySnap({...query,entities:[line,arc]}).type,"intersection");arc.startAngle=0;arc.endAngle=-Math.PI;assert.equal(querySnap({...query,entities:[line,arc]}).screenDistance,Infinity);
  const ray:SnapEntity={objectId:"ray",kind:"ray",points:[[6,0,0],[7,0,0]]};assert.equal(querySnap({...query,point:[5,0,0],entities:[ray,{...arc,kind:"circle",startAngle:undefined,endAngle:undefined}]}).screenDistance,Infinity);
});
test("pixel snap tolerance remains independent of modeling tolerance",()=>{
  const entities:SnapEntity[]=[{objectId:"a",kind:"circle",center:[0,0,0],radius:5},{objectId:"b",kind:"circle",center:[6,0,0],radius:5}];
  for(const zoom of [1,10]){const point:[number,number,number]=[3+.2/zoom,4,0],snap=querySnap({point,entities,plane:WORK_PLANES.XY,gridStep:1,tolerancePx:.5,project:p=>[p[0]*zoom,p[1]*zoom],enabled:onlyIntersection});assert.equal(snap.type,"intersection");near(snap.point[0],3,linearToleranceAt(...snap.point));near(snap.screenDistance,.2);}
});
