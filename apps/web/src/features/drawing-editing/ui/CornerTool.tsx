import { requestProjectFrame as requestAnimationFrame, cancelProjectFrame as cancelAnimationFrame } from "../../../app/projectActivity";
import { useEffect, useRef, useState } from "react";
import type { CadCommand } from "@agent-webcad/cad-commands";
import type { DrawingEditCanvas, CurveNextAction } from "../contracts";
import type { CornerPreviewRequest } from "../../../viewport/cornerPreview";
import { cadDocument } from "../../../state/cadDocument";
import { applyCadPlan, discardCadPlan, getCadPlanDrawingPaths, previewCadCommand, type CadPlanPreview } from "../../../state/documentPlans";
import { subscribeDocumentChanges } from "../../../state/documentSession";
import { commandInteraction } from "../../../state/commandInteraction";
import { CommandReview } from "../../../ui/CommandReview";
import { PrecisionField } from "../../../ui/PrecisionField";
import { parseLength } from "../../../precision/units";
import { drawingModelToWorld, drawingTransformAfterEdit, getWorldDrawingGeometry } from "../../../precision/worldGeometry";
import { editDrawingCornerForObject } from "../geometry/drawingOperations";
import type { DrawingTopology } from "../../../precision/drawingTopology";
import type { Vec3 } from "../../../precision/workPlane";

type Props = DrawingEditCanvas & { session: CornerPreviewRequest; nextActions?: CurveNextAction[] };
type Ghost = { points: Vec3[]; before: boolean; closed: boolean };
type Guide = { from: Vec3; to: Vec3; label: string };

/** A retained corner target and detached command plan share the normal review grammar. */
export function CornerTool(props: Props) {
  const { session } = props;
  const [first, setFirst] = useState(`${session.distance}mm`), [second, setSecond] = useState<string | null>(session.secondDistance === undefined ? null : `${session.secondDistance}mm`);
  const [revision, setRevision] = useState(0), [preview, setPreview] = useState<CadPlanPreview | null>(null), [reviewedKey, setReviewedKey] = useState<string>();
  const [error, setError] = useState(""), [pending, setPending] = useState(false), [completed, setCompleted] = useState(false);
  const [visual, setVisual] = useState<{ plan: string | null; paths: { before: boolean; points: string }[]; guides: { from: number[]; to: number[]; label: string }[] }>({ plan:null, paths:[], guides:[] });
  const plan = useRef<string | null>(null), ghosts = useRef<Ghost[]>([]), guides = useRef<Guide[]>([]), latest = useRef(props), busy = useRef(false), applyRef = useRef<() => void>(() => {});
  latest.current = props;
  const draftKey = JSON.stringify([session, first, second, revision]);
  const interaction = commandInteraction({ command:"Corner chamfer", draftKey, reviewedKey, preview, pending, targets:[session.objectId], numericParameters:{D1:first,D2:second ?? first},
    inputError:reviewedKey === draftKey ? error : undefined, completedIds:completed ? [session.objectId] : undefined,
    visualReady:visual.plan === preview?.planId && visual.paths.some(p => !p.before) });
  const inspect = (ids: string[]) => props.onFrame(ids.flatMap(id => {
    const paths = preview && getCadPlanDrawingPaths(preview.planId,id), object = cadDocument.objects[id], feature = Object.values(cadDocument.features).find(f => f.output === id);
    return paths?.after ?? paths?.before ?? (object && feature ? getWorldDrawingGeometry(object,feature)?.points : undefined) ?? [];
  }));
  useEffect(() => subscribeDocumentChanges(() => {
    if (plan.current) discardCadPlan(plan.current);
    plan.current = null; ghosts.current = []; guides.current = []; setPreview(null);
    if (!busy.current) setCompleted(false);
    setRevision(v => v + 1);
  }), []);
  useEffect(() => {
    const controller = new AbortController(); let localPlan: string | undefined;
    if (plan.current) discardCadPlan(plan.current);
    plan.current = null; ghosts.current = []; guides.current = []; setPreview(null); setError("");
    if (completed) return;
    let command: CadCommand;
    try {
      const d1 = parseLength(first), d2 = parseLength(second ?? first);
      if (d1 === null || d1 <= 0) throw new Error("D1 needs a positive distance with units, such as 5mm or 0.25in.");
      if (d2 === null || d2 <= 0) throw new Error("D2 needs a positive distance with units, such as 5mm or 0.25in.");
      command = { type:"edit-drawing-corner", objectId:session.objectId, controlId:session.controlId, treatment:"chamfer", distance:d1, secondDistance:d2, distanceSpace:"world" };
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setReviewedKey(draftKey); return; }
    const timer = setTimeout(() => { void previewCadCommand(command, { signal:controller.signal }).then(result => {
      localPlan = result.planId;
      if (controller.signal.aborted) { discardCadPlan(result.planId); return; }
      plan.current = result.planId; setPreview(result); setReviewedKey(draftKey);
      if (!result.result.ok || result.stale) return;
      ghosts.current = result.changes.flatMap<Ghost>(change => {
        const p = getCadPlanDrawingPaths(result.planId,change.objectId);
        return p ? [...(p.before ? [{points:p.before,before:true,closed:p.beforeClosed}] : []), ...(p.after ? [{points:p.after,before:false,closed:p.afterClosed}] : [])] : [];
      });
      const object = cadDocument.objects[session.objectId], feature = Object.values(cadDocument.features).find(f => f.output === session.objectId);
      if (!object || !feature || command.type !== "edit-drawing-corner") return;
      const params = editDrawingCornerForObject(object,feature,session.controlId,"chamfer",command.distance,command.secondDistance,"world");
      const index = (feature.params.topology as DrawingTopology).controls.find(c => c.id === session.controlId)!.index!;
      const corner = drawingModelToWorld(object,feature,(feature.params.points as Vec3[])[index])!;
      const resultObject = { ...object, transform:drawingTransformAfterEdit(object,feature,params) };
      guides.current = [0,1].map(i => ({ from:corner,to:drawingModelToWorld(resultObject,{...feature,params},(params.points as Vec3[])[index + i])!,label:`D${i+1} · ${i ? second ?? first : first}` }));
    }).catch(e => { if (!controller.signal.aborted) { ghosts.current = []; guides.current = []; setError(e instanceof Error ? e.message : String(e)); setReviewedKey(draftKey); } }); }, 100);
    return () => { clearTimeout(timer); controller.abort(); if (localPlan) discardCadPlan(localPlan); };
  }, [draftKey, completed]);
  useEffect(() => {
    let frame: number, previous = "";
    const draw = () => {
      const next = {plan:plan.current,paths:ghosts.current.map(g => ({before:g.before,points:(g.closed ? [...g.points,g.points[0]] : g.points).map(p => latest.current.project(p).join(",")).join(" ")})),guides:guides.current.map(g => ({from:latest.current.project(g.from),to:latest.current.project(g.to),label:g.label}))};
      const signature = JSON.stringify(next); if (signature !== previous) { previous = signature; setVisual(next); }
      frame = requestAnimationFrame(draw);
    }; draw(); return () => cancelAnimationFrame(frame);
  }, []);
  const close = () => { if (!busy.current) { props.onClose(); requestAnimationFrame(() => props.getCanvas()?.focus()); } };
  async function apply() {
    if (!interaction.canApply || !preview || busy.current) return;
    busy.current = true; setPending(true);
    try {
      const result = await applyCadPlan(preview.planId);
      if (!result.ok) { setError(result.reason ?? "Review the corner again."); setReviewedKey(draftKey); setPreview(null); return; }
      setCompleted(true); props.onApplied([session.objectId]);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setReviewedKey(draftKey); }
    finally { busy.current = false; setPending(false); }
  }
  applyRef.current = () => { void apply(); };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.target instanceof Element && event.target.closest("[data-cad-editor],input,textarea,select,dialog[open]")) return;
      if (event.key === "Enter") { event.preventDefault(); event.stopImmediatePropagation(); applyRef.current(); }
      if (event.key === "Escape" && !busy.current) { event.preventDefault(); event.stopImmediatePropagation(); latest.current.onClose(); }
    };
    window.addEventListener("keydown",key,true); return () => window.removeEventListener("keydown",key,true);
  }, []);
  return <>
    <svg className="cad-contour-ghosts cad-angular-preview" aria-label="Corner chamfer preview" data-corner-preview-count={visual.paths.filter(p => !p.before).length}>
      {visual.paths.map((p,i) => <polyline key={i} points={p.points} fill="none" stroke={p.before ? "#ffb282" : "#61dcac"} strokeWidth={p.before ? 3 : 2} strokeDasharray={p.before ? "5 5" : undefined} />)}
      {visual.guides.map((g,i) => <g key={i} data-corner-setback={`D${i+1}`}><line x1={g.from[0]} y1={g.from[1]} x2={g.to[0]} y2={g.to[1]} stroke={i ? "#82bcff" : "#ffc96f"} strokeWidth="3" /><circle cx={g.to[0]} cy={g.to[1]} r="4" fill={i ? "#82bcff" : "#ffc96f"}/><text x={(g.from[0]+g.to[0])/2+7} y={(g.from[1]+g.to[1])/2-7} fill={i ? "#82bcff" : "#ffc96f"} fontSize="12">{g.label}</text></g>)}
    </svg>
    <form className="cad-contour-tool cad-curve-workbench" data-cad-editor="true" aria-label="Corner chamfer editor" onSubmit={e => {e.preventDefault();void apply();}} onKeyDown={e => { e.stopPropagation(); if (e.key === "Escape") { e.preventDefault();close(); } }}>
      <strong>Chamfer internal corner</strong><div className="cad-tool-body">
      {!completed && <><PrecisionField label="D1 · previous edge" value={first} onChange={setFirst} min={0} minExclusive disabled={pending}/>
        <PrecisionField label="D2 · next edge" value={second ?? first} onChange={setSecond} min={0} minExclusive disabled={pending}/>
        <div><button type="button" disabled={pending} onClick={() => {setFirst(second ?? first);setSecond(first);}}>Swap corner distances</button><button type="button" disabled={pending} onClick={() => setSecond(null)}>Equal corner distances</button></div>
        <small>D1 follows the previous edge; D2 follows the next edge in contour order. Amber/blue guides show their assignment. Distances are world mm; cm and in are supported.</small></>}
      <CommandReview state={interaction} onInspect={inspect}/>
      {!completed && <small>Green: result and affected drawing paths · dashed amber: original. Dimensions and live solids update in the same transaction. One Undo restores all changes.</small>}
      {completed && <div aria-label="Continue corner design"><span>Edited contour selected.</span>{props.nextActions?.map(action => <button key={action.label} type="button" onClick={action.run}>{action.label}</button>)}</div>}
      </div><div className="cad-tool-footer"><button type="button" onClick={() => inspect([session.objectId])}>Fit corner preview</button><div>{!completed && <button type="submit" disabled={!interaction.canApply}>Apply corner chamfer</button>}<button type="button" disabled={pending} onClick={close}>{completed ? "Finish corner edit" : "Cancel corner edit"}</button></div></div>
    </form>
  </>;
}
