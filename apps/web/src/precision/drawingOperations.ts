import type { Vec3, WorkPlaneId } from "./workPlane";
import type {
  DrawingTopology,
  DrawingTopologyControl,
  DrawingTopologySegment,
} from "./drawingTopology";
import { profileBulges, profileIsClosed, profileSegmentCount } from "./profileGeometry";

type Vec2 = [number, number];
const EPSILON = 1e-9;

function workPlaneId(value: unknown): WorkPlaneId {
  return value === "XZ" || value === "YZ" ? value : "XY";
}

export function drawingPointToPlane(point: Vec3, plane: unknown): Vec2 {
  if (plane === "XZ") return [point[0], point[2]];
  if (plane === "YZ") return [point[1], point[2]];
  return [point[0], point[1]];
}

export function drawingPointFromPlane(point: Vec2, elevation: number, plane: unknown): Vec3 {
  if (plane === "XZ") return [point[0], elevation, point[1]];
  if (plane === "YZ") return [elevation, point[0], point[1]];
  return [point[0], point[1], elevation];
}

function sameParams(a: Record<string, unknown>, b: Record<string, unknown>) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function topologyOf(params: Record<string, unknown>): DrawingTopology | undefined {
  return params.topology as DrawingTopology | undefined;
}

function cross2(a: Vec2, b: Vec2) {
  return a[0] * b[1] - a[1] * b[0];
}

function subtract2(a: Vec2, b: Vec2): Vec2 {
  return [a[0] - b[0], a[1] - b[1]];
}

function signedArea(points: Vec2[]) {
  return points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length];
    return area + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2;
}

function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2) {
  const ab = subtract2(b, a);
  const ac = subtract2(c, a);
  const ad = subtract2(d, a);
  const cd = subtract2(d, c);
  const ca = subtract2(a, c);
  const cb = subtract2(b, c);
  const firstC = cross2(ab, ac);
  const firstD = cross2(ab, ad);
  const secondA = cross2(cd, ca);
  const secondB = cross2(cd, cb);
  if (firstC * firstD < -1e-12 && secondA * secondB < -1e-12) return true;
  const onSegment = (p: Vec2, q: Vec2, r: Vec2) => Math.abs(cross2(subtract2(q, p), subtract2(r, p))) <= 1e-9 &&
    r[0] >= Math.min(p[0], q[0]) - 1e-9 && r[0] <= Math.max(p[0], q[0]) + 1e-9 &&
    r[1] >= Math.min(p[1], q[1]) - 1e-9 && r[1] <= Math.max(p[1], q[1]) + 1e-9;
  return onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
}

function profileSelfIntersects(points: Vec2[], closed: boolean) {
  const count = points.length - 1 + (closed ? 1 : 0);
  for (let first = 0; first < count; first += 1) {
    const a = points[first];
    const b = points[(first + 1) % points.length];
    for (let second = first + 1; second < count; second += 1) {
      if (second === first + 1 || (closed && first === 0 && second === count - 1)) continue;
      const c = points[second];
      const d = points[(second + 1) % points.length];
      if (segmentsIntersect(a, b, c, d)) return true;
    }
  }
  return false;
}

/** Closes an open polyline without duplicating its first control point. */
export function closeDrawingProfileParams(source: Record<string, unknown>): Record<string, unknown> | null {
  if (source.kind !== "polyline" || source.closed === true || !Array.isArray(source.points) || source.points.length < 3) return null;
  const plane = workPlaneId(source.workPlane);
  const points = source.points as Vec3[];
  const projected = points.map((point) => drawingPointToPlane(point, plane));
  if (projected.some((point, index) => Math.hypot(point[0] - projected[(index + 1) % projected.length][0], point[1] - projected[(index + 1) % projected.length][1]) <= EPSILON) ||
      Math.abs(signedArea(projected)) <= EPSILON || profileSelfIntersects(projected, true)) return null;
  const topology = topologyOf(source);
  if (!topology || topology.controls.length !== points.length) return null;
  const controls = topology.controls.map((control, index) => ({ ...control, index }));
  const closing: DrawingTopologySegment = {
    id: `segment-${crypto.randomUUID()}`,
    startControlId: controls.at(-1)!.id,
    endControlId: controls[0].id,
    index: points.length - 1,
    kind: "line",
  };
  return {
    ...structuredClone(source),
    closed: true,
    bulges: [...profileBulges("polyline", source), 0],
    topology: { ...structuredClone(topology), controls, segments: [...topology.segments.map((segment, index) => ({ ...segment, index })), closing] },
  };
}

/**
 * Replaces one straight polyline/rectangle corner with an exact circular
 * fillet (bulge) or a straight chamfer. Unaffected topology ids are retained.
 */
export function editDrawingCornerParams(
  source: Record<string, unknown>,
  controlId: string,
  treatment: "fillet" | "chamfer",
  distance: number,
): Record<string, unknown> | null {
  const kind = String(source.kind ?? "");
  if (!(kind === "polyline" || kind === "rectangle") || !Number.isFinite(distance) || distance <= EPSILON || !Array.isArray(source.points)) return null;
  const points = source.points as Vec3[];
  const topology = topologyOf(source);
  const control = topology?.controls.find((entry) => entry.id === controlId);
  if (!topology || control?.role !== "vertex" || control.index === undefined || points.length < 3) return null;
  const closed = profileIsClosed(kind, source);
  const index = control.index;
  if (!closed && (index === 0 || index === points.length - 1)) return null;
  const previousIndex = (index + points.length - 1) % points.length;
  const nextIndex = (index + 1) % points.length;
  const bulges = profileBulges(kind, source);
  const previousSegmentIndex = (index + profileSegmentCount(kind, source) - 1) % profileSegmentCount(kind, source);
  if (Math.abs(bulges[previousSegmentIndex] ?? 0) > EPSILON || Math.abs(bulges[index] ?? 0) > EPSILON) return null;

  const plane = workPlaneId(source.workPlane);
  const a = drawingPointToPlane(points[previousIndex], plane);
  const b = drawingPointToPlane(points[index], plane);
  const c = drawingPointToPlane(points[nextIndex], plane);
  const ba = subtract2(a, b);
  const bc = subtract2(c, b);
  const incoming = subtract2(b, a);
  const outgoing = subtract2(c, b);
  const previousLength = Math.hypot(...ba);
  const nextLength = Math.hypot(...bc);
  if (previousLength <= EPSILON || nextLength <= EPSILON) return null;
  const uPrevious: Vec2 = [ba[0] / previousLength, ba[1] / previousLength];
  const uNext: Vec2 = [bc[0] / nextLength, bc[1] / nextLength];
  const angle = Math.acos(Math.max(-1, Math.min(1, uPrevious[0] * uNext[0] + uPrevious[1] * uNext[1])));
  if (angle <= 1e-6 || Math.PI - angle <= 1e-6) return null;
  const setback = treatment === "fillet" ? distance / Math.tan(angle / 2) : distance;
  if (!(setback > EPSILON) || setback >= previousLength - EPSILON || setback >= nextLength - EPSILON) return null;
  const first2: Vec2 = [b[0] + uPrevious[0] * setback, b[1] + uPrevious[1] * setback];
  const second2: Vec2 = [b[0] + uNext[0] * setback, b[1] + uNext[1] * setback];
  const elevation = plane === "XZ" ? points[index][1] : plane === "YZ" ? points[index][0] : points[index][2];
  const first = drawingPointFromPlane(first2, elevation, plane);
  const second = drawingPointFromPlane(second2, elevation, plane);
  const sweep = Math.sign(cross2(incoming, outgoing)) * (Math.PI - angle);
  const cornerBulge = treatment === "fillet" ? Math.tan(sweep / 4) : 0;
  if (treatment === "fillet" && Math.abs(cornerBulge) <= EPSILON) return null;

  const nextPoints = points.flatMap((point, pointIndex) => pointIndex === index ? [first, second] : [[...point] as Vec3]);
  const nextControls = [...topology.controls]
    .sort((left, right) => Number(left.index ?? 0) - Number(right.index ?? 0))
    .flatMap((entry) => entry.id === controlId
      ? [{ ...entry, index }, { id: `vertex-${crypto.randomUUID()}`, role: "vertex" as const, index: index + 1 }]
      : [{ ...entry, index: Number(entry.index) > index ? Number(entry.index) + 1 : entry.index }]);
  const newControlId = nextControls[index + 1].id;
  const oldSegments = topology.segments;
  const incomingSegment = oldSegments.find((segment) => segment.endControlId === controlId);
  const outgoingSegment = oldSegments.find((segment) => segment.startControlId === controlId);
  if (!incomingSegment || !outgoingSegment) return null;
  const cornerSegmentId = `segment-${crypto.randomUUID()}`;
  const edgeCount = nextPoints.length - 1 + (closed ? 1 : 0);
  const nextSegments: DrawingTopologySegment[] = [];
  for (let edge = 0; edge < edgeCount; edge += 1) {
    const start = nextControls[edge];
    const end = nextControls[(edge + 1) % nextControls.length];
    let existing = oldSegments.find((segment) => segment.startControlId === start.id && segment.endControlId === end.id);
    if (end.id === controlId) existing = incomingSegment;
    if (start.id === newControlId) existing = outgoingSegment;
    nextSegments.push({
      id: start.id === controlId && end.id === newControlId ? cornerSegmentId : existing?.id ?? `segment-${crypto.randomUUID()}`,
      startControlId: start.id,
      endControlId: end.id,
      index: edge,
      kind: start.id === controlId && end.id === newControlId && treatment === "fillet" ? "arc" : "line",
    });
  }
  const nextBulges = nextSegments.map((segment) => segment.id === cornerSegmentId ? cornerBulge : 0);
  const projected = nextPoints.map((point) => drawingPointToPlane(point, plane));
  if (closed && (Math.abs(signedArea(projected)) <= EPSILON || profileSelfIntersects(projected, true))) return null;
  return {
    ...structuredClone(source),
    kind: "polyline",
    points: nextPoints,
    closed,
    bulges: nextBulges,
    topology: {
      version: 1,
      controls: nextControls,
      segments: nextSegments,
      curves: [
        ...topology.curves.filter((curve) => !oldSegments.some((segment) => segment.id === curve.id)),
        ...(treatment === "fillet" ? [{ id: cornerSegmentId, kind: "arc" as const }] : []),
      ],
    },
  };
}

/** Returns a replacement parameter object, or null for invalid/no-op edits. */
export function editDrawingControlParams(
  source: Record<string, unknown>,
  controlId: string,
  point: Vec3,
): Record<string, unknown> | null {
  const params = structuredClone(source);
  const kind = String(params.kind ?? "");
  const control = topologyOf(params)?.controls.find((entry) => entry.id === controlId);
  if (!control) return null;

  if (control.role === "vertex" && typeof control.index === "number" && Array.isArray(params.points)) {
    const points = structuredClone(params.points) as Vec3[];
    if (!points[control.index]) return null;
    if (kind === "rectangle" && points.length === 4) {
      const movedIndex = control.index;
      const previousIndex = (movedIndex + 3) % 4;
      const nextIndex = (movedIndex + 1) % 4;
      const old = drawingPointToPlane(points[movedIndex], params.workPlane);
      const moved = drawingPointToPlane(point, params.workPlane);
      const updateAdjacent = (index: number) => {
        const adjacent = drawingPointToPlane(points[index], params.workPlane);
        const sharesFirstAxis = Math.abs(adjacent[0] - old[0]) <= Math.abs(adjacent[1] - old[1]);
        const next: Vec2 = sharesFirstAxis ? [moved[0], adjacent[1]] : [adjacent[0], moved[1]];
        const elevation = params.workPlane === "XZ"
          ? points[index][1]
          : params.workPlane === "YZ" ? points[index][0] : points[index][2];
        points[index] = drawingPointFromPlane(next, elevation, params.workPlane);
      };
      updateAdjacent(previousIndex);
      updateAdjacent(nextIndex);
    }
    points[control.index] = [...point];
    params.points = points;
  } else if (control.role === "center") {
    params.center = [...point];
  } else if ((control.role === "radius" || control.role === "start" || control.role === "end") && Array.isArray(params.center)) {
    const center = drawingPointToPlane(params.center as Vec3, params.workPlane);
    const target = drawingPointToPlane(point, params.workPlane);
    const dx = target[0] - center[0];
    const dy = target[1] - center[1];
    const radius = Math.hypot(dx, dy);
    if (!(radius > EPSILON)) return null;
    params.radius = radius;
    if (kind === "arc" && control.role === "start") params.startAngle = Math.atan2(dy, dx);
    if (kind === "arc" && control.role === "end") params.endAngle = Math.atan2(dy, dx);
  } else {
    return null;
  }

  return sameParams(source, params) ? null : params;
}

function resolveSegmentControls(
  params: Record<string, unknown>,
  segmentId: string,
): [DrawingTopologyControl, DrawingTopologyControl] | null {
  const topology = topologyOf(params);
  const segment = topology?.segments.find((entry) => entry.id === segmentId);
  if (!segment) return null;
  const start = topology?.controls.find((entry) => entry.id === segment.startControlId);
  const end = topology?.controls.find((entry) => entry.id === segment.endControlId);
  return start && end ? [start, end] : null;
}

/** Returns a replacement parameter object, or null for invalid/no-op edits. */
export function editDrawingSegmentParams(
  source: Record<string, unknown>,
  segmentId: string,
  requestedDelta: Vec3,
): Record<string, unknown> | null {
  if (!Array.isArray(source.points)) return null;
  const controls = resolveSegmentControls(source, segmentId);
  if (!controls) return null;
  const [start, end] = controls;
  if (start.role !== "vertex" || end.role !== "vertex" || start.index === undefined || end.index === undefined) return null;
  const points = structuredClone(source.points) as Vec3[];
  if (!points[start.index] || !points[end.index]) return null;

  let delta = [...requestedDelta] as Vec3;
  if (source.kind === "rectangle") {
    const plane = workPlaneId(source.workPlane);
    const a = drawingPointToPlane(points[start.index], plane);
    const b = drawingPointToPlane(points[end.index], plane);
    const delta2 = drawingPointToPlane(delta, plane);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const length = Math.hypot(dx, dy);
    if (length <= EPSILON) return null;
    const normal: Vec2 = [-dy / length, dx / length];
    const amount = delta2[0] * normal[0] + delta2[1] * normal[1];
    delta = drawingPointFromPlane([normal[0] * amount, normal[1] * amount], 0, plane);
  }
  if (Math.hypot(...delta) <= EPSILON) return null;

  for (const index of new Set([start.index, end.index])) {
    points[index] = [
      points[index][0] + delta[0],
      points[index][1] + delta[1],
      points[index][2] + delta[2],
    ];
  }
  const closed = source.kind === "rectangle" || source.closed === true;
  const segmentCount = points.length - 1 + (closed ? 1 : 0);
  for (let index = 0; index < segmentCount; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    if (Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) <= EPSILON) return null;
  }

  return { ...structuredClone(source), points };
}

function lineIntersection2d(a0: Vec2, a1: Vec2, b0: Vec2, b1: Vec2): Vec2 | null {
  const ax = a1[0] - a0[0];
  const ay = a1[1] - a0[1];
  const bx = b1[0] - b0[0];
  const by = b1[1] - b0[1];
  const determinant = ax * by - ay * bx;
  if (Math.abs(determinant) < EPSILON) return null;
  const t = ((b0[0] - a0[0]) * by - (b0[1] - a0[1]) * bx) / determinant;
  return [a0[0] + ax * t, a0[1] + ay * t];
}

function offsetJoin(previous: [Vec2, Vec2], current: [Vec2, Vec2]): Vec2 | null {
  const intersection = lineIntersection2d(previous[0], previous[1], current[0], current[1]);
  if (intersection) return intersection;

  // A redundant collinear vertex is still a valid connected path. Its two
  // offset segments meet at the same point, but infinite-line intersection
  // is undefined because the directions are parallel. Preserve that join
  // while continuing to reject a 180-degree reversal/cusp as ambiguous.
  const previousDirection: Vec2 = [
    previous[1][0] - previous[0][0],
    previous[1][1] - previous[0][1],
  ];
  const currentDirection: Vec2 = [
    current[1][0] - current[0][0],
    current[1][1] - current[0][1],
  ];
  const dot = previousDirection[0] * currentDirection[0] + previousDirection[1] * currentDirection[1];
  if (dot <= EPSILON) return null;
  if (Math.hypot(previous[1][0] - current[0][0], previous[1][1] - current[0][1]) > 1e-7) return null;
  return [
    (previous[1][0] + current[0][0]) / 2,
    (previous[1][1] + current[0][1]) / 2,
  ];
}

/** Pure local-plane offset used by both viewport preview and command commit. */
export function offsetDrawingParams(
  kind: string,
  source: Record<string, unknown>,
  distance: number,
): Record<string, unknown> | null {
  if (!Number.isFinite(distance) || Math.abs(distance) <= EPSILON) return null;
  const plane = workPlaneId(source.workPlane);
  if ((kind === "line" || kind === "polyline" || kind === "rectangle") && Array.isArray(source.points)) {
    if (profileBulges(kind, source).some((bulge) => Math.abs(bulge) > EPSILON)) return null;
    const points = source.points as Vec3[];
    const planePoints = points.map((point) => drawingPointToPlane(point, plane));
    const closed = kind === "rectangle" || source.closed === true;
    if (planePoints.length < 2) return null;
    const segments = planePoints.slice(0, -1).map((a, index) => {
      const b = planePoints[index + 1];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const length = Math.hypot(dx, dy);
      if (length < EPSILON) return null;
      const nx = -dy / length * distance;
      const ny = dx / length * distance;
      return [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny]] as [Vec2, Vec2];
    });
    if (segments.some((segment) => !segment)) return null;
    const validSegments = segments as [Vec2, Vec2][];
    if (closed) {
      const last = planePoints.at(-1)!;
      const first = planePoints[0];
      const dx = first[0] - last[0];
      const dy = first[1] - last[1];
      const length = Math.hypot(dx, dy);
      if (length < EPSILON) return null;
      const nx = -dy / length * distance;
      const ny = dx / length * distance;
      validSegments.push([[last[0] + nx, last[1] + ny], [first[0] + nx, first[1] + ny]]);
    }

    const result: Vec2[] = [];
    const vertexCount = closed ? planePoints.length : segments.length;
    for (let index = 0; index < vertexCount; index += 1) {
      const previous = validSegments[(index + validSegments.length - 1) % validSegments.length];
      const current = validSegments[index];
      const point = closed || index > 0
        ? offsetJoin(previous, current)
        : current[0];
      if (!point) return null;
      result.push(point);
    }
    if (!closed) result.push(validSegments.at(-1)![1]);

    if (closed) {
      const originalArea = signedArea(planePoints);
      const offsetArea = signedArea(result);
      const reversedEdge = result.some((point, index) => {
        const next = result[(index + 1) % result.length];
        const original = planePoints[index];
        const originalNext = planePoints[(index + 1) % planePoints.length];
        return (next[0] - point[0]) * (originalNext[0] - original[0]) +
          (next[1] - point[1]) * (originalNext[1] - original[1]) <= EPSILON;
      });
      const crosses = (a: Vec2, b: Vec2, c: Vec2, d: Vec2) => {
        const orientation = (p: Vec2, q: Vec2, r: Vec2) =>
          (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
        return orientation(a, b, c) * orientation(a, b, d) < -1e-12 &&
          orientation(c, d, a) * orientation(c, d, b) < -1e-12;
      };
      const selfIntersects = result.some((point, index) => result.some((other, otherIndex) => {
        if (otherIndex <= index + 1 || (index === 0 && otherIndex === result.length - 1)) return false;
        return crosses(point, result[(index + 1) % result.length], other, result[(otherIndex + 1) % result.length]);
      }));
      if (
        Math.abs(offsetArea) < EPSILON ||
        originalArea * offsetArea <= 0 ||
        reversedEdge ||
        selfIntersects ||
        result.some((point, index) => Math.hypot(
          point[0] - result[(index + 1) % result.length][0],
          point[1] - result[(index + 1) % result.length][1],
        ) < EPSILON)
      ) return null;
    }

    const elevation = plane === "XZ" ? points[0][1] : plane === "YZ" ? points[0][0] : points[0][2];
    return {
      ...structuredClone(source),
      points: result.map((point) => drawingPointFromPlane(point, elevation, plane)),
      topology: undefined,
    };
  }

  if ((kind === "circle" || kind === "arc") && Array.isArray(source.center)) {
    const radius = Number(source.radius) + distance;
    if (!(radius > EPSILON)) return null;
    return { ...structuredClone(source), radius, topology: undefined };
  }
  return null;
}
