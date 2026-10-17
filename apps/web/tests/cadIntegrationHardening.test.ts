import {buildExtrudeMesh} from "../src/cad/kernelGeometryService";
import assert from "node:assert/strict";
import {beforeEach,test} from "node:test";
import {DEFAULT_VECTOR_STYLE,sketchCircularGeometry,type SketchGeometry,type Sketch} from "@agent-webcad/cad-document";
import {cadDocument} from "../src/state/cadDocument";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {cadHistory,undoDocument,redoDocument} from "../src/state/history";
import {resetTestDocument,documentState,meshVolume} from "./helpers/documentHarness";
import {editSketchPointGeometry} from "../src/precision/sketchGripEditing";
import {controlSketchGrip} from "../src/precision/sketchGripMotion";
import {sketchGeometryToDrawingParams} from "../src/precision/sketchAdapter";
import {collectExportDrawings} from "../src/export/exportModel";
beforeEach(resetTestDocument);
const feature=(id:string)=>Object.values(cadDocument.features).find(f=>f.output===id)!;
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-5,`${a} ≈ ${b}`);
async function apply(c:Parameters<typeof dispatchCadCommand>[0]){const result=await dispatchCadCommand(c);assert.ok(result.ok,result.reason);return result;}
async function setup(g:SketchGeometry){await apply({type:"create-sketch",id:"s",workPlane:"XY"});await apply({type:"add-sketch-geometry",sketchId:"s",geometry:g});}
const line:SketchGeometry={id:"source",kind:"line",start:[0,0],end:[10,0],startId:"a",endId:"b",segmentId:"ab"};
const mixed:SketchGeometry={id:"source",kind:"polyline",vertices:[{id:"a",point:[0,0]},{id:"b",point:[10,0]}],segmentIds:["ab"],closed:false,bulges:[Math.tan(Math.PI/8)]};

test("sketch driving edits and contour replacement preserve appearance through export",async()=>{
 await setup(mixed);const style={...DEFAULT_VECTOR_STYLE,stroke:"#aabbcc",strokeWidth:1.4,opacity:.4};await apply({type:"set-vector-style",objectId:"source",style});
 await apply({type:"add-sketch-constraint",sketchId:"s",constraint:{id:"d",kind:"distance",first:{geometryId:"source",pointId:"a"},second:{geometryId:"source",pointId:"b"},value:10}});
 await apply({type:"set-sketch-dimension",sketchId:"s",constraintId:"d",value:12});assert.deepEqual(feature("source").params.vectorStyle,style);assert.equal(collectExportDrawings("XY")[0].color,style.stroke);
 await apply({type:"remove-sketch-constraint",sketchId:"s",constraintId:"d"});await apply({type:"edit-polyline",objectId:"source",operation:"to-line",segmentId:"ab",referenceRoutes:[]});assert.deepEqual(feature("source").params.vectorStyle,style);
 const copy=await apply({type:"duplicate-sketch-geometry",sketchId:"s",geometryIds:["source"],offset:[30,0]});assert.deepEqual(feature(copy.createdIds[0]).params.vectorStyle,style);
});

test("source projection carries only appearance while removing obsolete geometric fields",async()=>{
 await setup(line);const sketch=cadDocument.sketches!.s,style={...DEFAULT_VECTOR_STYLE,fill:"#123456"};const next=sketchGeometryToDrawingParams(sketch,line,{vectorStyle:style,center:[1,2,3],radius:10,construction:true});assert.deepEqual(next.vectorStyle,style);assert.equal(next.radius,undefined);assert.equal(next.construction,undefined);
});

test("CW and CCW arc endpoint grips preserve directed wrap and major sectors",()=>{
 for(const [start,end] of [[170,220],[220,170],[20,290],[290,20]]){
 const g:SketchGeometry={id:"arc",kind:"arc",center:[0,0],radius:10,startAngle:start*Math.PI/180,endAngle:end*Math.PI/180,centerId:"c",startId:"s",endId:"e",curveId:"curve"};
 for(const which of ["s","e"]){const angle=((which==="s"?start:end)+5)*Math.PI/180;const edited=editSketchPointGeometry(g,which,[10*Math.cos(angle),10*Math.sin(angle)]);assert.ok(edited?.kind==="arc");if(edited?.kind==="arc"){near(edited.endAngle-edited.startAngle,((end-start)+(which==="s"?-5:5))*Math.PI/180);near(edited.radius,10);}}
 }
});

test("mixed radius grip returns solver curvature instead of stale bulges",async()=>{
 await setup(mixed);const radius=sketchCircularGeometry(mixed,"ab")!.radius;await apply({type:"add-sketch-constraint",sketchId:"s",constraint:{id:"R",kind:"radius",geometryId:"source",segmentId:"ab",value:radius}});
 const sketch=cadDocument.sketches!.s,g=sketch.geometry[0],motion=controlSketchGrip(sketch,g,{kind:"control",id:"b"},[11,0],false);
 assert.equal(motion.unchanged,false);assert.ok(motion.geometry);near(sketchCircularGeometry(motion.geometry!,"ab")!.radius,radius);near(motion.point[0],11);
});

test("rigid sketch scale cannot evade a radius driver by changing the bulge",async()=>{
 await setup(mixed);await apply({type:"add-sketch-constraint",sketchId:"s",constraint:{id:"R",kind:"radius",geometryId:"source",segmentId:"ab",value:sketchCircularGeometry(mixed,"ab")!.radius}});
 const before=documentState(),history=cadHistory.getPastLabels();const r=await dispatchCadCommand({type:"transform-sketch-geometry",sketchId:"s",geometryIds:["source"],translation:[0,0],center:[0,0],angle:0,scale:1.1});assert.equal(r.ok,false);assert.deepEqual(documentState(),before);assert.deepEqual(cadHistory.getPastLabels(),history);
});

test("sketch Lengthen moves a coincident neighbor and preserves style, IDs and one Undo",async()=>{
 await setup(line);await apply({type:"add-sketch-geometry",sketchId:"s",geometry:{...line,id:"neighbor",start:[10,0],end:[10,10],startId:"n1",endId:"n2",segmentId:"n"}});
 await apply({type:"add-sketch-constraint",sketchId:"s",constraint:{id:"join",kind:"coincident",first:{geometryId:"source",pointId:"b"},second:{geometryId:"neighbor",pointId:"n1"}}});
 const style={...DEFAULT_VECTOR_STYLE,stroke:"#abcdef"};await apply({type:"set-vector-style",objectId:"source",style});const before=documentState(),h=cadHistory.getPastLabels().length;
 await apply({type:"lengthen-drawing",objectId:"source",endpoint:"end",mode:"total",value:15});const geometries=cadDocument.sketches!.s.geometry;assert.ok(geometries[0].kind==="line"&&geometries[1].kind==="line");if(geometries[0].kind==="line"&&geometries[1].kind==="line"){near(geometries[0].start[0],0);near(geometries[0].end[0],15);near(geometries[1].start[0],15);assert.equal(geometries[0].endId,"b");}assert.deepEqual(feature("source").params.vectorStyle,style);assert.equal(cadHistory.getPastLabels().length,h+1);const after=documentState();assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),after);
});

test("sketch Lengthen conflicts with a fixed length without changing the document",async()=>{
 await setup(line);await apply({type:"add-sketch-constraint",sketchId:"s",constraint:{id:"L",kind:"distance",first:{geometryId:"source",pointId:"a"},second:{geometryId:"source",pointId:"b"},value:10}});const before=documentState();const r=await dispatchCadCommand({type:"lengthen-drawing",objectId:"source",endpoint:"end",mode:"total",value:15});assert.equal(r.ok,false);assert.equal(r.diagnostic?.kind,"sketch-conflict");assert.deepEqual(documentState(),before);
});

test("sketch arc included-angle Lengthen retains radius, direction and stable topology",async()=>{
 await setup({id:"source",kind:"arc",center:[0,0],radius:10,startAngle:0,endAngle:-Math.PI/2,centerId:"c",startId:"a",endId:"b",curveId:"curve"});await apply({type:"lengthen-drawing",objectId:"source",endpoint:"end",mode:"angle",value:120});const g=cadDocument.sketches!.s.geometry[0];assert.ok(g.kind==="arc");if(g.kind==="arc"){near(g.radius,10);near(g.startAngle,0);near(g.endAngle,-2*Math.PI/3);assert.equal(g.curveId,"curve");}
});


test("Lengthen follows connected profile constraints and rebuilds the actual solid",async()=>{
 await setup(line);
 const edges:Extract<SketchGeometry,{kind:"line"}>[]=[{...line,id:"right",start:[10,0],end:[10,10],startId:"r0",endId:"r1",segmentId:"r"},{...line,id:"top",start:[10,10],end:[0,10],startId:"t0",endId:"t1",segmentId:"t"},{...line,id:"left",start:[0,10],end:[0,0],startId:"l0",endId:"l1",segmentId:"l"}];
 for(const geometry of edges)await apply({type:"add-sketch-geometry",sketchId:"s",geometry});
 const all=[line,...edges] as Extract<SketchGeometry,{kind:"line"}>[];
 for(let i=0;i<4;i++){const a=all[i],b=all[(i+1)%4];await apply({type:"add-sketch-constraint",sketchId:"s",constraint:{id:`join${i}`,kind:"coincident",first:{geometryId:a.id,pointId:a.endId},second:{geometryId:b.id,pointId:b.startId}}});await apply({type:"add-sketch-constraint",sketchId:"s",constraint:{id:`direction${i}`,kind:i%2?"vertical":"horizontal",first:{geometryId:a.id,pointId:a.startId},second:{geometryId:a.id,pointId:a.endId}}});}
 await apply({type:"create-extrude",id:"solid",profileObjectIds:all.map(g=>g.id),distance:3});
 near(meshVolume(await buildExtrudeMesh(feature("solid").params,true)),300);
 await apply({type:"lengthen-drawing",objectId:"source",endpoint:"end",mode:"total",value:15});
 near(meshVolume(await buildExtrudeMesh(feature("solid").params,true)),450);
});


test("equal-radius mixed arcs cannot masquerade as internal tangency",async()=>{
 await setup(mixed);await apply({type:"add-sketch-geometry",sketchId:"s",geometry:{...mixed,id:"other"}});const before=documentState();
 const result=await dispatchCadCommand({type:"add-sketch-constraint",sketchId:"s",constraint:{id:"internal",kind:"tangent-circles",firstCurveId:"source",firstCurveSegmentId:"ab",secondCurveId:"other",secondCurveSegmentId:"ab",contact:"internal"}});
 assert.equal(result.ok,false);assert.deepEqual(documentState(),before);
});
