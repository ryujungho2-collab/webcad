import type { CadDocument, Sketch, SketchGeometry, SketchPoint } from "@agent-webcad/cad-document";
import { getObjectTransform } from "../state/objectTransform";
import { WORK_PLANES, planeToWorld, worldToPlane, type Vec3 } from "./workPlane";
import { SKETCH_TOLERANCE, solveSketch } from "./sketchSolver";
import type { DrawingTopology } from "./drawingTopology";

/** The sole projection boundary for parametric sketch-local points. */
export function sketchPointToWorld(sketch: Sketch, point: SketchPoint): Vec3 {
  return planeToWorld(point, WORK_PLANES[sketch.workPlane]);
}

/** Converts a committed drawing-tool result into one sketch-owned entity. */
export function drawingToSketchGeometry(sketch: Sketch, kind: string, params: Record<string, unknown>, id: string): SketchGeometry | null {
  const plane = WORK_PLANES[sketch.workPlane];
  const project = (value: unknown): SketchPoint | null => {
    if (!Array.isArray(value) || value.length !== 3 || !value.every((part) => typeof part === "number" && Number.isFinite(part))) return null;
    const point = value as Vec3;
    const local = worldToPlane(point, plane);
    const back = planeToWorld(local, plane);
    return Math.hypot(...point.map((part, index) => part - back[index])) <= SKETCH_TOLERANCE ? local : null;
  };
  const pointId = (role: string, index: number) => `${id}:${role}:${index}`;
  if (kind === "line" || kind === "polyline" || kind === "rectangle") {
    if (!Array.isArray(params.points)) return null;
    const points = params.points.map(project);
    if (points.some((point) => !point)) return null;
    const local = points as SketchPoint[];
    if (kind === "line" && local.length === 2) return { id, kind, startId: pointId("vertex", 0), endId: pointId("vertex", 1), segmentId: pointId("segment", 0), start: local[0], end: local[1] };
    if (kind === "polyline" && local.length >= 2) return { id, kind, vertices: local.map((point, index) => ({ id: pointId("vertex", index), point })), segmentIds: Array.from({ length: local.length - (params.closed === true ? 0 : 1) }, (_, index) => pointId("segment", index)), closed: params.closed === true };
    if (kind === "rectangle" && local.length === 4) {
      const xs = local.map((point) => point[0]), ys = local.map((point) => point[1]);
      const x = Math.min(...xs), y = Math.min(...ys), width = Math.max(...xs) - x, height = Math.max(...ys) - y;
      if (width <= SKETCH_TOLERANCE || height <= SKETCH_TOLERANCE) return null;
      return { id, kind, origin: [x, y], width, height, cornerIds: [0, 1, 2, 3].map((index) => pointId("vertex", index)) as [string, string, string, string], edgeIds: [0, 1, 2, 3].map((index) => pointId("segment", index)) as [string, string, string, string] };
    }
    return null;
  }
  const center = project(params.center), radius = Number(params.radius);
  if (!center || !Number.isFinite(radius) || radius <= SKETCH_TOLERANCE) return null;
  if (kind === "circle") return { id, kind, centerId: pointId("center", 0), curveId: pointId("curve", 0), center, radius };
  if (kind === "arc" && Number.isFinite(params.startAngle) && Number.isFinite(params.endAngle) && Number(params.startAngle) !== Number(params.endAngle))
    return { id, kind, centerId: pointId("center", 0), startId: pointId("start", 0), endId: pointId("end", 0), curveId: pointId("curve", 0), center, radius, startAngle: Number(params.startAngle), endAngle: Number(params.endAngle) };
  return null;
}

/** Derived drawing cache. Stable topology IDs come from sketch geometry, never viewport indices. */
export function sketchGeometryToDrawingParams(sketch: Sketch, geometry: SketchGeometry): Record<string, unknown> {
  const world = (point: SketchPoint) => sketchPointToWorld(sketch, point);
  const topology: DrawingTopology = { version: 1, controls: [], segments: [], curves: [] };
  const params: Record<string, unknown> = { kind: geometry.kind, workPlane: sketch.workPlane, sketchId: sketch.id };
  if (geometry.kind === "line" || geometry.kind === "polyline" || geometry.kind === "rectangle") {
    const points: SketchPoint[] = geometry.kind === "line" ? [geometry.start, geometry.end] : geometry.kind === "polyline" ? geometry.vertices.map((vertex) => vertex.point) : [geometry.origin, [geometry.origin[0] + geometry.width, geometry.origin[1]], [geometry.origin[0] + geometry.width, geometry.origin[1] + geometry.height], [geometry.origin[0], geometry.origin[1] + geometry.height]];
    const ids = geometry.kind === "line" ? [geometry.startId, geometry.endId] : geometry.kind === "polyline" ? geometry.vertices.map((vertex) => vertex.id) : geometry.cornerIds;
    const segments = geometry.kind === "line" ? [geometry.segmentId] : geometry.kind === "polyline" ? geometry.segmentIds : geometry.edgeIds;
    params.points = points.map(world);
    if (geometry.kind === "polyline") params.closed = geometry.closed;
    topology.controls = ids.map((id, index) => ({ id, role: "vertex", index }));
    topology.segments = segments.map((id, index) => ({ id, index, startControlId: ids[index], endControlId: ids[(index + 1) % ids.length], kind: "line" }));
  } else {
    params.center = world(geometry.center); params.radius = geometry.radius;
    if (geometry.kind === "arc") { params.startAngle = geometry.startAngle; params.endAngle = geometry.endAngle; }
    topology.controls = geometry.kind === "circle" ? [{ id: geometry.centerId, role: "center" }, { id: `${geometry.id}:radius:0`, role: "radius" }] : [{ id: geometry.centerId, role: "center" }, { id: geometry.startId, role: "start" }, { id: geometry.endId, role: "end" }];
    topology.curves = [{ id: geometry.curveId, kind: geometry.kind }];
  }
  params.topology = topology;
  return params;
}

export type LegacySketchAdaptation =
  | { ok: true; sketch: Sketch }
  | { ok: false; reason: string };

/**
 * Read-only, lossless adaptation of an eligible legacy drawing selection.
 * The drawing remains authoritative until an explicit migration workflow is
 * designed; this function never creates a second persisted copy or mutates it.
 */
export function adaptLegacyDrawingsToSketch(document: CadDocument, objectIds: readonly string[], sketchId: string): LegacySketchAdaptation {
  if (!objectIds.length || !sketchId) return { ok: false, reason: "Select drawing entities and provide a sketch ID." };
  const geometry: SketchGeometry[] = [];
  let workPlane: Sketch["workPlane"] | undefined;
  let layerId: string | undefined;
  for (const objectId of objectIds) {
    const object = document.objects[objectId];
    const feature = Object.values(document.features).find((entry) => entry.output === objectId);
    if (!object || !feature || feature.type !== "drawing") return { ok: false, reason: `${objectId} is not a drawing.` };
    const plane = feature.params.workPlane === "XZ" || feature.params.workPlane === "YZ" ? feature.params.workPlane : "XY";
    if (workPlane && workPlane !== plane) return { ok: false, reason: "Drawings use different work planes." };
    if (layerId && layerId !== object.layerId) return { ok: false, reason: "Drawings use different layers." };
    const transform = getObjectTransform(object, feature);
    if ([...transform.translation, ...transform.rotation].some((value) => Math.abs(value) > SKETCH_TOLERANCE) ||
      transform.scale.some((value) => Math.abs(value - 1) > SKETCH_TOLERANCE)) {
      return { ok: false, reason: "Transformed drawings require baking before sketch adaptation." };
    }
    workPlane = plane;
    layerId = object.layerId;
    const planeDefinition = WORK_PLANES[plane];
    const project = (point: unknown): SketchPoint | null => {
      if (!Array.isArray(point) || point.length !== 3 || !point.every((value) => typeof value === "number" && Number.isFinite(value))) return null;
      const world = point as Vec3;
      const local = worldToPlane(world, planeDefinition);
      const projected = planeToWorld(local, planeDefinition);
      return Math.hypot(world[0] - projected[0], world[1] - projected[1], world[2] - projected[2]) <= SKETCH_TOLERANCE ? local : null;
    };
    const topology = feature.params.topology as { controls?: { id: string }[]; segments?: { id: string }[]; curves?: { id: string }[] } | undefined;
    const params = feature.params;
    const kind = String(params.kind);
    if (kind === "line" || kind === "polyline" || kind === "rectangle") {
      if (!Array.isArray(params.points) || (Array.isArray(params.bulges) && params.bulges.some((value) => Math.abs(Number(value)) > SKETCH_TOLERANCE))) return { ok: false, reason: "Curved or malformed polyline segments are not yet adaptable." };
      const points = params.points.map(project);
      if (points.some((point) => !point)) return { ok: false, reason: "Drawing is not on its declared work plane." };
      const local = points as SketchPoint[];
      const controlIds = local.map((_, index) => topology?.controls?.[index]?.id ?? `${objectId}:vertex:${index}`);
      const segmentIds = Array.from({ length: local.length - 1 + (kind === "rectangle" || params.closed === true ? 1 : 0) }, (_, index) => topology?.segments?.[index]?.id ?? `${objectId}:segment:${index}`);
      if (kind === "line" && local.length === 2) geometry.push({ id: objectId, kind: "line", startId: controlIds[0], endId: controlIds[1], segmentId: segmentIds[0], start: local[0], end: local[1] });
      else if (kind === "polyline") geometry.push({ id: objectId, kind: "polyline", vertices: local.map((point, index) => ({ id: controlIds[index], point })), segmentIds, closed: params.closed === true });
      else if (kind === "rectangle" && local.length === 4) {
        const width = local[1][0] - local[0][0];
        const height = local[3][1] - local[0][1];
        if (width <= SKETCH_TOLERANCE || height <= SKETCH_TOLERANCE ||
          Math.abs(local[1][1] - local[0][1]) > SKETCH_TOLERANCE ||
          Math.abs(local[2][0] - local[1][0]) > SKETCH_TOLERANCE ||
          Math.abs(local[2][1] - local[3][1]) > SKETCH_TOLERANCE ||
          Math.abs(local[3][0] - local[0][0]) > SKETCH_TOLERANCE) return { ok: false, reason: "Rectangle is not axis-aligned in sketch coordinates." };
        geometry.push({ id: objectId, kind: "rectangle", cornerIds: controlIds as [string, string, string, string], edgeIds: segmentIds as [string, string, string, string], origin: local[0], width, height });
      } else return { ok: false, reason: "Malformed drawing point count." };
    } else if (kind === "circle") {
      const center = project(params.center);
      const radius = Number(params.radius);
      if (!center || !Number.isFinite(radius) || radius <= SKETCH_TOLERANCE) return { ok: false, reason: "Invalid circle geometry." };
      geometry.push({ id: objectId, kind: "circle", centerId: topology?.controls?.[0]?.id ?? `${objectId}:center`, curveId: topology?.curves?.[0]?.id ?? `${objectId}:curve`, center, radius });
    } else return { ok: false, reason: `${kind} has no exact parametric sketch adapter yet.` };
  }
  const sketch: Sketch = { id: sketchId, workPlane: workPlane!, layerId: layerId!, geometry, constraints: [], dimensions: [],
    solveState: { status: "under-constrained", degreesOfFreedom: 0, rank: 0, residual: 0, tolerance: SKETCH_TOLERANCE } };
  const solved = solveSketch(sketch);
  return solved.ok ? { ok: true, sketch: solved.sketch } : { ok: false, reason: solved.reason };
}
