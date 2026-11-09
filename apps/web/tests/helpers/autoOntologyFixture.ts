import { pilotSnapshotSchema, type PilotRequest } from "../../src/ontology/profileExtrudePilot";

export const autoOntologySnapshot = pilotSnapshotSchema.parse({
  dataClass: "synthetic", document: { id: "test-document", revision: 2 }, relations: [{
    sourceId: "profile", targetId: "solid", direction: "profile-to-extrude", mode: "live", status: "resolved",
    sourceMissing: false, targetMissing: false, sourceSketchOwners: [], targetSketchOwners: [],
  }],
});
export const autoOntologyRequest: PilotRequest = {
  version: 1, requestId: "request-one", context: { documentId: "test-document", revision: 2, sessionId: "session-one", generation: 4 },
  selectedObjectId: "profile", direction: "outgoing", consent: true, relations: autoOntologySnapshot.relations,
};
export function externalRelationRows() {
  return autoOntologySnapshot.relations.map(row => ({
    document_id: autoOntologySnapshot.document.id, revision: autoOntologySnapshot.document.revision,
    source_id: row.sourceId, target_id: row.targetId, direction: row.direction, mode: row.mode, status: row.status,
    source_missing: Number(row.sourceMissing), target_missing: Number(row.targetMissing),
    source_sketch_owners: JSON.stringify(row.sourceSketchOwners), target_sketch_owners: JSON.stringify(row.targetSketchOwners),
  }));
}
export function ontologyEventResponse(rows: unknown = externalRelationRows()) {
  return new Response(`data: ${JSON.stringify({ type: "result", answer: {
    sql_code: "SELECT * FROM main.cad_profile_extrude", sql_response_from_db: [JSON.stringify(rows)],
    response: "Unverified model prose must not be displayed.",
  } })}\n\ndata: [DONE]\n\n`, { headers: { "Content-Type": "text/event-stream" } });
}
