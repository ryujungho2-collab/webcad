import assert from "node:assert/strict";
import { beforeEach, afterEach, test } from "node:test";
import { serializeDocument, deserializeDocument } from "@agent-webcad/cad-document";
import type { CadCommand } from "@agent-webcad/cad-commands";
import { cadDocument } from "../src/state/cadDocument";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { cadHistory, undoDocument, redoDocument } from "../src/state/history";
import { buildDependencyGraph, dependencyNodeId, explainObjectDependencies } from "../src/state/dependencyGraph";
import { queryCadDocument } from "../src/state/documentQuery";
import { planDirectEdit } from "../src/state/directEditIntent";
import { previewCadCommand, applyCadPlan, getCadPlanSketchPreview } from "../src/state/documentPlans";
import { sketchPoint } from "../src/precision/sketchSolver";
import { createConstrainedChain } from "./helpers/constrainedChain";
import { resetTestDocument, restoreTestDocument, documentState } from "./helpers/documentHarness";
const original = structuredClone(cadDocument);
beforeEach(resetTestDocument); afterEach(() => { restoreTestDocument(original); cadHistory.clear(); });
const feature = (id: string) => Object.values(cadDocument.features).find(f => f.output === id)!;
async function apply(command: CadCommand) { const r = await dispatchCadCommand(command); assert.ok(r.ok, r.reason); return r; }
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≈ ${b}`);
test("graph reports actual live solids, annotation links and independent snapshot offsets separately", async () => {
  await apply({ type: "create-drawing", id: "profile", drawing: "rectangle", params: { points: [[0, 0, 0], [100, 0, 0], [100, 60, 0], [0, 60, 0]] } });
  await apply({ type: "create-extrude", id: "solid", profileObjectIds: ["profile"], distance: 8 });
  await apply({ type: "create-drawing", id: "line", drawing: "line", params: { points: [[0, 0, 0], [100, 0, 0]] } });
  await apply({ type: "create-dimension", id: "dim", dimension: "linear", params: { points: [[0, 0], [100, 0]], sourceObjectId: "line" } });
  const offset = (await apply({ type: "offset-drawing", objectId: "line", distance: 10 })).createdIds[0];
  const before = documentState(), h = cadHistory.getPastLabels().length, graph = buildDependencyGraph(cadDocument);
  assert.equal(explainObjectDependencies(graph, "solid").immediate[0].relation, "live-input");
  const info = explainObjectDependencies(graph, "line"); assert.ok(info.affected.some(n => n.sourceId === "dim")); assert.ok(!info.affected.some(n => n.sourceId === offset)); assert.ok(info.dependents.some(e => e.relation === "snapshot-source" && e.target.sourceId === offset));
  assert.equal(explainObjectDependencies(graph, "dim").immediate[0].relation, "annotation-source");
  graph.nodes[0].label = "Changed"; assert.deepEqual(documentState(), before); assert.equal(cadHistory.getPastLabels().length, h);
});
test("query explains variable → expression binding → geometry and returns detached graph data", async () => {
  await apply({ type: "create-drawing", id: "circle", drawing: "circle", params: { center: [0, 0, 0], radius: 10 } });
  await apply({ type: "set-variable", name: "base", quantity: "length", expression: "10mm" }); await apply({ type: "set-variable", name: "diameter", quantity: "length", expression: "base * 2" });
  await apply({ type: "set-parameter-binding", target: { kind: "feature", objectId: "circle", parameter: "radius" }, expression: "diameter / 2" });
  const before = documentState(), q = await queryCadDocument(["circle"]), info = q.objects[0].dependencies!;
  assert.ok(info.upstream.some(n => n.sourceId === "base")); assert.ok(info.upstream.some(n => n.sourceId === "diameter")); assert.ok(info.immediate.some(e => e.relation === "parameter-binding"));
  assert.equal(q.dependencyGraph.diagnostics.length, 0); q.dependencyGraph.nodes[0].label = "Untrusted mutation"; info.immediate[0].source.operation = "changed"; assert.deepEqual(documentState(), before);
});
test("missing source references are diagnosed without fabricating geometry or crashing graph queries", async () => {
  await apply({ type: "create-box", id: "box", width: 10, depth: 10, height: 10 }); feature("box").inputs = ["missing"]; feature("box").dependencyMode = "snapshot";
  const graph = buildDependencyGraph(cadDocument); assert.ok(graph.diagnostics.some(d => d.includes("missing"))); assert.ok(graph.nodes.find(n => n.id === dependencyNodeId("object", "missing"))?.missing);
  feature("box").params.sketchId = "missing-sketch";
  const owned = buildDependencyGraph(cadDocument); assert.ok(owned.diagnostics.some(d => d.includes("missing-sketch"))); assert.ok(explainObjectDependencies(owned, "box").immediate.some(e => e.source.missing && e.source.kind === "sketch"));
});
test("AB=50, BC=30 and AB perpendicular BC remain simultaneous constraints when A moves", async () => {
  const ref = (geometryId: string, pointId: string) => ({ geometryId, pointId });
  await createConstrainedChain(apply);
  const before = documentState(); await apply({ type: "move-sketch-point", sketchId: "chain", point: ref("ab", "a"), position: [10, 20], behavior: "solve-connected" });
  const sketch = cadDocument.sketches!.chain, ab = sketch.geometry.find(g => g.id === "ab")!, bc = sketch.geometry.find(g => g.id === "bc")!, a = sketchPoint(ab, "a")!, b = sketchPoint(ab, "b1")!, b2 = sketchPoint(bc, "b2")!, c = sketchPoint(bc, "c")!;
  near(a[0], 10); near(a[1], 20); near(Math.hypot(b[0] - a[0], b[1] - a[1]), 50); near(Math.hypot(c[0] - b2[0], c[1] - b2[1]), 30); near(Math.hypot(b[0] - b2[0], b[1] - b2[1]), 0);
  near(((b[0] - a[0]) * (c[0] - b2[0]) + (b[1] - a[1]) * (c[1] - b2[1])) / (50 * 30), 0);
  const graph = buildDependencyGraph(cadDocument), group = graph.solveGroups[0]; assert.equal(group.constraints.length, 4); assert.equal(group.sketchId, "chain"); assert.ok(!graph.edges.some(e => e.relation === "live-input" && e.from.includes("geometry") && e.to.includes("geometry")));
  assert.equal(explainObjectDependencies(graph, "ab").solveGroups[0].constraints.length, 4);
  assert.ok(explainObjectDependencies(graph, "ab").affected.some(n => n.sourceId === "bc"));
  const detachedDocument = structuredClone(cadDocument);
  // A saved provenance link alone does not make an independent copy constrained.
  detachedDocument.objects.copy = { ...structuredClone(detachedDocument.objects.ab), id: "copy" };
  detachedDocument.features["feature-copy"] = { id: "feature-copy", type: "drawing", output: "copy", inputs: ["ab"], dependencyMode: "snapshot", params: { kind: "line", points: [[0, 0, 0], [50, 0, 0]] } };
  const copyInfo = explainObjectDependencies(buildDependencyGraph(detachedDocument), "copy");
  assert.ok(copyInfo.upstream.some(n => n.kind === "sketch")); assert.equal(copyInfo.solveGroups.length, 0);
  assert.deepEqual(buildDependencyGraph(deserializeDocument(serializeDocument(cadDocument))), graph); const after = documentState(); await undoDocument(); assert.deepEqual(documentState(), before); await redoDocument(); assert.deepEqual(documentState(), after);
});

test("connected intent previews the solved chain and applies that proposal without persisting temporary point targets", async () => {
  await createConstrainedChain(apply);
  const before = documentState(), past = cadHistory.getPastLabels().length;
  const intent = planDirectEdit(cadDocument, { objectId: "ab", target: { kind: "control", id: "a", point: [10, 20, 0] }, startWorld: [0, 0, 0], targetWorld: [10, 20, 0] }, "connected");
  assert.equal(intent.motion?.dof, 2); assert.equal(intent.command.type, "move-sketch-point");
  const plan = await previewCadCommand(intent.command); assert.ok(plan.result.ok, plan.result.reason); assert.ok(plan.result.changed);
  const preview = getCadPlanSketchPreview(plan.planId, "chain")!.after;
  assert.deepEqual(documentState(), before); assert.equal(cadHistory.getPastLabels().length, past);
  const result = await applyCadPlan(plan.planId); assert.ok(result.ok, result.reason);
  assert.deepEqual(cadDocument.sketches!.chain, preview); assert.equal(cadDocument.sketches!.chain.constraints.length, 4);
  assert.equal(cadHistory.getPastLabels().length, past + 1);
});

test("connected editing cannot bypass a saved fixed point or leave any failed partial movement", async () => {
  await createConstrainedChain(apply);
  await apply({ type: "add-sketch-constraint", sketchId: "chain", constraint: { id: "anchor-a", kind: "fixed-point", point: { geometryId: "ab", pointId: "a" }, value: [0, 0] } });
  const before = documentState(), past = cadHistory.getPastLabels().length;
  const result = await dispatchCadCommand({ type: "move-sketch-point", sketchId: "chain", point: { geometryId: "ab", pointId: "a" }, position: [10, 20], behavior: "solve-connected" });
  assert.equal(result.ok, false); assert.deepEqual(documentState(), before); assert.equal(cadHistory.getPastLabels().length, past);
});
