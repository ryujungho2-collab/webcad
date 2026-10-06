import type { Sketch, SketchConstraint, SketchPoint } from "@agent-webcad/cad-document";
import { constraintGeometryIds, geometryPointIds } from "./sketchEditing";
import { sketchPoint } from "./sketchSolver";
import { formatLength, parseAngle, parseLength } from "./units";
import { sketchSegment, sketchAngleEdge } from "./sketchRelations";

export type SketchAnnotation = {
  constraintId: string; dimensionId?: string; geometryIds: string[];
  name: string; text: string; points: SketchPoint[]; value?: number;
  kind: SketchConstraint["kind"];
};

export function sketchDimensionName(sketch: Sketch, constraint: SketchConstraint): string {
  if (constraint.kind === "distance" && constraint.first.geometryId === constraint.second.geometryId) {
    const entity = sketch.geometry.find((entry) => entry.id === constraint.first.geometryId);
    if (entity?.kind === "rectangle") {
      const a = entity.cornerIds.indexOf(constraint.first.pointId), b = entity.cornerIds.indexOf(constraint.second.pointId);
      if ([[0, 1], [2, 3]].some((pair) => pair.includes(a) && pair.includes(b) && a !== b)) return "Width";
      if ([[0, 3], [1, 2]].some((pair) => pair.includes(a) && pair.includes(b) && a !== b)) return "Height";
    }
  }
  const names: Partial<Record<SketchConstraint["kind"],string>> = { parallel:"Parallel", perpendicular:"Perpendicular", "equal-length":"Equal length", "equal-radius":"Equal radius", concentric:"Concentric", "tangent-line":"Tangent", "tangent-circles":constraint.kind === "tangent-circles" && constraint.contact === "internal" ? "Internal tangent" : "External tangent", "point-on-line":"Point on line", "point-on-circle":"Point on circle", symmetric:"Symmetric" };
  return names[constraint.kind] ?? (constraint.kind === "distance" ? "Distance" : constraint.kind === "radius" ? "Radius" : constraint.kind === "diameter" ? "Diameter" : constraint.kind === "angle" ? "Angle" : constraint.kind.replaceAll("-", " "));
}

export function parseSketchDimension(constraint: SketchConstraint, text: string): number | null {
  const parsed = constraint.kind === "angle" ? parseAngle(text) : parseLength(text);
  if (parsed === null) return null;
  const value = constraint.kind === "angle" ? parsed * Math.PI / 180 : parsed;
  return constraint.kind === "angle" ? Math.abs(value) <= Math.PI ? value : null : value > 1e-6 ? value : null;
}

/** Resolve persistent references from the current solved source, never drawing transforms. */
export function sketchAnnotations(sketch: Sketch): SketchAnnotation[] {
  const point = (ref: { geometryId: string; pointId: string }) => {
    const entity = sketch.geometry.find((entry) => entry.id === ref.geometryId);
    return entity ? sketchPoint(entity, ref.pointId) : null;
  };
  return sketch.constraints.flatMap((constraint): SketchAnnotation[] => {
    const dimension = sketch.dimensions.find((entry) => entry.constraintId === constraint.id);
    const geometryIds = [...new Set(constraintGeometryIds(constraint))];
    if (geometryIds.some((id) => !sketch.geometry.some((entry) => entry.id === id))) return [];
    let points: SketchPoint[] = [];
    let text = ({ coincident: "●", horizontal: "H", vertical: "V", "fixed-point": "⚓", parallel:"∥", perpendicular:"⊥", "equal-length":"=", "equal-radius":"R =", concentric:"◎", "tangent-line":"T", "tangent-circles":"T", "point-on-line":"●∈L", "point-on-circle":"●∈○", symmetric:"↔" } as Record<string, string>)[constraint.kind] ?? "";
    const value = "value" in constraint && typeof constraint.value === "number" ? constraint.value : undefined;
    if ("first" in constraint) {
      const a = point(constraint.first), b = point(constraint.second);
      if (!a || !b) return [];
      points = [a, b];
    } else if (constraint.kind === "fixed-point") {
      const p = point(constraint.point); if (!p) return []; points = [p];
    } else if (constraint.kind === "radius" || constraint.kind === "diameter") {
      const entity = sketch.geometry.find((entry) => entry.id === constraint.geometryId);
      if (!entity || !(entity.kind === "circle" || entity.kind === "arc")) return [];
      const angle = entity.kind === "arc" ? (entity.startAngle + entity.endAngle) / 2 : Math.PI / 4;
      const rim: SketchPoint = [entity.center[0] + entity.radius * Math.cos(angle), entity.center[1] + entity.radius * Math.sin(angle)];
      points = constraint.kind === "radius" ? [entity.center, rim] : [[2 * entity.center[0] - rim[0], 2 * entity.center[1] - rim[1]], rim];
    } else if (constraint.kind === "angle") {
      const a = sketchAngleEdge(sketch.geometry.find((entry) => entry.id === constraint.firstLineId), constraint.firstSegmentId), b = sketchAngleEdge(sketch.geometry.find((entry) => entry.id === constraint.secondLineId), constraint.secondSegmentId);
      if (!a || !b) return [];
      points = [...a, ...b];
    } else if ("firstSegment" in constraint) {
      const a = sketchSegment(sketch.geometry.find(g=>g.id===constraint.firstSegment.geometryId),constraint.firstSegment), b = sketchSegment(sketch.geometry.find(g=>g.id===constraint.secondSegment.geometryId),constraint.secondSegment);
      if(a&&b)points=[...a,...b];
    } else if ("firstCurveId" in constraint) {
      points = [constraint.firstCurveId,constraint.secondCurveId].flatMap(id=>{const g=sketch.geometry.find(g=>g.id===id);return g&&(g.kind==="circle"||g.kind==="arc")?[g.center]:[];});
    } else if (constraint.kind === "tangent-line") {
      const g=sketch.geometry.find(g=>g.id===constraint.curveId),line=sketchSegment(sketch.geometry.find(g=>g.id===constraint.line.geometryId),constraint.line);
      if(g?.kind==="circle"&&line)points=[g.center,...line];
    } else if (constraint.kind === "point-on-line" || constraint.kind === "point-on-circle") {
      const p=point(constraint.point);if(p)points=[p];
    }
    if (!points.length) return [];
    if (value !== undefined) text = constraint.kind === "angle" ? `${(value * 180 / Math.PI).toFixed(2)}°` : `${constraint.kind === "radius" ? "R " : constraint.kind === "diameter" ? "Ø " : ""}${formatLength(value)}`;
    return [{ constraintId: constraint.id, dimensionId: dimension?.id, geometryIds, name: sketchDimensionName(sketch, constraint), text, points, value, kind: constraint.kind }];
  });
}

export function sketchGeometryPath(sketch: Sketch, id: string): SketchPoint[] {
  const entity = sketch.geometry.find((entry) => entry.id === id);
  if (!entity) return [];
  return sketchEntityPath(entity);
}

/** Direct entity access avoids searching the same snapshot for every path. */
export function sketchEntityPath(entity: Sketch["geometry"][number]): SketchPoint[] {
  if (entity.kind === "circle" || entity.kind === "arc") {
    const start = entity.kind === "arc" ? entity.startAngle : 0, end = entity.kind === "arc" ? entity.endAngle : Math.PI * 2;
    return Array.from({ length: 65 }, (_, index) => {
      const angle = start + (end - start) * index / 64;
      return [entity.center[0] + entity.radius * Math.cos(angle), entity.center[1] + entity.radius * Math.sin(angle)];
    });
  }
  const points = geometryPointIds(entity).map((id) => sketchPoint(entity, id)!).filter(Boolean);
  return entity.kind === "rectangle" || entity.kind === "polyline" && entity.closed ? [...points, points[0]] : points;
}

type P = [number, number];
export type ScreenAnnotation = { annotation: SketchAnnotation; anchor: P; segments: [P, P][] };
/** Fixed pixel offsets keep labels and picking usable at drafting and mechanical scales. */
export function layoutSketchAnnotation(annotation: SketchAnnotation, project: (point: SketchPoint) => P | null, lane = 0): ScreenAnnotation | null {
  const points = annotation.points.map(project);
  if (points.some((point) => !point)) return null;
  const p = points as P[];
  const midpoint = (a: P, b: P): P => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  if (annotation.value === undefined) return { annotation, anchor: [p[0][0] + 18 + lane * 6, p[0][1] - 18 - lane * 16], segments: [] };
  if (annotation.kind === "angle") return { annotation, anchor: [midpoint(p[1], p[3])[0], midpoint(p[1], p[3])[1] - 28 - lane * 12], segments: [[p[0], p[1]], [p[2], p[3]]] };
  const [a, b] = p, length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (length < 0.1) return null;
  const normal: P = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length], offset = 32 + lane * 18;
  const shift = (point: P, distance: number): P => [point[0] + normal[0] * distance, point[1] + normal[1] * distance];
  const q = shift(a, offset), r = shift(b, offset);
  return { annotation, anchor: shift(midpoint(a, b), offset + 13), segments: [[a, shift(a, offset + 5)], [b, shift(b, offset + 5)], [q, r], [shift(q, -4), shift(q, 4)], [shift(r, -4), shift(r, 4)]] };
}
