import assert from "node:assert/strict";
import {beforeEach,test} from "node:test";
import {deserializeDocument,serializeDocument,sketchCircularGeometry,type SketchGeometry} from "@agent-webcad/cad-document";
import type {CadCommand} from "@agent-webcad/cad-commands";
import {cadDocument} from "../../src/state/cadDocument";
import {dispatchCadCommand} from "../../src/state/dispatchCadCommand";
import {cadHistory,undoDocument,redoDocument} from "../../src/state/history";
import {sketchAnnotations,sketchEntityPath} from "../../src/precision/sketchAnnotations";
import {buildExtrudeMesh} from "../../src/cad/kernelGeometryService";
import {documentState,meshVolume,resetTestDocument} from "../helpers/documentHarness";
import {contourReferenceRequirements} from "../../src/features/drawing-editing/commands/contourReferences";
import {referencePortions} from "../../src/features/drawing-editing/ui/contourReferenceChoices";
import {exactDrawingContour} from "../../src/features/drawing-editing/geometry/contourEditing";
beforeEach(resetTestDocument);
const near=(a:number,b:number,t=1e-5)=>assert.ok(Math.abs(a-b)<t,`${a} ≈ ${b}`);
const feature=(id:string)=>Object.values(cadDocument.features).find(f=>f.output===id)!;
const entity=()=>cadDocument.sketches!.s.geometry.find(g=>g.id==="source")!;
async function apply(c:CadCommand){const r=await dispatchCadCommand(c);assert.ok(r.ok,r.reason);return r;}
async function setup(g:SketchGeometry){await apply({type:"create-sketch",id:"s",workPlane:"XY"});await apply({type:"add-sketch-geometry",sketchId:"s",geometry:g});}
const route=(id:string,slot:string,segmentIndex:number)=>({dependentId:`sketch-reference:${JSON.stringify(["s",id,slot])}`,sourceId:"source",resultIndices:[0],segmentIndex});
const poly=(bulge=0,closed=false):SketchGeometry=>({id:"source",kind:"polyline",vertices:[{id:"a",point:[-5,0]},{id:"b",point:[5,0]},...(closed?[{id:"c",point:[5,-5] as [number,number]},{id:"d",point:[-5,-5] as [number,number]}]:[])],segmentIds:closed?["ab","bc","cd","da"]:["ab"],closed,bulges:closed?[bulge,0,0,0]:[bulge]});

test("line/arc conversion changes the stored sketch and rendered curvature with stable IDs and Undo",async()=>{
 await setup(poly());const before=documentState(),h=cadHistory.getPastLabels().length;
 await apply({type:"edit-polyline",objectId:"source",operation:"to-arc",segmentId:"ab",bulge:Math.tan(3*Math.PI/8),referenceRoutes:[]});
 const g=entity();assert.equal(g.kind,"polyline");if(g.kind!=="polyline")return;
 assert.deepEqual(g.vertices.map(v=>v.id),["a","b"]);assert.deepEqual(g.segmentIds,["ab"]);
 const arc=sketchCircularGeometry(g,"ab")!;assert.equal(arc.kind,"arc");if(arc.kind==="arc")near(arc.endAngle-arc.startAngle,3*Math.PI/2);
 assert.ok(sketchEntityPath(g).length>2);assert.equal(exactDrawingContour(cadDocument.objects.source,feature("source")).segments[0].kind,"arc");
 assert.equal(cadHistory.getPastLabels().length,h+1);const after=documentState();assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),after);
 await apply({type:"edit-polyline",objectId:"source",operation:"to-line",segmentId:"ab",referenceRoutes:[]});assert.equal(sketchCircularGeometry(entity(),"ab"),null);assert.deepEqual(feature("source").params.points,[[-5,0,0],[5,0,0]]);
});

test("analytic arc split and merge preserve radius, dimension identity and selectable arc portions",async()=>{
 await setup({id:"source",kind:"arc",center:[0,0],radius:5,startAngle:Math.PI,endAngle:0,centerId:"center",startId:"a",endId:"b",curveId:"ab"});
 await apply({type:"add-sketch-constraint",sketchId:"s",constraint:{id:"R",kind:"radius",geometryId:"source",value:5}});
 const dimension=structuredClone(cadDocument.sketches!.s.dimensions);
 await apply({type:"edit-polyline",objectId:"source",operation:"insert",segmentId:"ab",point:[0,5,0],referenceRoutes:[route("R","geometryId",0)]});
 const g=entity();assert.equal(g.kind,"polyline");if(g.kind!=="polyline")return;
 assert.equal(g.vertices.length,3);assert.equal(g.vertices[0].id,"a");assert.equal(g.vertices[2].id,"b");for(const edge of g.segmentIds)near(sketchCircularGeometry(g,edge)!.radius,5);
 assert.deepEqual(cadDocument.sketches!.s.dimensions,dimension);assert.equal(sketchAnnotations(cadDocument.sketches!.s).find(a=>a.constraintId==="R")?.text,"R 5.00 mm");
 const req=contourReferenceRequirements(cadDocument,["source"]).find(r=>r.kind==="sketch")!;
 const path=exactDrawingContour(cadDocument.objects.source,feature("source"));assert.equal(referencePortions(req,path,true,true).length,2);
 await apply({type:"edit-polyline",objectId:"source",operation:"delete",controlId:g.vertices[1].id,referenceRoutes:[route("R","geometryId",0)]});near(sketchCircularGeometry(entity(),"ab")!.radius,5);
 assert.equal((entity() as Extract<SketchGeometry,{kind:"polyline"}>).vertices.length,2);
});

test("mixed closed profile radius driver changes curvature and regenerates the live solid",async()=>{
 const b=-(6-Math.sqrt(11))/5;await setup(poly(b,true));
 for(const v of (entity() as Extract<SketchGeometry,{kind:"polyline"}>).vertices)await apply({type:"add-sketch-constraint",sketchId:"s",constraint:{id:`fix:${v.id}`,kind:"fixed-point",point:{geometryId:"source",pointId:v.id},value:v.point}});
 await apply({type:"add-sketch-constraint",sketchId:"s",constraint:{id:"R",kind:"radius",geometryId:"source",segmentId:"ab",value:6}});
 await apply({type:"create-extrude",id:"solid",profileObjectIds:["source"],distance:10});
 const volume=(r:number)=>{const sweep=2*Math.asin(5/r);return (50+r*r/2*(sweep-Math.sin(sweep)))*10;};
 near(meshVolume(await buildExtrudeMesh(feature("solid").params,true)),volume(6),4);
 await apply({type:"set-sketch-dimension",sketchId:"s",constraintId:"R",value:7});near(sketchCircularGeometry(entity(),"ab")!.radius,7);
 near(meshVolume(await buildExtrudeMesh(feature("solid").params,true)),volume(7),4);
 (entity() as Extract<SketchGeometry,{kind:"polyline"}>).vertices.forEach((v,i)=>v.point.forEach((x,j)=>near(x,[[-5,0],[5,0],[5,-5],[-5,-5]][i][j])));
});

test("incompatible curve conversion and off-arc insertion reject without mutating history",async()=>{
 await setup(poly(-1));await apply({type:"add-sketch-constraint",sketchId:"s",constraint:{id:"R",kind:"radius",geometryId:"source",segmentId:"ab",value:5}});
 for(const command of [{type:"edit-polyline",objectId:"source",operation:"to-line",segmentId:"ab",referenceRoutes:[route("R","geometryId",0)]},{type:"edit-polyline",objectId:"source",operation:"insert",segmentId:"ab",point:[0,3,0],referenceRoutes:[route("R","geometryId",0)]}] as CadCommand[]){const before=documentState(),history=cadHistory.getPastLabels();const r=await dispatchCadCommand(command);assert.equal(r.ok,false);assert.deepEqual(documentState(),before);assert.deepEqual(cadHistory.getPastLabels(),history);}
});

test("mixed curves persist as v23 and reject downgrade and malformed bulges",async()=>{
 await setup(poly(-1));const saved=serializeDocument(cadDocument),file=JSON.parse(saved);assert.equal(file.version,23);assert.deepEqual(deserializeDocument(saved),cadDocument);
 file.version=22;assert.throws(()=>deserializeDocument(JSON.stringify(file)),/version 23/);file.version=23;file.document.sketches.s.geometry[0].bulges=[1,2];assert.throws(()=>deserializeDocument(JSON.stringify(file)));
});


test("a mixed path supports finite tangent contact on its stable arc edge",async()=>{
 await setup({id:"source",kind:"polyline",vertices:[{id:"a",point:[0,0]},{id:"b",point:[5,5]},{id:"c",point:[10,5]}],segmentIds:["arc","line"],closed:false,bulges:[Math.tan(Math.PI/8),0]});
 await apply({type:"add-sketch-geometry",sketchId:"s",geometry:{id:"axis",kind:"line",start:[-5,0],end:[5,0],startId:"x",endId:"y",segmentId:"axis"}});
 await apply({type:"add-sketch-constraint",sketchId:"s",constraint:{id:"T",kind:"tangent-line",curveId:"source",curveSegmentId:"arc",line:{geometryId:"axis",segmentId:"axis"},side:1}});
 const annotations=sketchAnnotations(cadDocument.sketches!.s);assert.ok(annotations.find(a=>a.constraintId==="T")!.points.length>=4);
 assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)),cadDocument);
});
