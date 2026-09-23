import type { Sketch, SketchPoint, SketchPointRef } from "@agent-webcad/cad-document";
import { SKETCH_TOLERANCE, sketchPoint } from "./sketchSolver";

export type ParametricSketchProfile = {
  id: string;
  sketchId: string;
  workPlane: Sketch["workPlane"];
  sourceGeometryIds: string[];
  sourceTopologyIds: string[];
  /** Local 2D boundary; resolved from the solved sketch, never an independent source. */
  boundary: { kind: "line"; start: SketchPoint; end: SketchPoint; topologyId: string }[] |
    { kind: "circle"; center: SketchPoint; radius: number; topologyId: string }[];
  signedArea: number;
  parentProfileId: string | null;
};

const key = (reference: SketchPointRef) => `${reference.geometryId}/${reference.pointId}`;
const distance = (a: SketchPoint, b: SketchPoint) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const cross = (a: SketchPoint, b: SketchPoint, c: SketchPoint) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

function polygonValid(points: SketchPoint[]) {
  if (points.length < 3 || points.some((point, index) => distance(point, points[(index + 1) % points.length]) <= SKETCH_TOLERANCE)) return false;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      if (j === i + 1 || i === 0 && j === points.length - 1) continue;
      const a = points[i], b = points[(i + 1) % points.length], c = points[j], d = points[(j + 1) % points.length];
      const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
      if (abC * abD < -SKETCH_TOLERANCE && cdA * cdB < -SKETCH_TOLERANCE) return false;
    }
  }
  return true;
}

function area(points: SketchPoint[]) {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2;
}

function polygonProfile(sketch: Sketch, id: string, geometryIds: string[], pointIds: string[], points: SketchPoint[]): ParametricSketchProfile | null {
  if (!polygonValid(points)) return null;
  const signedArea = area(points);
  if (Math.abs(signedArea) <= SKETCH_TOLERANCE * SKETCH_TOLERANCE) return null;
  return {
    id, sketchId: sketch.id, workPlane: sketch.workPlane, sourceGeometryIds: geometryIds,
    sourceTopologyIds: pointIds,
    boundary: points.map((start, index) => ({ kind: "line" as const, start, end: points[(index + 1) % points.length], topologyId: pointIds[index] })),
    signedArea, parentProfileId: null,
  };
}

/** Exact topology-first profile query. Mere screen/coordinate proximity never joins separate lines. */
export function recognizeSketchProfiles(sketch: Sketch): ParametricSketchProfile[] {
  const profiles: ParametricSketchProfile[] = [];
  const lineEdges: { id: string; geometryId: string; start: SketchPoint; end: SketchPoint; startKey: string; endKey: string }[] = [];
  const parent = new Map<string, string>();
  const root = (id: string): string => {
    const value = parent.get(id) ?? id;
    if (value === id) return id;
    const resolved = root(value);
    parent.set(id, resolved);
    return resolved;
  };
  for (const geometry of sketch.geometry) {
    if (geometry.kind === "line") {
      const startKey = `${geometry.id}/${geometry.startId}`;
      const endKey = `${geometry.id}/${geometry.endId}`;
      parent.set(startKey, startKey); parent.set(endKey, endKey);
      lineEdges.push({ id: geometry.segmentId, geometryId: geometry.id, start: geometry.start, end: geometry.end, startKey, endKey });
    } else if (geometry.kind === "rectangle") {
      const points = geometry.cornerIds.map((id) => sketchPoint(geometry, id)!) as SketchPoint[];
      const result = polygonProfile(sketch, `profile:${geometry.id}`, [geometry.id], geometry.edgeIds.map((id) => `${geometry.id}/${id}`), points);
      if (result) profiles.push(result);
    } else if (geometry.kind === "polyline" && geometry.closed) {
      const result = polygonProfile(sketch, `profile:${geometry.id}`, [geometry.id], geometry.segmentIds.map((id) => `${geometry.id}/${id}`), geometry.vertices.map((vertex) => vertex.point));
      if (result) profiles.push(result);
    } else if (geometry.kind === "circle" && geometry.radius > SKETCH_TOLERANCE) {
      profiles.push({ id: `profile:${geometry.id}`, sketchId: sketch.id, workPlane: sketch.workPlane,
        sourceGeometryIds: [geometry.id], sourceTopologyIds: [`${geometry.id}/${geometry.curveId}`],
        boundary: [{ kind: "circle", center: geometry.center, radius: geometry.radius, topologyId: `${geometry.id}/${geometry.curveId}` }],
        signedArea: Math.PI * geometry.radius * geometry.radius, parentProfileId: null });
    }
  }
  for (const constraint of sketch.constraints) {
    if (constraint.kind !== "coincident") continue;
    const first = key(constraint.first), second = key(constraint.second);
    if (parent.has(first) && parent.has(second)) parent.set(root(first), root(second));
  }
  // A valid line loop has degree exactly two at every topology vertex. Branches
  // and open chains are ignored rather than producing an ambiguous face.
  const adjacency = new Map<string, number[]>();
  lineEdges.forEach((edge, index) => {
    const start = root(edge.startKey), end = root(edge.endKey);
    adjacency.set(start, [...(adjacency.get(start) ?? []), index]);
    adjacency.set(end, [...(adjacency.get(end) ?? []), index]);
  });
  const visited = new Set<number>();
  for (let index = 0; index < lineEdges.length; index += 1) {
    if (visited.has(index)) continue;
    const stack = [index];
    const component = new Set<number>();
    while (stack.length) {
      const next = stack.pop()!;
      if (component.has(next)) continue;
      component.add(next);
      const edge = lineEdges[next];
      for (const vertex of [root(edge.startKey), root(edge.endKey)]) for (const connected of adjacency.get(vertex) ?? []) stack.push(connected);
    }
    component.forEach((edge) => visited.add(edge));
    if ([...component].some((edgeIndex) => {
      const edge = lineEdges[edgeIndex];
      return adjacency.get(root(edge.startKey))?.length !== 2 || adjacency.get(root(edge.endKey))?.length !== 2;
    })) continue;
    const ordered: typeof lineEdges = [];
    let current = index;
    let vertex = root(lineEdges[index].startKey);
    do {
      const edge = lineEdges[current];
      const forward = root(edge.startKey) === vertex;
      ordered.push(forward ? edge : { ...edge, start: edge.end, end: edge.start, startKey: edge.endKey, endKey: edge.startKey });
      vertex = root(forward ? edge.endKey : edge.startKey);
      const next = (adjacency.get(vertex) ?? []).find((candidate) => candidate !== current);
      if (next === undefined) break;
      current = next;
    } while (current !== index && ordered.length <= component.size);
    if (ordered.length !== component.size || current !== index || ordered.some((edge, edgeIndex) => distance(edge.end, ordered[(edgeIndex + 1) % ordered.length].start) > SKETCH_TOLERANCE)) continue;
    const ids = ordered.map((edge) => edge.id);
    const result = polygonProfile(sketch, `profile:${ids.slice().sort().join("|")}`, ordered.map((edge) => edge.geometryId), ordered.map((edge) => `${edge.geometryId}/${edge.id}`), ordered.map((edge) => edge.start));
    if (result) profiles.push(result);
  }
  return profiles;
}
