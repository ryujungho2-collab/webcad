import assert from "node:assert/strict";
import test from "node:test";
import { inspectTiff, isTiffBytes, tiffImportCapability } from "../src/integrations/photopea/tiffImport";
import { rgbTiffFixture } from "./helpers/tiffFixture";

test("Photopea UTIF adapter accepts a bounded single-page TIFF without becoming the document model", () => {
  const source = rgbTiffFixture();
  assert.deepEqual(inspectTiff(source), { width: 2, height: 2 });
  assert.equal(tiffImportCapability.output, "image/png");
  assert.equal(tiffImportCapability.license, "MIT");
  assert.equal(isTiffBytes(source), true);
});

test("TIFF preflight rejects broken directories, oversized dimensions, and multi-page files before decode", () => {
  const source = rgbTiffFixture();
  const broken = source.slice(); new DataView(broken.buffer).setUint32(4, broken.length + 4, true);
  assert.throws(() => inspectTiff(broken), /directory is outside/);
  const oversized = source.slice(); new DataView(oversized.buffer).setUint16(18, 8193, true);
  assert.throws(() => inspectTiff(oversized), /pixel import limit/);
  const multiPage = source.slice(); new DataView(multiPage.buffer).setUint32(130, 140, true);
  assert.throws(() => inspectTiff(multiPage), /Multi-page TIFF/);
  assert.equal(isTiffBytes(new Uint8Array([1, 2, 3])), false);
});
