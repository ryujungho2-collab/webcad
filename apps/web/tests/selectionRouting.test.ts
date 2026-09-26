import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  cycleSelectionCandidate,
  hasSelectionToggleModifier,
  selectionDisplayTone,
  selectionPointerOwner,
  uniqueSelectionCandidates,
} from "../src/viewport/selectionRouting";

describe("viewport selection routing", () => {
  test("preserves pointer ownership priority", () => {
    assert.equal(selectionPointerOwner({ button: 1, drawingActive: true, directSelectActive: true, transformHandleActive: true }), "navigation");
    assert.equal(selectionPointerOwner({ button: 0, drawingActive: true, directSelectActive: true, transformHandleActive: true }), "drawing");
    assert.equal(selectionPointerOwner({ button: 0, drawingActive: false, directSelectActive: true, transformHandleActive: true }), "direct-select");
    assert.equal(selectionPointerOwner({ button: 0, drawingActive: false, directSelectActive: false, transformHandleActive: true }), "transform");
    assert.equal(selectionPointerOwner({ button: 0, drawingActive: false, directSelectActive: false, transformHandleActive: false }), "object-selection");
  });

  test("normalizes modifiers and de-duplicates hit candidates", () => {
    assert.equal(hasSelectionToggleModifier({ shiftKey: false, ctrlKey: true, metaKey: false }), true);
    assert.equal(hasSelectionToggleModifier({ shiftKey: false, ctrlKey: false, metaKey: false }), false);
    assert.deepEqual(uniqueSelectionCandidates(["front", undefined, "front", "back"]), ["front", "back"]);
  });

  test("selection display tone prioritizes real selection over hover", () => {
    const base = { primaryId: "a", selectedIds: ["a", "b"], hoveredId: "c" };
    assert.equal(selectionDisplayTone({ ...base, objectId: "a" }), "primary");
    assert.equal(selectionDisplayTone({ ...base, objectId: "b" }), "secondary");
    assert.equal(selectionDisplayTone({ ...base, objectId: "c" }), "hover");
    assert.equal(selectionDisplayTone({ ...base, objectId: "d" }), "default");
    // Hover never overrides selection, even when they coincide.
    assert.equal(selectionDisplayTone({ ...base, objectId: "a", hoveredId: "a" }), "primary");
    assert.equal(selectionDisplayTone({ ...base, objectId: "b", hoveredId: "b" }), "secondary");
    assert.equal(selectionDisplayTone({ primaryId: null, selectedIds: [], hoveredId: null, objectId: "a" }), "default");
  });

  test("cycles overlapping objects only for an unmodified repeated pick", () => {
    const first = cycleSelectionCandidate({ candidates: ["front", "back"], pointerKey: "10:20", previousKey: "", previousIndex: 0, toggleModifier: false });
    assert.deepEqual(first, { objectId: "front", nextKey: "10:20", nextIndex: 0 });
    const second = cycleSelectionCandidate({ candidates: ["front", "back"], pointerKey: "10:20", previousKey: first.nextKey, previousIndex: first.nextIndex, toggleModifier: false });
    assert.equal(second.objectId, "back");
    const modified = cycleSelectionCandidate({ candidates: ["front", "back"], pointerKey: "10:20", previousKey: second.nextKey, previousIndex: second.nextIndex, toggleModifier: true });
    assert.equal(modified.objectId, "front");
  });
});
