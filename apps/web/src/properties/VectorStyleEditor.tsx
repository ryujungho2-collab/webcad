import { useEffect, useState } from "react";
import type { CadVectorStyle } from "@agent-webcad/cad-document";
import { applyCadPlan, discardCadPlan, previewCadCommand, type CadPlanPreview } from "../state/documentPlans";
import { commandInteraction } from "../state/commandInteraction";
import { dispatchCadCommand } from "../state/dispatchCadCommand";
import { CommandReview } from "../ui/CommandReview";
import { PrecisionField } from "../ui/PrecisionField";
import { PropertySection } from "../ui/PropertySection";
import { parseLength } from "../precision/units";

type Draft = { stroke: string; fill: string; fillEnabled: boolean; opacity: string; strokeWidth: string };
type Props = { objectId: string; style: CadVectorStyle; disabled: boolean; revision: number; onDocumentChange: () => void };
const toDraft = (style: CadVectorStyle): Draft => ({ stroke: style.stroke, fill: style.fill ?? "#ffffff", fillEnabled: style.fill !== null, opacity: String(style.opacity), strokeWidth: String(style.strokeWidth) });

export function VectorStyleEditor({ objectId, style, disabled, revision, onDocumentChange }: Props) {
  const styleKey = JSON.stringify(style);
  const [draft, setDraft] = useState(() => toDraft(style));
  const [review, setReview] = useState<{ key: string; preview: CadPlanPreview } | null>(null);
  const [error, setError] = useState("");
  const [applying, setApplying] = useState(false);
  const draftKey = JSON.stringify(draft);
  const dirty = draftKey !== JSON.stringify(toDraft(style));
  const opacity = Number(draft.opacity), strokeWidth = parseLength(draft.strokeWidth);
  const inputError = !/^#[0-9a-f]{6}$/i.test(draft.stroke) ? "Choose a valid stroke color." : draft.fillEnabled && !/^#[0-9a-f]{6}$/i.test(draft.fill) ? "Choose a valid fill color." : !draft.opacity.trim() || !Number.isFinite(opacity) || opacity < 0 || opacity > 1 ? "Opacity must be between 0 and 1." : strokeWidth === null || strokeWidth <= 0 || strokeWidth > 20 ? "Stroke width must be greater than 0 and at most 20 mm." : undefined;
  const nextStyle: CadVectorStyle = { stroke: draft.stroke, fill: draft.fillEnabled ? draft.fill : null, opacity, strokeWidth: strokeWidth ?? 0 };
  const interaction = commandInteraction({ command: "Edit Vector Appearance", targets: [objectId], draftKey, reviewedKey: review?.key, preview: review?.preview, inputError: disabled ? "Unlock the object's layer before changing vector appearance." : dirty ? inputError || error : error || undefined, pending: applying, idle: disabled || !dirty && !error });

  useEffect(() => { setDraft(toDraft(style)); setReview(null); setError(""); }, [objectId, styleKey, revision]);
  useEffect(() => {
    setReview(null);
    if (disabled || !dirty || inputError) return;
    let cancelled = false, planId: string | undefined;
    const timer = setTimeout(() => {
      void previewCadCommand({ type: "set-vector-style", objectId, style: nextStyle })
        .then(preview => { planId = preview.planId; if (cancelled) discardCadPlan(planId); else setReview({ key: draftKey, preview }); })
        .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not review vector appearance."); });
    }, 90);
    return () => { cancelled = true; clearTimeout(timer); if (planId) discardCadPlan(planId); };
  }, [objectId, draftKey, disabled, dirty, inputError]);

  function change(value: Partial<Draft>) { setError(""); setDraft(current => ({ ...current, ...value })); }
  function cancel() { setDraft(toDraft(style)); setReview(null); setError(""); }
  async function apply() {
    if (!interaction.canApply || !review) return;
    setApplying(true);
    try {
      const result = await applyCadPlan(review.preview.planId);
      if (!result.ok) { setError(result.reason ?? "Appearance changed while reviewing. Review again."); return; }
      setError(""); onDocumentChange();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not apply vector appearance."); }
    finally { setApplying(false); }
  }

  return <PropertySection title="Appearance" meta="Vector">
    <label className="property-row"><span>Stroke</span><input aria-label="Vector stroke" type="color" value={draft.stroke} disabled={disabled} onChange={event => change({ stroke: event.target.value })} /></label>
    <label className="property-row"><span>Fill</span><input aria-label="Vector fill enabled" type="checkbox" checked={draft.fillEnabled} disabled={disabled} onChange={event => change({ fillEnabled: event.target.checked })} /></label>
    <label className="property-row"><span>Fill color</span><input aria-label="Vector fill" type="color" value={draft.fill} disabled={disabled || !draft.fillEnabled} onChange={event => change({ fill: event.target.value })} /></label>
    <label className="property-row"><span>Opacity</span><input aria-label="Vector opacity" type="number" min="0" max="1" step="0.05" value={draft.opacity} disabled={disabled} aria-invalid={!draft.opacity.trim() || !Number.isFinite(opacity) || opacity < 0 || opacity > 1} onChange={event => change({ opacity: event.target.value })} /></label>
    <PrecisionField label="Stroke width" aria-label="Vector stroke width" min={0} minExclusive max={20} value={draft.strokeWidth} disabled={disabled} onChange={value => change({ strokeWidth: value })} />
    <CommandReview state={interaction} />
    <div className="property-actions"><button type="button" aria-label="Apply vector appearance" disabled={!interaction.canApply} onClick={() => void apply()}>Apply</button><button type="button" aria-label="Cancel vector appearance" disabled={applying || !dirty} onClick={cancel}>Cancel</button></div>
  </PropertySection>;
}
