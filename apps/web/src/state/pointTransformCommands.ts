import type { CadDocument } from "@agent-webcad/cad-document";
import type { CadCommand } from "@agent-webcad/cad-commands";
import { WORK_PLANES, worldToPlane, type Vec3, type WorkPlaneId } from "../precision/workPlane";
import { getObjectTransform } from "../precision/objectTransform";
import { planGroupTransform } from "./selectionCommands";

export type PointTransformMode = "move" | "copy" | "rotate";
export function planPointTransform(document: CadDocument, ids: readonly string[], mode: PointTransformMode, base: Vec3, target: Vec3, angle: number, planeId: WorkPlaneId, sketchId?: string): CadCommand | null {
  if (!ids.length || ![...base, ...target, angle].every(Number.isFinite)) return null;
  const plane = WORK_PLANES[planeId];
  const elevation = (point: Vec3) => point.reduce((sum, value, index) => sum + value * plane.normal[index], 0);
  if (Math.abs(elevation(base)) > 1e-6 || Math.abs(elevation(target)) > 1e-6) return null;
  if (ids.some((id) => { const object = document.objects[id], layer = object && document.layers[object.layerId]; return !object?.visible || !layer?.visible || layer.locked; })) return null;
  const delta = target.map((value, index) => value - base[index]) as Vec3;
  if (mode !== "rotate" && Math.hypot(...delta) < 1e-9 || mode === "rotate" && Math.abs(angle) < 1e-9) return null;
  if (sketchId) {
    const sketch = document.sketches?.[sketchId];
    if (!sketch || sketch.workPlane !== planeId || ids.some((id) => !sketch.geometry.some((entry) => entry.id === id))) return null;
    return mode === "copy" ? { type: "duplicate-sketch-geometry", sketchId, geometryIds: [...ids], offset: worldToPlane(delta, plane) }
      : { type: "transform-sketch-geometry", sketchId, geometryIds: [...ids], translation: mode === "move" ? worldToPlane(delta, plane) : [0, 0], center: worldToPlane(base, plane), angle: mode === "rotate" ? angle * Math.PI / 180 : 0, scale: 1 };
  }
  if (ids.some((id) => Object.values(document.features).some((entry) => entry.output === id && entry.params.sketchId))) return null;
  const rotation = plane.normal.map((value) => value * angle) as Vec3;
  const commands = mode === "rotate" ? planGroupTransform(document, ids, "rotate", { translation: base, rotation, scale: [1, 1, 1] }, base)
    : ids.map((id): Exclude<CadCommand, { type: "batch" }> => mode === "copy" ? { type: "duplicate-object", objectId: id, offset: delta }
      : { type: "move-object", objectId: id, translation: getObjectTransform(document.objects[id], Object.values(document.features).find((entry) => entry.output === id)).translation.map((value, index) => value + delta[index]) as Vec3 });
  return commands?.length ? commands.length === 1 ? commands[0] : { type: "batch", label: `${mode} by points`, commands } : null;
}
