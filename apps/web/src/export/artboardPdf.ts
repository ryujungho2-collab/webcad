import { ARTBOARD_PNG_MAX_AXIS, ARTBOARD_PNG_MAX_PIXELS, ARTBOARD_PNG_ESTIMATED_MEMORY_BUDGET, planArtboardPng, formatBytes, type ArtboardPngScene } from "./artboardPng";

export const ARTBOARD_PDF_DPI_OPTIONS = [72, 96, 150, 300] as const;
export type ArtboardPdfDpi = typeof ARTBOARD_PDF_DPI_OPTIONS[number];
export const ARTBOARD_PDF_MAX_PAGES = 32;
export const ARTBOARD_PDF_MAX_TOTAL_PIXELS = ARTBOARD_PNG_MAX_PIXELS;
export const ARTBOARD_PDF_ESTIMATED_MEMORY_BUDGET = 256 * 1024 * 1024;
export const ARTBOARD_PDF_MAX_FILE_BYTES = 128 * 1024 * 1024;

export type ArtboardPdfPagePlan = {
  scene: ArtboardPngScene;
  width: number;
  height: number;
  pixels: number;
  orientation: "landscape" | "portrait";
  estimatedRasterBytes: number;
};
export type ArtboardPdfPlan = {
  pages: ArtboardPdfPagePlan[];
  dpi: ArtboardPdfDpi;
  totalPixels: number;
  estimatedPeakBytes: number;
  estimatedFileBytes: number;
};
export type ArtboardPdfPlanResult = ArtboardPdfPlan | { error: string };

/** Preflight every page and the aggregate before allocating any raster surfaces. */
export function planArtboardPdf(scenes: ArtboardPngScene[], dpi: number): ArtboardPdfPlanResult {
  if (!ARTBOARD_PDF_DPI_OPTIONS.includes(dpi as ArtboardPdfDpi)) return { error: "Choose a supported PDF resolution: 72, 96, 150 or 300 dpi." };
  if (!scenes.length) return { error: "Choose at least one visible artboard before exporting a PDF." };
  if (scenes.length > ARTBOARD_PDF_MAX_PAGES) return { error: `PDF export is limited to ${ARTBOARD_PDF_MAX_PAGES} pages. Export fewer visible artboards at a time.` };
  const ids = new Set<string>();
  const pages: ArtboardPdfPagePlan[] = [];
  const sourcePixelsByData = new Map<string, number>();
  let totalPixels = 0, largestPageWorkingBytes = 0;
  for (const scene of scenes) {
    if (ids.has(scene.board.id)) return { error: `Artboard “${scene.board.name}” appears more than once in the PDF page list.` };
    ids.add(scene.board.id);
    const rasterPlan = planArtboardPng(scene.board.size, dpi / 96, scene.items);
    if ("error" in rasterPlan) return { error: `Cannot render “${scene.board.name}” at ${dpi} dpi: ${rasterPlan.error}` };
    totalPixels += rasterPlan.pixels;
    largestPageWorkingBytes = Math.max(largestPageWorkingBytes, rasterPlan.estimatedPeakBytes);
    if (!Number.isSafeInteger(totalPixels) || totalPixels > ARTBOARD_PDF_MAX_TOTAL_PIXELS) {
      return { error: `The PDF would contain ${totalPixels.toLocaleString()} raster pixels; the export limit is ${ARTBOARD_PDF_MAX_TOTAL_PIXELS.toLocaleString()}. Lower dpi or export fewer/smaller boards.` };
    }
    for (const item of scene.items) {
      if (item.type !== "image" || !item.image.sourceSize) continue;
      const [sourceWidth, sourceHeight] = item.image.sourceSize;
      if (Number.isSafeInteger(sourceWidth) && Number.isSafeInteger(sourceHeight) && sourceWidth > 0 && sourceHeight > 0) {
        sourcePixelsByData.set(item.image.href, Math.max(sourcePixelsByData.get(item.image.href) ?? 0, sourceWidth * sourceHeight));
      }
    }
    pages.push({
      scene,
      width: rasterPlan.width,
      height: rasterPlan.height,
      pixels: rasterPlan.pixels,
      orientation: scene.board.size[0] >= scene.board.size[1] ? "landscape" : "portrait",
      estimatedRasterBytes: rasterPlan.estimatedPeakBytes,
    });
  }
  const sourcePixels = [...sourcePixelsByData.values()].reduce((sum, pixels) => sum + pixels, 0);
  // Page rasterization plus retained JPEG page streams and the final PDF buffer.
  const estimatedPeakBytes = largestPageWorkingBytes + totalPixels * 6 + sourcePixels * 4 + 8 * 1024 * 1024;
  if (estimatedPeakBytes > ARTBOARD_PDF_ESTIMATED_MEMORY_BUDGET) {
    return { error: `Estimated PDF working memory is ${formatBytes(estimatedPeakBytes)}; the limit is ${formatBytes(ARTBOARD_PDF_ESTIMATED_MEMORY_BUDGET)}. Lower dpi or export fewer/smaller boards.` };
  }
  const estimatedFileBytes = totalPixels * 4 + pages.length * 64 * 1024;
  if (estimatedFileBytes > ARTBOARD_PDF_MAX_FILE_BYTES) {
    return { error: `Estimated PDF size is ${formatBytes(estimatedFileBytes)}; the limit is ${formatBytes(ARTBOARD_PDF_MAX_FILE_BYTES)}. Lower dpi or export fewer/smaller boards.` };
  }
  if (pages.some(page => page.width > ARTBOARD_PNG_MAX_AXIS || page.height > ARTBOARD_PNG_MAX_AXIS)) {
    return { error: `Each PDF page raster is limited to ${ARTBOARD_PNG_MAX_AXIS.toLocaleString()} px per side.` };
  }
  return { pages, dpi: dpi as ArtboardPdfDpi, totalPixels, estimatedPeakBytes, estimatedFileBytes };
}
