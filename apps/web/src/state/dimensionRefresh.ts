import type { CadDocument, CadFeature } from "@agent-webcad/cad-document";
import { dimensionSourceGeometry } from "../precision/dimensionSource";
import { worldToPlane, WORK_PLANES } from "../precision/workPlane";

/**
 * Associative dimension reconciliation.
 *
 * Runs once after a successful command (same revision, before the history
 * snapshot), re-deriving each linked dimension's measured points from the
 * current source geometry. Orientation/offset/angle/text are never touched,
 * so user annotations survive every refresh. Cases that cannot be re-derived
 * (rotated out of plane, non-uniform scale, deleted source) keep their last
 * snapshot; a deleted source additionally drops the link, freezing the
 * dimension as a static annotation. Undo/redo needs no hook: snapshots
 * already contain both sides consistently.
 */
export function refreshAssociativeDimensions(document: CadDocument): boolean {
  let refreshed = false;
  for (const feature of Object.values(document.features)) {
    if (feature.type !== "dimension") continue;
    const sourceId = feature.params.sourceObjectId;
    if (typeof sourceId !== "string") continue;
    const source = document.objects[sourceId];
    const sourceFeature = Object.values(document.features).find((entry) => entry.output === sourceId);
    if (!source || !sourceFeature) {
      // Source deleted: freeze as static, drop the dangling link.
      delete feature.params.sourceObjectId;
      delete feature.params.sourceSegmentId;
      feature.inputs = feature.inputs.filter(id => id !== sourceId);
      refreshed = true;
      continue;
    }
    if (recomputeDimension(feature, document, sourceId)) refreshed = true;
  }
  return refreshed;
}

function recomputeDimension(feature: CadFeature, document: CadDocument, sourceId: string): boolean {
  const source = document.objects[sourceId];
  const sourceFeature = Object.values(document.features).find((entry) => entry.output === sourceId);
  if (!source || !sourceFeature || sourceFeature.type !== "drawing") return false;
  const world = dimensionSourceGeometry(source, sourceFeature, typeof feature.params.sourceSegmentId === "string" ? feature.params.sourceSegmentId : undefined);
  if (!world) {
    if (feature.params.sourceSegmentId) throw new Error(`'${document.objects[feature.output]?.name ?? feature.output}' references an edge that this edit removes. Reconnect its dimension before replacing the edge.`);
    return false;
  }
  const plane = String(feature.params.workPlane ?? world.workPlane);
  const frame = WORK_PLANES[plane as keyof typeof WORK_PLANES] ?? WORK_PLANES[world.workPlane];
  const kind = String(feature.params.kind);
  if (feature.params.sourceSegmentId && (kind === "linear" ? !world.points : world.radius === undefined)) throw new Error(`'${document.objects[feature.output]?.name ?? feature.output}' needs its original straight or circular edge. Reconnect the dimension before changing the edge type.`);

  if (kind === "linear" && world.points?.length === 2) {
    const points = world.points.map((point) => worldToPlane(point, frame));
    if (JSON.stringify(feature.params.points) !== JSON.stringify(points)) {
      feature.params.points = points;
      return true;
    }
    return false;
  }
  if ((kind === "radius" || kind === "diameter") && world.center && world.radius !== undefined) {
    const center = worldToPlane(world.center, frame);
    if (JSON.stringify(feature.params.center) !== JSON.stringify(center) || feature.params.radius !== world.radius) {
      feature.params.center = center;
      feature.params.radius = world.radius;
      return true;
    }
  }
  return false;
}
