import assert from "node:assert/strict";
import { describe, test } from "node:test";
import * as THREE from "three";
import { nearestDirectSelectionCandidate, type DirectSelectionCandidate } from "../src/viewport/directSelection";

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
});
