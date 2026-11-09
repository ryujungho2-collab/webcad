import { useEffect, useState } from "react";
import type { CadVectorStyle, CadVectorGradient } from "@agent-webcad/cad-document";
import { applyCadPlan, discardCadPlan, previewCadCommand, type CadPlanPreview } from "../state/documentPlans";
import { commandInteraction } from "../state/commandInteraction";
import { dispatchCadCommand } from "../state/dispatchCadCommand";
import { CommandReview } from "../ui/CommandReview";
import { PrecisionField } from "../ui/PrecisionField";
import { PropertySection } from "../ui/PropertySection";
import { parseLength } from "../precision/units";

type GradientStopDraft = { offset: string; color: string };

type Draft = {
  stroke: string;
  fill: string;
  fillEnabled: boolean;
  gradientType: "none" | "linear" | "radial";
  gradientAngle: string;
  gradientStops: GradientStopDraft[];
  opacity: string;
  strokeWidth: string;
};

type Props = { objectId: string; style: CadVectorStyle; disabled: boolean; revision: number; onDocumentChange: () => void };

const emptyStop: GradientStopDraft = { offset: "0", color: "#ffffff" };

const toDraft = (style: CadVectorStyle): Draft => {
  const gradient = style.fillGradient;
  if (!gradient) {
    return { stroke: style.stroke, fill: style.fill ?? "#ffffff", fillEnabled: style.fill !== null, gradientType: "none", gradientAngle: "0", gradientStops: [emptyStop], opacity: String(style.opacity), strokeWidth: String(style.strokeWidth) };
  }
  return {
    stroke: style.stroke,
    fill: style.fill ?? "#ffffff",
    fillEnabled: style.fill !== null,
    gradientType: gradient.type,
    gradientAngle: String(gradient.angle ?? 0),
    gradientStops: gradient.stops.map(s => ({ offset: String(s.offset), color: s.color })),
    opacity: String(style.opacity),
    strokeWidth: String(style.strokeWidth),
  };
};

const gradientFromDraft = (draft: Draft): CadVectorGradient | null => {
  if (draft.gradientType === "none") return null;
  const stops = draft.gradientStops.filter(s => /^#[0-9a-f]{6}$/i.test(s.color) && Number.isFinite(Number(s.offset)) && Number(s.offset) >= 0 && Number(s.offset) <= 1).map(s => ({ offset: Number(s.offset), color: s.color }));
  if (stops.length < 2) return null;
  const gradient: CadVectorGradient = { type: draft.gradientType, stops };
  if (draft.gradientType === "linear" && draft.gradientAngle.trim() !== "") gradient.angle = Number(draft.gradientAngle);
  return gradient;
};

export function VectorStyleEditor({ objectId, style, disabled, revision, onDocumentChange }: Props) {
  const styleKey = JSON.stringify(style);
  const [draft, setDraft] = useState(() => toDraft(style));
  const [review, setReview] = useState<{ key: string; preview: CadPlanPreview } | null>(null);
  const [error, setError] = useState("");
  const [applying, setApplying] = useState(false);
  const draftKey = JSON.stringify(draft);
  const dirty = draftKey !== JSON.stringify(toDraft(style));
  const opacity = Number(draft.opacity), strokeWidth = parseLength(draft.strokeWidth);
  const gradient = gradientFromDraft(draft);
  const gradientValid = draft.gradientType === "none" || (gradient !== null && draft.gradientStops.length >= 2);
  const inputError = !/^#[0-9a-f]{6}$/i.test(draft.stroke) ? "Choose a valid stroke color." : draft.fillEnabled && !/^#[0-9a-f]{6}$/i.test(draft.fill) ? "Choose a valid fill color." : !gradientValid ? "Gradient needs at least two valid stops (offset 0-1, #RRGGBB)." : !draft.opacity.trim() || !Number.isFinite(opacity) || opacity < 0 || opacity > 1 ? "Opacity must be between 0 and 1." : strokeWidth === null || strokeWidth <= 0 || strokeWidth > 20 ? "Stroke width must be greater than 0 and at most 20 mm." : undefined;
  const nextStyle: CadVectorStyle = { stroke: draft.stroke, fill: draft.fillEnabled ? draft.fill : null, fillGradient: gradient, opacity, strokeWidth: strokeWidth ?? 0 };
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
  function handleGradientTypeChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const nextType = event.target.value as Draft["gradientType"];
    const nextStops = nextType === "none" ? [{ offset: "0", color: draft.fill }, { offset: "1", color: draft.fill }] : draft.gradientStops;
    change({ gradientType: nextType, gradientStops: nextStops });
  }
  function cancel() { setDraft(toDraft(style)); setReview(null); setError(""); }
  function addStop() { setDraft(current => ({ ...current, gradientStops: [...current.gradientStops, { offset: "0.5", color: "#808080" }] })); }
  function removeStop(index: number) { setDraft(current => ({ ...current, gradientStops: current.gradientStops.filter((_, i) => i !== index) })); }
  function changeStop(index: number, field: keyof GradientStopDraft, value: string) { setDraft(current => { const stops = [...current.gradientStops]; stops[index] = { ...stops[index], [field]: value }; return { ...current, gradientStops: stops }; }); }
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

  const gradientBlock = draft.fillEnabled ? (
    <div className="gradient-editor">
      <label className="property-row"><span>Gradient</span><select aria-label="Vector gradient type" value={draft.gradientType} disabled={disabled} onChange={handleGradientTypeChange}><option value="none">None</option><option value="linear">Linear</option><option value="radial">Radial</option></select></label>
      {draft.gradientType !== "none" && draft.gradientStops.map((stop, index) => (
        <div key={index} className="property-row gradient-stop-row">
          <span>Stop {index + 1}</span>
          <input aria-label={"Gradient stop " + (index + 1) + " offset"} type="number" min="0" max="1" step="0.05" value={stop.offset} disabled={disabled} onChange={event => changeStop(index, "offset", event.target.value)} />
          <input aria-label={"Gradient stop " + (index + 1) + " color"} type="color" value={stop.color} disabled={disabled} onChange={event => changeStop(index, "color", event.target.value)} />
          <button type="button" aria-label={"Remove gradient stop " + (index + 1)} disabled={disabled || draft.gradientStops.length <= 2} onClick={() => void removeStop(index)}>−</button>
        </div>
      ))}
      <button type="button" aria-label="Add gradient stop" disabled={disabled || draft.gradientStops.length >= 8} onClick={() => void addStop()}>+ Add stop</button>
      {draft.gradientType === "linear" && <label className="property-row"><span>Angle</span><input aria-label="Vector gradient angle" type="number" step="1" value={draft.gradientAngle} disabled={disabled} onChange={event => change({ gradientAngle: event.target.value })} /></label>}
    </div>
  ) : null;

  return (
    <PropertySection title="Appearance" meta="Vector" active={dirty||applying} keepOpen={dirty||applying}>
      <label className="property-row"><span>Stroke</span><input aria-label="Vector stroke" type="color" value={draft.stroke} disabled={disabled} onChange={event => change({ stroke: event.target.value })} /></label>
      <label className="property-row"><span>Fill</span><input aria-label="Vector fill enabled" type="checkbox" checked={draft.fillEnabled} disabled={disabled} onChange={event => change({ fillEnabled: event.target.checked })} /></label>
      <label className="property-row"><span>Fill color</span><input aria-label="Vector fill" type="color" value={draft.fill} disabled={disabled || !draft.fillEnabled} onChange={event => change({ fill: event.target.value })} /></label>

      <label className="property-row"><span>Opacity</span><input aria-label="Vector opacity" type="number" min="0" max="1" step="0.05" value={draft.opacity} disabled={disabled} aria-invalid={!draft.opacity.trim() || !Number.isFinite(opacity) || opacity < 0 || opacity > 1} onChange={event => change({ opacity: event.target.value })} /></label>
      <PrecisionField label="Stroke width" aria-label="Vector stroke width" min={0} minExclusive max={20} value={draft.strokeWidth} disabled={disabled} onChange={value => change({ strokeWidth: value })} />
      {gradientBlock&&<PropertySection title="Gradient settings" defaultOpen={false} active={dirty&&draft.gradientType!=="none"} keepOpen={dirty&&draft.gradientType!=="none"}>{gradientBlock}</PropertySection>}
      <CommandReview state={interaction} />
      <div className="property-actions"><button type="button" aria-label="Apply vector appearance" disabled={!interaction.canApply} onClick={() => void apply()}>Apply</button><button type="button" aria-label="Cancel vector appearance" disabled={applying || !dirty} onClick={cancel}>Cancel</button></div>
    </PropertySection>
  );
}
