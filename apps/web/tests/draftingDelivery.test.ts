import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { cadDocument } from "../src/state/cadDocument";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { cadHistory, undoDocument, redoDocument } from "../src/state/history";
import { floorPlanGeometry, worldDraftingGeometry } from "../src/precision/draftingGeometry";
import { DEFAULT_LAYER_STYLE } from "../src/precision/layerStyle";
import { collectExportDrawings } from "../src/export/exportModel";
import { planPlot, renderPlotPdf } from "../src/plot/plotPlan";
import { encodeDxf } from "../src/interop/dxfWriter";
import { parseDxf } from "../src/interop/dxfParser";
import { planDxfImport } from "../src/interop/dxfImport";
import { serializeDocument, deserializeDocument } from "../../../packages/cad-document/src/serialization";
import { documentState, resetTestDocument } from "./helpers/documentHarness";
beforeEach(resetTestDocument);
const plan={kind:"floor-plan",workPlane:"XY",width:6000,depth:4000,wall:150,doorCenter:1500,doorWidth:900,windowCenter:4000,windowWidth:1200,text:"ROOM"};
const feature=(id:string)=>Object.values(cadDocument.features).find(f=>f.output===id)!;
const geometry=(id:string)=>worldDraftingGeometry(cadDocument,cadDocument.objects[id],feature(id));

test("layer appearance survives history, save, SVG/PDF and DXF without scale-dependent weights",async()=>{
  await dispatchCadCommand({type:"create-drafting",id:"room",params:plan});
  const before=documentState();cadHistory.clear();
  const style={color:"#123456",lineType:"center" as const,lineWeight:0.7};
  assert.ok((await dispatchCadCommand({type:"set-layer-style",layerId:"layer-default",style})).ok);
  assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)).layers["layer-default"].style,style);
  const lines=collectExportDrawings("XY");assert.equal(lines[0].color,style.color);assert.equal(lines[0].lineWeight,0.7);assert.deepEqual(lines[0].dash,[6,1.5,1,1.5]);
  const plotted=planPlot("XY","A4","landscape","1:50")!;
  assert.equal(plotted.ratio,0.02);assert.equal(plotted.page.polylines[0].lineWeight,0.7);
  assert.ok(Math.abs(plotted.page.polylines[0].points[1][0]-plotted.page.polylines[0].points[0][0]-3)<1e-6);
  const pdf=new TextDecoder().decode(renderPlotPdf(plotted));assert.ok(pdf.includes("1.984 w"));
  const dxf=parseDxf(encodeDxf(cadDocument).text);assert.deepEqual(dxf.layerStyles.Default,style);
  const changed=documentState();undoDocument();assert.deepEqual(documentState(),before);redoDocument();assert.deepEqual(documentState(),changed);
});
test("6000×4000 plan retains 150mm corner joints, moves opening and changes chained dimensions once",async()=>{
  assert.ok((await dispatchCadCommand({type:"create-drafting",id:"room",params:plan})).ok);
  const before=documentState();cadHistory.clear();
  const original=floorPlanGeometry(plan,DEFAULT_LAYER_STYLE),walls=original.lines.filter(line=>line.closed);
  const area=walls.reduce((sum,line)=>{const [a,b,c]=line.points;return sum+(b[0]-a[0])*(c[1]-b[1]);},0);
  assert.equal(area,2*150*4000+2*(6000-300)*150-(900+1200)*150);
  assert.ok((await dispatchCadCommand({type:"update-drafting",objectId:"room",params:{doorCenter:2000,windowCenter:4500}})).ok);
  const changed=geometry("room");assert.equal(changed.lines.filter(line=>line.closed).length,6);
  assert.ok(changed.lines.some(line=>line.points[0][0]===1550&&line.points[1][1]===1050));
  assert.ok(changed.texts.some(text=>text.text.replace(/,/g,"").includes("1550.00")));
  assert.equal(cadHistory.getPastLabels().length,1);const after=documentState();undoDocument();assert.deepEqual(documentState(),before);redoDocument();assert.deepEqual(documentState(),after);
  assert.equal((await dispatchCadCommand({type:"update-drafting",objectId:"room",params:{doorCenter:100}})).ok,false);assert.deepEqual(documentState(),after);
});
test("associative hatch excludes holes and chain follows original polyline spans",async()=>{
  await dispatchCadCommand({type:"create-drawing",id:"box",drawing:"rectangle",params:{workPlane:"XY",points:[[0,0,0],[100,0,0],[100,60,0],[0,60,0]]}});
  await dispatchCadCommand({type:"create-drawing",id:"hole",drawing:"circle",params:{workPlane:"XY",center:[50,30,0],radius:10}});
  assert.ok((await dispatchCadCommand({type:"create-drafting",id:"hatch",params:{kind:"hatch",workPlane:"XY",sourceObjectIds:["box","hole"],spacing:5,angle:0}})).ok);
  assert.ok(geometry("hatch").lines.filter(line=>line.points[0][1]===30).every(line=>line.points.every(p=>p[0]<=40||p[0]>=60)));
  await dispatchCadCommand({type:"create-drafting",id:"chain",params:{kind:"chain",workPlane:"XY",sourceObjectId:"box",points:[[0,0,0],[100,0,0],[100,60,0],[0,60,0]],orientation:"aligned",height:4,offset:10}});
  const before=documentState();cadHistory.clear();
  await dispatchCadCommand({type:"move-object",objectId:"box",translation:[10,0,0]});
  assert.equal((feature("chain").params.points as number[][])[0][0],10);
  const after=documentState();assert.equal(cadHistory.getPastLabels().length,1);undoDocument();assert.deepEqual(documentState(),before);redoDocument();assert.deepEqual(documentState(),after);
});
test("block definitions, rotated insertions and Unicode TEXT round-trip through DXF as one import",async()=>{
  await dispatchCadCommand({type:"create-drawing",id:"symbol",drawing:"line",params:{workPlane:"XY",points:[[10,0,0],[30,0,0]]}});
  await dispatchCadCommand({type:"create-drafting",id:"text",params:{kind:"text",workPlane:"XY",point:[10,5,0],text:"거실",height:175,angle:0}});
  assert.ok((await dispatchCadCommand({type:"define-block",id:"door",name:"Door",objectIds:["symbol","text"],base:[10,0,0]})).ok);
  assert.ok((await dispatchCadCommand({type:"insert-block",id:"instance",blockId:"door",position:[100,200,0],angle:90})).ok);
  const data=geometry("instance");assert.ok(Math.abs(data.lines[0].points[1][0]-100)<1e-6);assert.ok(Math.abs(data.lines[0].points[1][1]-220)<1e-6);assert.equal(data.texts[0].text,"거실");
  const dxf=encodeDxf(cadDocument,["instance"]);assert.equal(dxf.skipped,0);assert.equal(dxf.entities,1);
  const parsed=parseDxf(dxf.text);assert.equal(parsed.entities[0].kind,"insert");assert.equal(parsed.blocks.door.entities[1].kind,"text");
  resetTestDocument();const before=documentState(),imported=planDxfImport(dxf.text,new Map(),"delivery");assert.ok(imported.ok);if(!imported.ok)return;
  assert.ok((await dispatchCadCommand(imported.command)).ok);const after=documentState();
  const instance=Object.values(cadDocument.features).find(f=>f.params.kind==="block")!;
  assert.deepEqual(geometry(instance.output).lines[0].points.map(p=>p.map(v=>Math.round(v))),[[100,200,0],[100,220,0]]);
  assert.equal(geometry(instance.output).texts[0].text,"거실");assert.equal(cadHistory.getPastLabels().length,1);
  undoDocument();assert.deepEqual(documentState(),before);redoDocument();assert.deepEqual(documentState(),after);
  assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)).blocks,cadDocument.blocks);
});

test("component definition edits refresh every stable instance and survive save, Undo and Redo",async()=>{
  await dispatchCadCommand({type:"create-drawing",id:"source-a",drawing:"line",params:{workPlane:"XY",points:[[0,0,0],[50,0,0]]}});
  await dispatchCadCommand({type:"create-drawing",id:"source-b",drawing:"line",params:{workPlane:"XY",points:[[0,0,0],[80,0,0]]}});
  assert.ok((await dispatchCadCommand({type:"define-block",id:"marker",name:"Marker",objectIds:["source-a"],base:[0,0,0]})).ok);
  assert.ok((await dispatchCadCommand({type:"insert-block",id:"marker-left",blockId:"marker",position:[100,100,0]})).ok);
  assert.ok((await dispatchCadCommand({type:"insert-block",id:"marker-right",blockId:"marker",position:[250,100,0],angle:90})).ok);
  const before=documentState(),first=geometry("marker-left"),second=geometry("marker-right");
  assert.deepEqual(first.lines[0].points.map(p=>p.map(Math.round)),[[100,100,0],[150,100,0]]);
  assert.deepEqual(second.lines[0].points.map(p=>p.map(Math.round)),[[250,100,0],[250,150,0]]);
  cadHistory.clear();
  assert.ok((await dispatchCadCommand({type:"update-block",blockId:"marker",name:"Marker v2",objectIds:["source-b"],base:[0,0,0]})).ok);
  const after=documentState();
  assert.deepEqual(cadDocument.blocks?.marker.members.length,1);
  assert.deepEqual(geometry("marker-left").lines[0].points.map(p=>p.map(Math.round)),[[100,100,0],[180,100,0]]);
  assert.deepEqual(geometry("marker-right").lines[0].points.map(p=>p.map(Math.round)),[[250,100,0],[250,180,0]]);
  const persisted=deserializeDocument(serializeDocument(cadDocument));
  assert.deepEqual(persisted.blocks,cadDocument.blocks);
  assert.deepEqual(worldDraftingGeometry(persisted,persisted.objects["marker-left"],feature("marker-left")).lines[0].points,geometry("marker-left").lines[0].points);
  undoDocument();assert.deepEqual(documentState(),before);
  redoDocument();assert.deepEqual(documentState(),after);
  const cycleBefore=documentState(),history=cadHistory.getPastLabels();
  const cycle=await dispatchCadCommand({type:"update-block",blockId:"marker",objectIds:["marker-left"],base:[0,0,0]});
  assert.equal(cycle.ok,false);assert.deepEqual(documentState(),cycleBefore);assert.deepEqual(cadHistory.getPastLabels(),history);
});
test("nested component instances resolve recursively, persist, and reject cycles atomically",async()=>{
  await dispatchCadCommand({type:"create-drawing",id:"leaf-source",drawing:"line",params:{workPlane:"XY",points:[[0,0,0],[10,0,0]]}});
  assert.ok((await dispatchCadCommand({type:"define-block",id:"leaf",name:"Leaf",objectIds:["leaf-source"],base:[0,0,0]})).ok);
  assert.ok((await dispatchCadCommand({type:"insert-block",id:"leaf-instance",blockId:"leaf",position:[20,30,0]})).ok);
  assert.ok((await dispatchCadCommand({type:"define-block",id:"assembly",name:"Assembly",objectIds:["leaf-instance"],base:[20,30,0]})).ok);
  assert.ok((await dispatchCadCommand({type:"insert-block",id:"assembly-instance",blockId:"assembly",position:[100,200,0]})).ok);
  const beforeGeometry=geometry("assembly-instance");
  assert.deepEqual(beforeGeometry.lines[0].points.map(p=>p.map(Math.round)),[[100,200,0],[110,200,0]]);
  const persisted=deserializeDocument(serializeDocument(cadDocument));
  assert.deepEqual(persisted.blocks,cadDocument.blocks);
  assert.deepEqual(worldDraftingGeometry(persisted,persisted.objects["assembly-instance"],feature("assembly-instance")).lines[0].points,beforeGeometry.lines[0].points);
  const beforeFailure=documentState(),revision=cadDocument.revision,history=cadHistory.getPastLabels();
  const cycle=await dispatchCadCommand({type:"update-block",blockId:"leaf",objectIds:["assembly-instance"],base:[100,200,0]});
  assert.equal(cycle.ok,false);assert.equal(cadDocument.revision,revision);assert.deepEqual(documentState(),beforeFailure);assert.deepEqual(cadHistory.getPastLabels(),history);
});
test("locked layers prevent drafting creation, editing and appearance changes atomically",async()=>{
  await dispatchCadCommand({type:"create-drafting",id:"room",params:plan});await dispatchCadCommand({type:"set-layer-locked",layerId:"layer-default",locked:true});
  const before=documentState(),history=cadHistory.getPastLabels();
  for(const command of [
    {type:"create-drafting" as const,params:plan},
    {type:"update-drafting" as const,objectId:"room",params:{width:7000}},
    {type:"set-layer-style" as const,layerId:"layer-default",style:{...DEFAULT_LAYER_STYLE,lineWeight:0.5}},
  ])assert.equal((await dispatchCadCommand(command)).ok,false);
  assert.deepEqual(documentState(),before);assert.deepEqual(cadHistory.getPastLabels(),history);
});

test("a locked associative annotation rejects its source edit instead of silently changing the output",async()=>{
  await dispatchCadCommand({type:"create-drawing",id:"line",drawing:"line",params:{workPlane:"XY",points:[[0,0,0],[1000,0,0]]}});
  await dispatchCadCommand({type:"create-layer",id:"notes",name:"Notes"});
  await dispatchCadCommand({type:"create-drafting",id:"chain",layerId:"notes",params:{kind:"chain",workPlane:"XY",sourceObjectId:"line",points:[[0,0,0],[1000,0,0]],orientation:"horizontal",height:175,offset:300}});
  await dispatchCadCommand({type:"set-layer-locked",layerId:"notes",locked:true});
  const before=documentState(),revision=cadDocument.revision,history=cadHistory.getPastLabels();
  const result=await dispatchCadCommand({type:"move-object",objectId:"line",translation:[500,0,0]});
  assert.equal(result.ok,false);assert.match(result.reason!,/annotation layer is locked/);assert.deepEqual(documentState(),before);assert.equal(cadDocument.revision,revision);assert.deepEqual(cadHistory.getPastLabels(),history);
});
