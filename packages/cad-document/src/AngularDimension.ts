import type { SketchWorkPlane } from "./Sketch";
import type { CadDocument } from "./CadDocument";
import { validDimensionStyle, type CadDimensionStyle } from "./DimensionStyle";

export type AngularDimensionReference = { objectId: string; segmentId: string };
export type AngularDimensionBranch = { firstRay: 1 | -1; secondRay: 1 | -1; sweep: "ccw" | "cw" };
export type AngularDimensionDefinition = {
  first: AngularDimensionReference;
  second: AngularDimensionReference;
  branch: AngularDimensionBranch;
  radius: number;
  text?: string | null;
  style?: CadDimensionStyle;
};
export type AngularDimensionLine = { kind: "line" | "arc"; workPlane: SketchWorkPlane; start: [number, number, number]; end: [number, number, number] };
/** World-space snapshots are refreshed from both stable references in the same transaction. */
export type AngularDimensionParams = AngularDimensionDefinition & { kind: "angular"; workPlane: SketchWorkPlane; lines: [AngularDimensionLine, AngularDimensionLine] };
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === "string" && v.length > 0;
export function validAngularReference(v: unknown): v is AngularDimensionReference {
  return record(v) && id(v.objectId) && id(v.segmentId) && Object.keys(v).every(k => ["objectId", "segmentId"].includes(k));
}
export function validAngularBranch(v: unknown): v is AngularDimensionBranch {
  return record(v) && (v.firstRay === 1 || v.firstRay === -1) && (v.secondRay === 1 || v.secondRay === -1) && (v.sweep === "ccw" || v.sweep === "cw") && Object.keys(v).every(k => ["firstRay", "secondRay", "sweep"].includes(k));
}
export function validAngularDefinition(v: unknown): v is AngularDimensionDefinition {
  return record(v) && validAngularReference(v.first) && validAngularReference(v.second)
    && (v.first.objectId !== v.second.objectId || v.first.segmentId !== v.second.segmentId)
    && validAngularBranch(v.branch) && typeof v.radius === "number" && Number.isFinite(v.radius) && v.radius > 0
    && (v.text === undefined || v.text === null || typeof v.text === "string")
    && (v.style === undefined || validDimensionStyle(v.style));
}
export function validAngularParams(v: unknown): v is AngularDimensionParams {
  if (!record(v) || v.kind !== "angular" || !["XY", "XZ", "YZ"].includes(String(v.workPlane)) || !Array.isArray(v.lines) || v.lines.length !== 2) return false;
  const plane = v.workPlane;
  return v.lines.every(line => record(line) && line.kind === "line" && line.workPlane === plane && [line.start, line.end].every(p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite))) && validAngularDefinition(v);
}

export function validateAngularReferences(document: CadDocument) {
  const features = new Map(Object.values(document.features).map(f => [f.output, f]));
  for (const f of features.values()) if (f.type === "dimension" && f.params.kind === "angular") {
    const p = f.params;
    const fail = (): never => { throw new Error(`Invalid CAD document: angular annotation ${f.id}. Check both edge references and inputs.`); };
    if (!validAngularParams(p)) fail();
    const definition = p as AngularDimensionParams;
    const expected = [...new Set([definition.first.objectId, definition.second.objectId])];
    if (JSON.stringify(f.inputs) !== JSON.stringify(expected)) fail();
    const transform = document.objects[f.output]?.transform;
    if (transform && (transform.translation.some(v=>v!==0) || transform.rotation.some(v=>v!==0) || transform.scale.some(v=>v!==1))) fail();
    for (const ref of [definition.first, definition.second]) {
      const source = features.get(ref.objectId), topology = source?.params.topology;
      if (!document.objects[ref.objectId] || source?.type !== "drawing" || !record(topology) || !Array.isArray(topology.segments)) fail();
      const edge = (topology as { segments: unknown[] }).segments.find(s => record(s) && s.id === ref.segmentId);
      if (!record(edge) || edge.kind === "arc") fail();
    }
  }
}
