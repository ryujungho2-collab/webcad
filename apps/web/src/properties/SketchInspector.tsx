import {NumericEditMeasurements} from "./NumericModelEdit";
import { VectorStyleEditor } from "./VectorStyleEditor";
import { DEFAULT_VECTOR_STYLE, type CadVectorStyle, sketchCircularGeometry } from "@agent-webcad/cad-document";
import { useEffect, useRef, useState } from "react";
import type { Sketch, SketchConstraint, SketchPointRef, SketchSegmentRef } from "@agent-webcad/cad-document";
import { dispatchCadCommand } from "../state/dispatchCadCommand";
import { sketchPoint } from "../precision/sketchSolver";
import { parseAngle, parseLength } from "../precision/units";
import type { TopologySelectionRef } from "../state/selection";
import { PropertySection } from "../ui/PropertySection";
import type { CommandDiagnostic } from "@agent-webcad/cad-commands";
import { constraintGeometryIds } from "../precision/sketchEditing";
import { sketchDimensionName, parseSketchDimension } from "../precision/sketchAnnotations";
import {ParameterBindingsNotice} from "./ParameterBindingsNotice";
import { DependencyNotice } from "./DependencyNotice";
import { cadDocument } from "../state/cadDocument";
import { sketchSegment, sketchSegments } from "../precision/sketchRelations";
import { applyCadPlan, discardCadPlan, getCadPlanSketchPreview, previewCadCommand } from "../state/documentPlans";
import type { CanvasEditReview } from "../viewport/CanvasDimensionEditor";
import { commandInteraction } from "../state/commandInteraction";
import { CommandReview } from "../ui/CommandReview";
import { curveCurveContact, lineArcContact } from "../precision/sketchArcRelations";
import { faceSketchExtrusionProfile } from "../precision/faceSketchProfile";

type Props = { reviewResetKey?: number; sketch: Sketch; onConstraintReview?: (review?: CanvasEditReview) => void; onVariables?:()=>void; onFaceExtruded?:(id:string)=>void; selectedConstraintId?: string | null; onSelectConstraint?: (id: string | null) => void; diagnostic?: CommandDiagnostic; selectedObjectIds: string[]; selectedSubObjects: TopologySelectionRef[]; onDocumentChange: () => void; offsetDistance?: string; onOffsetDistanceChange?: (value: string) => void; offsetSide?: "left" | "right"; onOffsetSideChange?: (value: "left" | "right") => void; onOffset?: () => void };
type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never;

export function SketchInspector({ reviewResetKey,sketch,onConstraintReview,onVariables,onFaceExtruded, selectedConstraintId, onSelectConstraint, diagnostic, selectedObjectIds, selectedSubObjects, onDocumentChange, offsetDistance, onOffsetDistanceChange, offsetSide, onOffsetSideChange, onOffset }: Props) {
  const [error, setError] = useState("");
  const [faceDistance,setFaceDistance]=useState("10 mm");
  const [cutDistance,setCutDistance]=useState("10 mm"),[cutThrough,setCutThrough]=useState(false);
  const [cutPreview,setCutPreview]=useState<Awaited<ReturnType<typeof previewCadCommand>>>(),[cutKey,setCutKey]=useState<string>(),[cutBusy,setCutBusy]=useState(false);
  const cutPlan=useRef<string|undefined>(undefined),cutSequence=useRef(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [showAll, setShowAll] = useState(false);
  const [review, setReview] = useState<CanvasEditReview>(), [reviewing,setReviewing] = useState(false), [relationName,setRelationName]=useState("");
  const [edges,setEdges] = useState<Record<string,string>>({});
  const [applying,setApplying]=useState(false);
  const [reviewCommand,setReviewCommand]=useState<Parameters<typeof previewCadCommand>[0]>(),[reviewedKey,setReviewedKey]=useState<string>();
  const draftKey=JSON.stringify([reviewCommand,drafts,edges,selectedObjectIds,selectedSubObjects,cadDocument.revision]);
  const sequence=useRef(0), plan=useRef<string|undefined>(undefined);
  function cancelReview(){ sequence.current++; if(plan.current)discardCadPlan(plan.current);plan.current=undefined;setReview(undefined);setReviewing(false);setRelationName("");setError(""); }
  useEffect(()=>{cancelReview();},[reviewResetKey,sketch.id,cadDocument.revision,selectedObjectIds.join(),JSON.stringify(selectedSubObjects)]);
  useEffect(()=>{onConstraintReview?.(review);return()=>onConstraintReview?.(undefined);},[review,onConstraintReview]);
  useEffect(()=>()=>{sequence.current++;if(plan.current)discardCadPlan(plan.current);},[]);
  function cancelCut(){cutSequence.current++;if(cutPlan.current)discardCadPlan(cutPlan.current);cutPlan.current=undefined;setCutPreview(undefined);setCutKey(undefined);setCutBusy(false);}
  useEffect(()=>{cancelCut();},[reviewResetKey,sketch.id,cadDocument.revision]);
  useEffect(()=>()=>{cutSequence.current++;if(cutPlan.current)discardCadPlan(cutPlan.current);},[]);
  const relations = sketch.constraints.filter((entry) => showAll || !selectedObjectIds.length || entry.id === selectedConstraintId || diagnostic?.constraintIds.includes(entry.id) || constraintGeometryIds(entry).some((id) => selectedObjectIds.includes(id)));
  const geometry = sketch.geometry.filter((entity) => selectedObjectIds.includes(entity.id));
  const controls: SketchPointRef[] = selectedSubObjects.filter((ref) => ref.kind === "drawing-control" && geometry.some((entity) => entity.id === ref.objectId))
    .map((ref) => ({ geometryId: ref.objectId, pointId: ref.topologyId }));
  const first = geometry[0];
  const point = (ref: SketchPointRef) => sketchPoint(sketch.geometry.find((entity) => entity.id === ref.geometryId)!, ref.pointId);
  const distance = (a: SketchPointRef, b: SketchPointRef) => { const p = point(a)!, q = point(b)!; return Math.hypot(p[0] - q[0], p[1] - q[1]); };
  async function send(command: Parameters<typeof dispatchCadCommand>[0]) {
    try {
      const result = await dispatchCadCommand(command);
      if (!result.ok) setError(result.reason ?? "Constraint rejected.");
      else { setError(""); onDocumentChange(); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Invalid sketch command."); }
  }
  async function extrudeFaceSketch(){
    const distance=parseLength(faceDistance);
    if(distance===null||Math.abs(distance)<=1e-9){setError("Enter a nonzero extrusion distance.");return;}
    try{const result=await dispatchCadCommand({type:"create-face-extrude",sketchId:sketch.id,distance});if(!result.ok)throw Error(result.reason??"Face extrusion was rejected.");setError("");onDocumentChange();const id=result.createdIds[0];if(id)onFaceExtruded?.(id);}catch(cause){setError(cause instanceof Error?cause.message:String(cause));}
  }
  const cutTarget=sketch.facePlaneId?cadDocument.workPlanes?.[sketch.facePlaneId]?.source?.objectId:undefined;
  const cutDraftKey=JSON.stringify([sketch.id,cutTarget,cutDistance,cutThrough,cadDocument.revision]);
  const cutInteraction=commandInteraction({command:"Face cut",draftKey:cutDraftKey,reviewedKey:cutKey,preview:cutPreview,targets:cutTarget?[cutTarget]:[],pending:cutBusy,inputError:undefined,idle:!cutPreview&&!cutBusy});
  async function reviewFaceCut(){
    const distance=parseLength(cutDistance);
    if(!cutTarget||distance===null||Math.abs(distance)<=1e-9){setError("Choose an attached solid and a nonzero cut depth.");return;}
    cancelCut();const ticket=++cutSequence.current;setCutBusy(true);setError("");
    try{const preview=await previewCadCommand({type:"create-face-cut",sketchId:sketch.id,targetId:cutTarget,distance,through:cutThrough});
      if(ticket!==cutSequence.current){discardCadPlan(preview.planId);return;}
      cutPlan.current=preview.planId;setCutPreview(preview);setCutKey(cutDraftKey);
      if(!preview.result.ok)setError(preview.result.reason??"Cut preview failed.");
    }catch(cause){if(ticket===cutSequence.current)setError(cause instanceof Error?cause.message:String(cause));}
    finally{if(ticket===cutSequence.current)setCutBusy(false);}
  }
  async function applyFaceCut(){
    if(!cutInteraction.canApply||!cutPlan.current)return;setCutBusy(true);
    try{const result=await applyCadPlan(cutPlan.current);if(!result.ok)throw Error(result.reason??"Cut rejected.");cancelCut();setError("");onDocumentChange();const id=result.createdIds[0];if(id)onFaceExtruded?.(id);}
    catch(cause){setError(cause instanceof Error?cause.message:String(cause));setCutBusy(false);}
  }
  const add = (constraint: WithoutId<SketchConstraint>) => void previewRelation(constraint);
  async function previewRelation(constraint: WithoutId<SketchConstraint>){
    cancelReview();const ticket=++sequence.current;setReviewing(true);setError("");
    const c={...constraint,id:`constraint-${crypto.randomUUID()}`} as SketchConstraint;setRelationName(sketchDimensionName(sketch,c));
    const command={type:"add-sketch-constraint",sketchId:sketch.id,constraint:c};setReviewCommand(command);
    const key=JSON.stringify([command,drafts,edges,selectedObjectIds,selectedSubObjects,cadDocument.revision]);
    try{const preview=await previewCadCommand(command);
      if(ticket!==sequence.current){discardCadPlan(preview.planId);return;}plan.current=preview.planId;
      setReview({plan:preview,sources:getCadPlanSketchPreview(preview.planId,sketch.id)});setReviewedKey(key);
      if(!preview.result.ok)setError(preview.result.reason??"Constraint rejected.");
    }catch(cause){if(ticket===sequence.current)setError(cause instanceof Error?cause.message:"Preview failed.");}
    finally{if(ticket===sequence.current)setReviewing(false);}
  }
  const interaction=commandInteraction({command:"Edit Sketch",draftKey,reviewedKey,preview:review?.plan,targets:selectedObjectIds,pending:applying,inputError:error,visualReady:!reviewing,idle:!relationName&&!reviewing});
  async function applyRelation(){if(!interaction.canApply||!review)return;setApplying(true);try{const result=await applyCadPlan(review.plan.planId);if(result.ok){cancelReview();setError("");setDrafts({});onDocumentChange();}else setError(result.reason??"Constraint rejected.");}catch(cause){setError(cause instanceof Error?cause.message:"Constraint rejected.");}finally{setApplying(false);}}
  useEffect(()=>{if(!relationName)return;const key=(event:KeyboardEvent)=>{if(event.defaultPrevented||event.target instanceof Element&&event.target.closest('dialog[open],.snap-settings-panel'))return;if(event.key==="Escape"){event.preventDefault();event.stopImmediatePropagation();cancelReview();}};window.addEventListener("keydown",key,true);return()=>window.removeEventListener("keydown",key,true);},[relationName]);
  const selectedSegments=geometry.flatMap(sketchSegments);
  const allSegments=sketch.geometry.flatMap(sketchSegments);
  const chooseEdge=(role:string,options:SketchSegmentRef[],fallback?:SketchSegmentRef)=>options.find(ref=>JSON.stringify(ref)===edges[role])??options.find(ref=>JSON.stringify(ref)===JSON.stringify(fallback))??options[0];
  const subEdges=selectedSubObjects.filter(ref=>ref.kind==="drawing-segment").map(ref=>({geometryId:ref.objectId,segmentId:ref.topologyId}));
  const edgeA=chooseEdge("first",selectedSegments,subEdges[0]),edgeB=chooseEdge("second",selectedSegments.filter(ref=>JSON.stringify(ref)!==JSON.stringify(edgeA)),subEdges[1]);
  const segmentLabel=(ref:SketchSegmentRef)=>`${cadDocument.objects[ref.geometryId]?.name??ref.geometryId} ${sketch.geometry.findIndex(g=>g.id===ref.geometryId)+1} · edge ${sketchSegments(sketch.geometry.find(g=>g.id===ref.geometryId)!).findIndex(r=>r.segmentId===ref.segmentId)+1}`;
  const edgeSelect=(role:string,label:string,options:SketchSegmentRef[],chosen:SketchSegmentRef|undefined)=><label className="property-row"><span>{label}</span><select aria-label={label} value={chosen?JSON.stringify(chosen):""} onChange={event=>setEdges(current=>({...current,[role]:event.target.value}))}>{options.map(ref=><option key={JSON.stringify(ref)} value={JSON.stringify(ref)}>{segmentLabel(ref)}</option>)}</select></label>;
  const curveOptions = geometry.flatMap(g => g.kind === "polyline" ? g.segmentIds.flatMap(segmentId => { const arc=sketchCircularGeometry(g,segmentId);return arc?[{geometryId:g.id,segmentId,arc}]:[]; }) : []);
  const curveSegment = (id:string) => curveOptions.find(o=>o.geometryId===id&&o.segmentId===edges[`curve:${id}`])?.segmentId ?? curveOptions.find(o=>o.geometryId===id)?.segmentId;
  const circles=geometry.flatMap(g=>{const curve=sketchCircularGeometry(g,curveSegment(g.id));return curve?[curve]:[];});
  const curveFields=(id:string,slot:"firstCurveSegmentId"|"secondCurveSegmentId"|"curveSegmentId"|"segmentId")=>{const segmentId=curveSegment(id);return segmentId?{[slot]:segmentId}:{};};
  const targetLine=controls.length===1?chooseEdge("target",selectedSegments.filter(ref=>ref.geometryId!==controls[0].geometryId)):undefined;
  const targetCurve=controls.length===1?circles.find(g=>g.id!==controls[0].geometryId):undefined;
  const tangentLine=geometry.length===2&&circles.length===1?chooseEdge("tangent",selectedSegments):undefined;
  const tangentEdge=tangentLine?sketchSegment(sketch.geometry.find(g=>g.id===tangentLine.geometryId),tangentLine):null;
  const tangentCurve=circles.length===1?circles[0]:undefined;
  const tangentSide:1|-1=tangentEdge&&tangentCurve&&(tangentEdge[1][0]-tangentEdge[0][0])*(tangentCurve.center[1]-tangentEdge[0][1])-(tangentEdge[1][1]-tangentEdge[0][1])*(tangentCurve.center[0]-tangentEdge[0][0])<0?-1:1;
  const lineArcCandidate=tangentEdge&&tangentCurve?.kind==="arc"?lineArcContact(tangentEdge,tangentCurve,tangentSide):null;
  const lineArcSuggested=lineArcCandidate&&Math.max(Math.abs(lineArcCandidate.distanceError),Math.abs(lineArcCandidate.segmentError),Math.abs(lineArcCandidate.arcError))<=Math.max(2,Math.min(10,tangentCurve?.radius??0));
  const curveSuggestions=circles.length===2&&circles.some(g=>g.kind==="arc")?(["external","internal"] as const).flatMap(contact=>{const result=curveCurveContact(circles[0],circles[1],contact);return result&&Math.max(Math.abs(result.distanceError),Math.abs(result.firstError),Math.abs(result.secondError))<=Math.max(2,Math.min(10,Math.min(circles[0].radius,circles[1].radius)))?[contact]:[];}):[];
  let pair = controls.length === 2 ? controls : null;
  if (!pair && first?.kind === "line" && geometry.length === 1) pair = [{ geometryId: first.id, pointId: first.startId }, { geometryId: first.id, pointId: first.endId }];
  const hasConstraintActions = Boolean(pair || controls.length === 1 ||
    (geometry.length === 1 && (circles.length === 1 || first.kind === "rectangle")) ||
    edgeB || circles.length === 2 || tangentLine);
  const dimensionLabel = (constraint: SketchConstraint) => sketchDimensionName(sketch, constraint);
  async function commitDimension(constraint: SketchConstraint) {
    if (!("value" in constraint) || typeof constraint.value !== "number") return;
    const draft = drafts[constraint.id];
    if (draft === undefined) return;
    const value = parseSketchDimension(constraint, draft);
    if (value === null) { setError("Enter a valid dimension value."); return; }
    if (Math.abs(value - constraint.value) <= 1e-9) return;
    cancelReview(); const ticket=++sequence.current; setReviewing(true); setRelationName(dimensionLabel(constraint));
    const command={type:"set-sketch-dimension",sketchId:sketch.id,constraintId:constraint.id,value};setReviewCommand(command);
    const key=JSON.stringify([command,drafts,edges,selectedObjectIds,selectedSubObjects,cadDocument.revision]);
    try { const preview=await previewCadCommand(command);
      if(ticket!==sequence.current){discardCadPlan(preview.planId);return;} plan.current=preview.planId; setReview({plan:preview,sources:getCadPlanSketchPreview(preview.planId,sketch.id)});setReviewedKey(key); if(!preview.result.ok)setError(preview.result.reason??"Dimension rejected.");
    } catch(cause){if(ticket===sequence.current)setError(cause instanceof Error?cause.message:String(cause));} finally{if(ticket===sequence.current)setReviewing(false);}
  }
  return <div className="properties-content" data-testid="sketch-inspector">
    <ParameterBindingsNotice sketchId={sketch.id} onEdit={onVariables}/>
    {geometry.length === 1 && <DependencyNotice objectId={geometry[0].id} revision={cadDocument.revision}/>}
    <div className="inspector-header"><span>Sketch inspector</span><small>{sketch.facePlaneId?`Face · ${sketch.facePlaneId}`:`${sketch.workPlane} plane`}</small></div>
    <div className="inspector-selection-summary">
      <span className="inspector-selection-mark" aria-hidden="true">◇</span>
      <div><strong>{geometry.length ? `${geometry.length} ${geometry.length === 1 ? "entity" : "entities"} selected` : "Sketch geometry"}</strong><span>{controls.length ? `${controls.length} ${controls.length === 1 ? "point" : "points"} selected` : "Select entities to add constraints"}</span></div>
    </div>
    <PropertySection title="Sketch" meta={sketch.workPlane}>
      <div className="property-row"><span>Entities</span><strong>{sketch.geometry.length}</strong></div>
      <div className="property-row"><span>Status</span><strong className={sketch.solveState.status === "fully-constrained" ? "sketch-status-complete" : undefined}>{sketch.solveState.status === "fully-constrained" ? "Fully constrained" : `${sketch.solveState.degreesOfFreedom} DOF`}</strong></div>
      {sketch.solveState.status !== "fully-constrained" && <p className="property-hint">{sketch.solveState.degreesOfFreedom} degrees of freedom remaining.</p>}
    </PropertySection>
    {sketch.facePlaneId&&<PropertySection title="Face sketch" meta={sketch.faceStatus}>
      <div className="property-row"><span>Source</span><strong>{cadDocument.workPlanes?.[sketch.facePlaneId]?.name??sketch.facePlaneId}</strong></div>
      {sketch.faceStatus!=="resolved"&&<p className="property-hint" role="status">The saved source face is {sketch.faceStatus}. Finish the sketch, select the intended face, and rebind its work plane before editing or extruding.</p>}
      <label className="property-row"><span>Extrude distance</span><input aria-label="Face sketch extrude distance" value={faceDistance} onChange={event=>setFaceDistance(event.target.value)}/></label>
      <div className="sketch-actions"><button type="button" disabled={!faceSketchExtrusionProfile(sketch)||parseLength(faceDistance)===null} onClick={()=>void extrudeFaceSketch()}>Extrude face sketch</button></div>
      <label className="property-row"><span>Cut depth</span><input aria-label="Face cut depth" value={cutDistance} onChange={event=>{cancelCut();setCutDistance(event.target.value);}}/></label>
      <label className="property-row"><span>Through all</span><input type="checkbox" aria-label="Face cut through all" checked={cutThrough} onChange={event=>{cancelCut();setCutThrough(event.target.checked);}}/></label>
      <p className="property-hint">Positive depth cuts toward the source solid; negative depth reverses direction. Through all crosses its full extent.</p>
      <div className="sketch-actions"><button type="button" disabled={!cutTarget||!faceSketchExtrusionProfile(sketch)||cutBusy} onClick={()=>void reviewFaceCut()}>Review face cut</button></div>
      {cutPreview&&<><CommandReview state={cutInteraction}/>{cutPreview.result.ok&&(()=>{const change=cutPreview.changes.find(entry=>entry.kind==="created"&&entry.after?.volume!==undefined);const before=cutPreview.changes.find(entry=>entry.objectId===cutTarget)?.before?.volume;return <p className="property-hint" data-testid="face-cut-volume">Volume: {before?.toFixed(3)??"?"} → {change?.after?.volume?.toFixed(3)??"?"} mm³</p>;})()}<div className="sketch-actions"><button type="button" disabled={!cutInteraction.canApply} onClick={()=>void applyFaceCut()}>Apply face cut</button><button type="button" onClick={cancelCut}>Cancel review</button></div></>}
      <p className="property-hint">Draw one closed profile on the face. Driving sketch dimensions update its projection and live extrusion.</p>
    </PropertySection>}
    {error && <div className="inspector-notice inspector-error" role="alert">{error}</div>}
    {(relationName || reviewing) && <PropertySection title="Constraint preview" meta={reviewing?"Solving…":relationName}>
      <p className="property-hint">Before and solved geometry are shown on the canvas. {review?.sources?`${review.sources.after.solveState.degreesOfFreedom} DOF after applying.`:""}</p>
      <CommandReview state={interaction}/><NumericEditMeasurements preview={interaction.preview??undefined}/>
      <div className="sketch-actions"><button type="button" disabled={!interaction.canApply} onClick={()=>void applyRelation()}>Apply constraint</button><button type="button" disabled={applying} onClick={cancelReview}>Cancel constraint</button></div>
    </PropertySection>}
    {geometry.length > 0 && <PropertySection title="Geometry purpose">
      <label className="property-row"><span>Construction</span><input type="checkbox" aria-label="Construction geometry" checked={geometry.every((entry) => entry.construction)} onChange={(event) => void send({ type: "set-sketch-construction", sketchId: sketch.id, geometryIds: geometry.map((entry) => entry.id), construction: event.target.checked })} /></label>
      <p className="property-hint">Construction geometry supports snaps and constraints and is excluded from solid profiles.</p>
    </PropertySection>}
    {geometry.length === 1 && onOffset && !sketch.facePlaneId && <PropertySection title="Offset" meta="mm">
      <div className="property-row"><label htmlFor="sketch-offset-distance">Distance</label><input id="sketch-offset-distance" aria-label="Sketch offset distance" value={offsetDistance} onChange={(event) => onOffsetDistanceChange?.(event.target.value)} /></div>
      <div className="sketch-actions"><button type="button" aria-pressed={offsetSide === "left"} onClick={() => onOffsetSideChange?.("left")}>Left / inside</button><button type="button" aria-pressed={offsetSide === "right"} onClick={() => onOffsetSideChange?.("right")}>Right / outside</button><button type="button" onClick={onOffset}>Create offset</button></div>
    </PropertySection>}
    {geometry.length === 1 && (()=>{
      const object=cadDocument.objects[first.id],layer=object&&cadDocument.layers[object.layerId];
      const feature=Object.values(cadDocument.features).find(f=>f.output===first.id);
      const style={...DEFAULT_VECTOR_STYLE,...(layer?.style?{stroke:layer.style.color,strokeWidth:layer.style.lineWeight}:{}),...(feature?.params.vectorStyle as Partial<CadVectorStyle>??{})};
      return <VectorStyleEditor key={first.id} objectId={first.id} style={style} disabled={!object?.visible||!layer?.visible||layer.locked||!!cadDocument.layers[sketch.layerId]?.locked} revision={cadDocument.revision} onDocumentChange={onDocumentChange}/>;
    })()}
    <PropertySection title="Add constraint" meta={hasConstraintActions ? "Selection" : undefined}>
      {geometry.filter(g=>curveOptions.some(o=>o.geometryId===g.id)).map(g=><label key={g.id} className="property-row"><span>Arc edge</span><select aria-label={`Constraint arc edge ${g.id}`} value={curveSegment(g.id)} onChange={e=>setEdges(current=>({...current,[`curve:${g.id}`]:e.target.value}))}>{curveOptions.filter(o=>o.geometryId===g.id).map(o=><option key={o.segmentId} value={o.segmentId}>Edge {g.kind === "polyline" ? g.segmentIds.indexOf(o.segmentId)+1 : 1}</option>)}</select></label>)}
      {pair && <div className="sketch-actions">
        {pair[0].geometryId !== pair[1].geometryId && <button type="button" onClick={() => add({ kind: "coincident", first: pair![0], second: pair![1] })}>Coincident</button>}
        <button type="button" onClick={() => add({ kind: "horizontal", first: pair![0], second: pair![1] })}>Horizontal</button>
        <button type="button" onClick={() => add({ kind: "vertical", first: pair![0], second: pair![1] })}>Vertical</button>
        {distance(pair[0], pair[1]) > 1e-6 && <button type="button" onClick={() => add({ kind: "distance", first: pair![0], second: pair![1], value: distance(pair![0], pair![1]) })}>Distance</button>}
      </div>}
      {controls.length === 1 && <div className="sketch-actions"><button type="button" onClick={() => add({ kind: "fixed-point", point: controls[0], value: point(controls[0])! })}>Fix point</button></div>}
      {geometry.length === 1 && circles.length === 1 && <div className="sketch-actions">
        <button type="button" onClick={() => add({ kind: "radius", geometryId: first.id, ...curveFields(first.id,"segmentId"), value: circles[0].radius })}>Radius</button>
        <button type="button" onClick={() => add({ kind: "diameter", geometryId: first.id, ...curveFields(first.id,"segmentId"), value: circles[0].radius * 2 })}>Diameter</button>
      </div>}
      {geometry.length === 1 && first.kind === "rectangle" && <div className="sketch-actions">
        <button type="button" onClick={() => add({ kind: "distance", first: { geometryId: first.id, pointId: first.cornerIds[0] }, second: { geometryId: first.id, pointId: first.cornerIds[1] }, value: first.width })}>Width</button>
        <button type="button" onClick={() => add({ kind: "distance", first: { geometryId: first.id, pointId: first.cornerIds[0] }, second: { geometryId: first.id, pointId: first.cornerIds[3] }, value: first.height })}>Height</button>
      </div>}
      {geometry.length === 2 && geometry.every((entity) => entity.kind === "line") && <div className="sketch-actions"><button type="button" onClick={() => {
        const a = geometry[0] as Extract<typeof first, { kind: "line" }>, b = geometry[1] as Extract<typeof first, { kind: "line" }>;
        const aa = Math.atan2(a.end[1] - a.start[1], a.end[0] - a.start[0]), bb = Math.atan2(b.end[1] - b.start[1], b.end[0] - b.start[0]);
        add({ kind: "angle", firstLineId: a.id, secondLineId: b.id, value: Math.atan2(Math.sin(bb - aa), Math.cos(bb - aa)) });
      }}>Angle</button></div>}
      {edgeA&&edgeB&&<>
        {edgeSelect("first","First constraint edge",selectedSegments,edgeA)}{edgeSelect("second","Second constraint edge",selectedSegments.filter(ref=>JSON.stringify(ref)!==JSON.stringify(edgeA)),edgeB)}
        <div className="sketch-actions">{(["parallel","perpendicular","equal-length"] as const).map(kind=><button key={kind} type="button" onClick={()=>void previewRelation({kind,firstSegment:edgeA,secondSegment:edgeB})}>{kind==="equal-length"?"Equal length":kind[0].toUpperCase()+kind.slice(1)}</button>)}</div>
      </>}
      {circles.length===2&&<div className="sketch-actions">
        {(["concentric","equal-radius"] as const).map(kind=><button key={kind} type="button" onClick={()=>void previewRelation({kind,firstCurveId:circles[0].id,secondCurveId:circles[1].id,...curveFields(circles[0].id,"firstCurveSegmentId"),...curveFields(circles[1].id,"secondCurveSegmentId")})}>{kind==="concentric"?"Concentric":"Equal radius"}</button>)}
        {(["external","internal"] as const).map(contact=><button key={contact} type="button" onClick={()=>void previewRelation({kind:"tangent-circles",firstCurveId:circles[0].id,secondCurveId:circles[1].id,...curveFields(circles[0].id,"firstCurveSegmentId"),...curveFields(circles[1].id,"secondCurveSegmentId"),contact})}>{curveSuggestions.includes(contact)?"Review suggested ":""}{contact==="external"?"External tangent":"Internal tangent"}</button>)}
      </div>}
      {tangentLine&&<>{edgeSelect("tangent","Tangent edge",selectedSegments,tangentLine)}<div className="sketch-actions"><button type="button" onClick={()=>{
        void previewRelation({kind:"tangent-line",line:tangentLine,curveId:tangentCurve!.id,...curveFields(tangentCurve!.id,"curveSegmentId"),side:tangentSide});
      }}>{lineArcSuggested?"Review suggested tangent":"Tangent"}</button></div></>}
      {controls.length===1&&<>
        {targetLine&&<>{edgeSelect("target","Point target edge",selectedSegments.filter(ref=>ref.geometryId!==controls[0].geometryId),targetLine)}<div className="sketch-actions"><button type="button" onClick={()=>void previewRelation({kind:"point-on-line",point:controls[0],line:targetLine})}>Point on line</button></div></>}
        {targetCurve&&<div className="sketch-actions"><button type="button" onClick={()=>void previewRelation({kind:targetCurve.kind==="arc"?"point-on-arc":"point-on-circle",point:controls[0],curveId:targetCurve.id,...curveFields(targetCurve.id,"curveSegmentId")})}>{targetCurve.kind==="arc"?"Point on arc":"Point on circle"}</button></div>}
      </>}
      {controls.length===2&&allSegments.length>0&&(()=>{const axis=chooseEdge("axis",allSegments,allSegments.find(ref=>!controls.some(p=>p.geometryId===ref.geometryId)));return <>{edgeSelect("axis","Symmetry axis",allSegments,axis)}<div className="sketch-actions"><button type="button" onClick={()=>void previewRelation({kind:"symmetric",first:controls[0],second:controls[1],axis})}>Symmetric</button></div></>;})()}
      {(edgeB||tangentLine||targetLine||targetCurve)&&<p className="property-hint">Arc relations use the actual arc sweep and finite contact; nearby tangent candidates require Preview and Apply before they become permanent. Circle relations use full circles. Select a point and another entity for point-on-line, circle or arc.</p>}
      {!hasConstraintActions && <div className="inspector-section-empty">Select a line, circle, arc, rectangle, or individual points to add a constraint.</div>}
    </PropertySection>
    <PropertySection title="Dimensions & relations" meta={sketch.constraints.length}>
      <p className="property-hint">These dimensions drive the sketch and its live solids. Enter units; R and Ø prefixes accept radius or diameter. Standalone drawing annotations do not drive the model.</p>
      <label className="property-row"><span>Show all relations</span><input type="checkbox" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} /></label>
      {relations.map((constraint) => <div className={`property-row sketch-constraint${selectedConstraintId === constraint.id ? " focused" : ""}${diagnostic?.constraintIds.includes(constraint.id) ? " conflict" : ""}`} key={constraint.id}>
        <button type="button" title={constraint.id} aria-label={`Show ${dimensionLabel(constraint)} geometry`} onClick={() => onSelectConstraint?.(constraint.id)}>{dimensionLabel(constraint)}</button>
        {"value" in constraint && typeof constraint.value === "number" ? <span className="numeric-control"><input aria-label={`${dimensionLabel(constraint)} ${constraint.id}`} type="text" inputMode="decimal" disabled={Object.values(cadDocument.parameterBindings??{}).some(b=>b.target.kind==="sketch-constraint"&&b.target.sketchId===sketch.id&&b.target.constraintId===constraint.id)}
          value={drafts[constraint.id] ?? String(constraint.kind === "angle" ? constraint.value * 180 / Math.PI : constraint.value)}
          onChange={(event) => {cancelReview();setDrafts((current) => ({ ...current, [constraint.id]: event.target.value }));}}
          onFocus={(event) => { event.currentTarget.select(); onSelectConstraint?.(constraint.id); }}
          onBlur={() => void commitDimension(constraint)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /><span className="numeric-unit">{constraint.kind === "angle" ? "°" : "mm"}</span></span> : <strong>Active</strong>}
        <button type="button" aria-label={`Remove ${constraint.kind} constraint`} title="Remove constraint" onClick={() => void send({ type: "remove-sketch-constraint", sketchId: sketch.id, constraintId: constraint.id })}>×</button>
      </div>)}
      {!relations.length && <div className="inspector-section-empty">No constraints for this selection. Add one or show all relations.</div>}
    </PropertySection>
  </div>;
}
