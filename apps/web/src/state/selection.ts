import type { CadDocument } from "@agent-webcad/cad-document";
import { cadDocument } from "./cadDocument";

export type TopologySelectionKind = "object" | "drawing-control" | "drawing-segment" | "drawing-curve" | "brep-edge" | "brep-face";
export type TopologySelectionRef = {
  objectId: string;
  kind: TopologySelectionKind;
  /** Stable document-owned identifier, never a Three.js vertex/index. */
  topologyId: string;
};
export type SelectionState = { ids: string[]; primaryId: string | null; subObjects?: TopologySelectionRef[] };

export function reduceSelection(state: SelectionState, objectId: string | null, additive = false): SelectionState {
  if (!objectId) return { ids: [], primaryId: null, subObjects: [] };
  if (!additive) return { ids: [objectId], primaryId: objectId, subObjects: [] };
  const ids = state.ids.includes(objectId) ? state.ids.filter((id) => id !== objectId) : [...state.ids, objectId];
  return { ids, primaryId: ids.includes(objectId) ? objectId : (ids.at(-1) ?? null), subObjects: state.subObjects?.filter((entry) => ids.includes(entry.objectId)) ?? [] };
}

/**
 * Every id Ctrl/Cmd+A may claim. Visible objects on visible, unlocked layers
 * only; scoped to the active sketch's geometry while sketch editing so the
 * shortcut never yanks the user out of sketch mode. Never dispatches a
 * command and never mutates the document.
 */
export function selectAllIds(document: CadDocument, activeSketchId?: string | null, options: { constructionVisible?: boolean } = {}): string[] {
  const hiddenConstruction = options.constructionVisible === false
    ? new Set(Object.values(document.features).filter(f=>f.params.construction).map(f=>f.output)) : new Set<string>();
  const isSelectable = (id: string) => {
    const object = document.objects[id];
    const layer = object ? document.layers[object.layerId] : undefined;
    return Boolean(object?.visible && layer?.visible && !layer.locked && !hiddenConstruction.has(id));
  };
  if (activeSketchId) {
    const sketch = document.sketches?.[activeSketchId];
    if (!sketch) return [];
    return sketch.geometry.map((entry) => entry.id).filter(isSelectable);
  }
  return document.rootObjects.filter(isSelectable);
}

export function validSelection(state: SelectionState, options: { constructionVisible?: boolean } = {}): SelectionState {
  const hiddenConstruction = options.constructionVisible === false
    ? new Set(Object.values(cadDocument.features).filter(f=>f.params.construction).map(f=>f.output)) : new Set<string>();
  const ids = state.ids.filter((id) => {
    const object = cadDocument.objects[id];
    const layer = object ? cadDocument.layers[object.layerId] : undefined;
    return Boolean(object?.visible && layer?.visible && !layer.locked && !hiddenConstruction.has(id));
  });
  const subObjects = state.subObjects?.filter((entry) => {
    if (!ids.includes(entry.objectId)) return false;
    if (entry.kind === "object") return true;
    const feature = Object.values(cadDocument.features).find((candidate) => candidate.output === entry.objectId);
    const topology = feature?.type === "drawing"
      ? feature.params.topology as { controls?: { id: string }[]; segments?: { id: string }[]; curves?: { id: string }[] } | undefined
      : undefined;
    if (entry.kind === "drawing-control") return topology?.controls?.some((candidate) => candidate.id === entry.topologyId) ?? false;
    if (entry.kind === "drawing-segment") return topology?.segments?.some((candidate) => candidate.id === entry.topologyId) ?? false;
    if (entry.kind === "drawing-curve") return topology?.curves?.some((candidate) => candidate.id === entry.topologyId) ?? false;
    if (entry.kind === "brep-edge" || entry.kind === "brep-face") {
      // Two-tier contract: object-level validity is enforced synchronously
      // here (the object check above already passed), while geometric
      // resolution against the kernel is deferred to use-time
      // (resolveBrepReference), which alone can verify a fingerprint against
      // rebuilt geometry. Harmless viewport/camera changes therefore never
      // drop a live sub-selection.
      return true;
    }
    return false;
  }) ?? [];
  return { ids, primaryId: state.primaryId && ids.includes(state.primaryId) ? state.primaryId : (ids.at(-1) ?? null), subObjects };
}
