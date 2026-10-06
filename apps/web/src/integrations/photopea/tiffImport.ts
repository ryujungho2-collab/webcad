import { MAX_RASTER_ASSET_BYTES } from "@agent-webcad/cad-document";

/** UTIF is isolated behind this import boundary; the document only stores PNG bytes. */
export const tiffImportCapability = { id: "photopea-utif-tiff", version: "3.1.0", license: "MIT", output: "image/png" } as const;
export const MAX_TIFF_PIXELS = 4_000_000;
const DECODE_TIMEOUT_MS = 10_000;

export type TiffPreview = { width: number; height: number };
export type DecodedTiff = TiffPreview & { png: Uint8Array<ArrayBuffer> };

export function isTiffBytes(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && (bytes[0] === 73 && bytes[1] === 73 && bytes[2] === 42 && bytes[3] === 0
    || bytes[0] === 77 && bytes[1] === 77 && bytes[2] === 0 && bytes[3] === 42);
}

/** Reject oversized or structurally suspect IFDs before handing bytes to the third-party decoder. */
export function inspectTiff(bytes: Uint8Array): TiffPreview {
  if (!isTiffBytes(bytes)) throw new Error("Invalid TIFF header. Choose a TIFF file with standard II or MM byte order.");
  if (bytes.byteLength > MAX_RASTER_ASSET_BYTES) throw new Error("TIFF source exceeds the 3 MiB image import limit.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const little = bytes[0] === 73;
  const u16 = (at: number) => view.getUint16(at, little);
  const u32 = (at: number) => view.getUint32(at, little);
  const offset = u32(4);
  if (offset < 8 || offset > bytes.length - 6) throw new Error("TIFF image directory is outside the file.");
  const count = u16(offset);
  if (count < 2 || count > 256 || offset + 2 + count * 12 + 4 > bytes.length) throw new Error("TIFF image directory is incomplete or too large.");
  let width: number | undefined, height: number | undefined;
  for (let index = 0; index < count; index++) {
    const at = offset + 2 + index * 12, tag = u16(at), type = u16(at + 2), values = u32(at + 4);
    if (tag !== 256 && tag !== 257) continue;
    if (values !== 1 || type !== 3 && type !== 4) throw new Error("TIFF dimensions must be single integer values.");
    const value = type === 3 ? u16(at + 8) : u32(at + 8);
    if (tag === 256) width = value; else height = value;
  }
  if (!width || !height) throw new Error("TIFF width and height are missing.");
  if (width > 8192 || height > 8192 || width * height > MAX_TIFF_PIXELS) throw new Error(`TIFF exceeds the ${MAX_TIFF_PIXELS.toLocaleString()} pixel import limit. Downsample before importing.`);
  if (u32(offset + 2 + count * 12) !== 0) throw new Error("Multi-page TIFF is not supported yet. Export one page as PNG or TIFF.");
  return { width, height };
}

export async function decodeTiffToPng(bytes: Uint8Array, signal?: AbortSignal): Promise<DecodedTiff> {
  signal?.throwIfAborted();
  const expected = inspectTiff(bytes);
  const worker = new Worker(new URL("./tiffDecode.worker.ts", import.meta.url), { type: "module" });
  return new Promise<DecodedTiff>((resolve, reject) => {
    let settled = false;
    const finish = (result?: DecodedTiff, error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      worker.terminate();
      if (error) reject(error); else resolve(result!);
    };
    const timer = setTimeout(() => finish(undefined, new Error("TIFF decode took too long. Convert the image to PNG before importing.")), DECODE_TIMEOUT_MS);
    const abort = () => finish(undefined, new DOMException("TIFF import cancelled.", "AbortError"));
    signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event: MessageEvent<{ png?: ArrayBuffer; width?: number; height?: number; error?: string }>) => {
      const result = event.data;
      if (result.error) return finish(undefined, new Error(result.error));
      if (!result.png || result.width !== expected.width || result.height !== expected.height) return finish(undefined, new Error("TIFF decoder returned inconsistent dimensions."));
      if (!result.png.byteLength || result.png.byteLength > MAX_RASTER_ASSET_BYTES) return finish(undefined, new Error("Converted TIFF exceeds the 3 MiB document image limit. Downsample it before importing."));
      finish({ png: new Uint8Array(result.png), width: expected.width, height: expected.height });
    };
    worker.onerror = () => finish(undefined, new Error("TIFF decoder failed. Export the image as PNG and retry."));
    const copy = bytes.slice().buffer;
    try { worker.postMessage(copy, [copy]); }
    catch (error) { finish(undefined, error instanceof Error ? error : new Error("TIFF worker could not start.")); }
  });
}
