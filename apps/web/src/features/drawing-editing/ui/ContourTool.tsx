import { requestProjectFrame as requestAnimationFrame, cancelProjectFrame as cancelAnimationFrame } from "../../../app/projectActivity";
import { DEFAULT_SNAP_PREFERENCES } from "../../../precision/snapPreferences";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { BasicEditTool } from "./BasicEditTool";
import type { CadCommand } from "@agent-webcad/cad-commands";
import { cadDocument } from "../../../state/cadDocument";
import { previewCadCommand, applyCadPlan, discardCadPlan, getCadPlanDrawingPaths, type CadPlanPreview } from "../../../state/documentPlans";
import { subscribeDocumentChanges } from "../../../state/documentSession";
import { exactDrawingContour, locateOnContour, breakContour, explodeContour, joinContours, convertContourEdge, contourParams, segmentPoint } from "../geometry/contourEditing";
import { parsePointEntry } from "../../../precision/pointInput";
import { parseLength } from "../../../precision/units";
import { WORK_PLANES, planeToWorld, worldToPlane, intersectRayWithWorkPlane, type Vec3 } from "../../../precision/workPlane";
import type { ContourToolProps } from "../contracts";
import {commandInteraction} from "../../../state/commandInteraction";

import { contourReferenceRequirements } from "../commands/contourReferences";
import { needsPortion, referencePortions, referenceRoute, referenceKey, type ReferenceChoice } from "./contourReferenceChoices";
import { getCadPlanDimensionParams } from "../../../state/documentPlans";
import { resolveDimension } from "../../../precision/dimensionGeometry";

type Ghost = { points: Vec3[]; closed: boolean; removed: boolean };
const title = { join: "Join contours", explode: "Explode contours", break: "Break contour", convert: "Convert edge" };

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
  const [keep, setKeep] = useState("all"), [choices, setChoices] = useState<Record<string, ReferenceChoice>>({});
  const [edge, setEdge] = useState("0"), [target, setTarget] = useState(""), [radius, setRadius] = useState(""), [side, setSide] = useState<"left" | "right">("left");
  const draftKey=JSON.stringify([first,second,gap,revision,session,keep,choices,edge,target,radius,side]);
  const interaction=commandInteraction({command:"Contour edit",draftKey,reviewedKey,preview,pending,targets:session.objectIds,visualReady:projectedPlan===preview?.planId&&paths.some(p=>!p.removed)});
  const plan = useRef<string | null>(null), ghosts = useRef<Ghost[]>([]), latest = useRef(props), applyRef = useRef<() => void>(() => {}), pendingRef = useRef(false);
  latest.current = props; pendingRef.current = pending;
  const hover = useRef<Vec3 | null>(null), pickRef = useRef(pick), gapRef = useRef(gap); pickRef.current = pick; gapRef.current = gap;
  const pickedSegment = useRef<number | null>(null);
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
  const references = useMemo(() => contourReferenceRequirements(cadDocument, session.objectIds), [session, revision]);
  const convertPlan = () => {
    const index = Number(edge);
    if (!Number.isInteger(index)) return null;
    try {
      const kind = contour().segments[index]?.kind;
      if (kind !== "line" && kind !== "arc") return null;
      return { index, treatment: (target || (kind === "line" ? "arc" : "line")) as "line" | "arc" };
    } catch { return null; }
  };
  const edgeOptions = useMemo(() => {
    try { return contour().segments.map((s, i) => ({ value: String(i), label: `Edge ${i + 1} · ${s.kind}` })); }
    catch { return []; }
  }, [session, revision]);
  const convertEdgePoints = (() => {
    if (session.mode !== "convert") return null;
    try {
      const path = contour(), segment = path.segments[Number(edge)];
      if (!segment) return null;
      const points = Array.from({ length: segment.kind === "arc" ? 33 : 2 }, (_, i) => segmentPoint(segment, i / (segment.kind === "arc" ? 32 : 1), path.workPlane));
      return points.map(p => props.project(p).join(",")).join(" ");
    } catch { return null; }
  })();
  const draft = useMemo(() => {
    try {
      const sources = session.objectIds.map(id=>{const object=cadDocument.objects[id],feature=Object.values(cadDocument.features).find(f=>f.output===id);if(!object||!feature)throw new Error("Select current drawing sources.");return {object,feature};});
      if (session.mode === "join") return [joinContours(sources.map(s=>exactDrawingContour(s.object,s.feature)))];
      if (session.mode === "explode") return sources.flatMap(({object,feature})=>explodeContour(exactDrawingContour(object,feature)).map(params=>exactDrawingContour({...object,transform:{translation:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}},{...feature,params})));
      if (session.mode === "convert") {
        const plan = convertPlan();
        if (!plan) return [];
        const distance = plan.treatment === "arc" ? parseLength(radius) : undefined;
        if (distance === null || distance !== undefined && distance <= 0) return [];
        const object = cadDocument.objects[session.objectIds[0]], feature = Object.values(cadDocument.features).find(f => f.output === object.id)!;
        try {
          const converted = contourParams(convertContourEdge(contour(), plan.index, plan.treatment, distance ?? undefined, side));
          return [converted].map(params => exactDrawingContour({ ...object, transform: { translation: [0,0,0], rotation: [0,0,0], scale: [1,1,1] } }, { ...feature, params }));
        } catch { return []; }
      }

      const a = typedPoint(first), b = gap && a ? typedPoint(second, a) : undefined;
      if (!a || gap && !b) return [];
      const object = cadDocument.objects[session.objectIds[0]], feature = Object.values(cadDocument.features).find(f => f.output === object.id)!;
      return breakContour(contour(), a, b ?? undefined).map(params => exactDrawingContour({ ...object, transform: { translation: [0,0,0], rotation: [0,0,0], scale: [1,1,1] } }, { ...feature, params }));
    } catch { return []; }
  }, [first,second,gap,session,revision,edge,target,radius,side]);
  const kept = draft.filter((_, i) => session.mode !== "break" || keep === "all" || String(i) === keep);
  const sourceResults = (sourceId:string) => {
    if (session.mode !== "explode") return kept.map((_,i)=>i);
    let index=0;const indices:number[]=[];
    for(const id of session.objectIds){const object=cadDocument.objects[id],feature=Object.values(cadDocument.features).find(f=>f.output===id);if(!object||!feature)return [];
      const count=exactDrawingContour(object,feature).segments.length;if(id===sourceId)for(let i=0;i<count;i++)indices.push(index+i);index+=count;}
    return indices;
  };
  const draftGhosts = kept.map(path => ({ closed: path.closed, removed: false, points: path.segments.flatMap(s => Array.from({length:s.kind === "arc" ? 33 : 2}, (_,i) => segmentPoint(s,i/(s.kind === "arc" ? 32 : 1),path.workPlane))) }));
  const draftGhostsRef = useRef(draftGhosts); draftGhostsRef.current = draftGhosts;
  const referenceGhostsRef = useRef<Vec3[][]>([]);
  referenceGhostsRef.current = references.flatMap(r => {
    const c = choices[referenceKey(r)], path = c && c.result !== "" && kept[Number(c.result)];
    const portion = path && referencePortions(r, path, false).find(p => p.value === c.edge);
    return portion ? [portion.points] : [];
  });
  const [referencePaths, setReferencePaths] = useState<string[]>([]);
  useEffect(() => subscribeDocumentChanges(() => { if (plan.current) discardCadPlan(plan.current); plan.current = null; setPreview(null); setRevision(v => v + 1); }), []);
  useEffect(() => {
    const controller = new AbortController(); let localPlan: string | undefined;
    if (plan.current) discardCadPlan(plan.current); plan.current = null; setPreview(null); ghosts.current = [];
    let command: CadCommand;
    try {
      const referenceRoutes = references.map(r => {
        if (r.kind === "unsupported" || r.kind === "sketch" || r.kind === "pattern" || "throughPattern" in r && r.throughPattern) throw new Error(`${r.name}: this relationship needs a separate contour adapter.`);
        return referenceRoute(r, choices[referenceKey(r)]);
      });
      if (session.mode === "join") command = { type: "join-drawings", objectIds: session.objectIds, id: session.id, referenceRoutes };
      else if (session.mode === "explode") command = { type: "explode-drawings", objectIds: session.objectIds, referenceRoutes };
      else if (session.mode === "convert") {
        const plan = convertPlan();
        if (!plan) { setMessage("Pick an edge of the contour or choose its number."); return; }
        const distance = plan.treatment === "arc" ? parseLength(radius) : undefined;
        if (distance === null || distance !== undefined && distance <= 0) { setMessage("Enter a positive arc radius with units, such as 60mm or 2in."); return; }
        command = { type: "convert-contour-edge", objectId: session.objectIds[0], segmentIndex: plan.index, target: plan.treatment, ...(distance !== undefined ? { radius: distance, side } : {}), referenceRoutes };
      }
      else {
        const a = typedPoint(first), b = gap && a ? typedPoint(second, a) : undefined;
        if (!a || gap && !b) { setMessage(gap ? "Pick two points on the contour or enter exact U,V coordinates." : "Pick a point on the contour or enter exact U,V coordinates."); return; }
        command = { type: "break-drawing", objectId: session.objectIds[0], firstPoint: a, secondPoint: b ?? undefined, keepResultIndices: keep === "all" ? undefined : [Number(keep)], referenceRoutes };
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
  }, [first, second, gap, revision, session, keep, choices, edge, target, radius, side]);
  useEffect(() => {
    let frame: number, previous = "";
    const draw = () => {
      const paths = (ghosts.current.length ? ghosts.current : draftGhostsRef.current).map(ghost => {
        const points = ghost.closed ? [...ghost.points, ghost.points[0]] : ghost.points;
        return { points: points.map(p => latest.current.project(p).join(",")).join(" "), removed: ghost.removed };
      });
      const references = referenceGhostsRef.current.map(points => points.map(p => latest.current.project(p).join(",")).join(" "));
      const marker = hover.current ? latest.current.project(hover.current) : null, signature = JSON.stringify([paths, references, marker, plan.current]);
      if (signature !== previous) { previous = signature; setPaths(paths); setReferencePaths(references); setMarker(marker); setProjectedPlan(plan.current); }
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
      if (session.mode !== "break" && session.mode !== "convert" || pendingRef.current) return;
      try {
        const path = contour(), plane = WORK_PLANES[path.workPlane], camera = latest.current.getCamera(); if (!camera) return;
        const h = path.segments[0].start.reduce((sum, v, i) => sum + v * plane.normal[i], 0), rect = canvas.getBoundingClientRect();
        const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
        const raw = intersectRayWithWorkPlane(ray.ray.origin.toArray() as Vec3, ray.ray.direction.toArray() as Vec3, { ...plane, origin: plane.normal.map(v => v * h) as Vec3 });
        if (!raw) { hover.current = null; return; }
        const located = locateOnContour(path, raw);
        if (session.mode === "convert") pickedSegment.current = located.segment;
        let hit = located.point;
        const cursor = [event.clientX - rect.left, event.clientY - rect.top], pixels = (p: Vec3) => Math.hypot(...latest.current.project(p).map((v, i) => v - cursor[i]));
        if (session.mode === "break" && latest.current.snapEnabled && !event.altKey) {
          const preferences=latest.current.snapPreferences??DEFAULT_SNAP_PREFERENCES;
          const endpoint = preferences.enabled.endpoint ? path.segments.flatMap(s => [s.start, s.end]).filter(p => pixels(p) <= preferences.tolerancePx).sort((a, b) => pixels(a) - pixels(b))[0] : undefined;
          if (endpoint) hit = endpoint;
        }
        hover.current = pixels(hit) <= 12 ? hit : null;
      } catch { hover.current = null; }
    };
    const onDown = (event: PointerEvent) => {
      if (session.mode !== "break" && session.mode !== "convert" || event.button !== 0 || pendingRef.current) return;
      onMove(event); if (!hover.current) { setMessage(session.mode === "convert" ? "Pick an edge of the selected contour within 12 pixels." : "Pick within 12 pixels of the selected contour. Exact coordinates are also available."); return; }
      if (session.mode === "convert") { if (pickedSegment.current !== null) setEdge(String(pickedSegment.current)); props.getCanvas()?.focus(); return; }
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
    <svg className="cad-contour-ghosts" aria-label="Contour edit preview" data-contour-preview-count={paths.filter(p => !p.removed).length}>{paths.map((path, i) => <polyline key={i} points={path.points} fill="none" stroke={path.removed ? "#ffb282" : "#61dcac"} strokeWidth={path.removed ? 3 : 2} strokeDasharray={path.removed ? "5 5" : undefined} />)}{referencePaths.map((points,i) => {const vertices=points.split(" ");return vertices.length === 1 ? <circle key={`reference-${i}`} data-break-reference cx={vertices[0].split(",")[0]} cy={vertices[0].split(",")[1]} r="5" fill="#6cb9ff" /> : <polyline key={`reference-${i}`} data-break-reference points={points} fill="none" stroke="#6cb9ff" strokeWidth="4" />;})}{draftGhosts.map((g,i) => {const p=props.project(g.points[Math.floor(g.points.length/2)]);return <text key={`result-${i}`} data-break-result={session.mode === "break" ? i : undefined} data-contour-result={i} x={p[0]+8} y={p[1]-8} fill="#61dcac">Result {i+1}</text>;})}{convertEdgePoints && <polyline data-convert-edge points={convertEdgePoints} fill="none" stroke="#ffc96f" strokeWidth={4} />}{marker && <circle data-contour-pick-marker cx={marker[0]} cy={marker[1]} r="6" fill="none" stroke="#ffc96f" strokeWidth="2" />}</svg>
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
      {session.mode === "convert" && <>
        <label>Edge<select aria-label="Convert edge" value={edge} disabled={pending} onChange={e => setEdge(e.target.value)}>{edgeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}{!edgeOptions.length && <option value="">No edges</option>}</select></label>
        <div><button type="button" disabled={pending} onClick={() => props.getCanvas()?.focus()}>Pick edge</button></div>
        <label>Treatment<select aria-label="Convert treatment" value={target} disabled={pending} onChange={e => setTarget(e.target.value)}><option value="">Opposite curve (auto)</option><option value="line">Straight line</option><option value="arc">Arc</option></select></label>
        {(target === "arc" || target === "" && convertPlan()?.treatment === "arc") && <label>Radius<input aria-label="Convert radius" value={radius} disabled={pending} placeholder="60mm" onChange={e => setRadius(e.target.value)} /></label>}
        {(target === "arc" || target === "" && convertPlan()?.treatment === "arc") && <label>Bulge side<select aria-label="Convert side" value={side} disabled={pending} onChange={e => setSide(e.target.value as "left" | "right")}><option value="left">Left of the contour direction</option><option value="right">Right of the contour direction</option></select></label>}
        <small>Junction points stay fixed; only the edge curvature changes. Radius uses mm, cm or in.</small>
      </>}
      <>
        {session.mode === "break" && <label>Keep pieces<select aria-label="Keep Break pieces" value={keep} disabled={pending} onChange={e => { setKeep(e.target.value); setChoices({}); }}><option value="all">All remaining pieces</option>{draft.map((_,i) => <option key={i} value={i}>Only piece {i+1}</option>)}</select></label>}
        {references.length > 0 && <fieldset aria-label={`Reconnect ${session.mode === "break" ? "Break" : session.mode === "explode" ? "Explode" : session.mode === "convert" ? "Convert" : "Join"} references`} disabled={pending}><legend>Reconnect references</legend>{references.map(r => {
          const key = referenceKey(r), c = choices[key] ?? {result:"",edge:""}, path = kept[Number(c.result)], slot = "referenceSlot" in r && r.referenceSlot ? ` ${r.referenceSlot}` : "";
          const change = (patch: Partial<ReferenceChoice>) => setChoices(old => ({...old,[key]:{...c,...patch}}));
          const unsupported = r.kind === "unsupported" || r.kind === "sketch" || r.kind === "pattern" || "throughPattern" in r && r.throughPattern;
          return <div key={key}><small>{r.name} · {r.kind}</small>{unsupported ? <small>Edit or detach this relationship first.</small> : <>
            <select aria-label={`Reference result ${r.dependentId} ${r.sourceId}${slot}`} value={c.result} onChange={e => change({result:e.target.value,edge:""})}><option value="">Choose new result</option>{kept.map((_,i) => <option key={i} value={i}>Result {i+1}</option>)}{session.mode === "explode" && (r.kind === "scene" || r.kind === "hatch" || r.kind === "profile" && Object.values(cadDocument.features).find(f=>f.output===r.dependentId)?.type === "extrude") && sourceResults(r.sourceId).length>1 && <option value={sourceResults(r.sourceId).join(",")}>All pieces of this source</option>}</select>
            {needsPortion(r) && <select aria-label={`Reference portion ${r.dependentId} ${r.sourceId}${slot}`} value={c.edge} onChange={e => change({edge:e.target.value})}><option value="">Choose reference portion</option>{c.result !== "" && path && referencePortions(r,path,false).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>}
            {r.kind === "construction" && r.elementKind === "intersection" && <select aria-label={`Reference branch ${r.dependentId} ${r.sourceId}`} value={c.branch ?? ""} onChange={e => change({branch:e.target.value === "" ? undefined : e.target.value as "positive"|"negative"})}><option value="">Keep saved branch</option><option value="positive">Positive along line</option><option value="negative">Negative along line</option></select>}
          </>}</div>;
        })}</fieldset>}
        {preview?.result.ok && references.filter(r => r.kind === "dimension").map(r => {
          const values = getCadPlanDimensionParams(preview.planId,r.dependentId);
          const display = (p: Record<string,unknown> | undefined) => { const d = p && resolveDimension(p); return d ? `${(d.unit === "rad" ? d.value*180/Math.PI : d.value).toFixed(2)}${d.unit === "rad" ? "°" : " mm"}` : "—"; };
          return <small key={referenceKey(r)}>{r.name}: {display(values?.before)} → {display(values?.after)}</small>;
        })}
      </>
      <p role="status">{message}</p><small>Green: result · dashed amber: replaced sources. Arcs retain their radius and curvature. Esc cancels; Enter applies.</small>
      <button type="button" disabled={!paths.length} onClick={() => props.onFrame((ghosts.current.length ? ghosts.current : draftGhostsRef.current).flatMap(p => p.points))}>Fit contour preview</button>
      <div><button type="submit" disabled={!interaction.canApply}>Apply contour edit</button><button type="button" disabled={pending} onClick={close}>Cancel contour edit</button></div>
    </form>
  </>;
}
