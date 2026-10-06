import UTIF from "utif";

const MAX_TIFF_PIXELS = 4_000_000;

self.onmessage = async (event: MessageEvent<ArrayBuffer>) => {
  try {
    const bytes = event.data;
    const ifds = UTIF.decode(bytes);
    if (ifds.length !== 1) throw new Error("Only single-page TIFF images are supported. Export the intended page separately.");
    const ifd = ifds[0];
    const width = ifd.t256?.[0], height = ifd.t257?.[0];
    if (typeof width !== "number" || typeof height !== "number" || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || width > 8192 || height > 8192 || width * height > MAX_TIFF_PIXELS) throw new Error("TIFF dimensions exceed the supported image limit.");
    const compression = ifd.t259?.[0] ?? 1;
    if (![1, 5, 8, 32773].includes(compression)) throw new Error("This TIFF compression is unsupported. Export it as PNG before importing.");
    const channels = ifd.t277?.[0] ?? 1, rowsPerStrip = ifd.t278?.[0] ?? height;
    const offsets = ifd.t273, lengths = ifd.t279;
    if (![0, 1, 2, 3].includes(ifd.t262?.[0] ?? 1) || !Number.isInteger(channels) || channels < 1 || channels > 4 || (ifd.t284?.[0] ?? 1) !== 1) throw new Error("This TIFF color layout is unsupported. Export it as RGB PNG before importing.");
    if (!Number.isInteger(rowsPerStrip) || rowsPerStrip < 1 || rowsPerStrip > height || !offsets || !lengths || offsets.length !== lengths.length || offsets.length !== Math.ceil(height / rowsPerStrip)
      || offsets.some((offset, index) => !Number.isSafeInteger(offset) || !Number.isSafeInteger(lengths[index]) || lengths[index] < 1 || offset < 0 || offset + lengths[index] > bytes.byteLength)) throw new Error("TIFF strip layout is invalid or exceeds the file. Export it as PNG before importing.");
    const bits = ifd.t258 ?? [8];
    if (bits.length !== channels || !bits.every(value => value === 8)) throw new Error("Only 8-bit TIFF channels are supported. Convert higher bit-depth images to PNG first.");
    UTIF.decodeImage(bytes, ifd);
    const rgba = UTIF.toRGBA8(ifd);
    if (rgba.length !== width * height * 4) throw new Error("TIFF decoded pixel count is inconsistent with its dimensions.");
    const canvas = new OffscreenCanvas(width, height), context = canvas.getContext("2d");
    if (!context) throw new Error("Browser cannot convert this TIFF to PNG.");
    context.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
    const png = await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer();
    self.postMessage({ png, width, height }, { transfer: [png] });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "TIFF could not be decoded." });
  }
};
