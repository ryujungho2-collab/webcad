import type { CadDocument } from "@agent-webcad/cad-document";

/** Temporary view filter. Never persisted in CadDocument or History. */
export type ViewportIsolation = { mode: "objects" | "layers"; ids: string[]; session: string };

export function createViewportIsolation(document: CadDocument, mode: ViewportIsolation["mode"], selection: string[], session: string): ViewportIsolation | null {
  const ids = [...new Set(selection.filter(id => !!document.objects[id]).map(id => mode === "layers" ? document.objects[id].layerId : id))]
    .filter(id => mode === "objects" || !!document.layers[id]);
  return ids.length ? { mode, ids, session } : null;
}

export function reconcileViewportIsolation(document: CadDocument, state: ViewportIsolation | null, session: string): ViewportIsolation | null {
  if (!state || state.session !== session) return null;
  const entries = state.mode === "layers" ? document.layers : document.objects;
  const ids = state.ids.filter(id => !!entries[id]);
  if (!ids.length) return null;
  return ids.length === state.ids.length ? state : { ...state, ids };
}

/** Membership only; the existing renderer/selection still enforce visible/locked. */
export function isolatedViewportObjectIds(document: CadDocument, state: ViewportIsolation | null): string[] | null {
  if (!state) return null;
  if (state.mode === "objects") return state.ids;
  const layers = new Set(state.ids);
  return Object.values(document.objects).filter(object => layers.has(object.layerId)).map(object => object.id);
}
