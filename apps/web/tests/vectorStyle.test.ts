import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { DEFAULT_VECTOR_STYLE, validVectorStyle, validVectorGradient, type CadVectorGradient } from "@agent-webcad/cad-document";
import { createDrawingSceneObject } from "../src/viewport/drawingRenderer";
import { createDraftingRenderObject } from "../src/viewport/draftingRenderer";
import { cadDocument } from "../src/state/cadDocument";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { resetTestDocument } from "./helpers/documentHarness";
import { deserializeDocument, serializeDocument } from "../../../packages/cad-document/src/serialization";

beforeEach(resetTestDocument);

describe("CAD vector appearance", () => {
  test("validates bounded, persistent stroke, fill, opacity and width values", () => {
    assert.equal(validVectorStyle(DEFAULT_VECTOR_STYLE), true);
    assert.equal(validVectorStyle({ stroke: "#123456", fill: null, fillGradient: null, opacity: 0, strokeWidth: 20 }), true);
    for (const style of [
      { ...DEFAULT_VECTOR_STYLE, stroke: "red" },
      { ...DEFAULT_VECTOR_STYLE, fill: "url(javascript:alert(1))" },
      { ...DEFAULT_VECTOR_STYLE, opacity: 1.1 },
      { ...DEFAULT_VECTOR_STYLE, strokeWidth: 0 },
    ]) assert.equal(validVectorStyle(style), false);
  });

  test("validates linear and radial gradient definitions", () => {
    const linear: CadVectorGradient = { type: "linear", stops: [{ offset: 0, color: "#ff0000" }, { offset: 1, color: "#0000ff" }], angle: 45 };
    const radial: CadVectorGradient = { type: "radial", stops: [{ offset: 0, color: "#ffffff" }, { offset: 0.5, color: "#808080" }, { offset: 1, color: "#000000" }], cx: 0.5, cy: 0.5, r: 0.5 };
    assert.equal(validVectorGradient(linear), true);
    assert.equal(validVectorGradient(radial), true);
    assert.equal(validVectorStyle({ ...DEFAULT_VECTOR_STYLE, fillGradient: linear }), true);
    assert.equal(validVectorStyle({ ...DEFAULT_VECTOR_STYLE, fillGradient: radial }), true);
    for (const gradient of [
      { type: "conic", stops: [{ offset: 0, color: "#ff0000" }, { offset: 1, color: "#0000ff" }] },
      { type: "linear", stops: [{ offset: 0, color: "#ff0000" }] },
      { type: "linear", stops: [{ offset: -0.1, color: "#ff0000" }, { offset: 1, color: "#0000ff" }] },
      { type: "linear", stops: [{ offset: 0, color: "red" }, { offset: 1, color: "#0000ff" }] },
      { type: "radial", stops: [{ offset: 0, color: "#ff0000" }, { offset: 1, color: "#0000ff" }], r: -1 },
    ]) assert.equal(validVectorGradient(gradient), false);
  });

  test("closed XY and XZ paths render an identity-preserving fill beneath the editable stroke", () => {
    for (const [workPlane, points] of [
      ["XY", [[0, 0, 0], [10, 0, 0], [10, 8, 0], [0, 8, 0]]],
      ["XZ", [[0, 0, 0], [10, 0, 0], [10, 0, 8], [0, 0, 8]]],
    ] as const) {
      const render = createDrawingSceneObject("profile", { kind: "polyline", closed: true, workPlane, points, vectorStyle: { ...DEFAULT_VECTOR_STYLE, fill: "#ffcc00", opacity: 0.5 } });
      assert.equal(render.type, "Group");
      assert.equal(render.userData.cadObjectId, "profile");
      assert.equal(render.children.length, 2);
      const fill = render.children[0];
      assert.equal(fill.userData.cadObjectId, "profile");
      assert.equal((fill as import("three").Mesh).material.transparent, true);
      const positions = (fill as import("three").Mesh).geometry.getAttribute("position");
      assert.ok(positions.count >= 4);
      assert.ok((fill as import("three").Mesh).geometry.getIndex()!.count >= 6);
      if (workPlane === "XZ") for (let index = 0; index < positions.count; index += 1) assert.ok(Math.abs(positions.getY(index)) < 1e-6);
    }
  });

  test("open curves keep a stroke render object and cannot receive an accidental fill", () => {
    const render = createDrawingSceneObject("line", { kind: "line", points: [[0, 0, 0], [10, 0, 0]], vectorStyle: { ...DEFAULT_VECTOR_STYLE, fill: "#ff0000" } });
    assert.equal(render.type, "Line2");
  });

  test("gradient fill renders on closed paths with correct opacity", () => {
    const gradient: CadVectorGradient = { type: "linear", stops: [{ offset: 0, color: "#ff0000" }, { offset: 1, color: "#0000ff" }], angle: 90 };
    const render = createDrawingSceneObject("gradient-rect", { kind: "rectangle", workPlane: "XY", points: [[0, 0, 0], [20, 0, 0], [20, 10, 0], [0, 10, 0]], vectorStyle: { ...DEFAULT_VECTOR_STYLE, fill: null, fillGradient: gradient, opacity: 0.7 } });
    assert.equal(render.type, "Group");
    const fill = render.children[0] as import("three").Mesh;
    assert.equal(fill.userData.cadObjectId, "gradient-rect");
    assert.equal((fill.material as import("three").MeshBasicMaterial).transparent, true);
    assert.equal((fill.material as import("three").MeshBasicMaterial).opacity, 0.7);
  });

  test("component instances render source vector stroke, fill and opacity", async () => {
    const style = { ...DEFAULT_VECTOR_STYLE, stroke: "#164f42", fill: "#d9f4ea", opacity: 0.65, strokeWidth: 1.2 };
    assert.ok((await dispatchCadCommand({
      type: "create-drawing", id: "source", drawing: "rectangle",
      params: { workPlane: "XY", points: [[0, 0, 0], [20, 0, 0], [20, 10, 0], [0, 10, 0]], vectorStyle: style },
    })).ok);
    assert.ok((await dispatchCadCommand({ type: "define-block", id: "symbol", name: "Symbol", objectIds: ["source"], base: [0, 0, 0] })).ok);
    assert.ok((await dispatchCadCommand({ type: "insert-block", id: "instance", blockId: "symbol", position: [100, 50, 0] })).ok);

    const render = createDraftingRenderObject("instance", cadDocument);
    assert.equal(render.children.length, 2);
    const fill = render.children[0] as import("three").Mesh;
    const stroke = render.children[1] as import("three/examples/jsm/lines/Line2.js").Line2;
    assert.equal(fill.userData.cadObjectId, "instance");
    assert.equal(fill.renderOrder, -1);
    assert.equal((fill.material as import("three").MeshBasicMaterial).color.getHexString(), "d9f4ea");
    assert.equal((fill.material as import("three").MeshBasicMaterial).opacity, 0.65);
    assert.equal((stroke.material as import("three/examples/jsm/lines/LineMaterial.js").LineMaterial).color.getHexString(), "164f42");
    assert.ok(Math.abs((stroke.material as import("three/examples/jsm/lines/LineMaterial.js").LineMaterial).linewidth - 1.2 * 96 / 25.4) < 1e-10);
    assert.equal((stroke.material as import("three/examples/jsm/lines/LineMaterial.js").LineMaterial).opacity, 0.65);

    const reloaded = createDraftingRenderObject("instance", deserializeDocument(serializeDocument(cadDocument)));
    assert.equal(((reloaded.children[0] as import("three").Mesh).material as import("three").MeshBasicMaterial).color.getHexString(), "d9f4ea");
    assert.equal(((reloaded.children[1] as import("three/examples/jsm/lines/Line2.js").Line2).material as import("three/examples/jsm/lines/LineMaterial.js").LineMaterial).color.getHexString(), "164f42");
  });

  test("block override adds vector style to members without one", async () => {
    assert.ok((await dispatchCadCommand({
      type: "create-drawing", id: "plain", drawing: "rectangle",
      params: { workPlane: "XY", points: [[0, 0, 0], [20, 0, 0], [20, 10, 0], [0, 10, 0]] },
    })).ok);
    assert.ok((await dispatchCadCommand({ type: "define-block", id: "plain-symbol", name: "Plain", objectIds: ["plain"], base: [0, 0, 0] })).ok);
    assert.equal(cadDocument.blocks?.["plain-symbol"].members[0].objectId, "plain");
    assert.ok((await dispatchCadCommand({ type: "insert-block", id: "plain-instance", blockId: "plain-symbol", position: [50, 50, 0] })).ok);

    const overrideStyle = { ...DEFAULT_VECTOR_STYLE, stroke: "#ff0000", fill: "#00ff00", fillGradient: null, opacity: 0.8, strokeWidth: 2 };
    assert.ok((await dispatchCadCommand({ type: "set-block-override", blockId: "plain-symbol", objectId: "plain", vectorStyle: overrideStyle })).ok);

    const render = createDraftingRenderObject("plain-instance", cadDocument);
    assert.equal(render.children.length, 2);
    const fill = render.children[0] as import("three").Mesh;
    const stroke = render.children[1] as import("three/examples/jsm/lines/Line2.js").Line2;
    assert.equal((fill.material as import("three").MeshBasicMaterial).color.getHexString(), "00ff00");
    assert.equal((fill.material as import("three").MeshBasicMaterial).opacity, 0.8);
    assert.equal((stroke.material as import("three/examples/jsm/lines/LineMaterial.js").LineMaterial).color.getHexString(), "ff0000");
    assert.ok(Math.abs((stroke.material as import("three/examples/jsm/lines/LineMaterial.js").LineMaterial).linewidth - 2 * 96 / 25.4) < 1e-10);
    const reloaded = createDraftingRenderObject("plain-instance", deserializeDocument(serializeDocument(cadDocument)));
    assert.equal(((reloaded.children[0] as import("three").Mesh).material as import("three").MeshBasicMaterial).color.getHexString(), "00ff00");

    assert.ok((await dispatchCadCommand({ type: "set-block-override", blockId: "plain-symbol", objectId: "plain", clear: true })).ok);
    const cleared = createDraftingRenderObject("plain-instance", cadDocument);
    assert.equal(cleared.type, "Group");
    assert.equal(cleared.children.length, 1);
  });
});
