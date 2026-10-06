import { useEffect, useMemo, useRef, useState } from "react";
import type { Sketch, SketchPoint } from "@agent-webcad/cad-document";
import type { CommandDiagnostic } from "@agent-webcad/cad-commands";
import { sketchAnnotations, layoutSketchAnnotation, sketchGeometryPath, type ScreenAnnotation } from "../precision/sketchAnnotations";
import { dispatchCadCommand } from "../state/dispatchCadCommand";
import { sketchEditImpact } from "../state/canvasDimensionEdit";
import { CanvasDimensionEditor, type CanvasEditReview } from "./CanvasDimensionEditor";

type Props = {
  constructionVisible?: boolean;
  sketch: Sketch; project: (point: SketchPoint) => [number, number] | null;
  selectedConstraintId: string | null; diagnostic?: CommandDiagnostic;
  selectedObjectIds?: string[];
  externalReview?:CanvasEditReview;requestedSketch?:Sketch;externalEditActive?:boolean;externalInspectedConstraint?:string|null;
  openDimension?:{id:string;nonce:number};onStartDimensionEdit?:()=>void;
  disabled: boolean; onSelect: (id: string | null) => void; onDocumentChange: () => void;
};
export function SketchOverlay({ sketch, project, selectedConstraintId, diagnostic, selectedObjectIds=[], externalReview,requestedSketch,externalEditActive=false,externalInspectedConstraint,openDimension,onStartDimensionEdit, disabled, onSelect, onDocumentChange, constructionVisible=true }: Props) {
  const annotations = useMemo(() => sketchAnnotations(sketch), [sketch]);
  const [layout, setLayout] = useState<ScreenAnnotation[]>([]);
  const [paths, setPaths] = useState<{ id: string; points: string; conflict: boolean }[]>([]);
  const [editor, setEditor] = useState<{ id: string } | null>(null);
  const [localReview,setReview]=useState<CanvasEditReview>();
  const review=externalEditActive?externalReview:localReview;
  const [ghosts,setGhosts]=useState<{id:string;side:"before"|"after";points:string}[]>([]);
  const [requestedPaths,setRequestedPaths]=useState<{id:string;points:string}[]>([]);
  const [showAll,setShowAll]=useState(false);
  const [inspectedConstraintId,setInspectedConstraintId]=useState<string|null>(null);
  const [pending, setPending] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const place=(anchor:[number,number],width:number,height:number)=>({left:Math.max(8,Math.min(anchor[0],(overlayRef.current?.clientWidth??width+16)-width-8)),top:Math.max(8,Math.min(anchor[1],(overlayRef.current?.clientHeight??height+16)-height-8))});
  const current = sketch.constraints.find((entry) => entry.id === editor?.id);
  const selectionKey=selectedObjectIds.join("\0"),previousSelection=useRef(selectionKey);
  useEffect(()=>{if(previousSelection.current!==selectionKey){previousSelection.current=selectionKey;setEditor(null);onSelect(null);}},[selectionKey,onSelect]);
  useEffect(() => { if (!current) setEditor(null); }, [sketch.id, current]);
  useEffect(()=>{if(externalEditActive)setEditor(null);},[externalEditActive]);
  useEffect(()=>{if(openDimension&&sketch.constraints.some(c=>c.id===openDimension.id&&"value" in c&&typeof c.value==="number")){onSelect(openDimension.id);setEditor({id:openDimension.id});}},[openDimension?.nonce]);
  const effectiveDiagnostic=externalEditActive?externalReview?.plan.result.diagnostic:review?review.plan.result.diagnostic:diagnostic;
  const inspected=externalInspectedConstraint??inspectedConstraintId??selectedConstraintId;
  const previewAnnotations=useMemo(()=>review?.sources?new Map(sketchAnnotations(review.sources.after).map(a=>[a.constraintId,a])):undefined,[review]);
  const changedIds=useMemo(()=>review?.sources?sketchEditImpact(review.sources.before,review.sources.after,editor?.id??"").changedGeometryIds:[],[review,editor?.id]);
  const focusedIds=annotations.find(a=>a.constraintId===selectedConstraintId)?.geometryIds??selectedObjectIds.filter(id=>sketch.geometry.some(g=>g.id===id));
  const visibleIds = new Set(sketch.geometry.filter(g => constructionVisible || !g.construction).map(g => g.id));
  const visibleAnnotations=useMemo(()=>[...annotations,...[...(previewAnnotations?.values()??[])].filter(a=>!annotations.some(before=>before.constraintId===a.constraintId))].filter(a=>a.geometryIds.every(id=>visibleIds.has(id))&&(showAll||!focusedIds.length||a.geometryIds.some(id=>[...focusedIds,...changedIds,...(effectiveDiagnostic?.geometryIds??[])].includes(id)))),[annotations,previewAnnotations,showAll,focusedIds.join(),changedIds,effectiveDiagnostic,constructionVisible,sketch]);
  useEffect(() => {
    let frame = 0, signature = "", last = 0;
    function update(time: number) {
      if (time - last >= 32) {
        last = time;
        const next = visibleAnnotations.flatMap((annotation) => {
          const lane = visibleAnnotations.slice(0, visibleAnnotations.indexOf(annotation)).filter((entry) => entry.geometryIds.join() === annotation.geometryIds.join() && entry.kind === annotation.kind).length;
          const item = layoutSketchAnnotation(annotation, project, lane);
          return item ? [item] : [];
        });
        const focused = annotations.find((entry) => entry.constraintId === inspected)?.geometryIds ?? [];
        const ids = [...new Set([...focused, ...(effectiveDiagnostic?.geometryIds ?? [])])].filter(id => visibleIds.has(id));
        const nextPaths = ids.map((id) => ({ id, conflict: effectiveDiagnostic?.geometryIds.includes(id) ?? false,
          points: sketchGeometryPath(sketch, id).map(project).filter((point): point is [number, number] => Boolean(point)).map((point) => point.map((value) => value.toFixed(1)).join(",")).join(" ") }));
        const nextGhosts=review?.sources?changedIds.filter(id=>visibleIds.has(id)).flatMap(id=>(["before","after"] as const).map(side=>({id,side,points:sketchGeometryPath(review.sources![side],id).map(project).filter((p):p is [number,number]=>Boolean(p)).map(p=>p.map(v=>v.toFixed(1)).join(",")).join(" ")}))):[];
        const nextRequested=requestedSketch?sketchEditImpact(sketch,requestedSketch,"").changedGeometryIds.filter(id=>visibleIds.has(id)).map(id=>({id,points:sketchGeometryPath(requestedSketch,id).map(project).filter((p):p is [number,number]=>Boolean(p)).map(p=>p.map(v=>v.toFixed(1)).join(",")).join(" ")})):[];
        const nextSignature = JSON.stringify([next, nextPaths,nextGhosts,nextRequested]);
        if (signature !== nextSignature) { signature = nextSignature; setLayout(next); setPaths(nextPaths);setGhosts(nextGhosts);setRequestedPaths(nextRequested); }
      }
      frame = requestAnimationFrame(update);
    }
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [annotations,visibleAnnotations, project, selectedConstraintId,inspected, effectiveDiagnostic, sketch,review,changedIds,requestedSketch]);
  function select(item: ScreenAnnotation) {
    onStartDimensionEdit?.();
    onSelect(item.annotation.constraintId);
    if (item.annotation.dimensionId && item.annotation.value !== undefined) {
      setEditor({ id: item.annotation.constraintId });
    } else setEditor(null);
  }
  async function remove(id: string) {
    if (pending || disabled) return;
    setPending(true);
    try {
      const result = await dispatchCadCommand({ type: "remove-sketch-constraint", sketchId: sketch.id, constraintId: id });
      if (result.ok) { setEditor(null); onSelect(null); onDocumentChange(); }
    } finally { setPending(false); }
  }
  const edited = layout.find((entry) => entry.annotation.constraintId === editor?.id);
  const selected = layout.find((entry) => entry.annotation.constraintId === selectedConstraintId);
  // Keep the shape visible: dock to the side with the most space around the reviewed geometry.
  const reviewedPoints=(review?.sources?[review.sources.before,review.sources.after]:[sketch]).flatMap(source=>source.geometry.flatMap(g=>sketchGeometryPath(source,g.id))).map(project).filter((p):p is [number,number]=>Boolean(p));
  const viewportWidth=overlayRef.current?.clientWidth??360;
  const leftSpace=reviewedPoints.length?Math.min(...reviewedPoints.map(p=>p[0])):viewportWidth/2;
  const rightSpace=reviewedPoints.length?viewportWidth-Math.max(...reviewedPoints.map(p=>p[0])):viewportWidth/2;
  const editorPosition={left:leftSpace>=rightSpace?12:Math.max(8,viewportWidth-352),top:52};
  return <div ref={overlayRef} className="sketch-overlay" data-testid="sketch-overlay">
    <svg aria-hidden="true" className="sketch-overlay-lines">
      {requestedPaths.map(path=><polyline key={`requested:${path.id}`} data-requested-geometry={path.id} className={`direct-ghost-requested${effectiveDiagnostic?" conflict":""}`} points={path.points}/>)}
      {ghosts.map(path=><polyline key={`${path.side}:${path.id}`} data-preview-geometry={path.id} data-preview-side={path.side} className={`dimension-ghost-${path.side}`} points={path.points}/>)}
      {paths.map((path) => <polyline key={path.id} data-highlight-geometry={path.id} className={path.conflict ? "conflict" : "focused"} points={path.points} />)}
      {layout.map((item) => <g key={item.annotation.constraintId} className={effectiveDiagnostic?.constraintIds.includes(item.annotation.constraintId) ? "conflict" : item.annotation.constraintId === inspected ? "focused" : ""}>
        {item.segments.map(([a, b], index) => <line key={index} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />)}
      </g>)}
    </svg>
    {layout.map((item) => {const preview=previewAnnotations?.get(item.annotation.constraintId),status=previewAnnotations?(!annotations.some(a=>a.constraintId===item.annotation.constraintId)?"added":!preview?"released":preview.text!==item.annotation.text?"changed":undefined):undefined;
      return <button type="button" key={item.annotation.constraintId} data-constraint-id={item.annotation.constraintId} data-preview-relation-status={status}
      data-dimension-id={item.annotation.dimensionId} aria-label={`Canvas ${item.annotation.name} ${item.annotation.constraintId}`}
      disabled={status==="added"} aria-pressed={selectedConstraintId === item.annotation.constraintId} title={`${item.annotation.name} · ${status==="added"?"Apply the constraint preview to keep this relation":item.annotation.dimensionId ? "Click to edit" : "Click to show geometry"}`}
      className={`sketch-annotation${effectiveDiagnostic?.constraintIds.includes(item.annotation.constraintId) ? " conflict" : ""}`}
      style={{ left: item.anchor[0], top: item.anchor[1] }} onClick={() => select(item)}>{item.annotation.text}{status==="added"?" · add on Apply":status==="changed"?` → ${preview!.text}`:status==="released"?" · release on Apply":""}</button>})}
    {edited && current && editor && <CanvasDimensionEditor key={current.id} sketch={sketch} constraint={current} name={edited.annotation.name}
      style={{...editorPosition,maxHeight:Math.max(130,(overlayRef.current?.clientHeight??600)-(editorPosition?.top??8)-8)}} disabled={disabled||pending} onReview={setReview}
      onClose={()=>setEditor(null)} onApplied={onDocumentChange} onRemove={()=>void remove(current.id)}
      onInspectConstraint={setInspectedConstraintId}
      onEditConstraint={id=>{onSelect(id);setEditor({id});}}/>}
    {!editor && !externalEditActive&&selected && <div data-cad-editor className="sketch-relation-actions" style={place([selected.anchor[0]+12,selected.anchor[1]+18],260,60)}>
      <span>{selected.annotation.name}</span><button type="button" disabled={pending || disabled} onClick={() => void remove(selected.annotation.constraintId)}>Remove constraint</button>
      <button type="button" onClick={() => onSelect(null)}>Close</button>
    </div>}
    <div className="sketch-canvas-context" data-testid="sketch-canvas-context">
      <span>{sketch.solveState.status==="fully-constrained"?"Sketch fully constrained":`Sketch: ${sketch.solveState.degreesOfFreedom} degrees of freedom`}</span>
      <button type="button" aria-pressed={showAll} onClick={()=>setShowAll(value=>!value)}>{showAll?"Show related constraints":"Show all constraints"}</button>
      {!editor&&effectiveDiagnostic&&<span role="status">{effectiveDiagnostic.kind==="sketch-conflict"?"Conflicting constraints highlighted · select a dimension or relation":"Dependent geometry failed · sources highlighted"}</span>}
    </div>
  </div>;
}
