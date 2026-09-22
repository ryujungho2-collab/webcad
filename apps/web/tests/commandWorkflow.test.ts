import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import type { CadDocument } from "@agent-webcad/cad-document";
import { createDrawingTopology } from "../src/precision/drawingTopology";
import { cadDocument } from "../src/state/cadDocument";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
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
    objects: {
      box: {
        id: "box",
        geometryId: "geometry-box",
        name: "Box",
        visible: true,
        layerId: "layer-default",
        transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      },
    },
    features: {
      "feature-box": {
        id: "feature-box",
        type: "primitive",
        inputs: [],
        output: "box",
        params: { kind: "box", width: 10, depth: 10, height: 10 },
      },
    },
    layers: {
      "layer-default": {
        id: "layer-default",
        name: "Default",
        visible: true,
        locked: false,
        objectIds: ["box"],
      },
    },
    rootObjects: ["box"],
    rootLayers: ["layer-default"],
  });
  cadHistory.clear();
}

beforeEach(resetDocument);
afterEach(() => {
  restore(original);
  cadHistory.clear();
});

describe("command/history precision workflows", () => {
  test("commits a successful batch as one history transaction", async () => {
    await dispatchCadCommand({
      type: "batch",
      commands: [
        { type: "move-object", objectId: "box", translation: [10, 0, 0] },
        { type: "rotate-object", objectId: "box", rotation: [0, 0, 90] },
      ],
    });
    assert.deepEqual(cadHistory.getPastLabels(), ["batch"]);
    assert.deepEqual(cadDocument.objects.box.transform?.translation, [10, 0, 0]);
    assert.equal(undoDocument(), true);
    assert.deepEqual(cadDocument.objects.box.transform?.translation, [0, 0, 0]);
    assert.equal(redoDocument(), true);
    assert.deepEqual(cadDocument.objects.box.transform?.translation, [10, 0, 0]);
  });

  test("rolls back every child and creates no history for a rejected batch", async () => {
    await dispatchCadCommand({
      type: "batch",
      commands: [
        { type: "move-object", objectId: "box", translation: [10, 0, 0] },
        { type: "move-object", objectId: "missing", translation: [20, 0, 0] },
      ],
    });
    assert.deepEqual(cadDocument.objects.box.transform?.translation, [0, 0, 0]);
    assert.deepEqual(cadHistory.getPastLabels(), []);
  });

  test("locked-layer edits reject atomically", async () => {
    cadDocument.layers["layer-default"].locked = true;
    await dispatchCadCommand({
      type: "batch",
      commands: [
        { type: "move-object", objectId: "box", translation: [10, 0, 0] },
        { type: "rotate-object", objectId: "box", rotation: [0, 0, 90] },
      ],
    });
    assert.deepEqual(cadDocument.objects.box.transform?.translation, [0, 0, 0]);
    assert.deepEqual(cadHistory.getPastLabels(), []);
  });

  test("deletes multiple objects as one undoable transaction", async () => {
    cadDocument.objects.box2 = {
      ...structuredClone(cadDocument.objects.box),
      id: "box2",
      geometryId: "geometry-box2",
      name: "Box 2",
    };
    cadDocument.features["feature-box2"] = {
      ...structuredClone(cadDocument.features["feature-box"]),
      id: "feature-box2",
      output: "box2",
    };
    cadDocument.layers["layer-default"].objectIds.push("box2");
    cadDocument.rootObjects.push("box2");

    await dispatchCadCommand({
      type: "batch",
      commands: [
        { type: "delete-object", objectId: "box" },
        { type: "delete-object", objectId: "box2" },
      ],
    });
    assert.deepEqual(cadHistory.getPastLabels(), ["batch"]);
    assert.equal(cadDocument.objects.box, undefined);
    assert.equal(cadDocument.objects.box2, undefined);
    assert.equal(undoDocument(), true);
    assert.ok(cadDocument.objects.box);
    assert.ok(cadDocument.objects.box2);
    assert.equal(redoDocument(), true);
    assert.equal(cadDocument.objects.box, undefined);
    assert.equal(cadDocument.objects.box2, undefined);
  });

  test("direct edit no-op creates no history and a real edit creates one", async () => {
    const topology = createDrawingTopology("line", { points: [[0, 0, 0], [10, 0, 0]] }, "line");
    cadDocument.objects.line = {
      id: "line",
      geometryId: "geometry-line",
      name: "Line",
      visible: true,
      layerId: "layer-default",
      transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    };
    cadDocument.features["feature-line"] = {
      id: "feature-line",
      type: "drawing",
      inputs: [],
      output: "line",
      params: { kind: "line", workPlane: "XY", points: [[0, 0, 0], [10, 0, 0]], topology },
    };
    cadDocument.layers["layer-default"].objectIds.push("line");
    cadDocument.rootObjects.push("line");

    await dispatchCadCommand({ type: "edit-drawing-control", objectId: "line", controlId: "line:vertex:0", point: [0, 0, 0] });
    assert.deepEqual(cadHistory.getPastLabels(), []);
    await dispatchCadCommand({ type: "edit-drawing-control", objectId: "line", controlId: "line:vertex:0", point: [2, 3, 0] });
    assert.deepEqual(cadHistory.getPastLabels(), ["edit-drawing-control"]);
  });

  test("offset commit creates one undoable document object", async () => {
    const topology = createDrawingTopology("line", { points: [[0, 0, 0], [10, 0, 0]] }, "line");
    cadDocument.objects.line = {
      id: "line",
      geometryId: "geometry-line",
      name: "Line",
      visible: true,
      layerId: "layer-default",
      transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    };
    cadDocument.features["feature-line"] = {
      id: "feature-line",
      type: "drawing",
      inputs: [],
      output: "line",
      params: { kind: "line", workPlane: "XY", points: [[0, 0, 0], [10, 0, 0]], topology },
    };
    cadDocument.layers["layer-default"].objectIds.push("line");
    cadDocument.rootObjects.push("line");
    const result = await dispatchCadCommand({ type: "offset-drawing", objectId: "line", distance: 2, side: "left" });
    assert.equal(typeof result, "string");
    assert.deepEqual(cadHistory.getPastLabels(), ["offset-drawing"]);
    assert.equal(cadDocument.rootObjects.length, 3);
    assert.equal(undoDocument(), true);
    assert.equal(cadDocument.rootObjects.length, 2);
    assert.equal(redoDocument(), true);
    assert.equal(cadDocument.rootObjects.length, 3);
  });

  test("duplicates drawing topology as a distinct undoable entity", async () => {
    const topology = createDrawingTopology("line", { points: [[0, 0, 0], [10, 0, 0]] }, "line");
    cadDocument.objects.line = {
      id: "line",
      geometryId: "geometry-line",
      name: "Line",
      visible: true,
      layerId: "layer-default",
      transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    };
    cadDocument.features["feature-line"] = {
      id: "feature-line",
      type: "drawing",
      inputs: [],
      output: "line",
      params: { kind: "line", workPlane: "XY", points: [[0, 0, 0], [10, 0, 0]], topology },
    };
    cadDocument.layers["layer-default"].objectIds.push("line");
    cadDocument.rootObjects.push("line");

    const duplicateId = await dispatchCadCommand({ type: "duplicate-object", objectId: "line" });
    assert.equal(typeof duplicateId, "string");
    const duplicateFeature = Object.values(cadDocument.features).find((feature) => feature.output === duplicateId);
    const duplicateTopology = duplicateFeature?.params.topology as typeof topology | undefined;
    assert.ok(duplicateTopology);
    assert.notDeepEqual(duplicateTopology.controls.map((control) => control.id), topology.controls.map((control) => control.id));
    assert.ok(duplicateTopology.controls.every((control) => control.id.startsWith(`${duplicateId}:`)));
    assert.deepEqual(cadHistory.getPastLabels(), ["duplicate-object"]);
    assert.equal(undoDocument(), true);
    assert.equal(cadDocument.objects[String(duplicateId)], undefined);
    assert.equal(redoDocument(), true);
    assert.ok(cadDocument.objects[String(duplicateId)]);
  });
});
