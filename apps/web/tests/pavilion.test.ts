import { restoreTestDocument as restore } from "./helpers/documentHarness";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import type { CadDocument } from "@agent-webcad/cad-document";
import { cadDocument } from "../src/state/cadDocument";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { cadHistory, redoDocument, undoDocument } from "../src/state/history";
import { enumerateSolidTopology } from "../src/cad/kernelGeometryService";
import {
  buildPavilionBatch,
  PAVILION_COLUMN_IDS,
  PAVILION_ROOF_FILLET_RADIUS,
  PAVILION_ROOF_ID,
} from "../src/samples/pavilion";

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

describe("showcase pavilion", () => {
  test("one batch builds slab, columns, roof and doorway with one history entry", async () => {
    const result = await dispatchCadCommand(buildPavilionBatch("layer-default"));
    assert.equal(result.ok, true);
    const created = (result.createdIds ?? []).filter((id): id is string => typeof id === "string");
    // 8 creations (profile, slab, 4 columns, roof, door tool) + 1 cut result.
    assert.equal(created.length, 9);
    assert.deepEqual(cadHistory.getPastLabels(), ["Insert pavilion"]);
    for (const id of PAVILION_COLUMN_IDS) assert.ok(cadDocument.objects[id], id);
    assert.ok(cadDocument.objects[PAVILION_ROOF_ID]);
    // Slab and door tool are consumed by the doorway cut.
    const cutId = created.at(-1)!;
    const cutFeature = Object.values(cadDocument.features).find((entry) => entry.output === cutId);
    assert.equal(cutFeature?.type, "boolean");
    assert.equal(cadDocument.rootObjects.length, 7);
  });

  test("roof fillets, then undo removes the whole pavilion", async () => {
    const result = await dispatchCadCommand(buildPavilionBatch("layer-default"));
    assert.equal(result.ok, true);
    const roofFeature = Object.values(cadDocument.features).find((entry) => entry.output === PAVILION_ROOF_ID);
    assert.ok(roofFeature);
    const topology = await enumerateSolidTopology(roofFeature!.params as Record<string, unknown>);
    assert.equal(topology.edges.length, 12);
    const filletResult = await dispatchCadCommand({
      type: "fillet",
      target: PAVILION_ROOF_ID,
      edges: topology.edges.map((entry) => entry.key),
      radius: PAVILION_ROOF_FILLET_RADIUS,
    });
    const filletId = filletResult.createdIds[0];
    assert.equal(typeof filletId, "string");
    assert.equal(cadDocument.features[`feature-${filletId}`].type, "fillet");
    assert.equal(undoDocument(), true);
    assert.ok(cadDocument.objects[PAVILION_ROOF_ID]);
    assert.equal(undoDocument(), true);
    assert.equal(cadDocument.rootObjects.length, 0);
    assert.equal(redoDocument(), true);
    assert.equal(cadDocument.rootObjects.length, 7);
  });

  test("batch rolls back entirely when the layer is locked", async () => {
    cadDocument.layers["layer-default"].locked = true;
    const result = await dispatchCadCommand(buildPavilionBatch("layer-default"));
    assert.equal(result.ok, false);
    assert.equal(cadDocument.rootObjects.length, 0);
    assert.deepEqual(cadHistory.getPastLabels(), []);
    cadDocument.layers["layer-default"].locked = false;
  });
});
