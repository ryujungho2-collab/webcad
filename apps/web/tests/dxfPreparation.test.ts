import test from "node:test";
import assert from "node:assert/strict";
import { deserializeDocument, serializeDocument } from "@agent-webcad/cad-document";
import { parseDxf } from "../src/interop/dxfParser";
import { planDxfImport, planParsedDxfImport } from "../src/interop/dxfImport";
import { prepareDxf, suggestFloorPlanLayers } from "../src/interop/dxfPreparation";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory, undoDocument, redoDocument } from "../src/state/history";
import { applyCadPlan, previewCadCommand, discardCadPlan } from "../src/state/documentPlans";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { getWorldDrawingGeometry } from "../src/precision/worldGeometry";
import { worldDraftingGeometry } from "../src/precision/draftingGeometry";
import { encodeDxf } from "../src/interop/dxfWriter";
import { documentState, resetTestDocument } from "./helpers/documentHarness";
import { floorPlanDxf } from "./helpers/floorPlanFixture";

test.beforeEach(resetTestDocument);
const settings = { includedLayers: ["A-WALL", "A-WINDOW"], usedOnly: true, reference: true, excludeText: true, originMm: [10000,20000,0] as [number,number,number] };
const feature = (id: string) => Object.values(cadDocument.features).find(f => f.output === id)!;
test("preparation prunes unused resources but retains complete block-only layers and source bytes", () => {
  const source = parseDxf(floorPlanDxf), before = JSON.stringify(source), { parsed, report } = prepareDxf(source, settings);
  assert.equal(JSON.stringify(source), before); assert.equal(parsed.entities.length,2);
  assert.deepEqual(Object.keys(parsed.blocks),["Window"]);
  assert.equal(parsed.blocks.Window.entities.length,2);
  assert.deepEqual(report.dependencyLayers,["Window-detail","Window-label"]);
  assert.equal(report.omittedBlocks,1); assert.equal(report.excludedEntities,2);
  assert.ok(!parsed.layers.includes("Unused"));
  assert.deepEqual(suggestFloorPlanLayers(source.layers),["A-WALL","A-WINDOW"]);
});
test("mm override replaces declared cm instead of multiplying it again; text and block bases scale once", () => {
  const source = parseDxf(floorPlanDxf), result = prepareDxf(source,{...settings,unit:"mm"}).parsed;
  assert.deepEqual(result.blocks.Window.base,[10,0,0]);
  const wall = result.entities[0]; assert.equal(wall.kind,"line");
  if(wall.kind==="line")assert.deepEqual(wall.points,[[1000,2000,0],[1400,2000,0]]);
  const label = result.blocks.Window.entities[1]; assert.equal(label.kind,"text");if(label.kind==="text")assert.equal(label.height,2);
});
test("unit override scales exact ellipse axes and spline poles, preserving knot/domain data", () => {
  const source = parseDxf(floorPlanDxf);
  source.entities = [
    {kind:"ellipse",layer:"A-WALL",center:[10,20,0],axisU:[30,0,0],axisV:[0,20,0],startParam:0,sweep:Math.PI*2},
    {kind:"spline",layer:"A-WALL",degree:2,controlPoints:[[0,0,0],[10,20,0],[30,0,0]],knots:[0,0,0,1,1,1],domain:[0,1]},
  ];
  const prepared = prepareDxf(source,{includedLayers:["A-WALL"],usedOnly:true,unit:"mm"}).parsed;
  const ellipse = prepared.entities[0], spline = prepared.entities[1];
  assert.equal(ellipse.kind,"ellipse"); if(ellipse.kind==="ellipse"){assert.deepEqual(ellipse.axisU,[3,0,0]);assert.deepEqual(ellipse.center,[1,2,0]);assert.equal(ellipse.sweep,Math.PI*2);}
  assert.equal(spline.kind,"spline"); if(spline.kind==="spline"){assert.deepEqual(spline.controlPoints,[[0,0,0],[1,2,0],[3,0,0]]);assert.deepEqual(spline.knots,[0,0,0,1,1,1]);assert.deepEqual(spline.domain,[0,1]);}
});
test("empty selection, invalid unit/base/layer refuse a plan rather than importing the old proposal", () => {
  for (const options of [{includedLayers:[]},{originMm:[NaN,0,0]},{includedLayers:["missing"]},{unit:"unsupported"}]) {
    assert.equal(planDxfImport(floorPlanDxf,new Map(),"bad",options as any).ok,false);
  }
});
test("review, locks, world origin, nested content, Undo/Redo and save/reopen share one atomic import", async () => {
  await dispatchCadCommand({type:"create-layer",id:"existing-wall",name:"A-WALL"});
  const before = documentState(), count = cadHistory.getPastLabels().length;
  const p = planDxfImport(floorPlanDxf,new Map([["A-WALL","existing-wall"]]),"prep",settings); assert.ok(p.ok);
  const review = await previewCadCommand(p.command); assert.ok(review.result.ok,review.result.reason);
  assert.deepEqual(documentState(),before); assert.ok((await applyCadPlan(review.planId)).ok); discardCadPlan(review.planId);
  assert.equal(cadDocument.layers["existing-wall"].locked,false); assert.deepEqual(cadDocument.layers["existing-wall"].objectIds,[]);
  const roots = cadDocument.rootObjects.filter(id=>cadDocument.objects[id].visible); assert.equal(roots.length,2);
  const wall = roots.find(id=>feature(id).type==="drawing")!;
  assert.deepEqual(getWorldDrawingGeometry(cadDocument.objects[wall],feature(wall)).points,[[0,0,0],[4000,0,0]]);
  const instance = roots.find(id=>id!==wall)!, geometry=worldDraftingGeometry(cadDocument,cadDocument.objects[instance],feature(instance));
  assert.deepEqual(geometry.lines[0].points,[[1000,0,0],[2000,0,0]]); assert.equal(geometry.texts[0].text,"W1");
  for(const id of roots) assert.equal(cadDocument.layers[cadDocument.objects[id].layerId].locked,true);
  const locked = await dispatchCadCommand({type:"move-object",objectId:wall,translation:[1,0,0]}); assert.equal(locked.ok,false);
  const after = documentState(); assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)),cadDocument);
  const exported=encodeDxf(cadDocument,roots);assert.equal(exported.skipped,0);assert.equal(parseDxf(exported.text).entities.length,2);
  assert.equal(cadHistory.getPastLabels().length,count+1);assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),after);
});
test("stale preparation never publishes imported layers or geometry", async () => {
  const plan=planDxfImport(floorPlanDxf,new Map(),"stale",settings); assert.ok(plan.ok);
  const review=await previewCadCommand(plan.command);await dispatchCadCommand({type:"create-layer",id:"newer",name:"Newer"});
  const before=documentState();assert.equal((await applyCadPlan(review.planId)).ok,false);assert.deepEqual(documentState(),before);discardCadPlan(review.planId);
});
test("origin offset follows actual OCS placement once, preserving signed-scale INSERT", async () => {
  const source=parseDxf(floorPlanDxf.replace('10\n1100\n20\n2000','10\n1100\n20\n2000\n41\n-2\n42\n3\n50\n30\n210\n0\n220\n1\n230\n0'));
  const plan=planParsedDxfImport(source,new Map(),"original",{...settings,reference:false,originMm:[0,0,0]});assert.ok(plan.ok);assert.ok((await dispatchCadCommand(plan.command)).ok);
  const a=cadDocument.rootObjects.filter(id=>cadDocument.objects[id].visible).find(id=>feature(id).type!=="drawing")!;
  const before=worldDraftingGeometry(cadDocument,cadDocument.objects[a],feature(a));
  resetTestDocument();const shifted=planParsedDxfImport(source,new Map(),"shift",settings);assert.ok(shifted.ok);assert.ok((await dispatchCadCommand(shifted.command)).ok);
  const b=cadDocument.rootObjects.filter(id=>cadDocument.objects[id].visible).find(id=>feature(id).type!=="drawing")!;
  const after=worldDraftingGeometry(cadDocument,cadDocument.objects[b],feature(b));
  before.lines[0].points.forEach((p,i)=>p.forEach((v,k)=>assert.ok(Math.abs(v-settings.originMm[k]-after.lines[0].points[i][k])<1e-6)));
});
