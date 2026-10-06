import { interactionRecovery, type CommandInteraction } from "../state/commandInteraction";
import { cadDocument } from "../state/cadDocument";

/** Shared interaction grammar; domain controls and canvas renderers stay local. */
export function CommandReview({ state, onInspect }: { state: CommandInteraction; onInspect?: (ids: string[]) => void }) {
  const error = state.validationError;
  const problemIds=state.diagnostic?.geometryIds.length?state.diagnostic.geometryIds:state.targets;
  const artboards = state.preview?.impact?.find(row => row.kind === "Artboards");
  const name = (id: string) => cadDocument.objects[id]?.name ?? cadDocument.artboards?.[id]?.name ?? cadDocument.blocks?.[id]?.name ?? id;
  return <section className="cad-command-review" aria-label={`${state.command} review`} data-command-stage={state.stage}>
    <div><strong>{state.command}</strong><span>{state.stage === "input" ? "Input" : state.stage[0].toUpperCase() + state.stage.slice(1)}</span></div>
    <p role="status">{state.next}</p>
    {state.targets.length > 0 && <small>Targets: {state.targets.slice(0,3).map(name).join(" · ")}{state.targets.length>3?` · and ${state.targets.length-3} more`:""}</small>}
    {error && <div role="alert"><p>{error}</p>{interactionRecovery(error).map(text => <small key={text}>{text}</small>)}{onInspect && problemIds.length ? <button type="button" onClick={() => onInspect(problemIds)}>Show problem geometry</button> : null}</div>}
    {!!state.references?.length && <small>{state.references.filter(r => r.status === "preserved").length} preserved · {state.references.filter(r => r.status === "remapped").length} reconnected · {state.references.filter(r => r.status === "unresolved").length} unresolved relationships</small>}
    {state.preview?.result.ok && <details><summary>{!state.affectedObjectIds.length && artboards ? `${(artboards.created ?? 0) + artboards.modified + (artboards.deleted ?? 0)} affected artboards` : `${state.affectedObjectIds.length} affected objects`} · review changes</summary>{state.preview.impact?.map(row => <small key={row.kind}>{row.kind}: {row.before} → {row.after}{row.created ? ` · ${row.created} created` : ""}{row.modified ? ` · ${row.modified} updated` : ""}{row.deleted ? ` · ${row.deleted} deleted` : ""}</small>)}{state.preview.changes.map(c => <button type="button" key={c.objectId} disabled={!onInspect} onClick={() => onInspect?.([c.objectId])}>{c.name} · {c.kind}</button>)}</details>}
    {state.targets.length > 0 && <details><summary>Reference diagnostics</summary>{state.targets.map(id => <small key={id}>{name(id)}: {id}</small>)}</details>}
  </section>;
}
