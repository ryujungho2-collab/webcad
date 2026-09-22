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

export function validSelection(state: SelectionState): SelectionState {
  const ids = state.ids.filter((id) => {
    const object = cadDocument.objects[id];
    const layer = object ? cadDocument.layers[object.layerId] : undefined;
    return Boolean(object?.visible && layer?.visible && !layer.locked);
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
    return false;
  }) ?? [];
  return { ids, primaryId: state.primaryId && ids.includes(state.primaryId) ? state.primaryId : (ids.at(-1) ?? null), subObjects };
}
