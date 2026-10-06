import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import type { Sketch, SketchConstraint, SketchGeometry, SketchPoint } from "@agent-webcad/cad-document";
import { serializeDocument, deserializeDocument, sketchConstraintGeometryIds } from "@agent-webcad/cad-document";
import { validateCommand } from "@agent-webcad/cad-commands";
import { solveSketch, sketchPoint } from "../src/precision/sketchSolver";
import { controlSketchGrip } from "../src/precision/sketchGripMotion";
import { sketchAnnotations } from "../src/precision/sketchAnnotations";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory, undoDocument, redoDocument } from "../src/state/history";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { applyCadPlan, getCadPlanSketchPreview, previewCadCommand } from "../src/state/documentPlans";
import { documentState, resetTestDocument } from "./helpers/documentHarness";
import { buildDependencyGraph, dependencyNodeId } from "../src/state/dependencyGraph";

type Line=Extract<SketchGeometry,{kind:"line"}>;type Circle=Extract<SketchGeometry,{kind:"circle"}>;
const line=(id:string,start:SketchPoint,end:SketchPoint):Line=>({id,kind:"line",start,end,startId:`${id}:a`,endId:`${id}:b`,segmentId:`${id}:edge`});
const circle=(id:string,center:SketchPoint,radius:number):Circle=>({id,kind:"circle",center,radius,centerId:`${id}:center`,curveId:`${id}:curve`});
const point=(id:string,end="a")=>({geometryId:id,pointId:`${id}:${end}`});const edge=(id:string)=>({geometryId:id,segmentId:`${id}:edge`});
const fixed=(g:Line):SketchConstraint[]=>[{id:`${g.id}-anchor-a`,kind:"fixed-point",point:point(g.id),value:g.start},{id:`${g.id}-anchor-b`,kind:"fixed-point",point:point(g.id,"b"),value:g.end}];
function input(geometry:SketchGeometry[],constraints:SketchConstraint[]):Sketch{return {id:"s",layerId:"layer-default",workPlane:"XY",geometry,constraints,dimensions:[],solveState:{status:"under-constrained",rank:0,degreesOfFreedom:0,residual:0,tolerance:1e-6}};}
function solve(s:Sketch){const result=solveSketch(s);assert.ok(result.ok,result.ok?"":result.reason);return result.sketch;}
function near(a:number,b:number,tolerance=1e-5){assert.ok(Math.abs(a-b)<=tolerance,`${a} ≈ ${b}`);}
const getLine=(s:Sketch,id:string)=>s.geometry.find(g=>g.id===id) as Line;const getCircle=(s:Sketch,id:string)=>s.geometry.find(g=>g.id===id) as Circle;
const vector=(g:Line)=>[g.end[0]-g.start[0],g.end[1]-g.start[1]];const length=(g:Line)=>Math.hypot(...vector(g));
async function apply(command:Parameters<typeof dispatchCadCommand>[0]){const r=await dispatchCadCommand(command);assert.ok(r.ok,r.reason);return r;}
async function seed(geometry:SketchGeometry[],constraints:SketchConstraint[]=[]){await apply({type:"create-sketch",id:"s",workPlane:"XY"});for(const g of geometry)await apply({type:"add-sketch-geometry",sketchId:"s",geometry:g});for(const c of constraints)await apply({type:"add-sketch-constraint",sketchId:"s",constraint:c});}
beforeEach(resetTestDocument);

for(const kind of ["parallel","perpendicular"] as const)for(const direction of [1,-1])test(`${kind} from an exact right-angle/opposed direction converges without collapsing edges (${direction})`,()=>{
  const a=line("a",[0,0],[100,0]),b=line("b",[0,30],kind==="parallel"?[0,30+direction*80]:[direction*80,30]);
  const s=solve(input([a,b],[...fixed(a),{id:"b-start",kind:"fixed-point",point:point("b"),value:b.start},{id:"direction",kind,firstSegment:edge("a"),secondSegment:edge("b")}]));
  const av=vector(getLine(s,"a")),bv=vector(getLine(s,"b")),norm=Math.hypot(...av)*Math.hypot(...bv);
  near(kind==="parallel"?(av[0]*bv[1]-av[1]*bv[0])/norm:(av[0]*bv[0]+av[1]*bv[1])/norm,0,1e-9);
  assert.ok(length(getLine(s,"b"))>1);assert.equal(s.solveState.degreesOfFreedom,1);
});

test("50/30 mm perpendicular connected sketch remains exact when a shared point moves",async()=>{
  const a=line("a",[0,0],[50,0]),b=line("b",[50,0],[50,30]);
  await seed([a,b],[{id:"joint",kind:"coincident",first:point("a","b"),second:point("b")},{id:"length-a",kind:"distance",first:point("a"),second:point("a","b"),value:50},{id:"length-b",kind:"distance",first:point("b"),second:point("b","b"),value:30},{id:"right-angle",kind:"perpendicular",firstSegment:edge("a"),secondSegment:edge("b")}]);
  const before=documentState(),past=cadHistory.getPastLabels().length;
  await apply({type:"move-sketch-point",sketchId:"s",point:point("a"),position:[20,15],behavior:"solve-connected"});
  const s=cadDocument.sketches!.s,x=getLine(s,"a"),y=getLine(s,"b"),vx=vector(x),vy=vector(y);
  near(x.start[0],20);near(x.start[1],15);near(length(x),50);near(length(y),30);near(vx[0]*vy[0]+vx[1]*vy[1],0);near(x.end[0],y.start[0]);near(x.end[1],y.start[1]);
  assert.equal(cadHistory.getPastLabels().length,past+1);assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());near(length(getLine(cadDocument.sketches!.s,"b")),30);
});

test("equal length refers to stable polyline and rotated rectangle edges",()=>{
  const poly:SketchGeometry={id:"poly",kind:"polyline",vertices:[{id:"p0",point:[0,0]},{id:"p1",point:[10,10]},{id:"p2",point:[30,10]}],segmentIds:["p01","p12"],closed:false};
  const rect:SketchGeometry={id:"rect",kind:"rectangle",origin:[100,0],width:40,height:20,angle:Math.PI/6,cornerIds:["r0","r1","r2","r3"],edgeIds:["r01","r12","r23","r30"]};
  const s=solve(input([poly,rect],[{id:"equal",kind:"equal-length",firstSegment:{geometryId:"poly",segmentId:"p01"},secondSegment:{geometryId:"rect",segmentId:"r01"}},{id:"width",kind:"distance",first:{geometryId:"rect",pointId:"r0"},second:{geometryId:"rect",pointId:"r1"},value:40}]));
  const p=s.geometry[0] as typeof poly,r=s.geometry[1] as typeof rect;near(Math.hypot(p.vertices[1].point[0]-p.vertices[0].point[0],p.vertices[1].point[1]-p.vertices[0].point[1]),40);near(r.width,40);assert.deepEqual(p.segmentIds,poly.segmentIds);assert.equal(sketchAnnotations(s)[0].text,"=");
});

test("concentric/equal-radius circles follow a driving radius, preview, Undo and reopened file",async()=>{
  await seed([circle("c1",[0,0],20),circle("c2",[10,10],35)],[{id:"radius",kind:"radius",geometryId:"c1",value:20},{id:"same-center",kind:"concentric",firstCurveId:"c1",secondCurveId:"c2"},{id:"same-radius",kind:"equal-radius",firstCurveId:"c1",secondCurveId:"c2"}]);
  const before=documentState(),past=cadHistory.getPastLabels().length;
  const preview=await previewCadCommand({type:"set-sketch-dimension",sketchId:"s",constraintId:"radius",value:45});assert.ok(preview.result.ok,preview.result.reason);assert.deepEqual(documentState(),before);
  const sources=getCadPlanSketchPreview(preview.planId,"s")!;near(getCircle(sources.after,"c2").radius,45);assert.ok((await applyCadPlan(preview.planId)).ok);assert.equal(cadHistory.getPastLabels().length,past+1);
  const saved=serializeDocument(cadDocument);assert.equal(JSON.parse(saved).version,5);const reopened=deserializeDocument(saved);const s=solve(reopened.sketches!.s);near(getCircle(s,"c1").center[0],getCircle(s,"c2").center[0]);near(getCircle(s,"c2").radius,45);
  const equations=buildDependencyGraph(cadDocument).solveGroups[0].constraints;
  for(const kind of ["concentric","equal-radius"])assert.deepEqual(new Set(equations.find(c=>c.kind===kind)!.members),new Set(["c1","c2"].map(id=>dependencyNodeId("geometry","s",id))),"Query exposes both curve references to automation");
  assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());
  const old=JSON.parse(saved);old.version=4;assert.throws(()=>deserializeDocument(JSON.stringify(old)),/version 5/);
});

for(const side of [-1,1] as const)test(`line-circle tangency keeps the saved side ${side} and a one-direction center grip`,()=>{
  const a=line("axis",[0,0],[100,0]),c=circle("c",[50,side*35],20);
  const s=solve(input([a,c],[...fixed(a),{id:"radius",kind:"radius",geometryId:"c",value:20},{id:"tangent",kind:"tangent-line",line:edge("axis"),curveId:"c",side}]));
  const actual=getCircle(s,"c");near(actual.center[1],side*20);assert.equal(s.solveState.degreesOfFreedom,1);
  const motion=controlSketchGrip(s,actual,{kind:"control",id:actual.centerId},[80,side*50],false);assert.equal(motion.dof,1);assert.ok(!motion.unchanged);near(motion.point[0],80);near(motion.point[1],side*20);assert.equal(sketchAnnotations(s).find(a=>a.constraintId==="tangent")?.text,"T");
});

for(const contact of ["external","internal"] as const)test(`${contact} circle tangency keeps the contact branch and offers a true circular center drag`,()=>{
  const a=circle("a",[0,0],30),b=circle("b",[40,10],10),constraints:SketchConstraint[]=[{id:"center",kind:"fixed-point",point:{geometryId:"a",pointId:a.centerId},value:a.center},{id:"a-radius",kind:"radius",geometryId:"a",value:30},{id:"b-radius",kind:"radius",geometryId:"b",value:10},{id:"tangent",kind:"tangent-circles",firstCurveId:"a",secondCurveId:"b",contact}];
  const s=solve(input([a,b],constraints)),actual=getCircle(s,"b"),radius=contact==="external"?40:20;near(Math.hypot(...actual.center),radius);
  const motion=controlSketchGrip(s,actual,{kind:"control",id:b.centerId},[60,80],false);assert.equal(motion.kind,"orbit");near(motion.point[0],radius*.6);near(motion.point[1],radius*.8);assert.equal(s.solveState.degreesOfFreedom,1);
});

test("point-on-line projects an endpoint onto the allowed direction; point-on-circle provides an orbit",()=>{
  const axis=line("axis",[0,0],[100,0]),p=line("p",[10,-30],[40,0]);
  const onLine=solve(input([axis,p],[...fixed(axis),{id:"on-line",kind:"point-on-line",point:point("p","b"),line:edge("axis")}]))
  const along=controlSketchGrip(onLine,getLine(onLine,"p"),{kind:"control",id:p.endId},[70,25],false);assert.equal(along.dof,1);near(along.point[0],70);near(along.point[1],0);
  const c=circle("c",[0,0],50),g=line("g",[-100,-100],[50,0]);
  const onCircle=solve(input([c,g],[{id:"center",kind:"fixed-point",point:{geometryId:"c",pointId:c.centerId},value:c.center},{id:"radius",kind:"radius",geometryId:"c",value:50},{id:"on-circle",kind:"point-on-circle",point:point("g","b"),curveId:"c"}]));
  const orbit=controlSketchGrip(onCircle,getLine(onCircle,"g"),{kind:"control",id:g.endId},[30,40],false);assert.equal(orbit.kind,"orbit");near(orbit.point[0],30);near(orbit.point[1],40);
});

test("symmetry mirrors a selected point about a stable axis and reports both residuals on conflict",async()=>{
  const axis=line("axis",[0,-100],[0,100]),a=line("a",[50,50],[15,25]),b=line("b",[-50,50],[-18,28]);
  await seed([axis,a,b],[...fixed(axis),...fixed(a),{id:"symmetric",kind:"symmetric",first:point("a","b"),second:point("b","b"),axis:edge("axis")}]);
  const actual=getLine(cadDocument.sketches!.s,"b");near(actual.end[0],-15);near(actual.end[1],25);assert.deepEqual(sketchConstraintGeometryIds(cadDocument.sketches!.s.constraints.at(-1)!),["a","b","axis"]);
  const equation=buildDependencyGraph(cadDocument).solveGroups[0].constraints.find(c=>c.kind==="symmetric")!;assert.deepEqual(new Set(equation.members),new Set(["a","b","axis"].map(id=>dependencyNodeId("geometry","s",id))));assert.deepEqual(equation.definition,cadDocument.sketches!.s.constraints.at(-1));
  const before=documentState(),past=cadHistory.getPastLabels().length;
  const result=await dispatchCadCommand({type:"move-sketch-point",sketchId:"s",point:point("b","b"),position:[-15,60]});assert.equal(result.ok,false);assert.ok(result.diagnostic?.constraintIds.includes("symmetric"));assert.ok(result.diagnostic?.geometryIds.includes("axis"));assert.deepEqual(documentState(),before);assert.equal(cadHistory.getPastLabels().length,past);
});

test("relation preview is detached, applying once preserves IDs, duplication remaps all refs and deletion removes only attached relations",async()=>{
  const a=line("a",[0,0],[100,0]),b=line("b",[0,40],[50,55]);await seed([a,b]);const before=documentState(),past=cadHistory.getPastLabels().length;
  const c:SketchConstraint={id:"parallel",kind:"parallel",firstSegment:edge("a"),secondSegment:edge("b")};const preview=await previewCadCommand({type:"add-sketch-constraint",sketchId:"s",constraint:c});assert.ok(preview.result.ok,preview.result.reason);assert.deepEqual(documentState(),before);
  assert.ok((await applyCadPlan(preview.planId)).ok);assert.equal(cadHistory.getPastLabels().length,past+1);assert.deepEqual(cadDocument.sketches!.s.constraints[0],c);assert.equal((await applyCadPlan(preview.planId)).changed,false);
  assert.deepEqual(new Set(buildDependencyGraph(cadDocument).solveGroups[0].constraints[0].members),new Set(["a","b"].map(id=>dependencyNodeId("geometry","s",id))));
  await apply({type:"duplicate-sketch-geometry",sketchId:"s",geometryIds:["a","b"],offset:[200,0]});const copies=cadDocument.sketches!.s.geometry.slice(2),copy=cadDocument.sketches!.s.constraints[1];assert.equal(copy.kind,"parallel");assert.deepEqual(new Set(sketchConstraintGeometryIds(copy)),new Set(copies.map(g=>g.id)));assert.equal(solveSketch(cadDocument.sketches!.s).ok,true);
  await apply({type:"remove-sketch-geometry",sketchId:"s",geometryId:"a"});assert.equal(cadDocument.sketches!.s.constraints.length,1);assert.equal(cadDocument.sketches!.s.constraints[0].id,copy.id);
});

test("invalid stable edges, unsupported arc tangency, malformed payloads and equal-radius internal contact fail atomically",async()=>{
  const a=line("a",[0,0],[100,0]);await seed([a,circle("c1",[0,20],20),circle("c2",[40,20],20)]);
  assert.equal(validateCommand({type:"add-sketch-constraint",sketchId:"s",constraint:{id:"bad",kind:"tangent-line",line:edge("a"),curveId:"c1",side:0}}),false);
  const before=documentState(),past=cadHistory.getPastLabels().length;const bad=await dispatchCadCommand({type:"add-sketch-constraint",sketchId:"s",constraint:{id:"bad-edge",kind:"parallel",firstSegment:edge("a"),secondSegment:{geometryId:"c1",segmentId:"missing"}}});assert.equal(bad.ok,false);assert.deepEqual(documentState(),before);assert.equal(cadHistory.getPastLabels().length,past);
  const c1=circle("c1",[0,0],20),c2=circle("c2",[0,0],20);const equal=solveSketch(input([c1,c2],[{id:"internal",kind:"tangent-circles",firstCurveId:"c1",secondCurveId:"c2",contact:"internal"}]));assert.equal(equal.ok,false);if(!equal.ok)assert.match(equal.reason,/distinct/);
  const arc:SketchGeometry={id:"arc",kind:"arc",center:[0,20],radius:20,centerId:"o",startId:"s",endId:"e",curveId:"curve",startAngle:0,endAngle:Math.PI/2};assert.equal(solveSketch(input([a,arc],[{id:"tangent",kind:"tangent-line",line:edge("a"),curveId:"arc",side:1}])).ok,false);
  const file=JSON.parse(serializeDocument(cadDocument));file.document.sketches.s.constraints=[{id:"unknown",kind:"future-unsafe"}];assert.throws(()=>deserializeDocument(JSON.stringify(file)),/sketch relation/);
});

for(const origin of [0,1e8])test(`survey coordinates ${origin} preserve point-on-line and concentric precision`,()=>{
  const a=line("axis",[origin,origin],[origin+100,origin+50]),p=line("p",[origin-10,origin-20],[origin+40,origin+25]);
  const s=solve(input([a,p],[...fixed(a),{id:"point",kind:"point-on-line",point:point("p","b"),line:edge("axis")}])),q=getLine(s,"p").end;
  near((q[1]-origin)-.5*(q[0]-origin),0,1e-6);
  const centers=solve(input([circle("a",[origin,origin],20),circle("b",[origin+40,origin+10],50)],[{id:"same",kind:"concentric",firstCurveId:"a",secondCurveId:"b"}]));near(getCircle(centers,"a").center[0],getCircle(centers,"b").center[0],1e-6);
});
