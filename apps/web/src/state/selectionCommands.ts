import type { CadCommand } from "@agent-webcad/cad-commands";
import type { CadDocument } from "@agent-webcad/cad-document";
import * as THREE from "three";
import { boundsCenter, getObjectWorldBounds, getSelectionWorldBounds } from "../precision/worldBounds";
import { WORK_PLANES, type WorkPlaneId } from "../precision/workPlane";
import { getObjectTransform } from "./objectTransform";

export type TransformMode = "translate" | "rotate" | "scale";
export type TransformValue = {
  translation: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
};
export type ArrangeMode = "left" | "center-x" | "right" | "top" | "center-y" | "bottom";
export type BatchChildCommand = Exclude<CadCommand, { type: "batch" }>;
export type BulkTransformValues = [number | null, number | null, number | null];

const EPSILON = 1e-9;
const changedVector = (next: [number, number, number], current: [number, number, number]) =>
  next.some((value, index) => Math.abs(value - current[index]) > EPSILON);

function featureForObject(document: CadDocument, objectId: string) {
  return Object.values(document.features).find((entry) => entry.output === objectId);
}

function allEditable(document: CadDocument, objectIds: readonly string[]) {
  return objectIds.length > 0 && objectIds.every((id) => {
    const object = document.objects[id];
    const layer = object ? document.layers[object.layerId] : undefined;
    return Boolean(object?.visible && layer?.visible && !layer.locked && featureForObject(document, id));
  });
}

/**
 * Plan an Inspector bulk-property edit. A provided axis is an absolute object
 * property value; `null` preserves that member's current value. This is
 * intentionally different from the viewport group gizmo, whose values are a
 * shared pivot/delta transform.
 */
export function planBulkTransformEdit(
  document: CadDocument,
  objectIds: readonly string[],
  mode: TransformMode,
  values: BulkTransformValues,
): BatchChildCommand[] | null {
  if (!allEditable(document, objectIds)) return null;
  if (values.every((value) => value === null)) return [];
  if (values.some((value) => value !== null && !Number.isFinite(value))) return null;
  if (mode === "scale" && values.some((value) => value !== null && value <= 0)) return null;

  const commands: BatchChildCommand[] = [];
  for (const id of objectIds) {
    const object = document.objects[id];
    const feature = featureForObject(document, id);
    const current = getObjectTransform(object, feature);
    const key = mode === "translate" ? "translation" : mode === "rotate" ? "rotation" : "scale";
    const next = current[key].map((value, index) => values[index] ?? value) as [number, number, number];
    if (!changedVector(next, current[key])) continue;
    if (mode === "translate") commands.push({ type: "move-object", objectId: id, translation: next });
    else if (mode === "rotate") commands.push({ type: "rotate-object", objectId: id, rotation: next });
    else commands.push({ type: "scale-object", objectId: id, scale: next });
  }
  return commands;
}

function workPlaneDimensions(workPlane: WorkPlaneId): [number, number] {
  const plane = WORK_PLANES[workPlane];
  const dominantAxis = (axis: [number, number, number]) => {
    const values = axis.map(Math.abs);
    return values.indexOf(Math.max(...values));
  };
  return [dominantAxis(plane.xAxis), dominantAxis(plane.yAxis)];
}

export function planGroupTransform(
  document: CadDocument,
  objectIds: readonly string[],
  mode: TransformMode,
  transform: TransformValue,
): BatchChildCommand[] | null {
  if (objectIds.length < 2 || !allEditable(document, objectIds)) return null;
  const bounds = getSelectionWorldBounds(document, objectIds);
  if (!bounds) return null;
  const pivot = boundsCenter(bounds);
  const pivotVector = new THREE.Vector3(...pivot);
  const translationDelta = new THREE.Vector3(
    transform.translation[0] - pivot[0],
    transform.translation[1] - pivot[1],
    transform.translation[2] - pivot[2],
  );
  const rotationDelta = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    ...transform.rotation.map(THREE.MathUtils.degToRad) as [number, number, number],
  ));
  const scaleDelta = new THREE.Vector3(...transform.scale);
  const commands: BatchChildCommand[] = [];

  for (const id of objectIds) {
    const object = document.objects[id];
    const feature = featureForObject(document, id);
    const current = getObjectTransform(object, feature);
    const relative = new THREE.Vector3(...current.translation).sub(pivotVector);
    if (mode === "rotate") relative.applyQuaternion(rotationDelta);
    if (mode === "scale") relative.multiply(scaleDelta);
    const transformedPosition = relative.add(pivotVector);
    const position = mode === "translate"
      ? new THREE.Vector3(...current.translation).add(translationDelta).toArray()
      : transformedPosition.toArray();
    if (changedVector(position, current.translation)) {
      commands.push({ type: "move-object", objectId: id, translation: position });
    }
    if (mode === "rotate") {
      // World-space group rotation composes before each member's existing
      // orientation. Adding Euler components gives the wrong result whenever
      // that member is already rotated about another axis.
      const currentQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(
        ...current.rotation.map(THREE.MathUtils.degToRad) as [number, number, number],
      ));
      const composed = new THREE.Euler().setFromQuaternion(rotationDelta.clone().multiply(currentQuaternion));
      const rotation = [composed.x, composed.y, composed.z].map((value) =>
        Math.abs(value) < EPSILON ? 0 : THREE.MathUtils.radToDeg(value)
      ) as [number, number, number];
      if (changedVector(rotation, current.rotation)) commands.push({ type: "rotate-object", objectId: id, rotation });
    }
    if (mode === "scale") {
      const scale = current.scale.map((value, index) => value * transform.scale[index]) as [number, number, number];
      if (changedVector(scale, current.scale)) commands.push({ type: "scale-object", objectId: id, scale });
    }
  }
  return commands;
}

export function planAlignment(
  document: CadDocument,
  objectIds: readonly string[],
  mode: ArrangeMode,
  workPlane: WorkPlaneId,
): BatchChildCommand[] | null {
  if (objectIds.length < 2 || !allEditable(document, objectIds)) return null;
  const selectionBounds = getSelectionWorldBounds(document, objectIds);
  if (!selectionBounds) return null;
  const [horizontalDimension, verticalDimension] = workPlaneDimensions(workPlane);
  const dimension = mode === "left" || mode === "center-x" || mode === "right"
    ? horizontalDimension
    : verticalDimension;
  const commands: BatchChildCommand[] = [];

  for (const id of objectIds) {
    const object = document.objects[id];
    const feature = featureForObject(document, id);
    const objectBounds = getObjectWorldBounds(document, id);
    if (!object || !objectBounds) return null;
    const transform = getObjectTransform(object, feature);
    const delta = mode === "left" || mode === "bottom"
      ? selectionBounds.min[dimension] - objectBounds.min[dimension]
      : mode === "right" || mode === "top"
        ? selectionBounds.max[dimension] - objectBounds.max[dimension]
        : (selectionBounds.min[dimension] + selectionBounds.max[dimension] - objectBounds.min[dimension] - objectBounds.max[dimension]) / 2;
    const translation = [...transform.translation] as [number, number, number];
    translation[dimension] += delta;
    if (changedVector(translation, transform.translation)) {
      commands.push({ type: "move-object", objectId: id, translation });
    }
  }
  return commands;
}

export function planDistribution(
  document: CadDocument,
  objectIds: readonly string[],
  axis: "horizontal" | "vertical",
  workPlane: WorkPlaneId,
): BatchChildCommand[] | null {
  if (objectIds.length < 3 || !allEditable(document, objectIds)) return null;
  const dimensions = workPlaneDimensions(workPlane);
  const dimension = axis === "horizontal" ? dimensions[0] : dimensions[1];
  const entries = objectIds.map((id) => {
    const object = document.objects[id];
    const feature = featureForObject(document, id);
    const bounds = getObjectWorldBounds(document, id);
    if (!object || !bounds) return null;
    const transform = getObjectTransform(object, feature);
    return {
      id,
      transform,
      center: (bounds.min[dimension] + bounds.max[dimension]) / 2,
    };
  });
  if (entries.some((entry) => !entry)) return null;
  const sorted = entries.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  sorted.sort((a, b) => a.center - b.center || a.id.localeCompare(b.id));
  const first = sorted[0].center;
  const last = sorted.at(-1)!.center;
  const step = (last - first) / (sorted.length - 1);
  return sorted.flatMap((entry, index) => {
    const translation = [...entry.transform.translation] as [number, number, number];
    translation[dimension] += first + step * index - entry.center;
    return changedVector(translation, entry.transform.translation)
      ? [{ type: "move-object" as const, objectId: entry.id, translation }]
      : [];
  });
}
