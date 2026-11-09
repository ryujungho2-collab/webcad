import { z } from "zod";
import type { ProfileExtrudeRelationReport } from "../state/profileExtrudeRelations";

const id = z.string().min(1).max(512);
const owner = z.object({ sketchId: id, missing: z.boolean() }).strict();
export const pilotRowSchema = z.object({
  sourceId: id, targetId: id, direction: z.literal("profile-to-extrude"),
  mode: z.enum(["live", "snapshot"]), status: z.enum(["resolved", "missing-source", "missing-source-feature"]),
  sourceMissing: z.boolean(), targetMissing: z.boolean(),
  sourceSketchOwners: z.array(owner).max(128), targetSketchOwners: z.array(owner).max(128),
}).strict();
export const pilotContextSchema = z.object({
  documentId: id, sessionId: id, revision: z.number().int().nonnegative(), generation: z.number().int().nonnegative(),
}).strict();
export const pilotRequestSchema = z.object({
  version: z.literal(1), requestId: id, context: pilotContextSchema,
  selectedObjectId: id, direction: z.enum(["outgoing", "incoming"]),
  consent: z.literal(true), relations: z.array(pilotRowSchema).min(1).max(128),
}).strict();
export const pilotSnapshotSchema = z.object({
  dataClass: z.enum(["synthetic", "product"]), document: z.object({ id, revision: z.number().int().nonnegative() }).strict(),
  relations: z.array(pilotRowSchema).min(1).max(128),
}).strict();
export const pilotStatusSchema = z.object({
  version: z.literal(1), available: z.boolean(), productMetadataAllowed: z.boolean(),
  dataClass: z.enum(["synthetic", "product"]).nullable(), timeoutMs: z.number().int().min(50).max(90000),
  document: z.object({ id, revision: z.number().int().nonnegative() }).nullable(),
}).strict();
export type PilotRequest = z.infer<typeof pilotRequestSchema>;
export type PilotStatus = z.infer<typeof pilotStatusSchema>;
export type PilotRow = z.infer<typeof pilotRowSchema>;

export function canonicalPilotRows(rows: PilotRow[]) {
  const owners = (values: PilotRow["sourceSketchOwners"]) => [...values].sort((a, b) => a.sketchId.localeCompare(b.sketchId));
  return rows.map(row => ({ ...row, sourceSketchOwners: owners(row.sourceSketchOwners), targetSketchOwners: owners(row.targetSketchOwners) }))
    .sort((a, b) => JSON.stringify([a.sourceId, a.targetId]).localeCompare(JSON.stringify([b.sourceId, b.targetId])));
}
export function samePilotRows(left: PilotRow[], right: PilotRow[]) {
  return JSON.stringify(canonicalPilotRows(left)) === JSON.stringify(canonicalPilotRows(right));
}
export function pilotRows(report: ProfileExtrudeRelationReport): PilotRow[] {
  return report.relations.map(edge => pilotRowSchema.parse({
    sourceId: edge.source.objectId, targetId: edge.target.objectId, direction: edge.direction,
    mode: edge.mode, status: edge.status, sourceMissing: edge.source.missing, targetMissing: edge.target.missing,
    sourceSketchOwners: edge.source.sketchOwners, targetSketchOwners: edge.target.sketchOwners,
  }));
}
export function buildPilotRequest(report: ProfileExtrudeRelationReport, context: PilotRequest["context"], requestId: string): PilotRequest {
  if (report.document.id !== context.documentId || report.document.revision !== context.revision) throw Error("The native relation report is outdated.");
  return pilotRequestSchema.parse({
    version: 1, requestId, context, selectedObjectId: report.selectedObjectId,
    direction: report.role === "extrude" ? "incoming" : "outgoing", consent: true, relations: pilotRows(report),
  });
}

export function pilotExplanation(rows: PilotRow[], document: { id: string; revision: number }) {
  return `Auto Ontology confirmed ${rows.length} recorded relationship${rows.length === 1 ? "" : "s"}. ` +
    canonicalPilotRows(rows).map(row => `${row.sourceId} → ${row.targetId} · ${row.mode} · ${row.status}`).join(". ") +
    `. Document ${document.id} · revision ${document.revision}.`;
}
export const pilotResponseSchema = z.object({
  version: z.literal(1), requestId: id, context: pilotContextSchema,
  relations: z.array(pilotRowSchema).min(1).max(128), summary: z.string().max(16000),
}).strict();
export function validatePilotResponse(raw: unknown, request: PilotRequest) {
  const response = pilotResponseSchema.parse(raw);
  if (response.requestId !== request.requestId || JSON.stringify(response.context) !== JSON.stringify(request.context) ||
      !samePilotRows(response.relations, request.relations) ||
      response.summary !== pilotExplanation(response.relations, { id: request.context.documentId, revision: request.context.revision })) {
    throw Error("The external relation response does not match the current native report.");
  }
  return response;
}

/** The timeout covers headers and body and also bounds a transport that ignores cancellation. */
export async function requestPilotExplanation(request: PilotRequest, signal: AbortSignal, timeoutMs: number,
  fetcher: typeof fetch = fetch) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: () => void = () => {};
  const cancelled = new Promise<never>((_, reject) => {
    onAbort = () => { controller.abort(); reject(new Error("The relation request was cancelled.")); };
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
    timer = setTimeout(() => { controller.abort(); reject(new Error("Auto Ontology timed out. Native relations remain available.")); }, timeoutMs);
  });
  try {
    if (signal.aborted) throw Error("The relation request was cancelled.");
    return await Promise.race([cancelled, (async () => {
      const response = await fetcher("/api/ontology/profile-extrude/explain", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), signal: controller.signal,
      });
      if (response.status === 504) throw Error("Auto Ontology timed out. Native relations remain available.");
      if (!response.ok) throw Error("Auto Ontology could not verify this snapshot. Native relations remain available.");
      const text = await response.text();
      if (text.length > 64000) throw Error("The relation response exceeded its limit.");
      return validatePilotResponse(JSON.parse(text), request);
    })()]);
  } finally {
    clearTimeout(timer); signal.removeEventListener("abort", onAbort);
  }
}
