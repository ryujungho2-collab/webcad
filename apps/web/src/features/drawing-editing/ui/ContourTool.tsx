import { DEFAULT_SNAP_PREFERENCES } from "../../../precision/snapPreferences";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { BasicEditTool } from "./BasicEditTool";
import type { CadCommand } from "@agent-webcad/cad-commands";
import { cadDocument } from "../../../state/cadDocument";
import { previewCadCommand, applyCadPlan, discardCadPlan, getCadPlanDrawingPaths, type CadPlanPreview } from "../../../state/documentPlans";
import { subscribeDocumentChanges } from "../../../state/documentSession";
import { exactDrawingContour, locateOnContour } from "../geometry/contourEditing";
import { parsePointEntry } from "../../../precision/pointInput";
import { WORK_PLANES, planeToWorld, worldToPlane, intersectRayWithWorkPlane, type Vec3 } from "../../../precision/workPlane";
import type { ContourToolProps } from "../contracts";
import {commandInteraction} from "../../../state/commandInteraction";

type Ghost = { points: Vec3[]; closed: boolean; removed: boolean };
const title = { join: "Join contours", explode: "Explode contours", break: "Break contour" };

export function ContourTool(props: ContourToolProps) {
  return ["polyline", "lengthen", "stretch"].includes(props.session.mode) ? <BasicEditTool {...props} /> : <CompositionTool {...props} />;
}
function CompositionTool(props: ContourToolProps) {
  const { session } = props;
  const [first, setFirst] = useState(""), [second, setSecond] = useState(""), [gap, setGap] = useState(false), [pick, setPick] = useState<"first" | "second">("first");
  const [preview, setPreview] = useState<CadPlanPreview | null>(null), [message, setMessage] = useState("Preparing exact preview…"), [pending, setPending] = useState(false), [revision, setRevision] = useState(0);
  const [paths, setPaths] = useState<{ points: string; removed: boolean }[]>([]), [marker, setMarker] = useState<[number, number] | null>(null);
  const [projectedPlan, setProjectedPlan] = useState<string | null>(null);
  const [reviewedKey,setReviewedKey]=useState<string>();
  const draftKey=JSON.stringify([first,second,gap,revision,session]);
  const interaction=commandInteraction({command:"Contour edit",draftKey,reviewedKey,preview,pending,targets:session.objectIds,visualReady:projectedPlan===preview?.planId&&paths.some(p=>!p.removed)});
  const plan = useRef<string | null>(null), ghosts = useRef<Ghost[]>([]), latest = useRef(props), applyRef = useRef<() => void>(() => {}), pendingRef = useRef(false);
  latest.current = props; pendingRef.current = pending;
  const hover = useRef<Vec3 | null>(null), pickRef = useRef(pick), gapRef = useRef(gap); pickRef.current = pick; gapRef.current = gap;
  const contour = () => {
    const object = cadDocument.objects[session.objectIds[0]], feature = Object.values(cadDocument.features).find(f => f.output === session.objectIds[0]);
    if (!object || !feature) throw new Error("The source no longer exists. Select the contour again.");
    return exactDrawingContour(object, feature);
  };
  const typedPoint = (value: string, base?: Vec3): Vec3 | null => {
    const path = contour(), plane = WORK_PLANES[path.workPlane], p = parsePointEntry(value, base ? worldToPlane(base, plane) : undefined);
    if (!p) return null;
    const h = path.segments[0].start.reduce((sum, v, i) => sum + v * plane.normal[i], 0);
    return planeToWorld(p, plane).map((v, i) => v + h * plane.normal[i]) as Vec3;
  };
  useEffect(() => subscribeDocumentChanges(() => { if (plan.current) discardCadPlan(plan.current); plan.current = null; setPreview(null); setRevision(v => v + 1); }), []);
  useEffect(() => {
    const controller = new AbortController(); let localPlan: string | undefined;
    if (plan.current) discardCadPlan(plan.current); plan.current = null; setPreview(null); ghosts.current = [];
    let command: CadCommand;
    try {
      if (session.mode === "join") command = { type: "join-drawings", objectIds: session.objectIds, id: session.id };
      else if (session.mode === "explode") command = { type: "explode-drawings", objectIds: session.objectIds };
      else {
        const a = typedPoint(first), b = gap && a ? typedPoint(second, a) : undefined;
        if (!a || gap && !b) { setMessage(gap ? "Pick two points on the contour or enter exact U,V coordinates." : "Pick a point on the contour or enter exact U,V coordinates."); return; }
        command = { type: "break-drawing", objectId: session.objectIds[0], firstPoint: a, secondPoint: b ?? undefined };
      }
    } catch (e) { setMessage(e instanceof Error ? e.message : String(e)); return; }
    setMessage("Preparing exact preview…");
    const timer = setTimeout(() => {
      void previewCadCommand(command, { signal: controller.signal }).then(result => {
        localPlan = result.planId;
        if (controller.signal.aborted) { discardCadPlan(result.planId); return; }
        plan.current = result.planId; setPreview(result);setReviewedKey(draftKey);
        setMessage(result.stale ? "Document changed; preparing again…" : !result.result.ok ? result.result.reason ?? "Edit rejected." : `${session.objectIds.length} source${session.objectIds.length > 1 ? "s" : ""} → ${result.result.createdIds.length} curve${result.result.createdIds.length > 1 ? "s" : ""} · one Undo`);
        ghosts.current = result.result.ok && !result.stale ? result.changes.flatMap<Ghost>(change => {
          const data = getCadPlanDrawingPaths(result.planId, change.objectId);
          if (!data) return [];
          return data.after ? [{ points: data.after, closed: data.afterClosed, removed: false }] : data.before ? [{ points: data.before, closed: data.beforeClosed, removed: true }] : [];
        }) : [];
      }).catch(e => { if (!controller.signal.aborted) setMessage(e instanceof Error ? e.message : String(e)); });
    }, 120);
    return () => { clearTimeout(timer); controller.abort(); if (localPlan) discardCadPlan(localPlan); };
  }, [first, second, gap, revision, session]);
  useEffect(() => {
    let frame: number, previous = "";
    const draw = () => {
      const paths = ghosts.current.map(ghost => {
        const points = ghost.closed ? [...ghost.points, ghost.points[0]] : ghost.points;
        return { points: points.map(p => latest.current.project(p).join(",")).join(" "), removed: ghost.removed };
      });
      const marker = hover.current ? latest.current.project(hover.current) : null, signature = JSON.stringify([paths, marker, plan.current]);
      if (signature !== previous) { previous = signature; setPaths(paths); setMarker(marker); setProjectedPlan(plan.current); }
      frame = requestAnimationFrame(draw);
    }; draw(); return () => cancelAnimationFrame(frame);
  }, []);
  const close = () => { props.onClose(); requestAnimationFrame(() => props.getCanvas()?.focus()); };
  async function apply() {
    if (!interaction.canApply || !preview || pendingRef.current) return;
    pendingRef.current = true; setPending(true);
    try { const result = await applyCadPlan(preview.planId); if (!result.ok) { setPreview(null); setMessage(result.reason ?? "Edit rejected."); return; } props.onApplied(result.createdIds); close(); }
    catch (e) { setMessage(e instanceof Error ? e.message : String(e)); }
    finally { pendingRef.current = false; setPending(false); }
  }
  applyRef.current = () => { void apply(); };
  useEffect(() => {
    const canvas = props.getCanvas(); if (!canvas) return;
    canvas.focus();
    const onMove = (event: PointerEvent) => {
      if (session.mode !== "break" || pendingRef.current) return;
      try {
        const path = contour(), plane = WORK_PLANES[path.workPlane], camera = latest.current.getCamera(); if (!camera) return;
        const h = path.segments[0].start.reduce((sum, v, i) => sum + v * plane.normal[i], 0), rect = canvas.getBoundingClientRect();
        const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
        const raw = intersectRayWithWorkPlane(ray.ray.origin.toArray() as Vec3, ray.ray.direction.toArray() as Vec3, { ...plane, origin: plane.normal.map(v => v * h) as Vec3 });
        if (!raw) { hover.current = null; return; }
        let hit = locateOnContour(path, raw).point;
        const cursor = [event.clientX - rect.left, event.clientY - rect.top], pixels = (p: Vec3) => Math.hypot(...latest.current.project(p).map((v, i) => v - cursor[i]));
        if (latest.current.snapEnabled && !event.altKey) {
          const preferences=latest.current.snapPreferences??DEFAULT_SNAP_PREFERENCES;
          const endpoint = preferences.enabled.endpoint ? path.segments.flatMap(s => [s.start, s.end]).filter(p => pixels(p) <= preferences.tolerancePx).sort((a, b) => pixels(a) - pixels(b))[0] : undefined;
          if (endpoint) hit = endpoint;
        }
        hover.current = pixels(hit) <= 12 ? hit : null;
      } catch { hover.current = null; }
    };
    const onDown = (event: PointerEvent) => {
      if (session.mode !== "break" || event.button !== 0 || pendingRef.current) return;
      onMove(event); if (!hover.current) { setMessage("Pick within 12 pixels of the selected contour. Exact coordinates are also available."); return; }
      const p = worldToPlane(hover.current, WORK_PLANES[contour().workPlane]), value = p.map(v => String(v)).join(",");
      if (pickRef.current === "first") { setFirst(value); if (gapRef.current) setPick("second"); } else setSecond(value);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.target instanceof Element && event.target.closest("[data-cad-editor], input, textarea, select, dialog[open]")) return;
      if (event.key === "Escape" && !pendingRef.current) { event.preventDefault(); close(); }
      else if (event.key === "Enter") { event.preventDefault(); applyRef.current(); }
    };
    canvas.addEventListener("pointermove", onMove); canvas.addEventListener("pointerdown", onDown); window.addEventListener("keydown", onKey, true);
    return () => { canvas.removeEventListener("pointermove", onMove); canvas.removeEventListener("pointerdown", onDown); window.removeEventListener("keydown", onKey, true); };
  }, [session]);
  return <>
    <svg className="cad-contour-ghosts" aria-label="Contour edit preview" data-contour-preview-count={paths.filter(p => !p.removed).length}>{paths.map((path, i) => <polyline key={i} points={path.points} fill="none" stroke={path.removed ? "#ffb282" : "#61dcac"} strokeWidth={path.removed ? 3 : 2} strokeDasharray={path.removed ? "5 5" : undefined} />)}{marker && <circle data-contour-pick-marker cx={marker[0]} cy={marker[1]} r="6" fill="none" stroke="#ffc96f" strokeWidth="2" />}</svg>
    <form className="cad-contour-tool" data-cad-editor="true" data-contour-generation={preview?.baseVersion.generation} aria-label="Contour editor" onSubmit={e => { e.preventDefault(); void apply(); }} onKeyDown={e => { e.stopPropagation(); if (e.key === "Escape" && !pending) { e.preventDefault(); close(); } }}>
      <strong>{title[session.mode as keyof typeof title]}</strong>
      {session.mode === "break" && <>
        <label>Operation<select aria-label="Break operation" value={gap ? "gap" : "split"} disabled={pending} onChange={e => { setGap(e.target.value === "gap"); setPick("first"); }}><option value="split">Split at one point</option><option value="gap">Remove between two points</option></select></label>
        <label>First point U,V<input aria-label="First break point" value={first} disabled={pending} placeholder="25mm,0" onChange={e => setFirst(e.target.value)} /></label>
        {gap && <label>Second point U,V<input aria-label="Second break point" value={second} disabled={pending} placeholder="@10mm,0" onChange={e => setSecond(e.target.value)} /></label>}
        <div><button type="button" disabled={pending} aria-pressed={pick === "first"} onClick={() => { setPick("first"); props.getCanvas()?.focus(); }}>Pick first point</button>{gap && <button type="button" disabled={pending} aria-pressed={pick === "second"} onClick={() => { setPick("second"); props.getCanvas()?.focus(); }}>Pick second point</button>}</div>
        {gap && <button type="button" disabled={pending} onClick={() => { try { const a = typedPoint(first), b = a && typedPoint(second, a); if (!a || !b) return; const plane = WORK_PLANES[contour().workPlane]; setFirst(worldToPlane(b, plane).join(",")); setSecond(worldToPlane(a, plane).join(",")); } catch { /* invalid coordinates remain editable */ } }}>Reverse points</button>}
        <small>U,V in mm; cm / in supported. @ uses the first point. Closed contours remove first → second along their direction; reverse points to keep the other side.</small>
      </>}
      <p role="status">{message}</p><small>Green: result · dashed amber: replaced sources. Arcs retain their radius and curvature. Esc cancels; Enter applies.</small>
      <button type="button" disabled={!preview?.result.ok || preview.stale} onClick={() => props.onFrame(ghosts.current.flatMap(p => p.points))}>Fit contour preview</button>
      <div><button type="submit" disabled={!interaction.canApply}>Apply contour edit</button><button type="button" disabled={pending} onClick={close}>Cancel contour edit</button></div>
    </form>
  </>;
}
