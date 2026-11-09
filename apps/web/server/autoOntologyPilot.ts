import type { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import type { Plugin } from "vite";
import {
  canonicalPilotRows, pilotExplanation, pilotRequestSchema, pilotRowSchema, pilotSnapshotSchema, samePilotRows,
  type PilotRequest, type PilotRow, type PilotStatus,
} from "../src/ontology/profileExtrudePilot";

type Snapshot = ReturnType<typeof pilotSnapshotSchema.parse>;
type Options = { url?: string; apiKey?: string; snapshot?: Snapshot; allowProductMetadata?: boolean; timeoutMs?: number; fetcher?: typeof fetch };
const BASE = "/api/ontology/profile-extrude";
const MAX_BYTES = 1000000;
const EVIDENCE = "Use the read-only SQLite view cad_profile_extrude alone. Return all its columns with existing names. " +
  "It already joins the owning document by document_id and provides independent source_sketch_owners and target_sketch_owners JSON arrays. " +
  "Preserve the stored source-to-target order and missing endpoint flags.";

function localGateway(value: string) {
  const url = new URL(value);
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw Error("A loopback Auto Ontology gateway is required.");
  return url.origin;
}
async function boundedBody(response: Response, signal: AbortSignal) {
  if (!response.ok || !response.body) throw Error("Auto Ontology did not return a usable response.");
  const reader = response.body.getReader();
  let size = 0, text = "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_BYTES) throw Error("Auto Ontology response exceeded its limit.");
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
}
function returnedRows(text: string, request: PilotRequest): PilotRow[] {
  let answer: Record<string, unknown> | undefined, done = false;
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const raw = line.slice(5).trim();
    if (raw === "[DONE]") { done = true; break; }
    const event = JSON.parse(raw);
    if (event.type === "error") throw Error("Auto Ontology reported an incomplete query.");
    if (event.type === "result") answer = event.answer;
  }
  if (!done || !answer || typeof answer.sql_code !== "string" || !/^\s*SELECT\b/i.test(answer.sql_code)) {
    throw Error("Auto Ontology did not complete a source data query.");
  }
  let rows = answer.sql_response_from_db;
  if (Array.isArray(rows) && rows.length === 1 && typeof rows[0] === "string") rows = JSON.parse(rows[0]);
  if (!Array.isArray(rows) || rows.length > 128) throw Error("Auto Ontology returned an unsupported row shape.");
  return rows.map(row => {
    if (!row || row.document_id !== request.context.documentId || row.revision !== request.context.revision) {
      throw Error("Auto Ontology returned another document or revision.");
    }
    const flag = (value: unknown) => value === 0 ? false : value === 1 ? true : value;
    const owners = (value: unknown) => {
      const parsed = typeof value === "string" ? JSON.parse(value) : value;
      return Array.isArray(parsed) ? parsed.map(owner => ({ sketchId: owner?.sketchId, missing: flag(owner?.missing) })) : parsed;
    };
    return pilotRowSchema.parse({
      sourceId: row.source_id, targetId: row.target_id, direction: row.direction, mode: row.mode, status: row.status,
      sourceMissing: flag(row.source_missing), targetMissing: flag(row.target_missing),
      sourceSketchOwners: owners(row.source_sketch_owners), targetSketchOwners: owners(row.target_sketch_owners),
    });
  });
}

export function createAutoOntologyPilot(options: Options = {}) {
  const timeoutMs = Math.max(50, Math.min(90000, options.timeoutMs ?? 45000));
  const snapshot = options.snapshot ? pilotSnapshotSchema.parse(options.snapshot) : undefined;
  const url = options.url ? localGateway(options.url) : undefined;
  const fetcher = options.fetcher ?? fetch;
  const status: PilotStatus = {
    version: 1, available: !!(url && options.apiKey && snapshot && (snapshot.dataClass === "synthetic" || options.allowProductMetadata)),
    productMetadataAllowed: options.allowProductMetadata === true, dataClass: snapshot?.dataClass ?? null,
    document: snapshot?.document ?? null, timeoutMs,
  };
  async function explain(raw: unknown, signal: AbortSignal) {
    if (!status.available || !snapshot || !url) throw Error("Auto Ontology is not enabled for a registered snapshot.");
    const request = pilotRequestSchema.parse(raw);
    if (request.context.documentId !== snapshot.document.id || request.context.revision !== snapshot.document.revision) {
      throw Error("This document revision has no registered Auto Ontology snapshot.");
    }
    const expected = snapshot.relations.filter(row => request.direction === "outgoing"
      ? row.sourceId === request.selectedObjectId : row.targetId === request.selectedObjectId);
    if (!expected.length || !samePilotRows(request.relations, expected)) throw Error("The native relations differ from the registered snapshot.");
    const column = request.direction === "outgoing" ? "source_id" : "target_id";
    const question = `Filter the actual data rows stored in the connected SQLite view cad_profile_extrude where ${column} equals ` +
      `${JSON.stringify(request.selectedObjectId)}, document_id equals ${JSON.stringify(request.context.documentId)}, and revision equals ` +
      `${request.context.revision}. Run a read-only data query and return the matching rows with all their fields.`;
    const response = await fetcher(`${url}/api/chat/completions`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-api-key": options.apiKey! },
      body: JSON.stringify({ question, evidence: EVIDENCE, prediction: false }), signal, redirect: "error",
    });
    const rows = returnedRows(await boundedBody(response, signal), request);
    if (!samePilotRows(rows, request.relations)) throw Error("The external rows do not match the native relations.");
    const relations = canonicalPilotRows(rows);
    return { version: 1 as const, requestId: request.requestId, context: request.context, relations,
      summary: pilotExplanation(relations, snapshot.document) };
  }
  const middleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const path = (req.url ?? "").split("?", 1)[0];
    if (path !== `${BASE}/status` && path !== `${BASE}/explain`) { next(); return; }
    const reply = (code: number, value: unknown) => {
      if (res.destroyed || res.writableEnded) return;
      res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(value));
    };
    let origin: URL;
    try { origin = new URL(`http://${req.headers.host ?? ""}`); } catch { reply(403, { error: "Invalid local origin." }); return; }
    if (!["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) || req.headers.origin && req.headers.origin !== origin.origin) {
      reply(403, { error: "Use the same-origin loopback gateway." }); return;
    }
    if (path.endsWith("/status")) { reply(req.method === "GET" ? 200 : 405, status); return; }
    if (req.method !== "POST" || req.headers["content-type"]?.split(";", 1)[0] !== "application/json") {
      reply(415, { error: "Use a JSON POST request." }); return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const closed = () => { if (!res.writableEnded) controller.abort(); };
    res.on("close", closed);
    try {
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 64000) throw Error("The relation request exceeded its limit.");
        chunks.push(chunk);
      }
      reply(200, await explain(JSON.parse(Buffer.concat(chunks).toString("utf8")), controller.signal));
    } catch { reply(controller.signal.aborted ? 504 : 422, { error: "The external snapshot could not be verified. Native relations remain available." }); }
    finally { clearTimeout(timer); res.off("close", closed); }
  };
  return { status, explain, middleware };
}

export function autoOntologyPilotPlugin(): Plugin {
  let gateway: ReturnType<typeof createAutoOntologyPilot> | undefined;
  const middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!(req.url ?? "").startsWith(`${BASE}/`)) { next(); return; }
    if (!gateway) {
      try {
        gateway = createAutoOntologyPilot({
          url: process.env.CAD_AUTO_ONTOLOGY_URL, apiKey: process.env.CAD_AUTO_ONTOLOGY_API_KEY,
          snapshot: process.env.CAD_AUTO_ONTOLOGY_SNAPSHOT ? JSON.parse(readFileSync(process.env.CAD_AUTO_ONTOLOGY_SNAPSHOT, "utf8")) : undefined,
          allowProductMetadata: process.env.CAD_AUTO_ONTOLOGY_ALLOW_PRODUCT_METADATA === "1",
        });
      } catch { gateway = createAutoOntologyPilot(); }
    }
    void gateway.middleware(req, res, next);
  };
  return { name: "cad-auto-ontology-pilot", configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); } };
}
