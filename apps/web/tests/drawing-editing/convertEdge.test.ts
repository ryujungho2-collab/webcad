import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { deserializeDocument, serializeDocument } from "@agent-webcad/cad-document";
import type { CadCommand, ContourReferenceRoute } from "@agent-webcad/cad-commands";
import { cadDocument } from "../../src/state/cadDocument";
import { dispatchCadCommand } from "../../src/state/dispatchCadCommand";
import { previewCadCommand, applyCadPlan, discardCadPlan } from "../../src/state/documentPlans";
import { cadHistory, undoDocument, redoDocument } from "../../src/state/history";
import { assertConstructionEvaluation } from "../../src/precision/constructionGeometry";
import { exactDrawingContour, contourLength } from "../../src/features/drawing-editing/geometry/contourEditing";
import { resetTestDocument, documentState } from "../helpers/documentHarness";
import { newScene } from "../../src/state/sceneCommands";
beforeEach(resetTestDocument);
const feature = (id: string) => Object.values(cadDocument.features).find(f => f.output === id)!;
const topology = (id: string) => feature(id).params.topology as any;
const near = (a: number, b: number, tolerance = 1e-6) => assert.ok(Math.abs(a - b) <= tolerance, `${a} ≈ ${b}`);
async function apply(command: CadCommand) { const r = await dispatchCadCommand(command); assert.ok(r.ok, r.reason); return r; }
async function reject(command: CadCommand, reason: RegExp) {
  const before = JSON.stringify(cadDocument), h = cadHistory.getPastLabels();
  const r = await dispatchCadCommand(command);
  assert.equal(r.ok, false); assert.match(r.reason!, reason);
  assert.equal(JSON.stringify(cadDocument), before); assert.deepEqual(cadHistory.getPastLabels(), h);
}
const route = (dependentId: string, extra: Partial<ContourReferenceRoute> = {}): ContourReferenceRoute => ({ dependentId, sourceId: "source", resultIndices: [0], ...extra });
const convert = (routes: ContourReferenceRoute[] = [], extra: Record<string, unknown> = {}): CadCommand =>
  ({ type: "convert-contour-edge", objectId: "source", segmentIndex: 0, target: "arc", radius: 100, side: "left", referenceRoutes: routes, ...extra });
const lShape = () => apply({ type: "create-drawing", id: "source", drawing: "polyline", params: { workPlane: "XY", points: [[0, 0, 0], [100, 0, 0], [100, 60, 0]], bulges: [0, 0] } });
function roundtrip(before: ReturnType<typeof documentState>) {
  const after = documentState();
  assert.ok(undoDocument()); assert.deepEqual(documentState(), before);
  assert.ok(redoDocument()); assert.deepEqual(documentState(), after);
  const loaded = deserializeDocument(serializeDocument(cadDocument));
  assert.deepEqual(loaded, cadDocument); assertConstructionEvaluation(loaded);
}

test("line edge converts to an exact arc with fixed junctions and untouched neighbours", async () => {
  await lShape();
  const before = documentState();
  const r = await apply(convert());
  assert.equal(r.createdIds.length, 1);
  const path = exactDrawingContour(cadDocument.objects[r.createdIds[0]], feature(r.createdIds[0]));
  assert.equal(path.segments.length, 2);
  const [arc, line] = path.segments;
  assert.equal(arc.kind, "arc"); assert.equal(line.kind, "line");
  assert.deepEqual(arc.start, [0, 0, 0]); assert.deepEqual(arc.end, [100, 0, 0]);
  assert.deepEqual(line.start, [100, 0, 0]); assert.deepEqual(line.end, [100, 60, 0]);
  near(arc.radius!, 100); near(Math.abs(arc.sweep!), Math.PI / 3);
  near(contourLength(path), 100 * Math.PI / 3 + 60);
  const params = feature(r.createdIds[0]).params;
  near(Number(params.bulges[0]), Math.tan(-Math.PI / 12));
  assert.equal(params.bulges[1], 0);
  roundtrip(before);
});

test("arc edge straightens to its chord and a single line toggles both ways", async () => {
  await apply({ type: "create-drawing", id: "source", drawing: "polyline", params: { workPlane: "XY", points: [[0, 0, 0], [100, 0, 0], [100, 60, 0]], bulges: [Math.tan(Math.PI / 8), 0] } });
  const r = await apply({ type: "convert-contour-edge", objectId: "source", segmentIndex: 0, target: "line", referenceRoutes: [] });
  const path = exactDrawingContour(cadDocument.objects[r.createdIds[0]], feature(r.createdIds[0]));
  assert.ok(path.segments.every(s => s.kind === "line"));
  near(contourLength(path), 160);
  undoDocument();
  await apply({ type: "create-drawing", id: "single", drawing: "line", params: { workPlane: "XY", points: [[0, 0, 0], [40, 0, 0]] } });
  const arc = await apply({ type: "convert-contour-edge", objectId: "single", segmentIndex: 0, target: "arc", radius: 25, referenceRoutes: [] });
  assert.equal(feature(arc.createdIds[0]).params.kind, "arc");
  near(Number(feature(arc.createdIds[0]).params.radius), 25);
  const back = await apply({ type: "convert-contour-edge", objectId: arc.createdIds[0], segmentIndex: 0, target: "line", referenceRoutes: [] });
  assert.equal(feature(back.createdIds[0]).params.kind, "line");
  near(contourLength(exactDrawingContour(cadDocument.objects[back.createdIds[0]], feature(back.createdIds[0]))), 40);
});

test("impossible radius, same-kind, bad index and missing radius fail atomically", async () => {
  await lShape();
  await reject(convert([], { radius: 10 }), /smaller than half/);
  await reject({ type: "convert-contour-edge", objectId: "source", segmentIndex: 1, target: "line", referenceRoutes: [] }, /already straight/);
  await reject({ type: "convert-contour-edge", objectId: "source", segmentIndex: 9, target: "arc", radius: 100, referenceRoutes: [] }, /Choose edge/);
  await reject({ type: "convert-contour-edge", objectId: "source", segmentIndex: 0, target: "arc", referenceRoutes: [] }, /positive arc radius/);
  await reject({ type: "convert-contour-edge", objectId: "source", segmentIndex: 0, target: "arc", radius: -5, referenceRoutes: [] }, /positive arc radius/);
});

test("linear dimension reroutes from a curved edge to its endpoint span", async () => {
  await lShape();
  const segmentId = topology("source").segments[0].id;
  await apply({ type: "create-dimension", id: "D", dimension: "linear", params: { workPlane: "XY", points: [[0, 0], [100, 0]], sourceObjectId: "source", sourceSegmentId: segmentId, offset: 10 } });
  await reject(convert([route("D", { segmentIndex: 0 })]), /straight edge/);
  const before = documentState();
  const r = await apply(convert([route("D")]));
  assert.equal(feature("D").params.sourceObjectId, r.createdIds[0]);
  assert.ok(!("sourceSegmentId" in feature("D").params));
  roundtrip(before);
});

test("radius dimension follows the surviving arc after straightening the other edge", async () => {
  await apply({ type: "create-drawing", id: "source", drawing: "polyline", params: { workPlane: "XY", points: [[0, 0, 0], [100, 0, 0], [100, 100, 0]], bulges: [Math.tan(Math.PI / 8), Math.tan(Math.PI / 8)] } });
  await apply({ type: "create-dimension", id: "R", dimension: "radius", params: { workPlane: "XY", center: [100, 50], radius: 50, sourceObjectId: "source", sourceSegmentId: topology("source").segments[1].id, offset: 10 } });
  const keptRadius = Number(feature("R").params.radius);
  await reject({ type: "convert-contour-edge", objectId: "source", segmentIndex: 1, target: "line", referenceRoutes: [route("R", { segmentIndex: 1 })] }, /circular edge/);
  const r = await apply({ type: "convert-contour-edge", objectId: "source", segmentIndex: 0, target: "line", referenceRoutes: [route("R", { segmentIndex: 1 })] });
  assert.equal(feature("R").params.sourceObjectId, r.createdIds[0]);
  near(Number(feature("R").params.radius), keptRadius);
});

test("sketch, pattern and scene boundaries stay explicit", async () => {
  await apply({ type: "create-sketch", id: "S", workPlane: "XY" });
  await apply({ type: "add-sketch-geometry", sketchId: "S", geometry: { id: "source", kind: "line", start: [0, 0], end: [100, 0], startId: "a", endId: "b", segmentId: "edge" } });
  await reject({ type: "convert-contour-edge", objectId: "source", segmentIndex: 0, target: "arc", radius: 100 }, /belongs to a sketch/);
  resetTestDocument(); await lShape();
  await apply({ type: "create-pattern", id: "pattern", sourceObjectIds: ["source"], spec: { kind: "linear", workPlane: "XY", columns: 2, rows: 1, spacing: [20, 0] } });
  await reject(convert(), /standalone drawings/);
  resetTestDocument(); await lShape();
  await apply({ type: "create-artboard", id: "board", workPlane: "XY", origin: [0, 0], size: [200, 200] });
  await apply({ type: "upsert-scene", scene: newScene("board", ["source"]) });
  await reject(convert(), /scene relationship/);
});

test("stale reviewed conversion cannot commit after an intervening edit", async () => {
  await lShape();
  const planned = await previewCadCommand(convert([]));
  assert.ok(planned.result.ok);
  await apply({ type: "rename-object", objectId: "source", name: "Changed" });
  const before = documentState(), h = cadHistory.getPastLabels();
  const r = await applyCadPlan(planned.planId);
  assert.equal(r.ok, false); assert.deepEqual(documentState(), before); assert.deepEqual(cadHistory.getPastLabels(), h);
  discardCadPlan(planned.planId);
});
