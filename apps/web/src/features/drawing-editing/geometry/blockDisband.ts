import * as THREE from "three";
import type { CadDocument, CadObjectTransform } from "@agent-webcad/cad-document";
import { getObjectTransform } from "../../../precision/objectTransform";
import { getWorldDrawingGeometry } from "../../../precision/worldGeometry";
import { validDraftingParams } from "../../../precision/draftingGeometry";
import { WORK_PLANES, type Vec3, type WorkPlaneId } from "../../../precision/workPlane";

export const MAX_DISBAND_OUTPUTS = 4096;

export type DisbandedMember = {
  layerId: string;
  type: "drawing" | "drafting";
  /** Defined for drawing members; nested instances keep kind "block" in params. */
  drawing?: "line" | "polyline" | "rectangle" | "circle" | "arc" | "point" | "infinite-line" | "ray";
  params: Record<string, unknown>;
  /** Placement for nested instances; baked world params use identity. */
  transform?: CadObjectTransform;
  label: string;
};

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** Origin-pivot placement matrix, the same frame drafting rendering uses. */
function placementMatrix(transform: CadObjectTransform): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...transform.translation),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...transform.rotation.map(THREE.MathUtils.degToRad) as [number, number, number])),
    new THREE.Vector3(...transform.scale),
  );
}

const applyMatrix = (matrix: THREE.Matrix4, point: Vec3): Vec3 =>
  new THREE.Vector3(...point).applyMatrix4(matrix).toArray() as Vec3;

type PlaneFrame = { scale: number; uniform: boolean; orientation: 1 | -1; rotationDeg: number };

/** In-plane scale, mirror orientation and rigid rotation of an affine placement. */
function planeFrame(matrix: THREE.Matrix4, plane: WorkPlaneId): PlaneFrame {
  const origin = applyMatrix(matrix, [0, 0, 0]);
  const sub = (point: Vec3): Vec3 => { const v = applyMatrix(matrix, point); return [v[0] - origin[0], v[1] - origin[1], v[2] - origin[2]]; };
  const { xAxis, yAxis, normal } = WORK_PLANES[plane];
  const ex = sub([xAxis[0], xAxis[1], xAxis[2]]), ey = sub([yAxis[0], yAxis[1], yAxis[2]]);
  const sx = Math.hypot(ex[0], ex[1], ex[2]), sy = Math.hypot(ey[0], ey[1], ey[2]);
  const dotXY = ex[0]*ey[0] + ex[1]*ey[1] + ex[2]*ey[2];
  const inPlane = (axis:Vec3, length:number) => Math.abs(axis[0]*normal[0] + axis[1]*normal[1] + axis[2]*normal[2]) <= 1e-9*length;
  const cross: Vec3 = [ex[1] * ey[2] - ex[2] * ey[1], ex[2] * ey[0] - ex[0] * ey[2], ex[0] * ey[1] - ex[1] * ey[0]];
  const dot = cross[0] * normal[0] + cross[1] * normal[1] + cross[2] * normal[2];
  const exU: [number, number] = [ex[0] * xAxis[0] + ex[1] * xAxis[1] + ex[2] * xAxis[2], ex[0] * yAxis[0] + ex[1] * yAxis[1] + ex[2] * yAxis[2]];
  return {
    scale: sx,
    uniform: sx > 1e-9 && Math.abs(sx - sy) <= 1e-9 * Math.max(1, sx, sy)
      && Math.abs(dotXY) <= 1e-9*sx*sy && inPlane(ex,sx) && inPlane(ey,sy),
    orientation: dot < 0 ? -1 : 1,
    rotationDeg: sx > 1e-9 ? Math.atan2(exU[1], exU[0]) * 180 / Math.PI : 0,
  };
}

function decomposePlacement(matrix: THREE.Matrix4): CadObjectTransform {
  const position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3();
  matrix.decompose(position, quaternion, scale);
  const euler = new THREE.Euler().setFromQuaternion(quaternion, "XYZ");
  const transform: CadObjectTransform = {
    translation: position.toArray() as Vec3,
    rotation: [euler.x, euler.y, euler.z].map(THREE.MathUtils.radToDeg) as Vec3,
    scale: scale.toArray() as Vec3,
  };
  const restored = placementMatrix(transform);
  if (matrix.elements.some((v,i)=>!Number.isFinite(v)||Math.abs(v-restored.elements[i])>1e-9*Math.max(1,Math.abs(v))))
    throw new Error("This nested affine placement contains shear and cannot be preserved as rotation and scale. Use recursive disband for supported straight members.");
  return transform;
}

/** World-baked member outputs for one block instance. Pure: never mutates the document.
 * The definition, sibling instances and all referencing relationships stay intact;
 * callers reject referenced instances before committing a replacement. */
export function disbandBlockMembers(document: CadDocument, objectId: string, recursive: boolean): DisbandedMember[] {
  const object = document.objects[objectId];
  const feature = Object.values(document.features).find(entry => entry.output === objectId);
  const layer = object && document.layers[object.layerId];
  if (!object || !feature || feature.type !== "drafting" || feature.params.kind !== "block")
    throw new Error("Select one placed block instance to disband.");
  if (!object.visible || !layer?.visible || layer.locked)
    throw new Error(`Show and unlock '${object.name}' and its layer before disbanding.`);
  if (feature.pattern) throw new Error("Detach the pattern before disbanding an instance.");
  if (feature.params.sketchId) throw new Error("This instance belongs to a sketch. Edit it through its sketch.");
  const blockId = String(feature.params.blockId ?? "");
  const block = document.blocks?.[blockId];
  if (!block) throw new Error("The instance's block definition no longer exists. Remove the orphan instance first.");
  if (Object.values(document.parameterBindings ?? {}).some(binding => binding.target.kind === "feature" && binding.target.objectId === objectId))
    throw new Error(`'${object.name}' is driven by an expression. Remove its binding before disbanding.`);
  for (const other of Object.values(document.features)) {
    if (other.output === objectId) continue;
    const ids = [...other.inputs, String(other.params.sourceObjectId ?? ""), ...(Array.isArray(other.params.sourceObjectIds) ? other.params.sourceObjectIds.map(String) : [])];
    if (ids.includes(objectId)) throw new Error(`'${document.objects[other.output]?.name ?? other.output}' references this instance. Edit an independent copy or remove that relationship before disbanding.`);
    if (other.pattern && (other.pattern.sourceObjectIds.includes(objectId) || other.pattern.sourceId === objectId))
      throw new Error("Detach the pattern before disbanding an instance.");
  }
  for (const scene of Object.values(document.scenes ?? {})) {
    const member = scene.objectIds.includes(objectId) || scene.states.some(state => state.hiddenObjectIds.includes(objectId))
      || scene.links.some(link => link.objectId === objectId) || scene.tracks.some(track => track.objectId === objectId);
    if (member) throw new Error(`This instance belongs to scene '${scene.name}'. Reassign or remove that scene relationship before disbanding.`);
  }
  const placement = placementMatrix(getObjectTransform(object, feature));
  const outputs: DisbandedMember[] = [];
  const expand = (definitionId: string, accumulated: THREE.Matrix4, path: string[]) => {
    const definition = document.blocks?.[definitionId];
    if (!definition) throw new Error("A nested block definition no longer exists. Remove the orphan instance first.");
    definition.members.forEach((member, index) => {
      if (outputs.length >= MAX_DISBAND_OUTPUTS) throw new Error(`Disband fewer nested elements at a time (maximum ${MAX_DISBAND_OUTPUTS} outputs).`);
      const layerId = document.layers[member.layerId] ? member.layerId : object.layerId;
      if (document.layers[layerId]?.locked) throw new Error(`Unlock layer '${document.layers[layerId].name}' before restoring its members.`);
      const label = `${String(member.params.kind)} ${index + 1}`;
      if (member.type === "drafting" && String(member.params.kind) === "block") {
        const nestedId = String(member.params.blockId ?? "");
        if (path.includes(nestedId)) throw new Error("Nested blocks contain a reference cycle. Remove the cyclic reference first.");
        const composed = accumulated.clone().multiply(placementMatrix(member.transform));
        if (recursive) expand(nestedId, composed, [...path, nestedId]);
        else {
          const nested = document.blocks?.[nestedId];
          if (!nested) throw new Error("A nested block definition no longer exists. Remove the orphan instance first.");
          outputs.push({ layerId, type: "drafting", params: { kind: "block", blockId: nestedId, workPlane: nested.workPlane }, transform: decomposePlacement(composed), label });
        }
        return;
      }
      outputs.push(disbandMember(member.type, { ...structuredClone(member.params) }, member.transform, accumulated, block.workPlane, layerId, label));
    });
  };
  expand(blockId, placement, [blockId]);
  if (!outputs.length) throw new Error("This block has no disbandable members.");
  return outputs;
}

function disbandMember(
  memberType: "drawing" | "drafting",
  params: Record<string, unknown>,
  relative: CadObjectTransform,
  accumulated: THREE.Matrix4,
  plane: WorkPlaneId,
  layerId: string,
  label: string,
): DisbandedMember {
  if (memberType === "drawing") {
    const world = getWorldDrawingGeometry(
      { id: "member", geometryId: "member", name: "member", visible: true, layerId, transform: relative } as never,
      { id: "member", type: "drawing", inputs: [], output: "member", params } as never,
    );
    if (!world || !world.planeAligned) throw new Error(`A '${String(params.kind)}' member uses a tilted or scaled plane. Flatten its transform before disbanding.`);
    const kind = String(params.kind);
    const map = (point: Vec3) => applyMatrix(accumulated, point);
    if (kind === "point" || kind === "infinite-line" || kind === "ray") {
      if (!world.points?.length) throw new Error(`A '${kind}' member has no points to restore.`);
      return { layerId, type: "drawing", drawing: kind as DisbandedMember["drawing"], params: { ...params, points: world.points.map(map) }, label };
    }
    if (kind === "line") {
      const segment = world.profileSegments?.[0];
      const points = segment ? [map(segment.start), map(segment.end)] : world.points?.map(map);
      if (!points || points.length !== 2) throw new Error("A 'line' member has no endpoints to restore.");
      return { layerId, type: "drawing", drawing: "line", params: { ...params, points }, label };
    }
    const frame = planeFrame(accumulated, plane);
    if (kind === "circle") {
      if (!frame.uniform || !world.center || world.radius === undefined) throw new Error("A 'circle' member uses non-uniform scale and cannot stay a circle. Use uniform placement or replace it first.");
      return { layerId, type: "drawing", drawing: "circle", params: { ...params, center: map(world.center), radius: world.radius * frame.scale }, label };
    }
    if (kind === "arc") {
      if (!frame.uniform || !world.center || world.radius === undefined || world.startAngle === undefined || world.endAngle === undefined || !world.points?.length)
        throw new Error("An 'arc' member uses non-uniform scale and cannot stay an arc. Use uniform placement or replace it first.");
      const center = map(world.center);
      const [u, v] = planeAngle(map(world.points[0]), center, plane);
      const startAngle = Math.atan2(v, u);
      const sweep = (world.endAngle - world.startAngle) * frame.orientation;
      return { layerId, type: "drawing", drawing: "arc", params: { ...params, center, radius: world.radius * frame.scale, startAngle, endAngle: startAngle + sweep }, label };
    }
    if (kind === "polyline" || kind === "rectangle") {
      const segments = world.profileSegments;
      if (!segments?.length) throw new Error(`A '${kind}' member has no segments to restore.`);
      if (!frame.uniform && segments.some(segment => segment.kind === "arc"))
        throw new Error("A curved member uses non-uniform scale and cannot stay exact. Use uniform placement or replace it first.");
      const points = segments.map(segment => map(segment.start));
      points.push(map(segments.at(-1)!.end));
      const bulges = segments.map(segment => segment.kind === "arc" ? Math.tan((segment.endAngle! - segment.startAngle!) * frame.orientation / 4) : 0);
      const nextKind = kind === "rectangle" && frame.uniform && segments.every(segment => segment.kind === "line") ? "rectangle" : "polyline";
      return { layerId, type: "drawing", drawing: nextKind as DisbandedMember["drawing"], params: { ...params, kind: nextKind, points, bulges, closed: world.closed }, label };
    }
    throw new Error(`A '${kind}' member cannot be disbanded to standalone geometry.`);
  }
  if (String(params.kind) === "text" && Array.isArray(params.point) && finite(params.height)) {
    const total = accumulated.clone().multiply(placementMatrix(relative));
    const frame = planeFrame(total, plane);
    if (!frame.uniform) throw new Error("A text member uses non-uniform scale and cannot keep its height. Use uniform placement first.");
    const next = { ...params, point: applyMatrix(total, params.point as Vec3), height: Number(params.height) * frame.scale, angle: Number(params.angle ?? 0) + frame.rotationDeg };
    if (!validDraftingParams(next)) throw new Error("A text member cannot be restored to valid standalone text.");
    return { layerId, type: "drafting", params: next, label };
  }
  if (String(params.kind) === "chain" && Array.isArray(params.points)) {
    const total = accumulated.clone().multiply(placementMatrix(relative));
    const frame = planeFrame(total, plane);
    if (!frame.uniform) throw new Error("A chain member uses non-uniform scale. Use uniform placement first.");
    const next: Record<string, unknown> = { ...params, points: (params.points as Vec3[]).map(point => applyMatrix(total, point)), offset: Number(params.offset) * frame.scale, height: Number(params.height) * frame.scale };
    delete next.sourceObjectId;
    if (!validDraftingParams(next)) throw new Error("A chain member cannot be restored to valid standalone annotation.");
    return { layerId, type: "drafting", params: next, label };
  }
  throw new Error(`A '${String(params.kind)}' member cannot be disbanded to standalone geometry yet. Replace it before disbanding.`);
}

/** In-plane angle pair for atan2 spread. */
function planeAngle(point: Vec3, center: Vec3, plane: WorkPlaneId): [number, number] {
  const { xAxis, yAxis } = WORK_PLANES[plane];
  const dx = point[0] - center[0], dy = point[1] - center[1], dz = point[2] - center[2];
  return [dx * xAxis[0] + dy * xAxis[1] + dz * xAxis[2], dx * yAxis[0] + dy * yAxis[1] + dz * yAxis[2]];
}
