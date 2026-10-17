import type { CadDocument, CadObject, CadFeature, Sketch, SketchGeometry, SketchPoint } from "@agent-webcad/cad-document";
import { stretchDrawing, type StretchRegion } from "./basicDrawingEditing";
import { getObjectTransform } from "../../../precision/objectTransform";
import { worldToPlane, WORK_PLANES, type Vec3 } from "../../../precision/workPlane";
import { sketchPoint } from "../../../precision/sketchSolver";

export type SketchStretchPlan = { sketchId: string; entities: SketchGeometry[]; moved: { geometryId: string; pointId: string }[] };

const IDENTITY = JSON.stringify({ translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
const toSketch = (sketch: Sketch, point: Vec3): SketchPoint => worldToPlane(point, WORK_PLANES[sketch.workPlane]);
const shift = (a: SketchPoint, b: SketchPoint) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Pure stretch review for one sketch-owned drawing. Returns the reviewed
 * entity replacement plus the moved point IDs for solver pinning.
 * Kind changes and sheared rectangles are rejected; rectangular edge resizing keeps IDs.
 * Never mutates. */
export function planSketchStretch(document: CadDocument, object: CadObject, feature: CadFeature, region: StretchRegion, delta: Vec3): SketchStretchPlan | null {
  const sketchId = String(feature.params.sketchId ?? "");
  const sketch = document.sketches?.[sketchId];
  if (!sketch) throw new Error("The owning sketch no longer exists.");
  if(sketch.facePlaneId)throw Error("Face sketch Stretch is not available yet; edit its driving dimensions in the Sketch inspector.");
  if (JSON.stringify(getObjectTransform(object, feature)) !== IDENTITY)
    throw new Error(`'${object.name}' has a placement transform. Reset its transform before stretching its sketch.`);
  const entity = sketch.geometry.find(g => g.id === object.id);
  if (!entity) throw new Error(`Missing sketch projection: ${object.id}.`);
  if (!["line", "polyline", "rectangle", "circle", "arc"].includes(entity.kind))
    throw new Error("Sketch Stretch currently supports lines, polylines, rectangles, circles and arcs.");
  const params = stretchDrawing(object, feature, region, delta);
  if (!params) return null;
  const points = params.points as Vec3[] | undefined;
  let next: SketchGeometry;
  if (entity.kind === "line" && Array.isArray(points) && points.length === 2) {
    next = { ...entity, start: toSketch(sketch, points[0]), end: toSketch(sketch, points[1]) };
  } else if (entity.kind === "polyline" && Array.isArray(points) && points.length === entity.vertices.length) {
    next = { ...entity, vertices: entity.vertices.map((v, i) => ({ ...v, point: toSketch(sketch, points[i]) })) };
  } else if (entity.kind === "rectangle" && Array.isArray(points) && points.length === 4) {
    const local = points.map(p => toSketch(sketch, p)), angle = entity.angle ?? 0, c = Math.cos(angle), s = Math.sin(angle);
    const relative = local.map(p => [(p[0]-local[0][0])*c+(p[1]-local[0][1])*s, -(p[0]-local[0][0])*s+(p[1]-local[0][1])*c]);
    const width=relative[1][0],height=relative[3][1];
    if(width<=1e-6||height<=1e-6||Math.abs(relative[1][1])>1e-6||Math.abs(relative[3][0])>1e-6||Math.hypot(relative[2][0]-width,relative[2][1]-height)>1e-6)
      throw new Error(`Stretching these corners of '${object.name}' would break its rectangle. Move a complete edge along its axis, move the whole rectangle, or use Edit polyline to change its configuration.`);
    next = { ...entity, origin: local[0],width,height };

  } else if (entity.kind === "circle" && Array.isArray(params.center)) {
    next = { ...entity, center: toSketch(sketch, params.center as Vec3) };
  } else if (entity.kind === "arc" && Array.isArray(params.center) && Number.isFinite(params.radius) && Number.isFinite(params.startAngle) && Number.isFinite(params.endAngle)) {
    next = { ...entity, center: toSketch(sketch, params.center as Vec3), radius: Number(params.radius), startAngle: Number(params.startAngle), endAngle: Number(params.endAngle) };
  } else {
    throw new Error(`'${object.name}' cannot be stretched through its sketch.`);
  }
  const moved: { geometryId: string; pointId: string }[] = [];
  const beforePoints = new Map<string, SketchPoint>();
  const collect = (id: string, p: SketchPoint | null) => { if (p) beforePoints.set(id, p); };
  if (entity.kind === "line") { collect(entity.startId, entity.start); collect(entity.endId, entity.end); }
  else if (entity.kind === "polyline") entity.vertices.forEach(v => collect(v.id, v.point));
  else if (entity.kind === "rectangle") entity.cornerIds.forEach(id => collect(id, sketchPoint(entity, id)));
  else if (entity.kind === "circle") collect(entity.centerId, entity.center);
  else if (entity.kind === "arc") { collect(entity.centerId, entity.center); }
  for (const [pointId, was] of beforePoints) {
    const now = sketchPoint(next, pointId);
    if (now && shift(now, was) > 1e-9) moved.push({ geometryId: entity.id, pointId });
  }
  // Arc endpoints have no stable point IDs beyond start/end; pin them as well when moved.
  if (next.kind === "arc") {
    for (const pointId of [next.startId, next.endId]) {
      const was = sketchPoint(entity, pointId), now = sketchPoint(next, pointId);
      if (was && now && shift(now, was) > 1e-9 && !moved.some(m => m.pointId === pointId)) moved.push({ geometryId: entity.id, pointId });
    }
  }
  return { sketchId, entities: [next], moved };
}
