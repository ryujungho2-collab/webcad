import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import type { CadDocument } from "@agent-webcad/cad-document";
import { validateCommand, type CadCommand } from "@agent-webcad/cad-commands";
import { createDrawingTopology } from "../src/precision/drawingTopology";
import { deserializeDocument, serializeDocument } from "../../../packages/cad-document/src/serialization";
import { cadDocument } from "../src/state/cadDocument";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { planDimensionFromSelection } from "../src/state/dimensionCommands";
import { cadHistory, redoDocument, undoDocument } from "../src/state/history";

const original = structuredClone(cadDocument);

function restore(snapshot: CadDocument) {
  cadDocument.id = snapshot.id;
  cadDocument.revision = snapshot.revision;
  cadDocument.objects = structuredClone(snapshot.objects);
  cadDocument.features = structuredClone(snapshot.features);
  cadDocument.layers = structuredClone(snapshot.layers);
  cadDocument.rootObjects = [...snapshot.rootObjects];
  cadDocument.rootLayers = [...snapshot.rootLayers];
}

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

function installLine(id: string) {
  const points: [number, number, number][] = [[0, 0, 0], [30, 40, 0]];
  cadDocument.objects[id] = {
    id, geometryId: `geometry-${id}`, name: "Line", visible: true, layerId: "layer-default",
    transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
  };
  cadDocument.features[`feature-${id}`] = {
    id: `feature-${id}`, type: "drawing", inputs: [], output: id,
    params: { kind: "line", workPlane: "XY", points, topology: createDrawingTopology("line", { points }, id) },
  };
  cadDocument.layers["layer-default"].objectIds.push(id);
  cadDocument.rootObjects.push(id);
}

function installCircle(id: string) {
  cadDocument.objects[id] = {
    id, geometryId: `geometry-${id}`, name: "Circle", visible: true, layerId: "layer-default",
    transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
  };
  cadDocument.features[`feature-${id}`] = {
    id: `feature-${id}`, type: "drawing", inputs: [], output: id,
    params: { kind: "circle", workPlane: "XY", center: [0, 0, 0], radius: 7, topology: createDrawingTopology("circle", { center: [0, 0, 0], radius: 7 }, id) },
  };
  cadDocument.layers["layer-default"].objectIds.push(id);
  cadDocument.rootObjects.push(id);
}

beforeEach(resetDocument);
afterEach(() => {
  restore(original);
  cadHistory.clear();
});

describe("dimension commands", () => {
  test("creates a linear dimension from a line as one history entry", async () => {
    installLine("line");
    const planned = planDimensionFromSelection(cadDocument, "line");
    assert.ok(planned);
    const result = await dispatchCadCommand({ ...planned!, layerId: "layer-default" });
    assert.equal(result.ok, true);
    const id = result.createdIds[0];
    assert.ok(id);
    assert.deepEqual(cadHistory.getPastLabels(), ["create-dimension"]);
    const feature = cadDocument.features[`feature-${id}`];
    assert.equal(feature.type, "dimension");
    assert.equal(feature.params.kind, "linear");
    const reopened = deserializeDocument(serializeDocument(cadDocument));
    assert.deepEqual(reopened.features[`feature-${id}`], feature);
    assert.equal(undoDocument(), true);
    assert.equal(cadDocument.objects[id], undefined);
    assert.equal(redoDocument(), true);
    assert.ok(cadDocument.objects[id]);
  });

  test("creates a radius dimension from a circle", async () => {
    installCircle("circ");
    const planned = planDimensionFromSelection(cadDocument, "circ");
    assert.ok(planned);
    const result = await dispatchCadCommand({ ...planned!, layerId: "layer-default" });
    assert.equal(result.ok, true);
    const feature = cadDocument.features[`feature-${result.createdIds[0]}`];
    assert.equal(feature.params.kind, "radius");
    assert.equal(feature.params.radius, 7);
  });

  test("updates offset, orientation, angle and text; no-op edits skip history", async () => {
    installLine("line");
    const planned = planDimensionFromSelection(cadDocument, "line");
    const created = await dispatchCadCommand({ ...planned!, layerId: "layer-default" });
    const id = created.createdIds[0];
    cadHistory.clear();

    const updated = await dispatchCadCommand({ type: "update-dimension", objectId: id, params: { offset: 25, orientation: "horizontal" } });
    assert.equal(updated.ok, true);
    assert.deepEqual(cadHistory.getPastLabels(), ["update-dimension"]);
    assert.equal(cadDocument.features[`feature-${id}`].params.offset, 25);

    assert.equal((await dispatchCadCommand({ type: "update-dimension", objectId: id, params: { offset: 25 } })).ok, false);
    assert.deepEqual(cadHistory.getPastLabels(), ["update-dimension"]);

    const texted = await dispatchCadCommand({ type: "update-dimension", objectId: id, params: { text: "" } });
    assert.equal(texted.ok, true);
    assert.equal(cadDocument.features[`feature-${id}`].params.text, null);
  });

  test("deletes a dimension like any other object", async () => {
    installLine("line");
    const planned = planDimensionFromSelection(cadDocument, "line");
    const created = await dispatchCadCommand({ ...planned!, layerId: "layer-default" });
    const id = created.createdIds[0];
    cadHistory.clear();
    const deleted = await dispatchCadCommand({ type: "delete-object", objectId: id });
    assert.equal(deleted.ok, true);
    assert.equal(cadDocument.objects[id], undefined);
    assert.equal(undoDocument(), true);
    assert.ok(cadDocument.objects[id]);
  });

  test("rejects invalid payloads and locked layers without history", async () => {
    installLine("line");
    const bad = { type: "create-dimension", dimension: "linear", params: { points: [[[0, 0], [0, 0]]] } };
    assert.equal(validateCommand(bad), false);
    await assert.rejects(dispatchCadCommand(bad as unknown as CadCommand), /Invalid CAD command payload/);
    cadDocument.layers["layer-default"].locked = true;
    assert.equal(planDimensionFromSelection(cadDocument, "line"), null);
    const locked = await dispatchCadCommand({
      type: "create-dimension", dimension: "linear",
      params: { workPlane: "XY", points: [[0, 0], [10, 0]], orientation: "aligned" },
    });
    assert.equal(locked.ok, false);
    cadDocument.layers["layer-default"].locked = false;
    assert.deepEqual(cadHistory.getPastLabels(), []);
  });

  test("unsupported selections plan nothing", () => {
    installLine("line");
    assert.equal(planDimensionFromSelection(cadDocument, "missing"), null);
    cadDocument.objects.line.visible = false;
    assert.equal(planDimensionFromSelection(cadDocument, "line"), null);
  });
});

describe("associative dimensions", () => {
  test("endpoint edits move the dimension inside the same history entry", async () => {
    installLine("line");
    const planned = planDimensionFromSelection(cadDocument, "line");
    const created = await dispatchCadCommand({ ...planned!, layerId: "layer-default" });
    const id = created.createdIds[0];

    await dispatchCadCommand({ type: "edit-drawing-control", objectId: "line", controlId: "line:vertex:1", point: [60, 0, 0] });
    assert.deepEqual(cadHistory.getPastLabels(), ["create-dimension", "edit-drawing-control"]);
    assert.deepEqual(cadDocument.features[`feature-${id}`].params.points, [[0, 0], [60, 0]]);

    assert.equal(undoDocument(), true);
    assert.deepEqual(cadDocument.features[`feature-${id}`].params.points, [[0, 0], [30, 40]]);
    assert.equal(redoDocument(), true);
    assert.deepEqual(cadDocument.features[`feature-${id}`].params.points, [[0, 0], [60, 0]]);
  });

  test("moves and circle edits follow; annotations survive refresh", async () => {
    installLine("line");
    const planned = planDimensionFromSelection(cadDocument, "line");
    const created = await dispatchCadCommand({ ...planned!, layerId: "layer-default" });
    const id = created.createdIds[0];
    await dispatchCadCommand({ type: "update-dimension", objectId: id, params: { offset: 25, text: "KEEP" } });

    await dispatchCadCommand({ type: "move-object", objectId: "line", translation: [5, 5, 0] });
    assert.deepEqual(cadDocument.features[`feature-${id}`].params.points, [[5, 5], [35, 45]]);
    assert.equal(cadDocument.features[`feature-${id}`].params.offset, 25);
    assert.equal(cadDocument.features[`feature-${id}`].params.text, "KEEP");

    installCircle("circ");
    const circPlanned = planDimensionFromSelection(cadDocument, "circ");
    const circCreated = await dispatchCadCommand({ ...circPlanned!, layerId: "layer-default" });
    const circId = circCreated.createdIds[0];
    await dispatchCadCommand({ type: "move-object", objectId: "circ", translation: [3, 4, 0] });
    assert.deepEqual(cadDocument.features[`feature-${circId}`].params.center, [3, 4]);
    assert.equal(cadDocument.features[`feature-${circId}`].params.radius, 7);
  });

  test("deleting the source freezes the annotation and drops the link", async () => {
    installLine("line");
    const planned = planDimensionFromSelection(cadDocument, "line");
    const created = await dispatchCadCommand({ ...planned!, layerId: "layer-default" });
    const id = created.createdIds[0];

    await dispatchCadCommand({ type: "delete-object", objectId: "line" });
    const feature = cadDocument.features[`feature-${id}`];
    assert.ok(feature);
    assert.deepEqual(feature.params.points, [[0, 0], [30, 40]]);
    assert.equal(feature.params.sourceObjectId, undefined);

    assert.equal(undoDocument(), true);
    assert.equal(cadDocument.features[`feature-${id}`].params.sourceObjectId, "line");
    assert.ok(cadDocument.objects.line);
  });

  test("no-op edits still create no history with dimensions present", async () => {
    installLine("line");
    const planned = planDimensionFromSelection(cadDocument, "line");
    await dispatchCadCommand({ ...planned!, layerId: "layer-default" });
    cadHistory.clear();
    await dispatchCadCommand({ type: "edit-drawing-control", objectId: "line", controlId: "line:vertex:0", point: [0, 0, 0] });
    assert.deepEqual(cadHistory.getPastLabels(), []);
  });
});
