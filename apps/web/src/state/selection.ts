import { cadDocument } from "./cadDocument";
import { getObjectTransform } from "./objectTransform";
import * as THREE from "three";
import { getWorldDrawingGeometry } from "../precision/worldGeometry";

export type TopologySelectionKind = "object" | "drawing-control" | "drawing-segment" | "drawing-curve" | "brep-edge" | "brep-face";
export type TopologySelectionRef = {
  objectId: string;
  kind: TopologySelectionKind;
  /** Stable document-owned identifier, never a Three.js vertex/index. */
  topologyId: string;
};
export type SelectionState = { ids: string[]; primaryId: string | null; subObjects?: TopologySelectionRef[] };

export function reduceSelection(state: SelectionState, objectId: string | null, additive = false): SelectionState {
  if (!objectId) return { ids: [], primaryId: null, subObjects: [] };
  if (!additive) return { ids: [objectId], primaryId: objectId, subObjects: [] };
  const ids = state.ids.includes(objectId) ? state.ids.filter((id) => id !== objectId) : [...state.ids, objectId];
  return { ids, primaryId: ids.includes(objectId) ? objectId : (ids.at(-1) ?? null), subObjects: state.subObjects?.filter((entry) => ids.includes(entry.objectId)) ?? [] };
}

export function validSelection(state: SelectionState): SelectionState {
  const ids = state.ids.filter((id) => {
    const object = cadDocument.objects[id];
    const layer = object ? cadDocument.layers[object.layerId] : undefined;
    return Boolean(object?.visible && layer?.visible && !layer.locked);
  });
  return { ids, primaryId: state.primaryId && ids.includes(state.primaryId) ? state.primaryId : (ids.at(-1) ?? null), subObjects: state.subObjects?.filter((entry) => ids.includes(entry.objectId)) ?? [] };
}

export function selectionBounds(state: SelectionState) {
  const worldPoints: THREE.Vector3[] = [];
  for (const id of state.ids) {
    const object = cadDocument.objects[id];
    if (!object) continue;
    const feature = Object.values(cadDocument.features).find((entry) => entry.output === id);
    const transform = getObjectTransform(object, feature);
    const p = feature?.params as Record<string, unknown> | undefined;
    const localPoints: THREE.Vector3[] = [];
    if (feature?.type === "drawing") {
      const world = getWorldDrawingGeometry(object, feature);
      if (world?.points) worldPoints.push(...world.points.map((point) => new THREE.Vector3(...point)));
      continue;
    } else {
      const kind = String(p?.kind ?? (p?.width !== undefined ? "box" : ""));
      const radius = Number(p?.radius ?? 0), height = Number(p?.height ?? 0), major = Number(p?.majorRadius ?? 0), minor = Number(p?.minorRadius ?? 0);
      let min = new THREE.Vector3(-0.5, -0.5, -0.5), max = new THREE.Vector3(0.5, 0.5, 0.5);
      if (kind === "box") { min.set(0, 0, 0); max.set(Number(p?.width), Number(p?.depth), Number(p?.height)); }
      else if (kind === "cylinder") { min.set(-radius, -radius, 0); max.set(radius, radius, height); }
      else if (kind === "sphere") { min.setScalar(-radius); max.setScalar(radius); }
      else if (kind === "cone") { const r = Math.max(Number(p?.radius1), Number(p?.radius2)); min.set(-r, -r, 0); max.set(r, r, height); }
      else if (kind === "torus") { const r = major + minor; min.set(-r, -r, -minor); max.set(r, r, minor); }
      for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) localPoints.push(new THREE.Vector3(x, y, z));
    }
    if (!localPoints.length) continue;
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(...transform.rotation.map(THREE.MathUtils.degToRad) as [number, number, number]));
    const origin = new THREE.Vector3();
    const matrix = new THREE.Matrix4().compose(origin.clone().add(new THREE.Vector3(...transform.translation)), rotation, new THREE.Vector3(...transform.scale)).multiply(new THREE.Matrix4().makeTranslation(-origin.x, -origin.y, -origin.z));
    worldPoints.push(...localPoints.map((point) => point.applyMatrix4(matrix)));
  }
  if (!worldPoints.length) return null;
  const bounds = new THREE.Box3().setFromPoints(worldPoints);
  return { min: bounds.min.toArray() as [number, number, number], max: bounds.max.toArray() as [number, number, number] };
}
