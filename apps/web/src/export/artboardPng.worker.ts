type RenderRequest = { id: number; bitmap: ImageBitmap; width: number; height: number; decodeMs: number; mimeType: "image/png" | "image/jpeg"; background?: string; quality?: number };
type RenderResult = { id: number; blob: Blob; decodeMs: number; renderMs: number } | { id: number; error: string };

self.onmessage = async (event: MessageEvent<RenderRequest>) => {
  const { id, bitmap, width, height, decodeMs, mimeType, background, quality } = event.data;
  let canvas: OffscreenCanvas | undefined;
  try {
    if (typeof OffscreenCanvas === "undefined") {
      throw new Error("This browser does not support off-main-thread artboard export. Update to a browser with OffscreenCanvas support.");
    }
    const started = performance.now();
    if (bitmap.width < 1 || bitmap.height < 1) throw new Error("The artboard preview could not be decoded for output.");
    canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d", { alpha: mimeType === "image/png", colorSpace: "srgb" });
    if (!context) throw new Error("The browser could not allocate the artboard render surface. Lower the output resolution and try again.");
    if (mimeType === "image/jpeg") {
      context.fillStyle = background ?? "#ffffff";
      context.fillRect(0, 0, width, height);
    } else context.clearRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await canvas.convertToBlob({ type: mimeType, ...(mimeType === "image/jpeg" ? { quality: quality ?? 0.94 } : {}) });
    if (blob.type !== mimeType || blob.size < (mimeType === "image/png" ? 24 : 4)) throw new Error(`The browser did not produce a valid ${mimeType === "image/png" ? "PNG" : "JPEG"} image.`);
    self.postMessage({ id, blob, decodeMs, renderMs: performance.now() - started } satisfies RenderResult);
  } catch (cause) {
    self.postMessage({ id, error: cause instanceof Error ? cause.message : "Artboard raster rendering failed." } satisfies RenderResult);
  } finally {
    bitmap.close();
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
};
