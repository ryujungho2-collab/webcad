import { useMemo } from "react";
import { cadDocument } from "../state/cadDocument";
import { buildDependencyGraph, explainObjectDependencies, type DependencyEdge } from "../state/dependencyGraph";
import { PropertySection } from "../ui/PropertySection";
import { constructionExpression } from "@agent-webcad/cad-document";
const label: Record<DependencyEdge["relation"], string> = { "live-input": "Live source", "snapshot-source": "Independent snapshot of", "annotation-source": "Measures / references", "sketch-owner": "Solved by sketch", "parameter-binding": "Driven by expression", "variable-reference": "Variable input", "block-instance": "Instance of definition" };

/** This explanation reads saved relationships; it does not infer construction
 * history from coincident coordinates or invent a point's origin. */
export function DependencyNotice({ objectId, revision }: { objectId: string; revision: number }) {
  const info = useMemo(() => explainObjectDependencies(buildDependencyGraph(cadDocument), objectId), [objectId, revision]);
  const construction = Object.values(cadDocument.features).find(f => f.output === objectId)?.construction;
  return <PropertySection title="Dependencies" defaultOpen={false} meta={`${info.immediate.length} sources · ${info.affected.filter(n => n.kind === "object").length} downstream`}>
    <div aria-label="Object dependency explanation">
      {construction && <><p><strong>Definition</strong>: <code>{constructionExpression(construction, id => cadDocument.objects[id]?.name ?? id)}</code></p><p>Edit the live sources below. Derived coordinates follow automatically; they cannot be overwritten independently.</p></>}
      {info.immediate.length ? info.immediate.map(e => <p key={`${e.source.id}:${e.relation}`}><strong>{label[e.relation]}</strong>: {e.source.label}{e.source.missing ? " · missing source" : ""}{e.source.operation && e.source.kind === "binding" ? ` → ${e.source.operation}` : ""}</p>) : <p>Independent source. No construction relationship is stored for this object.</p>}
      {info.affected.some(n => n.kind === "object") && <p>Potential live effects: {info.affected.filter(n => n.kind === "object").map(n => `${n.label} (${n.sourceId})`).join(", ")}</p>}
      {info.solveGroups.map(g => <div key={g.sketchId}><small>{g.degreesOfFreedom} degrees of freedom · {g.constraints.length} simultaneous constraints</small>{g.constraints.map(c => <p key={c.id}>{c.kind}{typeof c.value === "number" ? ` = ${Number((c.kind === "angle" ? c.value * 180 / Math.PI : c.value).toFixed(6))}${c.kind === "angle" ? "°" : " mm"}` : ""} · <code>{c.id}</code></p>)}</div>)}
    </div>
  </PropertySection>;
}
