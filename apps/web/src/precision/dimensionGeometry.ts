import { planeToWorld, WORK_PLANES, type Vec3, type WorkPlaneId } from "./workPlane";
import { formatLength } from "./units";
import { dimensionArrowhead as arrowhead } from "./dimensionSymbols";
import { validAngularParams } from "@agent-webcad/cad-document";
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
};

const EXTENSION_OVERSHOOT = 2;
const TEXT_GAP = 2.5;
const DEFAULT_OFFSET = 10;
const DEFAULT_LEADER_ANGLE = 45;

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
  const symbolScale = Number(params.symbolScale ?? 1);

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
  const overshoot = (point: V2): V2 => add(point, scale(normal, Math.sign(offset || 1) * EXTENSION_OVERSHOOT * symbolScale));

  const segments2d: [V2, V2][] = [
    [q1, q2],
    [p1, overshoot(q1)],
    [p2, overshoot(q2)],
    ...arrowhead(q1, axis, symbolScale),
    ...arrowhead(q2, scale(axis, -1), symbolScale),
  ];
  const mid = scale(add(q1, q2), 0.5);
  const textAnchor = add(mid, scale(normal, Math.sign(offset || 1) * TEXT_GAP * symbolScale));
  return {
    segments: segments2d.map(([a, b]) => [toWorld(plane, a), toWorld(plane, b)]),
    text: overrideText(params) ?? formatLength(value),
    textPosition: toWorld(plane, textAnchor),
    value,
    unit: "mm",
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
  const direction: V2 = [Math.cos(angle), Math.sin(angle)];
  const c: V2 = [center[0], center[1]];
  const rim = add(c, scale(direction, radius));
  const tail = add(rim, scale(direction, 10));
  const diameter=params.kind==="diameter",opposite=add(c,scale(direction,-radius));

  const segments2d: [V2, V2][] = [
    [diameter?opposite:c, tail],
    ...arrowhead(rim, scale(direction, diameter?1:-1)),
    ...(diameter?arrowhead(opposite,scale(direction,-1)):[]),
  ];
  const textAnchor = add(tail, scale(direction, TEXT_GAP));
  return {
    segments: segments2d.map(([a, b]) => [toWorld(plane, a), toWorld(plane, b)]),
    text: overrideText(params) ?? `${diameter?"Ø":"R"} ${formatLength(diameter?2*radius:radius)}`,
    textPosition: toWorld(plane, textAnchor),
    value: diameter?2*radius:radius,
    unit: "mm",
  };
}

/**
 * Pure dimension resolution: params -> world-space linework plus label.
 * Same function feeds the viewport renderer, world bounds and export, so
 * they can never disagree. Returns null for invalid params (the command
 * validator rejects those before they reach the document).
 */
export function resolveDimension(params: Record<string, unknown>): DimensionRender | null {
  if (params.kind === "angular") {
    if (!validAngularParams(params)) return null;
    const result = resolveAngularDimension(params.lines[0], params.lines[1], params.branch, { radius: params.radius, text: params.text ?? undefined });
    if (!result.ok) return null;
    const g = result.geometry;
    return { segments: g.segments, text: g.text, textPosition: g.textPosition, value: g.measurement.angleRadians, unit: "rad" };
  }
  if (params.kind === "linear") return resolveLinear(params);
  if (params.kind === "radius" || params.kind === "diameter") return resolveRadius(params);
  return null;
}
