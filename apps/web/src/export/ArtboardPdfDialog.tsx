import { useEffect, useMemo, useRef, useState } from "react";
import { encodePdfRasterPages } from "../plot/pdfWriter";
import { downloadBlob } from "./exportModel";
import { artboardPngSvg, formatBytes, type ArtboardPngScene } from "./artboardPng";
import { ARTBOARD_PDF_DPI_OPTIONS, ARTBOARD_PDF_MAX_FILE_BYTES, planArtboardPdf, type ArtboardPdfDpi, type ArtboardPdfPlan } from "./artboardPdf";
import { renderArtboardPdfPageInWorker } from "./artboardPngRenderer";
import "../ui/palette.css";

export type ArtboardPdfBoard = { board: ArtboardPngScene["board"]; scene?: ArtboardPngScene; error?: string };
type RenderedPdf = { key: string; blob: Blob; previewUrl: string; bytes: number; decodeMs: number; renderMs: number; elapsedMs: number; pages: number; estimatedPeakBytes: number };

function isPdfPlan(value: ReturnType<typeof planArtboardPdf>): value is ArtboardPdfPlan {
  return !("error" in value);
}

export function ArtboardPdfDialog({ boards, activeBoardId, documentId, onClose, onExported }: {
  boards: ArtboardPdfBoard[];
  activeBoardId: string | null;
  documentId: string;
  onClose: () => void;
  onExported: (message: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [scope, setScope] = useState<"visible" | "active">(boards.length > 1 ? "visible" : "active");
  const [dpiInput, setDpiInput] = useState<ArtboardPdfDpi>(96);
  const [rendered, setRendered] = useState<RenderedPdf | null>(null);
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState("");
  const [renderError, setRenderError] = useState("");
  const selectedBoards = useMemo(() => {
    if (scope === "visible") return boards;
    const active = boards.find(entry => entry.board.id === activeBoardId) ?? boards[0];
    return active ? [active] : [];
  }, [scope, boards, activeBoardId]);
  const boardError = selectedBoards.find(entry => entry.error || !entry.scene);
  const planResult = useMemo(() => {
    if (boardError) return { error: boardError.error ?? `Could not prepare “${boardError.board.name}” for PDF output.` } as const;
    return planArtboardPdf(selectedBoards.map(entry => entry.scene!), dpiInput);
  }, [boardError, selectedBoards, dpiInput]);
  const plan = isPdfPlan(planResult) ? planResult : null;
  const planError = plan ? "" : (planResult as { error: string }).error;
  const currentKey = `${scope}:${dpiInput}:${selectedBoards.map(board => board.board.id).join(",")}`;
  const currentPreview = rendered?.key === currentKey ? rendered : null;

  useEffect(() => {
    dialog.current?.showModal();
    return () => { if (dialog.current?.open) dialog.current.close(); };
  }, []);

  useEffect(() => {
    if (rendered?.previewUrl) return () => URL.revokeObjectURL(rendered.previewUrl);
  }, [rendered?.previewUrl]);

  useEffect(() => {
    if (!plan) { setRendering(false); setProgress(""); setRenderError(""); return; }
    const controller = new AbortController();
    let pendingPreviewUrl: string | undefined;
    const startedAt = performance.now();
    setRendered(null); setRendering(true); setRenderError(""); setProgress(`Preparing ${plan.pages.length} PDF page${plan.pages.length === 1 ? "" : "s"}…`);
    const timer = window.setTimeout(() => {
      void (async () => {
        const rasterPages: Array<{ widthMm: number; heightMm: number; raster: { width: number; height: number; jpeg: Uint8Array } }> = [];
        let decodeMs = 0, renderMs = 0;
        for (const [index, page] of plan.pages.entries()) {
          if (controller.signal.aborted) return;
          setProgress(`Rendering page ${index + 1} of ${plan.pages.length} · ${page.scene.board.name}`);
          const svg = artboardPngSvg(page.scene, page);
          const result = await renderArtboardPdfPageInWorker(svg, page.width, page.height, controller.signal);
          if (controller.signal.aborted) return;
          const jpeg = new Uint8Array(await result.blob.arrayBuffer());
          if (index === 0) pendingPreviewUrl = URL.createObjectURL(result.blob);
          rasterPages.push({
            widthMm: page.scene.board.size[0],
            heightMm: page.scene.board.size[1],
            raster: { width: page.width, height: page.height, jpeg },
          });
          decodeMs += result.decodeMs; renderMs += result.renderMs;
        }
        if (controller.signal.aborted) return;
        const bytes = encodePdfRasterPages(rasterPages);
        if (bytes.byteLength > ARTBOARD_PDF_MAX_FILE_BYTES) throw new Error(`The generated PDF is ${formatBytes(bytes.byteLength)}; the file limit is ${formatBytes(ARTBOARD_PDF_MAX_FILE_BYTES)}. Lower dpi or export fewer boards.`);
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        const blob = new Blob([buffer], { type: "application/pdf" });
        if (!pendingPreviewUrl) throw new Error("The first PDF page preview could not be created.");
        const previewUrl = pendingPreviewUrl;
        pendingPreviewUrl = undefined;
        setRendered({ key: currentKey, blob, previewUrl, bytes: blob.size, decodeMs, renderMs, elapsedMs: performance.now() - startedAt, pages: rasterPages.length, estimatedPeakBytes: plan.estimatedPeakBytes });
        setRendering(false); setProgress("");
      })().catch(error => {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
        setRenderError(error instanceof Error ? error.message : "The artboard PDF could not be rendered.");
        setRendering(false); setProgress("");
      });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
      if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    };
  }, [plan, currentKey]);

  function close() { dialog.current?.close(); onClose(); }
  function exportPdf() {
    if (!currentPreview) return;
    const name = selectedBoards.length === 1
      ? selectedBoards[0].board.name.trim().replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || selectedBoards[0].board.id
      : "artboards";
    downloadBlob(currentPreview.blob, `${documentId}-${name}.pdf`);
    onExported(`Exported ${currentPreview.pages} artboard PDF page${currentPreview.pages === 1 ? "" : "s"} · ${dpiInput} dpi · ${formatBytes(currentPreview.bytes)} · render ${currentPreview.renderMs.toFixed(1)} ms`);
    close();
  }

  return <dialog ref={dialog} className="artboard-png-dialog artboard-pdf-dialog" aria-labelledby="artboard-pdf-title" aria-busy={rendering}
    onCancel={event => { event.preventDefault(); close(); }}
    onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div className="artboard-png-heading">
      <div><h2 id="artboard-pdf-title">Export Artboards PDF</h2><p>One page per board · exact physical size · opaque white PDF pages</p></div>
      <button type="button" aria-label="Close PDF export" onClick={close}>×</button>
    </div>
    <div className="artboard-png-body">
      <section className="artboard-png-settings" aria-label="PDF output settings">
        <label><span>Boards</span><select aria-label="PDF artboard scope" value={scope} onChange={event => setScope(event.target.value as "visible" | "active")}>
          {boards.length > 1 && <option value="visible">All visible boards ({boards.length})</option>}
          <option value="active">Active board · {boards.find(board => board.board.id === activeBoardId)?.board.name ?? boards[0]?.board.name}</option>
        </select></label>
        <label><span>Raster resolution</span><select aria-label="PDF raster resolution" value={dpiInput} onChange={event => setDpiInput(Number(event.target.value) as ArtboardPdfDpi)}>
          {ARTBOARD_PDF_DPI_OPTIONS.map(dpi => <option key={dpi} value={dpi}>{dpi} dpi</option>)}
        </select></label>
        {!plan ? <p role="alert" className="artboard-png-error">{planError}</p> : <>
          <div className="artboard-png-size"><span>Pages</span><strong>{plan.pages.length}</strong></div>
          <div className="artboard-png-size"><span>Total raster pixels</span><strong>{plan.totalPixels.toLocaleString()}</strong></div>
          <div className="artboard-png-size"><span>Estimated working memory</span><strong>{formatBytes(plan.estimatedPeakBytes)}</strong></div>
          <div className="artboard-png-size"><span>Estimated PDF size</span><strong>{formatBytes(plan.estimatedFileBytes)}</strong></div>
          <div className="artboard-pdf-page-list" aria-label="PDF page plan">
            {plan.pages.map((page, index) => <div key={page.scene.board.id} aria-label={`PDF page ${index + 1} ${page.scene.board.name}`}>
              <strong>{index + 1}. {page.scene.board.name}</strong>
              <span>{page.orientation} · {page.scene.board.size[0]} × {page.scene.board.size[1]} mm</span>
              <span>{page.width.toLocaleString()} × {page.height.toLocaleString()} px</span>
            </div>)}
          </div>
          <p className="artboard-png-hint">Pages match board millimetres; orientation follows each board. Transparent pixels are composited onto white. PDF raster is JPEG quality 94; vector and image artwork are flattened together.</p>
        </>}
        {rendering && <p role="status">{progress}</p>}
        {renderError && <p role="alert" className="artboard-png-error">{renderError}</p>}
        {currentPreview && <p role="status" data-pdf-preview-ready="true" data-pdf-pages={currentPreview.pages} data-pdf-bytes={currentPreview.bytes} data-pdf-decode-ms={currentPreview.decodeMs} data-pdf-render-ms={currentPreview.renderMs} data-pdf-elapsed-ms={currentPreview.elapsedMs} data-pdf-estimated-memory-bytes={currentPreview.estimatedPeakBytes}>PDF ready · {currentPreview.pages} pages · {formatBytes(currentPreview.bytes)} · render {currentPreview.renderMs.toFixed(1)} ms</p>}
      </section>
      <div className="artboard-png-preview" aria-label="First PDF page preview">
        {currentPreview ? <img src={currentPreview.previewUrl} alt={`PDF first page preview ${selectedBoards[0].board.name}`} /> : <span>{renderError || progress || "Preparing the first page preview…"}</span>}
      </div>
    </div>
    <div className="artboard-png-actions">
      <button type="button" onClick={close}>Cancel PDF export</button>
      <button type="button" aria-label="Download artboard PDF" disabled={!currentPreview || rendering} onClick={exportPdf}>Download PDF</button>
    </div>
  </dialog>;
}
