import type { CadImageCrop } from "@agent-webcad/cad-document";

export type ImageCropHandle = "left" | "right" | "top" | "bottom" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type CropPoint = { x: number; y: number };

export function imageCropBoundaryPoints(crop: CadImageCrop, width: number, height: number) {
  const left = -width / 2 + crop.x * width;
  const right = -width / 2 + (crop.x + crop.width) * width;
  const top = height / 2 - crop.y * height;
  const bottom = height / 2 - (crop.y + crop.height) * height;
  return {
    left, right, top, bottom,
    corners: [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }],
    handles: {
      left: { x: left, y: (top + bottom) / 2 },
      right: { x: right, y: (top + bottom) / 2 },
      top: { x: (left + right) / 2, y: top },
      bottom: { x: (left + right) / 2, y: bottom },
      "top-left": { x: left, y: top },
      "top-right": { x: right, y: top },
      "bottom-right": { x: right, y: bottom },
      "bottom-left": { x: left, y: bottom },
    } satisfies Record<ImageCropHandle, CropPoint>,
  };
}

export function cropFromImageCropHandle(
  crop: CadImageCrop,
  handle: ImageCropHandle,
  point: CropPoint,
  frameWidth: number,
  frameHeight: number,
  sourceWidth: number,
  sourceHeight: number,
): CadImageCrop {
  const minWidth = Math.min(1, 1 / Math.max(1, sourceWidth));
  const minHeight = Math.min(1, 1 / Math.max(1, sourceHeight));
  const originalLeft = crop.x, originalRight = crop.x + crop.width;
  const originalTop = crop.y, originalBottom = crop.y + crop.height;
  let left = originalLeft, right = originalRight, top = originalTop, bottom = originalBottom;
  const horizontal = (point.x + frameWidth / 2) / frameWidth;
  const vertical = (frameHeight / 2 - point.y) / frameHeight;
  if (handle.includes("left")) left = Math.max(0, Math.min(horizontal, right - minWidth));
  if (handle.includes("right")) right = Math.min(1, Math.max(horizontal, left + minWidth));
  if (handle.includes("top")) top = Math.max(0, Math.min(vertical, bottom - minHeight));
  if (handle.includes("bottom")) bottom = Math.min(1, Math.max(vertical, top + minHeight));
  return { x: left, y: top, width: right - left, height: bottom - top };
}
