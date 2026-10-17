import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import type { CadCommand } from "@agent-webcad/cad-commands";
import { DEFAULT_VECTOR_STYLE, serializeDocument, deserializeDocument } from "@agent-webcad/cad-document";
import { cadDocument } from "../../src/state/cadDocument";
import { dispatchCadCommand } from "../../src/state/dispatchCadCommand";
import { previewCadCommand, applyCadPlan, discardCadPlan } from "../../src/state/documentPlans";
import { cadHistory, undoDocument, redoDocument } from "../../src/state/history";
import { exactDrawingContour, segmentPoint } from "../../src/features/drawing-editing/geometry/contourEditing";
import { curveCornerSolutions } from "../../src/features/drawing-editing/geometry/arcCorners";
import { WORK_PLANES, planeToWorld, type Vec3 } from "../../src/precision/workPlane";
import { drawingModelToWorld } from "../../src/precision/worldGeometry";
import { encodeDxf } from "../../src/interop/dxfWriter";
import { parseDxf } from "../../src/interop/dxfParser";
import { collectArtboardExportItems } from "../../src/export/exportModel";
import { documentState, resetTestDocument } from "../helpers/documentHarness";
beforeEach(resetTestDocument);
const feature = (id: string) => Object.values(cadDocument.features).find(f => f.output === id)!;
const entry = (id: string) => ({ object: cadDocument.objects[id], feature: feature(id) });
const path = (id: string) => exactDrawingContour(entry(id).object, feature(id));
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≈ ${b}`);
const point = (a: Vec3, b: Vec3) => a.forEach((v, i) => near(v, b[i]));
async function apply(c: CadCommand) { const r = await dispatchCadCommand(c); assert.ok(r.ok, r.reason); return r; }
async function setup(plane: "XY" | "XZ" | "YZ" = "XY", reverse = false, mixed = false) {
  const p = (x: number, y: number) => planeToWorld([x, y], WORK_PLANES[plane]).map((n, i) => n + 7 * WORK_PLANES[plane].normal[i]) as Vec3;
  await apply({ type: "create-drawing", id: "line", drawing: mixed ? "polyline" : "line", params: { workPlane: plane, points: mixed ? [p(0, 0), p(30, 0), p(35, 5)] : [p(0, 0), p(30, 0)], closed: false } });
  await apply({ type: "create-drawing", id: "arc", drawing: mixed ? "polyline" : "arc", params: mixed ? { workPlane: plane, closed: false, points: [p(0, -10), p(0, 10), p(0, 20)], bulges: [1, 0], vectorStyle: { ...DEFAULT_VECTOR_STYLE, opacity: .4 } } : { workPlane: plane, center: p(0, 0), radius: 10, startAngle: reverse ? Math.PI / 2 : -Math.PI / 2, endAngle: reverse ? -Math.PI / 2 : Math.PI / 2 } });
  return p;
}
function command(reverse = false, swap = false): Extract<CadCommand, { type: "connect-drawings" }> {
  const lp = segmentPoint(path("line").segments[0], .7, path("line").workPlane), ap = segmentPoint(path("arc").segments[0], reverse ? .3 : .7, path("arc").workPlane);
  return { type: "connect-drawings", firstId: swap ? "arc" : "line", secondId: swap ? "line" : "arc", firstPoint: swap ? ap : lp, secondPoint: swap ? lp : ap, treatment: "chamfer", distance: swap ? 3 : 2, secondDistance: swap ? 2 : 3, id: "connector" };
}
test("line–arc D1/D2 use independent line and arc lengths with detached review and one Undo", async () => {
  const p = await setup(), c = command(), before = documentState(), h = cadHistory.getPastLabels().length, topology = structuredClone([feature("line").params.topology, feature("arc").params.topology]);
  const review = await previewCadCommand(c); assert.ok(review.result.ok, review.result.reason); assert.deepEqual(documentState(), before);
  assert.ok((await applyCadPlan(review.planId)).ok); discardCadPlan(review.planId);
  const edge = path("connector").segments[0]; point(edge.start, p(12, 0)); point(edge.end, p(10 * Math.cos(.3), 10 * Math.sin(.3)));
  point(path("line").segments[0].start, edge.start); point(path("arc").segments[0].start, edge.end);
  near((Math.PI / 2 - path("arc").segments[0].sweep!) * 10, 3);
  assert.deepEqual([feature("line").params.topology, feature("arc").params.topology], topology); assert.equal(cadHistory.getPastLabels().length, h + 1);
  const after = documentState(); assert.ok(undoDocument()); assert.deepEqual(documentState(), before); assert.ok(redoDocument()); assert.deepEqual(documentState(), after);
  assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)), cadDocument);
});
test("Chamfer preserves source order, clockwise sweep and elevated XY/XZ/YZ frames", async () => {
  for (const plane of ["XY", "XZ", "YZ"] as const) for (const reverse of [false, true]) for (const swap of [false, true]) {
    resetTestDocument(); const p = await setup(plane, reverse); await apply(command(reverse, swap)); const edge = path("connector").segments[0];
    point(swap ? edge.end : edge.start, p(12, 0)); point(swap ? edge.start : edge.end, p(10 * Math.cos(.3), 10 * Math.sin(.3)));
    assert.equal(Math.sign(path("arc").segments[0].sweep!), reverse ? -1 : 1);
  }
});
test("mixed first arc and straight end preserve shared vertices, unrelated edges, appearance and IDs", async () => {
  const p = await setup("XY", false, true), original = structuredClone(feature("arc").params), lineOriginal = structuredClone(feature("line").params);
  await apply(command()); point(path("arc").segments[0].start, p(10 * Math.cos(.3), 10 * Math.sin(.3)));
  point(path("arc").segments[0].end, p(0, 10)); point(path("arc").segments[1].end, p(0, 20)); point(path("line").segments[1].start, p(30, 0));
  near((feature("arc").params.bulges as number[])[0], Math.tan((Math.PI / 2 - .3) / 4));
  assert.deepEqual(feature("arc").params.topology, original.topology); assert.deepEqual(feature("line").params.topology, lineOriginal.topology); assert.deepEqual(feature("arc").params.vectorStyle, original.vectorStyle);
});
test("mixed last arc and reversed clockwise first arc retain their adjacent straight edge", async () => {
  await setup(); await apply({ type: "create-drawing", id: "mixed", drawing: "polyline", params: { workPlane: "XY", points: [[0, -20, 7], [0, -10, 7], [0, 10, 7]], bulges: [0, 1], closed: false } });
  const c = command(); await apply({ ...c, secondId: "mixed", secondPoint: segmentPoint(path("mixed").segments[1], .3, "XY") });
  point(path("mixed").segments[0].start, [0, -20, 7]); point(path("mixed").segments[1].start, [0, -10, 7]); point(path("mixed").segments[1].end, [10 * Math.cos(.3), -10 * Math.sin(.3), 7]);
  // Reverse the whole source; its first edge now has a negative model bulge.
  resetTestDocument(); await setup(); await apply({ type: "create-drawing", id: "mixed", drawing: "polyline", params: { workPlane: "XY", points: [[0, 10, 7], [0, -10, 7], [0, -20, 7]], bulges: [-1, 0], closed: false } });
  await apply({ ...command(), secondId: "mixed", secondPoint: segmentPoint(path("mixed").segments[0], .7, "XY") });
  assert.ok((feature("mixed").params.bulges as number[])[0] < 0); point(path("mixed").segments[0].end, [0, -10, 7]);
});
test("mixed arc free ends also connect by exact Fillet without changing neighboring geometry", async () => {
  await setup("XY", false, true); const c = command(); await apply({ ...c, treatment: "fillet", secondDistance: undefined });
  const s = path("connector").segments[0]; near(s.radius!, 2); point(s.center!, [Math.sqrt(140), 2, 7]);
  point(path("arc").segments[0].end, [0, 10, 7]); point(path("arc").segments[1].end, [0, 20, 7]);
});
test("mixed arc–arc Chamfer and Fillet preserve both neighboring straight edges", async () => {
  for (const treatment of ["chamfer", "fillet"] as const) {
    resetTestDocument(); const bulge = Math.tan(Math.PI / 8);
    await apply({ type: "create-drawing", id: "a", drawing: "polyline", params: { workPlane: "XY", points: [[-20, 10, 0], [-10, 10, 0], [0, 0, 0]], bulges: [0, bulge], closed: false } });
    await apply({ type: "create-drawing", id: "b", drawing: "polyline", params: { workPlane: "XY", points: [[0, 0, 0], [-10, 10, 0], [-20, 10, 0]], bulges: [bulge, 0], closed: false } });
    const firstPoint = segmentPoint(path("a").segments[1], .35, "XY"), secondPoint = segmentPoint(path("b").segments[0], .35, "XY");
    const ss = curveCornerSolutions(entry("a"), entry("b"), firstPoint, secondPoint, treatment, 2, 3), solutionIndex = ss.findIndex(s => (s.center ?? s.corner)[0] > -5); assert.ok(solutionIndex >= 0);
    await apply({ type: "connect-drawings", firstId: "a", secondId: "b", firstPoint, secondPoint, treatment, distance: 2, ...(treatment === "chamfer" ? { secondDistance: 3 } : {}), solutionIndex, id: "connector" });
    point(path("a").segments[0].start, [-20, 10, 0]); point(path("a").segments[0].end, [-10, 10, 0]); point(path("b").segments[1].end, [-20, 10, 0]);
    const s = path("connector").segments[0]; point(path("a").segments[1].end, s.start); point(path("b").segments[0].start, s.end);
  }
});
test("reflected and scaled mixed sources preserve exact world distances and model bulge sign", async () => {
  for (const reflect of [false, true]) {
    resetTestDocument(); await setup("XY", false, true); const angle = .4, k = reflect ? -2 : 2;
    const map = (p: Vec3): Vec3 => [100 + k * p[0] * Math.cos(angle) - 2 * p[1] * Math.sin(angle), 200 + k * p[0] * Math.sin(angle) + 2 * p[1] * Math.cos(angle), p[2]];
    for (const id of ["line", "arc"]) { const o = cadDocument.objects[id]; o.transform = { translation: [0, 0, 0], rotation: [0, 0, angle * 180 / Math.PI], scale: [k, 2, 1] }; const origin = drawingModelToWorld(o, feature(id), [0, 0, 0])!; o.transform.translation = [100 - origin[0], 200 - origin[1], -origin[2]]; }
    await apply({ ...command(), distance: 4, secondDistance: 6 }); const s = path("connector").segments[0]; point(s.start, map([12, 0, 7])); point(s.end, map([10 * Math.cos(.3), 10 * Math.sin(.3), 7])); near((feature("arc").params.bulges as number[])[0], Math.tan((Math.PI / 2 - .3) / 4));
  }
});
test("multiple bounded intersections require explicit solution selection", async () => {
  await apply({ type: "create-drawing", id: "line", drawing: "line", params: { workPlane: "XY", points: [[-20, 0, 0], [20, 0, 0]] } });
  await apply({ type: "create-drawing", id: "arc", drawing: "arc", params: { workPlane: "XY", center: [0, 0, 0], radius: 10, startAngle: -.2, endAngle: 3.5 } });
  const c = { ...command(), firstPoint: [19, 0, 0] as Vec3, secondPoint: segmentPoint(path("arc").segments[0], .95, "XY"), distance: 1, secondDistance: 1 };
  const solutions = curveCornerSolutions(entry("line"), entry("arc"), c.firstPoint, c.secondPoint, "chamfer", 1, 1); assert.equal(solutions.length, 2);
  const before = documentState(); const r = await dispatchCadCommand(c); assert.equal(r.ok, false); assert.match(r.reason!, /Multiple/); assert.deepEqual(documentState(), before); await apply({ ...c, solutionIndex: 1 });
});
test("dimensions regenerate in the same reviewed plan; locked dependents and stale plans publish nothing", async () => {
  await setup(); await apply({ type: "create-dimension", id: "dim", dimension: "linear", params: { sourceObjectId: "line", points: [[0, 0], [30, 0]] } });
  await apply({type:"create-construction",id:"mid",workPlane:"XY",definition:{operation:"midpoint",segmentId:"line"}});
  const preview = await previewCadCommand(command()); assert.ok(preview.result.ok, preview.result.reason); assert.ok(preview.changes.some(c => c.objectId === "dim")); assert.ok(preview.changes.some(c=>c.objectId==="mid"));
  await apply({ type: "rename-object", objectId: "arc", name: "Renamed" }); const before = documentState(); assert.equal((await applyCadPlan(preview.planId)).ok, false); assert.deepEqual(documentState(), before); discardCadPlan(preview.planId);
  await apply(command()); near((feature("dim").params.points as number[][])[0][0], 12);point((feature("mid").params.points as Vec3[])[0],[21,0,7]); assert.ok(undoDocument());
  await apply({ type: "create-layer", id: "locked", name: "Locked" }); await apply({ type: "move-object-to-layer", objectId: "dim", layerId: "locked" }); cadDocument.layers.locked.locked = true;
  const locked = documentState(), labels = cadHistory.getPastLabels(); assert.equal((await dispatchCadCommand(command())).ok, false); assert.deepEqual(documentState(), locked); assert.deepEqual(cadHistory.getPastLabels(), labels);
});
test("unbounded, consumed, off-curve, shared-branch, self and nonuniform cases reject atomically", async () => {
  await setup("XY", false, true);
  const c = command();
  for (const extra of [{ distance: 100 }, { secondDistance: 100 }, { firstPoint: [1000, 0, 7] as Vec3 }, { secondPoint: segmentPoint(path("arc").segments[0], .2, "XY") }, { solutionIndex: 7 }]) {
    const before = documentState(), labels = cadHistory.getPastLabels(); assert.equal((await dispatchCadCommand({ ...c, ...extra })).ok, false); assert.deepEqual(documentState(), before); assert.deepEqual(cadHistory.getPastLabels(), labels);
  }
  const selfBefore=documentState(); await assert.rejects(dispatchCadCommand({...c,secondId:"line"}),/Invalid CAD command/); assert.deepEqual(documentState(),selfBefore);
  cadDocument.objects.arc.transform!.scale = [2, 1, 1]; const before = documentState(); assert.equal((await dispatchCadCommand(c)).ok, false); assert.deepEqual(documentState(), before);
});
test("tangent or missing bounded intersections do not invent extended Chamfer corners", async () => {
  await setup(); feature("arc").params.center = [0, 10, 7]; const c = command(); const before = documentState(); assert.equal((await dispatchCadCommand(c)).ok, false); assert.deepEqual(documentState(), before);
  resetTestDocument(); await setup(); feature("line").params.points = [[12, 0, 7], [30, 0, 7]]; const noCorner = documentState(); assert.equal((await dispatchCadCommand(command())).ok, false); assert.deepEqual(documentState(), noCorner);
});
test("mixed Chamfer outputs join exactly and retain analytic DXF and artboard output", async () => {
  await setup("XY", false, true); await apply(command());
  const dxf = parseDxf(encodeDxf(cadDocument).text); assert.ok(dxf.entities.some(e => e.kind === "polyline" && e.bulges?.some(b => Math.abs(b) > .01)));
  await apply({ type: "create-artboard", id: "board", name: "Output", workPlane: "XY", origin: [-10, -20], size: [70, 60] });
  const items = collectArtboardExportItems("board"); assert.ok(items.length >= 3);
  await apply({ type: "join-drawings", objectIds: ["line", "connector", "arc"], id: "joined" }); const joined = path("joined");
  assert.equal(joined.segments.length, 5); assert.ok(joined.segments.some(s => s.kind === "arc")); joined.segments.slice(0, -1).forEach((s, i) => point(s.end, joined.segments[i + 1].start));
});
