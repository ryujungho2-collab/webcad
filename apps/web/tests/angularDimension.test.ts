import assert from "node:assert/strict";
import { test } from "node:test";
import { CAD_PRECISION } from "@agent-webcad/cad-document";
import { measureAngularDimension, resolveAngularDimension, type AngularDimensionLine, type AngularDimensionBranch } from "../src/precision/angularDimension";
import { planeToWorld, WORK_PLANES, type Vec3, type WorkPlaneId } from "../src/precision/workPlane";

const branch: AngularDimensionBranch = { firstRay: 1, secondRay: 1, sweep: "ccw" };
const near = (a: number, b: number, tolerance = 1e-10) => assert.ok(Math.abs(a - b) <= tolerance, `${a} should equal ${b} within ${tolerance}`);
const vectorNear = (a: Vec3, b: Vec3, tolerance = 1e-10) => a.forEach((v, i) => near(v, b[i], tolerance));
function line(start: [number, number], end: [number, number], workPlane: WorkPlaneId = "XY", elevation = 0): AngularDimensionLine {
  const frame = WORK_PLANES[workPlane];
  const world = (p: [number, number]): Vec3 => planeToWorld(p, frame).map((v, i) => v + elevation * frame.normal[i]) as Vec3;
  return { kind: "line", start: world(start), end: world(end), workPlane };
}
const horizontal = line([0, 0], [10, 0]);
const vertical = line([0, 0], [0, 10]);
function measured(first = horizontal, second = vertical, choice = branch) {
  const result = measureAngularDimension(first, second, choice);
  assert.ok(result.ok, result.ok ? "" : result.reason);
  return result.measurement;
}
function rendered(first = horizontal, second = vertical, choice = branch, radius = 5) {
  const result = resolveAngularDimension(first, second, choice, { radius });
  assert.ok(result.ok, result.ok ? "" : result.reason);
  return result.geometry;
}

test("Every ray/sweep choice measures its explicit acute, obtuse or reflex sector", () => {
  const diagonal = line([0, 0], [Math.sqrt(3) * 10, 10]);
  const cases: [1 | -1, 1 | -1, "ccw" | "cw", number][] = [
    [1, 1, "ccw", 30], [1, 1, "cw", 330], [1, -1, "ccw", 210], [1, -1, "cw", 150],
    [-1, 1, "ccw", 210], [-1, 1, "cw", 150], [-1, -1, "ccw", 30], [-1, -1, "cw", 330],
  ];
  for (const [firstRay, secondRay, sweep, degrees] of cases) {
    const m = measured(horizontal, diagonal, { firstRay, secondRay, sweep });
    near(m.angleRadians, degrees * Math.PI / 180);
    near(m.sweepRadians, m.angleRadians * (sweep === "ccw" ? 1 : -1));
    near(Math.hypot(...m.firstDirection), 1); near(Math.hypot(...m.secondDirection), 1);
  }
});

test("Supporting-line intersections outside both segments preserve plane elevation and extension intent", () => {
  for (const plane of ["XY", "XZ", "YZ"] as const) {
    const first = line([10, 0], [20, 0], plane, 33), second = line([0, 10], [0, 20], plane, 33);
    const m = measured(first, second);
    vectorNear(m.vertex, WORK_PLANES[plane].normal.map(n => n * 33) as Vec3);
    assert.deepEqual(m.extensions, { first: true, second: true });
    near(m.angleRadians, Math.PI / 2);
    const geometry = rendered(first, second);
    const expected: Record<WorkPlaneId, [Vec3, Vec3]> = { XY: [[5, 0, 33], [0, 5, 33]], XZ: [[5, -33, 0], [0, -33, 5]], YZ: [[33, 5, 0], [33, 0, 5]] };
    vectorNear(geometry.arcPoints[0], expected[plane][0]); vectorNear(geometry.arcPoints.at(-1)!, expected[plane][1]);
    for (const p of [...geometry.arcPoints, geometry.textPosition, ...geometry.segments.flat()])
      near(p.reduce((sum, value, i) => sum + value * WORK_PLANES[plane].normal[i], 0), 33);
  }
  const geometry = rendered(line([10, 0], [20, 0]), line([0, 10], [0, 20]));
  const extensions = geometry.segments.slice(-2);
  vectorNear(extensions[0][0], [10, 0, 0]);
  assert.ok(extensions[0][1][0] < 5, "The extension must pass the radius-5 arrow, even when the source begins at 10.");
  assert.deepEqual(measured().extensions, { first: false, second: false });
});

test("Changing endpoint order with the corresponding ray sign preserves the same measured region", () => {
  const other = line([2, 4], [8, 12]);
  const before = rendered(horizontal, other);
  const reversed = { ...other, start: other.end, end: other.start };
  const after = rendered(horizontal, reversed, { ...branch, secondRay: -1 });
  vectorNear(after.measurement.vertex, before.measurement.vertex);
  near(after.measurement.angleRadians, before.measurement.angleRadians);
  vectorNear(after.textPosition, before.textPosition);
  for (let i = 0; i < before.arcPoints.length; i++) vectorNear(after.arcPoints[i], before.arcPoints[i]);
  near(measured(horizontal, reversed).angleRadians, before.measurement.angleRadians + Math.PI);
});

test("Rotation across the atan2 cut and reflection keep branch semantics", () => {
  const first = line([0, 0], [Math.cos(170 * Math.PI / 180), Math.sin(170 * Math.PI / 180)]);
  const second = line([0, 0], [Math.cos(-160 * Math.PI / 180), Math.sin(-160 * Math.PI / 180)]);
  near(measured(first, second).angleRadians, Math.PI / 6);
  const reflect = (edge: AngularDimensionLine): AngularDimensionLine => ({ ...edge, start: [edge.start[0], -edge.start[1], 0], end: [edge.end[0], -edge.end[1], 0] });
  near(measured(reflect(first), reflect(second), { ...branch, sweep: "cw" }).angleRadians, Math.PI / 6);
  near(measured(reflect(first), reflect(second)).angleRadians, 11 * Math.PI / 6);
});

test("Analytic measurement remains accurate under a large translation and segment scaling", () => {
  const base = 1e9;
  const m = measured(line([base + 10, base], [base + 20, base]), line([base + 3, base + 4], [base + 30, base + 40]));
  vectorNear(m.vertex, [base, base, 0], 1e-5);
  near(m.angleRadians, Math.atan2(4, 3));
  near(measured(horizontal, line([3, 4], [300, 400])).angleRadians, m.angleRadians);
});

test("Parallel, coincident and 0/180-degree cases report no unique vertex without inventing one", () => {
  for (const [second, code] of [
    [line([0, 1], [10, 1]), "parallel-lines"], [line([20, 0], [30, 0]), "coincident-lines"],
    [line([0, 0], [-10, 0]), "coincident-lines"],
    [line([0, 1], [10, 1 + CAD_PRECISION.angularTolerance * 5]), "parallel-lines"],
  ] as const) {
    const result = measureAngularDimension(horizontal, second, branch);
    assert.ok(!result.ok); assert.equal(result.code, code); assert.match(result.reason, /vertex/);
  }
  const m = measured(horizontal, line([0, 1], [10, 1.00001]));
  near(m.angleRadians, Math.atan(1e-6), 1e-12);
  near(m.vertex[0], -1e6, 0.001);
});

test("Invalid and curved edges reject explicitly instead of flattening or falling back to another plane", () => {
  for (const [first, second, code] of [
    [{ ...horizontal, kind: "arc" }, vertical, "unsupported-edge"],
    [{ ...horizontal, kind: "polyline" }, vertical, "unsupported-edge"],
    [{ ...horizontal, workPlane: "UV" }, vertical, "invalid-plane"],
    [horizontal, line([0, 0], [0, 10], "XZ"), "different-plane"],
    [horizontal, line([0, 0], [0, 10], "XY", 0.01), "different-plane"],
    [horizontal, { ...vertical, end: [0, 10, 1] }, "different-plane"],
    [{ ...horizontal, start: [NaN, 0, 0] }, vertical, "non-finite"],
    [{ ...horizontal, end: [Infinity, 0, 0] }, vertical, "non-finite"],
    [line([0, 0], [0, 0]), vertical, "degenerate-line"],
    [line([0, 0], [5e-7, 0]), vertical, "degenerate-line"],
    [line([-1e308, 0], [1e308, 0]), vertical, "precision-loss"],
    [line([1e15, 0], [1e15 + 1, 0]), vertical, "degenerate-line"],
  ] as const) {
    const result = measureAngularDimension(first as AngularDimensionLine, second as AngularDimensionLine, branch);
    assert.ok(!result.ok); assert.equal(result.code, code);
  }
  for (const invalid of [{ ...branch, firstRay: 0 }, { ...branch, sweep: "minor" }]) {
    const result = measureAngularDimension(horizontal, vertical, invalid as AngularDimensionBranch);
    assert.ok(!result.ok); assert.equal(result.code, "invalid-branch");
  }
});

test("Display arc, tangent arrows and label use the same analytic radians, including a reflex sector", () => {
  for (const sweep of ["ccw", "cw"] as const) {
    const geometry = rendered(horizontal, vertical, { ...branch, sweep });
    const m = geometry.measurement;
    assert.equal(geometry.text, sweep === "ccw" ? "90.00°" : "270.00°");
    near(geometry.arc.radius, 5); near(geometry.arc.sweepRadians, m.sweepRadians);
    vectorNear(geometry.arcPoints[0], [5, 0, 0]); vectorNear(geometry.arcPoints.at(-1)!, [0, 5, 0]);
    for (const p of geometry.arcPoints) near(Math.hypot(...p), 5);
    const arrows = geometry.segments.slice(geometry.arcPoints.length - 1, geometry.arcPoints.length + 3);
    for (const [tip, barb] of arrows.slice(0, 2)) { vectorNear(tip, [5, 0, 0]); assert.equal(Math.sign(barb[1]), sweep === "ccw" ? 1 : -1); }
    near(Math.hypot(...geometry.textPosition), 5 + 2.5 * 5 / 6);
    assert.equal(Math.sign(geometry.textPosition[0]), sweep === "ccw" ? 1 : -1);
    assert.equal(Math.sign(geometry.textPosition[1]), sweep === "ccw" ? 1 : -1);
  }
});

test("Placement and text never change the measured angle; narrow sectors keep finite bounded linework", () => {
  const first = line([0, 0], [10, 0]), second = line([0, 0], [10, 0.001]);
  const small = rendered(first, second, branch, 1), large = rendered(first, second, branch, 1000);
  near(small.measurement.angleRadians, large.measurement.angleRadians);
  assert.ok(small.arcPoints.length <= 181);
  const result = resolveAngularDimension(horizontal, vertical, branch, { radius: 7, text: "TYP" });
  assert.ok(result.ok); assert.equal(result.geometry.text, "TYP"); near(result.geometry.measurement.angleRadians, Math.PI / 2);
  for (const placement of [{ radius: 0 }, { radius: -5 }, { radius: Infinity }, { radius: NaN }, { radius: 1e-9 }, { radius: 5, symbolScale: 0 }, { radius: 5, symbolScale: Infinity }]) {
    const invalid = resolveAngularDimension(horizontal, vertical, branch, placement);
    assert.ok(!invalid.ok); assert.equal(invalid.code, "invalid-placement");
  }
  const overflow = resolveAngularDimension(line([1e308, 1e308], [1e308 + 1e295, 1e308]), line([1e308, 1e308], [1e308, 1e308 + 1e295]), branch, { radius: 1e308 });
  assert.ok(!overflow.ok); assert.equal(overflow.code, "precision-loss");
});

test("Frozen inputs remain unchanged and returned measurements do not alias caller-owned values", () => {
  const first = structuredClone(horizontal), second = structuredClone(vertical), choice = { ...branch };
  const before = JSON.stringify([first, second, choice]);
  for (const edge of [first, second]) { Object.freeze(edge.start); Object.freeze(edge.end); Object.freeze(edge); }
  Object.freeze(choice);
  const geometry = rendered(first, second, choice);
  geometry.measurement.vertex[0] = 100; geometry.measurement.branch.firstRay = -1;
  assert.equal(JSON.stringify([first, second, choice]), before);
  near(measured(first, second, choice).angleRadians, Math.PI / 2);
});
