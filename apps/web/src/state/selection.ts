import { cadDocument } from "./cadDocument";
import { getObjectTransform } from "./objectTransform";

export type SelectionState = { ids: string[]; primaryId: string | null };

export function reduceSelection(state: SelectionState, objectId: string | null, additive = false): SelectionState {
  if (!objectId) return { ids: [], primaryId: null };
  if (!additive) return { ids: [objectId], primaryId: objectId };
  const ids = state.ids.includes(objectId) ? state.ids.filter((id) => id !== objectId) : [...state.ids, objectId];
  return { ids, primaryId: ids.includes(objectId) ? objectId : (ids.at(-1) ?? null) };
}

export function validSelection(state: SelectionState): SelectionState {
  const ids = state.ids.filter((id) => {
    const object = cadDocument.objects[id];
    const layer = object ? cadDocument.layers[object.layerId] : undefined;
    return Boolean(object?.visible && layer?.visible && !layer.locked);
  });
  return { ids, primaryId: state.primaryId && ids.includes(state.primaryId) ? state.primaryId : (ids.at(-1) ?? null) };
}

export function selectionBounds(state: SelectionState) {
  const points: [number, number, number][] = [];
  for (const id of state.ids) {
    const object = cadDocument.objects[id];
    if (!object) continue;
    const feature = Object.values(cadDocument.features).find((entry) => entry.output === id);
    const t = getObjectTransform(object, feature).translation;
    const p = feature?.params as Record<string, unknown> | undefined;
    const scale = getObjectTransform(object, feature).scale;
    if (feature?.type === "drawing" && Array.isArray(p?.points)) { points.push(...(p.points as [number, number, number][]).map((v) => [v[0] * scale[0] + t[0], v[1] * scale[1] + t[1], v[2] * scale[2] + t[2]] as [number, number, number])); continue; }
    const w = Number(p?.width ?? p?.radius ?? p?.majorRadius ?? 1) * scale[0], h = Number(p?.depth ?? p?.radius ?? p?.minorRadius ?? 1) * scale[1], d = Number(p?.height ?? p?.radius ?? 1) * scale[2];
    points.push([t[0] - w / 2, t[1] - h / 2, t[2] - d / 2], [t[0] + w / 2, t[1] + h / 2, t[2] + d / 2]);
  }
  if (!points.length) return null;
  return {
    min: points.reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])] as [number, number, number]),
    max: points.reduce((a, b) => [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])] as [number, number, number]),
  };
}
