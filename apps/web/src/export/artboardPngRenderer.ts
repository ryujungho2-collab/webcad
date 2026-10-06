export type ArtboardPngRender = { blob: Blob; decodeMs: number; renderMs: number };
export type ArtboardPdfPageRender = ArtboardPngRender;

/** Decode a self-contained SVG, then rasterize/encode off the UI thread. */
function renderArtboardInWorker(svg: string, width: number, height: number, mimeType: "image/png" | "image/jpeg", signal?: AbortSignal, background?: string, quality?: number): Promise<ArtboardPngRender> {
  if (signal?.aborted) return Promise.reject(new DOMException("Artboard render cancelled.", "AbortError"));
  const worker = new Worker(new URL("./artboardPng.worker.ts", import.meta.url), { type: "module", name: "artboard-raster-render" });
  return new Promise((resolve, reject) => {
    let image: HTMLImageElement | undefined, imageUrl: string | undefined, bitmap: ImageBitmap | undefined, settled = false;
    const cleanup = () => {
      signal?.removeEventListener("abort", abort);
      worker.terminate();
      bitmap?.close(); bitmap = undefined;
      if (image) image.src = "";
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
    const fail = (cause: unknown) => { if (settled) return; settled = true; cleanup(); reject(cause instanceof Error ? cause : new Error("Artboard raster rendering failed.")); };
    const abort = () => { fail(new DOMException("Artboard render cancelled.", "AbortError")); };
    signal?.addEventListener("abort", abort, { once: true });
    worker.onerror = event => fail(new Error(event.message || "The artboard raster worker failed."));
    worker.onmessage = (event: MessageEvent<{ id: number; blob?: Blob; decodeMs?: number; renderMs?: number; error?: string }>) => {
      if (event.data.error || !event.data.blob || event.data.blob.type !== mimeType || !Number.isFinite(event.data.decodeMs) || !Number.isFinite(event.data.renderMs)) {
        fail(new Error(event.data.error ?? `The worker did not return a valid ${mimeType} image.`)); return;
      }
      if (settled) return;
      settled = true; cleanup(); resolve({ blob: event.data.blob, decodeMs: event.data.decodeMs!, renderMs: event.data.renderMs! });
    };
    void (async () => {
      const started = performance.now();
      imageUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
      image = new Image(); image.src = imageUrl;
      await image.decode();
      if (signal?.aborted) return;
      const decodedBitmap = await createImageBitmap(image);
      if (signal?.aborted) { decodedBitmap.close(); return; }
      bitmap = decodedBitmap;
      const decodeMs = performance.now() - started;
      worker.postMessage({ id: 1, bitmap: decodedBitmap, width, height, decodeMs, mimeType, ...(background ? { background } : {}), ...(quality === undefined ? {} : { quality }) }, [decodedBitmap]);
      bitmap = undefined;
    })().catch(fail);
  });
}

export function renderArtboardPngInWorker(svg: string, width: number, height: number, signal?: AbortSignal): Promise<ArtboardPngRender> {
  return renderArtboardInWorker(svg, width, height, "image/png", signal);
}

/** PDF page rasters are flattened to white and encoded as JPEG for PDF DCT streams. */
export function renderArtboardPdfPageInWorker(svg: string, width: number, height: number, signal?: AbortSignal): Promise<ArtboardPdfPageRender> {
  return renderArtboardInWorker(svg, width, height, "image/jpeg", signal, "#ffffff", 0.94);
}
