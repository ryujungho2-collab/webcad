import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { middleMouseNavigation, routeCadShortcut, routeHistoryShortcut, type CadShortcutContext } from "../src/input/shortcutRouter";

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
  test("document history has one chord grammar independent of the active tool", () => {
    const chord = { key: "z", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, defaultPrevented: false };
    assert.equal(routeHistoryShortcut(chord), "undo");
    assert.equal(routeHistoryShortcut({ ...chord, shiftKey: true }), "redo");
    assert.equal(routeHistoryShortcut({ ...chord, key: "Y" }), "redo");
    assert.equal(routeHistoryShortcut({ ...chord, ctrlKey: false, metaKey: true }), "undo");
    assert.equal(routeHistoryShortcut({ ...chord, ctrlKey: false }), null);
    assert.equal(routeHistoryShortcut({ ...chord, altKey: true }), null);
    assert.equal(routeHistoryShortcut({ ...chord, defaultPrevented: true }), null);
    assert.equal(routeHistoryShortcut({ ...chord, key: "s" }), null);
  });
  test("R keeps its rectangle meaning after creation or selection, including a locked selection", () => {
    assert.equal(routeCadShortcut("r", idle2d), "rectangle");
    assert.equal(routeCadShortcut("r", { ...idle2d, workspaceMode: "3d" }), null);
    assert.equal(routeCadShortcut("r", { ...idle2d, hasSelection: true, selectionEditable: true }), "rectangle");
    assert.equal(routeCadShortcut("r", { ...idle2d, hasSelection: true }), "rectangle");
    assert.equal(routeCadShortcut("r", { ...idle2d, activeLayerLocked: true }), null);
  });

  test("explicit transform chords do not fall back to creating unrelated geometry", () => {
    const selected = { ...idle2d, hasSelection: true, selectionEditable: true };
    assert.equal(routeCadShortcut("R", selected, { shiftKey: true }), "rotate");
    assert.equal(routeCadShortcut("C", selected, { shiftKey: true }), "copy");
    assert.equal(routeCadShortcut("r", idle2d, { shiftKey: true }), null);
    assert.equal(routeCadShortcut("c", { ...selected, selectionEditable: false }, { shiftKey: true }), null);
    assert.equal(routeCadShortcut("c", { ...selected, workspaceMode: "3d" }, { shiftKey: true }), null);
    assert.equal(routeCadShortcut("c", selected), "circle");
  });

  test("drawing and precision commands route only when their document context permits them", () => {
    assert.equal(routeCadShortcut("l", idle2d), "line");
    assert.equal(routeCadShortcut("l", { ...idle2d, activeLayerLocked: true }), null);
    assert.equal(routeCadShortcut("m", { ...idle2d, hasSelection: true, selectionEditable: true }), "move");
    assert.equal(routeCadShortcut("o", { ...idle2d, canOffset: true }), "offset");
    assert.equal(routeCadShortcut("t", { ...idle2d, canTrim: true }), "text");
    assert.equal(routeCadShortcut("t", { ...idle2d, activeLayerLocked: true }), null);
    assert.equal(routeCadShortcut("t", { ...idle2d, workspaceMode: "3d" }), null);
    assert.equal(routeCadShortcut("x", { ...idle2d, canTrim: true }), "trim");
    assert.equal(routeCadShortcut("x", { ...idle2d, canTrim: true }, { shiftKey: true }), "extend");
    assert.equal(routeCadShortcut("x", idle2d), null);
    assert.equal(routeCadShortcut("v", idle2d), "select");
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
