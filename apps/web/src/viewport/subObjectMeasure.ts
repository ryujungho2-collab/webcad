import {ellipsePoint,ellipseLength,ellipseArea} from "../precision/ellipseGeometry";
import type { CadDocument } from "@agent-webcad/cad-document";
import { drawingModelToWorld, getWorldDrawingGeometry } from "../precision/worldGeometry";
import { WORK_PLANES, worldToPlane, type Vec3, type WorkPlaneId } from "../precision/workPlane";
import type { TopologySelectionRef } from "../state/selection";

export type SubObjectMeasureRow = { label: string; value: string };
export type SubObjectMeasure = { title: string; plane: WorkPlaneId; rows: SubObjectMeasureRow[] };

type TopologyControl = { id: string; role: string; index?: number };
type TopologyCurve = { id: string; kind: string };

const formatLength = (value: number) => `${value.toFixed(2)} mm`;
const formatAngle = (radians: number) => `${(radians * 180 / Math.PI).toFixed(2)} °`;

/**
 * Read-only precision summary for one selected topology element, expressed
 * in its drawing's work-plane coordinates. Display only: edits continue
 * through viewport dragging and the existing Inspector sections.
 */
export function describeSubObject(document: CadDocument, ref: TopologySelectionRef): SubObjectMeasure | null {
  const object = document.objects[ref.objectId];
  const feature = object ? Object.values(document.features).find((entry) => entry.output === object.id) : undefined;
  if (!object || !feature || feature.type !== "drawing") return null;
  const world = getWorldDrawingGeometry(object, feature);
  if (!world) return null;
  const plane = world.workPlane;
  const params = feature.params as Record<string, unknown>;
  const positionRows = (point: Vec3): SubObjectMeasureRow[] => {
    const [x, y] = worldToPlane(point, WORK_PLANES[plane]);
    return [{ label: "X", value: formatLength(x) }, { label: "Y", value: formatLength(y) }];
  };

  if (ref.kind === "drawing-control") {
    const topology = params.topology as { controls?: TopologyControl[] } | undefined;
    const control = topology?.controls?.find((entry) => entry.id === ref.topologyId);
    if (!control) return null;
    if (control.role === "vertex" && typeof control.index === "number" && Array.isArray(params.points)) {
      const model = (params.points as Vec3[])[control.index];
      if (!model) return null;
      const worldPoint = drawingModelToWorld(object, feature, model);
      if (!worldPoint) return null;
      return { title: "Vertex", plane, rows: positionRows(worldPoint) };
    }
    if(world.ellipse&&["axis-u","axis-v","start","end"].includes(control.role)){const e=world.ellipse,axis=control.role==="axis-u"?e.axisU:e.axisV,point=control.role.startsWith("axis")?e.center.map((v,i)=>v+axis[i]) as Vec3:ellipsePoint(e,e.startParam+(control.role==="end"?e.sweep:0));return {title:control.role,plane,rows:[...positionRows(point),...(control.role.startsWith("axis")?[{label:"Semi-axis",value:formatLength(Math.hypot(...axis))}]:[])]};}
    if (control.role === "center" && world.center) {
      return { title: "Center", plane, rows: positionRows(world.center) };
    }
    if ((control.role === "start" || control.role === "end") && world.center && world.radius !== undefined) {
      const angle = control.role === "start" ? world.startAngle : world.endAngle;
      if (angle === undefined) return null;
      const [cx, cy] = worldToPlane(world.center, WORK_PLANES[plane]);
      return {
        title: control.role === "start" ? "Start" : "End",
        plane,
        rows: [
          { label: "X", value: formatLength(cx + Math.cos(angle) * world.radius) },
          { label: "Y", value: formatLength(cy + Math.sin(angle) * world.radius) },
          { label: "Radius", value: formatLength(world.radius) },
        ],
      };
    }
    if (control.role === "radius" && world.radius !== undefined) {
      return { title: "Radius", plane, rows: [{ label: "Radius", value: formatLength(world.radius) }] };
    }
    return null;
  }

  if (ref.kind === "drawing-segment") {
    const segment = world.profileSegments?.find((entry) => entry.topologyReference === ref.topologyId);
    if (!segment) return null;
    if (segment.kind === "line") {
      const [ax, ay] = worldToPlane(segment.start, WORK_PLANES[plane]);
      const [bx, by] = worldToPlane(segment.end, WORK_PLANES[plane]);
      return {
        title: "Segment",
        plane,
        rows: [
          { label: "Length", value: formatLength(Math.hypot(bx - ax, by - ay)) },
          { label: "Angle", value: formatAngle(Math.atan2(by - ay, bx - ax)) },
        ],
      };
    }
    if (segment.radius !== undefined && segment.startAngle !== undefined && segment.endAngle !== undefined) {
      return {
        title: "Arc segment",
        plane,
        rows: [
          { label: "Radius", value: formatLength(segment.radius) },
          { label: "Start", value: formatAngle(segment.startAngle) },
          { label: "End", value: formatAngle(segment.endAngle) },
        ],
      };
    }
    return null;
  }

  if (ref.kind === "drawing-curve") {
    const topology = params.topology as { curves?: TopologyCurve[] } | undefined;
    const curve = topology?.curves?.find((entry) => entry.id === ref.topologyId);
    if(curve&&world.ellipse){const e=world.ellipse,area=ellipseArea(e);return {title:world.kind,plane,rows:[{label:"Length",value:formatLength(ellipseLength(e))},{label:"Parameter sweep",value:formatAngle(e.sweep)},...(area===undefined?[]:[{label:"Area",value:`${area.toFixed(2)} mm²`}])]};}
    if (!curve || world.radius === undefined) return null;
    if (curve.kind === "circle") {
      return { title: "Circumference", plane, rows: [{ label: "Radius", value: formatLength(world.radius) }] };
    }
    if (curve.kind === "arc" && world.startAngle !== undefined && world.endAngle !== undefined) {
      return {
        title: "Arc",
        plane,
        rows: [
          { label: "Radius", value: formatLength(world.radius) },
          { label: "Start", value: formatAngle(world.startAngle) },
          { label: "End", value: formatAngle(world.endAngle) },
        ],
      };
    }
    return null;
  }

  return null;
}
