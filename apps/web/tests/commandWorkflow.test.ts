import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import type { CadDocument } from "@agent-webcad/cad-document";
import { validateCommand, type CadCommand } from "@agent-webcad/cad-commands";
import { deserializeDocument, serializeDocument } from "../../../packages/cad-document/src/serialization";
import { createDrawingTopology } from "../src/precision/drawingTopology";
import { cadDocument } from "../src/state/cadDocument";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { cadHistory, redoDocument, undoDocument } from "../src/state/history";
import { validSelection } from "../src/state/selection";
import { buildBooleanMesh, buildExtrudeMesh } from "../src/cad/kernelGeometryService";

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

  test("uses a semantic batch label without changing transaction behavior", async () => {
    await dispatchCadCommand({
      type: "batch",
      label: "Move selection",
      commands: [
        { type: "move-object", objectId: "box", translation: [4, 5, 6] },
        { type: "rotate-object", objectId: "box", rotation: [0, 0, 30] },
      ],
    });
    assert.deepEqual(cadHistory.getPastLabels(), ["Move selection"]);
    assert.equal(undoDocument(), true);
    assert.deepEqual(cadDocument.objects.box.transform?.translation, [0, 0, 0]);
    assert.equal(redoDocument(), true);
    assert.deepEqual(cadDocument.objects.box.transform?.translation, [4, 5, 6]);
  });

  test("rejects batches with non-text labels before dispatch", async () => {
    const bad = {
      type: "batch",
      label: 42,
      commands: [{ type: "move-object", objectId: "box", translation: [1, 0, 0] }],
    };
    assert.equal(validateCommand(bad), false);
    await assert.rejects(dispatchCadCommand(bad as unknown as CadCommand), /Invalid CAD command payload/);
    assert.deepEqual(cadHistory.getPastLabels(), []);
    assert.deepEqual(cadDocument.objects.box.transform?.translation, [0, 0, 0]);
  });

  test("rejects a kernel-invalid boolean before mutating document or history", async () => {
    cadDocument.objects.tool = {
      ...structuredClone(cadDocument.objects.box),
      id: "tool",
      geometryId: "geometry-tool",
      name: "Invalid tool",
    };
    cadDocument.features["feature-tool"] = {
      ...structuredClone(cadDocument.features["feature-box"]),
      id: "feature-tool",
      output: "tool",
      params: { kind: "unsupported-test-primitive" },
    };
    cadDocument.layers["layer-default"].objectIds.push("tool");
    cadDocument.rootObjects.push("tool");
    const revision = cadDocument.revision;

    const result = await dispatchCadCommand({
      type: "boolean-operation",
      operation: "union",
      target: "box",
      tool: "tool",
    });

    assert.equal(result, undefined);
    assert.equal(cadDocument.revision, revision);
    assert.ok(cadDocument.objects.box);
    assert.ok(cadDocument.objects.tool);
    assert.deepEqual(cadHistory.getPastLabels(), []);
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

  test("offset preserves the source transform and mirrors on the right side", async () => {
    const topology = createDrawingTopology("line", { points: [[0, 0, 0], [10, 0, 0]] }, "moved-line");
    cadDocument.objects.line = {
      id: "line",
      geometryId: "geometry-line",
      name: "Line",
      visible: true,
      layerId: "layer-default",
      transform: { translation: [5, 5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
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
    const revision = cadDocument.revision;

    const id = await dispatchCadCommand({ type: "offset-drawing", objectId: "line", distance: 2, side: "right" });
    assert.equal(typeof id, "string");
    assert.deepEqual(cadHistory.getPastLabels(), ["offset-drawing"]);
    const copy = typeof id === "string" ? cadDocument.objects[id] : undefined;
    assert.deepEqual(copy?.transform?.translation, [5, 5, 0]);
    assert.equal(copy?.layerId, "layer-default");
    const copyFeature = Object.values(cadDocument.features).find((entry) => entry.output === id);
    assert.deepEqual(copyFeature?.type === "drawing" ? copyFeature.params.points : null, [[0, -2, 0], [10, -2, 0]]);
    assert.ok(copyFeature?.type === "drawing" && typeof (copyFeature.params.topology as { version?: number })?.version === "number");
    assert.equal(cadDocument.revision, revision + 1);
    assert.equal(undoDocument(), true);
    assert.equal(typeof id === "string" && cadDocument.objects[id] ? true : false, false);
  });

  test("offset rejects non-uniform scale, tilted planes and locked layers without history", async () => {
    const topology = createDrawingTopology("line", { points: [[0, 0, 0], [10, 0, 0]] }, "guard-line");
    cadDocument.objects.line = {
      id: "line",
      geometryId: "geometry-line",
      name: "Line",
      visible: true,
      layerId: "layer-default",
      transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [2, 1, 1] },
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
    const revision = cadDocument.revision;

    assert.equal(await dispatchCadCommand({ type: "offset-drawing", objectId: "line", distance: 2, side: "left" }), undefined);
    cadDocument.objects.line.transform!.scale = [1, 1, 1];
    cadDocument.objects.line.transform!.rotation = [0, 90, 0];
    assert.equal(await dispatchCadCommand({ type: "offset-drawing", objectId: "line", distance: 2, side: "left" }), undefined);
    cadDocument.objects.line.transform!.rotation = [0, 0, 0];
    cadDocument.layers["layer-default"].locked = true;
    assert.equal(await dispatchCadCommand({ type: "offset-drawing", objectId: "line", distance: 2, side: "left" }), undefined);
    cadDocument.layers["layer-default"].locked = false;

    assert.equal(cadDocument.revision, revision);
    assert.deepEqual(cadHistory.getPastLabels(), []);
    assert.ok(cadDocument.objects.line);
  });

  function installCornerProfile() {
    const topology = createDrawingTopology("polyline", { points: [[0, 0, 0], [10, 0, 0], [10, 10, 0]] }, "corner");
    cadDocument.objects.corner = {
      id: "corner", geometryId: "geometry-corner", name: "Corner", visible: true, layerId: "layer-default",
      transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    };
    cadDocument.features["feature-corner"] = {
      id: "feature-corner", type: "drawing", inputs: [], output: "corner",
      params: {
        kind: "polyline", workPlane: "XY", points: [[0, 0, 0], [10, 0, 0], [10, 10, 0]],
        topology: structuredClone(topology),
      },
    };
    cadDocument.layers["layer-default"].objectIds.push("corner");
    cadDocument.rootObjects.push("corner");
    return structuredClone(topology);
  }

  test("fillet corner commits one history entry with exact undo/redo", async () => {
    const original = installCornerProfile();
    const near = (actual: unknown, expected: [number, number, number][]) => {
      const points = actual as [number, number, number][];
      assert.equal(points.length, expected.length);
      points.forEach((point, index) => point.forEach((value, axis) => assert.ok(
        Math.abs(value - expected[index][axis]) < 1e-9,
        `${value} ≈ ${expected[index][axis]}`,
      )));
    };
    assert.equal(await dispatchCadCommand({ type: "edit-drawing-corner", objectId: "corner", controlId: "corner:vertex:1", treatment: "fillet", distance: 2 }), undefined);
    const feature = cadDocument.features["feature-corner"];
    near(feature.params.points, [[0, 0, 0], [8, 0, 0], [10, 2, 0], [10, 10, 0]]);
    assert.deepEqual(cadHistory.getPastLabels(), ["edit-drawing-corner"]);
    assert.equal(undoDocument(), true);
    assert.deepEqual(cadDocument.features["feature-corner"].params.points, [[0, 0, 0], [10, 0, 0], [10, 10, 0]]);
    assert.deepEqual(cadDocument.features["feature-corner"].params.topology, original);
    assert.equal(redoDocument(), true);
    near(cadDocument.features["feature-corner"].params.points, [[0, 0, 0], [8, 0, 0], [10, 2, 0], [10, 10, 0]]);
  });

  test("chamfer corner preserves transform and follows the treated vertex", async () => {
    installCornerProfile();
    cadDocument.objects.corner.transform!.translation = [5, 5, 5];
    assert.equal(await dispatchCadCommand({ type: "edit-drawing-corner", objectId: "corner", controlId: "corner:vertex:1", treatment: "chamfer", distance: 2 }), undefined);
    const feature = cadDocument.features["feature-corner"];
    assert.deepEqual(feature.params.points, [[0, 0, 0], [8, 0, 0], [10, 2, 0], [10, 10, 0]]);
    assert.deepEqual(feature.params.bulges, [0, 0, 0]);
    assert.deepEqual(cadDocument.objects.corner.transform?.translation, [5, 5, 5]);
    // The treated vertex id is retained by the first trim point, so the
    // sub-selection follows the edit instead of dangling. It now addresses
    // the trim point rather than the original corner (documented limitation
    // for future constraint anchoring).
    const cleaned = validSelection({
      ids: ["corner"],
      primaryId: "corner",
      subObjects: [{ objectId: "corner", kind: "drawing-control", topologyId: "corner:vertex:1" }],
    });
    assert.deepEqual(cleaned.ids, ["corner"]);
    assert.deepEqual(cleaned.subObjects, [{ objectId: "corner", kind: "drawing-control", topologyId: "corner:vertex:1" }]);
  });

  function installTrimPair() {
    const targetTopology = createDrawingTopology("line", { points: [[0, 0, 0], [10, 0, 0]] }, "tline");
    const cutterTopology = createDrawingTopology("line", { points: [[5, -5, 0], [5, 5, 0]] }, "cut");
    cadDocument.objects.tline = {
      id: "tline", geometryId: "geometry-tline", name: "Target", visible: true, layerId: "layer-default",
      transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    };
    cadDocument.objects.cut = {
      id: "cut", geometryId: "geometry-cut", name: "Cutter", visible: true, layerId: "layer-default",
      transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    };
    cadDocument.features["feature-tline"] = {
      id: "feature-tline", type: "drawing", inputs: [], output: "tline",
      params: { kind: "line", workPlane: "XY", points: [[0, 0, 0], [10, 0, 0]], topology: targetTopology },
    };
    cadDocument.features["feature-cut"] = {
      id: "feature-cut", type: "drawing", inputs: [], output: "cut",
      params: { kind: "line", workPlane: "XY", points: [[5, -5, 0], [5, 5, 0]], topology: cutterTopology },
    };
    cadDocument.layers["layer-default"].objectIds.push("tline", "cut");
    cadDocument.rootObjects.push("tline", "cut");
  }

  test("trim commits one history entry with exact undo/redo", async () => {
    installTrimPair();
    assert.equal(await dispatchCadCommand({ type: "trim-drawing", targetId: "tline", cutterId: "cut", pickPoint: [8, 0, 0] }), undefined);
    assert.deepEqual(cadDocument.features["feature-tline"].params.points, [[0, 0, 0], [5, 0, 0]]);
    assert.deepEqual(cadHistory.getPastLabels(), ["trim-drawing"]);
    assert.equal(undoDocument(), true);
    assert.deepEqual(cadDocument.features["feature-tline"].params.points, [[0, 0, 0], [10, 0, 0]]);
    assert.equal(redoDocument(), true);
    assert.deepEqual(cadDocument.features["feature-tline"].params.points, [[0, 0, 0], [5, 0, 0]]);
  });

  test("extend commits one history entry with exact undo/redo", async () => {
    installTrimPair();
    cadDocument.features["feature-tline"].params.points = [[0, 0, 0], [4, 0, 0]];
    assert.equal(await dispatchCadCommand({ type: "extend-drawing", targetId: "tline", cutterId: "cut", pickPoint: [3, 0, 0] }), undefined);
    assert.deepEqual(cadDocument.features["feature-tline"].params.points, [[0, 0, 0], [5, 0, 0]]);
    assert.deepEqual(cadHistory.getPastLabels(), ["extend-drawing"]);
    assert.equal(undoDocument(), true);
    assert.deepEqual(cadDocument.features["feature-tline"].params.points, [[0, 0, 0], [4, 0, 0]]);
    assert.equal(redoDocument(), true);
    assert.deepEqual(cadDocument.features["feature-tline"].params.points, [[0, 0, 0], [5, 0, 0]]);
  });

  test("trim rejects misses and locked layers without revision or history", async () => {
    installTrimPair();
    const revision = cadDocument.revision;
    cadDocument.features["feature-cut"].params.points = [[5, 10, 0], [5, 20, 0]];
    assert.equal(await dispatchCadCommand({ type: "trim-drawing", targetId: "tline", cutterId: "cut", pickPoint: [8, 0, 0] }), undefined);
    assert.equal(cadDocument.revision, revision);
    cadDocument.features["feature-cut"].params.points = [[5, -5, 0], [5, 5, 0]];
    cadDocument.layers["layer-default"].locked = true;
    assert.equal(await dispatchCadCommand({ type: "trim-drawing", targetId: "tline", cutterId: "cut", pickPoint: [8, 0, 0] }), undefined);
    cadDocument.layers["layer-default"].locked = false;
    assert.equal(cadDocument.revision, revision);
    assert.deepEqual(cadHistory.getPastLabels(), []);
    assert.deepEqual(cadDocument.features["feature-tline"].params.points, [[0, 0, 0], [10, 0, 0]]);
  });

  test("circle trim converts to arc with deterministic topology and remapped selection", async () => {
    const topology = createDrawingTopology("circle", { center: [0, 0, 0], radius: 5 }, "circ");
    cadDocument.objects.circ = {
      id: "circ", geometryId: "geometry-circ", name: "Circle", visible: true, layerId: "layer-default",
      transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    };
    cadDocument.objects.cut = {
      id: "cut", geometryId: "geometry-cut", name: "Cutter", visible: true, layerId: "layer-default",
      transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    };
    cadDocument.features["feature-circ"] = {
      id: "feature-circ", type: "drawing", inputs: [], output: "circ",
      params: { kind: "circle", workPlane: "XY", center: [0, 0, 0], radius: 5, topology },
    };
    const cutterTopology = createDrawingTopology("line", { points: [[3, -10, 0], [3, 10, 0]] }, "cut");
    cadDocument.features["feature-cut"] = {
      id: "feature-cut", type: "drawing", inputs: [], output: "cut",
      params: { kind: "line", workPlane: "XY", points: [[3, -10, 0], [3, 10, 0]], topology: cutterTopology },
    };
    cadDocument.layers["layer-default"].objectIds.push("circ", "cut");
    cadDocument.rootObjects.push("circ", "cut");

    assert.equal(await dispatchCadCommand({ type: "trim-drawing", targetId: "circ", cutterId: "cut", pickPoint: [-5, 0, 0] }), undefined);
    const feature = cadDocument.features["feature-circ"];
    assert.equal(feature.params.kind, "arc");
    assert.equal(feature.params.radius, 5);
    const rebuilt = feature.params.topology as { controls: { id: string }[]; curves: { id: string }[] };
    assert.deepEqual(rebuilt.controls.map((entry) => entry.id), ["circ:center:0", "circ:start:0", "circ:end:0"]);
    assert.deepEqual(rebuilt.curves.map((entry) => entry.id), ["circ:curve:0"]);
    assert.deepEqual(cadHistory.getPastLabels(), ["trim-drawing"]);

    const cleaned = validSelection({
      ids: ["circ"],
      primaryId: "circ",
      subObjects: [
        { objectId: "circ", kind: "drawing-curve", topologyId: "circ:curve:0" },
        { objectId: "circ", kind: "drawing-control", topologyId: "circ:radius:0" },
      ],
    });
    assert.deepEqual(cleaned.ids, ["circ"]);
    assert.deepEqual(cleaned.subObjects, [{ objectId: "circ", kind: "drawing-curve", topologyId: "circ:curve:0" }]);
    assert.equal(undoDocument(), true);
    assert.equal(cadDocument.features["feature-circ"].params.kind, "circle");
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

  async function installExtrudedWall(id: string, width: number, depth: number, distance: number) {
    const wallPoints: [number, number, number][] = [[0, 0, 0], [width, 0, 0], [width, depth, 0], [0, depth, 0]];
    cadDocument.objects[`${id}-profile`] = {
      id: `${id}-profile`, geometryId: `geometry-${id}-profile`, name: "Wall profile", visible: true, layerId: "layer-default",
      transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    };
    cadDocument.features[`feature-${id}-profile`] = {
      id: `feature-${id}-profile`, type: "drawing", inputs: [], output: `${id}-profile`,
      params: { kind: "rectangle", workPlane: "XY", points: wallPoints, topology: createDrawingTopology("rectangle", { points: wallPoints }, `${id}-profile`) },
    };
    cadDocument.layers["layer-default"].objectIds.push(`${id}-profile`);
    cadDocument.rootObjects.push(`${id}-profile`);
    const created = await dispatchCadCommand({ type: "create-extrude", id, profileObjectIds: [`${id}-profile`], distance });
    assert.equal(created, id);
    return id;
  }

  async function installSolidBox(id: string, size: [number, number, number], position: [number, number, number]) {
    const created = await dispatchCadCommand({
      type: "create-primitive", id, primitive: "box",
      params: { width: size[0], depth: size[1], height: size[2] }, position,
    });
    assert.equal(created, id);
    return id;
  }

  test("cuts a window opening through an extruded wall as one history entry", async () => {
    await installExtrudedWall("wall", 20, 12, 10);
    await installSolidBox("plug", [4, 4, 12], [8, 4, -1]);
    cadHistory.clear();
    const revision = cadDocument.revision;

    const result = await dispatchCadCommand({ type: "boolean-operation", operation: "cut", target: "wall", tool: "plug" });
    assert.equal(typeof result, "string");
    assert.deepEqual(cadHistory.getPastLabels(), ["boolean-operation"]);
    assert.equal(cadDocument.revision, revision + 1);
    const feature = typeof result === "string" ? cadDocument.features[`feature-${result}`] : undefined;
    assert.equal(feature?.type, "boolean");
    assert.deepEqual(feature?.inputs, ["wall", "plug"]);
    assert.ok(!cadDocument.objects.wall && !cadDocument.objects.plug);
    const mesh = typeof result === "string" ? await buildBooleanMesh(feature.params as Record<string, unknown>) : null;
    assert.ok(mesh && mesh.positions.length > 0 && mesh.indices.length > 0);

    assert.equal(undoDocument(), true);
    assert.ok(cadDocument.objects.wall && cadDocument.objects.plug);
    assert.equal(typeof result === "string" && cadDocument.objects[result] ? true : false, false);
    assert.equal(redoDocument(), true);
    assert.ok(typeof result === "string" && cadDocument.objects[result]);
  });

  test("unions an extrusion with a primitive and nests booleans", async () => {
    await installExtrudedWall("plate", 10, 10, 4);
    await installSolidBox("block", [6, 6, 6], [2, 2, 2]);
    await installSolidBox("cap", [4, 4, 4], [0, 0, 8]);
    cadHistory.clear();

    const first = await dispatchCadCommand({ type: "boolean-operation", operation: "union", target: "plate", tool: "block" });
    assert.equal(typeof first, "string");
    assert.deepEqual(cadHistory.getPastLabels(), ["boolean-operation"]);
    const second = await dispatchCadCommand({ type: "boolean-operation", operation: "union", target: first as string, tool: "cap" });
    assert.equal(typeof second, "string");
    assert.deepEqual(cadHistory.getPastLabels(), ["boolean-operation", "boolean-operation"]);
    const nested = typeof second === "string" ? cadDocument.features[`feature-${second}`] : undefined;
    assert.equal(nested?.type, "boolean");
    assert.equal(undoDocument(), true);
    assert.ok(typeof first === "string" && cadDocument.objects[first]);
    assert.equal(undoDocument(), true);
    assert.ok(cadDocument.objects.plate && cadDocument.objects.block);
  });

  test("uses an extrusion as the boolean tool", async () => {
    await installSolidBox("block", [10, 10, 10], [0, 0, 0]);
    await installExtrudedWall("punch", 4, 4, 14);
    cadHistory.clear();
    const result = await dispatchCadCommand({ type: "boolean-operation", operation: "cut", target: "block", tool: "punch" });
    assert.equal(typeof result, "string");
    assert.deepEqual(cadHistory.getPastLabels(), ["boolean-operation"]);
    assert.equal(undoDocument(), true);
    assert.ok(cadDocument.objects.block && cadDocument.objects.punch);
  });

  test("rejects drawing operands, scaled solids and locked layers without history", async () => {
    await installExtrudedWall("wall", 20, 12, 10);
    await installSolidBox("plug", [4, 4, 12], [8, 4, -1]);
    cadDocument.objects.line = {
      id: "line", geometryId: "geometry-line", name: "Line", visible: true, layerId: "layer-default",
      transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    };
    cadDocument.features["feature-line"] = {
      id: "feature-line", type: "drawing", inputs: [], output: "line",
      params: { kind: "line", workPlane: "XY", points: [[0, 0, 0], [10, 0, 0]], topology: createDrawingTopology("line", { points: [[0, 0, 0], [10, 0, 0]] }, "line") },
    };
    cadDocument.layers["layer-default"].objectIds.push("line");
    cadDocument.rootObjects.push("line");
    cadHistory.clear();
    const revision = cadDocument.revision;

    assert.equal(await dispatchCadCommand({ type: "boolean-operation", operation: "cut", target: "wall", tool: "line" }), undefined);
    cadDocument.objects.plug.transform!.scale = [2, 2, 2];
    assert.equal(await dispatchCadCommand({ type: "boolean-operation", operation: "cut", target: "wall", tool: "plug" }), undefined);
    cadDocument.objects.plug.transform!.scale = [1, 1, 1];
    cadDocument.layers["layer-default"].locked = true;
    assert.equal(await dispatchCadCommand({ type: "boolean-operation", operation: "cut", target: "wall", tool: "plug" }), undefined);
    cadDocument.layers["layer-default"].locked = false;

    assert.equal(cadDocument.revision, revision);
    assert.deepEqual(cadHistory.getPastLabels(), []);
    assert.ok(cadDocument.objects.wall && cadDocument.objects.plug);
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
