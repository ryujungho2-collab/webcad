import assert from "node:assert/strict";
import {beforeEach,test} from "node:test";
import type {CadCommand} from "@agent-webcad/cad-commands";
import {cadDocument} from "../src/state/cadDocument";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {resolveDimension} from "../src/precision/dimensionGeometry";
import {collectExportAnnotations} from "../src/export/exportModel";
import {planPlot,renderPlotPdf} from "../src/plot/plotPlan";
import {MM_TO_PT} from "../src/plot/pdfWriter";
import {cadHistory,undoDocument,redoDocument} from "../src/state/history";
import {serializeDocument,deserializeDocument} from "@agent-webcad/cad-document";
import {resetTestDocument,documentState} from "./helpers/documentHarness";
beforeEach(resetTestDocument);
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} vs ${b}`);
async function apply(c:CadCommand){const r=await dispatchCadCommand(c);assert.ok(r.ok,r.reason);}
async function dimension(){await apply({type:"create-dimension",id:"dim",dimension:"linear",params:{workPlane:"XY",points:[[0,0],[100,0]],offset:10,style:{textHeight:6,paperScale:2}}});}
test("explicit dimension text height and paper scale agree with SVG at 1:1",async()=>{
  await dimension();const before=documentState(),past=cadHistory.getPastLabels(),svg=collectExportAnnotations("XY"),plan=planPlot("XY","A4","landscape","1:1")!;assert.equal(svg.texts[0].size,12);assert.equal(plan.page.texts[0].sizeMm,12);assert.equal(plan.page.texts[0].text,svg.texts[0].text);assert.deepEqual(documentState(),before);assert.deepEqual(cadHistory.getPastLabels(),past);
});
test("1:10 scales annotation text, arrow linework and gap by the same ratio",async()=>{
  await dimension();const f=cadDocument.features["feature-dim"],resolved=resolveDimension(f.params)!,plan=planPlot("XY","A4","landscape","1:10")!;near(plan.page.texts[0].sizeMm,1.2);const [a,b]=resolved.segments[0],[pa,pb]=plan.page.polylines[0].points;near(Math.hypot(...b.map((v,i)=>v-a[i]))*.1,Math.hypot(pb[0]-pa[0],pb[1]-pa[1]));assert.equal(plan.page.texts.at(-1)!.sizeMm,5);
});
test("fit uses its effective ratio for annotation text without scaling the title",async()=>{
  await dimension();const plan=planPlot("XY","A4","landscape","fit")!;near(plan.page.texts[0].sizeMm,12*plan.ratio);assert.equal(plan.page.texts.at(-1)!.sizeMm,5);assert.ok(plan.fitsPaper);
});
test("legacy unstyled dimensions share their resolved default height with SVG and PDF",async()=>{
  await apply({type:"create-dimension",id:"dim",dimension:"linear",params:{workPlane:"XY",points:[[0,0],[100,0]],offset:10}});const resolved=resolveDimension(cadDocument.features["feature-dim"].params)!;assert.equal(resolved.textHeight,4);near(planPlot("XY","A4","landscape","1:1")!.page.texts[0].sizeMm,resolved.textHeight);
});
test("radial and diameter annotations retain styles, units and source measurement",async()=>{
  for(const kind of ["radius","diameter"] as const){await apply({type:"create-dimension",id:kind,dimension:kind,params:{workPlane:"XY",center:[0,0],radius:10,style:{textHeight:5,paperScale:3,lengthUnit:"cm",precision:1}}});}
  const plan=planPlot("XY","A4","landscape","1:2")!;assert.equal(plan.dimensions,2);for(const text of plan.page.texts.slice(0,-1))near(text.sizeMm,7.5);assert.ok(plan.page.texts.some(t=>t.text==="R 1.0 cm"));assert.ok(plan.page.texts.some(t=>t.text==="Ø 2.0 cm"));
});
test("PDF bytes contain the styled font size in points",async()=>{
  await dimension();const bytes=renderPlotPdf(planPlot("XY","A4","landscape","1:10")!),text=new TextDecoder("latin1").decode(bytes);assert.ok(text.startsWith("%PDF-1.4"));assert.ok(text.includes(`/F1 ${(1.2*MM_TO_PT).toFixed(3)} Tf`));
});
test("style Undo/Redo and CAD roundtrip preserve output size without changing geometry",async()=>{
  await dimension();const points=structuredClone(cadDocument.features["feature-dim"].params.points);await apply({type:"update-dimension",objectId:"dim",params:{style:{textHeight:7,paperScale:2}}});near(planPlot("XY","A4","landscape","1:1")!.page.texts[0].sizeMm,14);assert.ok(undoDocument());near(planPlot("XY","A4","landscape","1:1")!.page.texts[0].sizeMm,12);assert.ok(redoDocument());assert.deepEqual(cadDocument.features["feature-dim"].params.points,points);assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)),cadDocument);
});

test("angular, chain and plain text use the same model-to-paper sizing contract",async()=>{
  for(const [id,end] of [["a",[10,0,0]],["b",[0,10,0]]] as const)await apply({type:"create-drawing",id,drawing:"line",params:{workPlane:"XY",points:[[0,0,0],end]}});
  await apply({type:"create-dimension",id:"angle",dimension:"angular",params:{first:{objectId:"a",segmentId:(cadDocument.features["feature-a"].params.topology as {segments:{id:string}[]}).segments[0].id},second:{objectId:"b",segmentId:(cadDocument.features["feature-b"].params.topology as {segments:{id:string}[]}).segments[0].id},branch:{firstRay:1,secondRay:1,sweep:"ccw"},radius:10,style:{textHeight:6,paperScale:2}}});
  await apply({type:"create-drafting",id:"chain",params:{kind:"chain",workPlane:"XY",points:[[0,0,0],[10,0,0],[30,0,0]],orientation:"horizontal",offset:10,height:4,style:{textHeight:6,paperScale:2}}});
  await apply({type:"create-drafting",id:"text",params:{kind:"text",workPlane:"XY",point:[50,30,0],text:"Note",height:8,angle:30}});
  const svg=collectExportAnnotations("XY");
  for(const scale of ["1:1","1:10","fit"] as const){const plan=planPlot("XY","A4","landscape",scale)!;assert.equal(plan.dimensions,3);for(const label of plan.page.texts.slice(0,-1)){const source=svg.texts.find(t=>t.text===label.text)!;near(label.sizeMm,source.size*plan.ratio);}assert.equal(plan.page.texts.at(-1)!.sizeMm,5);}
});
