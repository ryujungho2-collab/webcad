import assert from "node:assert/strict";
import { test } from "node:test";
import type { CadArtboard } from "@agent-webcad/cad-document";
import { artboardWorldCorners, artboardsForCanvas, resolveActiveArtboardId } from "../src/viewport/artboardCanvas";

const board = (id: string, workPlane: CadArtboard["workPlane"], visible = true, locked = false): CadArtboard => ({
  id, name: id, workPlane, origin: [10, 20], size: [30, 40], background: "#ffffff", visible, locked,
});

test("artboard canvas corners retain the document origin and each declared work-plane orientation", () => {
  assert.deepEqual(artboardWorldCorners(board("xy", "XY")), [[10, 20, 0], [40, 20, 0], [40, 60, 0], [10, 60, 0]]);
  assert.deepEqual(artboardWorldCorners(board("xz", "XZ")), [[10, 0, 20], [40, 0, 20], [40, 0, 60], [10, 0, 60]]);
  assert.deepEqual(artboardWorldCorners(board("yz", "YZ")), [[0, 10, 20], [0, 40, 20], [0, 40, 60], [0, 10, 60]]);
});

test("2D canvas filters to visible coplanar boards while 3D preserves mixed-plane geometry", () => {
  const boards = [board("xy", "XY"), board("xz", "XZ", true, true), board("yz-hidden", "YZ", false)];
  assert.deepEqual(artboardsForCanvas(boards, "2d", "XY").map(entry => entry.id), ["xy"]);
  assert.deepEqual(artboardsForCanvas(boards, "2d", "XZ").map(entry => entry.id), ["xz"]);
  assert.deepEqual(artboardsForCanvas(boards, "3d", "XY").map(entry => entry.id), ["xy", "xz"]);
  assert.equal(artboardsForCanvas(boards, "3d", "XY")[1].locked, true, "locked frames remain visible and can be activated");
});

test("workspace active board survives edits but falls forward after hide, delete, or an empty reload", () => {
  const visible = board("a", "XY"), second = board("b", "XZ"), hidden = board("c", "YZ", false);
  assert.equal(resolveActiveArtboardId("b", [visible, second]), "b");
  assert.equal(resolveActiveArtboardId("c", [visible, second, hidden]), "a");
  assert.equal(resolveActiveArtboardId("b", [visible]), "a");
  assert.equal(resolveActiveArtboardId(null, [hidden]), null);
});
