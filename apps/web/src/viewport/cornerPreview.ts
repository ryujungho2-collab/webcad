import type { CadDocument } from "@agent-webcad/cad-document";
import { editDrawingCornerParams } from "../features/drawing-editing/geometry/drawingOperations";

export type CornerPreviewTreatment = "fillet" | "chamfer";
export type CornerPreviewRequest = {
  objectId: string;
  controlId: string;
  treatment: CornerPreviewTreatment;
  distance: number;
};

/**
 * Pure preview resolution for corner treatments. Returns the exact params the
 * commit path would write (same function, same inputs) so preview and commit
 * can never disagree, or null when no preview is meaningful. Never mutates
 * the document; rendering stays transient in the viewport layer.
 */
export function resolveCornerPreview(
  document: CadDocument,
  request: CornerPreviewRequest,
): Record<string, unknown> | null {
  const object = document.objects[request.objectId];
  const feature = object
    ? Object.values(document.features).find((entry) => entry.output === object.id)
    : undefined;
  const layer = object ? document.layers[object.layerId] : undefined;
  if (!object || !feature || feature.type !== "drawing") return null;
  if (!object.visible || layer?.visible === false || layer?.locked) return null;
  if (!Number.isFinite(request.distance) || request.distance <= 1e-9) return null;
  if (request.treatment !== "fillet" && request.treatment !== "chamfer") return null;
  return editDrawingCornerParams(feature.params, request.controlId, request.treatment, request.distance);
}
