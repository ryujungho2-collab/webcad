import assert from "node:assert/strict";
import { test } from "node:test";
import { applyPolarLocks, parsePointEntry, resolvePointInput } from "../src/precision/pointInput";
import { planeToWorld, worldToPlane, WORK_PLANES } from "../src/precision/workPlane";
import { resolveDrawingPointInput } from "../src/precision/drawingPointInput";

for (const id of ["XY", "XZ", "YZ"] as const) test(`${id}: unit, polar, coordinates and pointer locks resolve the same unrounded endpoint`, () => {
  const base: [number, number] = [12.3456789, -8.7654321], locks = { length: 25.4, angle: 90 };
  const pointer = applyPolarLocks(base, [44, 63], locks);
  const entries = [resolvePointInput("1in", base, [44, 63], { length: null, angle: 90 }),
    resolvePointInput("90deg", base, [44, 63], { length: 25.4, angle: null }, "angle"),
    parsePointEntry("@2.54cm<90deg", base), parsePointEntry("@0,1in", base)];
  for (const entry of entries) {
    assert.ok(entry);
    const roundTrip = worldToPlane(planeToWorld(entry, WORK_PLANES[id]), WORK_PLANES[id]);
    roundTrip.forEach((v, i) => assert.ok(Math.abs(v - pointer[i]) < 1e-12));
  }
});
test("incomplete or invalid active-field input never falls back to a locked endpoint", () => {
  for (const text of ["-", "+", ".", "oops", "1radx"]) {
    assert.equal(resolvePointInput(text, [0, 0], [3, 4], { length: 10, angle: 90 }, "angle"), null);
  }
  assert.equal(resolvePointInput("-1cm", [0, 0], [3, 4]), null);
  assert.equal(resolvePointInput("", [0, 0], [3, 4]), null);
  assert.equal(parsePointEntry("@", [0, 0], [3, 4], { length: 10, angle: 90 }), null);
  assert.equal(parsePointEntry("#10", [0, 0]), null);
});
test("explicit coordinates override field locks and scalar angle uses degrees/radians", () => {
  assert.deepEqual(resolvePointInput("#2cm,3cm", [50, 50], [80, 80], { length: 100, angle: 90 }, "angle"), [20, 30]);
  assert.deepEqual(resolvePointInput("@-2cm,3cm", [50, 50], undefined, { length: 100, angle: 90 }, "angle"), [30, 80]);
  const p = resolvePointInput(`${Math.PI / 2}rad`, [0, 0], [3, 4], { length: 10, angle: null }, "angle")!;
  assert.ok(Math.abs(p[0]) < 1e-12); assert.equal(p[1], 10);
});
test("coordinate addition and locked polar overflow are rejected", () => {
  const huge = "9".repeat(308);
  assert.equal(parsePointEntry(`@${huge},0`, [1e308, 0]), null);
  assert.equal(parsePointEntry("", [0, 0], [1, 1], { length: Infinity, angle: 0 }), null);
});
test("rectangle dimensions and explicit coordinates retain distinct preview/commit semantics", () => {
  assert.deepEqual(resolveDrawingPointInput("rectangle", "2cm,1in", [[10, 20]])?.point, [30, 45.4]);
  assert.deepEqual(resolveDrawingPointInput("rectangle", "#2cm,1in", [[10, 20]])?.point, [20, 25.4]);
  assert.equal(resolveDrawingPointInput("rectangle", "10,", [[0, 0]]), null);
  assert.equal(resolveDrawingPointInput("rectangle", "10x0", [[0, 0]]), null);
});
test("arc radius/sweep uses the centre, rejects invalid radius, and previews the changed radius", () => {
  const draft = resolveDrawingPointInput("arc", "2cm<90deg", [[10, 20], [20, 20]])!;
  assert.deepEqual(draft.arc, { radius: 20, startAngle: 0, endAngle: Math.PI / 2 });
  assert.ok(Math.abs(draft.point[0] - 10) < 1e-12); assert.equal(draft.point[1], 40);
  assert.equal(resolveDrawingPointInput("arc", "oops<90deg", [[10, 20], [20, 20]]), null);
  assert.equal(resolveDrawingPointInput("arc", "10<90<10", [[10, 20], [20, 20]]), null);
});
