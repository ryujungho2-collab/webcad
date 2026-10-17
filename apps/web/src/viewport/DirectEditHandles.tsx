import { requestProjectFrame as requestAnimationFrame, cancelProjectFrame as cancelAnimationFrame } from "../app/projectActivity";
import { useEffect,useRef,useState } from "react";
import { cadDocument } from "../state/cadDocument";
import { describeDirectTarget,nextDirectGrip } from "./directTargetDescription";
import { sameDirectTarget,type DirectSelectionCandidate,type DirectTargetRef } from "./directSelection";
import type { Vec3 } from "../precision/workPlane";

export function DirectEditHandles({getCandidates,selectedIds,project,disabled,focusTarget,onInspect,onActivate,onExit}:{getCandidates:()=>DirectSelectionCandidate[];selectedIds:string[];project:(p:Vec3)=>[number,number];disabled:boolean;
  focusTarget?:{target:DirectTargetRef;nonce:number};onInspect:(target:DirectTargetRef|null)=>void;onActivate:(target:DirectTargetRef)=>void;onExit:()=>void}){
  const [handles,setHandles]=useState<(DirectTargetRef&{point:[number,number];label:string})[]>([]),[active,setActive]=useState<DirectTargetRef>();
  const refs=useRef(new Map<string,SVGRectElement>());
  const svgRef=useRef<SVGSVGElement>(null);
  const focusedNonce=useRef<number|undefined>(undefined);
  const key=(h:DirectTargetRef)=>JSON.stringify([h.objectId,h.kind,h.topologyId]);
  useEffect(()=>{let frame=0,signature="",last=0;const draw=(time:number)=>{
    if(time-last>40){last=time;const next=getCandidates().filter(c=>selectedIds.includes(c.objectId)&&c.kind!=="curve").flatMap(c=>{const d=describeDirectTarget(cadDocument,c);return d?[{topologyId:c.topologyId,objectId:c.objectId,kind:c.kind,label:`${d.name} · ${d.label}`,point:project((c.segment?c.segment[0].clone().add(c.segment[1]).multiplyScalar(.5):c.worldPoint).toArray() as Vec3)}]:[];});
      const visible=next.filter(h=>h.point.every(Number.isFinite)&&h.point[0]>=0&&h.point[1]>=0&&h.point[0]<=(svgRef.current?.clientWidth??Infinity)&&h.point[1]<=(svgRef.current?.clientHeight??Infinity));
      const hash=JSON.stringify(visible);if(hash!==signature){signature=hash;setHandles(visible);}}
    frame=requestAnimationFrame(draw);
  };frame=requestAnimationFrame(draw);return()=>cancelAnimationFrame(frame);},[getCandidates,selectedIds.join("\0"),project]);
  useEffect(()=>{if(!disabled&&focusTarget&&focusedNonce.current!==focusTarget.nonce&&handles.some(h=>sameDirectTarget(h,focusTarget.target))){refs.current.get(key(focusTarget.target))?.focus();focusedNonce.current=focusTarget.nonce;}},[focusTarget?.nonce,handles,disabled]);
  const index=Math.max(0,handles.findIndex(h=>sameDirectTarget(h,active)));
  useEffect(()=>{if(active&&!handles.some(h=>sameDirectTarget(h,active))){setActive(undefined);onInspect(null);}},[handles,active,onInspect]);
  return <svg ref={svgRef} className="direct-edit-handles" data-cad-editor role="group" aria-label="Canvas edit grips">{handles.map((h,i)=><rect key={key(h)} ref={node=>{if(node)refs.current.set(key(h),node);else refs.current.delete(key(h));}} data-direct-handle={h.topologyId} data-handle-object={h.objectId} data-handle-kind={h.kind}
    role="button" aria-label={`${h.label} · edit grip ${i+1} of ${handles.length}`} aria-disabled={disabled} tabIndex={!disabled&&i===index?0:-1}
    onFocus={()=>{setActive(h);if(!disabled)onInspect(h);}} onBlur={()=>onInspect(null)} onKeyDown={e=>{
      if(e.ctrlKey||e.altKey||e.metaKey)return;
      const next=nextDirectGrip(handles,i,e.key);
      if(next>=0){e.preventDefault();e.stopPropagation();if(!disabled)refs.current.get(key(handles[next]))?.focus();}
      else if(e.key==="Enter"||e.key===" "){e.preventDefault();e.stopPropagation();if(!disabled)onActivate(h);}
      else if(e.key==="Escape"){e.preventDefault();e.stopPropagation();onInspect(null);onExit();}
    }} x={h.point[0]-4} y={h.point[1]-4} width="8" height="8" transform={h.kind==="segment"?`rotate(45 ${h.point[0]} ${h.point[1]})`:undefined}/>)}</svg>;
}
