import { useEffect,useRef,useState } from "react";
import type { DocumentVersion } from "../state/documentSession";
import { sameDocumentVersion } from "../state/documentSession";
import { cadDocument } from "../state/cadDocument";
import { describeDirectTarget } from "./directTargetDescription";
import { nextDirectGrip } from "./directTargetDescription";
import type { DirectTargetRef } from "./directSelection";
export type DirectTargetChoice={id:string;baseVersion:DocumentVersion;targets:DirectTargetRef[];x:number;y:number};

export function DirectTargetChooser({choice,width,height,onInspect,onChoose,onClose}:{choice:DirectTargetChoice;width:number;height:number;onInspect:(target:DirectTargetRef|null)=>void;onChoose:(target:DirectTargetRef)=>void;onClose:()=>void}){
  const refs=useRef<(HTMLButtonElement|null)[]>([]),[active,setActive]=useState(0);
  const descriptions=choice.targets.map(target=>describeDirectTarget(cadDocument,target)),current=descriptions[active];
  useEffect(()=>{refs.current[0]?.focus();return()=>onInspect(null);},[choice.id]);
  const maxHeight=Math.max(130,Math.min(420,height-24));
  return <div className="direct-target-chooser" data-cad-editor data-testid="direct-target-chooser" role="dialog" aria-label="Choose canvas target"
    style={{left:Math.max(8,Math.min(choice.x+16,width-330)),top:Math.max(8,Math.min(choice.y+16,height-maxHeight-8)),maxHeight}}
    onKeyDown={e=>{if(e.key==="Escape"){e.preventDefault();e.stopPropagation();onClose();return;}const next=nextDirectGrip(choice.targets,active,e.key);if(next>=0){e.preventDefault();e.stopPropagation();refs.current[next]?.focus();}}}>
    <div className="direct-target-title"><strong>Choose point, edge or curve</strong><button type="button" onClick={onClose}>Cancel selection</button></div>
    <p>{choice.targets.length} targets here · preview before selecting</p>
    <div className="direct-target-options">{choice.targets.map((target,i)=>descriptions[i]&&<button type="button" key={JSON.stringify(target)} ref={node=>{refs.current[i]=node;}} data-target-choice={target.topologyId} data-choice-object={target.objectId}
      onFocus={()=>{setActive(i);onInspect(target);}} onMouseEnter={()=>refs.current[i]?.focus({preventScroll:true})} onClick={()=>{if(sameDocumentVersion(choice.baseVersion))onChoose(target);else onClose();}}>
      <strong>{descriptions[i]!.name} · {descriptions[i]!.label}</strong><span>{descriptions[i]!.sketchId?`Sketch ${descriptions[i]!.sketchId}`:"Drawing"} · {descriptions[i]!.plane} · {descriptions[i]!.relations.length} source relations</span>
    </button>)}</div>
    {current&&<div className="direct-target-relations"><strong>Source relations · {current.name}</strong>{current.relations.length?current.relations.map(r=><span key={r.id}>{r.caption}</span>):<span>Free drawing geometry</span>}</div>}
    <p>Arrow keys: preview · Enter: select · Esc: cancel</p>
  </div>;
}
