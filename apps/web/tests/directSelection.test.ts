import assert from "node:assert/strict";
import { describe, test } from "node:test";
import * as THREE from "three";
import type { CadDocument } from "@agent-webcad/cad-document";
import { createDrawingTopology } from "../src/precision/drawingTopology";
import { buildDirectSelectionCandidates, nearestDirectSelectionCandidate, type DirectSelectionCandidate } from "../src/viewport/directSelection";

describe("direct-selection hit priority", () => {
  test("a topology handle wins over a coincident segment", () => {
    const candidates: DirectSelectionCandidate[] = [
      {
        objectId: "line",
        kind: "segment",
        topologyId: "segment",
        worldPoint: new THREE.Vector3(5, 0, 0),
        segment: [new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 0, 0)],
      },
      {
        objectId: "line",
        kind: "control",
        topologyId: "vertex",
        controlId: "vertex",
        worldPoint: new THREE.Vector3(0, 0, 0),
      },
    ];
    const selected = nearestDirectSelectionCandidate(
      candidates,
      new THREE.Vector2(1, 0),
      (point) => new THREE.Vector2(point.x, point.y),
    );
    assert.equal(selected?.kind, "control");
    assert.equal(selected?.topologyId, "vertex");
  });

  test("supports overlap cycling by excluding the current topology reference", () => {
    const candidates: DirectSelectionCandidate[] = [
      { objectId: "a", kind: "control", topologyId: "shared", controlId: "shared", worldPoint: new THREE.Vector3() },
      { objectId: "b", kind: "control", topologyId: "shared", controlId: "shared", worldPoint: new THREE.Vector3(1, 0, 0) },
    ];
    const selected = nearestDirectSelectionCandidate(
      candidates,
      new THREE.Vector2(0, 0),
      (point) => new THREE.Vector2(point.x, point.y),
      { objectId: "a", topologyId: "shared" },
    );
    assert.equal(selected?.objectId, "b");
  });

  test("candidate snapshots use stable topology ids and current visible world placement", () => {
    const points: [number, number, number][] = [[0, 0, 0], [10, 0, 0]];
    const topology = createDrawingTopology("line", { points }, "line");
    const document: CadDocument = {
      id: "direct-selection", revision: 1,
      objects: { line: { id: "line", geometryId: "line-geometry", name: "Line", visible: true, layerId: "layer" } },
      features: { feature: { id: "feature", type: "drawing", inputs: [], output: "line", params: { kind: "line", points, workPlane: "XY", topology } } },
      layers: { layer: { id: "layer", name: "Layer", visible: true, locked: false, objectIds: ["line"] } },
      rootObjects: ["line"], rootLayers: ["layer"],
    };
    const mesh = new THREE.Object3D();
    mesh.userData.drawingOrigin = [0, 0, 0];
    mesh.position.set(5, 7, 0);
    mesh.updateMatrixWorld(true);
    const renderObjects = new Map([["line", mesh]]);
    const candidates = buildDirectSelectionCandidates(document, renderObjects);
    assert.deepEqual(candidates.filter((entry) => entry.kind === "control").map((entry) => entry.topologyId), topology.controls.map((entry) => entry.id));
    assert.deepEqual(candidates.filter((entry) => entry.kind === "control").map((entry) => entry.worldPoint.toArray()), [[5, 7, 0], [15, 7, 0]]);
    document.layers.layer.locked = true;
    assert.equal(buildDirectSelectionCandidates(document, renderObjects).length, 0);
    document.layers.layer.locked = false;
    mesh.visible = false;
    assert.equal(buildDirectSelectionCandidates(document, renderObjects).length, 0);
  });
});
