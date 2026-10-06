import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { CadCommand } from "@agent-webcad/cad-commands";
import { cadDocument } from "../../../state/cadDocument";
import { subscribeDocumentChanges } from "../../../state/documentSession";
import { previewCadCommand, applyCadPlan, discardCadPlan, getCadPlanDrawingPaths, type CadPlanPreview } from "../../../state/documentPlans";
import { contourLength, exactDrawingContour, locateOnContour } from "../geometry/contourEditing";
import { stretchDrawingPoints } from "../geometry/basicDrawingEditing";
import { createDrawingTopology, type DrawingTopology } from "../../../precision/drawingTopology";
import { parsePointEntry } from "../../../precision/pointInput";
import { parseLength } from "../../../precision/units";
import { WORK_PLANES, planeToWorld, worldToPlane, intersectRayWithWorkPlane, type Vec3 } from "../../../precision/workPlane";
import type { ContourToolProps } from "../contracts";
import {commandInteraction} from "../../../state/commandInteraction";

type Operation = "insert" | "delete" | "open" | "close";
type Pick = "vertex" | "area-first" | "area-second" | "base" | "target" | "endpoint";
type Ghost = { points: Vec3[]; closed: boolean; before: boolean };
const title = { polyline: "Edit polyline", lengthen: "Lengthen drawing", stretch: "Stretch area" };

export function BasicEditTool(props: ContourToolProps) {
  const { session } = props;
  const [revision, setRevision] = useState(0);
  const sources = useMemo(() => {
    const features = new Map(Object.values(cadDocument.features).map(f => [f.output, f]));
    return session.objectIds.map(id => {
      const object = cadDocument.objects[id], feature = features.get(id);
      try { if (!object || !feature) throw new Error("The source no longer exists. Select the geometry again."); return { object, feature, path: exactDrawingContour(object, feature), topology: (feature.params.topology ?? createDrawingTopology(String(feature.params.kind), feature.params, feature.output)) as DrawingTopology, error: "" }; }
      catch (e) { return { object, feature, path: undefined, topology: undefined, error: e instanceof Error ? e.message : String(e) }; }
    });
  }, [session, revision]);
  const cached = useRef(sources); cached.current = sources;
  const source = () => {
    const value = cached.current[0];
    if (!value?.path || !value.object || !value.feature || !value.topology) throw new Error(value?.error || "This geometry has no editable topology.");
    return { object: value.object, feature: value.feature, path: value.path, topology: value.topology };
  };
  const initial = sources[0], currentLength = initial?.path ? contourLength(initial.path) : 0;
  const [operation, setOperation] = useState<Operation>("insert"), [index, setIndex] = useState(0), [point, setPoint] = useState("");
  const [endpoint, setEndpoint] = useState<"start" | "end">("end"), [lengthMode, setLengthMode] = useState<"total" | "delta" | "percent">("total"), [value, setValue] = useState(String(currentLength));
  const [first, setFirst] = useState(""), [second, setSecond] = useState(""), [delta, setDelta] = useState("");
  const [pick, setPick] = useState<Pick>(session.mode === "stretch" ? "area-first" : session.mode === "lengthen" ? "endpoint" : "vertex");
  const [preview, setPreview] = useState<CadPlanPreview | null>(null), [message, setMessage] = useState("Choose the edit on the canvas or enter exact values."), [pending, setPending] = useState(false);
  const [paths, setPaths] = useState<{ points: string; before: boolean }[]>([]), [handles, setHandles] = useState<{ p: [number, number]; index: number; selected: boolean }[]>([]), [area, setArea] = useState("");
  const [projectedPlan, setProjectedPlan] = useState<string | null>(null);
  const [reviewedKey,setReviewedKey]=useState<string>();
  const draftKey=JSON.stringify([operation,index,point,endpoint,lengthMode,value,first,second,delta,revision,session]);
  const interaction=commandInteraction({command:"Drawing edit",draftKey,reviewedKey,preview,pending,targets:session.objectIds,visualReady:projectedPlan===preview?.planId&&paths.some(p=>!p.before)});
  const latest = useRef(props); latest.current = props;
  const draft = useRef({ operation, index, endpoint, pick, first, second }); draft.current = { operation, index, endpoint, pick, first, second };
  const plan = useRef<string | null>(null), ghosts = useRef<Ghost[]>([]), busy = useRef(false), applyRef = useRef<() => void>(() => {}), base = useRef<Vec3 | null>(null), dragging = useRef(false), downAt = useRef<[number, number] | null>(null);
  const typed = (text: string, relative?: Vec3): Vec3 | null => {
    if (!cached.current[0]?.path) return null;
    const path = source().path, plane = WORK_PLANES[path.workPlane], p = parsePointEntry(text, relative ? worldToPlane(relative, plane) : undefined);
    if (!p) return null;
    const h = path.segments[0].start.reduce((sum, v, i) => sum + v * plane.normal[i], 0);
    return planeToWorld(p, plane).map((v, i) => v + h * plane.normal[i]) as Vec3;
  };
  const modelMarks = useMemo(() => {
    try {
      const { path } = source(), vertices = path.segments.map(s => s.start).concat(path.closed ? [] : [path.segments.at(-1)!.end]);
      if (session.mode === "stretch") {
        const a = typed(first), b = a && typed(second, a); if (!a || !b) return { area: [], handles: [] };
        const plane = WORK_PLANES[path.workPlane], u = worldToPlane(a, plane), v = worldToPlane(b, plane), from = (p: [number, number]) => a.map((n, i) => n + (p[0] - u[0]) * plane.xAxis[i] + (p[1] - u[1]) * plane.yAxis[i]) as Vec3;
        return { area: [a, from([v[0], u[1]]), b, from([u[0], v[1]]), a], handles: sources.flatMap(s => s.object && s.feature ? stretchDrawingPoints(s.object, s.feature, { workPlane: path.workPlane, first: a, second: b }).map((p, index) => ({ p, index, selected: true })) : []) };
      }
      if (session.mode === "lengthen") return { area: [], handles: [vertices[0], vertices.at(-1)!].map((p, i) => ({ p, index: i, selected: i === (endpoint === "start" ? 0 : 1) })) };
      return { area: [], handles: vertices.map((p, i) => ({ p, index: i, selected: operation === "delete" && i === index })) };
    } catch { return { area: [], handles: [] }; }
  }, [sources, operation, index, endpoint, first, second, session]);
  const marks = useRef(modelMarks); marks.current = modelMarks;
  const close = () => { latest.current.onClose(); requestAnimationFrame(() => latest.current.getCanvas()?.focus()); };
  useEffect(() => subscribeDocumentChanges(() => { if (plan.current) discardCadPlan(plan.current); plan.current = null; setPreview(null); setRevision(v => v + 1); }), []);
  useEffect(() => {
    const controller = new AbortController(); let localPlan: string | undefined;
    if (plan.current) discardCadPlan(plan.current); plan.current = null; ghosts.current = []; setPreview(null);
    let command: CadCommand;
    try {
      const { path, topology } = source();
      if (session.mode === "polyline") {
        const p = operation === "insert" ? typed(point, path.segments[index]?.start) : undefined;
        if (operation === "insert" && !p) { setMessage("Pick a segment to insert a vertex; drag to place it or enter U,V. Arc vertices stay on the arc."); return; }
        command = { type: "edit-polyline", objectId: session.objectIds[0], operation, segmentId: topology.segments[index]?.id, controlId: topology.controls[index]?.id, point: p ?? undefined };
      } else if (session.mode === "lengthen") {
        const length = lengthMode === "percent" ? (/^[+]?(?:\d+(?:\.\d*)?|\.\d+)\s*%?$/.test(value.trim()) ? Number(value.trim().replace(/%$/, "")) : null) : parseLength(value);
        if (length === null) { setMessage("Enter a finite length with units, or a percentage."); return; }
        command = { type: "lengthen-drawing", objectId: session.objectIds[0], endpoint, mode: lengthMode, value: length };
      } else {
        const a = typed(first), b = a && typed(second, a), d = parsePointEntry(delta);
        if (!a || !b || !d) { setMessage("Choose two crossing-area corners, then a displacement or base → target on the canvas."); return; }
        command = { type: "stretch-drawings", objectIds: session.objectIds, workPlane: path.workPlane, first: a, second: b, delta: planeToWorld(d, WORK_PLANES[path.workPlane]) };
      }
    } catch (e) { setMessage(e instanceof Error ? e.message : String(e)); return; }
    setMessage("Preparing exact preview…");
    const timer = setTimeout(() => { void previewCadCommand(command, { signal: controller.signal }).then(result => {
      localPlan = result.planId; if (controller.signal.aborted) { discardCadPlan(result.planId); return; }
      plan.current = result.planId; setPreview(result);setReviewedKey(draftKey);
      setMessage(!result.result.ok ? result.result.reason ?? "Edit rejected." : result.stale ? "The document changed; preparing again…" : `${result.changes.filter(c => c.kind === "modified").length} object(s) updated, including live dependents · one Undo`);
      ghosts.current = result.result.ok && !result.stale ? result.changes.flatMap<Ghost>(change => {
        const p = getCadPlanDrawingPaths(result.planId, change.objectId); if (!p) return [];
        return [...(p.before ? [{ points: p.before, closed: p.beforeClosed, before: true }] : []), ...(p.after ? [{ points: p.after, closed: p.afterClosed, before: false }] : [])];
      }) : [];
    }).catch(e => { if (!controller.signal.aborted) setMessage(e instanceof Error ? e.message : String(e)); }); }, 120);
    return () => { clearTimeout(timer); controller.abort(); if (localPlan) discardCadPlan(localPlan); };
  }, [operation, index, point, endpoint, lengthMode, value, first, second, delta, revision, session]);
  useEffect(() => {
    let frame: number, previous = "";
    const draw = () => {
      const paths = ghosts.current.map(g => ({ points: (g.closed ? [...g.points, g.points[0]] : g.points).map(p => latest.current.project(p).join(",")).join(" "), before: g.before }));
      const area = marks.current.area.map(p => latest.current.project(p).join(",")).join(" ");
      const handles = marks.current.handles.map(h => ({ ...h, p: latest.current.project(h.p) }));
      const signature = JSON.stringify([paths, area, handles, plan.current]);
      if (signature !== previous) {
        previous = signature; setPaths(paths); setArea(area); setHandles(handles); setProjectedPlan(plan.current);
      }
      frame = requestAnimationFrame(draw);
    }; draw(); return () => cancelAnimationFrame(frame);
  }, [session]);
  async function apply() {
    if (!interaction.canApply || !preview || busy.current) return;
    busy.current = true; setPending(true);
    try { const result = await applyCadPlan(preview.planId); if (!result.ok) { setPreview(null); setMessage(result.reason ?? "Edit rejected."); return; } latest.current.onApplied(session.objectIds); close(); }
    catch (e) { setMessage(e instanceof Error ? e.message : String(e)); }
    finally { busy.current = false; setPending(false); }
  }
  applyRef.current = () => { void apply(); };
  useEffect(() => {
    const canvas = props.getCanvas(); if (!canvas) return; canvas.focus();
    const rawPoint = (event: PointerEvent) => {
      const path = source().path, plane = WORK_PLANES[path.workPlane], camera = latest.current.getCamera(); if (!camera) return null;
      const rect = canvas.getBoundingClientRect(), h = path.segments[0].start.reduce((sum, v, i) => sum + v * plane.normal[i], 0), ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
      const raw = intersectRayWithWorkPlane(ray.ray.origin.toArray() as Vec3, ray.ray.direction.toArray() as Vec3, { ...plane, origin: plane.normal.map(v => v * h) as Vec3 });
      if (!raw) return null;
      if (latest.current.snapEnabled && !event.altKey && session.mode === "stretch") {
        const cursor = [event.clientX - rect.left, event.clientY - rect.top], pixels = (p: Vec3) => Math.hypot(...latest.current.project(p).map((v, i) => v - cursor[i]));
        const endpoints = cached.current.flatMap(s => s.path?.segments.flatMap(s => [s.start, s.end]) ?? []);
        const snap = endpoints.filter(p => pixels(p) <= 10).sort((a, b) => pixels(a) - pixels(b))[0]; if (snap) return snap;
      }
      return raw;
    };
    const text = (p: Vec3) => worldToPlane(p, WORK_PLANES[source().path.workPlane]).join(",");
    const updateLength = (p: Vec3) => {
      const path = source().path, d = draft.current, s = d.endpoint === "start" ? path.segments[0] : path.segments.at(-1)!;
      let fraction: number;
      if (s.kind === "line") {
        const v = s.end.map((n, i) => n - s.start[i]); fraction = v.reduce((sum, n, i) => sum + n * (p[i] - s.start[i]), 0) / v.reduce((sum, n) => sum + n * n, 0);
        if (d.endpoint === "start") fraction = 1 - fraction;
      } else {
        const plane = WORK_PLANES[path.workPlane], c = worldToPlane(s.center!, plane), uv = worldToPlane(p, plane), angle = Math.atan2(uv[1] - c[1], uv[0] - c[0]), fixed = d.endpoint === "start" ? s.startAngle! + s.sweep! : s.startAngle!, direction = Math.sign(s.sweep!) * (d.endpoint === "start" ? -1 : 1);
        fraction = (((direction * (angle - fixed) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / Math.abs(s.sweep!);
      }
      const terminal = s.kind === "line" ? Math.hypot(...s.end.map((v, i) => v - s.start[i])) : s.radius! * Math.abs(s.sweep!);
      const total = contourLength(path) + terminal * (fraction - 1);
      if (total > 1e-6) { setLengthMode("total"); setValue(String(Number(total.toFixed(6)))); }
    };
    const onMove = (event: PointerEvent) => {
      if (busy.current) return;
      try { const p = rawPoint(event); if (!p) return;
        const d = draft.current;
        if (session.mode === "lengthen" && dragging.current) updateLength(p);
        else if (session.mode === "polyline" && dragging.current && d.operation === "insert") {
          const path = source().path, segment = path.segments[d.index]; setPoint(text(segment.kind === "arc" ? locateOnContour({ ...path, closed: false, segments: [segment] }, p).point : p));
        } else if (session.mode === "stretch" && d.pick === "area-second") setSecond(text(p));
        else if (session.mode === "stretch" && d.pick === "target" && base.current) setDelta(worldToPlane(p.map((v, i) => v - base.current![i]) as Vec3, WORK_PLANES[source().path.workPlane]).join(","));
      } catch (e) { setMessage(e instanceof Error ? e.message : String(e)); }
    };
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 || busy.current) return;
      event.preventDefault(); event.stopImmediatePropagation();
      try {
        const p = rawPoint(event); if (!p) return; const path = source().path, d = draft.current, rect = canvas.getBoundingClientRect(), cursor = [event.clientX - rect.left, event.clientY - rect.top], pixels = (p: Vec3) => Math.hypot(...latest.current.project(p).map((v, i) => v - cursor[i]));
        if (session.mode === "lengthen") {
          const start = path.segments[0].start, end = path.segments.at(-1)!.end;
          if (Math.min(pixels(start), pixels(end)) > 14) { setMessage("Pick or drag a highlighted endpoint, or enter a length."); return; }
          const chosen = pixels(start) < pixels(end) ? "start" : "end"; draft.current.endpoint = chosen; setEndpoint(chosen); dragging.current = true; canvas.setPointerCapture(event.pointerId);
        } else if (session.mode === "polyline") {
          if (d.operation === "insert") {
            const hit = locateOnContour(path, p); if (pixels(hit.point) > 14) { setMessage("Pick a segment within 14 pixels, or use the segment selector and exact coordinates."); return; }
            draft.current.index = hit.segment; setIndex(hit.segment); setPoint(text(hit.point)); dragging.current = true; canvas.setPointerCapture(event.pointerId);
          } else if (d.operation === "delete") {
            const vertices = path.segments.map(s => s.start).concat(path.closed ? [] : [path.segments.at(-1)!.end]), nearest = vertices.map((p, index) => ({ index, distance: pixels(p) })).sort((a, b) => a.distance - b.distance)[0];
            if (nearest.distance <= 14) setIndex(nearest.index); else setMessage("Pick a vertex within 14 pixels, or use the vertex selector.");
          }
        } else if (d.pick === "area-first") { setFirst(text(p)); setSecond(""); setDelta(""); setPick("area-second"); downAt.current = [event.clientX, event.clientY]; canvas.setPointerCapture(event.pointerId); }
        else if (d.pick === "area-second") { setSecond(text(p)); setPick("base"); }
        else if (d.pick === "base") { base.current = p; setPick("target"); }
        else { onMove(event); setPick("base"); }
      } catch (e) { setMessage(e instanceof Error ? e.message : String(e)); }
    };
    const onUp = (event: PointerEvent) => {
      if (dragging.current) onMove(event);
      if (session.mode === "stretch" && downAt.current && Math.hypot(event.clientX - downAt.current[0], event.clientY - downAt.current[1]) > 5) { onMove(event); setPick("base"); }
      dragging.current = false; downAt.current = null; if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.target instanceof Element && event.target.closest("[data-cad-editor], input, textarea, select, dialog[open]")) return;
      if (event.key === "Escape" && !busy.current) { event.preventDefault(); close(); }
      else if (event.key === "Enter") { event.preventDefault(); applyRef.current(); }
    };
    canvas.addEventListener("pointerdown", onDown, true); canvas.addEventListener("pointermove", onMove); canvas.addEventListener("pointerup", onUp); canvas.addEventListener("pointercancel", onUp); window.addEventListener("keydown", onKey, true);
    return () => { canvas.removeEventListener("pointerdown", onDown, true); canvas.removeEventListener("pointermove", onMove); canvas.removeEventListener("pointerup", onUp); canvas.removeEventListener("pointercancel", onUp); window.removeEventListener("keydown", onKey, true); };
  }, [session]);
  return <>
    <svg className="cad-contour-ghosts" aria-label="Basic drawing edit preview" data-basic-edit-preview-count={paths.filter(p => !p.before).length}>
      {paths.map((p, i) => <polyline key={i} points={p.points} fill="none" stroke={p.before ? "#ffb282" : "#61dcac"} strokeWidth={p.before ? 3 : 2} strokeDasharray={p.before ? "5 5" : undefined} />)}
      {area && <polyline data-stretch-area points={area} fill="#61dcac20" stroke="#61dcac" strokeWidth="1.5" strokeDasharray="6 4" />}
      {handles.map((h, i) => <circle key={i} data-basic-edit-handle={h.index} data-handle-selected={h.selected} cx={h.p[0]} cy={h.p[1]} r={h.selected ? 6 : 4} fill={h.selected ? "#ffc96f" : "#17252d"} stroke="#ffc96f" strokeWidth="2" />)}
    </svg>
    <form className="cad-contour-tool cad-basic-edit-tool" aria-label="Basic drawing editor" data-basic-edit-generation={preview?.baseVersion.generation} data-cad-editor="true" onSubmit={e => { e.preventDefault(); void apply(); }} onKeyDown={e => { e.stopPropagation(); if (e.key === "Escape" && !pending) { e.preventDefault(); close(); } }}>
      <strong>{title[session.mode as keyof typeof title]}</strong>
      {session.mode === "polyline" && <>
        <label>Operation<select aria-label="Polyline operation" value={operation} disabled={pending} onChange={e => { setOperation(e.target.value as Operation); setIndex(0); setPoint(""); }}><option value="insert">Insert vertex</option><option value="delete">Delete vertex</option><option value="open">Open (remove closing segment)</option><option value="close">Close (add closing segment)</option></select></label>
        {(operation === "insert" || operation === "delete") && <label>{operation === "insert" ? "Segment" : "Vertex"}<select aria-label="Polyline reference" value={index} disabled={pending} onChange={e => { setIndex(Number(e.target.value)); setPoint(""); }}>{(operation === "insert" ? initial?.topology?.segments ?? [] : initial?.topology?.controls ?? []).map((c, i) => <option key={c.id} value={i}>{i + 1}{operation === "insert" ? ` · ${initial.path?.segments[i]?.kind}` : initial.path ? ` · ${worldToPlane(initial.path.segments[i]?.start ?? initial.path.segments.at(-1)!.end, WORK_PLANES[initial.path.workPlane]).map(v => v.toFixed(2)).join(", ")}` : ""}</option>)}</select></label>}
        {operation === "insert" && <label>New vertex U,V<input aria-label="Inserted vertex" value={point} disabled={pending} placeholder="@20mm,0" onChange={e => setPoint(e.target.value)} /></label>}
        <small>Pick a segment or vertex on the canvas. Insert splits arcs without faceting; straight segments may form a new corner. @ is relative to the selected segment's start.</small>
      </>}
      {session.mode === "lengthen" && <>
        <small>Current total: {currentLength.toFixed(4)} mm</small>
        <label>Endpoint<select aria-label="Lengthen endpoint" value={endpoint} disabled={pending} onChange={e => setEndpoint(e.target.value as "start" | "end")}><option value="end">End</option><option value="start">Start</option></select></label>
        <label>Method<select aria-label="Lengthen method" value={lengthMode} disabled={pending} onChange={e => { const mode = e.target.value as typeof lengthMode; setLengthMode(mode); setValue(mode === "percent" ? "100" : mode === "delta" ? "10mm" : String(currentLength)); }}><option value="total">Total length</option><option value="delta">Add / subtract length</option><option value="percent">Percent of current total</option></select></label>
        <label>{lengthMode === "percent" ? "Percent" : "Length"}<input aria-label="Lengthen value" value={value} disabled={pending} placeholder={lengthMode === "percent" ? "125%" : "120mm"} onChange={e => setValue(e.target.value)} /></label>
        <small>Pick or drag an endpoint. Lines keep their direction; arcs keep their radius. Shortening may remove intermediate vertices. Drag uses total length.</small>
      </>}
      {session.mode === "stretch" && <>
        <small>{session.objectIds.length} source(s) · highlighted vertices move; the rest stay fixed</small>
        <label>Area first U,V<input aria-label="Stretch first corner" value={first} disabled={pending} placeholder="40,-10" onChange={e => setFirst(e.target.value)} /></label>
        <label>Area second U,V<input aria-label="Stretch second corner" value={second} disabled={pending} placeholder="@80,100" onChange={e => setSecond(e.target.value)} /></label>
        <label>Displacement dU,dV<input aria-label="Stretch displacement" value={delta} disabled={pending} placeholder="2cm,0" onChange={e => setDelta(e.target.value)} /></label>
        <div><button type="button" disabled={pending} onClick={() => { setPick("area-first"); props.getCanvas()?.focus(); }}>Pick crossing area</button><button type="button" disabled={pending || !typed(first) || !typed(second, typed(first) ?? undefined)} onClick={() => { setPick("base"); base.current = null; props.getCanvas()?.focus(); }}>Pick base → target</button></div>
        <small>Canvas step: {pick.replace("area-", "area ")}. Draw the area in either direction. Circle centres inside move the whole circle; partial arc Stretch keeps its included angle.</small>
      </>}
      <p role="status">{message}</p><small>Green: result · dashed amber: before. Esc cancels; Enter applies.</small>
      <button type="button" disabled={pending || !initial?.path} onClick={() => props.onFrame([...(ghosts.current.length ? ghosts.current.flatMap(g => g.points) : cached.current.flatMap(s => s.path?.segments.flatMap(s => [s.start, s.end]) ?? [])), ...marks.current.area])}>Fit edit preview</button>
      <div><button type="submit" disabled={!interaction.canApply}>Apply drawing edit</button><button type="button" disabled={pending} onClick={close}>Cancel drawing edit</button></div>
    </form>
  </>;
}
