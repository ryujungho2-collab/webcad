import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Sketch, SketchConstraint } from "@agent-webcad/cad-document";
import { cadDocument } from "../state/cadDocument";
import { canvasDimensionDriver, constraintCaption, dimensionEditWithReleases } from "../state/canvasDimensionEdit";
import { applyCadPlan, discardCadPlan, getCadPlanSketchPreview, previewCadCommand, type CadPlanPreview } from "../state/documentPlans";
import { sameDocumentVersion, subscribeDocumentChanges } from "../state/documentSession";
import { CanvasEditImpact } from "./CanvasEditImpact";
import { commandInteraction } from "../state/commandInteraction";
import { CommandReview } from "../ui/CommandReview";
import { constraintGeometryIds } from "../precision/sketchEditing";

export type CanvasEditReview={plan:CadPlanPreview;sources?:{before:Sketch;after:Sketch}};
type Props={sketch:Sketch;constraint:SketchConstraint;name:string;style:CSSProperties;disabled:boolean;
  onReview:(review:CanvasEditReview|undefined)=>void;onClose:()=>void;onApplied:()=>void;
  onRemove:()=>void;onEditConstraint:(id:string)=>void;onInspectConstraint:(id:string|null)=>void};

export function CanvasDimensionEditor({sketch,constraint,name,style,disabled,onReview,onClose,onApplied,onRemove,onEditConstraint,onInspectConstraint}:Props){
  const [driver,setDriver]=useState(()=>canvasDimensionDriver(cadDocument,sketch,constraint));
  const [draft,setDraft]=useState(driver.draft),[releases,setReleases]=useState<string[]>([]);
  const [review,setReview]=useState<CanvasEditReview>(),[error,setError]=useState("");
  const [working,setWorking]=useState(false),[applying,setApplying]=useState(false),[stale,setStale]=useState(false),[refresh,setRefresh]=useState(0);
  const [collapsed,setCollapsed]=useState(false);
  const [reviewedKey,setReviewedKey]=useState<string>();
  const draftKey=JSON.stringify([draft,releases,refresh]);
  const inputRef=useRef<HTMLInputElement>(null),sequence=useRef(0);
  useEffect(()=>{inputRef.current?.focus();inputRef.current?.select();},[]);
  useEffect(()=>subscribeDocumentChanges(()=>{sequence.current++;setStale(true);setWorking(false);onReview(undefined);}),[onReview]);
  useEffect(()=>{
    const request=++sequence.current,controller=new AbortController();let ownedPlan:string|undefined;
    setReview(undefined);setError("");onReview(undefined);
    if(disabled||stale||(!releases.length&&draft===driver.draft)){setWorking(false);return;}
    setWorking(true);
    const timer=setTimeout(()=>{void(async()=>{
      try{
        const edit=driver.command(draft);
        const unchanged=edit.type==="set-sketch-dimension"&&"value" in constraint&&edit.value===constraint.value
          ||edit.type==="set-variable"&&edit.expression===cadDocument.variables?.[edit.name]?.expression
          ||edit.type==="set-parameter-binding"&&Object.values(cadDocument.parameterBindings??{}).some(b=>JSON.stringify(b.target)===JSON.stringify(edit.target)&&b.expression===edit.expression);
        if(unchanged&&!releases.length)return;
        const command=dimensionEditWithReleases(edit,sketch.id,releases);
        const plan=await previewCadCommand(command,{signal:controller.signal});ownedPlan=plan.planId;
        if(request!==sequence.current||controller.signal.aborted){discardCadPlan(plan.planId);return;}
        const next={plan,sources:getCadPlanSketchPreview(plan.planId,sketch.id)};
        setReview(next);setReviewedKey(draftKey);setStale(plan.stale);if(!plan.stale)onReview(next);
        if(!plan.result.ok)setError(plan.result.reason??"Edit rejected.");
      }catch(cause){if(request===sequence.current&&!controller.signal.aborted)setError(cause instanceof Error?cause.message:"Preview failed.");}
      finally{if(request===sequence.current)setWorking(false);}
    })();},280);
    return ()=>{clearTimeout(timer);controller.abort();if(ownedPlan)discardCadPlan(ownedPlan);};
  },[draft,releases,refresh,driver,disabled,stale,sketch.id,onReview]);
  useEffect(()=>()=>{onReview(undefined);onInspectConstraint(null);},[onReview,onInspectConstraint]);
  const diagnostic=review?.plan.result.diagnostic;
  // The solver identifies residual conflicts, not a unique set to remove. Offer explicit choices only.
  const blockers=diagnostic?.kind==="sketch-conflict"&&diagnostic.sketchId===sketch.id
    ? sketch.constraints.filter(c=>diagnostic.constraintIds.includes(c.id)&&c.id!==constraint.id&&!releases.includes(c.id)):[];
  const interaction=commandInteraction({command:"Edit Dimension",draftKey,reviewedKey,preview:review?.plan,targets:constraintGeometryIds(constraint),pending:applying,inputError:disabled?"Sketch layer is hidden or locked.":stale?"Document changed. Refresh preview before applying.":error,visualReady:!working,numericParameters:{value:draft}});
  const ready=interaction.canApply;
  // Publish can update sketch props before Apply closes the editor. A released
  // constraint belongs to the reviewed baseline, not the already changed source.
  const releaseSource=review?.sources?.before??sketch;
  const releaseCaptions=releases.map(id=>{const relation=releaseSource.constraints.find(c=>c.id===id);return relation?constraintCaption(releaseSource,relation):id;});
  async function apply(){
    if(!ready||!review)return;setApplying(true);
    try{const result=await applyCadPlan(review.plan.planId);if(result.ok){onApplied();onClose();}else{setError(result.reason??"Edit rejected.");setStale(!sameDocumentVersion(review.plan.baseVersion));}}
    catch(cause){setError(cause instanceof Error?cause.message:"Edit rejected.");}finally{setApplying(false);}
  }
  const status=stale?"stale":working?"working":error?"blocked":ready?"ready":"unchanged";
  return <form data-cad-editor data-preview-status={status} className="sketch-dimension-editor" style={style}
    onSubmit={e=>{e.preventDefault();void apply();}} onKeyDown={e=>{e.stopPropagation();if(e.key==="Escape"&&!applying){e.preventDefault();onClose();}}}>
    <div className="dimension-title"><strong>{name}</strong><button type="button" aria-expanded={!collapsed} onClick={()=>setCollapsed(v=>!v)}>{collapsed?"Expand review":"Collapse review"}</button></div><p className="dimension-driver" data-dimension-driver={driver.kind}>{driver.label}</p>
    <label>{driver.kind==="dimension"?"Value":"Expression"}<input ref={inputRef} aria-label="Canvas dimension value" value={draft} disabled={applying||disabled} onChange={e=>{setDraft(e.target.value);}}/></label>
    <div className="dimension-preview-status" role="status">{stale?"Document changed. Refresh preview before applying.":working?"Solving sketch and checking dependent geometry…":ready?"Preview ready · document unchanged":error?"Edit blocked · document unchanged":"Change the value to preview its effect."}</div>
    {stale&&<button type="button" disabled={applying||disabled} onClick={()=>{setDriver(canvasDimensionDriver(cadDocument,sketch,constraint));setStale(false);setRefresh(n=>n+1);}}>Refresh preview</button>}
    {error&&!stale&&<p role="alert">{error}</p>}
    {!collapsed&&<CommandReview state={interaction}/>}
    {!collapsed&&<CanvasEditImpact review={!stale?review:undefined} sketch={sketch} constraintId={constraint.id} onInspectConstraint={onInspectConstraint}/>}
    {releases.length>0&&<div className="dimension-releases"><p>Release on Apply: {releaseCaptions.join("; ")}</p><button type="button" onClick={()=>setReleases([])}>Keep all constraints</button></div>}
    {blockers.length>0&&<div className="dimension-blockers"><strong>Conflicting constraints · choose what to keep</strong>{blockers.map(c=><div key={c.id}><span>{constraintCaption(sketch,c)}</span>
      {"value" in c&&typeof c.value==="number"&&<button type="button" onClick={()=>onEditConstraint(c.id)}>Edit {c.id}</button>}
      <button type="button" onClick={()=>setReleases(ids=>[...ids,c.id])}>Preview release {c.id}</button>
    </div>)}</div>}
    <div className="dimension-actions"><button type="submit" disabled={!ready}>Apply</button><button type="button" disabled={applying} onClick={onClose}>Cancel</button><button type="button" disabled={applying||disabled} onClick={onRemove}>Remove constraint</button></div>
    {disabled&&<p role="alert">Sketch layer is hidden or locked.</p>}
  </form>;
}
