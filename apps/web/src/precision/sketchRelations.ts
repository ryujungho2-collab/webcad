import type { SketchConstraint, SketchGeometry, SketchPoint, SketchSegmentRef } from "@agent-webcad/cad-document";

export function sketchSegments(g: SketchGeometry): SketchSegmentRef[] {
  const ids = g.kind === "line" ? [g.segmentId] : g.kind === "polyline" ? g.segmentIds : g.kind === "rectangle" ? g.edgeIds : [];
  return ids.map(segmentId => ({ geometryId: g.id, segmentId }));
}

export function sketchAngleEdge(g: SketchGeometry | undefined, segmentId?: string): [SketchPoint, SketchPoint] | null {
  return segmentId && g ? sketchSegment(g, { geometryId: g.id, segmentId }) : g?.kind === "line" ? [g.start, g.end] : null;
}

/** Exact endpoints, including rotated rectangle and polyline edges. */
export function sketchSegment(g: SketchGeometry | undefined, ref: SketchSegmentRef): [SketchPoint, SketchPoint] | null {
  if (!g || g.id !== ref.geometryId) return null;
  if (g.kind === "line") return g.segmentId === ref.segmentId ? [g.start, g.end] : null;
  if (g.kind === "polyline") { const i = g.segmentIds.indexOf(ref.segmentId); return i < 0 ? null : [g.vertices[i].point, g.vertices[(i + 1) % g.vertices.length].point]; }
  if (g.kind === "rectangle") {
    const i = g.edgeIds.indexOf(ref.segmentId); if (i < 0) return null;
    const c = Math.cos(g.angle ?? 0), s = Math.sin(g.angle ?? 0);
    const point = (j: number): SketchPoint => { const [x, y] = [[0, 0], [g.width, 0], [g.width, g.height], [0, g.height]][j]; return [g.origin[0] + x * c - y * s, g.origin[1] + x * s + y * c]; };
    return [point(i), point((i + 1) % 4)];
  }
  return null;
}

/** Choose a nearby orientation once per solve, so unoriented relations work at 90°. */
export function relationAngleTargets(constraints: SketchConstraint[], geometry: Map<string, SketchGeometry>) {
  const targets = new Map<string, number>();
  for (const c of constraints) if (c.kind === "parallel" || c.kind === "perpendicular") {
    const a = sketchSegment(geometry.get(c.firstSegment.geometryId), c.firstSegment), b = sketchSegment(geometry.get(c.secondSegment.geometryId), c.secondSegment);
    if (!a || !b) continue;
    const ax = a[1][0] - a[0][0], ay = a[1][1] - a[0][1], bx = b[1][0] - b[0][0], by = b[1][1] - b[0][1];
    targets.set(c.id, c.kind === "parallel" ? ax * bx + ay * by >= 0 ? 0 : Math.PI : ax * by - ay * bx >= 0 ? Math.PI / 2 : -Math.PI / 2);
  }
  return targets;
}
