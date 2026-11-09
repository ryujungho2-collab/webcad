import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { serializeDocument } from "@agent-webcad/cad-document";
import { createAutoOntologyPilot } from "../server/autoOntologyPilot";
import { buildPilotRequest, requestPilotExplanation, validatePilotResponse } from "../src/ontology/profileExtrudePilot";
import { queryProfileExtrudeRelations } from "../src/state/profileExtrudeRelations";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory } from "../src/state/history";
import { buildProfileExtrudeRelationFixture } from "./helpers/profileExtrudeRelationFixture";
import { autoOntologyRequest, autoOntologySnapshot, externalRelationRows, ontologyEventResponse } from "./helpers/autoOntologyFixture";

const options = { url: "http://localhost:38100", apiKey: "server-only-test-key", snapshot: autoOntologySnapshot };

test("both selected directions use the native report and match verified external rows without changing CAD", async () => {
  await buildProfileExtrudeRelationFixture();
  const before = serializeDocument(cadDocument), history = cadHistory.getStateToken();
  const requests: { headers: Headers; body: Record<string, unknown> }[] = [];
  const gateway = createAutoOntologyPilot({ ...options, fetcher: async (_url, init) => {
    requests.push({ headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
    return ontologyEventResponse();
  } });
  for (const id of ["profile", "solid"]) {
    const report = queryProfileExtrudeRelations(cadDocument, id);
    const request = buildPilotRequest(report, autoOntologyRequest.context, `request-${id}`);
    const response = await gateway.explain(request, new AbortController().signal);
    assert.deepEqual(validatePilotResponse(response, request), response);
    assert.match(response.summary, /profile → solid · live · resolved/);
    assert.doesNotMatch(response.summary, /Unverified model prose/);
  }
  assert.match(String(requests[0].body.question), /source_id/);
  assert.match(String(requests[1].body.question), /target_id/);
  assert.equal(requests[0].headers.get("x-api-key"), "server-only-test-key");
  assert.deepEqual(Object.keys(requests[0].body).sort(), ["evidence", "prediction", "question"]);
  assert.doesNotMatch(JSON.stringify(requests[0].body), /session-one|request-profile|codeEvidence|geometryId/);
  assert.equal(serializeDocument(cadDocument), before);
  assert.equal(cadHistory.getStateToken(), history);
});

test("disabled, unregistered, mismatching and unconsented metadata never reaches the external gateway", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return ontologyEventResponse(); };
  await assert.rejects(createAutoOntologyPilot({ fetcher }).explain(autoOntologyRequest, new AbortController().signal));
  const gateway = createAutoOntologyPilot({ ...options, fetcher });
  for (const request of [
    { ...autoOntologyRequest, consent: false },
    { ...autoOntologyRequest, context: { ...autoOntologyRequest.context, documentId: "another" } },
    { ...autoOntologyRequest, context: { ...autoOntologyRequest.context, revision: 3 } },
    { ...autoOntologyRequest, relations: [{ ...autoOntologyRequest.relations[0], mode: "snapshot" }] },
    { ...autoOntologyRequest, selectedObjectId: "absent" },
  ]) await assert.rejects(gateway.explain(request, new AbortController().signal));
  const product = { ...autoOntologySnapshot, dataClass: "product" as const };
  assert.equal(createAutoOntologyPilot({ ...options, snapshot: product, fetcher }).status.available, false);
  assert.equal(calls, 0);
  assert.equal(createAutoOntologyPilot({ ...options, snapshot: product, allowProductMetadata: true }).status.available, true);
  assert.throws(() => createAutoOntologyPilot({ ...options, url: "http://external.example" }));
});

test("rows must explicitly preserve document, revision, direction, ownership and missing flags", async () => {
  const original = externalRelationRows()[0];
  for (const altered of [
    { ...original, document_id: "other" }, { ...original, revision: 3 },
    { ...original, source_id: "solid", target_id: "profile" }, { ...original, mode: "snapshot" },
    { ...original, source_missing: 1 }, { ...original, source_sketch_owners: undefined },
    { ...original, source_sketch_owners: '[{"sketchId":"invented","missing":false}]' },
  ]) {
    const gateway = createAutoOntologyPilot({ ...options, fetcher: async () => ontologyEventResponse([altered]) });
    await assert.rejects(gateway.explain(autoOntologyRequest, new AbortController().signal));
  }
  await assert.rejects(createAutoOntologyPilot({ ...options, fetcher: async () => ontologyEventResponse([]) })
    .explain(autoOntologyRequest, new AbortController().signal));
});

test("the client rejects another request/session/generation and times out even when a body ignores abort", async () => {
  const response = await createAutoOntologyPilot({ ...options, fetcher: async () => ontologyEventResponse() })
    .explain(autoOntologyRequest, new AbortController().signal);
  for (const changed of [
    { ...response, requestId: "other" },
    { ...response, context: { ...response.context, sessionId: "reopened-same-id" } },
    { ...response, context: { ...response.context, generation: 9 } },
    { ...response, summary: "Model claims the geometry was changed." },
  ]) assert.throws(() => validatePilotResponse(changed, autoOntologyRequest));
  const hanging: typeof fetch = async () => ({ ok: true, text: () => new Promise<string>(() => {}) }) as Response;
  await assert.rejects(requestPilotExplanation(autoOntologyRequest, new AbortController().signal, 20, hanging), /timed out/);
  const cancelled = new AbortController();
  const pending = requestPilotExplanation(autoOntologyRequest, cancelled.signal, 10000, hanging);
  cancelled.abort();
  await assert.rejects(pending, /cancelled/);
});

test("HTTP origin policy and server deadline keep failed upstream requests bounded", async () => {
  const gateway = createAutoOntologyPilot({ ...options, timeoutMs: 50, fetcher: async (_url, init) =>
    new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(Error("aborted")), { once: true })) });
  const server = createServer((req, res) => { void gateway.middleware(req, res, () => { res.writeHead(404); res.end(); }); });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api/ontology/profile-extrude`;
  try {
    assert.equal((await fetch(`${base}/status`, { headers: { Origin: "https://other.example" } })).status, 403);
    const status = await (await fetch(`${base}/status`)).json();
    assert.equal(status.dataClass, "synthetic"); assert.ok(!JSON.stringify(status).includes("server-only-test-key"));
    const response = await fetch(`${base}/explain`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(autoOntologyRequest) });
    assert.equal(response.status, 504);
  } finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
