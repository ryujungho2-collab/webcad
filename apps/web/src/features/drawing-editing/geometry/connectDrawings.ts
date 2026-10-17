import { curveCornerSolutions, chooseCurveCorner } from "./arcCorners";
import { lineArcFilletSolutions } from "./lineArcFillet";
import type { CadFeature, CadObject } from "@agent-webcad/cad-document";
import { contourTolerance, exactDrawingContour, locateOnContour } from "./contourEditing";
import { drawingWorldToModel } from "../../../precision/worldGeometry";
import { WORK_PLANES, worldToPlane, type Vec3 } from "../../../precision/workPlane";

/** Picked branches choose the material to keep. Original objects and stable
 * endpoints survive; the connecting line/arc is a separate editable object. */
export function connectDrawings(
  first: { object: CadObject; feature: CadFeature }, second: { object: CadObject; feature: CadFeature },
  firstPoint: Vec3, secondPoint: Vec3, treatment: "fillet" | "chamfer", value: number, secondDistance?: number, solutionIndex?: number,
) {
  if (!Number.isFinite(value) || value <= 1e-9 || secondDistance !== undefined && (treatment !== "chamfer" || !Number.isFinite(secondDistance) || secondDistance <= 1e-9)) throw new Error("Enter positive finite chamfer distances; Fillet uses one radius.");
  const paths = [first, second].map(s => exactDrawingContour(s.object, s.feature));
  const tolerance = contourTolerance(paths), plane = WORK_PLANES[paths[0].workPlane];
  const height = (p: Vec3) => p.reduce((sum, v, i) => sum + v * plane.normal[i], 0);
  if (paths.some(p => p.closed || p.workPlane !== paths[0].workPlane) || Math.abs(height(paths[0].segments[0].start) - height(paths[1].segments[0].start)) > tolerance) throw new Error("Connect two open contours on the same work plane and elevation.");
  const picksForEnds=[firstPoint,secondPoint];
  const selectedEnds=paths.map((p,i)=>p.segments[locateOnContour(p,picksForEnds[i]).segment]);
  if(selectedEnds.some(s=>s.kind==="arc") && (treatment==="chamfer" || paths.some(p=>p.segments.length>1&&p.segments.some(s=>s.kind==="arc")))) {
    return chooseCurveCorner(curveCornerSolutions(first,second,firstPoint,secondPoint,treatment,value,secondDistance),solutionIndex);
  }
  if([first,second].every(s=>s.feature.params.kind === "arc"))return chooseCurveCorner(curveCornerSolutions(first,second,firstPoint,secondPoint,treatment,value,secondDistance),solutionIndex);
  if ([first,second].some(s=>s.feature.params.kind === "arc")) {
    if(treatment !== "fillet")throw new Error("Line–arc corners support Fillet only; arc Chamfer is a separate operation.");
    const solutions=lineArcFilletSolutions(first,second,firstPoint,secondPoint,value);
    if(!solutions.length)throw new Error("No tangent Fillet fits the picked retained branches and bounded intervals. Change the radius or branch picks.");
    if(solutions.length>1 && solutionIndex === undefined)throw new Error("Multiple tangent Fillets fit. Choose a solution and review its contact points.");
    const chosen=solutions[solutionIndex ?? 0];if(!chosen)throw new Error("The selected Fillet solution is unavailable. Review the current branches again.");
    return chosen;
  }
  if(solutionIndex !== undefined)throw new Error("Solution selection is only supported for line–arc Fillet.");
  const picks = [firstPoint, secondPoint], ends = paths.map((path, i) => {
    const hit = locateOnContour(path, picks[i]), last = path.segments.length - 1;
    if (hit.distance > tolerance || (hit.segment !== 0 && hit.segment !== last)) throw new Error("Pick a free end segment on each contour.");
    const segment = path.segments[hit.segment];
    if (segment.kind !== "line") throw new Error("Two-object corners currently connect straight end segments. Use Offset or Trim/Extend for arcs.");
    return { path, segment, index: hit.segment };
  });
  const a = worldToPlane(ends[0].segment.start, plane), b = worldToPlane(ends[0].segment.end, plane), c = worldToPlane(ends[1].segment.start, plane), d = worldToPlane(ends[1].segment.end, plane);
  const u = [b[0] - a[0], b[1] - a[1]], v = [d[0] - c[0], d[1] - c[1]], cross = (p: number[], q: number[]) => p[0] * q[1] - p[1] * q[0];
  const denominator = cross(u, v);
  if (Math.abs(denominator) <= 1e-10 * Math.hypot(...u) * Math.hypot(...v)) throw new Error("Parallel or collinear branches have no unique corner.");
  const t = cross([c[0] - a[0], c[1] - a[1]], v) / denominator, corner = [a[0] + t * u[0], a[1] + t * u[1]];
  const branch = ends.map((entry, i) => {
    const pick = worldToPlane(picks[i], plane), direction = i === 0 ? u : v, size = Math.hypot(...direction);
    const signedPick = ((pick[0] - corner[0]) * direction[0] + (pick[1] - corner[1]) * direction[1]) / size;
    if (Math.abs(signedPick) <= tolerance) throw new Error("Pick away from the intersection to choose the branch to keep.");
    const ray = direction.map(n => n / size * Math.sign(signedPick));
    const progress = (p: Vec3) => { const q = worldToPlane(p, plane); return (q[0] - corner[0]) * ray[0] + (q[1] - corner[1]) * ray[1]; };
    let moveStart = progress(entry.segment.start) < progress(entry.segment.end);
    if (entry.path.segments.length > 1) {
      moveStart = entry.index === 0;
      if (progress(moveStart ? entry.segment.end : entry.segment.start) <= tolerance) throw new Error("Pick the branch towards the retained contour; shared vertices stay fixed.");
    }
    const far = moveStart ? entry.segment.end : entry.segment.start;
    return { ray, moveStart, available: progress(far) };
  });
  const dot = Math.max(-1, Math.min(1, branch[0].ray[0] * branch[1].ray[0] + branch[0].ray[1] * branch[1].ray[1]));
  const angle = Math.acos(dot), setback = treatment === "fillet" ? value / Math.tan(angle / 2) : value;
  const setbacks = [setback, treatment === "chamfer" ? secondDistance ?? value : setback];
  branch.forEach((s, i) => {
    if (!Number.isFinite(setbacks[i]) || setbacks[i] <= tolerance || setbacks[i] >= s.available - tolerance) throw new Error(`${treatment === "chamfer" ? `D${i + 1}` : "The radius"} consumes the ${i === 0 ? "target" : "second curve"} retained end segment. Use a smaller value or choose the other branch.`);
  });
  const from = (p: number[]): Vec3 => plane.origin.map((n, i) => n + p[0] * plane.xAxis[i] + p[1] * plane.yAxis[i] + height(paths[0].segments[0].start) * plane.normal[i]) as Vec3;
  const contacts = branch.map((s, i) => from([corner[0] + s.ray[0] * setbacks[i], corner[1] + s.ray[1] * setbacks[i]]));
  const replacements = [first, second].map((entry, i) => {
    const points = structuredClone(entry.feature.params.points as Vec3[]), point = drawingWorldToModel(entry.object, entry.feature, contacts[i]);
    if (!point) throw new Error("Unable to invert the drawing frame.");
    points[branch[i].moveStart ? 0 : points.length - 1] = point;
    return { ...entry.feature.params, points };
  });
  let connector: Record<string, unknown> = { kind: "line", workPlane: paths[0].workPlane, points: contacts };
  if (treatment === "fillet") {
    const bisector = [branch[0].ray[0] + branch[1].ray[0], branch[0].ray[1] + branch[1].ray[1]], size = Math.hypot(...bisector), along = value / Math.sin(angle / 2);
    const center = [corner[0] + bisector[0] / size * along, corner[1] + bisector[1] / size * along], p = worldToPlane(contacts[0], plane), q = worldToPlane(contacts[1], plane);
    const r = [p[0] - center[0], p[1] - center[1]], s = [q[0] - center[0], q[1] - center[1]], startAngle = Math.atan2(r[1], r[0]), sweep = Math.atan2(cross(r, s), r[0] * s[0] + r[1] * s[1]);
    connector = { kind: "arc", workPlane: paths[0].workPlane, center: from(center), radius: value, startAngle, endAngle: startAngle + sweep };
  }
  return { replacements, connector, corner: from(corner), contacts };
}
