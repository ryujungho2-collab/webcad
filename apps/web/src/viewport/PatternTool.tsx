import { requestProjectFrame as requestAnimationFrame, cancelProjectFrame as cancelAnimationFrame } from "../app/projectActivity";
import {useEffect,useRef,useState} from "react";
import type {CadPatternSpec} from "@agent-webcad/cad-document";
import {validPatternSpec,patternSlots,MAX_PATTERN_OUTPUTS} from "@agent-webcad/cad-document";
import {applyCadPlan,discardCadPlan,getCadPlanDrawingPaths,previewCadCommand,type CadPlanPreview} from "../state/documentPlans";
import {subscribeDocumentChanges} from "../state/documentSession";
import {parseLength,parseAngle} from "../precision/units";
import {planeToWorld,WORK_PLANES,type Vec3} from "../precision/workPlane";
import {cadDocument} from "../state/cadDocument";
import {getWorldDrawingGeometry} from "../precision/worldGeometry";
import {commandInteraction} from "../state/commandInteraction";
import {CommandReview} from "../ui/CommandReview";
import {PrecisionField} from "../ui/PrecisionField";
import {parameterInput} from "../precision/parameterInput";

export type PatternSession={id:string;sourceObjectIds:string[];spec:CadPatternSpec;patternId?:string;layerId:string};
type Props={session:PatternSession;project:(p:Vec3)=>[number,number];onClose:()=>void;onApplied:(ids:string[])=>void;onFrame:(points:Vec3[])=>void};
export function PatternTool({session,project,onClose,onApplied,onFrame}:Props){
  const initial=session.spec;
  const [draft,setDraft]=useState<Record<string,string>>(():Record<string,string>=>initial.kind==="linear"?{columns:String(initial.columns),rows:String(initial.rows),u:String(initial.spacing[0]),v:String(initial.spacing[1])}:initial.kind==="radial"?{count:String(initial.count),u:String(initial.center[0]),v:String(initial.center[1]),angle:String(initial.angle)}:{u:String(initial.axisStart[0]),v:String(initial.axisStart[1]),u2:String(initial.axisEnd[0]),v2:String(initial.axisEnd[1])});
  const [preview,setPreview]=useState<CadPlanPreview|null>(null),[message,setMessage]=useState("Calculating preview…"),[pending,setPending]=useState(false),[revision,setRevision]=useState(0);
  const [paths,setPaths]=useState<string[]>([]),[guide,setGuide]=useState<string>("");
  const [sourceIds,setSourceIds]=useState(session.sourceObjectIds),[reviewedKey,setReviewedKey]=useState<string>();
  const plan=useRef<string|null>(null),projectRef=useRef(project);projectRef.current=project;
  const worldPathsRef=useRef<Vec3[][]>([]);
  const length=(key:string)=>parseLength(draft[key]??"");
  const count=(key:string)=>Number(parameterInput(draft[key]??"","count",{min:1,max:128}).value??NaN);
  const spec:CadPatternSpec=initial.kind==="linear"?{...initial,columns:count("columns"),rows:count("rows"),spacing:[length("u")??NaN,length("v")??NaN]}:initial.kind==="radial"?{...initial,count:count("count"),center:[length("u")??NaN,length("v")??NaN],angle:parseAngle(draft.angle)??NaN}:{...initial,axisStart:[length("u")??NaN,length("v")??NaN],axisEnd:[length("u2")??NaN,length("v2")??NaN]};
  const key=JSON.stringify([draft,sourceIds,revision]),specRef=useRef(spec);specRef.current=spec;
  const interaction=commandInteraction({command:session.patternId?"Edit Pattern":"Pattern",draftKey:key,reviewedKey,preview,pending,targets:sourceIds,numericParameters:draft,missing:sourceIds.length?[]:["Choose at least one drawing or sketch curve."],inputError:!validPatternSpec(spec)||sourceIds.length*(patternSlots(spec)-1)>MAX_PATTERN_OUTPUTS?"Check counts, spacing and axis. Maximum 256 generated objects; radial instances must not overlap at 360°.":undefined});
  useEffect(()=>subscribeDocumentChanges(()=>{if(plan.current)discardCadPlan(plan.current);plan.current=null;setPreview(null);setRevision(v=>v+1);}),[]);
  useEffect(()=>{
    const controller=new AbortController();let localPlan:string|undefined;
    setPreview(null);if(plan.current)discardCadPlan(plan.current);plan.current=null;
    if(session.patternId&&JSON.stringify(spec)===JSON.stringify(session.spec)){setMessage("Change a value to preview the updated pattern.");return;}
    if(!sourceIds.length||!validPatternSpec(spec)||sourceIds.length*(patternSlots(spec)-1)>MAX_PATTERN_OUTPUTS){setMessage(interaction.inputError??"Choose source curves.");return;}
    setMessage("Calculating preview…");
    const timer=setTimeout(()=>{
      const command=session.patternId?{type:"update-pattern",patternId:session.patternId,spec}:{type:"create-pattern",id:session.id,sourceObjectIds:sourceIds,layerId:session.layerId,spec};
      void previewCadCommand(command,{signal:controller.signal}).then(result=>{
        localPlan=result.planId;if(controller.signal.aborted){discardCadPlan(result.planId);return;}
        plan.current=result.planId;setPreview(result);setReviewedKey(key);setMessage(result.stale?"Document changed; calculating again…":result.result.ok?`${patternSlots(spec)} placements including the source · ${result.changes.length} objects affected`:result.result.reason??"Preview rejected.");
      }).catch(e=>{if(!controller.signal.aborted)setMessage(e instanceof Error?e.message:String(e));});
    },180);
    return()=>{clearTimeout(timer);controller.abort();if(localPlan)discardCadPlan(localPlan);};
  },[key,revision,session]);
  useEffect(()=>{
    const worldPaths=preview?.result.ok&&!preview.stale?preview.changes.flatMap(change=>{const path=getCadPlanDrawingPaths(preview.planId,change.objectId);return path?(path.after?[path.after]:path.before?[path.before]:[]):[];}):[];
    worldPathsRef.current=worldPaths;
    let frame:number,signature="";
    const draw=()=>{
      const nextPaths=worldPaths.map(points=>points.map(p=>{const q=projectRef.current(p);return `${q[0].toFixed(1)},${q[1].toFixed(1)}`;}).join(" "));
      const nextSignature=JSON.stringify(nextPaths);if(signature!==nextSignature){signature=nextSignature;setPaths(nextPaths);}
      const current=specRef.current,plane=WORK_PLANES[current.workPlane];
      if(validPatternSpec(current)&&current.kind!=="linear"){
        const vertices=current.kind==="mirror"?[current.axisStart,current.axisEnd]:[[current.center[0]-3,current.center[1]],[current.center[0]+3,current.center[1]],current.center,[current.center[0],current.center[1]-3],[current.center[0],current.center[1]+3]];
        setGuide(vertices.map(p=>{const q=projectRef.current(planeToWorld(p as [number,number],plane));return `${q[0]},${q[1]}`;}).join(" "));
      }else setGuide("");
      frame=requestAnimationFrame(draw);
    };draw();return()=>cancelAnimationFrame(frame);
  },[preview,key]);
  async function apply(){
    if(!interaction.canApply||!preview)return;
    setPending(true);
    try{const result=await applyCadPlan(preview.planId);if(!result.ok){setMessage(result.reason??"Apply rejected.");setPreview(null);return;}onApplied(result.createdIds.length?result.createdIds:preview.changes.filter(c=>c.kind!=="deleted"&&cadDocument.objects[c.objectId]).map(c=>c.objectId));onClose();}
    catch(e){setMessage(e instanceof Error?e.message:String(e));}finally{setPending(false);}
  }
  const input=(name:string,label:string)=><PrecisionField key={name} label={label} data-pattern-field={name} value={draft[name]??""} kind={["columns","rows","count"].includes(name)?"count":name==="angle"?"angle":"length"} min={["columns","rows","count"].includes(name)?1:undefined} max={["columns","rows","count"].includes(name)?128:undefined} disabled={pending} onChange={text=>setDraft(value=>({...value,[name]:text}))}/>;
  return <>
    <svg className="cad-pattern-ghosts" aria-label="Pattern preview" data-preview-count={paths.length}>{paths.map((points,index)=><polyline key={index} points={points} fill="none" stroke="#61dcac" strokeWidth="2"/>)}{guide&&<polyline points={guide} fill="none" stroke="#ffc96f" strokeWidth="2" strokeDasharray="6 4"/>}</svg>
    <form className="cad-pattern-tool" data-cad-editor="true" data-preview-generation={preview?.baseVersion.generation} aria-label="Pattern editor" onSubmit={e=>{e.preventDefault();void apply();}} onKeyDown={e=>{e.stopPropagation();if(e.key==="Escape"&&!pending){e.preventDefault();onClose();}}}>
      <div className="cad-tool-body">
      <strong>{session.patternId?"Edit":"Create"} {initial.kind==="linear"?"Linear / Grid Array":initial.kind==="radial"?"Radial Array":"Mirror"}</strong>
      <small>{initial.workPlane} · lengths in mm, or enter cm / in · angles in deg / rad</small>
      {!session.patternId&&<label>Source curves<select multiple aria-label="Pattern source curves" value={sourceIds} disabled={pending} onChange={e=>setSourceIds(Array.from(e.target.selectedOptions,o=>o.value))}>{Object.values(cadDocument.features).filter(f=>f.type==="drawing"&&cadDocument.objects[f.output]?.visible&&cadDocument.layers[cadDocument.objects[f.output].layerId]?.visible).map(f=><option key={f.output} value={f.output}>{cadDocument.objects[f.output].name}</option>)}</select></label>}
      {initial.kind==="linear"?<>{input("columns","Columns")}{input("rows","Rows")}{input("u","Column spacing")}{input("v","Row spacing")}</>:initial.kind==="radial"?<>{input("count","Placements")}{input("u","Centre U")}{input("v","Centre V")}{input("angle","Step angle")}</>:<>{input("u","Axis start U")}{input("v","Axis start V")}{input("u2","Axis end U")}{input("v2","Axis end V")}</>}
      <p role="status">{message}</p><small>Originals stay in place. Edit any instance in the Inspector to change the whole pattern.</small>
      <CommandReview state={interaction} onInspect={ids=>onFrame(ids.flatMap(id=>{const p=preview&&getCadPlanDrawingPaths(preview.planId,id),object=cadDocument.objects[id],feature=Object.values(cadDocument.features).find(f=>f.output===id);return p?.after??p?.before??(object&&feature?getWorldDrawingGeometry(object,feature)?.points:undefined)??[];}))}/>
      </div><div className="cad-tool-footer">
      <button type="button" disabled={!preview?.result.ok||preview.stale} onClick={()=>{const sources=sourceIds.flatMap(id=>{const f=Object.values(cadDocument.features).find(f=>f.output===id),o=cadDocument.objects[id];return f&&o?getWorldDrawingGeometry(o,f)?.points??[]:[];});onFrame([...sources,...worldPathsRef.current.flat()]);}}>Fit preview</button>
      <div><button type="submit" disabled={!interaction.canApply}>Apply pattern</button><button type="button" disabled={pending} onClick={onClose}>Cancel</button></div>
      </div>
    </form>
  </>;
}
