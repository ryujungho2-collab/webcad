import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { resolveDimension } from "../src/precision/dimensionGeometry";

describe("dimension geometry", () => {
  test("aligned linear resolves endpoints, arrows and label", () => {
    const resolved = resolveDimension({
      kind: "linear", workPlane: "XY",
      points: [[0, 0], [10, 0]], orientation: "aligned", offset: 10,
    });
    assert.ok(resolved);
    assert.equal(resolved.value, 10);
    assert.equal(resolved.text, "10.00 mm");
    // Dim line + 2 extensions + 4 arrow barbs.
    assert.equal(resolved.segments.length, 7);
    const [start, end] = resolved.segments[0];
    assert.deepEqual(start, [0, 10, 0]);
    assert.deepEqual(end, [10, 10, 0]);
    assert.deepEqual(resolved.textPosition, [5, 12.5, 0]);
  });

  test("horizontal measures X extent with the line past the farther point", () => {
    const resolved = resolveDimension({
      kind: "linear", workPlane: "XY",
      points: [[0, 4], [6, 0]], orientation: "horizontal", offset: 5,
    });
    assert.ok(resolved);
    assert.equal(resolved.value, 6);
    const [start, end] = resolved.segments[0];
    assert.deepEqual(start[1], 9);
    assert.deepEqual(end[1], 9);
  });

  test("vertical measures Y extent", () => {
    const resolved = resolveDimension({
      kind: "linear", workPlane: "XY",
      points: [[2, 1], [5, 9]], orientation: "vertical", offset: 4,
    });
    assert.ok(resolved);
    assert.equal(resolved.value, 8);
  });

  test("XZ plane maps through the work plane", () => {
    const resolved = resolveDimension({
      kind: "linear", workPlane: "XZ",
      points: [[0, 0], [10, 0]], orientation: "aligned", offset: 10,
    });
    assert.ok(resolved);
    const [start] = resolved.segments[0];
    assert.deepEqual(start, [0, 0, 10]);
  });

  test("radius resolves leader, rim arrow and R label", () => {
    const resolved = resolveDimension({
      kind: "radius", workPlane: "XY", center: [0, 0], radius: 5, angle: 45,
    });
    assert.ok(resolved);
    assert.equal(resolved.value, 5);
    assert.equal(resolved.text, "R 5.00 mm");
    // Leader + 2 arrow barbs.
    assert.equal(resolved.segments.length, 3);
  });

  test("text override wins over the measured value", () => {
    const resolved = resolveDimension({
      kind: "linear", workPlane: "XY",
      points: [[0, 0], [3, 4]], orientation: "aligned", offset: 10, text: "TYP",
    });
    assert.ok(resolved);
    assert.equal(resolved.text, "TYP");
    assert.equal(resolved.value, 5);
  });

  test("invalid params resolve to null", () => {
    assert.equal(resolveDimension({ kind: "linear", points: [[0, 0], [0, 0]] }), null);
    assert.equal(resolveDimension({ kind: "linear", points: [[0, 0]] }), null);
    assert.equal(resolveDimension({ kind: "radius", center: [0, 0], radius: 0 }), null);
    assert.equal(resolveDimension({ kind: "radius", center: [0, 0], radius: -2 }), null);
    assert.equal(resolveDimension({ kind: "angle" }), null);
  });
});
