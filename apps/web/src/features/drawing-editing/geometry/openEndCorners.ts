import type { CadFeature, CadObject } from "@agent-webcad/cad-document";
import { contourTolerance, exactDrawingContour, locateOnContour, segmentPoint, type ContourSegment } from "./contourEditing";
import { contourIntersections } from "./trimContour";
import { drawingWorldToModel } from "../../../precision/worldGeometry";
import { WORK_PLANES, type Vec3 } from "../../../precision/workPlane";

type Source = { object: CadObject; feature: CadFeature };
type Corner = { replacements: Record<string, unknown>[]; connector: Record<string, unknown>; contacts: Vec3[]; corner: Vec3; center?: Vec3 };
const distance = (a: Vec3, b: Vec3) => Math.hypot(...a.map((n, i) => n - b[i]));
const length = (s: ContourSegment) => s.kind === "arc" ? s.radius! * Math.abs(s.sweep!) : distance(s.start, s.end);

/** Reduce selected free ends to exact world curves, then restore only the free
 * control/edge in the original model frame. Shared vertices and edge IDs survive. */
export function openEndCornerSources(sources: Source[], picks: Vec3[]) {
  const paths = sources.map(s => exactDrawingContour(s.object, s.feature)), tolerance = contourTolerance(paths);
  const plane = WORK_PLANES[paths[0].workPlane];
  const elevation = (p: Vec3) => p.reduce((n, v, i) => n + v * plane.normal[i], 0);
  if (paths.some(p => p.closed || p.workPlane !== paths[0].workPlane || Math.abs(elevation(p.segments[0].start) - elevation(paths[0].segments[0].start)) > tolerance)) {
    throw new Error("Connect two open contours on the same work plane and elevation.");
  }
  const ends = paths.map((path, i) => {
    const hit = locateOnContour(path, picks[i]), index = hit.segment, segment = path.segments[index];
    if (hit.distance > tolerance || index !== 0 && index !== path.segments.length - 1) throw new Error("Pick a free end segment on each contour; shared interior edges stay fixed.");
    if (segment.kind === "arc" && Math.abs(segment.sweep!) >= 2 * Math.PI - 1e-9) throw new Error("Full circles have no retained end branch.");
    const params = segment.kind === "line" ? { kind: "line", workPlane: path.workPlane, points: [segment.start, segment.end] }
      : { kind: "arc", workPlane: path.workPlane, center: segment.center, radius: segment.radius, startAngle: segment.startAngle, endAngle: segment.startAngle! + segment.sweep! };
    const source: Source = {
      object: { ...sources[i].object, transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
      feature: { ...sources[i].feature, params },
    };
    return { path, index, segment, hit, source };
  });
  function restore(result: Corner): Corner | null {
    const replacements: Record<string, unknown>[] = [];
    for (const [i, end] of ends.entries()) {
      const trimmed = exactDrawingContour(end.source.object, { ...end.source.feature, params: result.replacements[i] }).segments[0];
      const moveStart = distance(trimmed.end, end.segment.end) <= tolerance;
      if (end.path.segments.length > 1 && moveStart !== (end.index === 0)) return null;
      const params = structuredClone(sources[i].feature.params), contact = result.contacts[i];
      const t = locateOnContour({ ...end.path, closed: false, segments: [end.segment] }, contact).parameter;
      if (params.kind === "arc") {
        const start = Number(params.startAngle), sweep = Number(params.endAngle) - start;
        if (moveStart) params.startAngle = start + sweep * t; else params.endAngle = start + sweep * t;
      } else {
        const points = params.points as Vec3[], modelPoint = drawingWorldToModel(sources[i].object, sources[i].feature, contact);
        if (!modelPoint) throw new Error("Unable to invert the drawing frame.");
        points[moveStart ? 0 : points.length - 1] = modelPoint;
        if (end.segment.kind === "arc") {
          const bulges = params.bulges as number[];
          // The normalized parameter is invariant under rotation, uniform scale
          // and reflection; compute the signed bulge in the source model frame.
          const sweep = 4 * Math.atan(bulges[end.index]);
          bulges[end.index] = Math.tan(sweep * (moveStart ? 1 - t : t) / 4);
        }
      }
      replacements.push(params);
    }
    return { ...result, replacements };
  }
  return { ends, tolerance, restore };
}

/** D1/D2 travel along each bounded source, measured from a real intersection.
 * No supporting-circle or line extension is used to invent a corner. */
export function openEndChamferSolutions(first: Source, second: Source, firstPick: Vec3, secondPick: Vec3, d1: number, d2: number): Corner[] {
  if (![d1, d2].every(n => Number.isFinite(n) && n > 1e-9)) throw new Error("Enter positive finite Chamfer D1/D2 distances.");
  const { ends, tolerance, restore } = openEndCornerSources([first, second], [firstPick, secondPick]);
  const segments = ends.map(e => e.segment), results: Corner[] = [];
  for (const corner of contourIntersections(segments[0], segments[1], ends[0].path, tolerance, true)) {
    if (results.some(r => distance(r.corner, corner) <= tolerance)) continue;
    const at = ends.map(e => locateOnContour({ ...e.path, segments: [e.segment] }, corner).parameter);
    const tangents=segments.map((segment,i)=>segment.kind==="line"?segment.end.map((v,j)=>v-segment.start[j]) as Vec3:
      planeTangent(segment,at[i],ends[i].path.workPlane));
    const crossLength=Math.hypot(tangents[0][1]*tangents[1][2]-tangents[0][2]*tangents[1][1],tangents[0][2]*tangents[1][0]-tangents[0][0]*tangents[1][2],tangents[0][0]*tangents[1][1]-tangents[0][1]*tangents[1][0]);
    if(crossLength<=1e-9*Math.hypot(...tangents[0])*Math.hypot(...tangents[1]))continue;
    const keepEnd = at.map((t, i) => ends[i].hit.parameter > t);
    if (at.some((t, i) => Math.abs(t - ends[i].hit.parameter) * length(segments[i]) <= tolerance)) continue;
    if (ends.some((e, i) => e.path.segments.length > 1 && keepEnd[i] !== (e.index === 0))) continue;
    const ts = at.map((t, i) => t + (keepEnd[i] ? 1 : -1) * [d1, d2][i] / length(segments[i]));
    if (ts.some((t, i) => !Number.isFinite(t) || t * length(segments[i]) <= tolerance || (1 - t) * length(segments[i]) <= tolerance
      || (keepEnd[i] ? ends[i].hit.parameter - t : t - ends[i].hit.parameter) * length(segments[i]) <= tolerance)) continue;
    const contacts = ts.map((t, i) => segmentPoint(segments[i], t, ends[i].path.workPlane));
    if (distance(contacts[0], contacts[1]) <= tolerance) continue;
    const replacements = ends.map((e, i) => {
      const params = structuredClone(e.source.feature.params);
      if (e.segment.kind === "line") (params.points as Vec3[])[keepEnd[i] ? 0 : 1] = contacts[i];
      else if (keepEnd[i]) params.startAngle = e.segment.startAngle! + e.segment.sweep! * ts[i];
      else params.endAngle = e.segment.startAngle! + e.segment.sweep! * ts[i];
      return params;
    });
    const result = restore({ replacements, contacts, corner, connector: { kind: "line", workPlane: ends[0].path.workPlane, points: contacts } });
    if (result) results.push(result);
  }
  return results;
}

function planeTangent(segment:ContourSegment,t:number,planeId:keyof typeof WORK_PLANES):Vec3 {
  const angle=segment.startAngle!+segment.sweep!*t,plane=WORK_PLANES[planeId];
  return plane.xAxis.map((v,i)=>-Math.sin(angle)*v+Math.cos(angle)*plane.yAxis[i]) as Vec3;
}
