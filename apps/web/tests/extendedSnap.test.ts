import assert from "node:assert/strict";
import { test } from "node:test";
import { querySnap, type SnapEntity, type SnapType } from "../src/precision/snapEngine";
import { WORK_PLANES, worldToPlane, planeToWorld } from "../src/precision/workPlane";
import { DEFAULT_SNAP_PREFERENCES, loadSnapPreferences, snapCaption } from "../src/precision/snapPreferences";
const only=(type:SnapType)=>Object.fromEntries(Object.keys(DEFAULT_SNAP_PREFERENCES.enabled).map(k=>[k,k===type]));
for(const planeId of ["XY","XZ","YZ"] as const)test(`${planeId}: quadrant snaps are exact and respect signed arc sweeps`,()=>{
  const plane=WORK_PLANES[planeId],world=(p:[number,number])=>planeToWorld(p,plane),project=(p:Parameters<typeof worldToPlane>[0])=>worldToPlane(p,plane);
  const entities:SnapEntity[]=[{objectId:"circle",kind:"circle",center:world([20,30]),radius:50}];
  const snap=querySnap({point:world([20.5,79.5]),entities,plane,gridStep:1,tolerancePx:2,project,enabled:only("quadrant")});assert.equal(snap.type,"quadrant");assert.equal(snap.objectId,"circle");assert.match(snap.topologyReference!,/quadrant:1/);assert.deepEqual(project(snap.point),[20+Math.cos(Math.PI/2)*50,80]);assert.match(snapCaption(snap,"Reference circle"),/◇ Quadrant · Reference circle/);
  const arc={...entities[0],kind:"arc" as const,startAngle:0,endAngle:-Math.PI/2};const outside=querySnap({point:world([20,80]),entities:[arc],plane,gridStep:1,tolerancePx:2,project,enabled:only("quadrant")});assert.equal(outside.screenDistance,Infinity);
  assert.equal(querySnap({point:world([20,-20]),entities:[arc],plane,gridStep:1,tolerancePx:2,project,enabled:only("quadrant")}).type,"quadrant");
});
test("extension works beyond finite bounds on both sides, retains reference/guide, and is opt-in",()=>{
  const entities:SnapEntity[]=[{objectId:"edge",kind:"line",points:[[0,0,0],[100,50,0]]}],plane=WORK_PLANES.XY,project=(p:[number,number,number]):[number,number]=>[p[0],p[1]];
  for(const x of [-100,200]){const query={point:[x,x/2+.5,0] as [number,number,number],entities,plane,gridStep:1,tolerancePx:2,project,enabled:only("extension")};const snap=querySnap(query);assert.equal(snap.type,"extension");assert.equal(snap.objectId,"edge");assert.match(snap.topologyReference!,/extension/);assert.ok(Math.abs(snap.point[1]-.5*snap.point[0])<1e-10);assert.deepEqual(snap.metadata?.extensionFrom,x<0?[0,0,0]:[100,50,0]);assert.equal(querySnap({...query,enabled:only("endpoint")}).screenDistance,Infinity);}
  assert.equal(querySnap({point:[50,25,0],entities,plane,gridStep:1,tolerancePx:2,project,enabled:only("extension")}).screenDistance,Infinity);
  assert.equal(querySnap({point:[200,100.5,0],entities,plane,gridStep:1,tolerancePx:2,project,enabled:only("nearest")}).screenDistance,Infinity);
});
test("exact endpoints outrank extension and grid spacing/acquisition radius obey settings",()=>{
  const entity:SnapEntity={objectId:"line",kind:"line",points:[[0,0,0],[100,0,0]]};const project=(p:[number,number,number]):[number,number]=>[p[0],p[1]],base={entities:[entity],plane:WORK_PLANES.XY,gridStep:25,tolerancePx:2,project};
  assert.equal(querySnap({...base,point:[100.5,0,0],enabled:{extension:true}}).type,"endpoint");assert.deepEqual(querySnap({...base,entities:[],point:[26,49,0],enabled:only("grid")}).point,[25,50,0]);assert.equal(querySnap({...base,entities:[],point:[26,49,0],tolerancePx:.5,enabled:only("grid")}).screenDistance,Infinity);
  const disabled=querySnap({...base,point:[0,0,0],enabled:Object.fromEntries(Object.keys(DEFAULT_SNAP_PREFERENCES.enabled).map(k=>[k,false]))});assert.equal(disabled.screenDistance,Infinity);assert.deepEqual(loadSnapPreferences(),DEFAULT_SNAP_PREFERENCES);
});
