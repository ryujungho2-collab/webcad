import { Euler, MathUtils, Vector3 } from "three";
import type { ArchitectureWall, CadDocument } from "@agent-webcad/cad-document";
import { getObjectTransform } from "../precision/objectTransform";
import { wallFootprint } from "../precision/architectureWall";
import type { Vec3 } from "../precision/workPlane";
import type { CopilotPlan } from "./copilotPlan";

export type WallMoveAxis = "X" | "Y" | "Z" | "along" | "normal";
export const WALL_MOVE_AXES: Record<WallMoveAxis, string> = { X: "월드 X", Y: "월드 Y", Z: "월드 Z", along: "벽 길이 방향 (시작 → 끝)", normal: "벽 직각 방향 (시작 → 끝 기준 왼쪽)" };

/** Move the host placement, including its openings, without moving a shared reference source. */
export function wallMovePlan(document: CadDocument, objectId: string, axis: WallMoveAxis, distance: number, refreshDrawings = true): CopilotPlan {
  const object = document.objects[objectId], feature = Object.values(document.features).find(f => f.output === objectId), layer = object && document.layers[object.layerId];
  const definition = feature?.params.architecturalWall as ArchitectureWall | undefined;
  if (!object?.visible || !definition || !layer?.visible || layer.locked || !document.rootObjects.includes(objectId) || feature!.pattern || feature!.construction || feature!.params.componentContent) throw Error("이동할 독립된 벽 하나를 선택하고 객체와 레이어의 표시·잠금을 확인하세요.");
  if (!Object.hasOwn(WALL_MOVE_AXES, axis) || !Number.isFinite(distance) || Math.abs(distance) > 1e6 || Math.abs(distance) < 1e-6) throw Error("0이 아닌 이동 거리를 ±1000000 mm 범위로 입력하세요.");
  const transform = getObjectTransform(object, feature);
  if (!transform.scale.every(v => v === 1)) throw Error("벽의 배율을 1로 복원한 뒤 이동하세요.");
  let direction: Vec3;
  if (axis === "along" || axis === "normal") {
    const frame = wallFootprint(document, definition).frame;
    if (!frame) throw Error("이 벽 윤곽은 길이·직각 방향이 유일하지 않습니다. 월드 X/Y/Z 방향을 지정하세요.");
    direction = new Vector3(...(axis === "along" ? frame.u : frame.v)).applyEuler(new Euler(...transform.rotation.map(MathUtils.degToRad) as Vec3)).normalize().toArray() as Vec3;
  } else direction = axis === "X" ? [1, 0, 0] : axis === "Y" ? [0, 1, 0] : [0, 0, 1];
  const delta = direction.map(v => Math.abs(v * distance) < 1e-9 ? 0 : v * distance) as Vec3;
  const translation = transform.translation.map((v, i) => v + delta[i]) as Vec3;
  if (!translation.every(v => Number.isFinite(v) && Math.abs(v) <= 1e6)) throw Error("이동 후 위치가 ±1000000 mm 범위를 벗어납니다.");
  return { command: { type: "batch", label: "Move wall and openings", commands: [
    { type: "move-object", objectId, translation }, ...refreshDrawings ? [{ type: "refresh-wall-drawings" as const, objectId }] : [],
  ] }, ghosts: [], resultObjectIds: [objectId], summary: [
    `${object.name}: ${WALL_MOVE_AXES[axis]} ${distance} mm 이동.`,
    `월드 이동량 [${delta.map(v => Number(v.toFixed(4))).join(", ")}] mm · 현재 배치에 더합니다.`,
    `문·창문 ${definition.openings.length}개와 벽을 함께 이동합니다. 치수·개구부 위치 관계는 유지합니다.`,
    "참조 중심선/윤곽은 유지합니다. 인접 벽의 끝점·접합부는 자동으로 늘어나지 않으므로 이동 후 확인하세요.",
    refreshDrawings ? "연관 도면 재연결을 포함하여 한 Undo로 적용합니다." : "연관 도면의 상태를 확인하고 필요하면 재연결하세요.",
  ] };
}
