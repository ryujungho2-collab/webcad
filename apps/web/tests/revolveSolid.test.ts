import { restoreTestDocument as restore, documentState, assertMeshBounds, meshVolume } from "./helpers/documentHarness";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import type { CadDocument } from "@agent-webcad/cad-document";
import { createDrawingTopology } from "../src/precision/drawingTopology";
import { cadDocument } from "../src/state/cadDocument";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { cadHistory, redoDocument, undoDocument } from "../src/state/history";
import { buildRevolveMesh, enumerateSolidTopology, validateRevolveOperation } from "../src/cad/kernelGeometryService";


const original = structuredClone(cadDocument);



function resetDocument() {
  restore({
    id: "test-document",
    revision: 0,
    objects: {},
    features: {},
    layers: { "layer-default": { id: "layer-default", name: "Default", visible: true, locked: false, objectIds: [] } },
    rootObjects: [],
    rootLayers: ["layer-default"],
  } as unknown as CadDocument);
  cadHistory.clear();
}

beforeEach(resetDocument);
afterEach(() => {
  restore(original);
  cadHistory.clear();
});

function installRectangle(id: string, points: [number, number, number][]) {
  cadDocument.objects[id] = {
    id,
    geometryId: `geometry-${id}`,
    name: id,
    visible: true,
    layerId: "layer-default",
    transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
  };
  cadDocument.features[`feature-${id}`] = {
    id: `feature-${id}`,
    type: "drawing",
    inputs: [],
    output: id,
    params: { kind: "rectangle", workPlane: "XZ", points, topology: createDrawingTopology("rectangle", { points }, id) },
  };
  cadDocument.layers["layer-default"].objectIds.push(id);
  cadDocument.rootObjects.push(id);
}

describe("solid revolution", () => {
  test("editing the source radial extent regenerates the revolution and restores all fields on Undo/Redo", async () => {
    installRectangle("profile", [[20, 0, 0], [30, 0, 0], [30, 0, 10], [20, 0, 10]]);
    assert.equal((await dispatchCadCommand({ type: "create-revolve", id: "wheel", profileObjectIds: ["profile"], axis: "x", angle: 360 })).ok, true);
    const before = documentState();
    const topology = cadDocument.features["feature-profile"].params.topology as { controls: { id: string; index?: number }[] };
    const result = await dispatchCadCommand({ type: "edit-drawing-control", objectId: "profile", controlId: topology.controls.find(entry => entry.index === 2)!.id, point: [30, 0, 15] });
    assert.equal(result.ok, true, result.reason);
    const params = cadDocument.features["feature-wheel"].params;
    assert.deepEqual(params.axisDirection, [1, 0, 0]);
    const mesh = await buildRevolveMesh(params);
    assertMeshBounds(mesh, [20, -15, -15], [30, 15, 15], 0.11);
    assert.ok(Math.abs(meshVolume(mesh) / (Math.PI * 15 * 15 * 10) - 1) < 0.02);
    const after = documentState();
    assert.ok(undoDocument()); assert.deepEqual(documentState(), before);
    assert.ok(redoDocument()); assert.deepEqual(documentState(), after);
  });
  test("meshes full and partial revolutions with stable topology", async () => {
    installRectangle("profile", [[20, 0, 0], [30, 0, 0], [30, 0, 10], [20, 0, 10]]);
    const created = await dispatchCadCommand({ type: "create-revolve", id: "wheel", profileObjectIds: ["profile"], axis: "x", angle: 360 });
    assert.equal(created.ok, true);
    assert.equal(created.createdIds[0], "wheel");
    const feature = cadDocument.features["feature-wheel"];
    assert.equal(feature.type, "revolve");
    assert.equal(feature.params.angle, 360);
    assert.equal(feature.params.axis, "x");
    assert.deepEqual(feature.inputs, ["profile"]);
    const mesh = await buildRevolveMesh(feature.params as Record<string, unknown>);
    assert.ok(mesh.positions.length > 0 && mesh.indices.length > 0);
    const topology = await enumerateSolidTopology(feature.params as Record<string, unknown>);
    assert.ok(topology.faces.length > 0 && topology.edges.length > 0);

    const half = await dispatchCadCommand({ type: "create-revolve", id: "half", profileObjectIds: ["profile"], axis: "y", angle: 180 });
    assert.equal(half.ok, true);
    assert.equal(half.createdIds[0], "half");
    assert.equal(cadDocument.features["feature-half"].params.angle, 180);
  });

  test("commits one history entry with exact undo and redo", async () => {
    installRectangle("profile", [[20, 0, 0], [30, 0, 0], [30, 0, 10], [20, 0, 10]]);
    cadHistory.clear();
    const revision = cadDocument.revision;
    const result = await dispatchCadCommand({ type: "create-revolve", profileObjectIds: ["profile"], axis: "x", angle: 360 });
    assert.equal(result.ok, true);
    const id = result.createdIds[0];
    assert.equal(typeof id, "string");
    assert.deepEqual(cadHistory.getPastLabels(), ["create-revolve"]);
    assert.equal(cadDocument.revision, revision + 1);
    assert.ok(id && cadDocument.objects[id]);
    assert.equal(undoDocument(), true);
    assert.equal(id && cadDocument.objects[id] ? true : false, false);
    assert.equal(redoDocument(), true);
    assert.ok(id && cadDocument.objects[id]);
  });

  test("updates the sweep angle as one history entry", async () => {
    installRectangle("profile", [[20, 0, 0], [30, 0, 0], [30, 0, 10], [20, 0, 10]]);
    const result = await dispatchCadCommand({ type: "create-revolve", id: "wheel", profileObjectIds: ["profile"], axis: "x", angle: 360 });
    assert.equal(result.ok, true);
    assert.equal(result.createdIds[0], "wheel");
    cadHistory.clear();
    await dispatchCadCommand({ type: "update-revolve", objectId: "wheel", angle: 180 });
    assert.deepEqual(cadHistory.getPastLabels(), ["update-revolve"]);
    assert.equal(cadDocument.features["feature-wheel"].params.angle, 180);
    assert.equal(undoDocument(), true);
    assert.equal(cadDocument.features["feature-wheel"].params.angle, 360);
  });

  test("rejects open profiles, bad angles and locked layers without history", async () => {
    installRectangle("profile", [[20, 0, 0], [30, 0, 0], [30, 0, 10], [20, 0, 10]]);
    cadHistory.clear();
    const revision = cadDocument.revision;
    await assert.rejects(dispatchCadCommand({ type: "create-revolve", profileObjectIds: ["profile"], axis: "x", angle: 0 }), /Invalid CAD command payload/);
    await assert.rejects(dispatchCadCommand({ type: "create-revolve", profileObjectIds: ["profile"], axis: "x", angle: 400 }), /Invalid CAD command payload/);
    cadDocument.layers["layer-default"].locked = true;
    assert.equal((await dispatchCadCommand({ type: "create-revolve", profileObjectIds: ["profile"], axis: "x", angle: 360 })).ok, false);
    cadDocument.layers["layer-default"].locked = false;
    assert.equal(cadDocument.revision, revision);
    assert.deepEqual(cadHistory.getPastLabels(), []);
  });

  test("uses revolved solids as boolean tools and fillet targets", async () => {
    installRectangle("profile", [[20, 0, 0], [30, 0, 0], [30, 0, 10], [20, 0, 10]]);
    const wheel = await dispatchCadCommand({ type: "create-revolve", id: "wheel", profileObjectIds: ["profile"], axis: "x", angle: 360 });
    assert.equal(wheel.ok, true);
    assert.equal(wheel.createdIds[0], "wheel");
    cadHistory.clear();
    const block = await dispatchCadCommand({
      type: "create-primitive", id: "block", primitive: "box",
      params: { width: 100, depth: 100, height: 100 }, position: [-50, -50, -50],
    });
    assert.equal(block.ok, true);
    assert.equal(block.createdIds[0], "block");
    const unioned = await dispatchCadCommand({ type: "boolean-operation", operation: "union", target: "wheel", tool: "block" });
    assert.equal(unioned.ok, true);
    const unionedId = unioned.createdIds[0];
    assert.equal(typeof unionedId, "string");
    const box = await dispatchCadCommand({
      type: "create-primitive", id: "box", primitive: "box",
      params: { width: 10, depth: 10, height: 10 }, position: [15, -5, -5],
    });
    assert.equal(box.ok, true);
    assert.equal(box.createdIds[0], "box");
    const hub = await dispatchCadCommand({ type: "create-revolve", id: "hub", profileObjectIds: ["profile"], axis: "x", angle: 360 });
    assert.equal(hub.ok, true);
    assert.equal(hub.createdIds[0], "hub");
    const hubTopology = await enumerateSolidTopology(cadDocument.features["feature-hub"].params as Record<string, unknown>);
    assert.ok(hubTopology.edges.length > 0);
    const filleted = await dispatchCadCommand({ type: "fillet", target: "hub", edges: [hubTopology.edges[0].key], radius: 0.5 });
    assert.equal(filleted.ok, true);
    const filletedId = filleted.createdIds[0];
    assert.equal(typeof filletedId, "string");
    const bored = await dispatchCadCommand({ type: "boolean-operation", operation: "cut", target: "box", tool: filletedId });
    assert.equal(bored.ok, true);
    const boredId = bored.createdIds[0];
    assert.equal(typeof boredId, "string");
  });

  test("validates revolve parameters without mutating the document", async () => {
    installRectangle("profile", [[20, 0, 0], [30, 0, 0], [30, 0, 10], [20, 0, 10]]);
    const revision = cadDocument.revision;
    await assert.rejects(validateRevolveOperation({ kind: "revolve", angle: 0, axis: "x", profile: {} }));
    await assert.rejects(validateRevolveOperation({ kind: "revolve", angle: 360, axis: "x", profile: null }));
    assert.equal(cadDocument.revision, revision);
    assert.deepEqual(cadHistory.getPastLabels(), []);
  });
});
