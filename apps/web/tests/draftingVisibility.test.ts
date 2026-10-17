import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { cadDocument } from "../src/state/cadDocument";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { cadHistory, undoDocument, redoDocument } from "../src/state/history";
import { documentState, resetTestDocument } from "./helpers/documentHarness";
import { collectExportAnnotations, collectExportDrawings } from "../src/export/exportModel";
import { encodeSvg } from "../src/export/svgWriter";
import { planPlot, renderPlotPdf } from "../src/plot/plotPlan";
import { encodeDxf } from "../src/interop/dxfWriter";
import { parseDxf } from "../src/interop/dxfParser";
import { createDrawingRenderObject } from "../src/viewport/drawingRenderer";
import { serializeDocument, deserializeDocument } from "@agent-webcad/cad-document";
import { DEFAULT_LAYER_STYLE } from "../src/precision/layerStyle";
import { selectAllIds, validSelection } from "../src/state/selection";

beforeEach(async()=>{
  resetTestDocument();
  await dispatchCadCommand({type:"create-layer",id:"graphics",name:"Graphics"});
  await dispatchCadCommand({type:"set-layer-style",layerId:"graphics",style:{color:"#204060",lineType:"center",lineWeight:.7}});
  await dispatchCadCommand({type:"create-drawing",id:"box",drawing:"rectangle",params:{workPlane:"XY",points:[[0,0,0],[100,0,0],[100,60,0],[0,60,0]]}});
  await dispatchCadCommand({type:"create-drafting",id:"hatch",layerId:"graphics",params:{kind:"hatch",workPlane:"XY",sourceObjectIds:["box"],spacing:10,angle:0}});
  await dispatchCadCommand({type:"create-drafting",id:"text",layerId:"graphics",params:{kind:"text",workPlane:"XY",point:[50,30,0],text:"도면 <A>&",height:8,angle:30,align:"center"}});
  await dispatchCadCommand({type:"create-dimension",id:"dim",layerId:"graphics",dimension:"linear",params:{kind:"linear",workPlane:"XY",points:[[0,0],[100,0]],offset:-15,orientation:"aligned"}});
  await dispatchCadCommand({type:"create-drawing",id:"guide",layerId:"graphics",drawing:"line",params:{workPlane:"XY",construction:true,points:[[0,80,0],[100,80,0]]}});
  cadHistory.clear();
});
test("visible drafting labels retain Unicode, angle, centre alignment and layer style in SVG",()=>{
  const annotation=collectExportAnnotations("XY"),label=annotation.texts.find(t=>t.objectId==="text")!;
  assert.equal(label.text,"도면 <A>&");assert.equal(label.size,8);assert.equal(label.angle,30);assert.equal(label.align,"center");assert.equal(label.color,"#204060");
  const svg=encodeSvg(collectExportDrawings("XY"),{texts:annotation.texts});
  assert.match(svg,/text-anchor="middle"/);assert.match(svg,/rotate\(-30 50 -30\)/);assert.match(svg,/도면 &lt;A&gt;&amp;/);
  assert.equal(collectExportAnnotations("XZ").texts.length,0);
});
test("hidden graphics are excluded from SVG/PDF/DXF; hatch source visibility stays independent",async()=>{
  await dispatchCadCommand({type:"set-object-visible",objectId:"box",visible:false});
  assert.ok(collectExportDrawings("XY").some(l=>l.objectId==="hatch"));
  await dispatchCadCommand({type:"set-layer-visible",layerId:"graphics",visible:false});
  assert.equal(collectExportDrawings("XY").length,0);assert.equal(collectExportAnnotations("XY").texts.length,0);assert.equal(planPlot("XY","A4","landscape","1:1"),null);assert.equal(encodeDxf(cadDocument).entities,0);
});
test("layer lock preserves graphics and output while rejecting edits without History",async()=>{
  const beforeLines=collectExportDrawings("XY"),beforeText=collectExportAnnotations("XY"),beforeDxf=encodeDxf(cadDocument).text;
  await dispatchCadCommand({type:"set-layer-locked",layerId:"graphics",locked:true});
  const locked=documentState(),history=cadHistory.getPastLabels().length;
  assert.equal((await dispatchCadCommand({type:"update-drafting",objectId:"text",params:{text:"changed"}})).ok,false);
  assert.deepEqual(documentState(),locked);assert.equal(cadHistory.getPastLabels().length,history);
  assert.deepEqual(collectExportDrawings("XY"),beforeLines);assert.deepEqual(collectExportAnnotations("XY"),beforeText);assert.equal(encodeDxf(cadDocument).text,beforeDxf);
});
test("dimension PDF and SVG retain layer colour, physical stroke weight and centre dash",()=>{
  const annotation=collectExportAnnotations("XY");assert.ok(annotation.lines.every(l=>l.color==="#204060"&&l.lineWeight===.7));assert.deepEqual(annotation.lines[0].dash,[6,1.5,1,1.5]);
  const plot=planPlot("XY","A4","landscape","1:2")!,label=plot.page.texts.find(t=>t.text!=="도면 <A>&"&&t.color==="#204060")!;
  assert.ok(label);assert.equal(label.sizeMm,2);
  // Unicode remains rasterized in browser; use only the vector/Latin labels to inspect PDF operators here.
  const pdf=new TextDecoder().decode(renderPlotPdf({...plot,page:{...plot.page,texts:plot.page.texts.filter(t=>!t.text.includes("도면"))}}));
  assert.ok(pdf.includes("1.984 w"));assert.ok(pdf.includes("[17.008 4.252 2.835 4.252] 0 d"));assert.ok(pdf.includes("0.125 0.251 0.376 RG"));
});
test("construction on a centre layer is dashed in viewport/SVG/DXF and never changes its layer",()=>{
  const style={...DEFAULT_LAYER_STYLE,lineType:"center" as const};
  const render=createDrawingRenderObject("guide",cadDocument.features["feature-guide"].params,undefined,style) as import("three/examples/jsm/lines/Line2.js").Line2;
  assert.equal(render.material.dashSize,3);assert.equal(render.material.dashed,true);assert.notEqual(render.material.customProgramCacheKey(),"cad-center-6-1.5-1-1.5");
  assert.deepEqual(collectExportDrawings("XY").find(l=>l.objectId==="guide")!.dash,[3,1.5]);
  const dxf=encodeDxf(cadDocument).text,entity=dxf.slice(dxf.indexOf("\nENTITIES\n"));assert.match(entity,/\nLINE\n[\s\S]*?\n6\nDASHED\n/);assert.equal(parseDxf(dxf).layerStyles.Graphics.lineType,"center");
  render.geometry.dispose();render.material.dispose();
});
test("visibility Undo/Redo and save/reload preserve source identity, hatch and text styles",async()=>{
  const before=documentState();await dispatchCadCommand({type:"set-object-visible",objectId:"text",visible:false});const hidden=documentState();assert.ok(!collectExportAnnotations("XY").texts.some(t=>t.objectId==="text"));
  assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),hidden);
  const reopened=deserializeDocument(serializeDocument(cadDocument));assert.deepEqual(collectExportDrawings("XY",reopened),collectExportDrawings("XY"));assert.deepEqual(collectExportAnnotations("XY",reopened),collectExportAnnotations("XY"));
});
test("canvas construction visibility filters selection and subobjects without changing output or document",()=>{
  const before=documentState(),lines=collectExportDrawings("XY");
  assert.ok(selectAllIds(cadDocument).includes("guide"));assert.ok(!selectAllIds(cadDocument,null,{constructionVisible:false}).includes("guide"));
  assert.deepEqual(validSelection({ids:["guide","hatch"],primaryId:"guide",subObjects:[{objectId:"guide",kind:"object",topologyId:"guide"}]},{constructionVisible:false}),{ids:["hatch"],primaryId:"hatch",subObjects:[]});
  assert.deepEqual(documentState(),before);assert.deepEqual(collectExportDrawings("XY"),lines);
});
