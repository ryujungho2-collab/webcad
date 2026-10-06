import { restoreTestDocument as restore } from "./helpers/documentHarness";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import type { CadDocument } from "@agent-webcad/cad-document";
import { createDrawingTopology } from "../src/precision/drawingTopology";
import { cadDocument } from "../src/state/cadDocument";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { cadHistory, redoDocument, undoDocument } from "../src/state/history";
import { validSelection } from "../src/state/selection";
import { buildBooleanMesh, buildPrimitiveMesh, enumerateSolidTopology, resolveBrepReference } from "../src/cad/kernelGeometryService";

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

const boxParams = { kind: "box", width: 10, depth: 10, height: 10 };

function rectProfile(x: number, y: number, z: number, size: number, height: number) {
  const corners: [number, number, number][] = [[x, y, z], [x + size, y, z], [x + size, y + size, z], [x, y + size, z]];
  return {
    kind: "extrude",
    distance: height,
    profile: {
      id: "loop:test",
      normal: [0, 0, 1] as [number, number, number],
      segments: corners.map((start, index) => ({
        kind: "line" as const,
        topologyReference: `test:${index}`,
        start,
        end: corners[(index + 1) % corners.length],
      })),
    },
  };
}

describe("brep topology references", () => {
  test("enumerates six unique deterministic faces for a box", async () => {
    const first = await enumerateSolidTopology(boxParams);
    const second = await enumerateSolidTopology(boxParams);
    assert.deepEqual(first.faces, second.faces);
    assert.equal(first.faces.length, 6);
    assert.equal(new Set(first.faces.map((entry) => entry.key)).size, 6);
  });

  test("enumerates twelve unique deterministic edges for a box", async () => {
    const first = await enumerateSolidTopology(boxParams);
    const second = await enumerateSolidTopology(boxParams);
    assert.deepEqual(first.edges, second.edges);
    assert.equal(first.edges.length, 12);
    assert.equal(new Set(first.edges.map((entry) => entry.key)).size, 12);
    assert.ok(first.edges.every((entry) => entry.points.length >= 2));
  });

  test("attributes every mesh triangle to exactly one enumerated face", async () => {
    const mesh = await buildPrimitiveMesh(boxParams);
    const ranges = mesh.faces ?? [];
    assert.equal(ranges.length, 6);
    const total = ranges.reduce((sum, entry) => sum + entry.count, 0);
    assert.equal(total, mesh.indices.length / 3);
    const ordered = ranges.slice().sort((a, b) => a.start - b.start);
    assert.deepEqual(ordered.map((entry) => entry.start), ordered.map((_, index) => (index === 0 ? 0 : ordered[index - 1].start + ordered[index - 1].count)));
    const topology = await enumerateSolidTopology(boxParams);
    assert.deepEqual(ranges.map((entry) => entry.key), topology.faces.map((entry) => entry.key));
  });

  test("enumerates cylinder faces and circular edges", async () => {
    const params = { kind: "cylinder", radius: 5, height: 12 };
    const topology = await enumerateSolidTopology(params);
    assert.equal(topology.faces.length, 3);
    assert.equal(new Set(topology.faces.map((entry) => entry.key)).size, 3);
    assert.equal(topology.edges.length, 3);
    assert.equal(new Set(topology.edges.map((entry) => entry.key)).size, 3);
    const repeat = await enumerateSolidTopology(params);
    assert.deepEqual(repeat, topology);
  });

  test("rebuild scenario: untouched edges resolve, changed edges honestly dangle", async () => {
    const plateAt = (x: number, y: number, z: number, size = 20, height = 4) => ({
      ...rectProfile(x, y, z, size, height),
    });
    const cutWith = (tool: Record<string, unknown>) => ({
      operation: "cut",
      operands: [{ params: boxParams }, { params: tool, transform: { translation: [0, 0, 0] } }],
    });
    const boxKeys = new Set((await enumerateSolidTopology(boxParams)).edges.map((entry) => entry.key));
    // Both tools stay below z = 3, so the top far edge survives every cut here.
    const topEdge = (key: string) =>
      key.includes("0.000000,10.000000,10.000000") && key.includes("10.000000,10.000000,10.000000");
    const first = await enumerateSolidTopology(cutWith(plateAt(8, 8, -1)));
    const keptKey = first.edges.map((entry) => entry.key).find(topEdge);
    assert.ok(keptKey, "expected an untouched top edge");
    const cutCreated = first.edges.map((entry) => entry.key).filter((key) => !boxKeys.has(key));
    assert.ok(cutCreated.length > 0, "expected cut-created edges beyond the box topology");

    // Same box, disjoint cut footprint: untouched edge resolves, cut-created do not.
    const secondParams = cutWith(plateAt(-15, -15, -1));
    const second = await enumerateSolidTopology(secondParams);
    assert.ok(second.edges.length > 0);
    assert.equal(await resolveBrepReference(secondParams, "brep-edge", keptKey!), true);
    for (const key of cutCreated) {
      assert.equal(await resolveBrepReference(secondParams, "brep-edge", key), false);
    }
    assert.equal(await resolveBrepReference(cutWith(plateAt(8, 8, -1)), "brep-edge", "edge:line:999.000000,0.000000,0.000000|999.000000,1.000000,0.000000|1.000000"), false);

    // Modified upstream (wider box): the old edge geometry is gone, so the
    // reference honestly dangles instead of resolving to wrong geometry.
    const grownParams = {
      operation: "cut",
      operands: [{ params: { kind: "box", width: 14, depth: 10, height: 10 } }, { params: plateAt(8, 8, -1), transform: { translation: [0, 0, 0] } }],
    };
    const grown = await enumerateSolidTopology(grownParams);
    assert.ok(grown.edges.length > 0);
    assert.equal(await resolveBrepReference(grownParams, "brep-edge", keptKey!), false);
  }, { timeout: 180000 });
});

describe("brep selection across undo and redo", () => {
  async function installCutResult() {
    const wallPoints: [number, number, number][] = [[0, 0, 0], [20, 0, 0], [20, 12, 0], [0, 12, 0]];
    cadDocument.objects.wall = {
      id: "wall", geometryId: "geometry-wall", name: "Wall", visible: true, layerId: "layer-default",
      transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    };
    cadDocument.features["feature-wall"] = {
      id: "feature-wall", type: "drawing", inputs: [], output: "wall",
      params: { kind: "rectangle", workPlane: "XY", points: wallPoints, topology: createDrawingTopology("rectangle", { points: wallPoints }, "wall") },
    };
    cadDocument.layers["layer-default"].objectIds.push("wall");
    cadDocument.rootObjects.push("wall");
    const wallId = await dispatchCadCommand({ type: "create-extrude", id: "plate", profileObjectIds: ["wall"], distance: 10 });
    assert.equal(wallId.ok, true);
    assert.equal(wallId.createdIds[0], "plate");
    const plugId = await dispatchCadCommand({
      type: "create-primitive", id: "plug", primitive: "box",
      params: { width: 4, depth: 4, height: 12 }, position: [8, 4, -1],
    });
    assert.equal(plugId.ok, true);
    assert.equal(plugId.createdIds[0], "plug");
    cadHistory.clear();
    const result = await dispatchCadCommand({ type: "boolean-operation", operation: "cut", target: "plate", tool: "plug" });
    assert.equal(result.ok, true);
    const id = result.createdIds[0];
    assert.equal(typeof id, "string");
    return id;
  }

  test("extrude, cut, select edge, undo, redo keeps selection sane", async () => {
    const result = await installCutResult();
    const feature = cadDocument.features[`feature-${result}`];
    const topology = await enumerateSolidTopology(feature.params as Record<string, unknown>);
    assert.ok(topology.edges.length > 0 && topology.faces.length > 0);
    const key = topology.edges[0].key;
    assert.equal(await resolveBrepReference(feature.params as Record<string, unknown>, "brep-edge", key), true);

    const selected = { ids: [result], primaryId: result, subObjects: [{ objectId: result, kind: "brep-edge" as const, topologyId: key }] };
    assert.deepEqual(validSelection(selected).subObjects, selected.subObjects);

    assert.equal(undoDocument(), true);
    const afterUndo = validSelection(selected);
    assert.deepEqual(afterUndo.ids, []);
    assert.deepEqual(afterUndo.subObjects, []);
    assert.ok(cadDocument.objects.plate && cadDocument.objects.plug);

    assert.equal(redoDocument(), true);
    const redone = cadDocument.features[`feature-${result}`];
    assert.ok(redone);
    const afterRedo = validSelection(selected);
    assert.deepEqual(afterRedo.ids, [result]);
    assert.deepEqual(await resolveBrepReference(redone.params as Record<string, unknown>, "brep-edge", key), true);
    const mesh = await buildBooleanMesh(redone.params as Record<string, unknown>);
    const ranges = mesh.faces ?? [];
    assert.ok(ranges.some((entry) => entry.key && ranges.reduce((sum, range) => sum + range.count, 0) === mesh.indices.length / 3));
  }, { timeout: 180000 });

  test("brep references respect object validity like any selection", async () => {
    cadDocument.objects.solid = {
      id: "solid", geometryId: "geometry-solid", name: "Solid", visible: true, layerId: "layer-default",
      transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    };
    cadDocument.features["feature-solid"] = {
      id: "feature-solid", type: "primitive", inputs: [], output: "solid", params: { kind: "box", width: 4, depth: 4, height: 4 },
    };
    cadDocument.layers["layer-default"].objectIds.push("solid");
    cadDocument.rootObjects.push("solid");
    const ref = { objectId: "solid", kind: "brep-face" as const, topologyId: "face:stub" };
    assert.deepEqual(validSelection({ ids: ["solid"], primaryId: "solid", subObjects: [ref] }).subObjects, [ref]);
    delete cadDocument.objects.solid;
    assert.deepEqual(validSelection({ ids: ["solid"], primaryId: "solid", subObjects: [ref] }).subObjects, []);
    cadDocument.objects.solid = {
      id: "solid", geometryId: "geometry-solid", name: "Solid", visible: false, layerId: "layer-default",
    };
    assert.deepEqual(validSelection({ ids: ["solid"], primaryId: "solid", subObjects: [ref] }).ids, []);
    cadDocument.objects.solid.visible = true;
    cadDocument.layers["layer-default"].locked = true;
    assert.deepEqual(validSelection({ ids: ["solid"], primaryId: "solid", subObjects: [ref] }).ids, []);
  });
});
