import {useEffect,useState} from "react";
import {evaluateVariables,parameterTargets,parameterTargetKey,type VariableQuantity} from "@agent-webcad/cad-document";
import type {CadCommand} from "@agent-webcad/cad-commands";
import {cadDocument} from "../state/cadDocument";
import {dispatchCadCommand} from "../state/dispatchCadCommand";
import {previewCadCommand,applyCadPlan,discardCadPlan,type CadPlanPreview} from "../state/documentPlans";
import {sameDocumentVersion} from "../state/documentSession";
import {PropertySection} from "../ui/PropertySection";
import {commandInteraction} from "../state/commandInteraction";

type Props={documentRevision:number;query:string;selectedObjectId:string|null;activeSketchId?:string|null;onDocumentChange:()=>void};
const display=(value:number,unit:string)=>`${Number(value.toPrecision(10))}${unit?` ${unit}`:""}`;

export function VariablesPanel({query,selectedObjectId,activeSketchId,onDocumentChange}:Props){
  const [name,setName]=useState(""),[quantity,setQuantity]=useState<VariableQuantity>("length"),[expression,setExpression]=useState("");
  const [drafts,setDrafts]=useState<Record<string,string>>({}),[targetKey,setTargetKey]=useState(""),[bindingExpression,setBindingExpression]=useState("");
  const [error,setError]=useState(""),[busy,setBusy]=useState(false),[preview,setPreview]=useState<CadPlanPreview|null>(null);
  const [reviewedKey,setReviewedKey]=useState<string>();
  const values=evaluateVariables(cadDocument.variables),allTargets=parameterTargets(cadDocument);
  const targets=allTargets.filter(info=>info.target.kind === "feature" ? !selectedObjectId || info.target.objectId === selectedObjectId : activeSketchId ? info.target.sketchId === activeSketchId : !selectedObjectId || cadDocument.sketches?.[info.target.sketchId]?.geometry.some(entity=>entity.id === selectedObjectId));
  const target=targets.find(info=>parameterTargetKey(info.target) === targetKey)??targets[0];
  const existing=target&&Object.values(cadDocument.parameterBindings??{}).find(binding=>parameterTargetKey(binding.target) === parameterTargetKey(target.target));
  const draftKey=JSON.stringify([drafts,target&&parameterTargetKey(target.target),bindingExpression]);
  const interaction=commandInteraction({command:"Parameter change",draftKey,reviewedKey,preview,pending:busy,targets:selectedObjectId?[selectedObjectId]:[],inputError:error});
  const fingerprint=JSON.stringify(cadDocument.variables??{});
  useEffect(()=>setDrafts(Object.fromEntries(Object.values(cadDocument.variables??{}).map(variable=>[variable.name,variable.expression]))),[fingerprint]);
  useEffect(()=>{setBindingExpression(existing?.expression??"");},[target&&parameterTargetKey(target.target),existing?.expression]);
  useEffect(()=>()=>{if(preview)discardCadPlan(preview.planId);},[preview?.planId]);
  async function run(command:CadCommand){
    if(busy)return false;setBusy(true);setError("");
    try{const result=await dispatchCadCommand(command);if(!result.ok){setError(result.reason??"Parameter edit rejected.");return false;}onDocumentChange();return true;}
    catch(cause){setError(cause instanceof Error?cause.message:"Parameter edit failed.");return false;}
    finally{setBusy(false);}
  }
  async function review(command:CadCommand){
    if(busy)return;setBusy(true);setError("");setPreview(null);
    try{const next=await previewCadCommand(command);if(!next.result.ok){discardCadPlan(next.planId);setError(next.result.reason??"Parameter edit rejected.");}else {setPreview(next);setReviewedKey(draftKey);}}
    catch(cause){setError(cause instanceof Error?cause.message:"Preview failed.");}
    finally{setBusy(false);}
  }
  async function apply(){
    if(!preview||!interaction.canApply)return;setBusy(true);
    try{const result=await applyCadPlan(preview.planId);if(result.ok){setPreview(null);setError("");onDocumentChange();}else setError(result.reason??"Apply rejected.");}
    catch(cause){setError(cause instanceof Error?cause.message:"Apply failed.");}
    finally{setBusy(false);}
  }
  const fresh=preview&&!preview.stale&&sameDocumentVersion(preview.baseVersion);
  return <div className="properties-content variables-panel" data-testid="variables-panel">
    {error&&<div className="inspector-notice inspector-error" role="alert">{error}</div>}
    <PropertySection title="Document variables" meta={Object.keys(values).length}>
      <p className="property-hint">Use units for lengths and angles: 120mm, 90deg. Expressions preserve quantities.</p>
      {Object.values(cadDocument.variables??{}).filter(variable=>!query||`${variable.name} ${variable.expression}`.toLowerCase().includes(query)).map(variable=><div className="variable-row" key={variable.name}>
        <div className="variable-heading"><strong>{variable.name}</strong><output data-variable={variable.name}>{display(values[variable.name].value,values[variable.name].unit)}</output></div>
        <input aria-label={`Expression for ${variable.name}`} value={drafts[variable.name]??variable.expression} onChange={event=>setDrafts({...drafts,[variable.name]:event.target.value})} onKeyDown={event=>{if(event.key === "Enter"&&!event.nativeEvent.isComposing)void review({type:"set-variable",name:variable.name,quantity:variable.quantity,expression:drafts[variable.name]??variable.expression});}}/>
        <div className="sketch-actions"><button type="button" aria-label={`Preview ${variable.name}`} disabled={busy||(drafts[variable.name]??variable.expression)===variable.expression} onClick={()=>void review({type:"set-variable",name:variable.name,quantity:variable.quantity,expression:drafts[variable.name]??variable.expression})}>Preview</button><button type="button" aria-label={`Remove ${variable.name}`} disabled={busy} onClick={()=>void run({type:"remove-variable",name:variable.name})}>Remove</button><small>{variable.quantity}</small></div>
      </div>)}
      <label>Name<input aria-label="New variable name" placeholder="plateWidth" value={name} onChange={event=>setName(event.target.value)}/></label>
      <label>Quantity<select aria-label="New variable quantity" value={quantity} onChange={event=>setQuantity(event.target.value as VariableQuantity)}><option value="length">Length (mm)</option><option value="angle">Angle (rad)</option><option value="scalar">Scalar / ratio</option></select></label>
      <label>Expression<input aria-label="New variable expression" placeholder={quantity === "length" ? "120mm" : quantity === "angle" ? "90deg" : "3"} value={expression} onChange={event=>setExpression(event.target.value)}/></label>
      <button type="button" disabled={busy||!name.trim()||!expression.trim()} onClick={()=>{if(Object.hasOwn(cadDocument.variables??{},name.trim())){setError("Name already exists; edit its expression above.");return;}void run({type:"set-variable",name:name.trim(),quantity,expression}).then(ok=>{if(ok){setName("");setExpression("");}});}}>Add variable</button>
    </PropertySection>
    <PropertySection title="Drive a parameter" meta="expression → geometry">
      <p className="property-hint">Select a feature or edit a sketch to choose a source parameter. Removing a binding keeps its current value.</p>
      {target?<>
        <label>Target<select aria-label="Binding target" value={parameterTargetKey(target.target)} onChange={event=>setTargetKey(event.target.value)}>{targets.map(info=><option key={parameterTargetKey(info.target)} value={parameterTargetKey(info.target)}>{info.label}</option>)}</select></label>
        <div className="property-hint">Current: {display(target.value,target.unit)}{existing&&" · driven"}</div>
        <input aria-label="Binding expression" placeholder="plateWidth / 2" value={bindingExpression} onChange={event=>setBindingExpression(event.target.value)}/>
        <div className="sketch-actions"><button type="button" disabled={busy||!bindingExpression.trim()} onClick={()=>void review({type:"set-parameter-binding",target:target.target,expression:bindingExpression})}>{existing?"Preview binding edit":"Preview binding"}</button>{existing&&<button type="button" disabled={busy} onClick={()=>void run({type:"remove-parameter-binding",bindingId:existing.id})}>Remove binding</button>}</div>
      </>:<p className="property-hint">No numeric source parameters in this selection. Driving sketch dimensions become available after adding their constraints.</p>}
    </PropertySection>
    {busy&&<p role="status">Evaluating geometry…</p>}
    {preview&&<PropertySection title="Review parameter change" meta={`${preview.changes.length} affected objects`}>
      <div data-testid="parameter-review">
        {preview.variableChanges.map(change=><p key={change.name}>{change.name} expression: {change.before?.expression??"new"} → {change.after?.expression??"removed"}</p>)}
        {preview.bindingChanges.map(change=>{const binding=change.after??change.before!,info=allTargets.find(info=>parameterTargetKey(info.target)===parameterTargetKey(binding.target));return <p key={change.id}>{info?.label??"Parameter"} expression: {change.before?.expression??"unbound"} → {change.after?.expression??"unbound"}</p>;})}
        {Object.values(preview.variables.after).filter(value=>JSON.stringify(value)!==JSON.stringify(preview.variables.before[value.name])).map(value=><p key={value.name}>{value.name}: {preview.variables.before[value.name]?display(preview.variables.before[value.name].value,value.unit):"new"} → {display(value.value,value.unit)}</p>)}
        {preview.changes.filter(change=>change.after?.volume!==undefined).map(change=><p key={change.objectId}>{change.name}: {change.before?.volume!==undefined?`${display(change.before.volume,"mm³")} → `:""}{display(change.after!.volume!,"mm³")}</p>)}
      </div>
      {!fresh&&<p className="inspector-notice">The document changed. Preview again before applying.</p>}
      <div className="sketch-actions"><button type="button" disabled={!interaction.canApply} onClick={()=>void apply()}>Apply parameter change</button><button type="button" disabled={busy} onClick={()=>setPreview(null)}>Discard parameter change</button></div>
    </PropertySection>}
  </div>;
}
