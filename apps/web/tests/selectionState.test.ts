import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import type { CadDocument } from "@agent-webcad/cad-document";
import { cadDocument } from "../src/state/cadDocument";
import { reduceSelection, selectAllIds, validSelection, type SelectionState } from "../src/state/selection";

const backup: CadDocument = structuredClone(cadDocument);

function installFixture() {
  cadDocument.id = "selection-test";
  cadDocument.revision = 0;
  cadDocument.objects = Object.fromEntries(["box-0", "box-1", "box-2", "box-3"].map((id, index) => [id, {
    id,
    geometryId: `geometry-${id}`,
    name: id,
    visible: true,
    layerId: index === 3 ? "layer-walls" : "layer-default",
  }]));
  cadDocument.features = {};
  cadDocument.layers = {
    "layer-default": { id: "layer-default", name: "Default", visible: true, locked: false, objectIds: ["box-0", "box-1", "box-2"] },
    "layer-walls": { id: "layer-walls", name: "Walls", visible: true, locked: false, objectIds: ["box-3"] },
  };
  cadDocument.rootObjects = ["box-0", "box-1", "box-2", "box-3"];
  cadDocument.rootLayers = ["layer-default", "layer-walls"];
}

function restoreDocument() {
  cadDocument.id = backup.id;
  cadDocument.objects = structuredClone(backup.objects);
  cadDocument.features = structuredClone(backup.features);
  cadDocument.sketches = structuredClone(backup.sketches);
  cadDocument.layers = structuredClone(backup.layers);
  cadDocument.rootObjects = [...backup.rootObjects];
  cadDocument.rootLayers = [...backup.rootLayers];
  cadDocument.revision = backup.revision;
}

beforeEach(installFixture);
afterEach(restoreDocument);

const empty: SelectionState = { ids: [], primaryId: null };

describe("multi-selection gestures", () => {
  test("click replaces selection and sets primary", () => {
    const first = reduceSelection(empty, "box-0");
    assert.deepEqual(first, { ids: ["box-0"], primaryId: "box-0", subObjects: [] });
    const replaced = reduceSelection(first, "box-1");
    assert.deepEqual(replaced, { ids: ["box-1"], primaryId: "box-1", subObjects: [] });
  });

  test("modifier click toggles and primary tracks the most recent", () => {
    let state = reduceSelection(empty, "box-0");
    state = reduceSelection(state, "box-1", true);
    state = reduceSelection(state, "box-2", true);
    assert.deepEqual(state.ids, ["box-0", "box-1", "box-2"]);
    assert.equal(state.primaryId, "box-2");
    state = reduceSelection(state, "box-2", true);
    assert.deepEqual(state.ids, ["box-0", "box-1"]);
    assert.equal(state.primaryId, "box-1");
  });

  test("empty-space click and Escape clear the selection", () => {
    const selected = reduceSelection(reduceSelection(empty, "box-0"), "box-1", true);
    assert.deepEqual(reduceSelection(selected, null), { ids: [], primaryId: null, subObjects: [] });
    assert.deepEqual(reduceSelection(selected, null, true), { ids: [], primaryId: null, subObjects: [] });
  });
});

describe("select-all scope", () => {
  test("claims visible objects on visible, unlocked layers", () => {
    assert.deepEqual(selectAllIds(cadDocument), ["box-0", "box-1", "box-2", "box-3"]);
    cadDocument.objects["box-1"].visible = false;
    cadDocument.layers["layer-walls"].locked = true;
    assert.deepEqual(selectAllIds(cadDocument), ["box-0", "box-2"]);
  });

  test("stays inside the active sketch and never claims document objects", () => {
    cadDocument.sketches = {
      "sketch-1": {
        id: "sketch-1",
        workPlane: "XY",
        layerId: "layer-default",
        geometry: [
          { id: "sk-1", kind: "line", startId: "p1", endId: "p2", segmentId: "s1", start: [0, 0], end: [10, 0] },
          { id: "sk-2", kind: "line", startId: "p3", endId: "p4", segmentId: "s2", start: [0, 0], end: [0, 10] },
        ],
        constraints: [],
        dimensions: [],
        solveState: { status: "under-constrained", degreesOfFreedom: 4, rank: 0, residual: 0, tolerance: 1e-9 },
      },
    };
    cadDocument.objects["sk-1"] = { id: "sk-1", geometryId: "geometry-sk-1", name: "sk-1", visible: true, layerId: "layer-default" };
    cadDocument.objects["sk-2"] = { id: "sk-2", geometryId: "geometry-sk-2", name: "sk-2", visible: false, layerId: "layer-default" };
    assert.deepEqual(selectAllIds(cadDocument, "sketch-1"), ["sk-1"]);
    assert.deepEqual(selectAllIds(cadDocument, "missing-sketch"), []);
  });
});

describe("selection cleanup", () => {
  test("drops deleted and hidden objects and reassigns primary", () => {
    delete cadDocument.objects["box-1"];
    cadDocument.objects["box-2"].visible = false;
    const cleaned = validSelection({ ids: ["box-0", "box-1", "box-2"], primaryId: "box-1" });
    assert.deepEqual(cleaned.ids, ["box-0"]);
    assert.equal(cleaned.primaryId, "box-0");
  });

  test("drops members moved to hidden or locked layers", () => {
    cadDocument.layers["layer-walls"].visible = false;
    assert.deepEqual(validSelection({ ids: ["box-0", "box-3"], primaryId: "box-3" }).ids, ["box-0"]);
    cadDocument.layers["layer-walls"].visible = true;
    cadDocument.layers["layer-walls"].locked = true;
    const cleaned = validSelection({ ids: ["box-0", "box-3"], primaryId: "box-3" });
    assert.deepEqual(cleaned.ids, ["box-0"]);
    assert.equal(cleaned.primaryId, "box-0");
  });

  test("keeps a valid multi-selection untouched", () => {
    const state: SelectionState = { ids: ["box-0", "box-1", "box-3"], primaryId: "box-3" };
    assert.deepEqual(validSelection(state), { ...state, subObjects: [] });
  });
});

describe("sub-object reference cleanup", () => {
  function installDrawing() {
    cadDocument.objects.line = {
      id: "line",
      geometryId: "geometry-line",
      name: "line",
      visible: true,
      layerId: "layer-default",
    };
    cadDocument.features["feature-line"] = {
      id: "feature-line",
      type: "drawing",
      inputs: [],
      output: "line",
      params: {
        kind: "line",
        workPlane: "XY",
        points: [[0, 0, 0], [10, 0, 0]],
        topology: {
          version: 1,
          controls: [{ id: "v0", role: "vertex", index: 0 }, { id: "v1", role: "vertex", index: 1 }],
          segments: [{ id: "s0", startControlId: "v0", endControlId: "v1", index: 0, kind: "line" }],
          curves: [],
        },
      },
    };
    cadDocument.layers["layer-default"].objectIds.push("line");
    cadDocument.rootObjects.push("line");
  }

  test("keeps live control and segment references", () => {
    installDrawing();
    const cleaned = validSelection({
      ids: ["line"],
      primaryId: "line",
      subObjects: [
        { objectId: "line", kind: "drawing-control", topologyId: "v1" },
        { objectId: "line", kind: "drawing-segment", topologyId: "s0" },
      ],
    });
    assert.deepEqual(cleaned.ids, ["line"]);
    assert.deepEqual(cleaned.subObjects, [
      { objectId: "line", kind: "drawing-control", topologyId: "v1" },
      { objectId: "line", kind: "drawing-segment", topologyId: "s0" },
    ]);
  });

  test("drops references to removed topology without dropping the object", () => {
    installDrawing();
    cadDocument.features["feature-line"].params.topology = {
      version: 1,
      controls: [{ id: "v0", role: "vertex", index: 0 }],
      segments: [],
      curves: [],
    };
    const cleaned = validSelection({
      ids: ["line"],
      primaryId: "line",
      subObjects: [
        { objectId: "line", kind: "drawing-control", topologyId: "v1" },
        { objectId: "line", kind: "drawing-segment", topologyId: "s0" },
        { objectId: "line", kind: "drawing-control", topologyId: "v0" },
      ],
    });
    assert.deepEqual(cleaned.ids, ["line"]);
    assert.equal(cleaned.primaryId, "line");
    assert.deepEqual(cleaned.subObjects, [{ objectId: "line", kind: "drawing-control", topologyId: "v0" }]);
  });

  test("drops sub-objects of deleted objects and object-kind passthrough", () => {
    installDrawing();
    delete cadDocument.objects.line;
    const cleaned = validSelection({
      ids: ["line", "box-0"],
      primaryId: "line",
      subObjects: [
        { objectId: "line", kind: "drawing-control", topologyId: "v1" },
        { objectId: "box-0", kind: "object", topologyId: "box-0" },
      ],
    });
    assert.deepEqual(cleaned.ids, ["box-0"]);
    assert.equal(cleaned.primaryId, "box-0");
    assert.deepEqual(cleaned.subObjects, [{ objectId: "box-0", kind: "object", topologyId: "box-0" }]);
  });
});
