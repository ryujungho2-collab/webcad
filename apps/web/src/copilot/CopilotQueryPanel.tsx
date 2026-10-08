import { PropertySection } from "../ui/PropertySection";
import type { CopilotQueryRelation } from "./copilotQuery";
import { COPILOT_QUERY_LIMITS } from "./copilotQuery";
import type { CopilotQueryState } from "./useCopilotQuery";

export type CopilotQueryPanelProps = { state: CopilotQueryState; selectionCount: number; onRead: () => void; onCancel: () => void; onInspect: (id: string) => void; onEditSketch: (id: string) => void };
const labels: Record<NonNullable<CopilotQueryRelation["relation"]>,string> = { "live-input":"Live source", "snapshot-source":"Independent snapshot of", "annotation-source":"Measures / references", "sketch-owner":"Solved by sketch", "parameter-binding":"Driven by expression", "variable-reference":"Variable input", "block-instance":"Instance of definition" };
const number=(value:number)=>Number(value.toPrecision(10)).toString();

export function CopilotQueryPanel({state,selectionCount,onRead,onCancel,onInspect,onEditSketch}:CopilotQueryPanelProps) {
  const missing=!selectionCount?"Select objects on the canvas or in Model tree to read.":selectionCount>COPILOT_QUERY_LIMITS.objects?"Select at most 50 objects. Split the selection into smaller groups.":undefined;
  const relation=(entry:CopilotQueryRelation)=><li key={`${entry.kind}:${entry.id}:${entry.relation??"affected"}`}>
    {entry.relation?`${labels[entry.relation]}: `:""}{entry.name}{entry.missing?" · missing source":""}
    {entry.kind==="object"&&!entry.missing&&<button type="button" onClick={()=>onInspect(entry.id)}>Inspect source</button>}
    {entry.operation&&<small>{entry.operation}</small>}
  </li>;
  return <PropertySection title="Read selection" meta="Local Query">
    <section aria-label="Copilot selection read" data-query-stage={state.status}>
      <p className="property-hint">Read {selectionCount} selected object{selectionCount===1?"":"s"} locally. No gateway request or document edit. Up to 50 objects · 64 KiB result · 30 s deadline.</p>
      <div className="sketch-actions"><button type="button" onClick={onRead} disabled={!!missing||state.status==="loading"}>Read selection</button>{state.status==="loading"&&<button type="button" onClick={onCancel}>Cancel read</button>}</div>
      {missing&&<p className="property-hint">{missing}</p>}
      {state.status==="loading"&&<p role="status">Reading geometry and stored relationships… You can cancel or change the selection.</p>}
      {state.error&&<p role="alert">{state.error}</p>}
      {state.result&&<>
        <p role="status">Read {state.result.objects.length} object{state.result.objects.length===1?"":"s"}. Inspect a target or source to continue editing.</p>
        {state.result.labelsShortened&&<p className="property-hint">Long labels are shortened; object identities remain complete in diagnostics.</p>}
        {state.result.objects.map(object=><article key={object.id} data-query-object-id={object.id}>
          <strong>{object.name}</strong><small>{object.type} · {object.representation}{object.layer?` · ${object.layer.name}`:""}</small>
          {object.error&&<p role="alert">{object.error} {object.recovery}</p>}
          {object.editabilityReasons.map(reason=><p key={reason} className="property-hint">{reason}{object.layer?.locked?" Unlock the source layer in Layers before editing.":" Inspect the source in Model tree before editing."}</p>)}
          {!object.error&&!object.editabilityReasons.length&&<small>Layer and visibility permit editing. Stored constraints and ownership still apply.</small>}
          {object.measurement&&<div aria-label="Read measurements">
            <small>Basis: {object.measurement.basis}{object.measurement.validity?` · ${object.measurement.validity}`:""}</small>
            {object.measurement.length!==undefined&&<p>Length: {number(object.measurement.length)} mm</p>}
            {object.measurement.area!==undefined&&<p>Area: {number(object.measurement.area)} mm²</p>}
            {object.measurement.volume!==undefined&&<p>Volume: {number(object.measurement.volume)} mm³</p>}
            {object.measurement.bounds&&<small>Bounds: {object.measurement.bounds.min.map(number).join(", ")} → {object.measurement.bounds.max.map(number).join(", ")} mm</small>}
          </div>}
          {object.measurementNote&&<p className="property-hint">{object.measurementNote}</p>}
          {object.operation&&<p className="property-hint">Definition: {object.operation}</p>}
          <details open={object.sourceCount>0}><summary>{object.sourceCount} stored sources · {object.affectedCount} potentially affected objects</summary>
            {!!object.sources.length&&<ul>{object.sources.map(relation)}</ul>}
            {object.sourceCount>object.sources.length&&<small>Showing {object.sources.length} of {object.sourceCount} sources. Inspect the object for the full relationship graph.</small>}
            {!!object.affected.length&&<><small>Potential downstream effects:</small><ul>{object.affected.map(relation)}</ul></>}
            {object.affectedCount>object.affected.length&&<small>Showing {object.affected.length} of {object.affectedCount} affected objects.</small>}
          </details>
          {object.solveGroups.map(group=><p key={group.sketchId}>{group.constraintCount} simultaneous constraints · {group.degreesOfFreedom} degrees of freedom · residual {number(group.residual)}</p>)}
          {object.solveGroupCount>object.solveGroups.length&&<small>Showing {object.solveGroups.length} of {object.solveGroupCount} solve groups.</small>}
          {object.type&&<div className="sketch-actions"><button type="button" onClick={()=>onInspect(object.id)}>Inspect object</button>{object.sketchId&&<button type="button" disabled={!object.editable} onClick={()=>onEditSketch(object.sketchId!)}>Edit Sketch</button>}</div>}
          <details><summary>Reference diagnostics</summary><small>Object: {object.id}</small>{object.layer&&<small>Layer: {object.layer.id}</small>}</details>
        </article>)}
        <small>Read result: {state.result.byteLength} bytes · units mm / rad / deg</small>
      </>}
    </section>
  </PropertySection>;
}
