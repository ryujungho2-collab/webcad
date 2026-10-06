export type CadImageCrop = { x: number; y: number; width: number; height: number };
export type CadImageMask = "rect" | "ellipse";
export type CadImageAdjustments = { brightness: number; contrast: number; saturation: number };
export const DEFAULT_CAD_IMAGE_ADJUSTMENTS: CadImageAdjustments = { brightness: 0, contrast: 0, saturation: 0 };
export type CadImageNodeParams = {
  kind: "image";
  assetId: string;
  workPlane: "XY" | "XZ" | "YZ";
  width: number;
  height: number;
  crop: CadImageCrop;
  /** Non-destructive shape clip applied after source crop and placement. */
  mask?: CadImageMask;
  /** Per-placement compositing alpha; source bytes remain untouched. */
  opacity?: number;
  /** Per-placement, non-destructive sRGB adjustments in -100..100; source bytes remain untouched. */
  adjustments?: CadImageAdjustments;
};

export function validImageAdjustments(value: unknown): value is CadImageAdjustments {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const adjustments = value as Record<string, unknown>;
  return ["brightness", "contrast", "saturation"].every(key => typeof adjustments[key] === "number" && Number.isFinite(adjustments[key]) && (adjustments[key] as number) >= -100 && (adjustments[key] as number) <= 100);
}

export function applyImageAdjustmentsToSrgb(rgb: readonly [number, number, number], adjustments: CadImageAdjustments): [number, number, number] {
  const brightness = adjustments.brightness / 100, contrast = 1 + adjustments.contrast / 100, saturation = 1 + adjustments.saturation / 100;
  const contrasted = rgb.map(channel => (channel + brightness - 0.5) * contrast + 0.5);
  const luminance = contrasted[0] * 0.2126 + contrasted[1] * 0.7152 + contrasted[2] * 0.0722;
  return contrasted.map(channel => Math.min(1, Math.max(0, luminance + (channel - luminance) * saturation))) as [number, number, number];
}

export function validImageNodeParams(value: unknown): value is CadImageNodeParams {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const params = value as Record<string, unknown>;
  if (params.kind !== "image" || typeof params.assetId !== "string" || !params.assetId || !["XY", "XZ", "YZ"].includes(String(params.workPlane))) return false;
  if (typeof params.width !== "number" || !Number.isFinite(params.width) || params.width <= 0 || params.width > 1_000_000 || typeof params.height !== "number" || !Number.isFinite(params.height) || params.height <= 0 || params.height > 1_000_000) return false;
  if (params.mask !== undefined && params.mask !== "rect" && params.mask !== "ellipse") return false;
  if (params.opacity !== undefined && (typeof params.opacity !== "number" || !Number.isFinite(params.opacity) || params.opacity < 0 || params.opacity > 1)) return false;
  if (params.adjustments !== undefined && !validImageAdjustments(params.adjustments)) return false;
  const crop = params.crop as Record<string, unknown> | undefined;
  if (!crop || typeof crop !== "object" || Array.isArray(crop)) return false;
  const { x, y, width, height } = crop;
  return [x, y, width, height].every(value => typeof value === "number" && Number.isFinite(value))
    && Number(x) >= 0 && Number(y) >= 0 && Number(width) > 0 && Number(height) > 0
    && Number(x) + Number(width) <= 1 + 1e-9 && Number(y) + Number(height) <= 1 + 1e-9;
}
