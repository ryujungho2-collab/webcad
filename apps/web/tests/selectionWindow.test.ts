import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { matchesSelectionWindow, type ScreenPoint } from "../src/viewport/selectionWindow";

const rect = { left: 10, right: 30, top: 10, bottom: 30 };

describe("CAD directional box selection", () => {
  test("window selects only fully contained paths", () => {
    const inside: ScreenPoint[] = [{ x: 12, y: 12 }, { x: 28, y: 28 }];
    const crossing: ScreenPoint[] = [{ x: 0, y: 20 }, { x: 40, y: 20 }];
    assert.equal(matchesSelectionWindow(inside, rect, "window"), true);
    assert.equal(matchesSelectionWindow(crossing, rect, "window"), false);
  });

  test("crossing selects a segment even when neither endpoint is inside", () => {
    const crossing: ScreenPoint[] = [{ x: 0, y: 20 }, { x: 40, y: 20 }];
    assert.equal(matchesSelectionWindow(crossing, rect, "crossing"), true);
  });

  test("closed geometry detects an edge crossing the rectangle", () => {
    const ring: ScreenPoint[] = [{ x: 0, y: 20 }, { x: 40, y: 20 }, { x: 40, y: 40 }, { x: 0, y: 40 }];
    assert.equal(matchesSelectionWindow(ring, rect, "crossing", true), true);
    assert.equal(matchesSelectionWindow(ring, rect, "window", true), false);
  });
});
