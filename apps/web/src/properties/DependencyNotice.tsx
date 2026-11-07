import { useMemo } from "react";
import { cadDocument } from "../state/cadDocument";
import { buildDependencyGraph, explainObjectDependencies, type DependencyEdge } from "../state/dependencyGraph";
import { PropertySection } from "../ui/PropertySection";
import { constructionExpression } from "@agent-webcad/cad-document";
import { documentSessionIdentity } from "../state/documentSession";
import { queryProfileExtrudeRelations, type ProfileExtrudeRelationReport } from "../state/profileExtrudeRelations";
import { downloadFile } from "../export/exportModel";
import { AutoOntologyRelationPilot } from "./AutoOntologyRelationPilot";
const label: Record<DependencyEdge["relation"], string> = { "live-input": "Live source", "snapshot-source": "Independent snapshot of", "annotation-source": "Measures / references", "sketch-owner": "Solved by sketch", "parameter-binding": "Driven by expression", "variable-reference": "Variable input", "component-content":"Component content definition", "block-instance": "Instance of definition" };

function ProfileExtrudeNotice({ report }: { report: ProfileExtrudeRelationReport }) {
  return <div aria-label="Profile and Extrude relations">
    <p><strong>Profile ↔ Extrude</strong> · {report.document.id} · revision {report.document.revision}</p>
    {!report.relations.length && <p>No recorded direct Profile ↔ Extrude link.</p>}
    {report.relations.map(relation => <div key={JSON.stringify([relation.source.objectId, relation.target.objectId])}>
      <p><strong>{relation.mode === "live" ? "Live input" : "Recorded snapshot"}</strong>
        {" · "}{relation.viewedFrom === "outgoing" ? "Uses this profile" : "Source for this extrusion"}</p>
      <p>{relation.source.label} (<code>{relation.source.objectId}</code>) → {relation.target.label} (<code>{relation.target.objectId}</code>)</p>
      {relation.status === "missing-source" && <p role="status">Missing source object</p>}
      {relation.status === "missing-source-feature" && <p role="status">Missing source feature</p>}
      {[relation.source, relation.target].map(endpoint => endpoint.sketchOwners.map(owner =>
        <p key={JSON.stringify([endpoint.objectId, owner.sketchId])}>
          {endpoint.objectId} · Sketch owner <code>{owner.sketchId}</code>{owner.missing ? " · missing" : ""}
        </p>))}
    </div>)}
    <button type="button" onClick={() => downloadFile(JSON.stringify(report, null, 2),
      "profile-extrude-relations.json", "application/json")}>Download relation JSON</button>
    <AutoOntologyRelationPilot report={report} />
  </div>;
}

/** This explanation reads saved relationships; it does not infer construction
 * history from coincident coordinates or invent a point's origin. */
export function DependencyNotice({ objectId, revision }: { objectId: string; revision: number }) {
  const session = documentSessionIdentity();
  const { info, report } = useMemo(() => {
    const graph = buildDependencyGraph(cadDocument);
    return { info: explainObjectDependencies(graph, objectId), report: queryProfileExtrudeRelations(cadDocument, objectId, graph) };
  }, [objectId, revision, session]);
  const construction = Object.values(cadDocument.features).find(f => f.output === objectId)?.construction;
  return <PropertySection title="Dependencies" defaultOpen={false} meta={`${info.immediate.length} sources · ${info.affected.filter(n => n.kind === "object").length} downstream`}>
    <div aria-label="Object dependency explanation">
      {construction && <><p><strong>Definition</strong>: <code>{constructionExpression(construction, id => cadDocument.objects[id]?.name ?? id)}</code></p><p>Edit the live sources, or reassign the saved sources and elements in Construction definition. Derived coordinates follow automatically.</p></>}
      {info.immediate.length ? info.immediate.map(e => <p key={`${e.source.id}:${e.relation}`}><strong>{label[e.relation]}</strong>: {e.source.label}{e.source.missing ? " · missing source" : ""}{e.source.operation && e.source.kind === "binding" ? ` → ${e.source.operation}` : ""}</p>) : <p>Independent source. No construction relationship is stored for this object.</p>}
      {info.affected.some(n => n.kind === "object") && <p>Potential live effects: {info.affected.filter(n => n.kind === "object").map(n => `${n.label} (${n.sourceId})`).join(", ")}</p>}
      {(report.role === "extrude" || report.role === "profile-candidate") && <ProfileExtrudeNotice report={report} />}
      {info.solveGroups.map(g => <div key={g.sketchId}><small>{g.degreesOfFreedom} degrees of freedom · {g.constraints.length} simultaneous constraints</small>{g.constraints.map(c => <p key={c.id}>{c.kind}{typeof c.value === "number" ? ` = ${Number((c.kind === "angle" ? c.value * 180 / Math.PI : c.value).toFixed(6))}${c.kind === "angle" ? "°" : " mm"}` : ""} · <code>{c.id}</code></p>)}</div>)}
    </div>
  </PropertySection>;
}

