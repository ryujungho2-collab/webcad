import { useEffect, useRef, useState } from "react";
import type { CadModelView, CadModelViewCamera } from "@agent-webcad/cad-document";
import { cadDocument } from "../state/cadDocument";
import { dispatchCadCommand } from "../state/dispatchCadCommand";
import type { ViewportActionType } from "./CadViewport";
import "../ui/modelViews.css";

export function ModelViewsDialog({ revision, capture, recall, onViewAction, onChanged, onClose, recallReason, error: restoreError }: {
  revision: number; capture: () => CadModelViewCamera; recall: (view: CadModelView) => void;
  onViewAction: (action: ViewportActionType) => void; onChanged: () => void; onClose: () => void; recallReason?: string; error?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const newName = () => { const names = new Set(Object.values(cadDocument.modelViews ?? {}).map(v => v.name.toLowerCase())); let n = 1; while (names.has(`view ${n}`)) n++; return `View ${n}`; };
  const [selected, setSelected] = useState(""); const [name, setName] = useState(newName);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const documentId = useRef(cadDocument.id);
  const views = Object.values(cadDocument.modelViews ?? {});
  const saved = cadDocument.modelViews?.[selected];
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close(); }, []);
  useEffect(() => {
    if (documentId.current !== cadDocument.id || selected && !saved) {
      documentId.current = cadDocument.id; setSelected(""); setName(newName()); setError("The document or saved view changed. Select a view again.");
    }
  }, [revision]);
  function select(id: string) { setSelected(id); setName(cadDocument.modelViews?.[id]?.name ?? newName()); setError(""); }
  async function save(mode: "new" | "rename" | "update" | "delete") {
    if (busy) return; setBusy(true); setError("");
    try {
      if (mode !== "new" && !saved) throw new Error("Select a saved model view first.");
      const id = mode === "new" ? `view-${crypto.randomUUID()}` : saved!.id;
      if (mode !== "delete" && views.some(v => v.id !== id && v.name.toLowerCase() === name.trim().toLowerCase()))
        throw new Error("A model view with this name already exists. Choose another name.");
      const result = await dispatchCadCommand(mode === "delete" ? { type: "delete-model-view", viewId: id } :
        { type: "upsert-model-view", view: { id, name: name.trim(), camera: mode === "rename" ? structuredClone(saved!.camera) : capture() } });
      if (!result.ok) throw new Error(result.reason);
      onChanged();
      if (mode === "delete") select(""); else { setSelected(id); setName(name.trim()); }
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save the model view."); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="model-views-dialog" aria-labelledby="model-views-title" onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>
    <h2 id="model-views-title">Model views</h2>
    <p>Save the current camera or recall a named view. Model geometry and work planes stay unchanged. Recall opens the 3D workspace.</p>
    <label>Saved view<select aria-label="Saved model view" value={selected} disabled={busy} onChange={e => select(e.target.value)}><option value="">New view</option>{views.map(v => <option key={v.id} value={v.id}>{v.name} · {v.camera.projection}</option>)}</select></label>
    <label>Name<input aria-label="Model view name" value={name} maxLength={200} disabled={busy} onChange={e => { setName(e.target.value); setError(""); }} /></label>
    {saved && <p>{saved.camera.projection === "orthographic" ? "Orthographic" : "Perspective"} · zoom {saved.camera.zoom.toFixed(3)}</p>}
    <div className="model-view-actions"><button type="button" disabled={busy || !name.trim()} onClick={() => void save("new")}>Save current view</button>
      <button type="button" disabled={busy || !saved || !!recallReason} title={recallReason} onClick={() => saved && recall(saved)}>Recall view</button>
      <button type="button" disabled={busy || !saved || !name.trim()} onClick={() => void save("rename")}>Rename view</button>
      <button type="button" disabled={busy || !saved || !name.trim()} onClick={() => void save("update")}>Update view from camera</button>
      <button type="button" disabled={busy || !saved} onClick={() => void save("delete")}>Delete view</button></div>
    {recallReason && <p>{recallReason}</p>}
    <fieldset disabled={busy || !!recallReason}><legend>Standard views and framing</legend>{(["top", "front", "right", "isometric"] as const).map(type => <button type="button" key={type} onClick={() => onViewAction(type)}>{type[0].toUpperCase() + type.slice(1)} view</button>)}<button type="button" onClick={() => onViewAction("fit-all")}>Fit all geometry</button></fieldset>
    {(error || restoreError) && <p role="alert">{error || restoreError}</p>}
    <button type="button" disabled={busy} onClick={onClose}>Close model views</button>
  </dialog>;
}
