import type { SketchGeometry, SketchPoint } from "@agent-webcad/cad-document";
import { sketchPoint, SKETCH_TOLERANCE } from "./sketchSolver";

export { sketchConstraintGeometryIds as constraintGeometryIds } from "@agent-webcad/cad-document";

export function geometryPointIds(geometry: SketchGeometry): string[] {
  switch (geometry.kind) {
    case "line": return [geometry.startId, geometry.endId];
    case "polyline": return geometry.vertices.map((vertex) => vertex.id);
    case "rectangle": return geometry.cornerIds;
    case "circle": return [geometry.centerId, `${geometry.id}:radius:0`];
    case "arc": return [geometry.centerId, geometry.startId, geometry.endId];
  }
}

export function transformSketchGeometry(geometry: SketchGeometry, translation: SketchPoint, center: SketchPoint, angle: number, scale: number): SketchGeometry {
  const c = Math.cos(angle), s = Math.sin(angle);
  const point = ([x, y]: SketchPoint): SketchPoint => [center[0] + translation[0] + scale * ((x - center[0]) * c - (y - center[1]) * s), center[1] + translation[1] + scale * ((x - center[0]) * s + (y - center[1]) * c)];
  switch (geometry.kind) {
    case "line": return { ...geometry, start: point(geometry.start), end: point(geometry.end) };
    case "polyline": return { ...geometry, vertices: geometry.vertices.map((vertex) => ({ ...vertex, point: point(vertex.point) })) };
    case "rectangle": return { ...geometry, origin: point(geometry.origin), width: geometry.width * scale, height: geometry.height * scale, angle: (geometry.angle ?? 0) + angle };
    case "circle": return { ...geometry, center: point(geometry.center), radius: geometry.radius * scale };
    case "arc": return { ...geometry, center: point(geometry.center), radius: geometry.radius * scale, startAngle: geometry.startAngle + angle, endAngle: geometry.endAngle + angle };
  }
}

/** The opposite corner stays anchored; a rectangle never becomes a skew quadrilateral. */
export function resizeRectangleCorner(geometry: Extract<SketchGeometry, { kind: "rectangle" }>, pointId: string, position: SketchPoint): SketchGeometry | null {
  const corner = geometry.cornerIds.indexOf(pointId);
  if (corner < 0) return null;
  const anchor = sketchPoint(geometry, geometry.cornerIds[(corner + 2) % 4])!;
  const c = Math.cos(geometry.angle ?? 0), s = Math.sin(geometry.angle ?? 0);
  const dx = position[0] - anchor[0], dy = position[1] - anchor[1];
  const u = dx * c + dy * s, v = -dx * s + dy * c;
  const width = u * (corner === 1 || corner === 2 ? 1 : -1);
  const height = v * (corner >= 2 ? 1 : -1);
  if (width <= SKETCH_TOLERANCE || height <= SKETCH_TOLERANCE) return null;
  const a = (corner + 2) % 4, au = a === 1 || a === 2 ? width : 0, av = a >= 2 ? height : 0;
  return { ...geometry, width, height, origin: [anchor[0] - au * c + av * s, anchor[1] - au * s - av * c] };
}

/** Dragging an edge changes only its perpendicular extent and anchors its opposite edge. */
export function resizeRectangleEdge(geometry: Extract<SketchGeometry, { kind: "rectangle" }>, segmentId: string, delta: SketchPoint): SketchGeometry | null {
  const edge = geometry.edgeIds.indexOf(segmentId);
  if (edge < 0) return null;
  const c = Math.cos(geometry.angle ?? 0), s = Math.sin(geometry.angle ?? 0);
  const u = delta[0] * c + delta[1] * s, v = -delta[0] * s + delta[1] * c;
  const corner = sketchPoint(geometry, geometry.cornerIds[edge])!;
  const movement: SketchPoint = edge % 2 === 0 ? [-v * s, v * c] : [u * c, u * s];
  return resizeRectangleCorner(geometry, geometry.cornerIds[edge], [corner[0] + movement[0], corner[1] + movement[1]]);
}
