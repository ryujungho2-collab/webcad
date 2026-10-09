import { PropertySection } from "../ui/PropertySection";
import { useState } from "react";
import { cadDocument } from "../state/cadDocument";
import type { CopilotQueryRelation } from "./copilotQuery";
import { COPILOT_QUERY_LIMITS } from "./copilotQuery";
import type { CopilotQueryState } from "./useCopilotQuery";

export type CopilotQueryPanelProps = { state: CopilotQueryState; selectionCount: number; targetId?:string; onTargetChange:(id?:string)=>void; onRead: () => void; onCancel: () => void; onInspect: (id: string) => void; onEditSketch: (id: string) => void; onOpenLayers:()=>void };
const labels: Record<NonNullable<CopilotQueryRelation["relation"]>,string> = { "live-input":"Live source", "snapshot-source":"Independent snapshot of", "annotation-source":"Measures / references", "sketch-owner":"Solved by sketch", "parameter-binding":"Driven by expression", "variable-reference":"Variable input", "block-instance":"Instance of definition" };
const number=(value:number)=>Number(value.toPrecision(10)).toString();

export function CopilotQueryPanel({state,selectionCount,targetId,onTargetChange,onRead,onCancel,onInspect,onEditSketch,onOpenLayers}:CopilotQueryPanelProps) {
  const [filter,setFilter]=useState("");
  const targets=Object.values(cadDocument.objects).filter(object=>!filter||`${object.name} ${object.id}`.toLowerCase().includes(filter.toLowerCase()));
  const options=targets.slice(0,COPILOT_QUERY_LIMITS.objects);
  if(targetId&&cadDocument.objects[targetId]&&!options.some(object=>object.id===targetId)){
    if(options.length===COPILOT_QUERY_LIMITS.objects)options.pop();
    options.unshift(cadDocument.objects[targetId]);
  }
  const missing=targetId?undefined:!selectionCount?"Select objects on the canvas or in Model tree, or choose a read target below.":selectionCount>COPILOT_QUERY_LIMITS.objects?"Select at most 50 objects. Split the selection into smaller groups.":undefined;
  const relation=(entry:CopilotQueryRelation,source=true)=>{
    const object=cadDocument.objects[entry.id],layer=object&&cadDocument.layers[object.layerId];
    const canInspect=!!object?.visible&&!!layer?.visible&&!layer?.locked;
    return <li key={`${entry.kind}:${entry.id}:${entry.relation??"affected"}`}>
    {entry.relation?`${labels[entry.relation]}: `:""}{entry.name}{entry.missing?" · missing source":""}
    {entry.kind==="object"&&!entry.missing&&<button type="button" disabled={!canInspect} title={canInspect?"Select in Model tree and inspect Properties":"Show or unlock this object before selecting it; choose it as a read target to inspect its restrictions."} onClick={()=>onInspect(entry.id)}>{source?"Inspect source":"Inspect affected object"}</button>}
    {entry.operation&&<small>{entry.operation}</small>}
  </li>;};
  return <PropertySection title="Read selection" meta="Local Query">
    <section className="copilot-query" aria-label="Copilot selection read" data-query-stage={state.status}>
      <p className="property-hint">Read {targetId?"one explicit target":`${selectionCount} selected object${selectionCount===1?"":"s"}`} locally. Up to 50 objects · 64 KiB result · 30 s deadline.</p>
      <label>Find read target<input aria-label="Find read target" value={filter} onChange={event=>setFilter(event.target.value)} placeholder="Name or reference…"/></label>
      <label>Read target<select aria-label="Read target" value={targetId??""} onChange={event=>onTargetChange(event.target.value||undefined)}><option value="">Current canvas selection</option>{options.map(object=><option key={object.id} value={object.id}>{object.name.slice(0,COPILOT_QUERY_LIMITS.text)}{cadDocument.layers[object.layerId]?.locked?" · locked":""}{!object.visible?" · hidden":""}</option>)}{targetId&&!cadDocument.objects[targetId]&&<option value={targetId}>Missing target</option>}</select></label>
      {targets.length>COPILOT_QUERY_LIMITS.objects&&<small>Showing the first 50 matches. Search to find another target.</small>}
      <p className="property-hint">A read target can be locked or hidden. It does not change canvas selection, send a gateway request or edit the document.</p>
      <div className="sketch-actions"><button type="button" onClick={onRead} disabled={!!missing||state.status==="loading"}>{targetId?"Read target":"Read selection"}</button>{state.status==="loading"&&<button type="button" onClick={onCancel}>Cancel read</button>}</div>
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
          {object.layer?.locked&&<button type="button" onClick={onOpenLayers}>Open Layers</button>}
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
            {!!object.sources.length&&<ul>{object.sources.map(entry=>relation(entry))}</ul>}
            {object.sourceCount>object.sources.length&&<small>Showing {object.sources.length} of {object.sourceCount} sources. Inspect the object for the full relationship graph.</small>}
            {!!object.affected.length&&<><small>Potential downstream effects:</small><ul>{object.affected.map(entry=>relation(entry,false))}</ul></>}
            {object.affectedCount>object.affected.length&&<small>Showing {object.affected.length} of {object.affectedCount} affected objects.</small>}
          </details>
          {object.solveGroups.map(group=><p key={group.sketchId}>{group.constraintCount} simultaneous constraints · {group.degreesOfFreedom} degrees of freedom · residual {number(group.residual)}</p>)}
          {object.solveGroupCount>object.solveGroups.length&&<small>Showing {object.solveGroups.length} of {object.solveGroupCount} solve groups.</small>}
          {object.type&&<div className="sketch-actions"><button type="button" disabled={!object.editable} title={object.editabilityReasons.join(" ")||"Select in Model tree and inspect Properties"} onClick={()=>onInspect(object.id)}>Inspect object</button>{object.sketchId&&<button type="button" disabled={!object.editable} onClick={()=>onEditSketch(object.sketchId!)}>Edit Sketch</button>}</div>}
          <details><summary>Reference diagnostics</summary><small>Object: {object.id}</small>{object.layer&&<small>Layer: {object.layer.id}</small>}</details>
        </article>)}
        <small>Read result: {state.result.byteLength} bytes · units mm / rad / deg</small>
      </>}
    </section>
  </PropertySection>;
}
