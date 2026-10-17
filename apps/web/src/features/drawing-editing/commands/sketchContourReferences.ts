import {sketchCircularGeometry} from "@agent-webcad/cad-document";
import type { CadDocument, CadFeature, CadObject, Sketch, SketchConstraint, SketchGeometry } from "@agent-webcad/cad-document";
import type { ContourReferenceRoute } from "@agent-webcad/cad-commands";
import { drawingToSketchGeometry, sketchGeometryToDrawingParams } from "../../../precision/sketchAdapter";
import { geometryPointIds } from "../../../precision/sketchEditing";
import { solveSketch, sketchPoint } from "../../../precision/sketchSolver";
import type { DrawingTopology } from "../../../precision/drawingTopology";

export type SketchContourRequirement = { dependentId: string; sourceId: string; name: string; kind: "sketch"; elementKind: "point" | "segment" | "curve" | "line"; sketchId: string; constraintId: string; slot: string };
type Slot = { slot: string; sourceId: string; elementKind: SketchContourRequirement["elementKind"] };
function slots(c: SketchConstraint): Slot[] {
  const data = c as unknown as Record<string, unknown>;
  const point = ["first", "second", "point"].flatMap(slot => { const ref = data[slot] as { geometryId?: string } | undefined; return ref?.geometryId ? [{ slot, sourceId: ref.geometryId, elementKind: "point" as const }] : []; });
  const segment = ["firstSegment", "secondSegment", "line", "axis"].flatMap(slot => { const ref = data[slot] as { geometryId?: string } | undefined; return ref?.geometryId ? [{ slot, sourceId: ref.geometryId, elementKind: "segment" as const }] : []; });
  const geometry = ["geometryId", "firstCurveId", "secondCurveId", "curveId", "firstLineId", "secondLineId"].flatMap(slot => typeof data[slot] === "string" ? [{ slot, sourceId: data[slot] as string, elementKind: slot.endsWith("LineId") ? "line" as const : "curve" as const }] : []);
  return [...point, ...segment, ...geometry];
}
export function sketchContourRequirements(document: CadDocument, sourceIds: string[]): SketchContourRequirement[] {
  const selected = new Set(sourceIds);
  return Object.values(document.sketches ?? {}).flatMap(sketch => sketch.constraints.flatMap(c => slots(c).filter(s => selected.has(s.sourceId)).map(s => ({ ...s, dependentId: `sketch-reference:${JSON.stringify([sketch.id, c.id, s.slot])}`, name: `${c.kind}${"value" in c && typeof c.value === "number" ? ` (${c.value})` : ""} · ${s.slot}`, kind: "sketch" as const, sketchId: sketch.id, constraintId: c.id }))));
}

function geometryWithTopology(sketch: Sketch, object: CadObject, feature: CadFeature): SketchGeometry {
  let g = drawingToSketchGeometry(sketch, String(feature.params.kind), feature.params, object.id);
  if (!g) throw new Error("This contour cannot be represented exactly on the owning sketch plane.");
  const t = feature.params.topology as DrawingTopology;
  if (g.kind === "line") g = { ...g, startId: t.controls[0].id, endId: t.controls[1].id, segmentId: t.segments[0].id };
  else if (g.kind === "polyline") g = { ...g, vertices: g.vertices.map((v, i) => ({ ...v, id: t.controls[i].id })), segmentIds: t.segments.map(s => s.id) };
  else if (g.kind === "circle") g = { ...g, centerId: t.controls.find(c => c.role === "center")!.id, curveId: t.curves[0].id };
  else if (g.kind === "arc") g = { ...g, centerId: t.controls.find(c => c.role === "center")!.id, startId: t.controls.find(c => c.role === "start")!.id, endId: t.controls.find(c => c.role === "end")!.id, curveId: t.curves[0].id };
  if (feature.params.construction) g.construction = true;
  return g;
}

/** Preserve the owner, every constraint/value and dimension ID. Pin the exact
 * reviewed replacement while solving its relationships to the other entities. */
export function prepareSketchContourReplacement(document: CadDocument, sourceIds: string[], outputs: { object: CadObject; feature: CadFeature }[], routes: ContourReferenceRoute[]) {
  const sourceFeatures = sourceIds.map(id => Object.values(document.features).find(f => f.output === id)!);
  const owners = new Set(sourceFeatures.map(f => f.params.sketchId));
  if (owners.size !== 1) throw new Error("Join curves from one sketch, or independent curves. Ownership cannot be mixed.");
  const owner = [...owners][0]; if (!owner) return { sketches: [] as Sketch[], features: [] as CadFeature[] };
  const current = document.sketches?.[String(owner)];
  if (!current || sourceIds.some(id => !current.geometry.some(g => g.id === id))) throw new Error("The sketch owner or geometry is missing.");
  const sketch = structuredClone(current), selected = new Set(sourceIds);
  const replacements = outputs.map(o => geometryWithTopology(sketch, o.object, o.feature));
  const requirements = sketchContourRequirements(document, sourceIds);
  for (const r of requirements) {
    const route = routes.find(route => route.dependentId === r.dependentId && route.sourceId === r.sourceId);
    if (!route || route.resultIndices.length !== 1) throw new Error(`Reconnect ${r.name} to exactly one sketch result.`);
    const target = replacements[route.resultIndices[0]], output = outputs[route.resultIndices[0]];
    if (!target || !output) throw new Error("Choose an existing sketch result.");
    const c = sketch.constraints.find(c => c.id === r.constraintId)! as unknown as Record<string, unknown>, t = output.feature.params.topology as DrawingTopology;
    if (r.elementKind === "point") {
      const control = route.pointIndex === undefined ? undefined : t.controls[route.pointIndex];
      if (!control || route.segmentIndex !== undefined || !sketchPoint(target, control.id)) throw new Error(`Choose an existing point for ${r.name}.`);
      c[r.slot] = { geometryId: target.id, pointId: control.id };
    } else if (r.elementKind === "segment" || r.elementKind === "line") {
      const edge = route.segmentIndex === undefined ? undefined : t.segments[route.segmentIndex];
      if (!edge || edge.kind === "arc" || route.pointIndex !== undefined) throw new Error(`Choose a straight sketch edge for ${r.name}.`);
      if (r.elementKind === "line") { c[r.slot] = target.id; c[r.slot === "firstLineId" ? "firstSegmentId" : "secondSegmentId"] = edge.id; }
      else c[r.slot] = { geometryId: target.id, segmentId: edge.id };
    } else {
      const segmentId=route.segmentIndex===undefined?undefined:t.segments[route.segmentIndex]?.id;
      if (route.pointIndex !== undefined || !sketchCircularGeometry(target,segmentId)) throw new Error(`Choose a circular entity or an arc edge for ${r.name}.`);
      const key=r.slot==="geometryId"?"segmentId":r.slot==="firstCurveId"?"firstCurveSegmentId":r.slot==="secondCurveId"?"secondCurveSegmentId":"curveSegmentId";
      if(segmentId)c[key]=segmentId;else delete c[key];
      c[r.slot] = target.id;
    }
  }
  sketch.geometry = [...sketch.geometry.filter(g => !selected.has(g.id)), ...replacements];
  const constraints = structuredClone(sketch.constraints);
  for (const g of replacements) for (const pointId of geometryPointIds(g)) sketch.constraints.push({ id: `contour-target:${g.id}:${pointId}`, kind: "fixed-point", point: { geometryId: g.id, pointId }, value: sketchPoint(g, pointId)! });
  for(const g of replacements)if(g.kind==="polyline")for(const segmentId of g.segmentIds){const arc=sketchCircularGeometry(g,segmentId);if(arc)sketch.constraints.push({id:`contour-radius:${g.id}:${segmentId}`,kind:"radius",geometryId:g.id,segmentId,value:arc.radius});}
  let solved = solveSketch(sketch);
  if (!solved.ok) { const conflict = solved; throw new Error(`Sketch reconnection conflicts with the reviewed contour: ${conflict.reason} Check ${constraints.filter(c => conflict.conflictingConstraintIds.includes(c.id)).map(c => `${c.kind} (${c.id})`).join(", ")}.`); }
  for(const g of replacements)if(g.kind==="polyline"){
    const actual=solved.sketch.geometry.find(e=>e.id===g.id);
    if(actual?.kind!=="polyline" || g.bulges?.some((b,i)=>Math.abs(b-(actual.bulges?.[i]??0))>1e-6))throw new Error("Sketch reconnection conflicts with the reviewed arc sweep.");
  }
  solved.sketch.constraints = constraints; solved = solveSketch(solved.sketch);
  if (!solved.ok) throw new Error(`Sketch reconnection failed: ${solved.reason}`);
  const features = solved.sketch.geometry.map(g => {
    const output = outputs.find(o => o.object.id === g.id), existing = Object.values(document.features).find(f => f.output === g.id);
    const f = output?.feature ?? structuredClone(existing!); if (!f) throw new Error("Missing sketch projection.");
    f.params = sketchGeometryToDrawingParams(solved.sketch, g, f.params); return f;
  });
  return { sketches: [solved.sketch], features };
}
