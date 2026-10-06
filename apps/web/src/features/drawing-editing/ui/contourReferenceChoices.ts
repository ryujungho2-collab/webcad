import type { CadFeature, CadObject } from "@agent-webcad/cad-document";
import type { ContourReferenceRequirement } from "../commands/contourReferences";
import { contourParams, segmentPoint, type ExactContour } from "../geometry/contourEditing";
import { sketchContour, sketchContourParams } from "../geometry/sketchContour";
import { createDrawingTopology } from "../../../precision/drawingTopology";
import { drawingReferenceGeometry } from "../../../precision/drawingReference";
import { patternPoint } from "../../../precision/patternGeometry";
import { WORK_PLANES, worldToPlane, planeToWorld, type Vec3 } from "../../../precision/workPlane";
export type ReferenceChoice = { result: string; edge: string; branch?: "positive" | "negative" };
export const referenceKey = (r: { dependentId: string; sourceId: string }) => JSON.stringify([r.dependentId, r.sourceId]);
export const needsPortion = (r: ContourReferenceRequirement) => ["dimension", "construction", "sketch"].includes(r.kind);

/** Labels, highlight coordinates and route semantics share the exact output representation. */
export function referencePortions(r: ContourReferenceRequirement, raw: ExactContour, owned: boolean) {
  const path = owned ? sketchContour(raw) : raw, params = owned ? sketchContourParams(path) : contourParams(path);
  const topology = createDrawingTopology(String(params.kind), params, "preview"); params.topology = topology;
  const object = { transform: { translation: [0,0,0], rotation: [0,0,0], scale: [1,1,1] } } as CadObject;
  const feature = { type: "drawing", params } as CadFeature;
  const sampled = (i: number) => Array.from({length:path.segments[i].kind === "arc" ? 33 : 2},(_, n) => segmentPoint(path.segments[i],n/(path.segments[i].kind === "arc" ? 32 : 1),path.workPlane));
  let options: { value: string; label: string; points: Vec3[] }[] = [];
  if (r.kind === "sketch" && r.elementKind === "curve") {
    if (["circle", "arc"].includes(String(params.kind))) options.push({value:"whole",label:`Whole ${params.kind}`,points:path.segments.flatMap((_,i)=>sampled(i))});
  } else if ((r.kind === "sketch" || r.kind === "construction") && r.elementKind === "point") {
    options = topology.controls.map((c,i) => ({value:`point:${i}`,label:c.role === "vertex" ? !path.closed && i === 0 ? "Start endpoint" : !path.closed && i === topology.controls.length - 1 ? "End endpoint" : `Vertex ${i+1}` : c.role === "center" ? "Center point" : `${c.role[0].toUpperCase()+c.role.slice(1)} point`,points:drawingReferenceGeometry(object,feature,{topologyId:c.id})?.points??[]}));
  } else {
    const circular = r.kind === "dimension" && ["radius","diameter"].includes(r.dimensionKind??"");
    if (!path.closed && (r.kind === "dimension" && !circular || r.kind === "construction" && r.elementKind === "segment")) options.push({value:"span",label:"Whole endpoint span",points:[path.segments[0].start,path.segments.at(-1)!.end]});
    const allowArc = circular || r.kind === "construction" && r.elementKind === "intersection";
    options.push(...path.segments.flatMap((s,i) => {
      if (params.kind === "circle" && i > 0 || s.kind === "arc" && !allowArc || s.kind === "line" && circular) return [];
      return [{value:String(i),label:`Edge ${i+1} · ${s.kind}`,points:params.kind === "circle" ? path.segments.flatMap((_,j)=>sampled(j)) : sampled(i)}];
    }));
  }
  return options.map(o => ({...o,points:o.points.map(point => {
    if (!("throughPattern" in r)) return point;
    for (const member of r.throughPattern?.patternPath ?? []) { const plane=WORK_PLANES[member.spec.workPlane],height=point.reduce((n,v,i)=>n+v*plane.normal[i],0); point=planeToWorld(patternPoint(worldToPlane(point,plane),member.spec,member.index),plane).map((v,i)=>v+height*plane.normal[i]) as Vec3; }
    return point;
  })}));
}

export function referenceRoute(r: ContourReferenceRequirement, c: ReferenceChoice | undefined) {
  if (!c || c.result === "" || needsPortion(r) && c.edge === "") throw new Error(`Reconnect ${r.name}: choose a result and its required point, edge or whole span.`);
  return { dependentId:r.dependentId,sourceId:r.sourceId,resultIndices:[Number(c.result)],...(c.edge.startsWith("point:") ? {pointIndex:Number(c.edge.slice(6))} : c.edge && !["span","whole"].includes(c.edge) ? {segmentIndex:Number(c.edge)} : {}), ...(c.branch ? { branch: c.branch } : {}) };
}
