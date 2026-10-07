import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { CadCommand, ContourBridge, ContourReferenceRoute } from "@agent-webcad/cad-commands";
import { cadDocument } from "../../../state/cadDocument";
import { previewCadCommand, applyCadPlan, discardCadPlan, getCadPlanDrawingPaths, getCadPlanDimensionParams, type CadPlanPreview } from "../../../state/documentPlans";
import { subscribeDocumentChanges } from "../../../state/documentSession";
import { exactDrawingContour, locateOnContour, segmentPoint, type ExactContour } from "../geometry/contourEditing";
import { trimContour } from "../geometry/trimContour";
import { joinContoursWithBridges } from "../geometry/contourBridges";
import { contourReferenceRequirements } from "../commands/contourReferences";
import { parseLength } from "../../../precision/units";
import { getWorldDrawingGeometry } from "../../../precision/worldGeometry";
import { resolveDimension } from "../../../precision/dimensionGeometry";
import { WORK_PLANES, intersectRayWithWorkPlane, type Vec3 } from "../../../precision/workPlane";
import type { CurveWorkbenchProps } from "../contracts";
import { commandInteraction } from "../../../state/commandInteraction";
import { CommandReview } from "../../../ui/CommandReview";
import { PrecisionField } from "../../../ui/PrecisionField";
import { needsPortion, referencePortions, referenceRoute, referenceKey, type ReferenceChoice } from "./contourReferenceChoices";

type Mode = "offset" | "trim" | "extend" | "fillet" | "chamfer" | "join";
type Ghost = { points: Vec3[]; before: boolean; closed: boolean; accent?: "removed" | "reference" };
const pathGhost = (p: ExactContour, accent?: Ghost["accent"]): Ghost => ({ before: false, closed: p.closed, accent, points: p.segments.flatMap(s => Array.from({ length: s.kind === "arc" ? 33 : 2 }, (_, i) => segmentPoint(s, i / (s.kind === "arc" ? 32 : 1), p.workPlane))) });
const labels: Record<Mode, string> = { offset: "Offset", trim: "Trim", extend: "Extend", fillet: "Fillet", chamfer: "Chamfer", join: "Join" };

/** A session owns selection, exact picks and reviewed plans across operations.
 * Every action still uses the public command API; no UI-specific geometry. */
export function CurveWorkbench(props: CurveWorkbenchProps) {
  const [mode, setMode] = useState<Mode>("offset"), [firstId, setFirstId] = useState(props.session.objectIds[0] ?? ""), [secondId, setSecondId] = useState(props.session.objectIds[1] ?? "");
  const [value, setValue] = useState("10mm"), [side, setSide] = useState<"left" | "right">("left"), [points, setPoints] = useState<(Vec3 | null)[]>([null, null]);
  const [pick, setPick] = useState<0 | 1 | null>(null), [revision, setRevision] = useState(cadDocument.revision), [preview, setPreview] = useState<CadPlanPreview | null>(null), [message, setMessage] = useState("Choose a curve and an operation."), [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<{ mode: Mode; ids: string[] } | null>(null), [joinIds, setJoinIds] = useState<string[]>(props.session.objectIds);
  const [trimScope, setTrimScope] = useState<"ends" | "interval">("ends"), [rejoin, setRejoin] = useState(false), [bridges, setBridges] = useState<ContourBridge[]>([]), [choices, setChoices] = useState<Record<string, ReferenceChoice>>({});
  const [resultBridges, setResultBridges] = useState<ContourBridge[]>([]);
  const [paths, setPaths] = useState<{ before: boolean; points: string; closed: boolean; accent?: Ghost["accent"] }[]>([]), [marks, setMarks] = useState<[number, number][]>([]);
  const [projectedPlan, setProjectedPlan] = useState<string | null>(null);
  const [reviewedKey, setReviewedKey] = useState<string>(), [inputError, setInputError] = useState("");
  const plan = useRef<string | null>(null), ghosts = useRef<Ghost[]>([]), busy = useRef(false), latest = useRef(props), applyRef = useRef<() => void>(() => {});
  latest.current = props;
  const candidates = useMemo(() => Object.values(cadDocument.features).filter(f => {
    const o = cadDocument.objects[f.output], l = o && cadDocument.layers[o.layerId];
    return f.type === "drawing" && ["line", "arc", "circle", "polyline", "rectangle"].includes(String(f.params.kind)) && !f.pattern && !f.construction && (props.constructionVisible || !f.params.construction) && o?.visible && l?.visible && !l.locked;
  }).map(f => ({ object: cadDocument.objects[f.output], feature: f })), [revision, props.constructionVisible]);
  const entry = (id: string) => { if (!id) throw new Error("Choose a target and, when needed, a second curve or boundary."); const s = candidates.find(s => s.object.id === id); if (!s) throw new Error("Show and unlock a drawing or finished sketch curve. Pattern instances and derived constructions are edited through their sources."); return s; };
  const sourceGhosts = useMemo(() => (mode === "join" ? joinIds : mode === "offset" ? [firstId] : [firstId, secondId]).flatMap<Ghost>(id => {
    const s = candidates.find(s => s.object.id === id), world = s && getWorldDrawingGeometry(s.object, s.feature);
    return world?.points?.length ? [{ points: world.points, closed: world.closed || world.kind === "circle", before: true }] : [];
  }), [candidates, firstId, secondId, mode, joinIds]);
  const sourceGhostsRef = useRef(sourceGhosts); sourceGhostsRef.current = sourceGhosts;
  const targetFeature = candidates.find(s => s.object.id === firstId)?.feature;
  const owned = Boolean(mode === "join" ? candidates.find(s => s.object.id === joinIds[0])?.feature.params.sketchId : targetFeature?.params.sketchId);
  const closedSource = targetFeature?.params.kind === "circle" || targetFeature?.params.kind === "rectangle" || targetFeature?.params.closed === true;
  const replacing = mode === "join" || mode === "trim" && trimScope === "interval";
  const references = useMemo(() => replacing ? contourReferenceRequirements(cadDocument, mode === "join" ? joinIds : [firstId]) : [], [replacing, mode, joinIds, firstId, revision]);
  const draft = useMemo(() => {
    if (!replacing || outcome) return;
    try {
      if (mode === "join") return { pieces: [joinContoursWithBridges(joinIds.map(id => { const s = entry(id); return { id, path: exactDrawingContour(s.object, s.feature) }; }), bridges)], removed: undefined };
      if (!points[0]) return;
      const a = entry(firstId), b = entry(secondId);
      return trimContour(exactDrawingContour(a.object, a.feature), [exactDrawingContour(b.object, b.feature)], points[0], rejoin);
    } catch { return; }
  }, [replacing, mode, firstId, secondId, points, rejoin, bridges, joinIds, candidates, outcome]);
  const accents = draft ? [...(draft.removed ? [pathGhost({ ...draft.removed, closed: rejoin }, "removed")] : []), ...references.flatMap<Ghost>(r => {
    const c = choices[referenceKey(r)], p = c && c.result !== "" && draft.pieces[Number(c.result)], portion = p && referencePortions(r,p,owned).find(o=>o.value===c.edge);
    return portion ? [{ before:false,closed:false,accent:"reference",points:portion.points }] : [];
  })] : [];
  const accentsRef = useRef(accents); accentsRef.current = accents;
  const draftGhostsRef = useRef<Ghost[]>([]); draftGhostsRef.current = draft ? [...sourceGhosts, ...draft.pieces.map(p => pathGhost(p))] : [];
  const choose = (index: 0 | 1, id: string) => { (index === 0 ? setFirstId : setSecondId)(id); setChoices({}); setPoints(p => p.map((v, i) => i === index ? null : v)); setOutcome(null); };
  useEffect(() => {
    if (mode === "trim") setTrimScope(closedSource || owned ? "interval" : "ends");
    setChoices({}); setRejoin(false);
  }, [mode, firstId]);
  const picked = (id: string, index: number) => {
    if (points[index]) return points[index]!;
    const s = entry(id), path = exactDrawingContour(s.object, s.feature);
    // A default branch away from a corner; explicit canvas picks override it.
    return segmentPoint(path.segments[0], .35, path.workPlane);
  };
  const close = () => { if (!busy.current) { latest.current.onClose(); requestAnimationFrame(() => latest.current.getCanvas()?.focus()); } };
  const draftKey = JSON.stringify([mode,firstId,secondId,value,side,points,revision,outcome,joinIds,trimScope,rejoin,bridges,choices]);
  const interaction = commandInteraction({ command: labels[mode], draftKey, reviewedKey, preview, pending,
    targets: mode === "join" ? joinIds : [firstId,...(mode === "offset" ? [] : [secondId])].filter(Boolean), numericParameters:{distance:value},
    missing: mode === "join" ? joinIds.length < 2 && !bridges.length ? ["Choose two or more curves to Join."] : [] : !firstId ? ["Choose a target curve."] : mode !== "offset" && !secondId ? ["Choose a boundary or second curve."] : [],
    selecting:pick !== null, inputError:reviewedKey === draftKey ? inputError : undefined,
    visualReady: projectedPlan === preview?.planId && paths.some(p=>!p.before), completedIds:outcome?.ids,
    references:references.map(r=>({name:r.name,kind:r.kind,objectId:r.sourceId,status:choices[referenceKey(r)]?.result && (!needsPortion(r)||choices[referenceKey(r)].edge) ? "remapped" : "unresolved"})) });
  useEffect(() => subscribeDocumentChanges(() => {
    if (plan.current) discardCadPlan(plan.current); plan.current = null; setPreview(null);
    if (!busy.current) { ghosts.current = []; setOutcome(null); setMessage("Document changed; reviewing the current targets again."); }
    setRevision(v => v + 1);
  }), []);
  useEffect(() => {
    const controller = new AbortController(); let localPlan: string | undefined;
    if (plan.current) discardCadPlan(plan.current); plan.current = null; setPreview(null);
    if (outcome) return;
    setInputError("");
    ghosts.current = [];
    let command: CadCommand;
    try {
      const referenceRoutes: ContourReferenceRoute[] = references.map(r => {
        if (r.kind === "unsupported") throw new Error(`${r.name}: detach or edit this relationship before replacing the contour.`);
        return referenceRoute(r,choices[referenceKey(r)]);
      });
      const distance = parseLength(value);
      if (["offset", "fillet", "chamfer"].includes(mode) && (distance === null || distance <= 0)) throw new Error("Enter a positive distance with units, such as 5mm or 0.25in.");
      if (mode === "join") { if (joinIds.length < 2 && !bridges.length) throw new Error("Select a connected chain, or reconnect the gap of a Trim result."); joinIds.forEach(entry); command = { type: "join-drawings", objectIds: joinIds, bridges, referenceRoutes }; }
      else {
        entry(firstId);
        if (mode === "offset") command = { type: "offset-drawing", objectId: firstId, distance: distance!, side };
        else {
          entry(secondId); if (firstId === secondId) throw new Error("Choose two different curves.");
          if (mode === "trim" || mode === "extend") {
            if (!points[0]) throw new Error(mode === "trim" ? trimScope === "interval" ? "Pick the interval to remove between bounded boundary crossings." : "Pick the exposed target portion to remove. A circle keeps the picked portion." : "Pick the target end to extend towards the boundary.");
            command = mode === "trim" && trimScope === "interval" ? { type: "trim-contour", objectId: firstId, cutterIds: [secondId], pickPoint: points[0], rejoin, referenceRoutes } : { type: mode === "trim" ? "trim-drawing" : "extend-drawing", targetId: firstId, cutterId: secondId, pickPoint: points[0] };
          } else command = { type: "connect-drawings", firstId, secondId, firstPoint: picked(firstId, 0), secondPoint: picked(secondId, 1), treatment: mode, distance: distance! };
        }
      }
    } catch (e) { const error=e instanceof Error ? e.message : String(e); setMessage(error); setInputError(error); setReviewedKey(draftKey); return; }
    setMessage("Preparing exact preview…");
    const timer = setTimeout(() => { void previewCadCommand(command, { signal: controller.signal }).then(result => {
      localPlan = result.planId; if (controller.signal.aborted) { discardCadPlan(result.planId); return; }
      plan.current = result.planId; setPreview(result); setReviewedKey(draftKey);
      setMessage(!result.result.ok ? result.result.reason ?? "Edit rejected." : result.stale ? "The document changed; review again." : `${result.changes.filter(c => c.kind === "modified").length} updated · ${result.changes.filter(c => c.kind === "created").length} created · one Undo`);
      ghosts.current = result.result.ok && !result.stale ? result.changes.flatMap<Ghost>(change => {
        const p = getCadPlanDrawingPaths(result.planId, change.objectId); if (!p) return [];
        return [...(p.before ? [{ points: p.before, closed: p.beforeClosed, before: true }] : []), ...(p.after ? [{ points: p.after, closed: p.afterClosed, before: false }] : [])];
      }) : [];
    }).catch(e => { if (!controller.signal.aborted) setMessage(e instanceof Error ? e.message : String(e)); }); }, 100);
    return () => { clearTimeout(timer); controller.abort(); if (localPlan) discardCadPlan(localPlan); };
  }, [mode, firstId, secondId, value, side, points, revision, outcome, joinIds, trimScope, rejoin, bridges, choices, references, draft]);
  useEffect(() => {
    let frame: number, previous = "";
    const draw = () => {
      const p = [...(ghosts.current.length ? ghosts.current : draftGhostsRef.current.length ? draftGhostsRef.current : sourceGhostsRef.current), ...accentsRef.current].map(g => ({ before: g.before, closed: g.closed, accent: g.accent, points: (g.closed ? [...g.points, g.points[0]] : g.points).map(p => latest.current.project(p).join(",")).join(" ") })), m = points.filter((p): p is Vec3 => !!p).map(p => latest.current.project(p));
      const signature = JSON.stringify([p, m, plan.current]); if (signature !== previous) { previous = signature; setPaths(p); setMarks(m); setProjectedPlan(plan.current); }
      frame = requestAnimationFrame(draw);
    }; draw(); return () => cancelAnimationFrame(frame);
  }, [points]);
  async function apply() {
    if (!interaction.canApply || !preview || busy.current) return;
    busy.current = true; setPending(true); setPick(null);
    try {
      const result = await applyCadPlan(preview.planId);
      if (!result.ok) { setMessage(result.reason ?? "Edit rejected."); setRevision(v => v + 1); return; }
      const ids = mode === "fillet" || mode === "chamfer" ? [firstId, secondId, ...result.createdIds] : result.createdIds.length ? result.createdIds : [firstId];
      setResultBridges(mode === "trim" && trimScope === "interval" && !rejoin && (closedSource || ids.length === 2) ? [{ fromId: ids[0], fromEnd: "end", toId: ids.at(-1)!, toEnd: "start" }] : []);
      setOutcome({ mode, ids }); setJoinIds(ids); setPreview(null); setMessage(`${labels[mode]} applied. Choose the next operation on the result, or another target.`);
      latest.current.onApplied(ids);
    } catch (e) { setMessage(e instanceof Error ? e.message : String(e)); }
    finally { busy.current = false; setPending(false); }
  }
  applyRef.current = () => { void apply(); };
  useEffect(() => {
    const canvas = props.getCanvas(); if (!canvas) return;
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 || pick === null || busy.current) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const camera = latest.current.getCamera(); if (!camera) return;
      const rect = canvas.getBoundingClientRect(), cursor = [event.clientX - rect.left, event.clientY - rect.top], ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(cursor[0] / rect.width * 2 - 1, -cursor[1] / rect.height * 2 + 1), camera);
      const hits = candidates.flatMap(s => { try {
        const path = exactDrawingContour(s.object, s.feature), plane = WORK_PLANES[path.workPlane], h = path.segments[0].start.reduce((sum, v, i) => sum + v * plane.normal[i], 0);
        const raw = intersectRayWithWorkPlane(ray.ray.origin.toArray() as Vec3, ray.ray.direction.toArray() as Vec3, { ...plane, origin: plane.normal.map(v => v * h) as Vec3 }); if (!raw) return [];
        const hit = locateOnContour(path, raw), screen = latest.current.project(hit.point), gap = Math.hypot(screen[0] - cursor[0], screen[1] - cursor[1]);
        return gap <= 12 ? [{ id: s.object.id, point: hit.point, gap }] : [];
      } catch { return []; } }).sort((a, b) => a.gap - b.gap || (a.id === (pick === 0 ? firstId : secondId) ? -1 : 1));
      if (!hits.length) { setMessage("Pick a visible curve within 12 pixels; pan or zoom to reach the desired branch."); return; }
      const hit = hits[0]; (pick === 0 ? setFirstId : setSecondId)(hit.id); setChoices({}); setPoints(p => p.map((v, i) => i === pick ? hit.point : v)); setPick(null); setOutcome(null); canvas.focus();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest("input,select,textarea,button,[role=dialog]")) return;
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); if (pick !== null) setPick(null); else close(); }
      if (e.key === "Enter") { e.preventDefault(); e.stopImmediatePropagation(); applyRef.current(); }
    };
    canvas.addEventListener("pointerdown", onDown, true); window.addEventListener("keydown", onKey, true);
    return () => { canvas.removeEventListener("pointerdown", onDown, true); window.removeEventListener("keydown", onKey, true); };
  }, [candidates, firstId, secondId, pick]);
  const next = (nextMode: Mode, reconnect = false) => { if (outcome) { setFirstId(outcome.ids[0]); setPoints([null, null]); } setBridges(reconnect ? resultBridges : []); setChoices({}); setMode(nextMode); setOutcome(null); setPick(null); };
  const targetSelect = (index: 0 | 1) => <label>{index === 0 ? "Target" : mode === "trim" || mode === "extend" ? "Boundary" : "Second curve"}<select aria-label={index === 0 ? "Workflow target" : "Workflow second curve"} value={index === 0 ? firstId : secondId} disabled={pending} onChange={e => choose(index, e.target.value)}><option value="">Choose a curve</option>{candidates.map((s, ordinal) => <option key={s.object.id} value={s.object.id}>{s.object.name} ({ordinal + 1})</option>)}</select></label>;
  return <>
    <svg className="cad-contour-ghosts" aria-hidden="true" data-curve-workflow-preview="true">{paths.map((p, i) => p.points && !p.points.includes(" ") ? <circle key={i} cx={p.points.split(",")[0]} cy={p.points.split(",")[1]} r={6} fill="none" stroke={p.accent === "reference" ? "#6cb9ff" : p.before ? "#e7b369" : "#70dfb2"} strokeWidth={3}/> : <polyline key={i} points={p.points} fill={p.accent === "removed" && p.closed ? "#ff787825" : "none"} stroke={p.accent === "removed" ? "#ff7878" : p.accent === "reference" ? "#6cb9ff" : p.before ? "#e7b369" : "#70dfb2"} strokeWidth={p.accent ? 4 : p.before ? 2 : 3} strokeDasharray={p.before ? "7 5" : undefined} />)}{marks.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={5} fill="#70dfb2" stroke="#172533" />)}</svg>
    <form className="cad-contour-tool cad-curve-workbench" data-cad-editor="true" aria-label="Curve workflow" onSubmit={e => { e.preventDefault(); void apply(); }} onKeyDown={e => { e.stopPropagation(); if (e.key === "Escape") { e.preventDefault(); close(); } }}>
      <div className="cad-tool-body">
      <strong>Curve workflow</strong><small>Choose → review on canvas → apply → continue on the result.</small>
      <div className="cad-workflow-actions">{(Object.keys(labels) as Mode[]).map(m => <button type="button" key={m} aria-pressed={mode === m} disabled={pending} onClick={() => next(m)}>{labels[m]}</button>)}</div>
      {!outcome && <>
        {mode === "join" ? <><small>Join {joinIds.length} result curves into one exact editable contour.</small><select multiple aria-label="Workflow Join curves" value={joinIds} disabled={pending} onChange={e=>{setJoinIds(Array.from(e.target.selectedOptions,o=>o.value));setChoices({});setBridges([]);}}>{candidates.map(s=><option key={s.object.id} value={s.object.id}>{s.object.name}</option>)}</select></> : targetSelect(0)}
        {!["offset", "join"].includes(mode) && targetSelect(1)}
        {mode === "trim" && <><label>Trim scope<select aria-label="Workflow trim scope" value={trimScope} disabled={pending} onChange={e => { setTrimScope(e.target.value as "ends" | "interval"); setChoices({}); }}><option value="ends">Free ends / supporting boundary</option><option value="interval">Picked interval / bounded boundary</option></select></label>{trimScope === "interval" && closedSource && <label><input type="checkbox" aria-label="Reconnect trimmed ends" checked={rejoin} disabled={pending} onChange={e => { setRejoin(e.target.checked); setChoices({}); }} />Reconnect a closed source with a straight edge in this edit</label>}</>}
        {["offset", "fillet", "chamfer"].includes(mode) && <PrecisionField label={mode === "fillet" ? "Radius" : "Distance"} aria-label="Workflow distance" value={value} disabled={pending} min={0.000001} onChange={setValue} />}
        {mode === "offset" && <label>Side<select aria-label="Workflow offset side" value={side} disabled={pending} onChange={e => setSide(e.target.value as "left" | "right")}><option value="left">Left / circle outward</option><option value="right">Right / circle inward</option></select></label>}
        {["trim", "extend", "fillet", "chamfer"].includes(mode) && <div><button type="button" aria-pressed={pick === 0} disabled={pending} onClick={() => { setPick(0); props.getCanvas()?.focus(); }}>Pick target branch</button>{["fillet", "chamfer"].includes(mode) && <button type="button" aria-pressed={pick === 1} disabled={pending} onClick={() => { setPick(1); props.getCanvas()?.focus(); }}>Pick second branch</button>}</div>}
      </>}
      {!outcome && references.length > 0 && <fieldset aria-label="Reconnect contour references" disabled={pending}><legend>Reconnect references</legend>{references.map(r => {
        const slotLabel = "referenceSlot" in r && r.referenceSlot ? ` ${r.referenceSlot}` : ""; const key = referenceKey(r), c = choices[key] ?? { result: "", edge: "" }, p = c.result === "" ? undefined : draft?.pieces[Number(c.result)];
        const change = (patch: Partial<ReferenceChoice>) => setChoices(old => ({ ...old, [key]: { ...c, ...patch } }));
        return <div key={key}><small>{r.name} · {r.kind} · {cadDocument.objects[r.sourceId]?.name}</small>{r.kind === "unsupported" ? <small>Edit or detach this relationship first.</small> : <><select aria-label={`Reference result ${r.dependentId} ${r.sourceId}${slotLabel}`} value={c.result} onChange={e => change({ result: e.target.value, edge: "" })}><option value="">Choose new result</option>{draft?.pieces.map((_, i) => <option key={i} value={i}>Result {i + 1}</option>)}</select>{needsPortion(r) && <select aria-label={`Reference portion ${r.dependentId} ${r.sourceId}${slotLabel}`} value={c.edge} onChange={e => change({ edge: e.target.value })}><option value="">Choose reference portion</option>{p && referencePortions(r,p,owned).map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>}{r.kind === "construction" && r.elementKind === "intersection" && <select aria-label={`Reference branch ${r.dependentId} ${r.sourceId}`} value={c.branch ?? ""} onChange={e=>change({branch:e.target.value === "" ? undefined : e.target.value as "positive"|"negative"})}><option value="">Keep saved branch</option><option value="positive">Positive along line</option><option value="negative">Negative along line</option></select>}</>}</div>;
      })}</fieldset>}
      {!outcome && preview?.result.ok && <div aria-label="Contour reference impact">{references.filter(r => r.kind === "dimension").map(r => {
        const params = getCadPlanDimensionParams(preview.planId, r.dependentId), before = params?.before && resolveDimension(params.before), after = params?.after && resolveDimension(params.after);
        const display = (d: typeof before) => d ? `${(d.unit === "rad" ? d.value * 180 / Math.PI : d.value).toFixed(2)}${d.unit === "rad" ? "°" : " mm"}` : "—";
        return <small key={referenceKey(r)}>{r.name}: {display(before)} → {display(after)}</small>;
      })}{preview.changes.filter(c => c.after?.volume !== undefined).map(c => <small key={c.objectId}>{c.name}: Volume {c.before?.volume?.toFixed(2)} → {c.after!.volume!.toFixed(2)} mm³</small>)}</div>}
      <p role="status">{pick !== null ? `Click ${pick === 0 ? "the target" : "the second"} curve. Esc ends picking.` : message}</p>
      <CommandReview state={interaction} onInspect={ids=>props.onFrame(ids.flatMap(id=>{const data=preview&&getCadPlanDrawingPaths(preview.planId,id),object=cadDocument.objects[id],feature=Object.values(cadDocument.features).find(f=>f.output===id);return data?.after??data?.before??(object&&feature?getWorldDrawingGeometry(object,feature)?.points:undefined)??[];}))}/>
      {!outcome && <small>Green: result · amber: before · red: removed · blue: chosen reference edge. {trimScope === "interval" && mode === "trim" ? "Only actual bounded crossings cut an interval. Live solid profiles must remain closed." : "Fillet/Chamfer keeps picked branches. Free-end Trim/Extend uses supporting boundaries."}</small>}
      {outcome && <div className="cad-workflow-result"><span>{outcome.ids.length} result object(s) selected</span>{resultBridges.length > 0 && <button type="button" onClick={() => next("join", true)}>Reconnect gap and Join result</button>}{outcome.ids.length >= 2 && <button type="button" onClick={() => next("join")}>Join result</button>}<button type="button" onClick={() => next("offset")}>Offset result</button><button type="button" onClick={() => next("trim")}>Trim result</button><button type="button" onClick={() => next("extend")}>Extend result</button><button type="button" onClick={() => { setOutcome(null); setPoints([null, null]); setChoices({}); setMessage("Choose another target; distance and side are retained."); }}>Repeat on another target</button></div>}
      {outcome && props.nextActions?.length ? <div className="cad-workflow-actions" aria-label="Continue design">{props.nextActions.map(action => <button type="button" key={action.label} onClick={action.run}>{action.label}</button>)}</div> : null}
      </div><div className="cad-tool-footer">
      <button type="button" onClick={() => props.onFrame((ghosts.current.length ? ghosts.current : draftGhostsRef.current.length ? draftGhostsRef.current : sourceGhosts).flatMap(g => g.points))} disabled={!paths.length}>Fit workflow preview</button>
      <div>{!outcome && <button type="submit" disabled={!interaction.canApply}>Apply workflow edit</button>}<button type="button" disabled={pending} onClick={close}>{outcome ? "Finish workflow" : "Cancel workflow"}</button></div>
      </div>
    </form>
  </>;
}
