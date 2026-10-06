import { useEffect, useRef, useState } from "react";
import { DEFAULT_CAD_IMAGE_ADJUSTMENTS, type CadImageNodeParams, type CadRasterAsset } from "@agent-webcad/cad-document";
import { applyCadPlan, discardCadPlan, previewCadCommand, type CadPlanPreview } from "../state/documentPlans";
import { commandInteraction } from "../state/commandInteraction";
import { CommandReview } from "../ui/CommandReview";
import { PrecisionField } from "../ui/PrecisionField";
import { PropertySection } from "../ui/PropertySection";
import { parseLength } from "../precision/units";
import type { CadCommand } from "@agent-webcad/cad-commands";
import { importRasterFile, RASTER_FILE_ACCEPT, type RasterImport } from "../interop/rasterImport";
import { documentVersion, sameDocumentVersion } from "../state/documentSession";

type CropDraft = { left: string; top: string; right: string; bottom: string };
type ImageAdjustmentDraft = { brightness: string; contrast: string; saturation: string };
type Props = { objectId: string; params: CadImageNodeParams; asset: CadRasterAsset; disabled: boolean; revision: number; onDocumentChange: () => void; cropHandlesActive?: boolean; onCropHandleModeChange?: (objectId: string, active: boolean) => void; onCropDraftRegister?: (objectId: string, update: ((crop: CadImageNodeParams["crop"]) => void) | null) => void; onCropPreview: (value: { objectId: string; crop: CadImageNodeParams["crop"]; mask: NonNullable<CadImageNodeParams["mask"]>; opacity: number; adjustments: NonNullable<CadImageNodeParams["adjustments"]>; revealSource: boolean; asset?: CadRasterAsset } | null) => void };
const cropDraft = (crop: CadImageNodeParams["crop"]): CropDraft => ({ left: String(crop.x * 100), top: String(crop.y * 100), right: String((1 - crop.x - crop.width) * 100), bottom: String((1 - crop.y - crop.height) * 100) });
const adjustmentDraft = (adjustments: NonNullable<CadImageNodeParams["adjustments"]> = DEFAULT_CAD_IMAGE_ADJUSTMENTS): ImageAdjustmentDraft => ({ brightness: String(adjustments.brightness), contrast: String(adjustments.contrast), saturation: String(adjustments.saturation) });

export function ImageInspector({ objectId, params, asset, disabled, revision, onDocumentChange, cropHandlesActive = false, onCropHandleModeChange, onCropDraftRegister, onCropPreview }: Props) {
  const paramsKey = JSON.stringify(params);
  const [width, setWidth] = useState(String(params.width));
  const [height, setHeight] = useState(String(params.height));
  const [lockedAspectRatio, setLockedAspectRatio] = useState<number | null>(null);
  const [mask, setMask] = useState<NonNullable<CadImageNodeParams["mask"]>>(params.mask ?? "rect");
  const [opacity, setOpacity] = useState(String((params.opacity ?? 1) * 100));
  const [adjustments, setAdjustments] = useState(() => adjustmentDraft(params.adjustments));
  const cropHandlesEnabled = cropHandlesActive;
  const [crop, setCrop] = useState(() => cropDraft(params.crop));
  const [review, setReview] = useState<{ key: string; preview: CadPlanPreview } | null>(null);
  const [error, setError] = useState("");
  const [applying, setApplying] = useState(false);
  const [replacement, setReplacement] = useState<RasterImport | null>(null);
  const [loadingSource, setLoadingSource] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const decodeRequest = useRef(0);
  const sourceAbort = useRef<AbortController | null>(null);
  const effectiveAsset = replacement?.asset ?? asset;
  const cropDraftUpdate = useRef<(next: CadImageNodeParams["crop"]) => void>(() => {});
  cropDraftUpdate.current = next => { setError(""); setCrop(cropDraft(next)); };
  const placementKey = JSON.stringify([width, height, crop, mask, opacity, adjustments]);
  const draftKey = JSON.stringify([placementKey, replacement?.asset.id]);
  const baselineKey = JSON.stringify([String(params.width), String(params.height), cropDraft(params.crop), params.mask ?? "rect", String((params.opacity ?? 1) * 100), adjustmentDraft(params.adjustments)]);
  const placementDirty = placementKey !== baselineKey;
  const dirty = placementDirty || !!replacement;
  const nextWidth = parseLength(width), nextHeight = parseLength(height);
  const numbers = Object.values(crop).map(value => value.trim() === "" ? Number.NaN : Number(value));
  const cropInputError = numbers.some(value => !Number.isFinite(value) || value < 0 || value >= 100) ? "Crop insets must be percentages from 0 to less than 100." : numbers[0] + numbers[2] >= 100 || numbers[1] + numbers[3] >= 100 ? "Crop insets must leave a visible width and height." : undefined;
  const opacityPercent = opacity.trim() === "" ? Number.NaN : Number(opacity);
  const opacityInputError = !Number.isFinite(opacityPercent) || opacityPercent < 0 || opacityPercent > 100 ? "Opacity must be between 0 and 100 percent." : undefined;
  const adjustmentNumbers = { brightness: Number(adjustments.brightness), contrast: Number(adjustments.contrast), saturation: Number(adjustments.saturation) };
  const adjustmentInputError = Object.values(adjustmentNumbers).some(value => !Number.isFinite(value) || value < -100 || value > 100) ? "Brightness, contrast, and saturation must be between -100 and 100." : undefined;
  const inputError = nextWidth === null || nextWidth <= 0 || nextWidth > 1_000_000 ? "Width must be greater than 0 and at most 1,000,000 mm." : nextHeight === null || nextHeight <= 0 || nextHeight > 1_000_000 ? "Height must be greater than 0 and at most 1,000,000 mm." : opacityInputError ?? cropInputError ?? adjustmentInputError;
  const nextCrop = cropInputError ? params.crop : { x: numbers[0] / 100, y: numbers[1] / 100, width: 1 - (numbers[0] + numbers[2]) / 100, height: 1 - (numbers[1] + numbers[3]) / 100 };
  const nextOpacity = opacityPercent / 100;
  const nextAdjustments = adjustmentInputError ? params.adjustments ?? DEFAULT_CAD_IMAGE_ADJUSTMENTS : adjustmentNumbers;
  const interaction = commandInteraction({ command: "Edit image size and crop", targets: [objectId], draftKey, reviewedKey: review?.key, preview: review?.preview, inputError: disabled ? "Unlock and show the image's layer before editing it." : dirty ? inputError || error : error || undefined, pending: applying || loadingSource, idle: disabled || !dirty && !error && !loadingSource });

  useEffect(() => { decodeRequest.current++; sourceAbort.current?.abort(); setLoadingSource(false); setReplacement(null); setWidth(String(params.width)); setHeight(String(params.height)); setCrop(cropDraft(params.crop)); setMask(params.mask ?? "rect"); setOpacity(String((params.opacity ?? 1) * 100)); setAdjustments(adjustmentDraft(params.adjustments)); setReview(null); setError(""); onCropHandleModeChange?.(objectId, false); }, [objectId, paramsKey, revision]);
  useEffect(() => () => { decodeRequest.current++; sourceAbort.current?.abort(); }, []);
  useEffect(() => { setLockedAspectRatio(null); }, [objectId]);
  useEffect(() => { const update = (next: CadImageNodeParams["crop"]) => cropDraftUpdate.current(next); onCropDraftRegister?.(objectId, update); return () => onCropDraftRegister?.(objectId, null); }, [objectId, onCropDraftRegister]);
  useEffect(() => {
    if (disabled || !dirty || inputError || loadingSource) { onCropPreview(null); return; }
    const previewCrop = { ...nextCrop };
    onCropPreview({ objectId, crop: previewCrop, mask, opacity: nextOpacity, adjustments: nextAdjustments, revealSource: cropHandlesEnabled, asset: replacement?.asset });
    const edit: CadCommand = { type: "update-image", objectId, width: nextWidth!, height: nextHeight!, crop: previewCrop, mask, opacity: nextOpacity, adjustments: nextAdjustments };
    const source: CadCommand | undefined = replacement ? { type: "replace-image-source", objectId, asset: replacement.asset } : undefined;
    const command: CadCommand = source ? placementDirty ? { type: "batch", label: "Replace image source and edit placement", commands: [source, edit] } : source : edit;
    let cancelled = false, planId: string | undefined;
    const timer = setTimeout(() => {
      void previewCadCommand(command)
        .then(preview => { planId = preview.planId; if (cancelled) discardCadPlan(planId); else { setReview({ key: draftKey, preview }); setError(preview.result.ok ? "" : preview.result.reason ?? "Image preview failed."); } })
        .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not preview image edits."); });
    }, 90);
    return () => { cancelled = true; clearTimeout(timer); if (planId) discardCadPlan(planId); };
  }, [objectId, draftKey, disabled, dirty, inputError, revision, cropHandlesEnabled, loadingSource]);
  useEffect(() => () => onCropPreview(null), [objectId, onCropPreview]);

  function resetFromSource() {
    const sourceWidth = parseLength(width) ?? params.width;
    const sourceHeight = sourceWidth * effectiveAsset.height / effectiveAsset.width;
    setWidth(String(sourceWidth));
    setHeight(String(sourceHeight));
    if (lockedAspectRatio !== null) setLockedAspectRatio(sourceWidth / sourceHeight);
    setCrop(cropDraft({ x: 0, y: 0, width: 1, height: 1 }));
    setError("");
  }
  function updateWidth(value: string) {
    setError("");
    setWidth(value);
    const parsed = parseLength(value);
    if (lockedAspectRatio !== null && parsed !== null && parsed > 0) setHeight(String(parsed / lockedAspectRatio));
  }
  function updateHeight(value: string) {
    setError("");
    setHeight(value);
    const parsed = parseLength(value);
    if (lockedAspectRatio !== null && parsed !== null && parsed > 0) setWidth(String(parsed * lockedAspectRatio));
  }
  function toggleAspectRatio(checked: boolean) {
    if (!checked) { setLockedAspectRatio(null); return; }
    const currentWidth = parseLength(width), currentHeight = parseLength(height);
    if (currentWidth !== null && currentHeight !== null && currentWidth > 0 && currentHeight > 0) setLockedAspectRatio(currentWidth / currentHeight);
  }
  function toggleCropHandles(active: boolean) { onCropHandleModeChange?.(objectId, active); }
  function cancel() { decodeRequest.current++; sourceAbort.current?.abort(); setLoadingSource(false); setReplacement(null); setWidth(String(params.width)); setHeight(String(params.height)); setCrop(cropDraft(params.crop)); setMask(params.mask ?? "rect"); setOpacity(String((params.opacity ?? 1) * 100)); setAdjustments(adjustmentDraft(params.adjustments)); onCropHandleModeChange?.(objectId, false); setReview(null); setError(""); onCropPreview(null); }
  async function replaceSource(file: File | undefined) {
    if (!file || disabled || applying) return;
    const ticket = ++decodeRequest.current, version = documentVersion();
    sourceAbort.current?.abort();
    const controller = new AbortController(); sourceAbort.current = controller;
    setLoadingSource(true); setReview(null); setError("");
    try {
      const imported = await importRasterFile(file, controller.signal);
      if (ticket !== decodeRequest.current) return;
      if (!sameDocumentVersion(version)) throw new Error("The document changed while decoding. Choose the replacement again.");
      setReplacement(imported);
    } catch (reason) { if (ticket === decodeRequest.current) setError(reason instanceof Error ? reason.message : "Could not decode the replacement image."); }
    finally { if (ticket === decodeRequest.current) setLoadingSource(false); }
  }
  async function apply() {
    if (!interaction.canApply || !review) return;
    setApplying(true);
    try {
      onCropPreview(null);
      const result = await applyCadPlan(review.preview.planId);
      if (!result.ok) { setReview(null); setError(result.reason ?? "Image changed while reviewing. Review the edit again."); return; }
      onCropHandleModeChange?.(objectId, false);
      setError(""); onDocumentChange();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not apply image edits."); }
    finally { setApplying(false); }
  }

  return <PropertySection title="Image" meta={`${effectiveAsset.width} × ${effectiveAsset.height} px`}>
    <p className="property-hint">Original source stays embedded. Size and crop are editable placement settings.</p>
    <input ref={fileInput} type="file" accept={RASTER_FILE_ACCEPT} aria-label="Replace image source file" style={{ display: "none" }} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void replaceSource(file); }} />
    <div className="property-actions"><button type="button" aria-label="Replace image source" disabled={disabled || applying || loadingSource} onClick={() => fileInput.current?.click()}>Replace source…</button></div>
    {loadingSource && <p role="status" className="property-hint">Decoding replacement… Apply stays unavailable until review is ready.</p>}
    {replacement && <div aria-label="Image source replacement preview">
      <div style={{ display: "flex", gap: 8 }}><figure style={{ margin: 0, flex: 1 }}><img alt="Current image source" src={asset.dataUrl} style={{ width: "100%", height: 64, objectFit: "contain" }} /><figcaption>Current</figcaption></figure><figure style={{ margin: 0, flex: 1 }}><img alt="Proposed image source" src={replacement.asset.dataUrl} style={{ width: "100%", height: 64, objectFit: "contain" }} /><figcaption>Replacement</figcaption></figure></div>
      <p className="property-hint">{replacement.asset.name} · Only this placement changes. Its size, crop, mask, and color settings stay in place. {replacement.conversionNotice}</p>
    </div>}
    <PrecisionField label="Width" aria-label="Image width" kind="length" min={0} minExclusive max={1_000_000} value={width} disabled={disabled} onChange={updateWidth} />
    <PrecisionField label="Height" aria-label="Image height" kind="length" min={0} minExclusive max={1_000_000} value={height} disabled={disabled} onChange={updateHeight} />
    <label className="image-aspect-lock"><input aria-label="Keep image aspect ratio" type="checkbox" checked={lockedAspectRatio !== null} disabled={disabled} onChange={event => toggleAspectRatio(event.target.checked)} />Keep aspect ratio</label>
    <label className="property-row">Mask<select aria-label="Image mask" value={mask} disabled={disabled} onChange={event => { setError(""); setMask(event.target.value as NonNullable<CadImageNodeParams["mask"]>); }}><option value="rect">Rectangle</option><option value="ellipse">Ellipse</option></select></label>
    <label className="image-opacity-row">Opacity<input aria-label="Image opacity" type="number" min="0" max="100" step="1" value={opacity} aria-invalid={!!opacityInputError} title={opacityInputError} disabled={disabled} onChange={event => { setError(""); setOpacity(event.target.value); }} /><span>%</span></label>
    <div className="image-crop-grid" aria-label="Crop insets">
      {(["left", "top", "right", "bottom"] as const).map(side => <label key={side}>{side}<input aria-label={`Crop ${side}`} type="number" min="0" max="99.9" step="0.1" value={crop[side]} disabled={disabled} onChange={event => { setError(""); setCrop(current => ({ ...current, [side]: event.target.value })); }} /><span>%</span></label>)}
    </div>
    <div className="property-actions"><button type="button" aria-label="Edit crop on canvas" aria-pressed={cropHandlesEnabled} disabled={disabled} onClick={() => toggleCropHandles(!cropHandlesEnabled)}>{cropHandlesEnabled ? "Done cropping" : "Edit crop on canvas"}</button></div>
    {cropHandlesEnabled && <p className="property-hint">Drag a crop edge or corner over the full source preview. The placement frame keeps its size.</p>}
    <div className="property-actions"><button type="button" disabled={disabled} onClick={resetFromSource}>Fit source</button></div>
    <fieldset className="image-adjustments" aria-label="Image color adjustments" disabled={disabled}>
      <legend>Color adjustments</legend>
      <p className="property-hint">Adjustments affect this placement. Original source pixels stay unchanged.</p>
      {(["brightness", "contrast", "saturation"] as const).map(name => <label className="image-adjustment-row" key={name}>
        <span>{name}</span>
        <input aria-label={`Image ${name}`} type="number" min="-100" max="100" step="1" value={adjustments[name]} aria-invalid={!!adjustmentInputError} title={adjustmentInputError} onChange={event => { setError(""); setAdjustments(current => ({ ...current, [name]: event.target.value })); }} />
        <input aria-label={`Image ${name} slider`} type="range" min="-100" max="100" step="1" value={Number(adjustments[name]) || 0} onChange={event => { setError(""); setAdjustments(current => ({ ...current, [name]: event.target.value })); }} />
      </label>)}
    </fieldset>
    <CommandReview state={interaction} />
    <div className="property-actions"><button type="button" aria-label="Apply image edit" disabled={!interaction.canApply} onClick={() => void apply()}>Apply</button><button type="button" aria-label="Cancel image edit" disabled={applying || !dirty && !loadingSource && !error} onClick={cancel}>Cancel</button></div>
  </PropertySection>;
}
