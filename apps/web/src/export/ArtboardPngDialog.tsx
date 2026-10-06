import { useEffect, useMemo, useRef, useState } from "react";
import { downloadBlob } from "./exportModel";
import { artboardPngSvg, formatBytes, planArtboardPng, type ArtboardPngScene } from "./artboardPng";
import { renderArtboardPngInWorker } from "./artboardPngRenderer";
import "../ui/palette.css";

type RenderedPreview = { key: string; url: string; blob: Blob; decodeMs: number; renderMs: number; elapsedMs: number };

export function ArtboardPngDialog({ scene, filename, onClose, onExported }: {
  scene: ArtboardPngScene;
  filename: string;
  onClose: () => void;
  onExported: (message: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [scaleInput, setScaleInput] = useState("1");
  const [transparentBackground, setTransparentBackground] = useState(false);
  const [rendered, setRendered] = useState<RenderedPreview | null>(null);
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState("");
  const scale = scaleInput.trim() ? Number(scaleInput) : Number.NaN;
  const outputScene = useMemo(() => transparentBackground ? { ...scene, board: { ...scene.board, background: "" } } : scene, [scene, transparentBackground]);
  const plan = useMemo(() => planArtboardPng(outputScene.board.size, scale, outputScene.items), [outputScene, scale]);
  const currentKey = "error" in plan ? "invalid" : `${plan.width}x${plan.height}@${scale}:${transparentBackground ? "transparent" : "board-background"}`;
  const currentPreview = rendered?.key === currentKey ? rendered : null;

  useEffect(() => {
    dialog.current?.showModal();
    return () => { if (dialog.current?.open) dialog.current.close(); };
  }, []);

  useEffect(() => {
    if (rendered?.url) return () => URL.revokeObjectURL(rendered.url);
  }, [rendered?.url]);

  useEffect(() => {
    if ("error" in plan) { setRendering(false); setRenderError(""); return; }
    const controller = new AbortController();
    const startedAt = performance.now();
    setRendering(true); setRenderError("");
    const timer = window.setTimeout(() => {
      try {
        const svg = artboardPngSvg(outputScene, plan);
        void renderArtboardPngInWorker(svg, plan.width, plan.height, controller.signal).then(result => {
          if (controller.signal.aborted) return;
          setRendered({ key: currentKey, url: URL.createObjectURL(result.blob), blob: result.blob, decodeMs: result.decodeMs, renderMs: result.renderMs, elapsedMs: performance.now() - startedAt });
          setRendering(false);
        }).catch(error => {
          if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
          setRenderError(error instanceof Error ? error.message : "PNG preview could not be rendered."); setRendering(false);
        });
      } catch (error) {
        setRenderError(error instanceof Error ? error.message : "The artboard could not be prepared for PNG export."); setRendering(false);
      }
    }, 120);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [outputScene, currentKey, plan]);

  function close() { dialog.current?.close(); onClose(); }
  function exportPng() {
    if (!currentPreview || "error" in plan) return;
    downloadBlob(currentPreview.blob, filename);
    onExported(`Exported ${scene.board.name} PNG · ${plan.width} × ${plan.height}px · ${formatBytes(currentPreview.blob.size)} · render ${currentPreview.renderMs.toFixed(1)} ms`);
    close();
  }

  return <dialog ref={dialog} className="artboard-png-dialog" aria-labelledby="artboard-png-title" aria-busy={rendering}
    onCancel={event => { event.preventDefault(); close(); }}
    onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div className="artboard-png-heading">
      <div><h2 id="artboard-png-title">Export PNG · {scene.board.name}</h2><p>96 dpi base · transparent pixels outside the board background</p></div>
      <button type="button" aria-label="Close PNG export" onClick={close}>×</button>
    </div>
    <div className="artboard-png-body">
      <section className="artboard-png-settings" aria-label="PNG output settings">
        <label><span>Scale</span><div className="artboard-png-scale"><input type="number" min="0.1" max="16" step="0.25" inputMode="decimal" aria-label="PNG export scale" value={scaleInput} onChange={event => setScaleInput(event.target.value)} /><span>×</span></div></label>
        <label className="artboard-png-transparent"><input type="checkbox" aria-label="Transparent artboard background" checked={transparentBackground} onChange={event => setTransparentBackground(event.target.checked)} /><span>Transparent background</span></label>
        {"error" in plan ? <p role="alert" className="artboard-png-error">{plan.error}</p> : <>
          <div className="artboard-png-size"><span>Pixel dimensions</span><strong aria-label="PNG output dimensions">{plan.width.toLocaleString()} × {plan.height.toLocaleString()} px</strong></div>
          <div className="artboard-png-size"><span>Pixel count</span><strong>{plan.pixels.toLocaleString()}</strong></div>
          <div className="artboard-png-size"><span>Estimated raster memory</span><strong>{formatBytes(plan.estimatedPeakBytes)}</strong></div>
          <p className="artboard-png-hint">Output is limited by 8,192 px per side, 16 million pixels and a conservative 160 MiB working-memory estimate.</p>
        </>}
        {rendering && <p role="status">Rendering detached preview…</p>}
        {renderError && <p role="alert" className="artboard-png-error">{renderError}</p>}
        {currentPreview && <p role="status" data-png-preview-ready="true" data-png-decode-ms={currentPreview.decodeMs} data-png-render-ms={currentPreview.renderMs} data-png-elapsed-ms={currentPreview.elapsedMs} data-png-bytes={currentPreview.blob.size} data-png-estimated-memory-bytes={"error" in plan ? undefined : plan.estimatedPeakBytes}>Preview ready · decode {currentPreview.decodeMs.toFixed(1)} ms + render {currentPreview.renderMs.toFixed(1)} ms · {formatBytes(currentPreview.blob.size)}</p>}
      </section>
      <div className="artboard-png-preview" aria-label="PNG output preview">
        {currentPreview ? <img src={currentPreview.url} alt={`Rendered ${plan && "error" in plan ? "" : `${plan.width} by ${plan.height} pixel `}artboard PNG preview`} /> : <span>{"error" in plan ? "Choose a smaller scale" : renderError || "Preparing preview…"}</span>}
      </div>
    </div>
    <div className="artboard-png-actions">
      <button type="button" aria-label="Download artboard PNG" disabled={!currentPreview || rendering || "error" in plan} onClick={exportPng}>Download PNG</button>
      <button type="button" aria-label="Cancel PNG export" onClick={close}>Cancel</button>
    </div>
  </dialog>;
}
