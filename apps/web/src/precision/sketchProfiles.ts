import type { CadDocument } from "@agent-webcad/cad-document";
import type { ExtrudeProfile, ExtrudeProfileSegment } from "@agent-webcad/cad-kernel";
import { getWorldDrawingGeometry, type WorldProfileSegment } from "./worldGeometry";
import { planeToWorld, worldToPlane, WORK_PLANES, type Vec3, type WorkPlaneId } from "./workPlane";

export type SketchLoop = ExtrudeProfile & {
  workPlane: WorkPlaneId;
  sourceObjectIds: string[];
  sourceTopologyIds: string[];
};

export type SketchLoopResult =
  | { ok: true; loops: SketchLoop[] }
  | { ok: false; reason: string };

const TOLERANCE = 1e-6;
const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const samePoint = (a: Vec3, b: Vec3) => distance(a, b) <= TOLERANCE;
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

type LoopEdge = WorldProfileSegment & { objectId: string };

function profilePlaneElevation(point: Vec3, plane: WorkPlaneId) {
  return dot(point, WORK_PLANES[plane].normal);
}

function reverseEdge(edge: LoopEdge): LoopEdge {
  return {
    ...edge,
    start: edge.end,
    end: edge.start,
    startAngle: edge.endAngle,
    endAngle: edge.startAngle,
  };
}

function arcMidpoint(edge: WorldProfileSegment, plane: WorkPlaneId): Vec3 | null {
  if (!edge.center || !edge.radius || edge.startAngle === undefined || edge.endAngle === undefined) return null;
  const center = worldToPlane(edge.center, WORK_PLANES[plane]);
  const angle = (edge.startAngle + edge.endAngle) / 2;
  return planeToWorld([
    center[0] + Math.cos(angle) * edge.radius,
    center[1] + Math.sin(angle) * edge.radius,
  ], { ...WORK_PLANES[plane], origin: [
    WORK_PLANES[plane].origin[0] + WORK_PLANES[plane].normal[0] * profilePlaneElevation(edge.center, plane),
    WORK_PLANES[plane].origin[1] + WORK_PLANES[plane].normal[1] * profilePlaneElevation(edge.center, plane),
    WORK_PLANES[plane].origin[2] + WORK_PLANES[plane].normal[2] * profilePlaneElevation(edge.center, plane),
  ] });
}

function kernelSegment(edge: LoopEdge, plane: WorkPlaneId): ExtrudeProfileSegment | null {
  if (edge.kind === "line") {
    return { kind: "line", topologyReference: `${edge.objectId}/${edge.topologyReference}`, start: edge.start, end: edge.end };
  }
  const mid = arcMidpoint(edge, plane);
  return mid ? { kind: "arc", topologyReference: `${edge.objectId}/${edge.topologyReference}`, start: edge.start, mid, end: edge.end } : null;
}

function sampledEdge(edge: LoopEdge, plane: WorkPlaneId): [number, number][] {
  if (edge.kind === "line" || !edge.center || !edge.radius || edge.startAngle === undefined || edge.endAngle === undefined) {
    return [worldToPlane(edge.start, WORK_PLANES[plane]), worldToPlane(edge.end, WORK_PLANES[plane])];
  }
  const center = worldToPlane(edge.center, WORK_PLANES[plane]);
  const sweep = edge.endAngle - edge.startAngle;
  const count = Math.max(2, Math.ceil(Math.abs(sweep) / (Math.PI / 24)));
  return Array.from({ length: count + 1 }, (_, index) => {
    const angle = edge.startAngle! + sweep * index / count;
    return [center[0] + Math.cos(angle) * edge.radius!, center[1] + Math.sin(angle) * edge.radius!] as [number, number];
  });
}

function signedArea(edges: LoopEdge[], plane: WorkPlaneId) {
  const points = edges.flatMap((edge, index) => sampledEdge(edge, plane).slice(index ? 1 : 0));
  if (points.length > 1 && !samePoint(planeToWorld(points[0], WORK_PLANES[plane]), planeToWorld(points.at(-1)!, WORK_PLANES[plane]))) points.push(points[0]);
  let area = 0;
  for (let index = 0; index < points.length - 1; index += 1) area += points[index][0] * points[index + 1][1] - points[index + 1][0] * points[index][1];
  return area / 2;
}

function cross(a: [number, number], b: [number, number], c: [number, number]) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function strictIntersection(a: [number, number], b: [number, number], c: [number, number], d: [number, number]) {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  return abC * abD < -TOLERANCE && cdA * cdB < -TOLERANCE;
}

function selfIntersects(edges: LoopEdge[], plane: WorkPlaneId) {
  const sampled = edges.flatMap((edge) => {
    const points = sampledEdge(edge, plane);
    return points.slice(0, -1).map((start, index) => [start, points[index + 1]] as const);
  });
  for (let first = 0; first < sampled.length; first += 1) {
    for (let second = first + 1; second < sampled.length; second += 1) {
      const adjacent = second === first + 1 || (first === 0 && second === sampled.length - 1);
      if (!adjacent && strictIntersection(sampled[first][0], sampled[first][1], sampled[second][0], sampled[second][1])) return true;
    }
  }
  return false;
}

function orientLoop(edges: LoopEdge[], plane: WorkPlaneId) {
  return signedArea(edges, plane) < 0 ? edges.slice().reverse().map(reverseEdge) : edges;
}

function makeLoop(edges: LoopEdge[], plane: WorkPlaneId): SketchLoopResult {
  if (edges.some((edge) => samePoint(edge.start, edge.end))) return { ok: false, reason: "Profile contains a zero-length edge." };
  if (edges.length < 2) return { ok: false, reason: "Selected geometry does not form a closed loop." };
  const ordered: LoopEdge[] = [];
  const remaining = edges.slice().sort((a, b) => `${a.objectId}/${a.topologyReference}`.localeCompare(`${b.objectId}/${b.topologyReference}`));
  ordered.push(remaining.shift()!);
  while (remaining.length) {
    const end = ordered.at(-1)!.end;
    const candidates = remaining.flatMap((edge, index) => samePoint(edge.start, end) ? [{ edge, index }] : samePoint(edge.end, end) ? [{ edge: reverseEdge(edge), index }] : []);
    if (candidates.length !== 1) return { ok: false, reason: candidates.length ? "Profile branches at a shared vertex." : "Selected geometry is not connected." };
    const next = candidates[0];
    ordered.push(next.edge);
    remaining.splice(next.index, 1);
  }
  if (!samePoint(ordered.at(-1)!.end, ordered[0].start)) return { ok: false, reason: "Selected geometry does not form a closed loop." };

  const normalized = orientLoop(ordered, plane);
  if (Math.abs(signedArea(normalized, plane)) <= TOLERANCE * TOLERANCE) return { ok: false, reason: "Profile has zero area." };
  if (selfIntersects(normalized, plane)) return { ok: false, reason: "Profile self-intersects." };
  const segments = normalized.map((edge) => kernelSegment(edge, plane));
  if (segments.some((segment) => !segment)) return { ok: false, reason: "Profile contains an unsupported curve." };
  const sourceTopologyIds = normalized.map((edge) => `${edge.objectId}/${edge.topologyReference}`);
  return {
    ok: true,
    loops: [{
      id: `loop:${sourceTopologyIds.slice().sort().join("|")}`,
      workPlane: plane,
      normal: [...WORK_PLANES[plane].normal],
      segments: segments as ExtrudeProfileSegment[],
      sourceObjectIds: [...new Set(normalized.map((edge) => edge.objectId))],
      sourceTopologyIds,
    }],
  };
}

/**
 * Converts selected drawing topology into deterministic, exact, planar loops.
 * Disconnected islands and holes are deliberately rejected until face nesting
 * can be represented without ambiguity.
 */
export function extractSketchLoops(document: CadDocument, objectIds: readonly string[]): SketchLoopResult {
  if (!objectIds.length) return { ok: false, reason: "Select a closed drawing profile." };
  const geometries = objectIds.map((objectId) => {
    const object = document.objects[objectId];
    const feature = object && Object.values(document.features).find((entry) => entry.output === objectId);
    const layer = object ? document.layers[object.layerId] : undefined;
    if (!object || !feature || feature.type !== "drawing" || !object.visible || !layer?.visible || layer.locked) return null;
    const world = getWorldDrawingGeometry(object, feature);
    return world ? { object, feature, world } : null;
  });
  if (geometries.some((entry) => !entry)) return { ok: false, reason: "All profile entities must be visible, unlocked drawings." };
  const valid = geometries.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  const plane = valid[0].world.workPlane;
  if (valid.some(({ world }) => world.workPlane !== plane || !world.planeAligned || !world.uniformScale)) {
    return { ok: false, reason: "Profile entities must share one plane and use supported uniform transforms." };
  }

  const elevations = valid.flatMap(({ world }) => world.points?.length ? [profilePlaneElevation(world.points[0], plane)] : world.center ? [profilePlaneElevation(world.center, plane)] : []);
  if (!elevations.length || elevations.some((value) => Math.abs(value - elevations[0]) > TOLERANCE)) return { ok: false, reason: "Profile entities are not coplanar." };

  if (valid.length === 1 && valid[0].world.kind === "circle") {
    const { object, feature, world } = valid[0];
    const topology = feature.params.topology as { curves?: { id: string }[] } | undefined;
    if (!world.center || !world.radius) return { ok: false, reason: "Circle transform cannot be represented exactly." };
    const topologyReference = `${object.id}/${topology?.curves?.[0]?.id ?? "curve:0"}`;
    return { ok: true, loops: [{
      id: `loop:${topologyReference}`,
      workPlane: plane,
      normal: [...WORK_PLANES[plane].normal],
      sourceObjectIds: [object.id],
      sourceTopologyIds: [topologyReference],
      segments: [{
        kind: "circle",
        topologyReference,
        center: world.center,
        radius: world.radius,
        normal: [...WORK_PLANES[plane].normal],
        xAxis: world.points?.[0]
          ? [
              (world.points[0][0] - world.center[0]) / world.radius,
              (world.points[0][1] - world.center[1]) / world.radius,
              (world.points[0][2] - world.center[2]) / world.radius,
            ]
          : [...WORK_PLANES[plane].xAxis],
      }],
    }] };
  }

  const edges: LoopEdge[] = [];
  for (const { object, feature, world } of valid) {
    if (world.kind === "circle") return { ok: false, reason: "Circle profiles cannot be mixed with other selected entities yet." };
    if (world.kind === "arc") {
      const topology = feature.params.topology as { curves?: { id: string }[] } | undefined;
      if (!world.points?.length || !world.center || !world.radius || world.startAngle === undefined || world.endAngle === undefined) return { ok: false, reason: "Arc transform cannot be represented exactly." };
      edges.push({ objectId: object.id, topologyReference: topology?.curves?.[0]?.id ?? "curve:0", kind: "arc", start: world.points[0], end: world.points.at(-1)!, center: world.center, radius: world.radius, startAngle: world.startAngle, endAngle: world.endAngle });
      continue;
    }
    if (!world.profileSegments?.length) return { ok: false, reason: "Drawing has no exact profile segments." };
    edges.push(...world.profileSegments.map((segment) => ({ ...segment, objectId: object.id })));
  }
  return makeLoop(edges, plane);
}
