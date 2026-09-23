import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import type { CadDocument } from "@agent-webcad/cad-document";
import { deserializeDocument, serializeDocument } from "../../../packages/cad-document/src/serialization";
import { createDrawingTopology } from "../src/precision/drawingTopology";
import { cadDocument } from "../src/state/cadDocument";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { cadHistory, redoDocument, undoDocument } from "../src/state/history";
import { buildExtrudeMesh } from "../src/viewport/kernelGeometryService";

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
  test("duplicates with explicit spacing as one batch and restores it on undo/redo", async () => {
    const result = await dispatchCadCommand({ type: "batch", commands: [
      { type: "duplicate-object", objectId: "box", offset: [1200, 0, 0] },
      { type: "duplicate-object", objectId: "box", offset: [0, 2400, 0] },
    ] }) as { accepted: boolean; results: string[] };
    assert.equal(result.accepted, true);
    assert.deepEqual(result.results.map((id) => cadDocument.objects[id].transform?.translation), [[1200, 0, 0], [0, 2400, 0]]);
    assert.deepEqual(cadHistory.getPastLabels(), ["batch"]);
    assert.equal(undoDocument(), true);
    assert.equal(result.results.every((id) => !cadDocument.objects[id]), true);
    assert.equal(redoDocument(), true);
    assert.deepEqual(result.results.map((id) => cadDocument.objects[id].transform?.translation), [[1200, 0, 0], [0, 2400, 0]]);
  });

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

  test("corner treatment and profile closure are deterministic single history operations", async () => {
    const profilePoints: [number, number, number][] = [[0, 0, 0], [10, 0, 0], [10, 10, 0]];
    const topology = createDrawingTopology("polyline", { points: profilePoints }, "profile");
    cadDocument.objects.profile = {
      id: "profile", geometryId: "geometry-profile", name: "Profile", visible: true, layerId: "layer-default",
      transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    };
    cadDocument.features["feature-profile"] = {
      id: "feature-profile", type: "drawing", inputs: [], output: "profile",
      params: { kind: "polyline", workPlane: "XY", points: profilePoints, topology },
    };
    cadDocument.layers["layer-default"].objectIds.push("profile");
    cadDocument.rootObjects.push("profile");

    await dispatchCadCommand({ type: "edit-drawing-corner", objectId: "profile", controlId: "profile:vertex:1", treatment: "fillet", distance: 2 });
    assert.deepEqual(cadHistory.getPastLabels(), ["edit-drawing-corner"]);
    assert.equal(cadDocument.features["feature-profile"].params.kind, "polyline");
    assert.equal((cadDocument.features["feature-profile"].params.points as unknown[]).length, 4);
    assert.equal(undoDocument(), true);
    assert.equal((cadDocument.features["feature-profile"].params.points as unknown[]).length, 3);
    assert.equal(redoDocument(), true);
    assert.equal((cadDocument.features["feature-profile"].params.points as unknown[]).length, 4);

    cadHistory.clear();
    await dispatchCadCommand({ type: "close-drawing-profile", objectId: "profile" });
    assert.deepEqual(cadHistory.getPastLabels(), ["close-drawing-profile"]);
    assert.equal(cadDocument.features["feature-profile"].params.closed, true);
    assert.equal(undoDocument(), true);
    assert.equal(cadDocument.features["feature-profile"].params.closed, false);
  });

  test("rejected corner treatment creates no history entry", async () => {
    const profilePoints: [number, number, number][] = [[0, 0, 0], [10, 0, 0], [10, 10, 0]];
    const topology = createDrawingTopology("polyline", { points: profilePoints }, "profile");
    cadDocument.objects.profile = {
      id: "profile", geometryId: "geometry-profile", name: "Profile", visible: true, layerId: "layer-default",
      transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    };
    cadDocument.features["feature-profile"] = { id: "feature-profile", type: "drawing", inputs: [], output: "profile", params: { kind: "polyline", workPlane: "XY", points: profilePoints, topology } };
    cadDocument.layers["layer-default"].objectIds.push("profile");
    cadDocument.rootObjects.push("profile");
    await dispatchCadCommand({ type: "edit-drawing-corner", objectId: "profile", controlId: "profile:vertex:1", treatment: "fillet", distance: 50 });
    assert.deepEqual(cadHistory.getPastLabels(), []);
    assert.deepEqual(cadDocument.features["feature-profile"].params.points, profilePoints);
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

  test("creates and edits a kernel-backed extrusion as one history entry per operation", async () => {
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

    const id = await dispatchCadCommand({ type: "create-extrude", id: "extrude-test", profileObjectIds: ["profile"], distance: 12 });
    assert.equal(id, "extrude-test");
    assert.deepEqual(cadHistory.getPastLabels(), ["create-extrude"]);
    const feature = cadDocument.features["feature-extrude-test"];
    assert.equal(feature.type, "extrude");
    assert.deepEqual(feature.inputs, ["profile"]);
    assert.equal(feature.params.distance, 12);
    const sourceRefs = (feature.params.profile as { sourceTopologyIds: string[] }).sourceTopologyIds;
    assert.equal(sourceRefs.every((entry) => entry.startsWith("profile/")), true);

    await dispatchCadCommand({ type: "update-extrude", objectId: "extrude-test", distance: 20 });
    assert.deepEqual(cadHistory.getPastLabels(), ["create-extrude", "update-extrude"]);
    assert.equal(cadDocument.features["feature-extrude-test"].params.distance, 20);
    assert.equal(undoDocument(), true);
    assert.equal(cadDocument.features["feature-extrude-test"].params.distance, 12);
    assert.equal(undoDocument(), true);
    assert.equal(cadDocument.objects["extrude-test"], undefined);
    assert.equal(redoDocument(), true);
    assert.equal(cadDocument.features["feature-extrude-test"].params.distance, 12);
    const reopened = deserializeDocument(serializeDocument(cadDocument));
    assert.deepEqual(reopened.features["feature-extrude-test"], cadDocument.features["feature-extrude-test"]);
    assert.ok(reopened.objects["extrude-test"]);
    const reopenedMesh = await buildExtrudeMesh(reopened.features["feature-extrude-test"].params);
    assert.ok(reopenedMesh.positions.length > 0 && reopenedMesh.indices.length > 0);
  });

  test("rejects an open extrusion profile without document or history mutation", async () => {
    const linePoints: [number, number, number][] = [[0, 0, 0], [10, 0, 0]];
    cadDocument.objects.profile = {
      id: "profile", geometryId: "geometry-profile", name: "Open profile", visible: true, layerId: "layer-default",
      transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    };
    cadDocument.features["feature-profile"] = {
      id: "feature-profile", type: "drawing", inputs: [], output: "profile",
      params: { kind: "line", workPlane: "XY", points: linePoints, topology: createDrawingTopology("line", { points: linePoints }, "profile") },
    };
    cadDocument.layers["layer-default"].objectIds.push("profile");
    cadDocument.rootObjects.push("profile");
    const beforeRevision = cadDocument.revision;
    const result = await dispatchCadCommand({ type: "create-extrude", profileObjectIds: ["profile"], distance: 10 });
    assert.equal(result, undefined);
    assert.equal(cadDocument.revision, beforeRevision);
    assert.deepEqual(cadHistory.getPastLabels(), []);
  });
});
