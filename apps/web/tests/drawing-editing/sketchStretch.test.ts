import assert from "node:assert/strict";
import {beforeEach,test} from "node:test";
import {serializeDocument,deserializeDocument,type SketchGeometry,type SketchConstraint} from "@agent-webcad/cad-document";
import type {CadCommand} from "@agent-webcad/cad-commands";
import {cadDocument} from "../../src/state/cadDocument";
import {dispatchCadCommand} from "../../src/state/dispatchCadCommand";
import {previewCadCommand,applyCadPlan,discardCadPlan,getCadPlanDrawingPaths} from "../../src/state/documentPlans";
import {cadHistory,undoDocument,redoDocument} from "../../src/state/history";
import {solveSketch,sketchPoint} from "../../src/precision/sketchSolver";
import {WORK_PLANES,planeToWorld,type Vec3} from "../../src/precision/workPlane";
import {documentState,resetTestDocument,meshVolume} from "../helpers/documentHarness";
import {buildExtrudeMesh} from "../../src/cad/kernelGeometryService";
beforeEach(resetTestDocument);
const feature=(id:string)=>Object.values(cadDocument.features).find(f=>f.output===id)!,ref=(geometryId:string,pointId:string)=>({geometryId,pointId});
const line=(id:string,start:[number,number],end:[number,number]):SketchGeometry=>({id,kind:"line",startId:id+":a",endId:id+":b",segmentId:id+":edge",start,end});
const entity=(id:string,sketchId="sketch")=>cadDocument.sketches![sketchId].geometry.find(g=>g.id===id)!;
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-4,`${a} ≈ ${b}`);
const stretch=(extra:Partial<Extract<CadCommand,{type:"stretch-drawings"}>>={}):CadCommand=>({type:"stretch-drawings",objectIds:["line"],workPlane:"XY",first:[99,-1,0],second:[101,1,0],delta:[20,0,0],...extra});
async function apply(c:CadCommand){const r=await dispatchCadCommand(c);assert.ok(r.ok,r.reason);return r;}
async function rejected(c:CadCommand,reason:RegExp){const before=documentState(),h=cadHistory.getPastLabels();const r=await dispatchCadCommand(c);assert.equal(r.ok,false);assert.match(r.reason!,reason);assert.deepEqual(documentState(),before);assert.deepEqual(cadHistory.getPastLabels(),h);return r;}
async function sketch(geometry:SketchGeometry[],constraints:SketchConstraint[]=[],workPlane:"XY"|"XZ"|"YZ"="XY",id="sketch"){await apply({type:"create-sketch",id,workPlane});for(const g of geometry)await apply({type:"add-sketch-geometry",sketchId:id,geometry:g});for(const constraint of constraints)await apply({type:"add-sketch-constraint",sketchId:id,constraint});}
const rectangle:SketchGeometry={id:"rect",kind:"rectangle",origin:[0,0],width:100,height:60,cornerIds:["a","b","c","d"],edgeIds:["ab","bc","cd","da"]};

test("Stretch pins the requested endpoint and solves coincident neighbors with stable topology and one reviewed Undo",async()=>{
 await sketch([line("line",[0,0],[100,0]),line("neighbor",[100,0],[160,0]),line("other",[200,0],[240,0])],[{id:"h",kind:"horizontal",first:ref("line","line:a"),second:ref("line","line:b")},{id:"joint",kind:"coincident",first:ref("line","line:b"),second:ref("neighbor","neighbor:a")}]);
 const before=documentState(),constraints=structuredClone(cadDocument.sketches!.sketch.constraints),other=structuredClone(entity("other")),topology=structuredClone(feature("line").params.topology),h=cadHistory.getPastLabels().length;
 const r=await previewCadCommand(stretch());assert.ok(r.result.ok,r.result.reason);assert.deepEqual(documentState(),before);near(getCadPlanDrawingPaths(r.planId,"line")!.after!.at(-1)![0],120);near(getCadPlanDrawingPaths(r.planId,"neighbor")!.after![0][0],120);assert.ok((await applyCadPlan(r.planId)).ok);discardCadPlan(r.planId);
 near(sketchPoint(entity("line"),"line:b")![0],120);near(sketchPoint(entity("neighbor"),"neighbor:a")![0],120);assert.deepEqual(entity("other"),other);assert.deepEqual(feature("line").params.topology,topology);assert.deepEqual(cadDocument.sketches!.sketch.constraints,constraints);assert.equal(cadHistory.getPastLabels().length,h+1);const after=documentState();assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),after);assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)),cadDocument);
});

test("Rectangle edge Stretch keeps IDs and rebuilds midpoint construction and extrusion from the solved profile",async()=>{
 await sketch([rectangle]);await apply({type:"create-construction",id:"mid",workPlane:"XY",definition:{operation:"midpoint",segmentId:"rect",elements:{segment:{topologyId:"bc"}}}});await apply({type:"create-extrude",id:"plate",profileObjectIds:["rect"],distance:10});const before=documentState(),topology=structuredClone(feature("rect").params.topology);
 await apply(stretch({objectIds:["rect"],first:[99,-1,0],second:[101,61,0]}));const r=entity("rect");assert.equal(r.kind,"rectangle");if(r.kind!=="rectangle")return;near(r.width,120);near(r.height,60);assert.deepEqual(feature("rect").params.topology,topology);near((feature("mid").params.points as Vec3[])[0][0],120);near(meshVolume(await buildExtrudeMesh(feature("plate").params,true)),72000);assert.ok(undoDocument());assert.deepEqual(documentState(),before);
});

test("Driving width conflict names preserved constraints, publishes nothing and recovers by stretching a free height",async()=>{
 await sketch([rectangle],[{id:"width",kind:"distance",first:ref("rect","a"),second:ref("rect","b"),value:100},{id:"anchor",kind:"fixed-point",point:ref("rect","a"),value:[0,0]}]);const constraints=structuredClone(cadDocument.sketches!.sketch.constraints);const r=await rejected(stretch({objectIds:["rect"],first:[99,-1,0],second:[101,61,0]}),/width|constraint/i);assert.equal(r.diagnostic?.kind,"sketch-conflict");assert.ok(r.diagnostic?.constraintIds.includes("width"));
 await apply(stretch({objectIds:["rect"],first:[-1,59,0],second:[101,61,0],delta:[0,10,0]}));assert.deepEqual(cadDocument.sketches!.sketch.constraints,constraints);near(sketchPoint(entity("rect"),"a")![0],0);near(sketchPoint(entity("rect"),"c")![1],70);await apply({type:"set-sketch-dimension",sketchId:"sketch",constraintId:"width",value:120});assert.ok(solveSketch(cadDocument.sketches!.sketch).ok);
});

test("Fixed-point conflict rejects mixed standalone and multiple sketch changes atomically",async()=>{
 await sketch([line("line",[0,0],[100,0])]);await sketch([line("locked",[0,0],[100,0])],[{id:"fixed",kind:"fixed-point",point:ref("locked","locked:b"),value:[100,0]}],"XY","second");await apply({type:"create-drawing",id:"free",drawing:"line",params:{workPlane:"XY",points:[[0,0,0],[100,0,0]]}});const r=await rejected(stretch({objectIds:["free","line","locked"]}),/fixed|constraint/i);assert.equal(r.diagnostic?.sketchId,"second");assert.ok(r.diagnostic?.constraintIds.includes("fixed"));
});

test("XY/XZ/YZ sketch Stretch uses sketch-local deltas and preserves an unselected independent vertex",async()=>{
 for(const workPlane of ["XY","XZ","YZ"] as const){resetTestDocument();await sketch([line("line",[0,0],[100,0])],[],workPlane);const p=(x:number,y:number)=>planeToWorld([x,y],WORK_PLANES[workPlane]);await apply(stretch({workPlane,first:p(99,-1),second:p(101,1),delta:p(20,5)}));const g=entity("line");near(sketchPoint(g,"line:a")![0],0);near(sketchPoint(g,"line:a")![1],0);near(sketchPoint(g,"line:b")![0],120);near(sketchPoint(g,"line:b")![1],5);}
});

test("Circle center and finite arc endpoint Stretch retain analytic identity and angular span",async()=>{
 await sketch([{id:"circle",kind:"circle",center:[0,0],radius:10,centerId:"center",curveId:"curve"},{id:"arc",kind:"arc",center:[50,0],radius:10,startAngle:0,endAngle:Math.PI/2,centerId:"ac",startId:"as",endId:"ae",curveId:"aCurve"}]);await apply(stretch({objectIds:["circle"],first:[-1,-1,0],second:[1,1,0],delta:[5,7,0]}));near(sketchPoint(entity("circle"),"center")![0],5);assert.equal((entity("circle") as {radius:number}).radius,10);
 await apply(stretch({objectIds:["arc"],first:[59,-1,0],second:[61,1,0],delta:[5,0,0]}));const arc=entity("arc");assert.equal(arc.kind,"arc");if(arc.kind!=="arc")return;near(sketchPoint(arc,"as")![0],65);near(sketchPoint(arc,"ae")![0],50);near(arc.endAngle-arc.startAngle,Math.PI/2);assert.equal(arc.curveId,"aCurve");
});

test("Partial rectangle shear, transformed projections, locked layers and empty areas reject clearly",async()=>{
 await sketch([rectangle]);await rejected(stretch({objectIds:["rect"],first:[99,59,0],second:[101,61,0]}),/break its rectangle/);cadDocument.objects.rect.transform={translation:[1,0,0],rotation:[0,0,0],scale:[1,1,1]};await rejected(stretch({objectIds:["rect"]}),/placement transform/);cadDocument.objects.rect.transform=undefined;await rejected(stretch({objectIds:["rect"],first:[200,200,0],second:[210,210,0]}),/No endpoints/);await apply({type:"set-layer-locked",layerId:"layer-default",locked:true});await rejected(stretch({objectIds:["rect"]}),/unlock|locked/);
});

test("Stale sketch Stretch review cannot publish temporary target pins or changed geometry",async()=>{
 await sketch([line("line",[0,0],[100,0])]);const r=await previewCadCommand(stretch());assert.ok(r.result.ok);await apply({type:"rename-object",objectId:"line",name:"Changed"});const before=documentState();assert.equal((await applyCadPlan(r.planId)).ok,false);assert.deepEqual(documentState(),before);assert.deepEqual(cadDocument.sketches!.sketch.constraints,[]);discardCadPlan(r.planId);
});

test("An unanchored driven rectangle follows the requested edge rigidly instead of changing its driving width",async()=>{
 await sketch([rectangle],[{id:"width",kind:"distance",first:ref("rect","a"),second:ref("rect","b"),value:100}]);await apply(stretch({objectIds:["rect"],first:[99,-1,0],second:[101,61,0]}));near(sketchPoint(entity("rect"),"a")![0],20);near(sketchPoint(entity("rect"),"b")![0],120);near((entity("rect") as {width:number}).width,100);assert.equal(cadDocument.sketches!.sketch.constraints.length,1);
});

test("A locked live solid rejects the whole Stretch before any publication",async()=>{
 await sketch([rectangle]);await apply({type:"create-layer",id:"solid",name:"Solid"});await apply({type:"create-extrude",id:"plate",profileObjectIds:["rect"],distance:10,layerId:"solid"});await apply({type:"set-layer-locked",layerId:"solid",locked:true});await rejected(stretch({objectIds:["rect"],first:[99,-1,0],second:[101,61,0]}),/locked/);
});
