import { CAD_PRECISION, linearToleranceAt, type AngularDimensionLine, type AngularDimensionBranch } from "@agent-webcad/cad-document";
export type { AngularDimensionLine, AngularDimensionBranch } from "@agent-webcad/cad-document";
import { dimensionArrowhead } from "./dimensionSymbols";
import { planeToWorld, worldToPlane, WORK_PLANES, type Vec3, type WorkPlaneId } from "./workPlane";

type Vec2 = [number, number];
/** Rays follow each source's ordered start→end direction. Reversing an edge
 * requires reversing its ray sign when remapping a saved reference. */
export type AngularDimensionError = {
  ok: false;
  code: "unsupported-edge" | "invalid-plane" | "non-finite" | "degenerate-line" | "different-plane"
    | "invalid-branch" | "parallel-lines" | "coincident-lines" | "precision-loss" | "invalid-placement";
  target: "first" | "second" | "both" | "branch" | "placement";
  reason: string;
};
export type AngularDimensionMeasurement = {
  workPlane: WorkPlaneId;
  elevation: number;
  vertex: Vec3;
  firstDirection: Vec3;
  secondDirection: Vec3;
  branch: AngularDimensionBranch;
  /** Positive measurement in radians; the sweep retains the chosen direction. */
  angleRadians: number;
  startAngle: number;
  sweepRadians: number;
  /** Whether the supporting-line vertex lies outside the finite source span. */
  extensions: { first: boolean; second: boolean };
};
export type AngularDimensionResult = { ok: true; measurement: AngularDimensionMeasurement } | AngularDimensionError;
const TAU = 2 * Math.PI;
const cross = (a: Vec2, b: Vec2) => a[0] * b[1] - a[1] * b[0];
const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1];
const subtract = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const point = (v: Vec3) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
const failure = (code: AngularDimensionError["code"], target: AngularDimensionError["target"], reason: string): AngularDimensionError => ({ ok: false, code, target, reason });

/** Analytic supporting-line measurement; never derives an angle from samples
 * or silently chooses the smaller angle. No document, topology or UI mutation. */
export function measureAngularDimension(first: AngularDimensionLine, second: AngularDimensionLine, branch: AngularDimensionBranch): AngularDimensionResult {
  if (!branch || ![1, -1].includes(branch.firstRay) || ![1, -1].includes(branch.secondRay) || !["ccw", "cw"].includes(branch.sweep))
    return failure("invalid-branch", "branch", "Choose a ray on each line and a clockwise or counterclockwise measurement.");
  for (const [line, target] of [[first, "first"], [second, "second"]] as const) {
    if (line.kind !== "line") return failure("unsupported-edge", target, "Choose a straight line or a straight edge. Curved edges cannot be measured as chords.");
    if (!["XY", "XZ", "YZ"].includes(line.workPlane)) return failure("invalid-plane", target, "Choose a line on a supported XY, XZ or YZ work plane.");
    if (!point(line.start) || !point(line.end)) return failure("non-finite", target, "Repair the line's invalid coordinates before measuring its angle.");
  }
  if (first.workPlane !== second.workPlane) return failure("different-plane", "both", "Choose two lines on the same work plane.");
  const frame = WORK_PLANES[first.workPlane];
  const points = [first.start, first.end, second.start, second.end];
  const tolerance = linearToleranceAt(...points.flat());
  const elevations = points.map(p => p.reduce((sum, v, i) => sum + v * frame.normal[i], 0));
  const elevation = elevations[0];
  if (elevations.some(h => Math.abs(h - elevation) > tolerance)) return failure("different-plane", "both", "The lines are not coplanar. Choose two lines at the same work-plane elevation.");
  const [a, b, c, d] = points.map(p => worldToPlane(p, frame));
  const ab = subtract(b, a), cd = subtract(d, c);
  const length1 = Math.hypot(...ab), length2 = Math.hypot(...cd);
  if (!Number.isFinite(length1) || !Number.isFinite(length2)) return failure("precision-loss", "both", "The coordinate range is too large. Move the geometry closer to the origin before measuring.");
  if (length1 <= tolerance || length2 <= tolerance) return failure("degenerate-line", length1 <= tolerance ? "first" : "second", "Choose two lines longer than the coordinate precision tolerance.");
  const u: Vec2 = [ab[0] / length1, ab[1] / length1], v: Vec2 = [cd[0] / length2, cd[1] / length2];
  const determinant = cross(u, v), delta = subtract(c, a);
  if (Math.abs(determinant) <= Math.sin(CAD_PRECISION.angularTolerance)) {
    const coincident = Math.max(Math.abs(cross(delta, u)), Math.abs(cross(subtract(d, a), u))) <= tolerance;
    return failure(coincident ? "coincident-lines" : "parallel-lines", "both", coincident
      ? "Coincident lines have no unique angle vertex. Choose two intersecting lines."
      : "Parallel or nearly parallel lines have no unique angle vertex at this tolerance. Use a linear dimension or choose intersecting lines.");
  }
  const t = cross(delta, v) / determinant, s = cross(delta, u) / determinant;
  const center: Vec2 = [a[0] + t * u[0], a[1] + t * u[1]];
  if (![...center, t, s].every(Number.isFinite)) return failure("precision-loss", "both", "The line intersection is outside the representable coordinate range.");
  const centerTolerance = linearToleranceAt(...points.flat(), ...center);
  if (Math.max(Math.abs(cross(subtract(center, a), u)), Math.abs(cross(subtract(center, c), v))) > centerTolerance)
    return failure("precision-loss", "both", "The intersection is numerically unstable. Choose lines with a clearer intersection.");
  const ray1: Vec2 = [u[0] * branch.firstRay, u[1] * branch.firstRay];
  const ray2: Vec2 = [v[0] * branch.secondRay, v[1] * branch.secondRay];
  const directed = Math.atan2(cross(ray1, ray2), dot(ray1, ray2));
  const sign = branch.sweep === "ccw" ? 1 : -1;
  const angleRadians = directed * sign > 0 ? directed * sign : TAU + directed * sign;
  const world = (p: Vec2): Vec3 => planeToWorld(p, frame).map((value, i) => value + frame.normal[i] * elevation) as Vec3;
  const direction = (p: Vec2): Vec3 => frame.xAxis.map((value, i) => value * p[0] + frame.yAxis[i] * p[1]) as Vec3;
  return { ok: true, measurement: {
    workPlane: first.workPlane, elevation, vertex: world(center), firstDirection: direction(ray1), secondDirection: direction(ray2),
    branch: { ...branch }, angleRadians, startAngle: Math.atan2(ray1[1], ray1[0]), sweepRadians: sign * angleRadians,
    extensions: { first: t < -tolerance || t > length1 + tolerance, second: s < -tolerance || s > length2 + tolerance },
  } };
}

export type AngularDimensionPlacement = { radius: number; symbolScale?: number; text?: string };
export type AngularDimensionGeometry = {
  measurement: AngularDimensionMeasurement;
  /** Exact arc; sampled linework below is presentation only. */
  arc: { center: Vec3; radius: number; startAngle: number; sweepRadians: number };
  arcPoints: Vec3[];
  segments: [Vec3, Vec3][];
  text: string;
  textPosition: Vec3;
};

/** Output is intentionally separate from length-valued DimensionRender until
 * the typed angular command/reference/serialization slice is implemented. */
export function resolveAngularDimension(first: AngularDimensionLine, second: AngularDimensionLine, branch: AngularDimensionBranch, placement: AngularDimensionPlacement): { ok: true; geometry: AngularDimensionGeometry } | AngularDimensionError {
  const result = measureAngularDimension(first, second, branch);
  if (!result.ok) return result;
  const m = result.measurement, { radius, symbolScale = 1, text } = placement;
  if (!Number.isFinite(radius) || radius <= 0 || !Number.isFinite(symbolScale) || symbolScale <= 0 || text !== undefined && typeof text !== "string")
    return failure("invalid-placement", "placement", "Enter a positive finite dimension radius and symbol scale.");
  if (radius <= linearToleranceAt(...m.vertex, radius)) return failure("invalid-placement", "placement", "Increase the dimension radius beyond the coordinate precision tolerance.");
  const frame = WORK_PLANES[m.workPlane], center = worldToPlane(m.vertex, frame);
  const world = (p: Vec2): Vec3 => planeToWorld(p, frame).map((value, i) => value + frame.normal[i] * m.elevation) as Vec3;
  const at = (angle: number, distance = radius): Vec2 => [center[0] + distance * Math.cos(angle), center[1] + distance * Math.sin(angle)];
  const count = Math.ceil(m.angleRadians / (Math.PI / 90));
  const arc2 = Array.from({ length: count + 1 }, (_, i) => at(m.startAngle + m.sweepRadians * i / count));
  const segments2: [Vec2, Vec2][] = arc2.slice(1).map((p, i) => [arc2[i], p]);
  // Keep arrows legible without letting them overlap across a narrow sector.
  const scale = Math.min(symbolScale, radius / 6);
  const arrowScale = Math.min(scale, radius * m.angleRadians / 12);
  const endAngle = m.startAngle + m.sweepRadians, sign = Math.sign(m.sweepRadians);
  const tangent = (angle: number, orientation: number): Vec2 => [-Math.sin(angle) * orientation, Math.cos(angle) * orientation];
  segments2.push(...dimensionArrowhead(arc2[0], tangent(m.startAngle, -sign), arrowScale), ...dimensionArrowhead(arc2[count], tangent(endAngle, sign), arrowScale));
  for (const [line, angle] of [[first, m.startAngle], [second, endAngle]] as const) {
    const ray: Vec2 = [Math.cos(angle), Math.sin(angle)];
    const distances = [line.start, line.end].map(p => dot(subtract(worldToPlane(p, frame), center), ray));
    const low = Math.min(...distances), high = Math.max(...distances);
    if (radius >= low && radius <= high) continue;
    const anchor = radius < low ? low : high;
    segments2.push([at(angle, anchor), at(angle, radius + Math.sign(radius - anchor) * 2 * scale)]);
  }
  const segments = segments2.map(([a, b]): [Vec3, Vec3] => [world(a), world(b)]);
  const textPosition = world(at(m.startAngle + m.sweepRadians / 2, radius + 2.5 * scale));
  if (![...segments.flat(2), ...textPosition].every(Number.isFinite)) return failure("precision-loss", "placement", "Reduce the dimension radius or move the geometry closer to the origin.");
  return { ok: true, geometry: {
    measurement: m, arc: { center: [...m.vertex], radius, startAngle: m.startAngle, sweepRadians: m.sweepRadians },
    arcPoints: arc2.map(world), segments, text: text?.trim() ? text : `${(m.angleRadians * 180 / Math.PI).toFixed(2)}°`, textPosition,
  } };
}
