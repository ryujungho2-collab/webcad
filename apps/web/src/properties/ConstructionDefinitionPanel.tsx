import {useEffect,useRef,useState} from "react";
import {constructionExpression,type CadConstructionDefinition} from "@agent-webcad/cad-document";
import {cadDocument} from "../state/cadDocument";
import {previewCadCommand,applyCadPlan,discardCadPlan,getCadPlanDrawingPaths,getCadPlanConstructionStatus,type CadPlanPreview} from "../state/documentPlans";
import {commandInteraction} from "../state/commandInteraction";
import {PropertySection} from "../ui/PropertySection";
import {CommandReview} from "../ui/CommandReview";
import {constructionRoles,constructionSource,constructionElement,reassignConstructionSource,constructionReferenceChoices,constructionUsesCenterLine} from "../precision/constructionReferences";
import type {WorkPlaneId} from "../precision/workPlane";

export function ConstructionDefinitionPanel({objectId,revision,onDocumentChange}:{objectId:string;revision:number;onDocumentChange:()=>void}){
  const feature=Object.values(cadDocument.features).find(f=>f.output===objectId),saved=feature?.construction;
  const [draft,setDraft]=useState<CadConstructionDefinition|undefined>(saved),[review,setReview]=useState<CadPlanPreview>(),[reviewedKey,setReviewedKey]=useState<string>(),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const plan=useRef<string|undefined>(undefined),sequence=useRef(0);
  function cancel(){sequence.current++;if(plan.current)discardCadPlan(plan.current);plan.current=undefined;setReview(undefined);setReviewedKey(undefined);setBusy(false);}
  useEffect(()=>{cancel();setDraft(saved&&structuredClone(saved));setError("");},[objectId,revision]);
  useEffect(()=>()=>{sequence.current++;if(plan.current)discardCadPlan(plan.current);},[]);
  if(!saved||!draft)return null;
  const key=JSON.stringify([objectId,draft,revision]),locked=Boolean(cadDocument.layers[cadDocument.objects[objectId].layerId]?.locked);
  const interaction=commandInteraction({command:"Reassign construction",draftKey:key,reviewedKey,preview:review,pending:busy,targets:[objectId],idle:!review&&!busy});
  function change(next:CadConstructionDefinition){cancel();setError("");setDraft(next);}
  async function preview(){cancel();const ticket=++sequence.current;setBusy(true);setError("");try{
    const next=await previewCadCommand({type:"update-construction",objectId,definition:draft});if(ticket!==sequence.current){discardCadPlan(next.planId);return;}
    plan.current=next.planId;setReview(next);setReviewedKey(key);if(!next.result.ok)setError(next.result.reason??"Reassignment rejected.");
  }catch(cause){if(ticket===sequence.current)setError(String(cause));}finally{if(ticket===sequence.current)setBusy(false);}}
  async function apply(){if(!interaction.canApply||!plan.current)return;setBusy(true);try{const result=await applyCadPlan(plan.current);if(!result.ok)throw Error(result.reason);cancel();setError("");onDocumentChange();}catch(cause){setError(String(cause));setBusy(false);}}
  const centerLine=constructionUsesCenterLine(cadDocument,draft),classification=review?.result.ok?getCadPlanConstructionStatus(review.planId,objectId):undefined;
  const paths=review?.result.ok?getCadPlanDrawingPaths(review.planId,objectId):undefined;
  const coordinates=(points:number[][]|undefined)=>points?.map(p=>`(${p.map(v=>Number(v.toFixed(6))).join(", ")})`).join(" → ")??"?";
  return <PropertySection title="Construction definition" meta={saved.operation} defaultOpen active>
    <p className="property-hint">Reassign saved sources, points or edges. Review updates the result and its dependents together; Apply creates one Undo entry.</p>
    <p data-testid="construction-saved-definition"><code>{constructionExpression(saved,id=>cadDocument.objects[id]?.name??id)}</code></p>
    {constructionRoles(draft).map(role=>{
      const id=constructionSource(draft,role),element=constructionElement(draft,role),options=constructionReferenceChoices(cadDocument,id,draft,role,feature!.params.workPlane as WorkPlaneId);
      const value=element?JSON.stringify(element):"",sources=Object.keys(cadDocument.objects).filter(candidate=>candidate!==objectId&&constructionReferenceChoices(cadDocument,candidate,draft,role,feature!.params.workPlane as WorkPlaneId).length);
      return <div key={role}>
        <label className="property-row"><span>{role} source</span><select aria-label={`Construction ${role} source`} disabled={locked||busy} value={id} onChange={e=>{const candidate=e.target.value,first=constructionReferenceChoices(cadDocument,candidate,draft,role,feature!.params.workPlane as WorkPlaneId)[0];change(reassignConstructionSource(draft,role,candidate,first?.element));}}>
          {!sources.includes(id)&&<option value={id}>Stored source: {cadDocument.objects[id]?.name??id}</option>}{sources.map(source=><option key={source} value={source}>{cadDocument.objects[source].name} · {source}</option>)}
        </select></label>
        {role!=="midpoint"&&<label className="property-row"><span>{role} element</span><select aria-label={`Construction ${role} element`} disabled={locked||busy} value={value} onChange={e=>change(reassignConstructionSource(draft,role,id,e.target.value?JSON.parse(e.target.value):undefined))}>
          {!options.some(o=>(o.element?JSON.stringify(o.element):"")===value)&&<option value={value}>Stored element unavailable</option>}{options.map(o=><option key={o.element?JSON.stringify(o.element):"whole"} value={o.element?JSON.stringify(o.element):""}>{o.label}</option>)}
        </select></label>}
      </div>;
    })}
    {draft.operation==="intersection"&&<label className="property-row"><span>Branch</span><select aria-label="Construction intersection branch" disabled={locked||busy} value={draft.branch} onChange={e=>change({...draft,branch:e.target.value as "positive"|"negative"})}><option value="negative">{centerLine?"Right of first → second centre":"Negative along line"}</option><option value="positive">{centerLine?"Left of first → second centre":"Positive along line"}</option></select></label>}
    {centerLine&&<p className="property-hint">Signed side follows the ordered centre axis. Tangency merges positions while retaining branch IDs; lost branches reject the entire edit.</p>}
    {classification&&<p data-testid="construction-intersection-status">Intersection: {classification}</p>}
    <p data-testid="construction-draft-definition"><code>{constructionExpression(draft,id=>cadDocument.objects[id]?.name??id)}</code></p>
    {locked&&<p role="alert">Unlock the construction output layer to reassign its definition.</p>}
    <button disabled={locked||busy||JSON.stringify(saved)===JSON.stringify(draft)} onClick={()=>void preview()}>Review construction reassignment</button>
    {error&&<p role="alert" className="inspector-notice inspector-error">{error}</p>}
    {review&&<><CommandReview state={interaction}/>{paths&&<p data-testid="construction-coordinate-review" className="property-hint">World mm before: {coordinates(paths.before)}<br/>After: {coordinates(paths.after)}</p>}<button disabled={!interaction.canApply||locked} onClick={()=>void apply()}>Apply construction reassignment</button><button disabled={busy} onClick={()=>{cancel();setError("");setDraft(structuredClone(saved));}}>Cancel construction reassignment</button></>}
  </PropertySection>;
}
