import { useEffect, useMemo, useState } from "react";
import { cadDocument } from "../../state/cadDocument";
import { dispatchCadCommand } from "../../state/dispatchCadCommand";
import { applyCadPlan, discardCadPlan, previewCadCommand, type CadPlanPreview } from "../../state/documentPlans";
import { commandInteraction } from "../../state/commandInteraction";
import { CommandReview } from "../../ui/CommandReview";
import { PrecisionField } from "../../ui/PrecisionField";
import { parseLength } from "../../precision/units";

type ArtboardsPanelProps = {
  query: string;
  documentRevision: number;
  onDocumentChange: () => void;
  activeArtboardId: string | null;
  onActivateArtboard: (id: string | null) => void;
};

type Draft = {
  name: string;
  workPlane: "XY" | "XZ" | "YZ";
  originX: string;
  originY: string;
  width: string;
  height: string;
  background: string;
};

const emptyDraft: Draft = { name: "", workPlane: "XY", originX: "0", originY: "0", width: "297", height: "210", background: "#ffffff" };

function draftFor(board: NonNullable<typeof cadDocument.artboards>[string]): Draft {
  return { name: board.name, workPlane: board.workPlane, originX: String(board.origin[0]), originY: String(board.origin[1]), width: String(board.size[0]), height: String(board.size[1]), background: board.background };
}

export function ArtboardsPanel({ query, documentRevision, onDocumentChange, activeArtboardId, onActivateArtboard }: ArtboardsPanelProps) {
  const boards = useMemo(() => Object.values(cadDocument.artboards ?? {}).filter(board => !query || `${board.name} ${board.id}`.toLowerCase().includes(query)), [query, documentRevision]);
  const [draft, setDraft] = useState<Draft>(boards[0] ? draftFor(boards[0]) : emptyDraft);
  const [error, setError] = useState("");
  const [review, setReview] = useState<{ key: string; preview: CadPlanPreview } | null>(null);
  const [applying, setApplying] = useState(false);
  const selected = activeArtboardId ? cadDocument.artboards?.[activeArtboardId] : undefined;
  const selectedId = selected?.id ?? null;
  const draftKey = JSON.stringify([selectedId, draft]);
  const dirty = !!selected && JSON.stringify(draft) !== JSON.stringify(draftFor(selected));
  const originX = parseLength(draft.originX), originY = parseLength(draft.originY);
  const width = parseLength(draft.width), height = parseLength(draft.height);
  const lockedGeometryChange = !!selected?.locked && (draft.workPlane !== selected.workPlane || originX !== selected.origin[0] || originY !== selected.origin[1] || width !== selected.size[0] || height !== selected.size[1]);
  const inputError = !draft.name.trim() ? "Enter an artboard name." : originX === null || originY === null ? "Enter a finite origin with length units, such as 10mm." : width === null || height === null || width <= 0 || height <= 0 ? "Enter positive width and height with length units." : !/^#[0-9a-f]{6}$/i.test(draft.background) ? "Enter a #RRGGBB background." : lockedGeometryChange ? "Artboard is locked. Unlock it before changing its plane, position, or size." : undefined;
  const interaction = commandInteraction({ command: "Edit Artboard", targets: selectedId ? [selectedId] : [], draftKey, reviewedKey: review?.key, preview: review?.preview, inputError: dirty ? inputError || error : error || undefined, pending: applying, idle: !selected || !dirty && !error });

  useEffect(() => {
    const current = selectedId ? cadDocument.artboards?.[selectedId] : undefined;
    const next = current?.visible ? current : Object.values(cadDocument.artboards ?? {}).find(board => board.visible);
    if (next?.id !== activeArtboardId) onActivateArtboard(next?.id ?? null);
    setDraft(next ? draftFor(next) : emptyDraft);
    setError("");
  }, [documentRevision, activeArtboardId]);

  useEffect(() => {
    setReview(null);
    if (!selectedId || !dirty || inputError) return;
    let cancelled = false, planId: string | undefined;
    const timer = setTimeout(() => {
      const command = {
        type: "update-artboard" as const,
        artboardId: selectedId,
        ...(draft.name.trim() === selected!.name ? {} : { name: draft.name.trim() }),
        ...(draft.workPlane === selected!.workPlane ? {} : { workPlane: draft.workPlane }),
        ...(originX === selected!.origin[0] && originY === selected!.origin[1] ? {} : { origin: [originX!, originY!] as [number, number] }),
        ...(width === selected!.size[0] && height === selected!.size[1] ? {} : { size: [width!, height!] as [number, number] }),
        ...(draft.background === selected!.background ? {} : { background: draft.background }),
      };
      void previewCadCommand(command)
        .then(preview => { planId = preview.planId; if (cancelled) discardCadPlan(planId); else setReview({ key: draftKey, preview }); })
        .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not review artboard."); });
    }, 120);
    return () => { cancelled = true; clearTimeout(timer); if (planId) discardCadPlan(planId); };
  }, [draftKey, documentRevision, dirty, inputError]);

  function changeDraft(change: Partial<Draft>) { setError(""); setDraft(current => ({ ...current, ...change })); }

  function cancel() { setError(""); setReview(null); if (selected) setDraft(draftFor(selected)); }

  function select(id: string) {
    const board = cadDocument.artboards?.[id];
    if (!board) return;
    onActivateArtboard(id);
    setDraft(draftFor(board));
    setError("");
  }

  async function create() {
    setError("");
    const id = `artboard-${crypto.randomUUID()}`;
    const result = await dispatchCadCommand({ type: "create-artboard", id, name: `Artboard ${Object.keys(cadDocument.artboards ?? {}).length + 1}`, workPlane: "XY", origin: [0, 0], size: [297, 210] });
    if (!result.ok) { setError(result.reason ?? "Could not create artboard."); return; }
    onDocumentChange();
    onActivateArtboard(id);
    setDraft(draftFor(cadDocument.artboards![id]));
  }

  async function apply() {
    if (!interaction.canApply || !review) return;
    setApplying(true);
    try {
      const result = await applyCadPlan(review.preview.planId);
      if (!result.ok) { setError(result.reason ?? "Could not apply artboard. Review again."); return; }
      setError("");
      onDocumentChange();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not apply artboard. Review again."); }
    finally { setApplying(false); }
  }

  async function remove() {
    if (!selectedId) return;
    const result = await dispatchCadCommand({ type: "delete-artboard", artboardId: selectedId });
    if (!result.ok) { setError(result.reason ?? "Locked artboards cannot be deleted."); return; }
    setError("");
    onDocumentChange();
  }

  async function toggle(field: "visible" | "locked") {
    if (!selectedId) return;
    const board = cadDocument.artboards?.[selectedId];
    if (!board) return;
    const result = await dispatchCadCommand({ type: "update-artboard", artboardId: selectedId, [field]: !board[field] });
    if (!result.ok) { setError(result.reason ?? "Artboard update failed."); return; }
    onDocumentChange();
  }

  return <div className="layers-panel artboards-panel" data-testid="artboards-panel">
    <div className="artboard-body">
    <div className="layers-header"><span>Document artboards</span><button type="button" className="layer-add-button" onClick={() => void create()} aria-label="New artboard">+ New</button></div>
    <p className="property-hint">Independent named canvases share one CAD document. Select one to edit its plane, origin, and size.</p>
    <div className="layers-list" role="listbox" aria-label="Artboards">
      {boards.map(board => <button type="button" role="option" aria-selected={activeArtboardId === board.id} className={activeArtboardId === board.id ? "layer-row layer-row-selected" : "layer-row"} key={board.id} onClick={() => select(board.id)}><span className="layer-name">{board.name}{!board.visible ? " · Hidden" : ""}{board.locked ? " · Locked" : ""}</span><small>{board.size[0]} × {board.size[1]} · {board.workPlane}{activeArtboardId === board.id ? " · Active canvas" : ""}</small></button>)}
      {!boards.length && <p className="property-hint">No artboards yet. Create one to start a multi-canvas document.</p>}
    </div>
    {selected && <section className="property-section" aria-label="Selected artboard">
      {selected.locked && <p className="property-hint">Lock protects the artboard plane, position, and size. Object and layer locks still control its contents.</p>}
      <label>Name<input aria-label="Artboard name" value={draft.name} onChange={event => changeDraft({ name: event.target.value })} /></label>
      <label>Plane<select aria-label="Artboard plane" value={draft.workPlane} onChange={event => changeDraft({ workPlane: event.target.value as Draft["workPlane"] })}><option value="XY">XY</option><option value="XZ">XZ</option><option value="YZ">YZ</option></select></label>
      <div className="property-grid"><PrecisionField label="Origin X" aria-label="Artboard origin X" value={draft.originX} onChange={value => changeDraft({ originX: value })} /><PrecisionField label="Origin Y" aria-label="Artboard origin Y" value={draft.originY} onChange={value => changeDraft({ originY: value })} /><PrecisionField label="Width" aria-label="Artboard width" min={0} minExclusive value={draft.width} onChange={value => changeDraft({ width: value })} /><PrecisionField label="Height" aria-label="Artboard height" min={0} minExclusive value={draft.height} onChange={value => changeDraft({ height: value })} /></div>
      <label>Background<input aria-label="Artboard background" type="color" value={draft.background} onChange={event => changeDraft({ background: event.target.value })} /></label>
      {interaction.preview?.result.ok && <p className="property-hint" data-artboard-preview>Origin: {selected.origin.join(", ")} → {originX}, {originY} mm<br />Size: {selected.size.join(" × ")} → {width} × {height} mm<br />Plane: {selected.workPlane} → {draft.workPlane}</p>}
      <CommandReview state={{ ...interaction, next: interaction.canApply ? "Review the artboard properties and impact below, then apply. One Undo restores this edit." : interaction.next }} />
    </section>}
    </div>
    {selected && <div className="artboard-actions">
        <div className="sketch-actions"><button type="button" onClick={() => void apply()} disabled={!interaction.canApply} aria-label="Apply artboard">Apply</button><button type="button" onClick={cancel} disabled={applying || !dirty} aria-label="Cancel artboard edit">Cancel</button><button type="button" onClick={() => void remove()} disabled={selected.locked || applying} title={selected.locked ? "Unlock this artboard before deleting it." : undefined} aria-label="Delete artboard">Delete</button></div>
        <div className="sketch-actions"><button type="button" onClick={() => void toggle("visible")} aria-label="Artboard visible">{selected.visible ? "Hide" : "Show"}</button><button type="button" onClick={() => void toggle("locked")} aria-label="Artboard locked">{selected.locked ? "Unlock" : "Lock"}</button></div>
    </div>}
  </div>;
}
