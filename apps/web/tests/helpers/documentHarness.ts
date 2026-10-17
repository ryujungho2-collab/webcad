import assert from "node:assert/strict";
import type { CadDocument } from "@agent-webcad/cad-document";
import { cadDocument } from "../../src/state/cadDocument";
import { cadHistory } from "../../src/state/history";
import { meshPositionsBounds, type MeshData } from "../../src/cad/kernelGeometryService";

export function restoreTestDocument(snapshot: CadDocument) {
  delete cadDocument.blocks;
  delete cadDocument.variables;
  delete cadDocument.parameterBindings;
  delete cadDocument.artboards;
  delete cadDocument.workspaceSections;
  delete cadDocument.frameLinks;
  delete cadDocument.rasterAssets;
  delete cadDocument.scenes;
  delete cadDocument.modelViews;
  delete cadDocument.modelPresentation;
  delete cadDocument.componentLibrary;
  delete cadDocument.workPlanes;
  delete cadDocument.exchangeImports;
  Object.assign(cadDocument, structuredClone({ ...snapshot, sketches: snapshot.sketches ?? {} }));
}

export function resetTestDocument() {
  restoreTestDocument({
    id: "test-document", revision: 0, objects: {}, features: {}, sketches: {},
    layers: { "layer-default": { id: "layer-default", name: "Default", visible: true, locked: false, objectIds: [] } },
    rootObjects: [], rootLayers: ["layer-default"],
  });
  cadHistory.clear();
}

/** Undo/Redo advances revision; every other persisted field must match exactly. */
export function documentState(document = cadDocument) {
  const { revision: _, ...state } = structuredClone(document);
  return state;
}

export function assertMeshBounds(mesh: MeshData, min: number[], max: number[], tolerance = 1e-4) {
  assert.ok(mesh.indices.length > 0, "solid must contain triangles");
  const bounds = meshPositionsBounds(mesh.positions);
  assert.ok(bounds, "solid must have finite bounds");
  for (let axis = 0; axis < 3; axis++) {
    assert.ok(Math.abs(bounds.min[axis] - min[axis]) <= tolerance, `min[${axis}]: ${bounds.min[axis]} ≈ ${min[axis]}`);
    assert.ok(Math.abs(bounds.max[axis] - max[axis]) <= tolerance, `max[${axis}]: ${bounds.max[axis]} ≈ ${max[axis]}`);
  }
}

/** Independent geometric oracle, rather than comparing two uses of the same builder. */
export function meshVolume(mesh: MeshData) {
  let volume = 0;
  const p = mesh.positions;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i] * 3, b = mesh.indices[i + 1] * 3, c = mesh.indices[i + 2] * 3;
    volume += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1])
      + p[a + 1] * (p[b + 2] * p[c] - p[b] * p[c + 2])
      + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  return Math.abs(volume / 6);
}

