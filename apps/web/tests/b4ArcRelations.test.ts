import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import type { Sketch, SketchConstraint, SketchGeometry, SketchPoint } from "@agent-webcad/cad-document";
import { deserializeDocument, serializeDocument, sketchConstraintGeometryIds } from "@agent-webcad/cad-document";
import { validateCommand } from "@agent-webcad/cad-commands";
import { arcIntervalError, curveCurveContact, lineArcContact, projectPointToArc } from "../src/precision/sketchArcRelations";
import { solveSketch } from "../src/precision/sketchSolver";
import { controlSketchGrip } from "../src/precision/sketchGripMotion";
import { cadDocument } from "../src/state/cadDocument";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { documentState, resetTestDocument } from "./helpers/documentHarness";
import { cadHistory, redoDocument, undoDocument } from "../src/state/history";

type Arc=Extract<SketchGeometry,{kind:"arc"}>;
type Line=Extract<SketchGeometry,{kind:"line"}>;
const arc=(id:string,center:SketchPoint,radius:number,startAngle:number,endAngle:number):Arc=>({id,kind:"arc",center,radius,startAngle,endAngle,centerId:`${id}:center`,startId:`${id}:start`,endId:`${id}:end`,curveId:`${id}:curve`});
const line=(id:string,start:SketchPoint,end:SketchPoint):Line=>({id,kind:"line",start,end,startId:`${id}:start`,endId:`${id}:end`,segmentId:`${id}:edge`});
const input=(geometry:SketchGeometry[],constraints:SketchConstraint[]):Sketch=>({id:"s",workPlane:"XY",layerId:"layer-default",geometry,constraints,dimensions:[],solveState:{status:"under-constrained",degreesOfFreedom:0,rank:0,residual:0,tolerance:1e-6}});
const fixedLine=(g:Line):SketchConstraint[]=>[{id:`${g.id}:fix-start`,kind:"fixed-point",point:{geometryId:g.id,pointId:g.startId},value:g.start},{id:`${g.id}:fix-end`,kind:"fixed-point",point:{geometryId:g.id,pointId:g.endId},value:g.end}];
const fixedArc=(g:Arc):SketchConstraint[]=>[{id:`${g.id}:fix-center`,kind:"fixed-point",point:{geometryId:g.id,pointId:g.centerId},value:g.center},{id:`${g.id}:fix-start`,kind:"fixed-point",point:{geometryId:g.id,pointId:g.startId},value:[g.center[0]+g.radius*Math.cos(g.startAngle),g.center[1]+g.radius*Math.sin(g.startAngle)]},{id:`${g.id}:fix-end`,kind:"fixed-point",point:{geometryId:g.id,pointId:g.endId},value:[g.center[0]+g.radius*Math.cos(g.endAngle),g.center[1]+g.radius*Math.sin(g.endAngle)]}];
const solve=(geometry:SketchGeometry[],constraints:SketchConstraint[])=>solveSketch(input(geometry,constraints));
const near=(actual:number,expected:number,tolerance=1e-5)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} ≈ ${expected}`);
beforeEach(resetTestDocument);

test("directed arc interval includes endpoints and handles wrap-around and clockwise branches",()=>{
  const ccw=arc("a",[0,0],10,Math.PI*1.75,Math.PI*2.25);
  near(arcIntervalError(ccw,[10,0]),0);
  near(arcIntervalError(ccw,[Math.SQRT1_2*10,-Math.SQRT1_2*10]),0);
  near(arcIntervalError(ccw,[Math.SQRT1_2*10,Math.SQRT1_2*10]),0);
  assert.ok(Math.abs(arcIntervalError(ccw,[-10,0]))>1);
  const cw=arc("b",[0,0],10,Math.PI/4,-Math.PI/4);
  near(arcIntervalError(cw,[10,0]),0);
  assert.ok(Math.abs(arcIntervalError(cw,[-10,0]))>1);
  assert.deepEqual(projectPointToArc(cw,[-10,0]).map(value=>Math.round(value*1e6)/1e6),[Math.SQRT1_2*10,Math.SQRT1_2*10].map(value=>Math.round(value*1e6)/1e6));
});

test("point-on-arc retains the finite sector and rejects a fixed point on the other side",()=>{
  const curve=arc("arc",[0,0],20,0,Math.PI/2),p=line("p",[-20,0],[15,15]);
  const relation:SketchConstraint={id:"bounded",kind:"point-on-arc",point:{geometryId:"p",pointId:p.endId},curveId:curve.id};
  assert.deepEqual(sketchConstraintGeometryIds(relation),["p","arc"]);
  const result=solve([curve,p],[...fixedArc(curve),{id:"p-start",kind:"fixed-point",point:{geometryId:p.id,pointId:p.startId},value:p.start},relation]);
  assert.ok(result.ok,result.ok?"":result.reason);
  if(result.ok){const actual=result.sketch.geometry.find(g=>g.id==="p") as Line;near(Math.hypot(...actual.end),20);near(arcIntervalError(curve,actual.end),0);const motion=controlSketchGrip(result.sketch,actual,{kind:"control",id:actual.endId},[-20,0],false);assert.equal(motion.kind,"orbit");near(arcIntervalError(curve,motion.point),0);near(motion.point[0],0);near(motion.point[1],20);assert.equal(result.sketch.solveState.degreesOfFreedom,1);}
  const locked=solve([curve,p],[...fixedArc(curve),...fixedLine(p),relation]);
  assert.equal(locked.ok,false);
  assert.equal(validateCommand({type:"add-sketch-constraint",sketchId:"s",constraint:relation}),true);
});

test("line-arc tangent requires contact on both the finite line and directed arc",()=>{
  const axis=line("line",[0,0],[100,0]),curve=arc("arc",[50,20],20,-Math.PI/2,0);
  const relation:SketchConstraint={id:"tangent",kind:"tangent-line",line:{geometryId:axis.id,segmentId:axis.segmentId},curveId:curve.id,side:1};
  const contact=lineArcContact([axis.start,axis.end],curve,1)!;
  assert.deepEqual(contact.point,[50,0]);near(contact.distanceError,0);near(contact.segmentError,0);near(contact.arcError,0);
  assert.ok(solve([axis,curve],[...fixedLine(axis),...fixedArc(curve),relation]).ok);
  const outside=arc("outside",[150,20],20,-Math.PI/2,0);
  assert.equal(solve([axis,outside],[...fixedLine(axis),...fixedArc(outside),{...relation,curveId:outside.id}]).ok,false);
  const wrongBranch=arc("wrong",[50,20],20,0,Math.PI/2);
  assert.equal(solve([axis,wrongBranch],[...fixedLine(axis),...fixedArc(wrongBranch),{...relation,curveId:wrongBranch.id}]).ok,false);
});

test("arc-arc and arc-circle tangency use the actual shared contact",()=>{
  const a=arc("a",[0,0],20,-Math.PI/2,Math.PI/2),b=arc("b",[40,0],20,Math.PI/2,Math.PI*1.5);
  const relation:SketchConstraint={id:"tangent",kind:"tangent-circles",firstCurveId:a.id,secondCurveId:b.id,contact:"external"};
  const contact=curveCurveContact(a,b,"external")!;assert.deepEqual(contact.point,[20,0]);near(contact.firstError,0);near(contact.secondError,0);
  assert.ok(solve([a,b],[...fixedArc(a),...fixedArc(b),relation]).ok);
  const missed=arc("missed",[40,0],20,-Math.PI/2,Math.PI/2);
  assert.equal(solve([a,missed],[...fixedArc(a),...fixedArc(missed),{...relation,secondCurveId:missed.id}]).ok,false);
  const circle:SketchGeometry={id:"circle",kind:"circle",center:[40,0],radius:20,centerId:"circle:center",curveId:"circle:curve"};
  assert.ok(solve([a,circle],[...fixedArc(a),{id:"circle:center-fixed",kind:"fixed-point",point:{geometryId:circle.id,pointId:circle.centerId},value:circle.center},{id:"circle:radius",kind:"radius",geometryId:circle.id,value:20},{...relation,secondCurveId:circle.id}]).ok);
  const innerArc=arc("inner",[20,0],10,-Math.PI/2,Math.PI/2),outerArc=arc("outer",[0,0],30,-Math.PI/2,Math.PI/2);
  const internal:SketchConstraint={...relation,firstCurveId:"outer",secondCurveId:"inner",contact:"internal"};
  const inside=curveCurveContact(outerArc,innerArc,"internal")!;near(inside.distanceError,0);near(inside.firstError,0);near(inside.secondError,0);
  assert.ok(solve([outerArc,innerArc],[...fixedArc(outerArc),...fixedArc(innerArc),internal]).ok);
});

test("bounded arc relation saves as v17 and survives one transaction, Undo and Redo",async()=>{
  const curve=arc("arc",[0,0],20,0,Math.PI/2),p=line("p",[-10,0],[15,15]);
  for(const command of [{type:"create-sketch",id:"s",workPlane:"XY"},{type:"add-sketch-geometry",sketchId:"s",geometry:curve},{type:"add-sketch-geometry",sketchId:"s",geometry:p}] as const){const result=await dispatchCadCommand(command);assert.ok(result.ok,result.reason);}
  const before=documentState(),past=cadHistory.getPastLabels().length;
  const result=await dispatchCadCommand({type:"add-sketch-constraint",sketchId:"s",constraint:{id:"bounded",kind:"point-on-arc",point:{geometryId:"p",pointId:p.endId},curveId:"arc"}});
  assert.ok(result.ok,result.reason);assert.equal(cadHistory.getPastLabels().length,past+1);
  const saved=serializeDocument(cadDocument);assert.equal(JSON.parse(saved).version,17);
  assert.equal(deserializeDocument(saved).sketches!.s.constraints.at(-1)?.kind,"point-on-arc");
  const older=JSON.parse(saved);older.version=16;assert.throws(()=>deserializeDocument(JSON.stringify(older)),/version 17/);
  const after=documentState();assert.ok(undoDocument());assert.deepEqual(documentState(),before);
  assert.ok(redoDocument());assert.deepEqual(documentState(),after);
});

test("arc-circle contact follows a radius dimension and regenerates a live extrude",async()=>{
  const helper={...arc("helper",[0,0],20,-Math.PI/2,Math.PI/2),construction:true};
  const profile:SketchGeometry={id:"profile",kind:"circle",center:[30,0],radius:10,centerId:"profile:center",curveId:"profile:curve"};
  for(const command of [{type:"create-sketch",id:"s",workPlane:"XY"},{type:"add-sketch-geometry",sketchId:"s",geometry:helper},{type:"add-sketch-geometry",sketchId:"s",geometry:profile},{type:"add-sketch-constraint",sketchId:"s",constraint:{id:"origin",kind:"fixed-point",point:{geometryId:"helper",pointId:helper.centerId},value:[0,0]}},{type:"add-sketch-constraint",sketchId:"s",constraint:{id:"driver",kind:"radius",geometryId:"helper",value:20}},{type:"add-sketch-constraint",sketchId:"s",constraint:{id:"profile-radius",kind:"radius",geometryId:"profile",value:10}},{type:"add-sketch-constraint",sketchId:"s",constraint:{id:"contact",kind:"tangent-circles",firstCurveId:"helper",secondCurveId:"profile",contact:"external"}},{type:"create-extrude",id:"solid",profileObjectIds:["profile"],distance:8}] as const){const result=await dispatchCadCommand(command);assert.ok(result.ok,result.reason);}
  const before=structuredClone(cadDocument.features["feature-solid"].params.bounds),past=cadHistory.getPastLabels().length;
  const changed=await dispatchCadCommand({type:"set-sketch-dimension",sketchId:"s",constraintId:"driver",value:25});assert.ok(changed.ok,changed.reason);
  const a=cadDocument.sketches!.s.geometry.find(g=>g.id==="helper") as Arc,b=cadDocument.sketches!.s.geometry.find(g=>g.id==="profile") as Extract<SketchGeometry,{kind:"circle"}>;
  near(a.radius,25);const contact=curveCurveContact(a,b,"external")!;near(contact.distanceError,0);near(contact.firstError,0);assert.ok(Math.abs(Math.hypot(...b.center)-35)<1e-5);
  assert.notDeepEqual(cadDocument.features["feature-solid"].params.bounds,before);
  assert.equal(cadHistory.getPastLabels().length,past+1);assert.equal(JSON.parse(serializeDocument(cadDocument)).version,17);
  assert.ok(undoDocument());assert.deepEqual(cadDocument.features["feature-solid"].params.bounds,before);assert.ok(redoDocument());near((cadDocument.sketches!.s.geometry.find(g=>g.id==="helper") as Arc).radius,25);
});
