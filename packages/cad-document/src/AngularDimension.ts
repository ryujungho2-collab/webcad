import type { SketchWorkPlane } from "./Sketch";

export type AngularDimensionReference = { objectId: string; segmentId: string };
export type AngularDimensionBranch = { firstRay: 1 | -1; secondRay: 1 | -1; sweep: "ccw" | "cw" };
export type AngularDimensionDefinition = {
  first: AngularDimensionReference;
  second: AngularDimensionReference;
  branch: AngularDimensionBranch;
  radius: number;
  text?: string | null;
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
    && (v.text === undefined || v.text === null || typeof v.text === "string");
}
export function validAngularParams(v: unknown): v is AngularDimensionParams {
  if (!record(v) || v.kind !== "angular" || !["XY", "XZ", "YZ"].includes(String(v.workPlane)) || !Array.isArray(v.lines) || v.lines.length !== 2) return false;
  const plane = v.workPlane;
  return v.lines.every(line => record(line) && line.kind === "line" && line.workPlane === plane && [line.start, line.end].every(p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite))) && validAngularDefinition(v);
}
