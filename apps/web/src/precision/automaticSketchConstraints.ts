import type { Sketch, SketchConstraint, SketchGeometry, SketchPoint, SketchPointRef } from "@agent-webcad/cad-document";
import { geometryPointIds } from "./sketchEditing";
import { sketchPoint } from "./sketchSolver";
import { worldToPlane } from "./workPlane";
import { sketchPlane } from "./sketchAdapter";
import type { SnapResult } from "./snapEngine";

export type SketchSnapBinding = { point: SketchPoint; target: SketchPointRef };
/** Only an explicit endpoint/centre snap can create a persistent join. */
export function sketchSnapBinding(sketch: Sketch, snap: SnapResult | null): SketchSnapBinding | null {
  if (!snap?.objectId || !["endpoint", "center"].includes(snap.type)) return null;
  const geometry = sketch.geometry.find((entry) => entry.id === snap.objectId);
  if (!geometry) return null;
  const local = worldToPlane(snap.point, sketchPlane(sketch));
  const pointId = geometryPointIds(geometry).find((id) => {
    if (snap.type === "center" && (!("centerId" in geometry) || id !== geometry.centerId)) return false;
    const p = sketchPoint(geometry, id); return p && Math.hypot(p[0] - local[0], p[1] - local[1]) <= 1e-6;
  });
  return pointId ? { point: local, target: { geometryId: geometry.id, pointId } } : null;
}
export function inferSketchConstraints(sketch: Sketch, geometry: SketchGeometry, bindings: readonly SketchSnapBinding[] = []): SketchConstraint[] {
  const result: SketchConstraint[] = [];
  const ids = geometryPointIds(geometry);
  for (const binding of bindings) {
    if (!sketch.geometry.some((entry) => entry.id === binding.target.geometryId)) continue;
    const pointId = ids.find((id) => { const p = sketchPoint(geometry, id); return p && Math.hypot(p[0] - binding.point[0], p[1] - binding.point[1]) < 1e-6; });
    if (!pointId || result.some((entry) => entry.kind === "coincident" && entry.first.pointId === pointId && entry.second.pointId === binding.target.pointId)) continue;
    result.push({ id: `${geometry.id}:auto:join:${result.length}`, kind: "coincident", first: { geometryId: geometry.id, pointId }, second: binding.target });
  }
  if (geometry.kind === "line" || geometry.kind === "polyline") {
    const points = ids.map((id) => sketchPoint(geometry, id)!);
    const count = geometry.kind === "polyline" && geometry.closed ? points.length : points.length - 1;
    for (let index = 0; index < count; index++) {
      const next = (index + 1) % points.length, dx = points[next][0] - points[index][0], dy = points[next][1] - points[index][1];
      const kind = Math.abs(dy) < 1e-6 && Math.abs(dx) > 1e-6 ? "horizontal" : Math.abs(dx) < 1e-6 && Math.abs(dy) > 1e-6 ? "vertical" : null;
      if (kind) result.push({ id: `${geometry.id}:auto:${kind}:${index}`, kind, first: { geometryId: geometry.id, pointId: ids[index] }, second: { geometryId: geometry.id, pointId: ids[next] } });
    }
  }
  return result;
}
