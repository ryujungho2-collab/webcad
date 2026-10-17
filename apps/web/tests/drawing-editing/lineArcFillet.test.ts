import { drawingModelToWorld } from "../../src/precision/worldGeometry";
import assert from "node:assert/strict";
import { beforeEach,test } from "node:test";
import { serializeDocument,deserializeDocument } from "@agent-webcad/cad-document";
import { validateCommand,type CadCommand } from "@agent-webcad/cad-commands";
import { cadDocument } from "../../src/state/cadDocument";
import { dispatchCadCommand } from "../../src/state/dispatchCadCommand";
import { previewCadCommand,applyCadPlan,discardCadPlan } from "../../src/state/documentPlans";
import { cadHistory,undoDocument,redoDocument } from "../../src/state/history";
import { exactDrawingContour,segmentPoint } from "../../src/features/drawing-editing/geometry/contourEditing";
import { lineArcFilletSolutions } from "../../src/features/drawing-editing/geometry/lineArcFillet";
import { WORK_PLANES,planeToWorld,type Vec3 } from "../../src/precision/workPlane";
import { documentState,resetTestDocument } from "../helpers/documentHarness";
beforeEach(resetTestDocument);
const feature=(id:string)=>Object.values(cadDocument.features).find(f=>f.output===id)!;
const entry=(id:string)=>({object:cadDocument.objects[id],feature:feature(id)});
const path=(id:string)=>exactDrawingContour(cadDocument.objects[id],feature(id));
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-6,`${a} ≈ ${b}`);
const point=(a:Vec3,b:Vec3)=>a.forEach((n,i)=>near(n,b[i]));
async function apply(c:CadCommand){const r=await dispatchCadCommand(c);assert.ok(r.ok,r.reason);return r;}
async function setup(plane:"XY"|"XZ"|"YZ"="XY",reverse=false){
 const p=(x:number,y:number)=>planeToWorld([x,y],WORK_PLANES[plane]).map((n,i)=>n+7*WORK_PLANES[plane].normal[i]) as Vec3;
 await apply({type:"create-drawing",id:"line",drawing:"line",params:{workPlane:plane,points:[p(0,0),p(30,0)]}});
 await apply({type:"create-drawing",id:"arc",drawing:"arc",params:{workPlane:plane,center:p(0,10),radius:10,startAngle:reverse?Math.PI/2:-Math.PI/2,endAngle:reverse?-Math.PI/2:Math.PI/2}});
 return p;
}
function command(swap=false):Extract<CadCommand,{type:"connect-drawings"}>{const ids=swap?["arc","line"]:["line","arc"];return {type:"connect-drawings",firstId:ids[0],secondId:ids[1],firstPoint:segmentPoint(path(ids[0]).segments[0],.7,path(ids[0]).workPlane),secondPoint:segmentPoint(path(ids[1]).segments[0],.7,path(ids[1]).workPlane),treatment:"fillet",distance:2,id:"fillet"};}
test("bounded line–arc Fillet computes independent tangent coordinates, radius and one reversible transaction",async()=>{
 const p=await setup(),topology=structuredClone([feature("line").params.topology,feature("arc").params.topology]);
 const before=documentState(),h=cadHistory.getPastLabels().length,preview=await previewCadCommand(command());assert.ok(preview.result.ok,preview.result.reason);assert.deepEqual(documentState(),before);
 assert.ok((await applyCadPlan(preview.planId)).ok);discardCadPlan(preview.planId);
 const x=Math.sqrt(80),arc=path("fillet").segments[0];point(arc.center!,p(x,2));near(arc.radius!,2);point(arc.start,p(x,0));point(arc.end,p(x*10/12,10-80/12));
 point(path("line").segments[0].start,arc.start);point(path("arc").segments[0].start,arc.end);point(path("arc").segments[0].end,p(0,20));
 const radial=arc.end.map((n,i)=>n-p(0,10)[i]),contact=arc.end.map((n,i)=>n-arc.center![i]);near(radial.reduce((sum,n,i)=>sum+n*contact[i],0),-20); // External circles touch on opposing radius vectors.
 assert.deepEqual([feature("line").params.topology,feature("arc").params.topology],topology);assert.equal(cadHistory.getPastLabels().length,h+1);assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)),cadDocument);
 const after=documentState();assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),after);
});
test("source order, clockwise arcs and elevated XY/XZ/YZ use the same analytic contact geometry",async()=>{
 for(const plane of ["XY","XZ","YZ"] as const)for(const reverse of [false,true])for(const swap of [false,true]){resetTestDocument();const p=await setup(plane,reverse),c=command(swap);if(reverse){if(swap)c.firstPoint=segmentPoint(path("arc").segments[0],.3,plane);else c.secondPoint=segmentPoint(path("arc").segments[0],.3,plane);}await apply(c);const fillet=path("fillet").segments[0];point(swap?fillet.end:fillet.start,p(Math.sqrt(80),0));point(swap?fillet.start:fillet.end,p(Math.sqrt(80)*10/12,10-80/12));}
});
test("no-fit radius, invalid selection and source/downstream locks publish nothing",async()=>{
 await setup();const c=command();for(const solutionIndex of [-1,8,NaN,1.5])assert.equal(validateCommand({...c,solutionIndex}),false);assert.equal(validateCommand({...c,treatment:"chamfer",solutionIndex:0}),true);
 for(const extra of [{distance:100},{distance:1e308},{solutionIndex:7},{treatment:"chamfer" as const}]){const before=JSON.stringify(cadDocument),h=cadHistory.getPastLabels().length,r=await dispatchCadCommand({...c,...extra});assert.equal(r.ok,false);assert.equal(JSON.stringify(cadDocument),before);assert.equal(cadHistory.getPastLabels().length,h);}
 await apply({type:"create-layer",id:"locked",name:"Locked"});await apply({type:"create-dimension",id:"dim",dimension:"linear",params:{sourceObjectId:"line",points:[[0,0],[30,0]]}});await apply({type:"move-object-to-layer",objectId:"dim",layerId:"locked"});cadDocument.layers.locked.locked=true;
 const before=documentState(),labels=cadHistory.getPastLabels();assert.equal((await dispatchCadCommand(c)).ok,false);assert.deepEqual(documentState(),before);assert.deepEqual(cadHistory.getPastLabels(),labels);
});
test("stale line–arc previews reject and retained dimensions follow the source in the same transaction",async()=>{
 await setup();await apply({type:"create-dimension",id:"dim",dimension:"linear",params:{sourceObjectId:"line",points:[[0,0],[30,0]]}});const p=await previewCadCommand(command());assert.ok(p.result.ok,p.result.reason);await apply({type:"rename-object",objectId:"arc",name:"Changed arc"});const before=documentState();assert.equal((await applyCadPlan(p.planId)).ok,false);assert.deepEqual(documentState(),before);discardCadPlan(p.planId);
 const result=await previewCadCommand(command());assert.ok(result.result.ok,result.result.reason);assert.ok(result.changes.some(c=>c.objectId==="dim"));assert.ok((await applyCadPlan(result.planId)).ok);discardCadPlan(result.planId);near((feature("dim").params.points as number[][])[0][0],Math.sqrt(80));
});
test("multiple valid tangencies require an explicit reviewed solution",async()=>{
 await apply({type:"create-drawing",id:"line",drawing:"line",params:{workPlane:"XY",points:[[-30,0,0],[30,0,0]]}});
 await apply({type:"create-drawing",id:"arc",drawing:"arc",params:{workPlane:"XY",center:[0,0,0],radius:10,startAngle:0,endAngle:Math.PI*1.9}});
 let chosen:{firstPoint:Vec3;secondPoint:Vec3}|undefined;
 for(const x of [-25,-5,5,25])for(const t of [.1,.3,.5,.7,.9]){const firstPoint:Vec3=[x,0,0],secondPoint=segmentPoint(path("arc").segments[0],t,"XY"),solutions=lineArcFilletSolutions(entry("line"),entry("arc"),firstPoint,secondPoint,2);if(solutions.length>1){chosen={firstPoint,secondPoint};break;}}
 assert.ok(chosen,"fixture must offer multiple exact solutions");const c={...command(),...chosen},before=documentState(),r=await dispatchCadCommand(c);assert.equal(r.ok,false);assert.match(r.reason!,/Multiple tangent/);assert.deepEqual(documentState(),before);await apply({...c,solutionIndex:1});
});

test("uniform transformed and reflected line–arc sources keep exact world contacts and the retained frames",async()=>{
 for(const reflect of [false,true]){
  resetTestDocument();await setup();const angle=.4,k=reflect?-2:2;
  const map=(p:Vec3):Vec3=>[100+k*p[0]*Math.cos(angle)-2*p[1]*Math.sin(angle),200+k*p[0]*Math.sin(angle)+2*p[1]*Math.cos(angle),p[2]];
  for(const id of ["line","arc"]){const object=cadDocument.objects[id];object.transform={translation:[0,0,0],rotation:[0,0,angle*180/Math.PI],scale:[k,2,1]};const origin=drawingModelToWorld(object,feature(id),[0,0,0])!;object.transform.translation=[100-origin[0],200-origin[1],-origin[2]];}
  const beforeLine=path("line").segments[0].end,beforeArc=path("arc").segments[0].end,c=command();c.distance=4;await apply(c);const connector=path("fillet").segments[0];point(connector.center!,map([Math.sqrt(80),2,7]));point(connector.start,map([Math.sqrt(80),0,7]));point(path("line").segments[0].end,beforeLine);point(path("arc").segments[0].end,beforeArc);
 }
});

test("a double analytic locus root retains the correct tangent semicircle orientation",async()=>{
 await apply({type:"create-drawing",id:"line",drawing:"line",params:{workPlane:"XY",points:[[-30,0,0],[30,0,0]]}});
 await apply({type:"create-drawing",id:"arc",drawing:"arc",params:{workPlane:"XY",center:[0,14,0],radius:10,startAngle:-Math.PI,endAngle:Math.PI/2}});
 await apply(command());const arc=path("fillet").segments[0];point(arc.center!,[0,2,0]);point(arc.start,[0,0,0]);point(arc.end,[0,4,0]);near(arc.sweep!,-Math.PI);near(arc.radius!,2);
});
