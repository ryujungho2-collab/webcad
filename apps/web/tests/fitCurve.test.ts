import test from "node:test";import assert from "node:assert/strict";
import {fitSpline,fittedSplineDefinition} from "../src/precision/fitSpline";
import {splinePoint,sampleSpline,splineClosed,splineLength} from "../src/precision/splineGeometry";
import {curveStations} from "../src/precision/curveStations";
import {planCurveLayout} from "../src/state/curveLayoutPlan";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {cadDocument} from "../src/state/cadDocument";
import {resetTestDocument,documentState} from "./helpers/documentHarness";
import {undoDocument,redoDocument} from "../src/state/history";
import {serializeDocument,deserializeDocument} from "@agent-webcad/cad-document";
import {extractSketchLoops} from "../src/precision/sketchProfiles";
test("Through-point cubic interpolates its anchors, closes smoothly and recovers its editable definition",()=>{
 const p:[number,number,number][]=[[0,0,0],[8000,500,0],[10500,5000,0],[2500,8000,0],[-2000,4000,0]],s=fitSpline(p,true,.8);assert.ok(splineClosed(s));for(let i=0;i<p.length;i++)assert.ok(Math.hypot(...splinePoint(s,i).map((v,j)=>v-p[i][j]))<1e-8);
 const h=1e-6,left=splinePoint(s,s.domain[1]-h),right=splinePoint(s,h),zero=splinePoint(s,0);assert.ok(Math.hypot(...left.map((v,i)=>(zero[i]-v)-(right[i]-zero[i])))<1e-5);
 const recovered=fittedSplineDefinition(s)!;assert.deepEqual(recovered.points,p);assert.ok(recovered.closed&&Math.abs(recovered.tension-.8)<1e-12);assert.throws(()=>fitSpline([[0,0,0],[0,0,0]]),/distinct/);assert.throws(()=>fitSpline(p,true,NaN),/finite/);
});
test("Polyline derivative respects its chord bound and supplies a real closed CAD profile",async()=>{
 resetTestDocument();const s=fitSpline([[0,0,0],[5000,0,0],[7000,4000,0],[0,6000,0]],true),coarse=sampleSpline(s,2),fine=sampleSpline(s,.01);coarse.pop();
 const distance=(p:number[],a:number[],b:number[])=>{const v=b.map((x,i)=>x-a[i]),len=v.reduce((n,x)=>n+x*x,0),t=Math.max(0,Math.min(1,p.reduce((n,x,i)=>n+(x-a[i])*v[i],0)/len));return Math.hypot(...p.map((x,i)=>x-a[i]-t*v[i]));};
 for(const p of fine)assert.ok(Math.min(...coarse.map((a,i)=>distance(p,a,coarse[(i+1)%coarse.length])))<=2.000001);
 const r=await dispatchCadCommand({type:"create-drawing",id:"profile",drawing:"polyline",params:{workPlane:"XY",closed:true,points:coarse}});assert.ok(r.ok,r.reason);const loops=extractSketchLoops(cadDocument,["profile"]);assert.ok(loops.ok&&loops.loops.length===1);
});
test("Circle stations have exact analytic positions, normal offsets, closed-loop seam and atomic snapshots",async()=>{
 resetTestDocument();let r=await dispatchCadCommand({type:"create-drawing",id:"path",drawing:"circle",params:{workPlane:"XY",center:[1000,2000,0],radius:500}});assert.ok(r.ok,r.reason);
 const options={count:4,start:0,end:1,offset:100},layout=curveStations(cadDocument,"path",options);assert.equal(layout.stations.length,4);assert.ok(Math.abs(layout.length-1000*Math.PI)<1e-8);assert.ok(Math.hypot(layout.stations[1].point[0]-1000,layout.stations[1].point[1]-2400)<1e-8);
 const before=documentState(),plan=planCurveLayout(cadDocument,"path",{...options,id:"ticks",layerId:"layer-default",tickLength:250});assert.deepEqual(documentState(),before);r=await dispatchCadCommand(plan.command);assert.ok(r.ok,r.reason);const after=documentState();assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),after);const native=serializeDocument(cadDocument);assert.equal(serializeDocument(deserializeDocument(native)),native);
 r=await dispatchCadCommand({type:"move-object",objectId:"path",translation:[100,0,0]});assert.ok(r.ok);assert.deepEqual(cadDocument.features["feature-ticks-0"].params,after.features["feature-ticks-0"].params,"Snapshot ticks stay put after source edits");assert.throws(()=>planCurveLayout(cadDocument,"path",{...options,id:"bad",layerId:"layer-default",tickLength:-1}),/positive/);
});
test("Partial arc layout includes both endpoints and ticks follow the XZ work plane",async()=>{
 resetTestDocument();const r=await dispatchCadCommand({type:"create-drawing",id:"arc",drawing:"arc",params:{workPlane:"XZ",center:[0,0,0],radius:1000,startAngle:0,endAngle:Math.PI/2}});assert.ok(r.ok,r.reason);const p=planCurveLayout(cadDocument,"arc",{id:"xz",count:3,start:0,end:1,offset:0,tickLength:100,layerId:"layer-default"});assert.ok(Math.abs(p.stations.at(-1)!.point[2]-1000)<1e-8);const c=p.command;if(c.type==="batch")for(const command of c.commands)if(command.type==="create-drawing")assert.ok((command.params.points as number[][]).every(p=>p[1]===0));
});

test("Architectural facade length remains finite at strict tolerance and scales consistently",()=>{
 const p:[number,number,number][]=[[9000,1000,0],[3000,2200,0],[900,7000,0],[2300,13500,0],[7500,17100,0],[14500,17600,0],[22500,14900,0],[25300,10300,0],[23900,5000,0],[17500,3000,0],[13000,1800,0]];
 const large=fitSpline(p,true,.9),small=fitSpline(p.map(q=>q.map(v=>v/1000) as [number,number,number]),true,.9),length=splineLength(large);
 const chord=p.reduce((sum,a,i)=>sum+Math.hypot(...a.map((v,j)=>v-p[(i+1)%p.length][j])),0),upper=large.controlPoints.slice(1).reduce((sum,a,i)=>sum+Math.hypot(...a.map((v,j)=>v-large.controlPoints[i][j])),0);assert.ok(length>=chord&&length<=upper);assert.ok(Math.abs(length-splineLength(small,1e-9)*1000)<1e-5);
 const q={degree:2,controlPoints:[[100000,0,0],[100000,100000,0],[0,100000,0]] as [number,number,number][],weights:[1,Math.SQRT1_2,1],knots:[0,0,0,1,1,1],domain:[0,1] as [number,number]};assert.ok(Math.abs(splineLength(q)-50000*Math.PI)<1e-6);
});
