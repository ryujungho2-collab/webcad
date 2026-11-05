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
    const tooManyPixels = planArtboardPdf(Array.from({length:9},(_,i)=>scene(`a${i}`,`A${i}`,[1200,900])),72);
    assert.ok("error" in tooManyPixels && /raster pixels/.test(tooManyPixels.error));
    const tooManyPages = planArtboardPdf(Array.from({ length: ARTBOARD_PDF_MAX_PAGES + 1 }, (_, index) => scene(`board-${index}`, `Board ${index}`, [25.4, 25.4])), 96);
    assert.ok("error" in tooManyPages && /32 pages/.test(tooManyPages.error));
  });

  test("a real twelve-sheet mixed A2/A3 interior issue fits at 96dpi while page, memory and file budgets remain enforced",()=>{
    const sheets=Array.from({length:12},(_,i)=>scene(`cafe-${i}`,`Cafe ${i}`,i<5?[594,420]:[420,297]));
    const result=planArtboardPdf(sheets,96);assert.ok(!("error" in result));
    assert.ok(result.totalPixels>16_000_000);assert.ok(result.estimatedPeakBytes<256*1024*1024);assert.ok(result.estimatedFileBytes<128*1024*1024);
    const oversized=planArtboardPdf(sheets,150);assert.ok("error" in oversized&&/memory|size|pixels/.test(oversized.error));
    const single=planArtboardPdf([scene("single","Single",[2000,1200])],96);assert.ok("error" in single&&/PNG output/.test(single.error));
    const memory=planArtboardPdf(Array.from({length:6},(_,i)=>scene(`m${i}`,`M${i}`,[594,420])),150);assert.ok("error" in memory&&/memory/.test(memory.error));
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
