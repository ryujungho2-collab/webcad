import type { Sketch } from "@agent-webcad/cad-document";
import { sketchEditImpact } from "../state/canvasDimensionEdit";
import type { CanvasEditReview } from "./CanvasDimensionEditor";

/** One review language for a numeric edit and a pointer/handle edit. */
export function CanvasEditImpact({review,sketch,constraintId="",geometryIds=[],onInspectConstraint}: {
  review?:CanvasEditReview;sketch?:Sketch;constraintId?:string;geometryIds?:string[];onInspectConstraint:(id:string|null)=>void;
}){
  const sources=review?.sources??(sketch?{before:sketch,after:sketch}:undefined);
  const impact=sources?sketchEditImpact(sources.before,sources.after,constraintId,geometryIds):undefined;
  return <>
    {review?.plan.result.ok&&<div className="dimension-impact" data-testid="dimension-impact">
      <p><span className="preview-before-key">Before</span> → <span className="preview-after-key">Preview</span> · {impact?`${impact.changedGeometryIds.length} sketch entities change`:`${review.plan.changes.length} objects change`}</p>
      {sources&&<p>Sketch freedom: {sources.before.solveState.degreesOfFreedom} → {sources.after.solveState.degreesOfFreedom}</p>}
      {Object.entries(review.plan.variables.after).filter(([key,v])=>v.value!==review.plan.variables.before[key]?.value).map(([key,v])=><p key={key} data-impact-variable={key}>{key}: {review.plan.variables.before[key]?.value.toFixed(3)} → {v.value.toFixed(3)} {v.unit}</p>)}
      {review.plan.changes.filter(c=>c.before?.volume!==undefined||c.after?.volume!==undefined||c.measurementError).map(c=><div key={c.objectId} data-impact-object={c.objectId}>
        <strong>{c.name}</strong>{c.before?.volume!==undefined&&c.after?.volume!==undefined?<p>Volume: {c.before.volume.toFixed(3)} → {c.after.volume.toFixed(3)} mm³ · {c.after.basis}</p>:<p>{c.kind} · {c.after?.basis??c.before?.basis}</p>}
        {c.measurementError&&<p role="alert">{c.measurementError}</p>}
      </div>)}
      {review.plan.bindingChanges.filter(c=>!c.after).map(c=><p key={c.id}>Release binding: {c.before?.expression}</p>)}
    </div>}
    {impact&&<details open className="dimension-relations"><summary>Related constraints · {impact.relations.length}</summary>
      {impact.relations.map(r=><div key={r.id} data-impact-constraint={r.id} data-relation-status={r.status}><button type="button" className="dimension-relation-inspect" aria-label={`Inspect relation ${r.id}`} title="Highlight related geometry"
        onPointerEnter={()=>onInspectConstraint(r.id)} onPointerLeave={()=>onInspectConstraint(null)} onFocus={()=>onInspectConstraint(r.id)} onBlur={()=>onInspectConstraint(null)}>
        {r.status==="maintained"?"Maintained":r.status==="released"?"Release on Apply":"Change"}: {r.before}{r.status==="changed"?` → ${r.after}`:""}</button></div>)}
    </details>}
  </>;
}
