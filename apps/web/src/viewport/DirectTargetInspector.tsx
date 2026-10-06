import { useEffect,useState } from "react";
import { cadDocument } from "../state/cadDocument";
import { getWorldDrawingGeometry } from "../precision/worldGeometry";
import type { Vec3 } from "../precision/workPlane";
import { sameDirectTarget,type DirectSelectionCandidate,type DirectTargetRef } from "./directSelection";
import { describeDirectTarget } from "./directTargetDescription";

export function DirectTargetInspector({target,getCandidates,project,compact=false}:{target:DirectTargetRef;getCandidates:()=>DirectSelectionCandidate[];project:(p:Vec3)=>[number,number];compact?:boolean}){
  const description=describeDirectTarget(cadDocument,target),[screen,setScreen]=useState<{point:number[];path:string;related:{id:string;path:string}[]}>();
  useEffect(()=>{let frame=0,signature="";const draw=()=>{
    const candidate=getCandidates().find(c=>sameDirectTarget(c,target));if(!candidate||!description){setScreen(undefined);frame=requestAnimationFrame(draw);return;}
    const point=(candidate.segment?candidate.segment[0].clone().add(candidate.segment[1]).multiplyScalar(.5):candidate.worldPoint).toArray() as Vec3;
    const path=(points:Vec3[])=>(points.map(project).map(p=>p.map(v=>v.toFixed(1)).join(",")).join(" "));
    const related=[...new Set([target.objectId,...description.relations.flatMap(r=>r.geometryIds)])].flatMap(id=>{const feature=Object.values(cadDocument.features).find(f=>f.output===id),object=cadDocument.objects[id],world=object&&feature?getWorldDrawingGeometry(object,feature):undefined;return world?.points?[{id,path:path(world.points)}]:[];});
    const next={point:project(point),path:path(candidate.segment?.map(p=>p.toArray() as Vec3)??candidate.samples?.map(p=>p.toArray() as Vec3)??[]),related};
    const hash=JSON.stringify(next);if(signature!==hash){signature=hash;setScreen(next);}frame=requestAnimationFrame(draw);
  };frame=requestAnimationFrame(draw);return()=>cancelAnimationFrame(frame);},[target.objectId,target.kind,target.topologyId,getCandidates,project]);
  if(!description||!screen)return null;
  return <><svg className="direct-target-inspection" aria-hidden="true" data-target-inspected={target.topologyId} data-target-object={target.objectId}>
    {screen.related.map(r=><polyline key={r.id} data-target-related={r.id} points={r.path}/>)}
    {screen.path&&<polyline data-target-path points={screen.path}/>}
    <circle data-target-point cx={screen.point[0]} cy={screen.point[1]} r="10"/>
  </svg>{!compact&&<div className="direct-target-caption" role="status"><strong>{description.name} · {description.label}</strong><span>{description.sketchId?`Sketch ${description.sketchId}`:"Drawing"} · {description.plane} · {description.relations.length} source relations</span><span>Arrow keys: choose grip · Enter: edit · Esc: canvas</span></div>}</>;
}
