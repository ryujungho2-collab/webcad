import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { middleMouseNavigation, routeCadShortcut, type CadShortcutContext } from "../src/input/shortcutRouter";

const idle2d: CadShortcutContext = {
  workspaceMode: "2d",
  hasSelection: false,
  selectionEditable: false,
  activeLayerLocked: false,
  canOffset: false,
  canTrim: false,
  canExtrude: false,
};

describe("CAD shortcut routing", () => {
  test("R draws a rectangle only in empty 2D context, and rotates an editable selection", () => {
    assert.equal(routeCadShortcut("r", idle2d), "rectangle");
    assert.equal(routeCadShortcut("r", { ...idle2d, workspaceMode: "3d" }), null);
    assert.equal(routeCadShortcut("r", { ...idle2d, hasSelection: true, selectionEditable: true }), "rotate");
    assert.equal(routeCadShortcut("r", { ...idle2d, hasSelection: true }), null);
  });

  test("drawing and precision commands route only when their document context permits them", () => {
    assert.equal(routeCadShortcut("l", idle2d), "line");
    assert.equal(routeCadShortcut("l", { ...idle2d, activeLayerLocked: true }), null);
    assert.equal(routeCadShortcut("m", { ...idle2d, hasSelection: true, selectionEditable: true }), "move");
    assert.equal(routeCadShortcut("o", { ...idle2d, canOffset: true }), "offset");
    assert.equal(routeCadShortcut("t", { ...idle2d, canTrim: true }), "trim");
    assert.equal(routeCadShortcut("e", { ...idle2d, canExtrude: true }), "extrude");
    assert.equal(routeCadShortcut("d", idle2d), null);
  });

  test("middle mouse pans in both workspaces and Shift orbits only in 3D", () => {
    assert.equal(middleMouseNavigation("2d", false), "pan");
    assert.equal(middleMouseNavigation("2d", true), "pan");
    assert.equal(middleMouseNavigation("3d", false), "pan");
    assert.equal(middleMouseNavigation("3d", true), "orbit");
  });
});
