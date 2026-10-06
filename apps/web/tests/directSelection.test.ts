import assert from "node:assert/strict";
import { describe, test } from "node:test";
import * as THREE from "three";
import type { CadDocument } from "@agent-webcad/cad-document";
import { createDrawingTopology } from "../src/precision/drawingTopology";
import { buildDirectSelectionCandidates, directSelectionHits, sameDirectTarget, nearestDirectSelectionCandidate, type DirectSelectionCandidate } from "../src/viewport/directSelection";
import { describeDirectTarget } from "../src/viewport/directTargetDescription";

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
  test("an explicit overlap choice retains all three objects with the same topology ID instead of toggling between two",()=>{
    const candidates:DirectSelectionCandidate[]=["a","b","c"].map(objectId=>({objectId,kind:"control",topologyId:"end",controlId:"end",worldPoint:new THREE.Vector3(100,0,0)}));
    const hits=directSelectionHits([...candidates,candidates[1]],new THREE.Vector2(100,0),p=>new THREE.Vector2(p.x,p.y));
    assert.deepEqual(hits.map(h=>h.candidate.objectId),["a","b","c"]);assert.equal(sameDirectTarget(hits[0].candidate,hits[1].candidate),false);
    assert.equal(nearestDirectSelectionCandidate(candidates,new THREE.Vector2(100,0),p=>new THREE.Vector2(p.x,p.y))?.objectId,"a");
  });
  test("screen hit tolerance is independent of model scale and excludes nearby references beyond the selection aperture",()=>{
    const candidates:DirectSelectionCandidate[]=[{objectId:"line",kind:"segment",topologyId:"edge",worldPoint:new THREE.Vector3(500,0,0),segment:[new THREE.Vector3(0,0,0),new THREE.Vector3(1000,0,0)]},
      {objectId:"nearby",kind:"control",topologyId:"point",worldPoint:new THREE.Vector3(500,130,0)}];
    const hits=directSelectionHits(candidates,new THREE.Vector2(50,0),p=>new THREE.Vector2(p.x/10,p.y/10));assert.deepEqual(hits.map(h=>h.candidate.objectId),["line"]);assert.deepEqual(hits[0].candidate.worldPoint.toArray(),[500,0,0]);
  });
  test("curve selection includes the rendered span between samples without moving source samples",()=>{
    const samples=[new THREE.Vector3(0,0,0),new THREE.Vector3(100,0,0)],candidate:DirectSelectionCandidate={objectId:"curve",kind:"curve",topologyId:"arc",worldPoint:samples[0],samples};
    const hits=directSelectionHits([candidate],new THREE.Vector2(50,2),p=>new THREE.Vector2(p.x,p.y));assert.equal(hits.length,1);assert.deepEqual(hits[0].candidate.worldPoint.toArray(),[50,0,0]);assert.deepEqual(samples.map(p=>p.toArray()),[[0,0,0],[100,0,0]]);
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
    const endpoint=candidates.find(c=>c.kind==="control"&&c.topologyId===topology.controls[1].id)!;
    assert.equal(describeDirectTarget(document,endpoint)?.label,"End point");
    assert.equal(describeDirectTarget(document,{...endpoint,kind:"segment"}),undefined,"A point ID must never be resolved as an edge");
    document.layers.layer.locked = true;
    assert.equal(buildDirectSelectionCandidates(document, renderObjects).length, 0);
    assert.equal(describeDirectTarget(document,endpoint),undefined);
    document.layers.layer.locked = false;
    mesh.visible = false;
    assert.equal(buildDirectSelectionCandidates(document, renderObjects).length, 0);
  });
});
