import { linearToleranceAt, validateFeatureParameters, type CadBlock, type CadFeature, type CadObject, type SketchPoint } from "@agent-webcad/cad-document";
import { drawingModelToWorld, drawingTransformAfterEdit, drawingWorldToModel } from "./worldGeometry";
import { planeToWorld, worldToWorkPlane, WORK_PLANES, type Vec3 } from "./workPlane";

function memberKey(member: CadBlock["members"][number]) {
  return member.objectId ?? member.params.objectId ?? member.params.id;
}

function resolveLine(block: CadBlock, index: number, memberId: string) {
  const member = block.members[index];
  const params = member.params;
  if (member.type !== "drawing" || params.kind !== "line" || (params.workPlane ?? "XY") !== block.workPlane ||
      params.facePlaneId || params.faceFrame || params.sketchId || params.modelProjection || params.modelSection) return;
  const feature: CadFeature = { id: memberId, output: memberId, inputs: [], type: "drawing", params };
  if (!validateFeatureParameters(feature) || !member.transform.scale.every(value => Number.isFinite(value) && value > 1e-12)) return;
  const object: CadObject = { id: memberId, geometryId: memberId, name: memberId, visible: true,
    layerId: member.layerId, transform: member.transform };
  const plane = WORK_PLANES[block.workPlane];
  const world = (params.points as [Vec3, Vec3]).map(point => drawingModelToWorld(object, feature, point)!);
  if (!world.flat().every(Number.isFinite)) return;
  const local = world.map(point => worldToWorkPlane(point, plane));
  const tolerance = linearToleranceAt(...world.flat());
  if (local.some(point => Math.abs(point[2]) > tolerance)) return;
  const points: [SketchPoint, SketchPoint] = [[local[0][0], local[0][1]], [local[1][0], local[1][1]]];
  if (Math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1]) <= tolerance) return;
  return { member, index, feature, object, points };
}

/** Resolve a uniquely identified finite line in the definition's local frame. */
export function blockLineMember(block: CadBlock, memberId: string) {
  const matches = block.members.flatMap((member, index) => memberKey(member) === memberId ? [index] : []);
  if (matches.length === 1) return resolveLine(block, matches[0], memberId);
}

export function editableBlockLines(block: CadBlock) {
  const counts = new Map<unknown, number>();
  for (const member of block.members) {
    const key = memberKey(member);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return block.members.flatMap((member, index) => {
    const id = memberKey(member);
    if (typeof id !== "string" || !id || counts.get(id) !== 1) return [];
    const line = resolveLine(block, index, id);
    return line ? [{ id, points: line.points }] : [];
  });
}

export function editBlockLineEndpoint(block: CadBlock, edit: { memberId: string; endpoint: 0 | 1; point: SketchPoint }) {
  const line = blockLineMember(block, edit.memberId);
  if (!line) throw Error("The line member is missing, ambiguous or unsupported.");
  const fixed = line.points[1 - edit.endpoint], current = line.points[edit.endpoint];
  const tolerance = linearToleranceAt(...fixed, ...current, ...edit.point);
  const distance = (a: SketchPoint, b: SketchPoint) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  if (distance(edit.point, fixed) <= tolerance) throw Error("The line endpoints must remain distinct.");
  if (distance(edit.point, current) <= tolerance) throw Error("Enter a different endpoint position.");
  const points = [...line.member.params.points as [Vec3, Vec3]];
  points[edit.endpoint] = drawingWorldToModel(line.object, line.feature, planeToWorld(edit.point, WORK_PLANES[block.workPlane]))!;
  const params = { ...line.member.params, points };
  // The drawing pivot moves with its bounding box. Reuse the native
  // compensation so the opposite endpoint stays fixed in definition space.
  const transform = drawingTransformAfterEdit(line.object, line.feature, params);
  const members = [...block.members];
  members[line.index] = { ...line.member, params, transform };
  const next = { ...block, members };
  const actual = blockLineMember(next, edit.memberId)?.points;
  if (!actual || distance(actual[edit.endpoint], edit.point) > tolerance ||
      distance(actual[1 - edit.endpoint], fixed) > tolerance) throw Error("The endpoint could not be resolved on the component plane.");
  return next;
}
