import type { CadDocument, CadFeature, CadObject } from "@agent-webcad/cad-document";
import { Euler, MathUtils, Quaternion, Vector3 } from "three";
import { getObjectTransform } from "./objectTransform";
import { WORK_PLANES, type WorkPlaneId } from "./workPlane";

const vectorKinds = new Set(["line", "polyline", "rectangle", "circle", "arc"]);

/** Ordinary root curves and hatches on a standard plane share a painter stack. */
function isOrderable(object: CadObject, feature: CadFeature, plane: WorkPlaneId) {
  const p = feature.params;
  if ((p.workPlane ?? "XY") !== plane || p.facePlaneId || p.faceFrame || p.construction ||
      p.modelProjection || p.modelSectionPresentation || p.modelSheet || p.modelDrawing) return false;
  if (feature.type === "drawing") {
    if (!vectorKinds.has(String(p.kind))) return false;
  } else if (feature.type !== "drafting" || p.kind !== "hatch") return false;
  const normal = new Vector3(...WORK_PLANES[plane].normal);
  const { rotation } = getObjectTransform(object, feature);
  const angles = rotation.map(MathUtils.degToRad) as [number, number, number];
  const rotated = normal.clone().applyQuaternion(new Quaternion().setFromEuler(new Euler(...angles)));
  return Math.abs(rotated.dot(normal)) > 1 - 1e-9;
}

export function drawingStack(document: CadDocument, plane: WorkPlaneId, ids = document.rootObjects) {
  const features = new Map(Object.values(document.features).map(feature => [feature.output, feature]));
  const roots = ids === document.rootObjects ? undefined : new Set(document.rootObjects);
  return ids.filter(id => {
    const feature = features.get(id), object = document.objects[id];
    return (!roots || roots.has(id)) && !!object && !!feature && isOrderable(object, feature, plane);
  }).sort((a, b) => (document.objects[a].drawOrder ?? 0) - (document.objects[b].drawOrder ?? 0));
}

/** Replace only stack members' slots, keeping other output items in place. */
export function drawingOutputOrder(document: CadDocument, plane: WorkPlaneId, ids = document.rootObjects) {
  if (!ids.some(id => document.objects[id]?.drawOrder)) return ids;
  const ordered = drawingStack(document, plane, ids);
  const members = new Set(ordered);
  let next = 0;
  return ids.map(id => members.has(id) ? ordered[next++] : id);
}
