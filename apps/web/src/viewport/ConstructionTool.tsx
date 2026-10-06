import { DEFAULT_SNAP_PREFERENCES, snapCaption, type SnapPreferences } from "../precision/snapPreferences";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { constructionExpression, type CadConstructionDefinition } from "@agent-webcad/cad-document";
import type { CadCommand } from "@agent-webcad/cad-commands";
import { cadDocument } from "../state/cadDocument";
import { previewCadCommand, applyCadPlan, discardCadPlan, getCadPlanDrawingPaths, type CadPlanPreview } from "../state/documentPlans";
import { subscribeDocumentChanges } from "../state/documentSession";
import { getWorldDrawingGeometry } from "../precision/worldGeometry";
import { parsePointEntry } from "../precision/pointInput";
import { parseLength } from "../precision/units";
import { querySnap, type SnapEntity } from "../precision/snapEngine";
import { WORK_PLANES, planeToWorld, worldToPlane, intersectRayWithWorkPlane, type Vec3, type WorkPlaneId } from "../precision/workPlane";
import { clipLinearToCamera } from "./drawingRenderer";
import {commandInteraction} from "../state/commandInteraction";
import {CommandReview} from "../ui/CommandReview";
import {PrecisionField} from "../ui/PrecisionField";

export type ConstructionSession = { id: string; workPlane: WorkPlaneId; layerId: string; selectedIds: string[] };
type Operation = "point" | "infinite-line" | "ray" | CadConstructionDefinition["operation"];
type Props = { session: ConstructionSession; constructionVisible: boolean; snapEnabled: boolean; snapPreferences?: SnapPreferences; project: (point: Vec3) => [number, number]; getCanvas: () => HTMLCanvasElement | null; getCamera: () => THREE.Camera | null; onClose: () => void; onApplied: (ids: string[]) => void; onFrame:(points:Vec3[])=>void };
const operations: [Operation, string][] = [["point", "Independent point"], ["infinite-line", "Independent infinite line"], ["ray", "Independent ray"], ["segment", "Segment through two points"], ["line-through", "Infinite line through two points"], ["ray-through", "Ray through two points"], ["midpoint", "Midpoint of segment"], ["perpendicular-bisector", "Perpendicular bisector at midpoint"], ["intersection", "Intersection of line and circle / line"]];
type Source = { id: string; name: string; kind: string; points: Vec3[]; snap: SnapEntity };
type Ghost = { points: Vec3[]; kind: string };

export function ConstructionTool(props: Props) {
  const { session } = props;
  const [operation, setOperation] = useState<Operation>("point"), [first, setFirst] = useState("0,0"), [second, setSecond] = useState("100,0"), [height, setHeight] = useState("0");
  const [firstId, setFirstId] = useState(""), [secondId, setSecondId] = useState(""), [branch, setBranch] = useState<"positive" | "negative">("positive");
  const [name, setName] = useState(""), [construction, setConstruction] = useState(true), [pick, setPick] = useState<0 | 1>(0);
  const [preview, setPreview] = useState<CadPlanPreview | null>(null), [message, setMessage] = useState("Preparing construction…"), [formula, setFormula] = useState(""), [revision, setRevision] = useState(0), [pending, setPending] = useState(false);
  const [paths, setPaths] = useState<[number, number][][]>([]), [marker, setMarker] = useState<[number, number] | null>(null), [snapLabel, setSnapLabel] = useState("");
  const [reviewedKey,setReviewedKey]=useState<string>(),[inputError,setInputError]=useState("");
  const plan = useRef<string | null>(null), ghosts = useRef<Ghost[]>([]), hover = useRef<{ point: Vec3; id?: string } | null>(null), latest = useRef(props), applyRef = useRef<() => void>(() => {}), pendingRef = useRef(false);
  latest.current = props; pendingRef.current = pending;
  const literal = ["point", "infinite-line", "ray"].includes(operation), needsSecond = operation !== "point" && operation !== "midpoint";
  const sources: Source[] = Object.values(cadDocument.features).flatMap(feature => {
    const object = cadDocument.objects[feature.output], layer = object && cadDocument.layers[object.layerId];
    if (feature.type !== "drawing" || !object?.visible || layer?.visible === false || !props.constructionVisible && feature.params.construction || String(feature.params.workPlane ?? "XY") !== session.workPlane) return [];
    const world = getWorldDrawingGeometry(object, feature); if (!world?.planeAligned || !world.points) return [];
    return [{ id: object.id, name: object.name, kind: world.kind, points: world.points, snap: { objectId: object.id, kind: world.kind as SnapEntity["kind"], points: world.points, center: world.center, radius: world.radius, startAngle: world.startAngle, endAngle: world.endAngle, profileSegments: world.profileSegments } }];
  });
  const eligible = (slot: 0 | 1) => sources.filter(s => operation === "midpoint" || operation === "perpendicular-bisector" && slot === 0 ? s.kind === "line" : operation === "intersection" ? ["line", "infinite-line", "ray", "circle"].includes(s.kind) : s.kind === "point");
  const firstSources = eligible(0), secondSources = eligible(1);
  const draftKey=JSON.stringify([operation,first,second,height,firstId,secondId,branch,name,construction,revision,props.constructionVisible]);
  const interaction=commandInteraction({command:"Construction",draftKey,reviewedKey,preview,pending,targets:literal?[]:[firstId,...(needsSecond?[secondId]:[])].filter(Boolean),numericParameters:{first,second,height},inputError:reviewedKey===draftKey?inputError:undefined,missing:literal?[]:!firstId?["Choose the first saved source."]:needsSecond&&!secondId?["Choose the second saved source."]:[]});
  useEffect(() => {
    const choose = (values: Source[], except = "") => session.selectedIds.find(id => id !== except && values.some(s => s.id === id)) ?? values.find(s => s.id !== except)?.id ?? "";
    const a = choose(firstSources), b = operation === "perpendicular-bisector" ? secondSources.find(s => Object.values(cadDocument.features).some(f => f.output === s.id && f.construction?.operation === "midpoint" && f.construction.segmentId === a))?.id ?? choose(secondSources, a) : choose(secondSources, a);
    setFirstId(a); setSecondId(b); setPick(0);
    if (operation === "intersection") setConstruction(false);
  }, [operation]);
  useEffect(() => subscribeDocumentChanges(() => { if (plan.current) discardCadPlan(plan.current); plan.current = null; setPreview(null); setRevision(v => v + 1); }), []);
  useEffect(() => {
    const controller = new AbortController(); let localPlan: string | undefined;
    if (plan.current) discardCadPlan(plan.current); plan.current = null; setPreview(null); ghosts.current = [];
    setInputError("");
    let command: CadCommand;
    try {
      if (literal) {
        const a = parsePointEntry(first), b = parsePointEntry(second, a ?? undefined), elevation = parseLength(height);
        if (!a || needsSecond && !b || elevation === null) throw new Error("Enter U,V coordinates and plane elevation. Units: mm / cm / m / in; @ uses the first point.");
        const plane = { ...WORK_PLANES[session.workPlane], origin: WORK_PLANES[session.workPlane].normal.map(v => v * elevation) as Vec3 };
        const points = needsSecond ? [planeToWorld(a, plane), planeToWorld(b!, plane)] : [planeToWorld(a, plane)];
        const serial = Object.values(cadDocument.features).filter(f => f.type === "drawing" && f.params.kind === operation).length + 1;
        command = { type: "create-drawing", id: session.id, drawing: operation as "point" | "infinite-line" | "ray", params: { points, workPlane: session.workPlane, construction }, layerId: session.layerId, name: name.trim() || `${operation === "point" ? "Point" : operation === "ray" ? "Ray" : "Infinite line"} ${serial}` };
        setFormula(operation === "point" ? `point(${a.join(", ")})` : `${operation}(${a.join(", ")} → ${b!.join(", ")})`);
      } else {
        if (!firstSources.some(s => s.id === firstId) || needsSecond && !secondSources.some(s => s.id === secondId)) throw new Error("Choose the saved source objects in the list or pick them on the canvas.");
        const definition: CadConstructionDefinition = operation === "midpoint" ? { operation, segmentId: firstId } : operation === "perpendicular-bisector" ? { operation, segmentId: firstId, midpointId: secondId } : { operation: operation as "segment" | "line-through" | "ray-through" | "intersection", firstId, secondId, ...(operation === "intersection" ? { branch } : {}) } as CadConstructionDefinition;
        setFormula(constructionExpression(definition, id => cadDocument.objects[id]?.name ?? id));
        command = { type: "create-construction", id: session.id, definition, workPlane: session.workPlane, layerId: session.layerId, construction, name: name.trim() || undefined };
      }
    } catch (error) { const text=error instanceof Error ? error.message : String(error); setFormula(""); setMessage(text); setInputError(text); setReviewedKey(draftKey); return; }
    setMessage("Preparing exact preview…");
    const timer = setTimeout(() => {
      void previewCadCommand(command, { signal: controller.signal }).then(result => {
        localPlan = result.planId;
        if (controller.signal.aborted) { discardCadPlan(result.planId); return; }
        plan.current = result.planId; setPreview(result); setReviewedKey(draftKey);
        const data = result.result.ok && !result.stale ? getCadPlanDrawingPaths(result.planId, session.id) : undefined;
        const kind = operation === "point" || operation === "midpoint" || operation === "intersection" ? "point" : operation === "ray" || operation === "ray-through" ? "ray" : operation === "segment" ? "line" : "infinite-line";
        ghosts.current = data?.after ? [{ points: data.after, kind }] : [];
        setMessage(result.stale ? "Document changed; prepare again." : !result.result.ok ? result.result.reason ?? "Construction rejected." : literal ? "Green: exact result. Apply creates one object · one Undo." : `Green: derived result · ${operation === "midpoint" ? 1 : 2} saved inputs · follows source edits automatically.`);
      }).catch(error => { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : String(error)); });
    }, 100);
    return () => { clearTimeout(timer); controller.abort(); if (localPlan) discardCadPlan(localPlan); };
  }, [operation, first, second, height, firstId, secondId, branch, name, construction, revision, props.constructionVisible, session]);
  useEffect(() => {
    let frame: number, signature = "";
    const draw = () => {
      const nextPaths = ghosts.current.map(ghost => {
        const camera = latest.current.getCamera();
        const points = camera && ["infinite-line", "ray"].includes(ghost.kind) ? clipLinearToCamera(ghost.points.map(p => new THREE.Vector3(...p)), new THREE.Matrix4(), camera, ghost.kind === "ray").map(p => p.toArray() as Vec3) : ghost.points;
        return points.map(latest.current.project);
      });
      const nextMarker = hover.current ? latest.current.project(hover.current.point) : null;
      const hash = JSON.stringify([nextPaths, nextMarker]);
      if (hash !== signature) { signature = hash; setPaths(nextPaths); setMarker(nextMarker); }
      frame = requestAnimationFrame(draw);
    }; draw(); return () => cancelAnimationFrame(frame);
  }, []);
  function close() { props.onClose(); requestAnimationFrame(() => props.getCanvas()?.focus()); }
  async function apply() {
    if (!interaction.canApply || !preview || pendingRef.current) return;
    pendingRef.current = true; setPending(true);
    try { const result = await applyCadPlan(preview.planId); if (!result.ok) { setPreview(null); setMessage(result.reason ?? "Construction rejected."); return; } props.onApplied(result.createdIds); close(); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { pendingRef.current = false; setPending(false); }
  }
  applyRef.current = () => { void apply(); };
  useEffect(() => {
    const canvas = props.getCanvas(); if (!canvas) return;
    const onMove = (event: PointerEvent) => {
      if (pendingRef.current) return;
      const rect = canvas.getBoundingClientRect(), cursor: [number, number] = [event.clientX - rect.left, event.clientY - rect.top], camera = latest.current.getCamera(); if (!camera) return;
      if (literal) {
        const elevation = parseLength(height); if (elevation === null) return;
        const plane = { ...WORK_PLANES[session.workPlane], origin: WORK_PLANES[session.workPlane].normal.map(v => v * elevation) as Vec3 };
        const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(cursor[0] / rect.width * 2 - 1, -cursor[1] / rect.height * 2 + 1), camera);
        const raw = intersectRayWithWorkPlane(ray.ray.origin.toArray() as Vec3, ray.ray.direction.toArray() as Vec3, plane); if (!raw) return;
        const onPlane = (p: Vec3) => Math.abs(p.reduce((sum, v, i) => sum + (v - plane.origin[i]) * plane.normal[i], 0)) < 1e-6;
        const entities = sources.filter(s => s.points.every(onPlane)).map(s => s.snap);
        const snapped = latest.current.snapEnabled && !event.altKey ? querySnap({ point: raw, entities, plane, ...(latest.current.snapPreferences??DEFAULT_SNAP_PREFERENCES), project: props.project }) : null;
        const valid=snapped&&Number.isFinite(snapped.screenDistance)?snapped:null;
        hover.current = { point: valid?.point ?? raw }; setSnapLabel(valid?snapCaption(valid,cadDocument.objects[valid.objectId??""]?.name):"Coordinate"); return;
      }
      const hits = (pick === 0 ? firstSources : secondSources).map(source => {
        let points = source.points;
        if (["infinite-line", "ray"].includes(source.kind)) points = clipLinearToCamera(points.map(p => new THREE.Vector3(...p)), new THREE.Matrix4(), camera, source.kind === "ray").map(p => p.toArray() as Vec3);
        const path = points.map(props.project); let distance = Infinity, point = points[0];
        if (path.length === 1) distance = Math.hypot(path[0][0] - cursor[0], path[0][1] - cursor[1]);
        for (let i = 1; i < path.length; i++) {
          const a = path[i - 1], b = path[i], dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((cursor[0] - a[0]) * dx + (cursor[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
          const d = Math.hypot(a[0] + dx * t - cursor[0], a[1] + dy * t - cursor[1]);
          if (d < distance) { distance = d; point = points[i - 1].map((v, axis) => v + (points[i][axis] - v) * t) as Vec3; }
        }
        return { source, distance, point };
      }).filter(hit => hit.distance <= 12).sort((a, b) => a.distance - b.distance)[0];
      hover.current = hits ? { id: hits.source.id, point: hits.point } : null; setSnapLabel(hits ? hits.source.name : "Pick a saved source");
    };
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 || pendingRef.current) return;
      onMove(event); const hit = hover.current; if (!hit) return;
      if (literal) { const value = worldToPlane(hit.point, WORK_PLANES[session.workPlane]).map(v => Number(v.toFixed(9))).join(","); if (pick === 0) setFirst(value); else setSecond(value); }
      else if (hit.id) { if (pick === 0) setFirstId(hit.id); else setSecondId(hit.id); }
      if (pick === 0 && needsSecond) setPick(1);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.target instanceof Element && event.target.closest("[data-cad-editor], input, textarea, select, dialog[open]")) return;
      if (event.key === "Escape" && !pendingRef.current) { event.preventDefault(); close(); }
      else if (event.key === "Enter") { event.preventDefault(); applyRef.current(); }
    };
    canvas.addEventListener("pointermove", onMove); canvas.addEventListener("pointerdown", onDown); window.addEventListener("keydown", onKey, true);
    return () => { canvas.removeEventListener("pointermove", onMove); canvas.removeEventListener("pointerdown", onDown); window.removeEventListener("keydown", onKey, true); };
  }, [operation, pick, height, revision, props.constructionVisible, props.snapEnabled]);
  const sourceField = (slot: 0 | 1, label: string) => <label>{label}<select aria-label={slot === 0 ? "First construction source" : "Second construction source"} value={slot === 0 ? firstId : secondId} disabled={pending} onChange={e => slot === 0 ? setFirstId(e.target.value) : setSecondId(e.target.value)}><option value="">Choose source…</option>{(slot === 0 ? firstSources : secondSources).map(s => <option key={s.id} value={s.id}>{s.name} · {s.kind}</option>)}</select></label>;
  return <>
    <svg className="cad-contour-ghosts" aria-label="Construction preview" data-construction-preview-count={paths.length}>{paths.map((path, i) => path.length === 1 ? <g key={i}><circle data-construction-result-point cx={path[0][0]} cy={path[0][1]} r="5" fill="#61dcac" /><text x={path[0][0] + 9} y={path[0][1] - 9} fill="#8aefc4" fontSize="12">{name || "Result"}</text></g> : <polyline key={i} points={path.map(p => p.join(",")).join(" ")} fill="none" stroke="#61dcac" strokeWidth="2" />)}{marker && <g><circle cx={marker[0]} cy={marker[1]} r="7" fill="none" stroke="#ffc96f" strokeWidth="2" /><text x={marker[0] + 10} y={marker[1] + 18} fill="#ffc96f" fontSize="12">{snapLabel}</text></g>}</svg>
    <form className="cad-contour-tool cad-construction-tool" aria-label="Construction editor" data-construction-status={preview?.result.ok && !preview.stale ? "ready" : "invalid"} data-cad-editor="true" onSubmit={e => { e.preventDefault(); void apply(); }} onKeyDown={e => { e.stopPropagation(); if (e.key === "Escape" && !pending) { e.preventDefault(); close(); } }}>
      <div className="cad-tool-body">
      <strong>Construction · {session.workPlane}</strong>
      <label>Operation<select aria-label="Construction operation" value={operation} disabled={pending} onChange={e => setOperation(e.target.value as Operation)}>{operations.map(([op, label]) => <option key={op} value={op}>{label}</option>)}</select></label>
      <label>Name<input aria-label="Construction name" value={name} placeholder="Automatic name" disabled={pending} onChange={e => setName(e.target.value)} /></label>
      {literal ? <><PrecisionField label="First point U,V" aria-label="First construction coordinate" kind="coordinate" value={first} disabled={pending} onChange={setFirst}/>{needsSecond&&<PrecisionField label="Through point U,V" aria-label="Second construction coordinate" kind="coordinate" relativeTo={parsePointEntry(first)??undefined} value={second} disabled={pending} onChange={setSecond}/>}<PrecisionField label="Plane elevation" aria-label="Construction elevation" value={height} disabled={pending} onChange={setHeight}/><small>@ uses the first point. The through point defines direction, not the end of an infinite line or ray.</small></> : <>{sourceField(0, operation === "midpoint" || operation === "perpendicular-bisector" ? "Segment" : "First source")}{needsSecond && sourceField(1, operation === "perpendicular-bisector" ? "Midpoint" : "Second source")}</>}
      {operation === "intersection" && <><label>Intersection branch<select aria-label="Intersection branch" value={branch} disabled={pending} onChange={e => setBranch(e.target.value as typeof branch)}><option value="positive">Positive along line direction</option><option value="negative">Negative along line direction</option></select></label><small>Line–circle: two signed branches; at tangency both share one position. Each saved point keeps its branch when sources change. Line–line has one intersection.</small></>}
      <label>Construction geometry<input aria-label="Construction geometry" type="checkbox" checked={construction} disabled={pending} onChange={e => setConstruction(e.target.checked)} /></label>
      <div><button type="button" disabled={pending} aria-pressed={pick === 0} onClick={() => { setPick(0); props.getCanvas()?.focus(); }}>Pick first {literal ? "coordinate" : "source"}</button>{needsSecond && <button type="button" disabled={pending} aria-pressed={pick === 1} onClick={() => { setPick(1); props.getCanvas()?.focus(); }}>Pick second {literal ? "coordinate" : "source"}</button>}</div>
      {formula && <p aria-label="Construction definition">{formula}</p>}<p role="status">{message}</p>
      <CommandReview state={interaction} onInspect={ids=>props.onFrame(sources.filter(s=>ids.includes(s.id)).flatMap(s=>s.points))}/>
      <small>{construction && !props.constructionVisible ? "Construction geometry is hidden; enable Show construction after Apply. " : ""}Esc cancels; Enter applies. Derived objects are edited through their saved sources.</small>
      </div><div className="cad-tool-footer"><button type="button" disabled={!ghosts.current.length&&!firstId} onClick={()=>props.onFrame([...sources.filter(s=>[firstId,secondId].includes(s.id)).flatMap(s=>s.points),...ghosts.current.flatMap(g=>g.points)])}>Fit construction preview</button><div><button type="submit" disabled={!interaction.canApply}>Apply construction</button><button type="button" disabled={pending} onClick={close}>Cancel construction</button></div></div>
    </form>
  </>;
}
