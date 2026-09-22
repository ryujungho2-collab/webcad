import type { CadDocument } from "@agent-webcad/cad-document";
import * as THREE from "three";
import { getObjectTransform } from "../state/objectTransform";
import { getWorldDrawingGeometry } from "./worldGeometry";

export type WorldBounds = {
  min: [number, number, number];
  max: [number, number, number];
};

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

export function getObjectWorldBounds(document: CadDocument, objectId: string): WorldBounds | null {
  const object = document.objects[objectId];
  if (!object) return null;
  const feature = Object.values(document.features).find((entry) => entry.output === objectId);
  if (!feature) return null;
  if (feature.type === "drawing") {
    const world = getWorldDrawingGeometry(object, feature);
    if (!world?.points?.length) return null;
    const bounds = new THREE.Box3().setFromPoints(world.points.map((point) => new THREE.Vector3(...point)));
    return { min: bounds.min.toArray(), max: bounds.max.toArray() };
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
  return { min: bounds.min.toArray(), max: bounds.max.toArray() };
}

export function getSelectionWorldBounds(document: CadDocument, objectIds: readonly string[]): WorldBounds | null {
  const bounds = new THREE.Box3();
  let hasBounds = false;
  for (const objectId of objectIds) {
    const objectBounds = getObjectWorldBounds(document, objectId);
    if (!objectBounds) continue;
    bounds.expandByPoint(new THREE.Vector3(...objectBounds.min));
    bounds.expandByPoint(new THREE.Vector3(...objectBounds.max));
    hasBounds = true;
  }
  return hasBounds ? { min: bounds.min.toArray(), max: bounds.max.toArray() } : null;
}

export function boundsCenter(bounds: WorldBounds): [number, number, number] {
  return [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
}
