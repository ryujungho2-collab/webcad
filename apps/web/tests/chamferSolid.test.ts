import { restoreTestDocument as restore, documentState, assertMeshBounds, meshVolume } from "./helpers/documentHarness";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import type { CadDocument } from "@agent-webcad/cad-document";
import { createDrawingTopology } from "../src/precision/drawingTopology";
import { cadDocument } from "../src/state/cadDocument";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { cadHistory, redoDocument, undoDocument } from "../src/state/history";
import { validSelection } from "../src/state/selection";
import { buildChamferMesh, enumerateSolidTopology, meshPositionsBounds, resolveBrepReference, validateChamferOperation } from "../src/cad/kernelGeometryService";

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

function installBox(id: string, size = 10) {
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
    type: "primitive",
    inputs: [],
    output: id,
    params: { kind: "box", width: size, depth: size, height: size },
  };
  cadDocument.layers["layer-default"].objectIds.push(id);
  cadDocument.rootObjects.push(id);
}

async function boxEdgeKeys(id: string): Promise<string[]> {
  const feature = cadDocument.features[`feature-${id}`];
  const topology = await enumerateSolidTopology(feature.params as Record<string, unknown>);
  assert.equal(topology.edges.length, 12);
  return topology.edges.map((entry) => entry.key);
}

describe("selective solid chamfer", () => {
  test("meshes a subset of box edges with stable keys", async () => {
    installBox("box");
    const keys = await boxEdgeKeys("box");
    const subset = keys.slice(0, 2);
    const mesh = await buildChamferMesh({
      kind: "chamfer",
      distance: 1,
      edgeKeys: subset,
      source: {
        params: structuredClone(cadDocument.features["feature-box"].params),
        transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      },
    });
    assertMeshBounds(mesh, [0, 0, 0], [10, 10, 10]);
    assert.ok(meshVolume(mesh) < 1000 && meshVolume(mesh) > 900, "chamfer must remove the corner material");
  });

  test("rejects impossible distances and unresolvable references without history", async () => {
    installBox("box");
    const keys = await boxEdgeKeys("box");
    const source = {
      params: structuredClone(cadDocument.features["feature-box"].params),
      transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    };
    await assert.rejects(validateChamferOperation({ kind: "chamfer", distance: 100, edgeKeys: keys.slice(0, 1), source }));
    await assert.rejects(validateChamferOperation({ kind: "chamfer", distance: 1, edgeKeys: ["edge:line:0.000000,0.000000,0.000000|1.000000,1.000000,1.000000|9.999999"], source }));
    await assert.rejects(validateChamferOperation({ kind: "chamfer", distance: 1, edgeKeys: [], source }));
    assert.deepEqual(cadHistory.getPastLabels(), []);
  });

  test("commits one history entry with exact undo and redo", async () => {
    installBox("box");
    const keys = await boxEdgeKeys("box");
    cadHistory.clear();
    const revision = cadDocument.revision;
    const before = documentState();
    const result = await dispatchCadCommand({ type: "chamfer", target: "box", edges: keys.slice(0, 2), distance: 1 });
    assert.equal(result.ok, true);
    const id = result.createdIds[0];
    assert.equal(typeof id, "string");
    assert.deepEqual(cadHistory.getPastLabels(), ["chamfer"]);
    assert.equal(cadDocument.revision, revision + 1);
    const featureId = `feature-${id}`;
    assert.equal(cadDocument.features[featureId].type, "chamfer");
    assert.deepEqual(cadDocument.features[featureId].inputs, ["box"]);
    assert.equal(cadDocument.objects.box.visible, false);
    assert.ok(cadDocument.features["feature-box"]);
    assert.ok(cadDocument.layers["layer-default"].objectIds.includes("box"));
    assert.equal(cadDocument.rootObjects.includes("box"), false);
    const after = documentState();
    assert.equal(undoDocument(), true);
    assert.deepEqual(documentState(), before);
    assert.ok(cadDocument.objects.box);
    assert.equal(cadDocument.objects[id] ? true : false, false);
    assert.equal(redoDocument(), true);
    assert.deepEqual(documentState(), after);
    assert.ok(cadDocument.objects[id]);
    assert.equal(cadDocument.features[`feature-${id}`].type, "chamfer");
  });

  test("chamfers translated targets in their world position", async () => {
    installBox("moved");
    cadDocument.objects.moved.transform!.translation = [30, 0, 0];
    const keys = await boxEdgeKeys("moved");
    cadHistory.clear();
    const result = await dispatchCadCommand({ type: "chamfer", target: "moved", edges: keys.slice(0, 2), distance: 1 });
    assert.equal(result.ok, true);
    const id = result.createdIds[0];
    assert.equal(typeof id, "string");
    assert.deepEqual(cadHistory.getPastLabels(), ["chamfer"]);
    const mesh = await buildChamferMesh(cadDocument.features[`feature-${id}`].params as Record<string, unknown>);
    const bounds = meshPositionsBounds(mesh.positions);
    assert.ok(bounds);
    for (const [actual, expected] of [[bounds!.min[0], 30], [bounds!.min[1], 0], [bounds!.min[2], 0], [bounds!.max[0], 40], [bounds!.max[1], 10], [bounds!.max[2], 10]] as const) {
      assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} ≈ ${expected}`);
    }
    assert.equal(undoDocument(), true);
    assert.ok(cadDocument.objects.moved);
  });

  test("result edges resolve geometrically and consumed source selections are cleared", async () => {
    installBox("box");
    const keys = await boxEdgeKeys("box");
    cadHistory.clear();
    const result = await dispatchCadCommand({ type: "chamfer", target: "box", edges: keys.slice(0, 1), distance: 1 });
    assert.equal(result.ok, true);
    const id = result.createdIds[0];
    assert.equal(typeof id, "string");
    const params = cadDocument.features[`feature-${id}`].params;
    const edge = (await enumerateSolidTopology(params)).edges[0];
    assert.ok(edge);
    const cleaned = validSelection({
      ids: [id],
      primaryId: id,
      subObjects: [{ objectId: id, kind: "brep-edge", topologyId: edge.key }],
    });
    assert.deepEqual(cleaned.ids, [id]);
    assert.equal(await resolveBrepReference(params, "brep-edge", edge.key), true);
    assert.equal(await resolveBrepReference(params, "brep-edge", keys[0]), false);
    assert.deepEqual(validSelection({ ids: ["box"], primaryId: "box" }).ids, []);
  });

  test("rejects locked layers, scaled targets and drawings without history", async () => {
    installBox("box");
    const keys = await boxEdgeKeys("box");
    cadHistory.clear();
    const revision = cadDocument.revision;
    cadDocument.layers["layer-default"].locked = true;
    assert.equal((await dispatchCadCommand({ type: "chamfer", target: "box", edges: keys.slice(0, 1), distance: 1 })).ok, false);
    cadDocument.layers["layer-default"].locked = false;
    cadDocument.objects.box.transform!.scale = [2, 2, 2];
    assert.equal((await dispatchCadCommand({ type: "chamfer", target: "box", edges: keys.slice(0, 1), distance: 1 })).ok, false);
    cadDocument.objects.box.transform!.scale = [1, 1, 1];
    assert.equal(cadDocument.revision, revision);
    assert.equal((await dispatchCadCommand({ type: "create-drawing", id: "drawing", drawing: "circle", params: { workPlane: "XY", center: [0, 0, 0], radius: 5 } })).ok, true);
    cadHistory.clear();
    const beforeDrawingAttempt = structuredClone(cadDocument);
    assert.equal((await dispatchCadCommand({ type: "chamfer", target: "drawing", edges: keys.slice(0, 1), distance: 1 })).ok, false);
    assert.deepEqual(cadDocument, beforeDrawingAttempt);
    assert.deepEqual(cadHistory.getPastLabels(), []);
    assert.ok(cadDocument.objects.box);
  });

  test("chamfers an extruded solid and unions the result", async () => {
    const profilePoints: [number, number, number][] = [[0, 0, 0], [10, 0, 0], [10, 6, 0], [0, 6, 0]];
    cadDocument.objects.profile = {
      id: "profile", geometryId: "geometry-profile", name: "Profile", visible: true, layerId: "layer-default",
      transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    };
    cadDocument.features["feature-profile"] = {
      id: "feature-profile", type: "drawing", inputs: [], output: "profile",
      params: { kind: "rectangle", workPlane: "XY", points: profilePoints, topology: createDrawingTopology("rectangle", { points: profilePoints }, "profile") },
    };
    cadDocument.layers["layer-default"].objectIds.push("profile");
    cadDocument.rootObjects.push("profile");
    const extruded = await dispatchCadCommand({ type: "create-extrude", id: "plate", profileObjectIds: ["profile"], distance: 4 });
    assert.equal(extruded.ok, true);
    assert.equal(extruded.createdIds[0], "plate");
    const feature = cadDocument.features["feature-plate"];
    const topology = await enumerateSolidTopology(feature.params as Record<string, unknown>);
    assert.ok(topology.edges.length > 0);
    cadHistory.clear();
    const chamfered = await dispatchCadCommand({ type: "chamfer", target: "plate", edges: [topology.edges[0].key], distance: 1 });
    assert.equal(chamfered.ok, true);
    const chamferedId = chamfered.createdIds[0];
    assert.equal(typeof chamferedId, "string");
    assert.deepEqual(cadHistory.getPastLabels(), ["chamfer"]);
    installBox("block");
    cadDocument.objects.block.transform!.translation = [20, 0, 0];
    const unioned = await dispatchCadCommand({ type: "boolean-operation", operation: "union", target: chamferedId, tool: "block" });
    assert.equal(unioned.ok, true);
    const unionedId = unioned.createdIds[0];
    assert.equal(typeof unionedId, "string");
    assert.deepEqual(cadHistory.getPastLabels(), ["chamfer", "boolean-operation"]);
    assert.equal(undoDocument(), true);
    assert.ok(cadDocument.objects[chamferedId]);
  });
});
