import type { CadDocument } from "@agent-webcad/cad-document";
import type { CadCommand } from "@agent-webcad/cad-commands";
import { WORK_PLANES, planeToWorld, worldToPlane, type WorkPlaneId, type Vec3 } from "../precision/workPlane";
import { boundsCenter, getSelectionWorldBounds } from "../precision/worldBounds";
import { getObjectTransform } from "../precision/objectTransform";
import { planGroupTransform } from "./selectionCommands";

type Mode = "translate" | "rotate" | "scale";
type Command = Exclude<CadCommand, { type: "batch" }>;
export function planPrecisionTransform(document: CadDocument, ids: string[], mode: Mode, value: number | number[], axis: 0 | 1 | 2 | null, planeId?: WorkPlaneId, sketchId?: string): { commands: Command[]; reason?: string } {
  const plane = planeId ? WORK_PLANES[planeId] : undefined;
  const normalAxis = plane?.normal.findIndex((value) => value !== 0) ?? 2;
  const localXAxis = plane?.xAxis.findIndex((value) => value !== 0) ?? 0;
  if (plane && axis !== null && ((mode === "rotate" && axis !== normalAxis) || (mode !== "rotate" && axis === normalAxis))) return { commands: [], reason: "2D transforms must stay in the active work plane." };
  const delta: Vec3 = [0, 0, 0], rotation: Vec3 = [0, 0, 0], scale: Vec3 = [1, 1, 1];
  if (mode === "translate") {
    if (Array.isArray(value)) {
      const vector = value.length === 2 && plane ? planeToWorld(value as [number, number], plane) : [value[0] ?? 0, value[1] ?? 0, value[2] ?? 0] as Vec3;
      if (plane && Math.abs(vector[normalAxis]) > 1e-9) return { commands: [], reason: "2D translation cannot leave the active work plane." };
      delta.splice(0, 3, ...vector);
    } else delta[axis ?? localXAxis] = value;
  } else if (mode === "rotate") rotation[axis ?? (plane ? normalAxis : 0)] = Number(value) * (plane ? plane.normal[normalAxis] : 1);
  else if (axis === null) scale.fill(Number(value)); else scale[axis] = Number(value);
  const bounds = getSelectionWorldBounds(document, ids);
  if (!bounds) return { commands: [], reason: "Selection has no editable geometry." };
  const pivot = boundsCenter(bounds);
  if (sketchId && plane) {
    if (axis !== null && mode === "scale") return { commands: [], reason: "Sketch scale is uniform. Enter a scale without an axis." };
    return { commands: [{ type: "transform-sketch-geometry", sketchId, geometryIds: ids, translation: worldToPlane(delta, plane), center: worldToPlane(pivot, plane), angle: mode === "rotate" ? Number(value) * Math.PI / 180 : 0, scale: mode === "scale" ? Number(value) : 1 }] };
  }
  if (ids.length > 1) return { commands: planGroupTransform(document, ids, mode, { translation: pivot.map((value, index) => value + delta[index]) as Vec3, rotation, scale }) ?? [] };
  const object = document.objects[ids[0]], feature = Object.values(document.features).find((entry) => entry.output === ids[0]);
  if (!object) return { commands: [] };
  const current = getObjectTransform(object, feature);
  return { commands: [mode === "translate" ? { type: "move-object", objectId: object.id, translation: current.translation.map((value, index) => value + delta[index]) as Vec3 } : mode === "rotate" ? { type: "rotate-object", objectId: object.id, rotation: current.rotation.map((value, index) => value + rotation[index]) as Vec3 } : { type: "scale-object", objectId: object.id, scale: current.scale.map((value, index) => value * scale[index]) as Vec3 }] };
}
