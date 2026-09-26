import type { Vec3 } from "../precision/workPlane";

export type ScreenPoint = { x: number; y: number };

export type BrepEdgePickable = {
  objectId: string;
  key: string;
  /** Edge sample points in the caller's coordinate frame (mesh callers pass world points). */
  points: Vec3[];
};

export type BrepFaceRange = {
  key: string;
  /** First triangle ordinal covered by this face. */
  start: number;
  /** Number of triangles covered by this face. */
  count: number;
};

export type BrepEdgeHit = {
  objectId: string;
  key: string;
  worldPoint: Vec3;
  distancePx: number;
};

function pointSegmentClosest(point: ScreenPoint, a: ScreenPoint, b: ScreenPoint): { point: ScreenPoint; distance: number; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1e-12) {
    return { point: { ...a }, distance: Math.hypot(point.x - a.x, point.y - a.y), t: 0 };
  }
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  const closest = { x: a.x + dx * t, y: a.y + dy * t };
  return { point: closest, distance: Math.hypot(point.x - closest.x, point.y - closest.y), t };
}

/**
 * Nearest solid edge to a screen cursor. Edges win over faces on ties, so
 * callers check edges before falling back to raycast face picking. Pure and
 * headless-testable; the viewport supplies projection.
 */
export function nearestBrepEdgeHit(
  edges: BrepEdgePickable[],
  project: (point: Vec3) => ScreenPoint,
  cursor: ScreenPoint,
  thresholdPx: number,
): BrepEdgeHit | null {
  let best: BrepEdgeHit | null = null;
  for (const edge of edges) {
    if (edge.points.length < 2) continue;
    const projected = edge.points.map(project);
    for (let index = 0; index < projected.length - 1; index += 1) {
      const hit = pointSegmentClosest(cursor, projected[index], projected[index + 1]);
      if (hit.distance <= thresholdPx && (!best || hit.distance < best.distancePx - 1e-9)) {
        const a = edge.points[index];
        const b = edge.points[index + 1];
        best = {
          objectId: edge.objectId,
          key: edge.key,
          worldPoint: [a[0] + (b[0] - a[0]) * hit.t, a[1] + (b[1] - a[1]) * hit.t, a[2] + (b[2] - a[2]) * hit.t],
          distancePx: hit.distance,
        };
      }
    }
  }
  return best;
}

/**
 * Maps a raycast triangle ordinal to its face key. Returns null outside all
 * ranges so unattributed triangles can never fabricate a face selection.
 */
export function brepFaceKeyAtOrdinal(ranges: BrepFaceRange[], ordinal: number | null | undefined): string | null {
  if (ordinal === null || ordinal === undefined || !Number.isInteger(ordinal) || ordinal < 0) return null;
  for (const range of ranges) {
    if (ordinal >= range.start && ordinal < range.start + range.count) return range.key;
  }
  return null;
}
