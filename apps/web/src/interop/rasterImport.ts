import { MAX_RASTER_ASSET_AXIS, MAX_RASTER_ASSET_BYTES, MAX_RASTER_ASSET_PIXELS, type CadRasterAsset, type RasterMimeType } from "@agent-webcad/cad-document";

export const RASTER_FILE_ACCEPT = "image/png,image/jpeg,image/webp,image/tiff,.png,.jpg,.jpeg,.webp,.tif,.tiff";
export type RasterImport = { asset: CadRasterAsset; decodeMs: number; conversionNotice?: string };

/** Import and replacement share the same decoder, limits, and content identity. No document mutation. */
export async function importRasterFile(file: File, signal?: AbortSignal): Promise<RasterImport> {
  signal?.throwIfAborted();
  if (file.size <= 0 || file.size > MAX_RASTER_ASSET_BYTES) throw new Error("Image must be between 1 byte and 3 MiB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  signal?.throwIfAborted();
  const isPng = bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((value,index) => bytes[index] === value);
  const isJpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const isWebp = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4)) === "RIFF" && String.fromCharCode(...bytes.slice(8,12)) === "WEBP";
  const isTiff = bytes.length >= 8 && (bytes[0] === 73 && bytes[1] === 73 && bytes[2] === 42 && bytes[3] === 0 || bytes[0] === 77 && bytes[1] === 77 && bytes[2] === 0 && bytes[3] === 42);
  const sourceMime = isPng ? "image/png" : isJpeg ? "image/jpeg" : isWebp ? "image/webp" : isTiff ? "image/tiff" : undefined;
  if (!sourceMime || file.type && file.type !== sourceMime && !(isTiff && file.type === "image/x-tiff")) throw new Error("Unsupported image. Import a valid PNG, JPEG, WebP, or single-page TIFF file.");
  const started = performance.now();
  let storedBytes: Uint8Array<ArrayBuffer> = bytes, mimeType: RasterMimeType;
  let width: number, height: number;
  if (isTiff) {
    const { decodeTiffToPng } = await import("../integrations/photopea/tiffImport");
    const decoded = await decodeTiffToPng(bytes, signal);
    storedBytes = decoded.png; mimeType = "image/png"; width = decoded.width; height = decoded.height;
  } else {
    mimeType = sourceMime as RasterMimeType;
    const bitmap = await createImageBitmap(new Blob([bytes], { type: mimeType }));
    width = bitmap.width; height = bitmap.height; bitmap.close();
  }
  signal?.throwIfAborted();
  const decodeMs = performance.now() - started;
  if (!width || !height || width > MAX_RASTER_ASSET_AXIS || height > MAX_RASTER_ASSET_AXIS || width * height > MAX_RASTER_ASSET_PIXELS) throw new Error(`Image dimensions exceed the ${MAX_RASTER_ASSET_AXIS}px axis or ${MAX_RASTER_ASSET_PIXELS.toLocaleString()} pixel limit.`);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", storedBytes));
  signal?.throwIfAborted();
  const contentHash = Array.from(hash, value => value.toString(16).padStart(2, "0")).join("");
  let binary = "";
  for (let offset = 0; offset < storedBytes.length; offset += 0x8000) binary += String.fromCharCode(...storedBytes.subarray(offset, offset + 0x8000));
  return { asset: { id: `asset-${contentHash}`, name: file.name || "Imported image", mimeType, width, height, byteLength: storedBytes.length, dataUrl: `data:${mimeType};base64,${btoa(binary)}`, contentHash }, decodeMs,
    conversionNotice: isTiff ? "Converted to 8-bit PNG; TIFF metadata is not retained." : undefined };
}
