import {useEffect,useRef,useState} from "react";
import type {CadCommand} from "@agent-webcad/cad-commands";
import {cadDocument} from "../state/cadDocument";
import {previewCadCommand,applyCadPlan,discardCadPlan,type CadPlanPreview} from "../state/documentPlans";
import {commandInteraction} from "../state/commandInteraction";
import {parseLength} from "../precision/units";
import {PropertySection} from "../ui/PropertySection";
import {CommandReview} from "../ui/CommandReview";

/** Measurements come from the detached Worker proposal, including live dependents. */
export function NumericEditMeasurements({preview}:{preview?:CadPlanPreview}){
  if(!preview?.result.ok)return null;
  return <div aria-label="Numeric edit measurements">{preview.changes.filter(c=>c.after?.volume!==undefined||c.measurementError).map(c=><p className="property-hint" key={c.objectId}>{c.name}: {c.measurementError??`Volume ${c.before?.volume?.toFixed(3)??"—"} → ${c.after?.volume?.toFixed(3)??"—"} mm³`}</p>)}</div>;
}

/** Single-source pilot. Drafts never publish until their exact plan is applied. */
export function NumericModelEdit({objectId,revision,disabled,onDocumentChange,onVariables}:{objectId:string;revision:number;disabled:boolean;onDocumentChange:()=>void;onVariables?:()=>void}){
  const feature=Object.values(cadDocument.features).find(f=>f.output===objectId)!;
  const cylinder=feature.type==="primitive"&&feature.params.kind==="cylinder";
  const [mode,setMode]=useState<"diameter"|"radius">("diameter"),[size,setSize]=useState(""),[length,setLength]=useState("");
  const [review,setReview]=useState<CadPlanPreview>(),[reviewedKey,setReviewedKey]=useState<string>(),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const plan=useRef<string|undefined>(undefined),sequence=useRef(0);
  function cancel(){sequence.current++;if(plan.current)discardCadPlan(plan.current);plan.current=undefined;setReview(undefined);setReviewedKey(undefined);setBusy(false);setError("");}
  useEffect(()=>{cancel();setSize(String(Number(feature.params.radius)*(mode==="diameter"?2:1)));setLength(String(feature.params[cylinder?"height":"distance"]));},[objectId,revision]);
  useEffect(()=>()=>{sequence.current++;if(plan.current)discardCadPlan(plan.current);},[]);
  const bindings=Object.values(cadDocument.parameterBindings??{}).filter(b=>b.target.kind==="feature"&&b.target.objectId===objectId);
  const bound=(parameter:string)=>bindings.some(b=>b.target.kind==="feature"&&b.target.parameter===parameter);
  const key=JSON.stringify([objectId,revision,mode,size,length]),interaction=commandInteraction({command:cylinder?"Cylinder dimensions":"Extrusion length",draftKey:key,reviewedKey,preview:review,targets:[objectId],pending:busy,inputError:error,idle:!review&&!busy});
  async function preview(){
    cancel();const distance=parseLength(length),value=parseLength(size);
    if(distance===null||(cylinder?distance<=1e-6:Math.abs(distance)<=1e-6)||cylinder&&(value===null||value<=1e-6)){setError("Enter a finite length with mm, cm, m, in or ft. Cylinder dimensions must be positive; extrusion distance must be nonzero.");return;}
    const command:CadCommand=cylinder?{type:"update-primitive",objectId,params:{...Object.fromEntries(Object.entries(feature.params).filter(([k])=>k!=="kind")),radius:value!/(mode==="diameter"?2:1),height:distance}}:{type:"update-extrude",objectId,distance};
    const ticket=++sequence.current;setBusy(true);
    try{const next=await previewCadCommand(command);if(ticket!==sequence.current){discardCadPlan(next.planId);return;}plan.current=next.planId;setReview(next);setReviewedKey(key);if(!next.result.ok)setError(next.result.reason??"Numeric edit failed.");else if(!next.result.changed)setError("No model values changed. Enter a different value and review again.");}
    catch(cause){if(ticket===sequence.current)setError(cause instanceof Error?cause.message:String(cause));}
    finally{if(ticket===sequence.current)setBusy(false);}
  }
  async function apply(){
    if(!interaction.canApply||!plan.current||disabled)return;setBusy(true);
    try{const result=await applyCadPlan(plan.current);if(!result.ok)throw Error(result.reason);cancel();onDocumentChange();}
    catch(cause){setError(cause instanceof Error?cause.message:String(cause));setBusy(false);}
  }
  return <PropertySection title={cylinder?"Dimensions":"Extrude"} meta="Driving values · mm" defaultOpen active>
    <div aria-label="Numeric model edit">
      <p className="property-hint">Edit source parameters. Review includes connected model changes. Drawing annotations are display values.</p>
      {cylinder&&<><label className="property-row"><span>Size input</span><select aria-label="Cylinder size mode" value={mode} disabled={disabled||busy||bound("radius")} onChange={e=>{const next=e.target.value as typeof mode,v=parseLength(size);cancel();setMode(next);if(v!==null)setSize(String(v*(next===mode?1:next==="diameter"?2:.5)));}}><option value="diameter">Diameter Ø</option><option value="radius">Radius R</option></select></label><label className="property-row"><span>{mode==="diameter"?"Diameter":"Radius"}</span><input aria-label="Cylinder size" value={size} disabled={disabled||busy||bound("radius")} onChange={e=>{cancel();setSize(e.target.value);}}/></label></>}
      <label className="property-row"><span>{cylinder?"Length":"Distance"}</span><input aria-label={cylinder?"Cylinder length":"Extrusion length"} value={length} disabled={disabled||busy||bound(cylinder?"height":"distance")} onChange={e=>{cancel();setLength(e.target.value);}}/></label>
      {!!bindings.length&&<p className="property-hint">Bound values are controlled by their variables. {onVariables&&<button onClick={onVariables}>Edit numeric variables</button>}</p>}
      <button disabled={disabled||busy} onClick={()=>void preview()}>Review numeric edit</button>
      {error&&<p role="alert">{error}</p>}
      {review&&<>{interaction.preview?.result.ok&&<p className="property-hint" aria-label="Numeric parameter changes">{cylinder?`Diameter ${Number(feature.params.radius)*2} → ${Number(parseLength(size))*(mode==="radius"?2:1)} mm; length ${feature.params.height} → ${parseLength(length)} mm`:`Distance ${feature.params.distance} → ${parseLength(length)} mm`}</p>}<CommandReview state={interaction}/><NumericEditMeasurements preview={interaction.preview??undefined}/><button disabled={disabled||!interaction.canApply} onClick={()=>void apply()}>Apply numeric edit</button><button disabled={busy} onClick={cancel}>Cancel numeric review</button></>}
    </div>
  </PropertySection>;
}
