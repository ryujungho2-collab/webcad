import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { serializeDocument, deserializeDocument } from "../../../packages/cad-document/src/serialization";
import type { CadCommand } from "@agent-webcad/cad-commands";
import { cadDocument } from "../src/state/cadDocument";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { cadHistory, undoDocument, redoDocument } from "../src/state/history";
import { buildExtrudeMesh, buildBooleanMesh, buildFilletMesh, buildChamferMesh, enumerateSolidTopology, subscribeKernelStatus } from "../src/cad/kernelGeometryService";
import { collectExportSolids } from "../src/export/exportModel";
import { assertMeshBounds, documentState, meshVolume, resetTestDocument, restoreTestDocument } from "./helpers/documentHarness";

const original = structuredClone(cadDocument);
beforeEach(resetTestDocument);
afterEach(() => { restoreTestDocument(original); cadHistory.clear(); });

async function apply(command: CadCommand) {
  const result = await dispatchCadCommand(command);
  assert.equal(result.ok, true, result.reason);
  return result;
}
const feature = (id: string) => Object.values(cadDocument.features).find(entry => entry.output === id)!;
async function circlePlate() {
  await apply({ type: "create-drawing", id: "circle", drawing: "circle", params: { center: [0, 0, 0], radius: 10, workPlane: "XY" } });
  await apply({ type: "create-extrude", id: "plate", profileObjectIds: ["circle"], distance: 5 });
}
function radiusEdit(radius: number): CadCommand {
  const topology = feature("circle").params.topology as { controls: { id: string; role: string }[] };
  return { type: "edit-drawing-control", objectId: "circle", controlId: topology.controls.find(entry => entry.role === "radius")!.id, point: [radius, 0, 0] };
}
async function rectangularPlate() {
  await apply({ type: "create-drawing", id: "profile", drawing: "rectangle", params: { workPlane: "XY", points: [[0, 0, 0], [20, 0, 0], [20, 10, 0], [0, 10, 0]] } });
  await apply({ type: "create-extrude", id: "plate", profileObjectIds: ["profile"], distance: 5 });
}
function widthEdit(width: number): CadCommand {
  const topology = feature("profile").params.topology as { controls: { id: string; index?: number }[] };
  return { type: "edit-drawing-control", objectId: "profile", controlId: topology.controls.find(entry => entry.index === 1)!.id, point: [width, 0, 0] };
}

test("circle radius edit rebuilds the solid and export; one Undo/Redo restores the complete document", async () => {
  await circlePlate();
  const before = documentState(), revision = cadDocument.revision;
  cadHistory.clear();
  const result = await apply(radiusEdit(20));
  assert.deepEqual(result.createdIds, []);
  assert.equal(cadDocument.revision, revision + 1);
  assert.equal((feature("plate").params.profile as { segments: { radius: number }[] }).segments[0].radius, 20);
  // OCCT uses 0.1 mm display deflection; analytic profile values stay exact.
  assertMeshBounds(await buildExtrudeMesh(feature("plate").params), [-20, -20, 0], [20, 20, 5], 0.11);
  const exported = await collectExportSolids(["plate"]);
  assert.equal(Math.max(...exported.flatMap(triangle => triangle.vertices.map(vertex => vertex[0]))), 20);
  const after = documentState();
  assert.deepEqual(cadHistory.getPastLabels(), ["edit-drawing-control"]);
  assert.ok(undoDocument());
  assert.deepEqual(documentState(), before);
  assert.ok(redoDocument());
  assert.deepEqual(documentState(), after);
});

test("branching dependents update while unrelated geometry stays unchanged", async () => {
  await circlePlate();
  await apply({ type: "create-extrude", id: "second", profileObjectIds: ["circle"], distance: -3 });
  await apply({ type: "create-box", id: "unrelated", width: 2, depth: 3, height: 4 });
  const unrelated = structuredClone(feature("unrelated"));
  await apply(radiusEdit(15));
  assertMeshBounds(await buildExtrudeMesh(feature("plate").params), [-15, -15, 0], [15, 15, 5], 0.06);
  assertMeshBounds(await buildExtrudeMesh(feature("second").params), [-15, -15, -3], [15, 15, 0], 0.06);
  assert.deepEqual(feature("unrelated"), unrelated);
});

for (const treatment of ["fillet", "chamfer"] as const) {
  test(`profile → extrusion → cut → ${treatment} regenerates through retained sources`, async () => {
    await rectangularPlate();
    await apply({ type: "create-box", id: "tool", width: 2, depth: 4, height: 10, position: [8, 3, -2] });
    await apply({ type: "boolean-operation", id: "cut", operation: "cut", target: "plate", tool: "tool" });
    const topology = await enumerateSolidTopology(feature("cut").params);
    // This edge's geometry is invariant when the opposite side moves.
    const edge = topology.edges.find(entry => entry.points.every(point => Math.abs(point[0]) < 1e-6 && Math.abs(point[2]) < 1e-6));
    assert.ok(edge);
    const rounded = await apply(treatment === "fillet"
      ? { type: "fillet", target: "cut", edges: [edge.key], radius: 0.5 }
      : { type: "chamfer", target: "cut", edges: [edge.key], distance: 0.5 });
    const id = rounded.createdIds[0];
    const before = documentState();
    cadHistory.clear();
    await apply(widthEdit(30));
    assert.ok(cadDocument.objects.plate && cadDocument.objects.tool && cadDocument.objects.cut);
    assert.equal(cadDocument.objects.plate.visible, false);
    assert.equal(cadDocument.rootObjects.includes("plate"), false);
    const cut = await buildBooleanMesh(feature("cut").params);
    assertMeshBounds(cut, [0, 0, 0], [30, 10, 5]);
    assert.ok(Math.abs(meshVolume(cut) - (30 * 10 * 5 - 2 * 4 * 5)) < 1e-3);
    const finalMesh = await (treatment === "fillet" ? buildFilletMesh : buildChamferMesh)(feature(id).params);
    assertMeshBounds(finalMesh, [0, 0, 0], [30, 10, 5]);
    assert.ok(meshVolume(finalMesh) < meshVolume(cut), "edge treatment must remove material");
    assert.deepEqual(cadHistory.getPastLabels(), ["edit-drawing-control"]);
    const after = documentState();
    assert.ok(undoDocument()); assert.deepEqual(documentState(), before);
    assert.ok(redoDocument()); assert.deepEqual(documentState(), after);
  });
}

test("stale fillet references reject a valid source edit without altering document, revision, or redo", async () => {
  await rectangularPlate();
  const topology = await enumerateSolidTopology(feature("plate").params);
  const edge = topology.edges.find(entry => entry.points.every(point => Math.abs(point[0] - 20) < 1e-6 && Math.abs(point[2]) < 1e-6));
  assert.ok(edge);
  await apply({ type: "fillet", target: "plate", edges: [edge.key], radius: 0.5 });
  await apply({ type: "rename-object", objectId: "profile", name: "Renamed" });
  assert.ok(undoDocument());
  const before = structuredClone(cadDocument), history = cadHistory.getPastLabels(), future = cadHistory.getFutureLabels();
  const result = await dispatchCadCommand(widthEdit(30));
  assert.equal(result.ok, false);
  assert.equal(result.changed, false);
  assert.match(result.reason ?? "", /fillet|edge reference/i);
  assert.deepEqual(cadDocument, before);
  assert.deepEqual(cadHistory.getPastLabels(), history);
  assert.deepEqual(cadHistory.getFutureLabels(), future);
});

test("deleting a referenced source or editing through a locked dependent rejects atomically", async () => {
  await circlePlate();
  await apply({ type: "create-layer", id: "locked-output", name: "Output" });
  await apply({ type: "move-object-to-layer", objectId: "plate", layerId: "locked-output" });
  await apply({ type: "set-layer-locked", layerId: "locked-output", locked: true });
  const before = structuredClone(cadDocument), history = cadHistory.getPastLabels();
  const deleted = await dispatchCadCommand({ type: "delete-object", objectId: "circle" });
  assert.equal(deleted.ok, false);
  assert.match(deleted.reason ?? "", /source|input|depend/i);
  const edited = await dispatchCadCommand(radiusEdit(20));
  assert.equal(edited.ok, false);
  assert.match(edited.reason ?? "", /locked/i);
  assert.deepEqual(cadDocument, before);
  assert.deepEqual(cadHistory.getPastLabels(), history);
});

test("each batch child sees regenerated geometry and a downstream failure rolls back all children", async () => {
  await rectangularPlate();
  await apply({ type: "create-box", id: "tool", width: 2, depth: 4, height: 10, position: [8, 3, -2] });
  cadHistory.clear();
  await apply({ type: "batch", label: "Widen and cut", commands: [widthEdit(30), { type: "boolean-operation", id: "cut", operation: "cut", target: "plate", tool: "tool" }] });
  assertMeshBounds(await buildBooleanMesh(feature("cut").params), [0, 0, 0], [30, 10, 5]);
  assert.deepEqual(cadHistory.getPastLabels(), ["Widen and cut"]);
  const before = structuredClone(cadDocument);
  const result = await dispatchCadCommand({ type: "batch", commands: [
    { type: "rename-object", objectId: "profile", name: "Should roll back" },
    { type: "delete-object", objectId: "profile" },
  ] });
  assert.equal(result.ok, false);
  assert.deepEqual(cadDocument, before);
  assert.deepEqual(cadHistory.getPastLabels(), ["Widen and cut"]);
});

test("save/open preserves live dependencies; duplicated solids remain independent snapshots", async () => {
  await circlePlate();
  const copy = (await apply({ type: "duplicate-object", objectId: "plate", offset: [50, 0, 0] })).createdIds[0];
  const independent = structuredClone(feature(copy).params);
  restoreTestDocument(deserializeDocument(serializeDocument(cadDocument)));
  await apply(radiusEdit(20));
  assertMeshBounds(await buildExtrudeMesh(feature("plate").params), [-20, -20, 0], [20, 20, 5], 0.06);
  assert.deepEqual(feature(copy).params, independent);
  assert.deepEqual(feature(copy).inputs, []);
});

test("hidden profiles regenerate; visibility and rename do not invalidate geometry", async () => {
  await circlePlate();
  await apply({ type: "set-object-visible", objectId: "circle", visible: false });
  const profile = structuredClone(feature("plate").params);
  await apply({ type: "rename-object", objectId: "circle", name: "Hidden circle" });
  assert.deepEqual(feature("plate").params, profile);
  // Transforms are valid source edits even when the drawing is hidden.
  await apply({ type: "move-object", objectId: "circle", translation: [5, 0, 0] });
  assertMeshBounds(await buildExtrudeMesh(feature("plate").params), [-5, -10, 0], [15, 10, 5]);
  assert.equal(cadDocument.objects.circle.visible, false);
});

test("the live document stays unchanged during dependent kernel computation", async () => {
  await circlePlate();
  const before = structuredClone(cadDocument);
  let observations = 0;
  const unsubscribe = subscribeKernelStatus(status => {
    if (status === "working" || status === "loading") {
      assert.deepEqual(cadDocument, before);
      observations++;
    }
  });
  try { await apply(radiusEdit(17)); } finally { unsubscribe(); }
  assert.ok(observations > 0, "test must actually observe asynchronous kernel work");
  assert.equal(feature("circle").params.radius, 17);
});

test("moving a primitive input updates the boolean placement exactly once", async () => {
  await apply({ type: "create-box", id: "left", width: 10, depth: 10, height: 10 });
  await apply({ type: "create-box", id: "right", width: 10, depth: 10, height: 10, position: [5, 0, 0] });
  await apply({ type: "boolean-operation", id: "union", target: "left", tool: "right", operation: "union" });
  await apply({ type: "move-object", objectId: "right", translation: [8, 0, 0] });
  const mesh = await buildBooleanMesh(feature("union").params);
  assertMeshBounds(mesh, [0, 0, 0], [18, 10, 10]);
  assert.ok(Math.abs(meshVolume(mesh) - 1800) < 1e-3);
  assert.equal(cadDocument.objects.right.visible, false);
});

test("cycles are rejected instead of publishing partially regenerated geometry", async () => {
  await circlePlate();
  feature("plate").inputs = ["plate"];
  const before = structuredClone(cadDocument), history = cadHistory.getPastLabels();
  const result = await dispatchCadCommand({ type: "rename-object", objectId: "circle", name: "Should not commit" });
  assert.equal(result.ok, false);
  assert.match(result.reason ?? "", /cyclic/i);
  assert.deepEqual(cadDocument, before);
  assert.deepEqual(cadHistory.getPastLabels(), history);
});

test("legacy consumed-solid snapshots remain usable without fabricating missing source history", async () => {
  await rectangularPlate();
  await apply({ type: "create-box", id: "tool", width: 2, depth: 4, height: 10, position: [8, 3, -2] });
  await apply({ type: "boolean-operation", id: "cut", operation: "cut", target: "plate", tool: "tool" });
  // Reproduce the previous saved representation, where consumed solids were deleted.
  delete feature("cut").dependencyMode;
  for (const id of ["plate", "tool"]) {
    delete cadDocument.objects[id]; delete cadDocument.features[`feature-${id}`];
    cadDocument.layers["layer-default"].objectIds = cadDocument.layers["layer-default"].objectIds.filter(entry => entry !== id);
  }
  const snapshot = structuredClone(feature("cut").params);
  restoreTestDocument(deserializeDocument(serializeDocument(cadDocument)));
  await apply(widthEdit(30));
  assert.deepEqual(feature("cut").params, snapshot);
  assertMeshBounds(await buildBooleanMesh(feature("cut").params), [0, 0, 0], [20, 10, 5]);
});

test("Show all keeps consumed sources hidden; deleting the result restores its editable inputs", async () => {
  await rectangularPlate();
  await apply({ type: "create-box", id: "tool", width: 2, depth: 4, height: 10, position: [8, 3, -2] });
  await apply({ type: "boolean-operation", id: "cut", operation: "cut", target: "plate", tool: "tool" });
  await apply({ type: "set-object-visible", objectId: "cut", visible: false });
  await apply({ type: "show-all-objects" });
  assert.equal(cadDocument.objects.cut.visible, true);
  assert.equal(cadDocument.objects.plate.visible, false);
  assert.equal(cadDocument.objects.tool.visible, false);
  const before = documentState();
  await apply({ type: "delete-object", objectId: "cut" });
  assert.equal(cadDocument.objects.cut, undefined);
  for (const id of ["plate", "tool"]) {
    assert.ok(cadDocument.rootObjects.includes(id));
    assert.equal(cadDocument.objects[id].visible, true);
  }
  assert.ok(undoDocument()); assert.deepEqual(documentState(), before);
});

test("changing a closed source into an open profile rejects the entire edit", async () => {
  await circlePlate();
  await apply({ type: "create-drawing", id: "cutter", drawing: "line", params: { workPlane: "XY", points: [[0, -20, 0], [0, 20, 0]] } });
  const before = structuredClone(cadDocument), history = cadHistory.getPastLabels();
  const result = await dispatchCadCommand({ type: "trim-drawing", targetId: "circle", cutterId: "cutter", pickPoint: [10, 0, 0] });
  assert.equal(result.ok, false);
  assert.match(result.reason ?? "", /regenerate|closed|open/i);
  assert.deepEqual(cadDocument, before);
  assert.deepEqual(cadHistory.getPastLabels(), history);
});
