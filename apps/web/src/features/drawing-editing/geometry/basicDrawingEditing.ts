import { linearToleranceAt } from "@agent-webcad/cad-document";
import type { CadFeature, CadObject } from "@agent-webcad/cad-document";
import type { CadCommand } from "@agent-webcad/cad-commands";
import { exactDrawingContour, contourLength, contourTolerance, locateOnContour, segmentPoint, type ContourSegment, type ExactContour } from "./contourEditing";
import { createDrawingTopology, type DrawingTopology } from "../../../precision/drawingTopology";
import { drawingWorldToModel, getWorldDrawingGeometry } from "../../../precision/worldGeometry";
import { profileSegments } from "../../../precision/profileGeometry";
import { WORK_PLANES, worldToPlane, type Vec3, type WorkPlaneId } from "../../../precision/workPlane";

const identity = { translation: [0, 0, 0] as Vec3, rotation: [0, 0, 0] as Vec3, scale: [1, 1, 1] as Vec3 };
const distance = (a: Vec3, b: Vec3) => Math.hypot(...a.map((v, i) => v - b[i]));
const size = (s: ContourSegment) => s.kind === "arc" ? s.radius! * Math.abs(s.sweep!) : distance(s.start, s.end);
const localContour = (object: CadObject, feature: CadFeature) => exactDrawingContour({ ...object, transform: identity }, feature);
const topology = (feature: CadFeature) => structuredClone((feature.params.topology ?? createDrawingTopology(String(feature.params.kind), feature.params, feature.output)) as DrawingTopology);

/** Rebuild indices/connectivity while retaining surviving control and segment IDs. */
function withTopology(params: Record<string, unknown>, controls: string[], segments: string[]): Record<string, unknown> {
  const rebuilt = createDrawingTopology(String(params.kind), params);
  rebuilt.controls.forEach((c, i) => { c.id = controls[i] ?? c.id; });
  rebuilt.segments.forEach((s, i) => { s.id = segments[i] ?? s.id; s.startControlId = rebuilt.controls[i].id; s.endControlId = rebuilt.controls[(i + 1) % rebuilt.controls.length].id; });
  return { ...params, topology: rebuilt };
}
function validated(object: CadObject, feature: CadFeature, params: Record<string, unknown>) {
  // Analytic validation catches collapsed edges and nonplanar edits without
  // relying on render samples. Live profile validation follows in the transaction.
  exactDrawingContour({ ...object, transform: identity }, { ...feature, params });
  return params;
}
function modelPoint(object: CadObject, feature: CadFeature, point: Vec3): Vec3 {
  const path = exactDrawingContour(object, feature), plane = WORK_PLANES[path.workPlane], origin = path.segments[0].start;
  if (Math.abs(point.reduce((sum, v, i) => sum + (v - origin[i]) * plane.normal[i], 0)) > contourTolerance([path])) throw new Error("Enter a point on the drawing's work plane and elevation.");
  const local = drawingWorldToModel(object, feature, point);
  if (!local || local.some(v => !Number.isFinite(v))) throw new Error("The drawing transform cannot be inverted.");
  return local;
}

export function editPolyline(object: CadObject, feature: CadFeature, command: Extract<CadCommand, { type: "edit-polyline" }>) {
  if (!["polyline", "rectangle"].includes(String(feature.params.kind))) throw new Error("Select a polyline or rectangle to edit its vertices.");
  const world = exactDrawingContour(object, feature);
  const local = localContour(object, feature), source = topology(feature), points = structuredClone(feature.params.points as Vec3[]), closed = local.closed;
  let bulges = local.segments.map(s => s.kind === "arc" ? Math.tan(s.sweep! / 4) : 0);
  const controls = source.controls.map(c => c.id), segments = source.segments.map(s => s.id);
  const params = { ...structuredClone(feature.params), kind: "polyline", points, closed, bulges };
  if (command.operation === "open") {
    if (!closed) throw new Error("The polyline is already open.");
    params.closed = false; bulges.pop(); segments.pop();
  } else if (command.operation === "close") {
    if (closed) throw new Error("The polyline is already closed.");
    if (distance(points[0], points.at(-1)!) <= contourTolerance([local])) throw new Error("The endpoints already coincide. Remove the duplicate endpoint before closing.");
    params.closed = true; bulges.push(0); segments.push(`segment-${crypto.randomUUID()}`);
  } else if (command.operation === "insert") {
    const index = source.segments.findIndex(s => s.id === command.segmentId);
    if (index < 0) throw new Error("The selected segment no longer exists.");
    let point = modelPoint(object, feature, command.point!);
    const segment = local.segments[index], tolerance = contourTolerance([local]);
    if (distance(point, segment.start) <= tolerance || distance(point, segment.end) <= tolerance) throw new Error("Choose a new vertex distinct from both segment endpoints.");
    let first = 0, second = 0;
    if (segment.kind === "arc") {
      const hit = locateOnContour({ ...world, closed: false, segments: [world.segments[index]] }, command.point!);
      if (hit.distance > contourTolerance([world])) throw new Error("An inserted arc vertex must lie on the exact arc; its radius and curvature are preserved.");
      point = segmentPoint(segment, hit.parameter, local.workPlane);
      first = Math.tan(segment.sweep! * hit.parameter / 4); second = Math.tan(segment.sweep! * (1 - hit.parameter) / 4);
    }
    points.splice(index + 1, 0, point); controls.splice(index + 1, 0, `vertex-${crypto.randomUUID()}`);
    bulges.splice(index, 1, first, second); segments.splice(index + 1, 0, `segment-${crypto.randomUUID()}`);
  } else {
    const index = source.controls.findIndex(c => c.id === command.controlId);
    if (index < 0) throw new Error("The selected vertex no longer exists.");
    if (points.length <= 2) throw new Error("Deleting this vertex would leave too few points. Open or delete the polyline instead.");
    if (!closed && (index === 0 || index === points.length - 1)) {
      bulges.splice(index === 0 ? 0 : index - 1, 1); segments.splice(index === 0 ? 0 : index - 1, 1);
    } else {
      const previous = (index - 1 + points.length) % points.length, a = local.segments[previous], b = local.segments[index];
      let merged = 0;
      if (a.kind === "arc" || b.kind === "arc") {
        const tol = contourTolerance([local]);
        if (a.kind !== "arc" || b.kind !== "arc" || distance(a.center!, b.center!) > tol || Math.abs(a.radius! - b.radius!) > tol || Math.sign(a.sweep!) !== Math.sign(b.sweep!) || Math.abs(a.sweep! + b.sweep!) >= 2 * Math.PI - 1e-8) throw new Error("This vertex joins different curves. Delete supports straight segments or arcs on the same circle; use Break for other curve changes.");
        merged = Math.tan((a.sweep! + b.sweep!) / 4);
      }
      bulges[previous] = merged; bulges.splice(index, 1); segments.splice(index, 1);
    }
    points.splice(index, 1); controls.splice(index, 1);
  }
  params.bulges = bulges;
  return validated(object, feature, withTopology(params, controls, segments));
}

/** Length is measured in world millimetres. A terminal analytic segment is
 * extended without changing its angle/radius; shortening can pass vertices. */
export function lengthenDrawing(object: CadObject, feature: CadFeature, command: Extract<CadCommand, { type: "lengthen-drawing" }>) {
  const world = exactDrawingContour(object, feature), local = localContour(object, feature);
  if (world.closed || !["line", "arc", "polyline"].includes(String(feature.params.kind))) throw new Error("Lengthen requires an open line, arc or polyline.");
  const total = contourLength(world), desired = command.mode === "delta" ? total + command.value : command.mode === "percent" ? total * command.value / 100 : command.value;
  const tolerance = contourTolerance([world]);
  if (!Number.isFinite(desired) || desired <= tolerance) throw new Error("The resulting total length must be positive and exceed the model tolerance.");
  if (Math.abs(total - desired) <= tolerance) throw new Error("The requested length is unchanged.");
  if (feature.params.kind === "arc" && desired / world.segments[0].radius! >= Math.PI * 2 - 1e-8) throw new Error("Lengthen would wrap an arc through a full circle. Use a circle or multiple arc segments instead.");
  const fromStart = command.endpoint === "start", source = topology(feature);
  let keep = world.segments.length - 1, remainder = desired;
  if (desired < total) {
    for (let i = 0; i < world.segments.length; i++) {
      const j = fromStart ? world.segments.length - 1 - i : i, length = size(world.segments[j]);
      if (remainder <= length + tolerance) { keep = j; break; }
      remainder -= length;
    }
  } else { keep = fromStart ? 0 : local.segments.length - 1; remainder = size(world.segments[keep]) + desired - total; }
  const segment = local.segments[keep], fraction = remainder / size(world.segments[keep]);
  if (segment.kind === "arc" && Math.abs(segment.sweep! * fraction) >= Math.PI * 2 - 1e-8) throw new Error("Lengthen would wrap an arc through a full circle. Use a circle or multiple arc segments instead.");
  const point = segmentPoint(segment, fromStart ? 1 - fraction : fraction, local.workPlane);
  const params = structuredClone(feature.params);
  if (params.kind === "arc") {
    if (fromStart) params.startAngle = segment.startAngle! + segment.sweep! * (1 - fraction);
    else params.endAngle = segment.startAngle! + segment.sweep! * fraction;
  } else {
    const original = feature.params.points as Vec3[], points = fromStart ? [point, ...structuredClone(original.slice(keep + 1))] : [...structuredClone(original.slice(0, keep + 1)), point];
    const kept = fromStart ? local.segments.slice(keep) : local.segments.slice(0, keep + 1), bulges = kept.map(s => s.kind === "arc" ? Math.tan(s.sweep! / 4) : 0);
    bulges[fromStart ? 0 : bulges.length - 1] = segment.kind === "arc" ? Math.tan(segment.sweep! * fraction / 4) : 0;
    // The edited endpoint keeps its identity even when shortening removes
    // intermediate vertices. All surviving interior references remain stable.
    const ids = fromStart ? [source.controls[0].id, ...source.controls.slice(keep + 1).map(c => c.id)] : [...source.controls.slice(0, keep + 1).map(c => c.id), source.controls.at(-1)!.id];
    return validated(object, feature, withTopology({ ...params, points, bulges }, ids, (fromStart ? source.segments.slice(keep) : source.segments.slice(0, keep + 1)).map(s => s.id)));
  }
  return validated(object, feature, params);
}

export type StretchRegion = { workPlane: WorkPlaneId; first: Vec3; second: Vec3 };
export function stretchContains(region: StretchRegion, point: Vec3) {
  const plane = WORK_PLANES[region.workPlane], a = worldToPlane(region.first, plane), b = worldToPlane(region.second, plane), p = worldToPlane(point, plane);
  const tol = linearToleranceAt(...region.first, ...region.second, ...point);
  const h = point.reduce((sum, v, i) => sum + (v - region.first[i]) * plane.normal[i], 0);
  return Math.abs(h) <= tol && p.every((v, i) => v >= Math.min(a[i], b[i]) - tol && v <= Math.max(a[i], b[i]) + tol);
}
export function stretchDrawingPoints(object: CadObject, feature: CadFeature, region: StretchRegion): Vec3[] {
  const world = getWorldDrawingGeometry(object, feature);
  if (!world || world.workPlane !== region.workPlane || !world.planeAligned) return [];
  const vertices = world.kind === "circle" ? [world.center!] : world.profileSegments ? world.profileSegments.map(s => s.start).concat(world.closed ? [] : [world.profileSegments.at(-1)!.end]) : [world.points![0], world.points!.at(-1)!];
  return vertices.filter(p => stretchContains(region, p));
}
export function stretchDrawing(object: CadObject, feature: CadFeature, region: StretchRegion, delta: Vec3): Record<string, unknown> | null {
  const world = getWorldDrawingGeometry(object, feature);
  if (!world || world.workPlane !== region.workPlane || !world.planeAligned) return null;
  const selected = stretchDrawingPoints(object, feature, region);
  if (!selected.length) return null;
  exactDrawingContour(object, feature);
  const origin = selected[0], localA = drawingWorldToModel(object, feature, origin)!, localB = drawingWorldToModel(object, feature, origin.map((v, i) => v + delta[i]) as Vec3)!;
  const move = (p: Vec3) => p.map((v, i) => v + localB[i] - localA[i]) as Vec3;
  const params = structuredClone(feature.params), local = localContour(object, feature);
  if (world.kind === "circle") params.center = move(params.center as Vec3);
  else if (world.kind === "arc") {
    const a = stretchContains(region, world.points![0]), b = stretchContains(region, world.points!.at(-1)!);
    if (a && b) params.center = move(params.center as Vec3);
    else {
      const s = local.segments[0], temporary = { kind: "polyline", workPlane: world.workPlane, points: [a ? move(s.start) : s.start, b ? move(s.end) : s.end], bulges: [Math.tan(s.sweep! / 4)] };
      const changed = profileSegments("polyline", temporary)[0];
      if (changed.kind !== "arc" || !changed.center || !changed.radius) throw new Error("Stretch would collapse the arc endpoints.");
      params.center = changed.center; params.radius = changed.radius; params.startAngle = changed.startAngle; params.endAngle = changed.startAngle! + changed.sweep!;
    }
  } else {
    const vertices = world.profileSegments!.map(s => s.start).concat(world.closed ? [] : [world.profileSegments!.at(-1)!.end]);
    params.points = (params.points as Vec3[]).map((p, i) => stretchContains(region, vertices[i]) ? move(p) : p);
    if (world.kind === "rectangle" && selected.length !== vertices.length) { params.kind = "polyline"; params.closed = true; }
  }
  return validated(object, feature, params);
}
