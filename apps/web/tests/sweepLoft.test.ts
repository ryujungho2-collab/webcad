import { restoreTestDocument as restore, documentState, assertMeshBounds, meshVolume } from "./helpers/documentHarness";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import type { CadDocument } from "@agent-webcad/cad-document";
import { validateCommand, type CadCommand } from "@agent-webcad/cad-commands";
import { createDrawingTopology } from "../src/precision/drawingTopology";
import { cadDocument } from "../src/state/cadDocument";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { loftReady, sweepReady } from "../src/state/profileSelection";
import { cadHistory, redoDocument, undoDocument } from "../src/state/history";
import { buildLoftMesh, buildSweepMesh } from "../src/cad/kernelGeometryService";

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

function installRectangle(id: string, points: [number, number, number][], workPlane: "XY" | "XZ" | "YZ" = "XY") {
  cadDocument.objects[id] = {
    id, geometryId: `geometry-${id}`, name: id, visible: true, layerId: "layer-default",
    transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
  };
  cadDocument.features[`feature-${id}`] = {
    id: `feature-${id}`, type: "drawing", inputs: [], output: id,
    params: { kind: "rectangle", workPlane, points, topology: createDrawingTopology("rectangle", { points }, id) },
  };
  cadDocument.layers["layer-default"].objectIds.push(id);
  cadDocument.rootObjects.push(id);
}

function installLine(id: string, points: [number, number, number][]) {
  cadDocument.objects[id] = {
    id, geometryId: `geometry-${id}`, name: id, visible: true, layerId: "layer-default",
    transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
  };
  cadDocument.features[`feature-${id}`] = {
    id: `feature-${id}`, type: "drawing", inputs: [], output: id,
    params: { kind: "line", workPlane: "XZ", points, topology: createDrawingTopology("line", { points }, id) },
  };
  cadDocument.layers["layer-default"].objectIds.push(id);
  cadDocument.rootObjects.push(id);
}

function installArcPath(id: string) {
  cadDocument.objects[id] = {
    id, geometryId: `geometry-${id}`, name: id, visible: true, layerId: "layer-default",
    transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
  };
  cadDocument.features[`feature-${id}`] = {
    id: `feature-${id}`, type: "drawing", inputs: [], output: id,
    params: {
      kind: "arc", workPlane: "XY", center: [0, 0, 0], radius: 20,
      startAngle: 0, endAngle: Math.PI / 2,
      topology: createDrawingTopology("arc", { center: [0, 0, 0], radius: 20, startAngle: 0, endAngle: Math.PI / 2 }, id),
    },
  };
  cadDocument.layers["layer-default"].objectIds.push(id);
  cadDocument.rootObjects.push(id);
}

beforeEach(resetDocument);
afterEach(() => {
  restore(original);
  cadHistory.clear();
});

describe("profile selection split", () => {
  test("distinguishes profiles, paths and others", async () => {
    installRectangle("rect", [[0, 0, 0], [10, 0, 0], [10, 6, 0], [0, 6, 0]]);
    installLine("path", [[5, 3, 0], [5, 3, 30]]);
    assert.deepEqual(sweepReady(cadDocument, ["rect", "path"]), { profile: "rect", path: "path" });
    assert.deepEqual(sweepReady(cadDocument, ["path", "rect"]), { profile: "rect", path: "path" });
    assert.equal(sweepReady(cadDocument, ["rect"]), null);
    assert.equal(loftReady(cadDocument, ["rect"]), null);
    cadDocument.objects.path.visible = false;
    assert.equal(sweepReady(cadDocument, ["rect", "path"]), null);
  });
});

describe("solid sweep", () => {
  test("source path and profile edits regenerate the swept solid", async () => {
    installRectangle("profile", [[0, 0, 0], [10, 0, 0], [10, 6, 0], [0, 6, 0]]);
    installLine("path", [[5, 3, 0], [5, 3, 30]]);
    assert.equal((await dispatchCadCommand({ type: "create-sweep", id: "sweep", profileObjectIds: ["profile"], pathObjectId: "path" })).ok, true);
    const before = documentState();
    const pathTopology = cadDocument.features["feature-path"].params.topology as { controls: { id: string; index?: number }[] };
    const edited = await dispatchCadCommand({ type: "edit-drawing-control", objectId: "path", controlId: pathTopology.controls.find(entry => entry.index === 1)!.id, point: [5, 3, 50] });
    assert.equal(edited.ok, true, edited.reason);
    const extended = await buildSweepMesh(cadDocument.features["feature-sweep"].params);
    assertMeshBounds(extended, [0, 0, 0], [10, 6, 50]);
    assert.ok(Math.abs(meshVolume(extended) - 3000) < 1e-3);
    const profileTopology = cadDocument.features["feature-profile"].params.topology as { controls: { id: string; index?: number }[] };
    assert.equal((await dispatchCadCommand({ type: "edit-drawing-control", objectId: "profile", controlId: profileTopology.controls.find(entry => entry.index === 1)!.id, point: [14, 0, 0] })).ok, true);
    assertMeshBounds(await buildSweepMesh(cadDocument.features["feature-sweep"].params), [0, 0, 0], [14, 6, 50]);
    assert.ok(undoDocument()); assert.ok(undoDocument()); assert.deepEqual(documentState(), before);
  });
  test("sweeps a rectangle along a straight path as one history entry", async () => {
    installRectangle("profile", [[0, 0, 0], [10, 0, 0], [10, 6, 0], [0, 6, 0]]);
    installLine("path", [[5, 3, 0], [5, 3, 30]]);
    const result = await dispatchCadCommand({ type: "create-sweep", id: "sweep", profileObjectIds: ["profile"], pathObjectId: "path" });
    assert.equal(result.ok, true);
    assert.deepEqual(result.createdIds, ["sweep"]);
    assert.deepEqual(cadHistory.getPastLabels(), ["create-sweep"]);
    const feature = cadDocument.features["feature-sweep"];
    assert.equal(feature.type, "sweep");
    assert.deepEqual(feature.inputs, ["profile", "path"]);
    const mesh = await buildSweepMesh(feature.params as Record<string, unknown>);
    assertMeshBounds(mesh, [0, 0, 0], [10, 6, 30]);
    assert.ok(Math.abs(meshVolume(mesh) - 10 * 6 * 30) < 1e-3);
    assert.equal(undoDocument(), true);
    assert.equal(cadDocument.objects.sweep, undefined);
    assert.equal(redoDocument(), true);
    assert.ok(cadDocument.objects.sweep);
  });

  test("sweeps along a curved arc path", async () => {
    // Profile sits in the spine-start tangent plane, centered on the start.
    installRectangle("profile", [[15, 0, -5], [25, 0, -5], [25, 0, 5], [15, 0, 5]], "XZ");
    installArcPath("arc");
    const result = await dispatchCadCommand({ type: "create-sweep", id: "bend", profileObjectIds: ["profile"], pathObjectId: "arc" });
    assert.equal(result.ok, true);
    const mesh = await buildSweepMesh(cadDocument.features["feature-bend"].params as Record<string, unknown>);
    assert.ok(mesh.positions.length > 0 && mesh.indices.length > 0);
  });

  test("rejects open profiles, bad paths and locked layers without history", async () => {
    installRectangle("profile", [[0, 0, 0], [10, 0, 0], [10, 6, 0], [0, 6, 0]]);
    installLine("path", [[5, 3, 0], [5, 3, 30]]);
    installLine("open", [[0, 0, 0], [10, 0, 0]]);
    const revision = cadDocument.revision;

    assert.equal((await dispatchCadCommand({ type: "create-sweep", profileObjectIds: ["open"], pathObjectId: "path" })).ok, false);
    assert.equal((await dispatchCadCommand({ type: "create-sweep", profileObjectIds: ["profile"], pathObjectId: "missing" })).ok, false);
    const badPayload = { type: "create-sweep", profileObjectIds: ["profile"], pathObjectId: "profile" };
    assert.equal(validateCommand(badPayload), false);
    await assert.rejects(dispatchCadCommand(badPayload as unknown as CadCommand), /Invalid CAD command payload/);
    const missingPath = { type: "create-sweep", profileObjectIds: ["profile"] };
    assert.equal(validateCommand(missingPath), false);
    await assert.rejects(dispatchCadCommand(missingPath as unknown as CadCommand), /Invalid CAD command payload/);
    cadDocument.layers["layer-default"].locked = true;
    assert.equal((await dispatchCadCommand({ type: "create-sweep", profileObjectIds: ["profile"], pathObjectId: "path" })).ok, false);
    cadDocument.layers["layer-default"].locked = false;

    assert.equal(cadDocument.revision, revision);
    assert.deepEqual(cadHistory.getPastLabels(), []);
  });

  test("sweep results compose with booleans", async () => {
    installRectangle("profile", [[0, 0, 0], [10, 0, 0], [10, 6, 0], [0, 6, 0]]);
    installLine("path", [[5, 3, 0], [5, 3, 30]]);
    const swept = await dispatchCadCommand({ type: "create-sweep", id: "sweep", profileObjectIds: ["profile"], pathObjectId: "path" });
    assert.equal(swept.ok, true);
    const boxed = await dispatchCadCommand({ type: "create-primitive", id: "block", primitive: "box", params: { width: 30, depth: 30, height: 30 }, position: [0, 0, 0] });
    assert.equal(boxed.ok, true);
    cadHistory.clear();
    const unioned = await dispatchCadCommand({ type: "boolean-operation", operation: "union", target: "sweep", tool: "block" });
    assert.equal(unioned.ok, true);
    assert.deepEqual(cadHistory.getPastLabels(), ["boolean-operation"]);
  });
});

describe("solid loft", () => {
  test("editing one loft section regenerates the solid in the stored section order", async () => {
    installRectangle("lower", [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0]]);
    installRectangle("upper", [[2, 2, 20], [8, 2, 20], [8, 8, 20], [2, 8, 20]]);
    assert.equal((await dispatchCadCommand({ type: "create-loft", id: "loft", profileObjectIds: ["lower", "upper"] })).ok, true);
    const topology = cadDocument.features["feature-upper"].params.topology as { controls: { id: string; index?: number }[] };
    const result = await dispatchCadCommand({ type: "edit-drawing-control", objectId: "upper", controlId: topology.controls.find(entry => entry.index === 1)!.id, point: [12, 2, 20] });
    assert.equal(result.ok, true, result.reason);
    assert.deepEqual(cadDocument.features["feature-loft"].inputs, ["lower", "upper"]);
    const mesh = await buildLoftMesh(cadDocument.features["feature-loft"].params);
    assertMeshBounds(mesh, [0, 0, 0], [12, 10, 20]);
    assert.ok(Math.abs(meshVolume(mesh) - 1600) < 1e-3);
  });
  test("lofts two rectangles as one history entry with exact undo/redo", async () => {
    installRectangle("lower", [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0]]);
    installRectangle("upper", [[2, 2, 20], [8, 2, 20], [8, 8, 20], [2, 8, 20]]);
    const result = await dispatchCadCommand({ type: "create-loft", id: "loft", profileObjectIds: ["lower", "upper"] });
    assert.equal(result.ok, true);
    assert.deepEqual(cadHistory.getPastLabels(), ["create-loft"]);
    const feature = cadDocument.features["feature-loft"];
    assert.equal(feature.type, "loft");
    assert.deepEqual(feature.inputs, ["lower", "upper"]);
    const mesh = await buildLoftMesh(feature.params as Record<string, unknown>);
    assertMeshBounds(mesh, [0, 0, 0], [10, 10, 20]);
    // Square frustum: h/3 * (A1 + A2 + sqrt(A1*A2)).
    assert.ok(Math.abs(meshVolume(mesh) - 20 / 3 * (100 + 36 + 60)) < 1e-3);
    assert.equal(undoDocument(), true);
    assert.equal(cadDocument.objects.loft, undefined);
    assert.equal(redoDocument(), true);
    assert.ok(cadDocument.objects.loft);
  });

  test("ruled loft blends the same sections", async () => {
    installRectangle("lower", [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0]]);
    installRectangle("upper", [[2, 2, 20], [8, 2, 20], [8, 8, 20], [2, 8, 20]]);
    const result = await dispatchCadCommand({ type: "create-loft", id: "ruled", profileObjectIds: ["lower", "upper"], ruled: true });
    assert.equal(result.ok, true);
    assert.equal(cadDocument.features["feature-ruled"].params.ruled, true);
    const mesh = await buildLoftMesh(cadDocument.features["feature-ruled"].params as Record<string, unknown>);
    assert.ok(mesh.positions.length > 0 && mesh.indices.length > 0);
  });

  test("rejects single or open profiles and locked layers without history", async () => {
    installRectangle("lower", [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0]]);
    installLine("open", [[0, 0, 0], [10, 0, 0]]);
    const revision = cadDocument.revision;

    assert.equal((await dispatchCadCommand({ type: "create-loft", profileObjectIds: ["lower", "open"] })).ok, false);
    const badPayload = { type: "create-loft", profileObjectIds: ["lower"] };
    assert.equal(validateCommand(badPayload), false);
    await assert.rejects(dispatchCadCommand(badPayload as unknown as CadCommand), /Invalid CAD command payload/);
    cadDocument.layers["layer-default"].locked = true;
    installRectangle("upper", [[2, 2, 20], [8, 2, 20], [8, 8, 20], [2, 8, 20]]);
    assert.equal((await dispatchCadCommand({ type: "create-loft", profileObjectIds: ["lower", "upper"] })).ok, false);
    cadDocument.layers["layer-default"].locked = false;

    assert.equal(cadDocument.revision, revision);
    assert.deepEqual(cadHistory.getPastLabels(), []);
  });
});
