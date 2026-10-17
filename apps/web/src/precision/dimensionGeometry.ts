import { planeToWorld, WORK_PLANES, type Vec3, type WorkPlaneId } from "./workPlane";
import { formatLength } from "./units";
import { dimensionArrowhead as arrowhead } from "./dimensionSymbols";
import { validAngularParams, validDimensionStyle, type CadDimensionStyle } from "@agent-webcad/cad-document";
import { resolveAngularDimension } from "./angularDimension";

export type DimensionOrientation = "aligned" | "horizontal" | "vertical";

export type DimensionRender = {
  /** World-space line segments: dimension/extension/arrow/leader lines. */
  segments: [Vec3, Vec3][];
  /** Resolved label: override text or the auto measurement. */
  text: string;
  /** World-space text anchor. */
  textPosition: Vec3;
  /** Measured value in `unit`; angular measurements use radians, lengths mm. */
  value: number;
  unit: "mm" | "rad";
  textHeight: number;
};

const EXTENSION_OVERSHOOT = 2;
const TEXT_GAP = 2.5;
const DEFAULT_OFFSET = 10;
const DEFAULT_LEADER_ANGLE = 45;

export function dimensionStyle(params: Record<string, unknown>): CadDimensionStyle {
  return validDimensionStyle(params.style) ? params.style : {};
}

function scaleOf(style: CadDimensionStyle) { return style.paperScale ?? 1; }
function labelLength(value: number, style: CadDimensionStyle) { return formatLength(value, style.lengthUnit ?? "mm", style.precision ?? 2); }
function labelAngle(radians: number, style: CadDimensionStyle) {
  const value = style.angleUnit === "rad" ? radians : radians * 180 / Math.PI;
  return `${value.toFixed(style.precision ?? 2)}${style.angleUnit === "rad" ? " rad" : "°"}`;
}

type V2 = [number, number];

const add = (a: V2, b: V2): V2 => [a[0] + b[0], a[1] + b[1]];
const scale = (a: V2, s: number): V2 => [a[0] * s, a[1] * s];
const dot = (a: V2, b: V2): number => a[0] * b[0] + a[1] * b[1];

function workPlaneOf(params: Record<string, unknown>): WorkPlaneId {
  return params.workPlane === "XZ" || params.workPlane === "YZ" ? params.workPlane : "XY";
}

function toWorld(plane: WorkPlaneId, point: V2): Vec3 {
  return planeToWorld(point, WORK_PLANES[plane]);
}

function overrideText(params: Record<string, unknown>): string | null {
  return typeof params.text === "string" && params.text.trim() ? params.text : null;
}

function resolveLinear(params: Record<string, unknown>): DimensionRender | null {
  const raw = params.points as unknown;
  if (!Array.isArray(raw) || raw.length !== 2) return null;
  const [p1, p2] = raw as V2[];
  if (!p1.every(Number.isFinite) || !p2.every(Number.isFinite)) return null;
  const orientation = (params.orientation ?? "aligned") as DimensionOrientation;
  if (orientation !== "aligned" && orientation !== "horizontal" && orientation !== "vertical") return null;
  const offset = params.offset === undefined ? DEFAULT_OFFSET : Number(params.offset);
  if (!Number.isFinite(offset)) return null;
  const plane = workPlaneOf(params);
  const style = dimensionStyle(params), paperScale = scaleOf(style);
  const symbolScale = Number(params.symbolScale ?? 1);
  const arrowScale = (style.arrowSize ?? 3) / 3 * paperScale * symbolScale;

  const axis: V2 | null = orientation === "horizontal" ? [1, 0] : orientation === "vertical" ? [0, 1]
    : (() => {
      const length = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      if (length <= 1e-9) return null;
      return [(p2[0] - p1[0]) / length, (p2[1] - p1[1]) / length] as V2;
    })();
  if (!axis) return null;
  const normal: V2 = [-axis[1], axis[0]];
  const value = orientation === "horizontal" ? Math.abs(p2[0] - p1[0])
    : orientation === "vertical" ? Math.abs(p2[1] - p1[1])
    : Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  if (value <= 1e-9) return null;

  // Dimension line sits past the farther measured point along the normal.
  const base = Math.max(dot(p1, normal), dot(p2, normal)) + offset;
  const project = (point: V2): V2 => add(point, scale(normal, base - dot(point, normal)));
  const q1 = project(p1);
  const q2 = project(p2);
  const overshoot = (point: V2): V2 => add(point, scale(normal, Math.sign(offset || 1) * EXTENSION_OVERSHOOT * paperScale * symbolScale));

  const segments2d: [V2, V2][] = [
    [q1, q2],
    [p1, overshoot(q1)],
    [p2, overshoot(q2)],
    ...arrowhead(q1, axis, arrowScale),
    ...arrowhead(q2, scale(axis, -1), arrowScale),
  ];
  const mid = scale(add(q1, q2), 0.5);
  const textAnchor = add(mid, scale(normal, Math.sign(offset || 1) * (style.textGap ?? TEXT_GAP) * paperScale * symbolScale));
  return {
    segments: segments2d.map(([a, b]) => [toWorld(plane, a), toWorld(plane, b)]),
    text: overrideText(params) ?? labelLength(value*Number(params.modelMeasurementScale??1), style),
    textPosition: toWorld(plane, textAnchor),
    value:value*Number(params.modelMeasurementScale??1),
    unit: "mm",
    textHeight: (style.textHeight ?? 4) * paperScale * symbolScale,
  };
}

function resolveRadius(params: Record<string, unknown>): DimensionRender | null {
  const center = params.center as unknown;
  const radius = Number(params.radius);
  if (!Array.isArray(center) || center.length !== 2 || !center.every(Number.isFinite)) return null;
  if (!Number.isFinite(radius) || radius <= 0) return null;
  const angle = ((params.angle === undefined ? DEFAULT_LEADER_ANGLE : Number(params.angle)) * Math.PI) / 180;
  if (!Number.isFinite(angle)) return null;
  const plane = workPlaneOf(params);
  const style = dimensionStyle(params), paperScale = scaleOf(style), arrowScale = (style.arrowSize ?? 3) / 3 * paperScale;
  const direction: V2 = [Math.cos(angle), Math.sin(angle)];
  const c: V2 = [center[0], center[1]];
  const rim = add(c, scale(direction, radius));
  const tail = add(rim, scale(direction, 10 * paperScale));
  const diameter=params.kind==="diameter",opposite=add(c,scale(direction,-radius));

  const segments2d: [V2, V2][] = [
    [diameter?opposite:c, tail],
    ...arrowhead(rim, scale(direction, diameter?1:-1), arrowScale),
    ...(diameter?arrowhead(opposite,scale(direction,-1),arrowScale):[]),
  ];
  const textAnchor = add(tail, scale(direction, (style.textGap ?? TEXT_GAP) * paperScale));
  return {
    segments: segments2d.map(([a, b]) => [toWorld(plane, a), toWorld(plane, b)]),
    text: overrideText(params) ?? `${diameter?"Ø":"R"} ${labelLength((diameter?2*radius:radius)*Number(params.modelMeasurementScale??1),style)}`,
    textPosition: toWorld(plane, textAnchor),
    value: (diameter?2*radius:radius)*Number(params.modelMeasurementScale??1),
    unit: "mm",
    textHeight: (style.textHeight ?? 4) * paperScale,
  };
}

/**
 * Pure dimension resolution: params -> world-space linework plus label.
 * Same function feeds the viewport renderer, world bounds and export, so
 * they can never disagree. Returns null for invalid params (the command
 * validator rejects those before they reach the document).
 */
export function resolveDimension(params: Record<string, unknown>): DimensionRender | null {
  if(params.modelDrawingReference&&params.referenceStatus!=="resolved")return null;
  if (params.kind === "angular") {
    if (!validAngularParams(params)) return null;
    const style = dimensionStyle(params), paperScale = scaleOf(style);
    const result = resolveAngularDimension(params.lines[0], params.lines[1], params.branch, { radius: params.radius, text: params.text ?? undefined, symbolScale: (style.arrowSize ?? 3) / 3 * paperScale, textGap: (style.textGap ?? TEXT_GAP) * paperScale });
    if (!result.ok) return null;
    const g = result.geometry;
    return { segments: g.segments, text: overrideText(params) ?? labelAngle(g.measurement.angleRadians, style), textPosition: g.textPosition, value: g.measurement.angleRadians, unit: "rad", textHeight: (style.textHeight ?? 4) * paperScale };
  }
  if (params.kind === "linear") return resolveLinear(params);
  if (params.kind === "radius" || params.kind === "diameter") return resolveRadius(params);
  return null;
}
