import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { CadDocument } from "@agent-webcad/cad-document";
import { resolveCornerPreview } from "../src/viewport/cornerPreview";

const controls = [
  { id: "v0", role: "vertex", index: 0 },
  { id: "v1", role: "vertex", index: 1 },
  { id: "v2", role: "vertex", index: 2 },
] as { id: string; role: "vertex"; index: number }[];
const segments = [
  { id: "s0", startControlId: "v0", endControlId: "v1", index: 0, kind: "line" as const },
  { id: "s1", startControlId: "v1", endControlId: "v2", index: 1, kind: "line" as const },
];

function documentWithCorner(points: [number, number, number][], workPlane = "XY", translate?: [number, number, number]): CadDocument {
  const params = {
    kind: "polyline",
    workPlane,
    points,
    topology: { version: 1 as const, controls: structuredClone(controls), segments: structuredClone(segments), curves: [] },
  };
  return {
    id: "corner-test",
    revision: 0,
    objects: {
      corner: {
        id: "corner",
        geometryId: "geometry-corner",
        name: "corner",
        visible: true,
        layerId: "layer-default",
        ...(translate ? { transform: { translation: translate, rotation: [0, 0, 0] as [number, number, number], scale: [1, 1, 1] as [number, number, number] } } : {}),
      },
    },
    features: { "feature-corner": { id: "feature-corner", type: "drawing" as const, inputs: [], output: "corner", params } },
    layers: { "layer-default": { id: "layer-default", name: "Default", visible: true, locked: false, objectIds: ["corner"] } },
    rootObjects: ["corner"],
    rootLayers: ["layer-default"],
  } as unknown as CadDocument;
}

const approx = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`);

describe("corner treatment preview", () => {
  test("previews an exact 90° fillet without mutating the source", () => {
    const document = documentWithCorner([[0, 0, 0], [10, 0, 0], [10, 10, 0]]);
    const before = structuredClone(document.features["feature-corner"].params);
    const result = resolveCornerPreview(document, { objectId: "corner", controlId: "v1", treatment: "fillet", distance: 2 });
    const filletPoints = result?.points as [number, number, number][];
    assert.deepEqual(filletPoints[0], [0, 0, 0]);
    approx(filletPoints[1][0], 8);
    approx(filletPoints[1][1], 0);
    approx(filletPoints[2][0], 10);
    approx(filletPoints[2][1], 2);
    assert.deepEqual(filletPoints[3], [10, 10, 0]);
    const bulges = result?.bulges as number[];
    assert.equal(bulges.length, 3);
    assert.equal(bulges[0], 0);
    approx(bulges[1], Math.tan(Math.PI / 8));
    assert.equal(bulges[2], 0);
    assert.deepEqual(document.features["feature-corner"].params, before);
  });

  test("previews an exact chamfer with zero bulges", () => {
    const document = documentWithCorner([[0, 0, 0], [10, 0, 0], [10, 10, 0]]);
    const result = resolveCornerPreview(document, { objectId: "corner", controlId: "v1", treatment: "chamfer", distance: 2 });
    assert.deepEqual(result?.points, [[0, 0, 0], [8, 0, 0], [10, 2, 0], [10, 10, 0]]);
    assert.deepEqual(result?.bulges, [0, 0, 0]);
  });

  test("previews a non-90° fillet at the exact tangent setback", () => {
    const document = documentWithCorner([[0, 0, 0], [10, 0, 0], [15, 5 * Math.sqrt(3), 0]]);
    const result = resolveCornerPreview(document, { objectId: "corner", controlId: "v1", treatment: "fillet", distance: 2 });
    const points = result?.points as [number, number, number][];
    approx(points[1][0], 10 - 2 / Math.sqrt(3));
    approx(points[1][1], 0);
    approx(points[2][0], 10 + 0.5 * (2 / Math.sqrt(3)));
    approx(points[2][1], (Math.sqrt(3) / 2) * (2 / Math.sqrt(3)));
  });

  test("previews translated corners in local coordinates", () => {
    const document = documentWithCorner([[0, 0, 0], [10, 0, 0], [10, 10, 0]], "XY", [5, 5, 5]);
    const result = resolveCornerPreview(document, { objectId: "corner", controlId: "v1", treatment: "fillet", distance: 2 });
    const moved = result?.points as [number, number, number][];
    approx(moved[1][0], 8);
    approx(moved[2][1], 2);
  });

  test("previews XZ-plane corners with elevation preserved", () => {
    const document = documentWithCorner([[0, 0, 0], [10, 0, 0], [10, 0, 10]], "XZ");
    const result = resolveCornerPreview(document, { objectId: "corner", controlId: "v1", treatment: "chamfer", distance: 2 });
    assert.deepEqual(result?.points, [[0, 0, 0], [8, 0, 0], [10, 0, 2], [10, 0, 10]]);
  });

  test("returns null for invalid, hidden, locked or degenerate requests", () => {
    const document = documentWithCorner([[0, 0, 0], [10, 0, 0], [10, 10, 0]]);
    const base = { objectId: "corner", controlId: "v1", treatment: "fillet" as const };
    assert.equal(resolveCornerPreview(document, { ...base, distance: 0 }), null);
    assert.equal(resolveCornerPreview(document, { ...base, distance: Number.NaN }), null);
    assert.equal(resolveCornerPreview(document, { ...base, distance: 2, controlId: "missing" }), null);
    assert.equal(resolveCornerPreview(document, { ...base, distance: 2, objectId: "missing" }), null);
    assert.equal(resolveCornerPreview(document, { ...base, distance: 20 }), null);
    const straight = documentWithCorner([[0, 0, 0], [10, 0, 0], [20, 0, 0]]);
    assert.equal(resolveCornerPreview(straight, { ...base, distance: 2 }), null);
    const hidden = documentWithCorner([[0, 0, 0], [10, 0, 0], [10, 10, 0]]);
    hidden.objects.corner.visible = false;
    assert.equal(resolveCornerPreview(hidden, { ...base, distance: 2 }), null);
    const locked = documentWithCorner([[0, 0, 0], [10, 0, 0], [10, 10, 0]]);
    locked.layers["layer-default"].locked = true;
    assert.equal(resolveCornerPreview(locked, { ...base, distance: 2 }), null);
  });
});
