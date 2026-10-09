import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Sketch } from "@agent-webcad/cad-document";
import { cadDocument } from "../state/cadDocument";
import { applyCadPlan, discardCadPlan, getCadPlanDrawingPaths, getCadPlanSketchPreview, previewCadCommand } from "../state/documentPlans";
import { sameDocumentVersion, subscribeDocumentChanges } from "../state/documentSession";
import { adjustDirectRequest, directEditWithReleases, directRequestCoordinates, planDirectEdit, type DirectEditMode, type DirectEditSession, type DirectIntentPlan } from "../state/directEditIntent";
import { constraintCaption } from "../state/canvasDimensionEdit";
import { parseLength } from "../precision/units";
import { isCadKeyboardBlocked } from "../input/shortcutRouter";
import { WORK_PLANES, planeToWorld, type Vec3 } from "../precision/workPlane";
import { sketchEntityPath } from "../precision/sketchAnnotations";
import { getWorldDrawingGeometry } from "../precision/worldGeometry";
import { constraintGeometryIds } from "../precision/sketchEditing";
import { sketchEditImpact } from "../state/canvasDimensionEdit";
import type { CanvasEditReview } from "./CanvasDimensionEditor";
import { CanvasEditImpact } from "./CanvasEditImpact";
import { DirectMotionGuide, motionCaption } from "./DirectMotionGuide";
import { sketchGripPosition } from "../precision/sketchGripMotion";
import { measureDirectFeedback } from "../cad/feedbackTiming";
import type * as THREE from "three";
import { ConstructionEditPreview, ConstructionEditImpact } from "./ConstructionEditPreview";
import {commandInteraction} from "../state/commandInteraction";

export type DirectEditVisual={review?:CanvasEditReview;requestedSketch?:Sketch;objectId:string};
type Props={session:DirectEditSession;project:(point:Vec3)=>[number,number];style:CSSProperties;
  getCamera?:()=>THREE.Camera|null;constructionVisible?:boolean;
  hasSketchOverlay:boolean;inspectedConstraintId:string|null;
  onVisual:(visual:DirectEditVisual|undefined)=>void;onClose:()=>void;onApplied:()=>void;
  onEditConstraint:(id:string)=>void;onInspectConstraint:(id:string|null)=>void};

export function DirectEditReview({session,project,style,hasSketchOverlay,inspectedConstraintId,onVisual,onClose,onApplied,onEditConstraint,onInspectConstraint,getCamera=()=>null,constructionVisible=true}:Props){
  const [mode,setMode]=useState<DirectEditMode>("drivers"),[releases,setReleases]=useState<string[]>([]),[collapsed,setCollapsed]=useState(false);
  const [override,setOverride]=useState<DirectEditSession["request"]>(),[coordinates,setCoordinates]=useState(()=>directRequestCoordinates(cadDocument,session.request).map(String));
  const [review,setReview]=useState<CanvasEditReview>(),[paths,setPaths]=useState<{before?:Vec3[];after?:Vec3[]}>(),[working,setWorking]=useState(false),[applying,setApplying]=useState(false),[error,setError]=useState("");
  const [stale,setStale]=useState(!sameDocumentVersion(session.baseVersion)),sequence=useRef(0);
  const reviewedIntent=useRef<DirectIntentPlan|undefined>(undefined);
  const request=override??session.request;
  const inputValid=coordinates.every(v=>parseLength(v)!==null);
  useEffect(()=>{setOverride(undefined);setCoordinates(directRequestCoordinates(cadDocument,session.request).map(v=>String(Number(v.toFixed(6)))));},[session.request]);
  const formRef=useRef<HTMLFormElement>(null);
  useEffect(()=>{if(session.input==="keyboard"){const input=formRef.current?.querySelector<HTMLInputElement>('input');input?.focus();input?.select();}},[session.id]);
  const planned=useMemo(()=>{
    const started=performance.now();
    try{
    if(stale||!sameDocumentVersion(session.baseVersion))return {};
    try{
      const document=structuredClone(cadDocument),feature=Object.values(document.features).find(f=>f.output===request.objectId),sketchId=feature?.params.sketchId;
      if(typeof sketchId==="string"&&releases.length){
        document.sketches![sketchId].constraints=document.sketches![sketchId].constraints.filter(c=>!releases.includes(c.id));
        document.sketches![sketchId].dimensions=document.sketches![sketchId].dimensions.filter(d=>!releases.includes(d.constraintId));
        for(const [id,b] of Object.entries(document.parameterBindings??{}))if(b.target.kind==="sketch-constraint"&&b.target.sketchId===sketchId&&releases.includes(b.target.constraintId))delete document.parameterBindings![id];
      }
      return {intent:planDirectEdit(document,request,mode)};
    }catch(cause){return {error:cause instanceof Error?cause.message:"Handle edit is invalid."};}
    }finally{performance.measure("agent-webcad:direct-plan",{start:started,end:performance.now()});}
  },[request,mode,releases,stale,session.baseVersion]);
  const intent=planned.intent,sketch=intent?.sketchId?cadDocument.sketches?.[intent.sketchId]:undefined;
  const motion=intent?.motion;
  const reviewMatches=reviewedIntent.current===intent;
  const verifiedGeometry=reviewMatches?review?.sources?.after.geometry.find(g=>g.id===request.objectId):undefined;
  const verifiedPoint=verifiedGeometry?sketchGripPosition(verifiedGeometry,request.target):undefined;
  const verifiedShift=Boolean(motion&&verifiedPoint&&Math.hypot(...verifiedPoint.map((v,i)=>v-motion.point[i]))>1e-6);
  const displayedMotion=motion&&verifiedPoint?{...motion,point:verifiedPoint,projected:motion.projected||verifiedShift}:motion;
  const reportedPoint=verifiedShift?verifiedPoint:motion?.point;
  const hasMovement=Math.hypot(...request.targetWorld.map((v,i)=>v-request.startWorld[i]))>1e-6;
  useEffect(()=>subscribeDocumentChanges(()=>{sequence.current++;setStale(true);setWorking(false);setPaths(undefined);onVisual(undefined);}),[onVisual]);
  useEffect(()=>{
    const ticket=++sequence.current,abort=new AbortController();let planId:string|undefined;
    reviewedIntent.current=undefined;setReview(undefined);setPaths(undefined);setError("");
    if(stale||!sameDocumentVersion(session.baseVersion)){setStale(true);setWorking(false);onVisual(undefined);return;}
    if(!inputValid){setWorking(false);onVisual(undefined);return;}
    onVisual({objectId:request.objectId,requestedSketch:intent?.requestedSketch});
    if(!intent||!hasMovement||(motion?.dof!==0&&motion?.geometry&&motion.unchanged)){setWorking(false);if(hasMovement&&!intent)setError(planned.error??"Handle edit is invalid.");return;}
    setWorking(true);
    const timer=setTimeout(()=>{void(async()=>{
      try{
        const plan=await previewCadCommand(directEditWithReleases(intent.command,intent.sketchId,releases),{signal:abort.signal});planId=plan.planId;
        if(abort.signal.aborted||ticket!==sequence.current){discardCadPlan(plan.planId);return;}
        const next={plan,sources:intent.sketchId?getCadPlanSketchPreview(plan.planId,intent.sketchId):undefined};
        reviewedIntent.current=intent;setReview(next);setPaths(getCadPlanDrawingPaths(plan.planId,request.objectId));
        if(plan.stale){setStale(true);onVisual(undefined);}
        else onVisual({objectId:request.objectId,review:next,requestedSketch:intent.requestedSketch});
        if(!plan.result.ok)setError(plan.result.reason??"Handle edit rejected.");
      }catch(cause){if(ticket===sequence.current&&!abort.signal.aborted)setError(cause instanceof Error?cause.message:"Preview failed.");}
      finally{if(ticket===sequence.current)setWorking(false);}
    })();},session.phase==="review"?0:90);
    return ()=>{clearTimeout(timer);abort.abort();if(planId)discardCadPlan(planId);};
  },[intent,planned.error,request.objectId,releases,session.phase,session.baseVersion,hasMovement,stale,inputValid,onVisual]);
  useEffect(()=>()=>{onVisual(undefined);onInspectConstraint(null);},[onVisual,onInspectConstraint]);
  const ready=commandInteraction({command:"Direct edit",draftKey:JSON.stringify(intent?.command),reviewedKey:reviewMatches?JSON.stringify(reviewedIntent.current?.command):undefined,preview:review?.plan,targets:[request.objectId],pending:applying,visualReady:session.phase==="review"&&!working&&inputValid&&!stale,inputError:error}).canApply;
  const applyRef=useRef(()=>{}),closeRef=useRef(onClose);closeRef.current=onClose;
  async function apply(){if(!ready||!review)return;setApplying(true);try{const result=await applyCadPlan(review.plan.planId);if(result.ok){onApplied();onClose();}else setError(result.reason??"Edit rejected.");}catch(cause){setError(cause instanceof Error?cause.message:"Edit rejected.");}finally{setApplying(false);}}
  applyRef.current=()=>{void apply();};
  useEffect(()=>{const key=(event:KeyboardEvent)=>{
    if(session.phase!=="review"||isCadKeyboardBlocked(event.target,event.key)||applying||(!["Enter","Escape"].includes(event.key)))return;
    event.preventDefault();event.stopImmediatePropagation();if(event.key==="Escape")closeRef.current();else applyRef.current();
  };window.addEventListener("keydown",key,true);return()=>window.removeEventListener("keydown",key,true);},[session.phase,applying]);
  function editCoordinate(index:number,value:string){const next=[...coordinates];next[index]=value;setCoordinates(next);const parsed=next.map(v=>parseLength(v));if(parsed.every((v):v is number=>v!==null))setOverride(adjustDirectRequest(cadDocument,request,parsed[0],parsed[1]));}
  const blockers=sketch&&review?.plan.result.diagnostic?.kind==="sketch-conflict"?sketch.constraints.filter(c=>review.plan.result.diagnostic!.constraintIds.includes(c.id)&&!releases.includes(c.id)):[];
  const sourceFeature=Object.values(cadDocument.features).find(f=>f.output===request.objectId);
  const sourcePlane=sourceFeature?.params.workPlane==="XZ"||sourceFeature?.params.workPlane==="YZ"?sourceFeature.params.workPlane:"XY";
  const axes=sourcePlane==="XZ"?["X","Z"]:sourcePlane==="YZ"?["Y","Z"]:["X","Y"];
  const [screen,setScreen]=useState<{target:[number,number];left:number;lines:{side:string;geometryId?:string;points:string}[]}>({target:[0,0],left:12,lines:[]});
  useEffect(()=>{
    const worldPath=(source:Sketch,geometry:Sketch["geometry"][number])=>sketchEntityPath(geometry).map(p=>planeToWorld(p,WORK_PLANES[source.workPlane]));
    const sources=sketch?[sketch,intent?.requestedSketch,review?.sources?.after].filter((s):s is Sketch=>Boolean(s)).flatMap(s=>s.geometry.flatMap(g=>worldPath(s,g))):[...(paths?.before??(sourceFeature?getWorldDrawingGeometry(cadDocument.objects[request.objectId],sourceFeature)?.points:undefined)??[]),...(intent?.requestedPath??[])];
    // These snapshots change with an edit or review, while the camera can move
    // every frame. Rebuild geometry/impact once; only projection belongs in RAF.
    const worldLines:{side:string;geometryId?:string;points:Vec3[]}[]=[];
    if(!stale&&inputValid){
      if(!sketch)worldLines.push({side:"requested",points:intent?.requestedPath??[]},{side:"before",points:paths?.before??[]},{side:"after",points:paths?.after??[]});
      else if(!hasSketchOverlay){
        const outline=(source:Sketch,ids:string[])=>{const selected=new Set(ids);return source.geometry.filter(g=>selected.has(g.id)).map(g=>({geometryId:g.id,points:worldPath(source,g)}));};
        if(intent?.requestedSketch)worldLines.push(...outline(intent.requestedSketch,sketchEditImpact(sketch,intent.requestedSketch,"").changedGeometryIds).map(p=>({...p,side:"requested"})));
        if(review?.sources){const ids=sketchEditImpact(review.sources.before,review.sources.after,"").changedGeometryIds;for(const side of ["before","after"] as const)worldLines.push(...outline(review.sources[side],ids).map(p=>({...p,side})));}
        const selected=sketch.constraints.find(c=>c.id===inspectedConstraintId),ids=[...(selected?constraintGeometryIds(selected):[]),...(review?.plan.result.diagnostic?.geometryIds??[])];
        worldLines.push(...outline(sketch,ids).map(p=>({...p,side:"inspected"})));
      }
    }
    let frame=0,signature="";const draw=()=>{
    const started=performance.now();
    const path=(points:Vec3[]|undefined)=>(points??[]).map(project).map(p=>p.map(v=>v.toFixed(1)).join(",")).join(" ");
    const projected=sources.map(project),width=document.querySelector('.cad-viewport')?.clientWidth??360;
    const leftSpace=projected.length?Math.min(...projected.map(p=>p[0])):width/2,rightSpace=projected.length?width-Math.max(...projected.map(p=>p[0])):width/2;
    const lines=worldLines.map(line=>({...line,points:path(line.points)}));
    const next={target:project(request.targetWorld),left:leftSpace>=rightSpace?12:Math.max(8,width-352),lines};
    const hash=JSON.stringify(next);if(hash!==signature){signature=hash;setScreen(next);}measureDirectFeedback(started);frame=requestAnimationFrame(draw);
  };frame=requestAnimationFrame(draw);return()=>cancelAnimationFrame(frame);},[request,sketch,stale,intent,paths,project,inputValid,review,sourceFeature,hasSketchOverlay,inspectedConstraintId]);
  const status=stale?"stale":!inputValid?"blocked":working?"working":error?"blocked":review?.plan.result.ok?(review.plan.result.changed?"ready":"unchanged"):"unchanged";
  return <>
    {!stale && inputValid && reviewMatches && <ConstructionEditPreview plan={review?.plan} project={project} getCamera={getCamera} constructionVisible={constructionVisible} />}
    <svg className="direct-edit-ghosts" aria-hidden="true">
      {screen.lines.map(line=><polyline key={`${line.side}:${line.geometryId??"drawing"}`} data-direct-preview-side={line.side}
        data-preview-side={line.geometryId&&["before","after"].includes(line.side)?line.side:undefined} data-preview-geometry={line.geometryId}
        data-requested-geometry={line.geometryId&&line.side==="requested"?line.geometryId:undefined} data-highlight-geometry={line.side==="inspected"?line.geometryId:undefined}
        className={`direct-ghost-${line.side}${review?.plan.result.diagnostic?" conflict":""}`} points={line.points}/>)}
      {!stale&&inputValid&&displayedMotion&&<DirectMotionGuide motion={displayedMotion} raw={request.targetWorld} project={project} world={point=>adjustDirectRequest(cadDocument,request,...(request.target.kind==="control"?point:[point[0]-displayedMotion.origin[0],point[1]-displayedMotion.origin[1]]) as [number,number]).targetWorld}/>}
      {!stale&&inputValid&&!motion&&<circle data-direct-target={status} cx={screen.target[0]} cy={screen.target[1]} r="6"/>}
    </svg>
    <form ref={formRef} data-cad-editor data-testid="direct-edit-review" data-direct-phase={session.phase} data-preview-status={status} className="sketch-dimension-editor direct-edit-review" style={{...style,left:screen.left}}
      onSubmit={e=>{e.preventDefault();void apply();}} onKeyDown={e=>{e.stopPropagation();if(e.key==="Escape"&&!applying){e.preventDefault();onClose();}}}>
      <div className="dimension-title"><strong>{intent?.label??"Direct edit"}</strong><button type="button" onClick={()=>setCollapsed(v=>!v)}>{collapsed?"Expand review":"Collapse review"}</button></div>
      <p className="dimension-driver">{intent?.drivers.length?intent.drivers.map(d=>d.label).join("; "):"Keep existing relations · review before Apply"}</p>
      {sketch&&<label>Intent<select aria-label="Direct edit intent" disabled={applying||stale} value={mode} onChange={e=>{setMode(e.target.value as DirectEditMode);setReleases([]);}}><option value="drivers">Resize through dimensions</option><option value="geometry">Keep dimensions · anchor opposite</option>{request.target.kind==="control"&&["line","polyline"].includes(sketch.geometry.find(g=>g.id===request.objectId)?.kind??"")&&<option value="connected">Let connected geometry follow</option>}</select></label>}
      {mode==="connected"&&<p className="direct-intent-caption">Only the requested point is targeted. Other unfixed vertices may move to retain every saved dimension and relationship. Review all green geometry before Apply.</p>}
      {!stale&&inputValid&&motion&&<p className={`direct-motion-caption${motion.kind==="locked"?" locked":""}`} data-motion-caption>{motionCaption(motion,axes)}</p>}
      <div className="direct-coordinate-frame">{sourcePlane} · {sketch?"sketch":"drawing model"} coordinates</div>
      <div className="direct-target-coordinates">{coordinates.map((value,index)=><label key={index}>{request.target.kind==="control"?"Target":"Delta"} {axes[index]}<input aria-label={`Direct ${request.target.kind==="control"?"target":"delta"} ${axes[index]}`} disabled={applying||stale||session.phase==="dragging"} value={value} onChange={e=>editCoordinate(index,e.target.value)}/></label>)}</div>
      {!stale&&inputValid&&displayedMotion?.projected&&reportedPoint&&<p className="direct-motion-applied" data-motion-applied>{displayedMotion.kind==="locked"?"Retained position":`${verifiedShift?"Verified":"Allowed"} ${request.target.kind==="control"?"target":"delta"}`}: {axes.map((axis,i)=>`${axis} ${Number((request.target.kind==="control"?reportedPoint[i]:reportedPoint[i]-displayedMotion.origin[i]).toFixed(6))} mm`).join(" · ")} · {displayedMotion.kind==="locked"?"requested movement is blocked":verifiedShift?"linked drivers also change this grip's position":"pointer / input projected onto the allowed movement"}</p>}
      <div className="dimension-preview-status" role="status">{stale?"Document changed · start a new drag.":!inputValid?"Enter valid coordinates with units.":working?"Requested shape shown · checking relations and dependent geometry…":error?"Edit blocked · document unchanged":status==="unchanged"?"No change · move the handle or adjust coordinates · Esc cancels":session.phase==="dragging"?"Drag preview · release to review · Esc cancels":"Preview ready · Apply or Enter confirms · Esc cancels"} · {session.snap}</div>
      {error&&!stale&&<p role="alert">{error}</p>}
      {!inputValid&&!stale&&<p role="alert">Enter valid coordinates with units.</p>}
      {!collapsed&&!stale&&<CanvasEditImpact review={review} sketch={sketch} geometryIds={[request.objectId]} onInspectConstraint={onInspectConstraint}/>}
      {!collapsed&&!stale&&reviewMatches&&<ConstructionEditImpact plan={review?.plan}/>}
      {!stale&&releases.length>0&&<div className="dimension-releases"><p>Release on Apply: {releases.join(", ")}</p><button type="button" onClick={()=>setReleases([])}>Keep all constraints</button></div>}
      {!stale&&blockers.length>0&&<div className="dimension-blockers"><strong>Conflicting constraints · choose what to keep</strong>{blockers.map(c=><div key={c.id}><span>{constraintCaption(sketch!,c)}</span>{"value" in c&&typeof c.value==="number"&&<button type="button" onClick={()=>onEditConstraint(c.id)}>Edit {c.id}</button>}<button type="button" onClick={()=>setReleases(ids=>[...ids,c.id])}>Preview release {c.id}</button></div>)}</div>}
      <div className="dimension-actions"><button type="submit" disabled={!ready}>Apply direct edit</button><button type="button" disabled={applying} onClick={onClose}>{stale?"Start a new drag":"Cancel direct edit"}</button></div>
    </form>
  </>;
}
