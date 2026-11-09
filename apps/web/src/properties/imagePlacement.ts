import type { CadImageCrop } from "@agent-webcad/cad-document";
/** Centered cover crop in normalized source coordinates; never resamples pixels. */
export function imageFillCrop(sourceWidth: number, sourceHeight: number, frameWidth: number, frameHeight: number): CadImageCrop {
  if (![sourceWidth, sourceHeight, frameWidth, frameHeight].every(n => Number.isFinite(n) && n > 0)) throw new Error("Image and frame dimensions must be positive.");
  const ratio = (frameWidth / frameHeight) / (sourceWidth / sourceHeight);
  const width = Math.min(1, ratio), height = Math.min(1, 1 / ratio);
  return { x: (1 - width) / 2, y: (1 - height) / 2, width, height };
}
