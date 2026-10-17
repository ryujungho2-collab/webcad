import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { deserializeDocument, serializeDocument, type SketchGeometry, type CadPatternSpec } from "@agent-webcad/cad-document";
import type { CadCommand, ContourReferenceRoute } from "@agent-webcad/cad-commands";
import { cadDocument } from "../../src/state/cadDocument";
import { dispatchCadCommand } from "../../src/state/dispatchCadCommand";
import { previewCadCommand, applyCadPlan, discardCadPlan } from "../../src/state/documentPlans";
import { cadHistory, undoDocument, redoDocument } from "../../src/state/history";
import { contourReferenceRequirements } from "../../src/features/drawing-editing/commands/contourReferences";
import { exactDrawingContour, contourLength } from "../../src/features/drawing-editing/geometry/contourEditing";
import { assertConstructionEvaluation } from "../../src/precision/constructionGeometry";
import { sketchPoint, solveSketch } from "../../src/precision/sketchSolver";
import { buildExtrudeMesh } from "../../src/cad/kernelGeometryService";
import { resetTestDocument, restoreTestDocument, documentState, meshVolume } from "../helpers/documentHarness";
beforeEach(resetTestDocument);
const feature = (id: string) => Object.values(cadDocument.features).find(f => f.output === id)!;
const near = (a: number, b: number, tolerance = 1e-5) => assert.ok(Math.abs(a - b) <= tolerance, `${a} ≈ ${b}`);
async function apply(c: CadCommand) { const r = await dispatchCadCommand(c); assert.ok(r.ok, r.reason); return r; }
async function reject(c: CadCommand, reason: RegExp) { const before = JSON.stringify(cadDocument), history = cadHistory.getPastLabels(); const r = await dispatchCadCommand(c); assert.equal(r.ok, false); assert.match(r.reason!, reason); assert.equal(JSON.stringify(cadDocument), before); assert.deepEqual(cadHistory.getPastLabels(), history); }
const line = (id: string, a: number[], b: number[]) => apply({ type: "create-drawing", id, drawing: "line", params: { points: [a, b], workPlane: "XY" } });
const boundary = () => apply({ type: "create-drawing", id: "boundary", drawing: "polyline", params: { points: [[40,-20,0],[40,20,0],[60,20,0],[60,-20,0]], workPlane: "XY" } });
const trim = (routes: ContourReferenceRoute[] = []): CadCommand => ({ type: "trim-contour", objectId: "source", cutterIds: ["boundary"], pickPoint: [50,0,0], referenceRoutes: routes });
const routesFor = (ids: string[], choose: (r: ReturnType<typeof contourReferenceRequirements>[number]) => Partial<ContourReferenceRoute>) => contourReferenceRequirements(cadDocument, ids).map(r => ({ dependentId: r.dependentId, sourceId: r.sourceId, resultIndices: [0], ...choose(r) }));
function historyRoundtrip(before: ReturnType<typeof documentState>) { const after = documentState(); assert.ok(undoDocument()); assert.deepEqual(documentState(), before); assert.ok(redoDocument()); assert.deepEqual(documentState(), after); const loaded = deserializeDocument(serializeDocument(cadDocument)); assert.deepEqual(loaded, cadDocument); assertConstructionEvaluation(loaded); restoreTestDocument(loaded); }
async function sketch(entities: SketchGeometry[]) { await apply({ type: "create-sketch", id: "sketch", workPlane: "XY" }); for (const geometry of entities) await apply({ type: "add-sketch-geometry", sketchId: "sketch", geometry }); }
const sketchLine = (id: string, start: [number,number], end: [number,number]): SketchGeometry => ({ id, kind: "line", start, end, startId: `${id}:a`, endId: `${id}:b`, segmentId: `${id}:edge` });

test("midpoint → bisector → intersection reconnects to edge then endpoint span, persists and edits again", async () => {
  await line("source",[0,0,0],[100,0,0]); await boundary();
  await apply({type:"create-drawing",id:"O",drawing:"circle",params:{center:[50,0,0],radius:80,workPlane:"XY"}});
  await apply({type:"create-construction",id:"M",definition:{operation:"midpoint",segmentId:"source"},workPlane:"XY"});
  await apply({type:"create-construction",id:"L",definition:{operation:"perpendicular-bisector",segmentId:"source",midpointId:"M"},workPlane:"XY"});
  await apply({type:"create-construction",id:"P",definition:{operation:"intersection",firstId:"L",secondId:"O",branch:"positive"},workPlane:"XY"});
  const before = documentState(), p = await previewCadCommand(trim(routesFor(["source"],()=>({segmentIndex:0}))));
  assert.ok(p.result.ok,p.result.reason); assert.deepEqual(documentState(),before);
  const {createdIds:[a,b]} = await applyCadPlan(p.planId); discardCadPlan(p.planId);
  near((feature("M").params.points as number[][])[0][0],20); near((feature("P").params.points as number[][])[0][1],Math.sqrt(5500)); historyRoundtrip(before);
  const trimmed = documentState(); await apply({type:"join-drawings",objectIds:[a,b],id:"joined",bridges:[{fromId:a,fromEnd:"end",toId:b,toEnd:"start"}],referenceRoutes:routesFor([a,b],()=>({}))});
  near((feature("M").params.points as number[][])[0][0],50); near((feature("P").params.points as number[][])[0][1],80); assert.equal(feature("P").construction!.operation,"intersection");
  assert.equal(JSON.parse(serializeDocument(cadDocument)).version,6); historyRoundtrip(trimmed);
  const t = feature("joined").params.topology as any;
  await apply({type:"edit-drawing-control",objectId:"joined",controlId:t.controls[3].id,point:[120,0,0]}); near((feature("M").params.points as number[][])[0][0],60);
  const bad = JSON.parse(serializeDocument(cadDocument)); bad.version=5; assert.throws(()=>deserializeDocument(JSON.stringify(bad)),/version 6/);
});

test("a lost signed intersection branch rejects the entire Trim", async () => {
  await line("source",[0,0,0],[100,0,0]); await boundary(); await apply({type:"create-drawing",id:"O",drawing:"circle",params:{center:[50,0,0],radius:30,workPlane:"XY"}});
  await apply({type:"create-construction",id:"P",definition:{operation:"intersection",firstId:"source",secondId:"O",branch:"positive"},workPlane:"XY"});
  await reject(trim(routesFor(["source"],()=>({segmentIndex:0}))),/intersection.*positive/);
  await apply(trim(routesFor(["source"],()=>({resultIndices:[1],segmentIndex:0})))); near((feature("P").params.points as number[][])[0][0],80);
});

test("sketch split preserves constraint/dimension identities, anchors reviewed shape, then Join and driving edit", async () => {
  await sketch([sketchLine("source",[0,0],[100,0])]); await boundary();
  const first={geometryId:"source",pointId:"source:a"},second={geometryId:"source",pointId:"source:b"};
  for(const constraint of [{id:"h",kind:"horizontal",first,second},{id:"length",kind:"distance",first,second,value:100},{id:"fixed",kind:"fixed-point",point:first,value:[0,0]}] as const) await apply({type:"add-sketch-constraint",sketchId:"sketch",constraint:constraint as any});
  const dimensions=structuredClone(cadDocument.sketches!.sketch.dimensions), before=documentState();
  const routes=routesFor(["source"],r=>({resultIndices:[r.kind==="sketch"&&r.slot==="second"?1:0],pointIndex:r.kind==="sketch"&&r.slot==="second"?1:0}));
  await reject(trim(routes.map(r=>({...r,resultIndices:[0]}))),/conflict/i);
  const {createdIds:[a,b]}=await apply(trim(routes)); assert.equal(feature(a).params.sketchId,"sketch"); assert.deepEqual(cadDocument.sketches!.sketch.dimensions,dimensions); near(contourLength(exactDrawingContour(cadDocument.objects[a],feature(a))),40); historyRoundtrip(before);
  await apply({type:"join-drawings",objectIds:[a,b],id:"joined",bridges:[{fromId:a,fromEnd:"end",toId:b,toEnd:"start"}],referenceRoutes:routesFor([a,b],r=>({pointIndex:r.kind==="sketch"&&r.slot==="second"?3:0}))});
  assert.equal(cadDocument.sketches!.sketch.geometry.length,1); assert.deepEqual(cadDocument.sketches!.sketch.dimensions,dimensions);
  assert.ok(!cadDocument.sketches!.sketch.constraints.some(c=>c.id.startsWith("contour-target:")));
  await apply({type:"set-sketch-dimension",sketchId:"sketch",constraintId:"length",value:120}); const g=cadDocument.sketches!.sketch.geometry[0]; near(sketchPoint(g,"source:b")![0],120); assert.ok(solveSketch(cadDocument.sketches!.sketch).ok);
});

test("line angle becomes a stable internal polyline angle after Join and remains driving",async()=>{
  await sketch([sketchLine("a",[0,0],[40,0]),sketchLine("b",[40,0],[40,30])]);
  await apply({type:"add-sketch-constraint",sketchId:"sketch",constraint:{id:"angle",kind:"angle",firstLineId:"a",secondLineId:"b",value:Math.PI/2}});
  const dims=structuredClone(cadDocument.sketches!.sketch.dimensions),before=documentState();
  await apply({type:"join-drawings",objectIds:["a","b"],id:"joined",referenceRoutes:routesFor(["a","b"],r=>({segmentIndex:r.sourceId==="a"?0:1}))});
  const c=cadDocument.sketches!.sketch.constraints[0]; assert.ok(c.kind==="angle"); assert.equal(c.firstSegmentId,"a:edge"); assert.equal(c.secondSegmentId,"b:edge"); assert.deepEqual(cadDocument.sketches!.sketch.dimensions,dims); historyRoundtrip(before);
  await apply({type:"set-sketch-dimension",sketchId:"sketch",constraintId:"angle",value:Math.PI/3}); assert.ok(solveSketch(cadDocument.sketches!.sketch).ok);
});

test("sketch circle Trim yields an exact arc with the same radius dimension",async()=>{
  await sketch([{id:"source",kind:"circle",center:[0,0],radius:10,centerId:"center",curveId:"circle"}]); await line("boundary",[0,-20,0],[0,20,0]);
  await apply({type:"add-sketch-constraint",sketchId:"sketch",constraint:{id:"r",kind:"radius",geometryId:"source",value:10}}); const before=documentState();
  const r=await apply({type:"trim-contour",objectId:"source",cutterIds:["boundary"],pickPoint:[10,0,0],referenceRoutes:routesFor(["source"],()=>({}))}); const g=cadDocument.sketches!.sketch.geometry[0]; assert.equal(g.kind,"arc"); near(contourLength(exactDrawingContour(cadDocument.objects[r.createdIds[0]],feature(r.createdIds[0]))),Math.PI*10); historyRoundtrip(before);
  await apply({type:"set-sketch-dimension",sketchId:"sketch",constraintId:"r",value:20}); near(Number(feature(r.createdIds[0]).params.radius),20);
});

test("two analytic sketch semicircles Join into a circle without flattening",async()=>{
  await sketch([0,1].map(i=>({id:`arc${i}`,kind:"arc",center:[0,0],radius:10,startAngle:i*Math.PI,endAngle:(i+1)*Math.PI,centerId:`c${i}`,startId:`s${i}`,endId:`e${i}`,curveId:`curve${i}`})));
  await apply({type:"join-drawings",objectIds:["arc0","arc1"],id:"circle",referenceRoutes:[]}); assert.equal(cadDocument.sketches!.sketch.geometry[0].kind,"circle"); near(Number(feature("circle").params.radius),10);
});

for(const spec of [{kind:"linear",workPlane:"XY",columns:3,rows:1,spacing:[150,0]},{kind:"radial",workPlane:"XY",count:3,angle:90,center:[0,0]},{kind:"mirror",workPlane:"XY",axisStart:[0,0],axisEnd:[0,10]}] as CadPatternSpec[]) test(`${spec.kind} → nested pattern → child references retain instance IDs through Trim/Join`,async()=>{
  await line("source",[0,0,0],[100,0,0]); await boundary();
  const root=await apply({type:"create-pattern",id:"pattern",sourceObjectIds:["source"],spec}); const parent=root.createdIds[0];
  const nested=await apply({type:"create-pattern",id:"nested",sourceObjectIds:[parent],spec:{kind:"linear",workPlane:"XY",columns:1,rows:2,spacing:[0,150]}}); const child=nested.createdIds[0];
  await apply({type:"create-dimension",id:"dim",dimension:"linear",params:{sourceObjectId:child,workPlane:"XY",points:[[0,0],[100,0]],offset:10}});
  await apply({type:"create-construction",id:"M",workPlane:"XY",definition:{operation:"midpoint",segmentId:child}});
  const ids=Object.values(cadDocument.features).filter(f=>f.pattern).map(f=>f.output),before=documentState();
  const routes=routesFor(["source"],r=>r.kind==="pattern"?{}:{segmentIndex:0});
  await reject(trim(routes.filter(r=>r.dependentId!=="dim")),/Reconnect/);
  const {createdIds:[a,b]}=await apply(trim(routes)); assert.deepEqual(Object.values(cadDocument.features).filter(f=>f.pattern).map(f=>f.output),ids); const points=feature("dim").params.points as number[][]; near(Math.hypot(points[1][0]-points[0][0],points[1][1]-points[0][1]),40); assert.equal(feature("dim").params.sourceObjectId,child); historyRoundtrip(before);
  await apply({type:"join-drawings",objectIds:[a,b],id:"joined",bridges:[{fromId:a,fromEnd:"end",toId:b,toEnd:"start"}],referenceRoutes:routesFor([a,b],()=>({}))});
  const span=feature("dim").params.points as number[][]; near(Math.hypot(span[1][0]-span[0][0],span[1][1]-span[0][1]),100); assert.deepEqual(feature(parent).pattern!.sourceObjectIds,["joined"]); assertConstructionEvaluation(cadDocument);
});

test("closed constrained sketch → remap → projection → live extrusion → driving dimension edit",async()=>{
  await sketch([{id:"source",kind:"rectangle",origin:[0,0],width:100,height:60,cornerIds:["a","b","c","d"],edgeIds:["ab","bc","cd","da"]}]);
  await line("boundary",[40,70,0],[110,0,0]);
  await apply({type:"add-sketch-constraint",sketchId:"sketch",constraint:{id:"width",kind:"distance",first:{geometryId:"source",pointId:"a"},second:{geometryId:"source",pointId:"b"},value:100}});
  await apply({type:"create-extrude",id:"plate",profileObjectIds:["source"],distance:10}); const before=documentState();
  const command:CadCommand={type:"trim-contour",objectId:"source",cutterIds:["boundary"],pickPoint:[100,40,0],rejoin:true,referenceRoutes:routesFor(["source"],r=>r.kind==="sketch"?{pointIndex:r.slot==="first"?2:3}:{})};
  await apply(command); near(meshVolume(await buildExtrudeMesh(feature("plate").params)),47500,.05); historyRoundtrip(before);
  await apply({type:"set-sketch-dimension",sketchId:"sketch",constraintId:"width",value:120}); assert.ok(meshVolume(await buildExtrudeMesh(feature("plate").params))>47500); assert.ok(solveSketch(cadDocument.sketches!.sketch).ok);
});

test("mixed ownership and pattern/lock guards stay atomic while same-owner mixed curves join",async()=>{
  await sketch([sketchLine("source",[0,0],[100,0])]); await line("other",[100,0,0],[100,30,0]);
  await reject({type:"join-drawings",objectIds:["source","other"],referenceRoutes:[]},/Ownership/);
  await apply({type:"add-sketch-geometry",sketchId:"sketch",geometry:{id:"arc",kind:"arc",center:[100,10],radius:10,startAngle:-Math.PI/2,endAngle:0,centerId:"ac",startId:"as",endId:"ae",curveId:"curve"}});
  const beforeJoin=documentState();
  const joined=await apply({type:"join-drawings",id:"mixed",objectIds:["source","arc"],referenceRoutes:[]});
  assert.ok(joined.ok);const path=exactDrawingContour(cadDocument.objects.mixed,feature("mixed"));assert.deepEqual(path.segments.map(s=>s.kind),["line","arc"]);near(path.segments[1].radius!,10);historyRoundtrip(beforeJoin);
  resetTestDocument(); await line("source",[0,0,0],[100,0,0]); await line("other",[100,0,0],[100,30,0]); await boundary();
  const pattern=await apply({type:"create-pattern",id:"p",sourceObjectIds:["source","other"],spec:{kind:"linear",workPlane:"XY",columns:2,rows:1,spacing:[200,0]}});
  await reject({type:"join-drawings",objectIds:["source","other"],referenceRoutes:routesFor(["source","other"],()=>({}))},/merge instance identities/);
  const nested=await apply({type:"create-pattern",id:"nested",sourceObjectIds:[pattern.createdIds[0]],spec:{kind:"linear",workPlane:"XY",columns:1,rows:2,spacing:[0,100]}});
  const id=nested.createdIds[0]; cadDocument.layers.locked={id:"locked",name:"Locked",visible:true,locked:true,objectIds:[id]}; cadDocument.layers["layer-default"].objectIds=cadDocument.layers["layer-default"].objectIds.filter(x=>x!==id); cadDocument.objects[id].layerId="locked"; feature(id).pattern!.layerId="locked";
  await reject(trim(routesFor(["source"],()=>({}))),/locked|Unlock/);
});

test("one closed-profile transaction reconnects sketch, construction, nested pattern, dimension and both live extrusions",async()=>{
  await sketch([{id:"source",kind:"rectangle",origin:[0,0],width:100,height:60,cornerIds:["a","b","c","d"],edgeIds:["ab","bc","cd","da"]}]);
  await line("boundary",[40,70,0],[110,0,0]);
  await apply({type:"add-sketch-constraint",sketchId:"sketch",constraint:{id:"width",kind:"distance",first:{geometryId:"source",pointId:"a"},second:{geometryId:"source",pointId:"b"},value:100}});
  await apply({type:"create-construction",id:"M",workPlane:"XY",definition:{operation:"midpoint",segmentId:"source",elements:{segment:{topologyId:"ab"}}}});
  await apply({type:"create-construction",id:"L",workPlane:"XY",definition:{operation:"perpendicular-bisector",segmentId:"source",midpointId:"M",elements:{segment:{topologyId:"ab"}}}});
  await apply({type:"create-drawing",id:"O",drawing:"circle",params:{center:[50,0,0],radius:80,workPlane:"XY"}});
  await apply({type:"create-construction",id:"P",workPlane:"XY",definition:{operation:"intersection",firstId:"L",secondId:"O",branch:"positive"}});
  const parent=(await apply({type:"create-pattern",id:"array",sourceObjectIds:["source"],spec:{kind:"linear",workPlane:"XY",columns:2,rows:1,spacing:[200,0]}})).createdIds[0];
  const child=(await apply({type:"create-pattern",id:"nested",sourceObjectIds:[parent],spec:{kind:"linear",workPlane:"XY",columns:1,rows:2,spacing:[0,100]}})).createdIds[0];
  const edge=(feature(child).params.topology as any).segments[0].id;
  await apply({type:"create-dimension",id:"child-dim",dimension:"linear",params:{sourceObjectId:child,sourceSegmentId:edge,workPlane:"XY",points:[[200,100],[300,100]],offset:10}});
  for(const [id,source] of [["plate","source"],["child-plate",child]])await apply({type:"create-extrude",id,profileObjectIds:[source],distance:10});
  const before=documentState(),past=cadHistory.getPastLabels().length;
  const command:CadCommand={type:"trim-contour",objectId:"source",cutterIds:["boundary"],pickPoint:[100,40,0],rejoin:true,referenceRoutes:routesFor(["source"],r=>r.kind==="sketch"?{pointIndex:r.slot==="first"?2:3}:r.kind==="construction"||r.kind==="dimension"?{segmentIndex:2}:{})};
  const plan=await previewCadCommand(command);assert.ok(plan.result.ok,plan.result.reason);assert.deepEqual(documentState(),before);
  assert.ok((await applyCadPlan(plan.planId)).ok);discardCadPlan(plan.planId);assert.equal(cadHistory.getPastLabels().length,past+1);
  for(const id of ["plate","child-plate"])near(meshVolume(await buildExtrudeMesh(feature(id).params)),47500,.05);
  assert.equal(feature("child-dim").params.sourceObjectId,child);assertConstructionEvaluation(cadDocument);historyRoundtrip(before);
  assert.equal(JSON.parse(serializeDocument(cadDocument)).version,6);
  await apply({type:"set-sketch-dimension",sketchId:"sketch",constraintId:"width",value:120});
  for(const id of ["plate","child-plate"])assert.ok(meshVolume(await buildExtrudeMesh(feature(id).params))>47500);
  assertConstructionEvaluation(cadDocument);assert.ok(solveSketch(cadDocument.sketches!.sketch).ok);
});
