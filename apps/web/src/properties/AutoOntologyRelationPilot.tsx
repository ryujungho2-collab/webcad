import { useEffect, useRef, useState } from "react";
import type { ProfileExtrudeRelationReport } from "../state/profileExtrudeRelations";
import { documentSessionIdentity, documentVersion, sameDocumentVersion, subscribeDocumentChanges } from "../state/documentSession";
import { buildPilotRequest, pilotStatusSchema, requestPilotExplanation, type PilotStatus } from "../ontology/profileExtrudePilot";

type Result = { phase: "idle" | "loading" | "verified" | "fallback" | "stale"; message: string };
const idle: Result = { phase: "idle", message: "Native relations are ready." };
let consentSession: string | undefined;

export function AutoOntologyRelationPilot({ report }: { report: ProfileExtrudeRelationReport }) {
  const session = documentSessionIdentity();
  const [status, setStatus] = useState<PilotStatus>();
  const [consent, setConsent] = useState(() => consentSession === session);
  const [result, setResult] = useState<Result>(idle);
  const active = useRef<{ id: string; controller: AbortController } | undefined>(undefined);
  const selected = useRef(report.selectedObjectId);
  selected.current = report.selectedObjectId;

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/ontology/profile-extrude/status", { signal: controller.signal }).then(async response => {
      if (response.ok) {
        const parsed = pilotStatusSchema.parse(await response.json());
        if (!controller.signal.aborted) setStatus(parsed);
      }
    }).catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    setConsent(consentSession === session);
  }, [session]);
  useEffect(() => {
    active.current?.controller.abort(); active.current = undefined;
    setResult(idle);
    return () => { active.current?.controller.abort(); active.current = undefined; };
  }, [report.selectedObjectId, report.document.revision, session]);
  useEffect(() => subscribeDocumentChanges(() => {
    if (active.current) {
      active.current.controller.abort(); active.current = undefined;
      setResult({ phase: "stale", message: "Document changed. The external response was discarded; native relations are current." });
    }
  }), []);

  const matchesSnapshot = status?.document?.id === report.document.id && status?.document?.revision === report.document.revision;
  const eligible = !!(status?.available && matchesSnapshot && report.relations.length);
  async function explain() {
    if (!eligible || !consent || !status) return;
    const version = documentVersion();
    const capturedSession = documentSessionIdentity();
    const requestId = crypto.randomUUID();
    const controller = new AbortController();
    active.current?.controller.abort(); active.current = { id: requestId, controller };
    setResult({ phase: "loading", message: "Checking the external snapshot. Native relations are ready." });
    try {
      const request = buildPilotRequest(report, {
        documentId: version.documentId, revision: version.revision, generation: version.generation, sessionId: capturedSession,
      }, requestId);
      const response = await requestPilotExplanation(request, controller.signal, status.timeoutMs);
      if (active.current?.id !== requestId) return;
      if (!sameDocumentVersion(version) || capturedSession !== documentSessionIdentity() || selected.current !== request.selectedObjectId) {
        setResult({ phase: "stale", message: "The external response is outdated. Native relations are current." }); return;
      }
      setResult({ phase: "verified", message: response.summary });
    } catch (error) {
      if (active.current?.id === requestId) setResult({ phase: "fallback", message: error instanceof Error ? error.message : "Native relations remain available." });
    }
  }
  function cancel() {
    active.current?.controller.abort(); active.current = undefined;
    setResult({ phase: "fallback", message: "External request cancelled. Native relations remain available." });
  }
  return <div aria-label="Auto Ontology relation pilot" data-pilot-state={result.phase}>
    <p><strong>Auto Ontology · read-only pilot</strong></p>
    <p>{!status?.available ? "External lookup is disabled. Configure a registered local snapshot on the server."
      : !matchesSnapshot ? "This document revision has no registered external snapshot."
      : status.dataClass === "synthetic" ? "Synthetic snapshot only. Product metadata transmission is disabled."
      : "Product relation metadata transmission is enabled for this registered snapshot."}</p>
    {eligible && <label><input type="checkbox" aria-label="Allow external relation lookup for this session" checked={consent}
      onChange={event => {
        consentSession = event.target.checked ? session : undefined;
        setConsent(event.target.checked); if (!event.target.checked) cancel();
      }} />
      Send selected relation IDs, modes and document revision to the configured local Auto Ontology gateway for this session.</label>}
    <button type="button" disabled={!eligible || !consent || result.phase === "loading"} onClick={() => void explain()}>Explain with Auto Ontology</button>
    {result.phase === "loading" && <button type="button" onClick={cancel}>Cancel external explanation</button>}
    <p role="status" aria-live="polite">{result.message}</p>
    {result.phase === "verified" && <small>Explanation is generated from external rows verified against the native relation report.</small>}
  </div>;
}
