import type { CadDocument, CadFeature } from "@agent-webcad/cad-document";
import * as THREE from "three";
import { getObjectTransform } from "../state/objectTransform";
import { getWorldDrawingGeometry } from "./worldGeometry";

export type WorldBounds = {
  min: [number, number, number];
  max: [number, number, number];
};

function finiteWorldBounds(bounds: THREE.Box3): WorldBounds | null {
  const min = bounds.min.toArray();
  const max = bounds.max.toArray();
  return [...min, ...max].every(Number.isFinite) && min.every((value, index) => value <= max[index])
    ? { min, max }
    : null;
}

function primitiveLocalBounds(params: Record<string, unknown>): THREE.Box3 {
  const kind = String(params.kind ?? (params.width !== undefined ? "box" : ""));
  const radius = Number(params.radius ?? 0);
  const height = Number(params.height ?? 0);
  const major = Number(params.majorRadius ?? 0);
  const minor = Number(params.minorRadius ?? 0);
  const min = new THREE.Vector3(-0.5, -0.5, -0.5);
  const max = new THREE.Vector3(0.5, 0.5, 0.5);
  if (kind === "box") {
    min.set(0, 0, 0);
    max.set(Number(params.width), Number(params.depth), Number(params.height));
  } else if (kind === "cylinder") {
    min.set(-radius, -radius, 0);
    max.set(radius, radius, height);
  } else if (kind === "sphere") {
    min.setScalar(-radius);
    max.setScalar(radius);
  } else if (kind === "cone") {
    const coneRadius = Math.max(Number(params.radius1), Number(params.radius2));
    min.set(-coneRadius, -coneRadius, 0);
    max.set(coneRadius, coneRadius, height);
  } else if (kind === "torus") {
    const torusRadius = major + minor;
    min.set(-torusRadius, -torusRadius, -minor);
    max.set(torusRadius, torusRadius, minor);
  }
  return new THREE.Box3(min, max);
}

export function getObjectWorldBounds(document: CadDocument, objectId: string, featureByOutput?: ReadonlyMap<string, CadFeature>): WorldBounds | null {
  const object = document.objects[objectId];
  if (!object) return null;
  const feature = featureByOutput ? featureByOutput.get(objectId) : Object.values(document.features).find((entry) => entry.output === objectId);
  if (!feature) return null;
  if (feature.type === "drawing") {
    const world = getWorldDrawingGeometry(object, feature);
    if (!world?.points?.length) return null;
    const bounds = new THREE.Box3().setFromPoints(world.points.map((point) => new THREE.Vector3(...point)));
    return finiteWorldBounds(bounds);
  }

  if (feature.type === "extrude") {
    const profile = feature.params.profile as { normal?: [number, number, number]; segments?: Array<{ kind: string; start?: [number, number, number]; mid?: [number, number, number]; end?: [number, number, number]; center?: [number, number, number]; radius?: number; xAxis?: [number, number, number] }> } | undefined;
    const normal = profile?.normal;
    const extrusion = Number(feature.params.distance);
    if (!profile?.segments?.length || !normal || !Number.isFinite(extrusion)) return null;
    const points: THREE.Vector3[] = [];
    const push = (point: [number, number, number]) => {
      const base = new THREE.Vector3(...point);
      points.push(base, base.clone().addScaledVector(new THREE.Vector3(...normal), extrusion));
    };
    for (const segment of profile.segments) {
      if (segment.kind === "circle" && segment.center && segment.radius && segment.xAxis) {
        const n = new THREE.Vector3(...normal).normalize();
        const x = new THREE.Vector3(...segment.xAxis).normalize();
        const y = new THREE.Vector3().crossVectors(n, x).normalize();
        for (let index = 0; index < 32; index += 1) {
          const angle = Math.PI * 2 * index / 32;
          push(new THREE.Vector3(...segment.center).addScaledVector(x, Math.cos(angle) * segment.radius).addScaledVector(y, Math.sin(angle) * segment.radius).toArray());
        }
      } else {
        if (segment.start) push(segment.start);
        if (segment.mid) push(segment.mid);
        if (segment.end) push(segment.end);
      }
    }
    if (!points.length) return null;
    const local = new THREE.Box3().setFromPoints(points);
    const transform = getObjectTransform(object, feature);
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...transform.translation),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...transform.rotation.map(THREE.MathUtils.degToRad) as [number, number, number])),
      new THREE.Vector3(...transform.scale),
    );
    const corners: THREE.Vector3[] = [];
    for (const x of [local.min.x, local.max.x]) for (const y of [local.min.y, local.max.y]) for (const z of [local.min.z, local.max.z]) corners.push(new THREE.Vector3(x, y, z).applyMatrix4(matrix));
    const bounds = new THREE.Box3().setFromPoints(corners);
    return finiteWorldBounds(bounds);
  }

  const localBounds = primitiveLocalBounds(feature.params);
  const transform = getObjectTransform(object, feature);
  const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    ...transform.rotation.map(THREE.MathUtils.degToRad) as [number, number, number],
  ));
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...transform.translation),
    rotation,
    new THREE.Vector3(...transform.scale),
  );
  const points: THREE.Vector3[] = [];
  for (const x of [localBounds.min.x, localBounds.max.x]) {
    for (const y of [localBounds.min.y, localBounds.max.y]) {
      for (const z of [localBounds.min.z, localBounds.max.z]) {
        points.push(new THREE.Vector3(x, y, z).applyMatrix4(matrix));
      }
    }
  }
  const bounds = new THREE.Box3().setFromPoints(points);
  return finiteWorldBounds(bounds);
}

export function getSelectionWorldBounds(document: CadDocument, objectIds: readonly string[]): WorldBounds | null {
  const bounds = new THREE.Box3();
  let hasBounds = false;
  const featureByOutput = new Map(Object.values(document.features).map((feature) => [feature.output, feature]));
  for (const objectId of objectIds) {
    const object = document.objects[objectId];
    const layer = object ? document.layers[object.layerId] : undefined;
    if (!object?.visible || !layer?.visible || layer.locked) continue;
    const objectBounds = getObjectWorldBounds(document, objectId, featureByOutput);
    if (!objectBounds) continue;
    bounds.expandByPoint(new THREE.Vector3(...objectBounds.min));
    bounds.expandByPoint(new THREE.Vector3(...objectBounds.max));
    hasBounds = true;
  }
  return hasBounds ? finiteWorldBounds(bounds) : null;
}

/**
 * Local point around which the viewport applies an object's transform.
 * Solids currently use their model origin; drawing render objects use the
 * center of their untransformed geometry so TransformControls can rotate and
 * scale them without moving the authored CAD points.
 */
export function getObjectLocalTransformPivot(
  document: CadDocument,
  objectId: string,
  featureByOutput?: ReadonlyMap<string, CadFeature>,
): [number, number, number] | null {
  const object = document.objects[objectId];
  if (!object) return null;
  const feature = featureByOutput ? featureByOutput.get(objectId) : Object.values(document.features).find((entry) => entry.output === objectId);
  if (!feature) return null;
  if (feature.type !== "drawing") return [0, 0, 0];

  const localGeometry = getWorldDrawingGeometry({
    ...object,
    transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
  }, feature);
  if (!localGeometry?.points?.length) return null;
  return new THREE.Box3()
    .setFromPoints(localGeometry.points.map((point) => new THREE.Vector3(...point)))
    .getCenter(new THREE.Vector3())
    .toArray() as [number, number, number];
}

/** World position of the object transform pivot, not merely its stored delta. */
export function getObjectWorldTransformPivot(
  document: CadDocument,
  objectId: string,
  featureByOutput?: ReadonlyMap<string, CadFeature>,
): [number, number, number] | null {
  const object = document.objects[objectId];
  if (!object) return null;
  const feature = featureByOutput ? featureByOutput.get(objectId) : Object.values(document.features).find((entry) => entry.output === objectId);
  const localPivot = getObjectLocalTransformPivot(document, objectId, featureByOutput);
  if (!feature || !localPivot) return null;
  const transform = getObjectTransform(object, feature);
  return localPivot.map((value, index) => value + transform.translation[index]) as [number, number, number];
}

export function boundsCenter(bounds: WorldBounds): [number, number, number] {
  return [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
}
