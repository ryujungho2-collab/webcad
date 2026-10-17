import type { SketchConstraint } from "./Sketch";

export const EXTENDED_SKETCH_RELATIONS = ["parallel", "perpendicular", "equal-length", "concentric", "equal-radius", "tangent-line", "tangent-circles", "point-on-line", "point-on-circle", "symmetric"] as const;
/** A newer reader is required because old tangent equations treated arcs as unsupported full circles. */
export const BOUNDED_ARC_RELATIONS = ["point-on-arc"] as const;

/** Shared by persistence, commands, diagnostics, connected motion and deletion. */
export function sketchConstraintGeometryIds(c: SketchConstraint): string[] {
  const ids = "firstSegment" in c ? [c.firstSegment.geometryId, c.secondSegment.geometryId]
    : "firstCurveId" in c ? [c.firstCurveId, c.secondCurveId]
    : "firstLineId" in c ? [c.firstLineId, c.secondLineId]
    : "geometryId" in c ? [c.geometryId]
    : c.kind === "tangent-line" ? [c.line.geometryId, c.curveId]
    : c.kind === "point-on-line" ? [c.point.geometryId, c.line.geometryId]
    : c.kind === "point-on-circle" || c.kind === "point-on-arc" ? [c.point.geometryId, c.curveId]
    : "point" in c ? [c.point.geometryId]
    : c.kind === "symmetric" ? [c.first.geometryId, c.second.geometryId, c.axis.geometryId]
    : [c.first.geometryId, c.second.geometryId];
  return [...new Set(ids)];
}

export function validSketchConstraint(value: unknown): value is SketchConstraint {
  const record = (v: unknown): v is Record<string, any> => typeof v === "object" && v !== null && !Array.isArray(v);
  const id = (v: unknown): v is string => typeof v === "string" && v.length > 0;
  const point = (v: unknown) => record(v) && id(v.geometryId) && id(v.pointId);
  const segment = (v: unknown) => record(v) && id(v.geometryId) && id(v.segmentId);
  const number = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  if (!record(value) || !id(value.id)) return false;
  const c = value;
  if(["segmentId","curveSegmentId","firstCurveSegmentId","secondCurveSegmentId"].some(key=>c[key]!==undefined&&!id(c[key])))return false;
  if (["parallel", "perpendicular", "equal-length"].includes(c.kind)) return segment(c.firstSegment) && segment(c.secondSegment) && (c.firstSegment.geometryId !== c.secondSegment.geometryId || c.firstSegment.segmentId !== c.secondSegment.segmentId);
  if (["concentric", "equal-radius", "tangent-circles"].includes(c.kind)) return id(c.firstCurveId) && id(c.secondCurveId) && (c.firstCurveId !== c.secondCurveId || c.firstCurveSegmentId!==c.secondCurveSegmentId) && (c.kind !== "tangent-circles" || ["external", "internal"].includes(c.contact));
  if (c.kind === "tangent-line") return segment(c.line) && id(c.curveId) && (c.line.geometryId !== c.curveId || c.curveSegmentId!==undefined&&c.line.segmentId!==c.curveSegmentId) && [1, -1].includes(c.side);
  if (c.kind === "point-on-line") return point(c.point) && segment(c.line);
  if (c.kind === "point-on-circle") return point(c.point) && id(c.curveId);
  if (c.kind === "point-on-arc") return point(c.point) && id(c.curveId) && (c.point.geometryId !== c.curveId || c.curveSegmentId!==undefined);
  if (c.kind === "symmetric") return point(c.first) && point(c.second) && segment(c.axis) && (c.first.geometryId !== c.second.geometryId || c.first.pointId !== c.second.pointId);
  if (c.kind === "radius" || c.kind === "diameter") return id(c.geometryId) && number(c.value) && c.value > 0;
  if (c.kind === "angle") return id(c.firstLineId) && id(c.secondLineId) && (c.firstSegmentId === undefined || id(c.firstSegmentId)) && (c.secondSegmentId === undefined || id(c.secondSegmentId)) && (c.firstLineId !== c.secondLineId || id(c.firstSegmentId) && id(c.secondSegmentId) && c.firstSegmentId !== c.secondSegmentId) && number(c.value) && Math.abs(c.value) <= Math.PI;
  if (c.kind === "fixed-point") return point(c.point) && Array.isArray(c.value) && c.value.length === 2 && c.value.every(number);
  return ["coincident", "horizontal", "vertical", "distance"].includes(c.kind) && point(c.first) && point(c.second) && (c.kind !== "distance" || number(c.value) && c.value > 0);
}
