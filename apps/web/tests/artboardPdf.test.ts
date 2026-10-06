import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ArtboardPngScene } from "../src/export/artboardPng";
import { ARTBOARD_PDF_MAX_PAGES, planArtboardPdf } from "../src/export/artboardPdf";

function scene(id: string, name: string, size: [number, number]): ArtboardPngScene {
  return { board: { id, name, origin: [0, 0], size, workPlane: "XY", background: "#ffffff" }, items: [] };
}

describe("artboard PDF preflight", () => {
  test("keeps document board order, exact physical page sizes and per-board orientation", () => {
    const result = planArtboardPdf([
      scene("landscape", "Wide board", [50.8, 25.4]),
      scene("portrait", "Tall board", [25.4, 50.8]),
    ], 96);
    assert.ok(!("error" in result));
    assert.deepEqual(result.pages.map(page => page.scene.board.id), ["landscape", "portrait"]);
    assert.deepEqual(result.pages.map(page => [page.width, page.height, page.orientation]), [
      [192, 96, "landscape"],
      [96, 192, "portrait"],
    ]);
    assert.equal(result.totalPixels, 36_864);
    assert.ok(result.estimatedPeakBytes > result.totalPixels * 6);
    assert.ok(result.estimatedFileBytes > 0);
  });

  test("rejects unsupported resolution, empty and duplicate pages before rendering", () => {
    assert.match((planArtboardPdf([], 96) as { error: string }).error, /at least one visible artboard/i);
    assert.match((planArtboardPdf([scene("board", "Board", [25.4, 25.4])], 120) as { error: string }).error, /72, 96, 150 or 300 dpi/);
    const duplicate = planArtboardPdf([scene("same", "One", [25.4, 25.4]), scene("same", "Two", [50.8, 25.4])], 96);
    assert.ok("error" in duplicate && /more than once/.test(duplicate.error));
  });

  test("preflights aggregate raster pixels and page count across all selected boards", () => {
    const tooManyPixels = planArtboardPdf([scene("a", "A", [1200, 900]), scene("b", "B", [1200, 900])], 72);
    assert.ok("error" in tooManyPixels && /raster pixels/.test(tooManyPixels.error));
    const tooManyPages = planArtboardPdf(Array.from({ length: ARTBOARD_PDF_MAX_PAGES + 1 }, (_, index) => scene(`board-${index}`, `Board ${index}`, [25.4, 25.4])), 96);
    assert.ok("error" in tooManyPages && /32 pages/.test(tooManyPages.error));
  });

  test("uses the explicit white-page alpha policy while preserving the scene background", () => {
    const board = scene("board", "Board", [25.4, 25.4]);
    board.board.background = "";
    const result = planArtboardPdf([board], 150);
    assert.ok(!("error" in result));
    assert.equal(result.pages[0].scene.board.background, "");
    assert.deepEqual([result.pages[0].width, result.pages[0].height], [150, 150]);
  });
});
