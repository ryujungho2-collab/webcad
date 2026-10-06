export type RasterMimeType = "image/png" | "image/jpeg" | "image/webp";
export type CadRasterAsset = {
  id: string;
  name: string;
  mimeType: RasterMimeType;
  width: number;
  height: number;
  byteLength: number;
  /** Self-contained source bytes. Image edits only change ImageNode metadata. */
  dataUrl: string;
  /** SHA-256 of the stored source bytes; also serves as a content identity. */
  contentHash: string;
};

export const MAX_RASTER_ASSET_BYTES = 3 * 1024 * 1024;
export const MAX_RASTER_ASSET_PIXELS = 16_000_000;
export const MAX_RASTER_ASSET_AXIS = 8192;
export const MAX_DOCUMENT_RASTER_BYTES = 3 * 1024 * 1024;

export function validRasterAsset(value: unknown): value is CadRasterAsset {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const asset = value as Record<string, unknown>;
  if (typeof asset.id !== "string" || !asset.id || typeof asset.name !== "string" || !asset.name.trim() || asset.name.length > 255) return false;
  if (asset.mimeType !== "image/png" && asset.mimeType !== "image/jpeg" && asset.mimeType !== "image/webp") return false;
  if (!Number.isSafeInteger(asset.width) || Number(asset.width) <= 0 || Number(asset.width) > MAX_RASTER_ASSET_AXIS || !Number.isSafeInteger(asset.height) || Number(asset.height) <= 0 || Number(asset.height) > MAX_RASTER_ASSET_AXIS || Number(asset.width) * Number(asset.height) > MAX_RASTER_ASSET_PIXELS) return false;
  if (!Number.isSafeInteger(asset.byteLength) || Number(asset.byteLength) <= 0 || Number(asset.byteLength) > MAX_RASTER_ASSET_BYTES) return false;
  if (typeof asset.contentHash !== "string" || !/^[a-f0-9]{64}$/.test(asset.contentHash) || asset.id !== `asset-${asset.contentHash}`) return false;
  if (typeof asset.dataUrl !== "string") return false;
  const prefix = `data:${asset.mimeType};base64,`;
  if (!asset.dataUrl.startsWith(prefix)) return false;
  const encoded = asset.dataUrl.slice(prefix.length);
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) return false;
  const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
  return encoded.length > 0 && Math.floor(encoded.length * 3 / 4) - padding === asset.byteLength;
}
