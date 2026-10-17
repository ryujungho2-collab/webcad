import { requestProjectFrame as requestAnimationFrame, cancelProjectFrame as cancelAnimationFrame } from "../app/projectActivity";
import { useEffect, useMemo, useRef, useState } from "react";
import { validAngularParams, type AngularDimensionBranch, type AngularDimensionDefinition, type AngularDimensionReference } from "@agent-webcad/cad-document";
import type { CadCommand } from "@agent-webcad/cad-commands";
import { cadDocument } from "../state/cadDocument";
import { subscribeDocumentChanges } from "../state/documentSession";
import { applyCadPlan, discardCadPlan, getCadPlanDimensionParams, previewCadCommand, type CadPlanPreview } from "../state/documentPlans";
import { commandInteraction } from "../state/commandInteraction";
import { CommandReview } from "../ui/CommandReview";
import { PrecisionField } from "../ui/PrecisionField";
import { parseLength } from "../precision/units";
import { getWorldDrawingGeometry } from "../precision/worldGeometry";
import { resolveAngularSources } from "../precision/angularDimensionSource";
import { resolveAngularDimension, type AngularDimensionGeometry } from "../precision/angularDimension";
import type { Vec3, WorkPlaneId } from "../precision/workPlane";

export type AngularDimensionSession = { id: string; layerId: string; workPlane: WorkPlaneId; selectedIds: string[]; editId?: string };
type Props = { session: AngularDimensionSession; project: (point: Vec3) => [number,number]; getCanvas: () => HTMLCanvasElement | null;
  onClose: () => void; onApplied: (id: string) => void; onEditSketch?: (id: string) => void; onInspectSource?: (id: string) => void };
const keyOf = (ref: AngularDimensionReference) => JSON.stringify([ref.objectId, ref.segmentId]);
function initialEdge(id: string, plane: WorkPlaneId): AngularDimensionReference | null {
  const object = cadDocument.objects[id], feature = Object.values(cadDocument.features).find(f=>f.output===id);
  const world = object && feature?.type === "drawing" ? getWorldDrawingGeometry(object,feature) : null;
  const straight = world?.planeAligned && world.workPlane === plane ? world.profileSegments?.filter(s=>s.kind === "line") : [];
  return straight?.length === 1 ? { objectId:id, segmentId:straight[0].topologyReference } : null;
}

/** An edge is selected by its saved topology ID; each draft is reviewed by the public command executor. */
export function AngularDimensionTool({ session, project, getCanvas, onClose, onApplied, onEditSketch, onInspectSource }: Props) {
  const initial = session.editId ? Object.values(cadDocument.features).find(f => f.output === session.editId)?.params : undefined;
  const source = initial?.kind === "angular" ? initial as AngularDimensionDefinition : null;
  const [firstKey, setFirstKey] = useState(source ? keyOf(source.first) : initialEdge(session.selectedIds[0],session.workPlane) ? keyOf(initialEdge(session.selectedIds[0],session.workPlane)!) : "");
  const [secondKey, setSecondKey] = useState(source ? keyOf(source.second) : initialEdge(session.selectedIds[1],session.workPlane) ? keyOf(initialEdge(session.selectedIds[1],session.workPlane)!) : "");
  const [firstRay, setFirstRay] = useState<1|-1>(source?.branch.firstRay ?? 1);
  const [secondRay, setSecondRay] = useState<1|-1>(source?.branch.secondRay ?? 1);
  const [sweep, setSweep] = useState<"ccw"|"cw">(source?.branch.sweep ?? "ccw");
  const [radius, setRadius] = useState(source ? `${source.radius}mm` : "15mm");
  const [label, setLabel] = useState(source?.text ?? "");
  const [pick, setPick] = useState<"first"|"second"|null>(null);
  const [revision, setRevision] = useState(cadDocument.revision);
  const [preview, setPreview] = useState<CadPlanPreview|null>(null);
  const [reviewedKey, setReviewedKey] = useState<string>();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<string|null>(null);
  const [projected, setProjected] = useState<string[]>([]);
  const [extraSegments, setExtraSegments] = useState<string[]>([]);
  const plan = useRef<string|null>(null);
  const radiusDrag = useRef<{ pointerId:number; center:[number,number]; screenRadius:number; modelRadius:number }|null>(null);
  const latest = useRef({ project, onClose }); latest.current = { project, onClose };

  const edges = useMemo(() => Object.values(cadDocument.features).flatMap(f => {
    const object = cadDocument.objects[f.output], layer = object && cadDocument.layers[object.layerId];
    if (f.type !== "drawing" || !object?.visible || !layer?.visible) return [];
    const world = getWorldDrawingGeometry(object, f);
    if (!world?.planeAligned || world.workPlane !== session.workPlane) return [];
    return (world.profileSegments ?? []).filter(edge => edge.kind === "line").map((edge, index) => ({
      ref: { objectId: object.id, segmentId: edge.topologyReference },
      start: edge.start, end: edge.end, label: `${object.name} · edge ${index+1}${layer.locked ? " · locked" : ""}`,
      locked: layer.locked,
    }));
  }), [revision, session.workPlane]);
  const reference = (key: string) => edges.find(edge => keyOf(edge.ref) === key)?.ref;
  const first = reference(firstKey), second = reference(secondKey);
  const length = parseLength(radius);
  const branch: AngularDimensionBranch = { firstRay, secondRay, sweep };
  const definition: AngularDimensionDefinition | null = first && second && length !== null ? { first, second, branch, radius: length, text: label || null } : null;
  const draftKey = JSON.stringify([session.editId, firstKey, secondKey, firstRay, secondRay, sweep, radius, label, revision]);
  const checked = useMemo(() => {
    if (!definition) return { resolved:null as ReturnType<typeof resolveAngularSources>|null, error:length===null||length<=0 ? "Enter a positive radius with a unit, such as 15mm or 0.5in." : "" };
    try { return { resolved:resolveAngularSources(cadDocument,definition,true), error:"" }; }
    catch (e) { return { resolved:null, error:e instanceof Error?e.message:String(e) }; }
  }, [draftKey]);
  const resolved = checked.resolved, inputError = checked.error;
  const geometryResult = resolved ? resolveAngularDimension(resolved.lines[0], resolved.lines[1], branch, { radius: resolved.radius, text: label }) : null;
  const geometry: AngularDimensionGeometry | null = geometryResult?.ok ? geometryResult.geometry : null;
  const command: CadCommand | null = definition ? session.editId
    ? { type: "update-dimension", objectId: session.editId, params: {first,second,branch,radius:length,text:label||null} }
    : { type: "create-dimension", id: session.id, dimension: "angular", layerId: session.layerId, params: definition } : null;
  const interaction = commandInteraction({ command: session.editId ? "Edit Angular Dimension" : "Angular Dimension", draftKey, reviewedKey, preview,
    targets: [first?.objectId, second?.objectId].filter((id): id is string => !!id),
    missing: !first ? ["Choose the first straight edge."] : !second ? ["Choose the second straight edge."] : [],
    numericParameters: { radius }, inputError: inputError || error || undefined, pending, selecting: pick !== null, completedIds: outcome ? [outcome] : undefined,
    references: [first && { name: "First edge", kind: "straight edge", status: "preserved" as const, objectId: first.objectId }, second && { name: "Second edge", kind: "straight edge", status: "preserved" as const, objectId: second.objectId }].filter((r): r is NonNullable<typeof r> => !!r) });

  useEffect(() => subscribeDocumentChanges(() => { if (plan.current) discardCadPlan(plan.current); plan.current = null; setPreview(null); setRevision(v=>v+1); }), []);
  useEffect(() => {
    let cancelled = false, id: string | undefined;
    if (plan.current) discardCadPlan(plan.current); plan.current = null; setPreview(null); setError("");
    if (!command || !resolved || outcome) return;
    const timer = setTimeout(() => void previewCadCommand(command).then(result => {
      id = result.planId;
      if (cancelled) { discardCadPlan(result.planId); return; }
      plan.current = result.planId; setPreview(result); setReviewedKey(draftKey);
    }).catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); }), 100);
    return () => { cancelled = true; clearTimeout(timer); if (id) discardCadPlan(id); };
  }, [draftKey, outcome]);
  useEffect(() => {
    let frame: number, old = "";
    const draw = () => {
      const params = preview?.result.ok && reviewedKey === draftKey ? getCadPlanDimensionParams(preview.planId, session.editId ?? session.id)?.after : undefined;
      const checked = validAngularParams(params) ? resolveAngularDimension(params.lines[0],params.lines[1],params.branch,{radius:params.radius,text:params.text ?? undefined}) : null;
      const g = checked?.ok ? checked.geometry : geometry;
      const paths = g ? [g.measurement.vertex, ...g.arcPoints, g.textPosition].map(p => latest.current.project(p).map(n=>n.toFixed(1)).join(",")) : [];
      const extra = g ? g.segments.slice(g.arcPoints.length-1).map(([a,b])=>[a,b].map(p=>latest.current.project(p).map(n=>n.toFixed(1)).join(",")).join(" ")) : [];
      const signature = JSON.stringify([paths,extra]); if (signature !== old) { old = signature; setProjected(paths); setExtraSegments(extra); }
      frame = requestAnimationFrame(draw);
    }; draw(); return () => cancelAnimationFrame(frame);
  }, [draftKey, preview?.planId, reviewedKey]);
  useEffect(() => {
    const canvas = getCanvas(); if (!canvas || !pick) return;
    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const bounds = canvas.getBoundingClientRect(), x = event.clientX-bounds.left, y = event.clientY-bounds.top;
      const hits = edges.flatMap(edge => {
        const a=latest.current.project(edge.start), b=latest.current.project(edge.end), dx=b[0]-a[0],dy=b[1]-a[1];
        const t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));
        const gap=Math.hypot(a[0]+t*dx-x,a[1]+t*dy-y);
        return gap<=12 ? [{edge,gap}] : [];
      }).sort((a,b)=>a.gap-b.gap);
      if (!hits.length) { setError("Pick a visible straight edge within 12 pixels, or choose it from the list."); return; }
      if (hits.length>1 && Math.abs(hits[1].gap-hits[0].gap)<2) { setError("Several edges overlap here. Choose the exact edge from the list."); return; }
      if (hits[0].edge.locked) { setError("Unlock the source layer before measuring this edge."); return; }
      (pick === "first" ? setFirstKey : setSecondKey)(keyOf(hits[0].edge.ref));
      setPick(pick === "first" && !secondKey ? "second" : null); setError(""); canvas.focus();
    };
    canvas.addEventListener("pointerdown", down, true); return () => canvas.removeEventListener("pointerdown", down, true);
  }, [pick, edges, secondKey, getCanvas]);
  const close = () => { if (!pending) { onClose(); requestAnimationFrame(()=>getCanvas()?.focus()); } };
  async function apply() {
    if (!interaction.canApply || !preview) return;
    setPending(true);
    try { const result = await applyCadPlan(preview.planId);
      if (!result.ok) { setError(result.reason ?? "Review the edges and try again."); return; }
      const id = session.editId ?? result.createdIds[0] ?? session.id; setOutcome(id); onApplied(id);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setPending(false); }
  }
  const pickEdge = (slot: "first"|"second") => <label>{slot === "first" ? "First edge" : "Second edge"}<select aria-label={`Angular ${slot} edge`} value={slot === "first" ? firstKey : secondKey} disabled={pending || !!outcome} onChange={e=>{(slot === "first" ? setFirstKey : setSecondKey)(e.target.value);setError("");}}><option value="">Choose straight edge</option>{edges.map(edge=><option key={keyOf(edge.ref)} value={keyOf(edge.ref)}>{edge.label}</option>)}</select><button type="button" aria-label={`Pick angular ${slot} edge on canvas`} disabled={pending || !!outcome} onClick={()=>setPick(slot)}>Pick</button></label>;
  const sourceSketch = [first,second].map(ref=>ref&&Object.values(cadDocument.features).find(f=>f.output===ref.objectId)?.params.sketchId).find(Boolean);
  const centerScreen = projected[0]?.split(",").map(Number) as [number,number]|undefined;
  const arcStartScreen = projected[1]?.split(",").map(Number) as [number,number]|undefined;
  const handleScreen = projected.length>3 ? projected[Math.floor((projected.length-2)/2)+1].split(",").map(Number) as [number,number] : undefined;
  const startRadiusDrag = (e: React.PointerEvent<SVGCircleElement>) => {
    if (!centerScreen || !arcStartScreen || !length || outcome) return;
    e.preventDefault(); e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId);
    radiusDrag.current={pointerId:e.pointerId,center:centerScreen,screenRadius:Math.hypot(arcStartScreen[0]-centerScreen[0],arcStartScreen[1]-centerScreen[1]),modelRadius:length};
  };
  const moveRadiusDrag = (e: React.PointerEvent<SVGCircleElement>) => {
    const drag=radiusDrag.current;if (!drag || drag.pointerId!==e.pointerId || drag.screenRadius<=0) return;
    e.preventDefault();e.stopPropagation();
    const bounds=e.currentTarget.ownerSVGElement?.getBoundingClientRect();if(!bounds)return;
    const screen=Math.hypot(e.clientX-bounds.left-drag.center[0],e.clientY-bounds.top-drag.center[1]);
    setRadius(`${Math.max(.001,drag.modelRadius*screen/drag.screenRadius).toFixed(3)}mm`);
  };
  return <>
    <svg className="cad-contour-ghosts cad-angular-preview" data-angular-preview="true" aria-hidden="true">
      {[firstKey,secondKey].map((key,i)=>{const e=edges.find(edge=>keyOf(edge.ref)===key);if(!e)return null;const a=project(e.start),b=project(e.end);return <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={i===0?"#67adfa":"#f0b677"} strokeWidth="4" strokeDasharray="8 5"/>;})}
      {projected.length>2 && <><polyline points={projected.slice(1,-1).join(" ")} fill="none" stroke="#70dfb2" strokeWidth="3"/>{extraSegments.map((points,i)=><polyline key={i} points={points} fill="none" stroke="#70dfb2" strokeWidth="2"/>)}<circle cx={projected[0].split(",")[0]} cy={projected[0].split(",")[1]} r="4" fill="#70dfb2"/><text x={projected.at(-1)!.split(",")[0]} y={projected.at(-1)!.split(",")[1]} fill="#d5f6e7" stroke="none" fontSize="14">{geometry?.text}</text></>}
      {handleScreen && !outcome && <circle data-angular-radius-handle="true" aria-label="Drag angular radius" cx={handleScreen[0]} cy={handleScreen[1]} r="8" fill="#172022" stroke="#70dfb2" strokeWidth="3" onPointerDown={startRadiusDrag} onPointerMove={moveRadiusDrag} onPointerUp={e=>{if(radiusDrag.current?.pointerId===e.pointerId)radiusDrag.current=null;}} onLostPointerCapture={()=>{radiusDrag.current=null;}}/>}
    </svg>
    <form className="cad-contour-tool cad-angular-tool" data-cad-editor="true" aria-label="Angular dimension" onSubmit={e=>{e.preventDefault();void apply();}} onKeyDown={e=>{e.stopPropagation();if(e.key==="Escape"){e.preventDefault();pick?setPick(null):close();}}}>
      <div className="cad-tool-body"><strong>{session.editId ? "Edit Angular Dimension" : "Angular Dimension"}</strong><small>Select two straight edges. The supporting lines may meet beyond their ends.</small>
        {pickEdge("first")}{pickEdge("second")}
        <label>First ray<select aria-label="Angular first ray" value={firstRay} disabled={pending||!!outcome} onChange={e=>setFirstRay(Number(e.target.value) as 1|-1)}><option value="1">Along edge</option><option value="-1">Opposite edge</option></select></label>
        <label>Second ray<select aria-label="Angular second ray" value={secondRay} disabled={pending||!!outcome} onChange={e=>setSecondRay(Number(e.target.value) as 1|-1)}><option value="1">Along edge</option><option value="-1">Opposite edge</option></select></label>
        <label>Measure toward<select aria-label="Angular sweep" value={sweep} disabled={pending||!!outcome} onChange={e=>setSweep(e.target.value as "cw"|"ccw")}><option value="ccw">Counterclockwise</option><option value="cw">Clockwise</option></select></label>
        <PrecisionField label="Arc radius" aria-label="Angular arc radius" kind="length" min={0} minExclusive value={radius} onChange={setRadius} disabled={pending||!!outcome}/>
        <label>Text override<input aria-label="Angular text override" value={label} placeholder="Automatic degrees" disabled={pending||!!outcome} onChange={e=>setLabel(e.target.value)}/></label>
        {geometry && <p role="status">{geometry.text} · {geometry.measurement.extensions.first||geometry.measurement.extensions.second?"Supporting-line extension · ":""}{sweep === "ccw" ? "counterclockwise" : "clockwise"} from the first ray</p>}
        <CommandReview state={interaction}/>
        {outcome && <div className="cad-workflow-actions" aria-label="Angular dimension next actions"><button type="button" onClick={()=>onInspectSource?.(first!.objectId)}>Inspect first source</button><button type="button" onClick={()=>onInspectSource?.(second!.objectId)}>Inspect second source</button>{!!sourceSketch && <button type="button" onClick={()=>onEditSketch?.(String(sourceSketch))}>Edit Sketch</button>}</div>}
      </div><div className="cad-tool-footer"><button type="submit" disabled={!interaction.canApply}>Apply angular dimension</button><button type="button" disabled={pending} onClick={close}>{outcome?"Finish":"Cancel"} angular dimension</button></div>
    </form>
  </>;
}
