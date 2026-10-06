import { encodeSvg, type SvgExportItem } from "./svgWriter";

export const ARTBOARD_PNG_MIN_SCALE = 0.1;
export const ARTBOARD_PNG_MAX_SCALE = 16;
export const ARTBOARD_PNG_MAX_AXIS = 8192;
export const ARTBOARD_PNG_MAX_PIXELS = 16_000_000;
export const ARTBOARD_PNG_ESTIMATED_MEMORY_BUDGET = 160 * 1024 * 1024;
export const CSS_PIXELS_PER_MM = 96 / 25.4;

export type ArtboardPngSize = { width: number; height: number; pixels: number; estimatedPeakBytes: number };
export type ArtboardPngPlan = ArtboardPngSize | { error: string };
export type ArtboardPngScene = {
  board: { id: string; name: string; origin: [number, number]; size: [number, number]; workPlane: "XY" | "XZ" | "YZ"; background: string };
  items: SvgExportItem[];
};

/** Conservative RGBA estimate: decoded SVG + destination surface + encoder buffer + decoded unique sources. */
export function planArtboardPng(sizeMm: [number, number], scale: number, items: SvgExportItem[] = []): ArtboardPngPlan {
  if (!Number.isFinite(scale) || scale < ARTBOARD_PNG_MIN_SCALE || scale > ARTBOARD_PNG_MAX_SCALE) {
    return { error: `Scale must be between ${ARTBOARD_PNG_MIN_SCALE}× and ${ARTBOARD_PNG_MAX_SCALE}×.` };
  }
  if (!sizeMm.every(value => Number.isFinite(value) && value > 0)) return { error: "The artboard must have a finite, positive width and height." };
  const width = Math.round(sizeMm[0] * CSS_PIXELS_PER_MM * scale);
  const height = Math.round(sizeMm[1] * CSS_PIXELS_PER_MM * scale);
  if (width < 1 || height < 1) return { error: "The selected scale produces an empty PNG. Increase the scale." };
  if (width > ARTBOARD_PNG_MAX_AXIS || height > ARTBOARD_PNG_MAX_AXIS) {
    return { error: `PNG dimensions are limited to ${ARTBOARD_PNG_MAX_AXIS}px per side. Lower the scale.` };
  }
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels > ARTBOARD_PNG_MAX_PIXELS) {
    return { error: `PNG output is limited to ${ARTBOARD_PNG_MAX_PIXELS.toLocaleString()} pixels. Lower the scale.` };
  }
  const uniqueSources = new Map<string, number>();
  for (const item of items) {
    if (item.type !== "image" || !item.image.sourceSize) continue;
    const [sourceWidth, sourceHeight] = item.image.sourceSize;
    if (Number.isSafeInteger(sourceWidth) && Number.isSafeInteger(sourceHeight) && sourceWidth > 0 && sourceHeight > 0) {
      uniqueSources.set(item.image.href, Math.max(uniqueSources.get(item.image.href) ?? 0, sourceWidth * sourceHeight));
    }
  }
  const sourcePixels = [...uniqueSources.values()].reduce((sum, value) => sum + value, 0);
  const estimatedPeakBytes = pixels * 12 + sourcePixels * 4;
  if (estimatedPeakBytes > ARTBOARD_PNG_ESTIMATED_MEMORY_BUDGET) {
    return { error: `Estimated raster working memory is ${formatBytes(estimatedPeakBytes)}; the export limit is ${formatBytes(ARTBOARD_PNG_ESTIMATED_MEMORY_BUDGET)}. Lower the scale or reduce image source dimensions.` };
  }
  return { width, height, pixels, estimatedPeakBytes };
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "unknown";
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MiB` : `${(bytes / 1024).toFixed(1)} KiB`;
}

export function artboardPngSvg(scene: ArtboardPngScene, size: Pick<ArtboardPngSize, "width" | "height">): string {
  return encodeSvg([], {
    items: scene.items,
    viewBox: { origin: scene.board.origin, size: scene.board.size },
    background: scene.board.background,
    pixelSize: size,
  });
}
