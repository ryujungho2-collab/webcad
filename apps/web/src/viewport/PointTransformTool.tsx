import { DEFAULT_SNAP_PREFERENCES, snapCaption, SNAP_SYMBOLS, type SnapPreferences } from "../precision/snapPreferences";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { cadDocument } from "../state/cadDocument";
import { isCadKeyboardBlocked } from "../input/shortcutRouter";
import { parseAngle, parseLength } from "../precision/units";
import { applyPolarLocks, emptyPolarLocks, resolvePointInput } from "../precision/pointInput";
import { querySnap, type SnapEntity, type SnapResult } from "../precision/snapEngine";
import { getWorldDrawingGeometry } from "../precision/worldGeometry";
import { worldDraftingGeometry } from "../precision/draftingGeometry";
import { intersectRayWithWorkPlane, planeToWorld, worldToPlane, WORK_PLANES, type Vec3, type WorkPlaneId } from "../precision/workPlane";
import type { PointTransformMode } from "../state/pointTransformCommands";

export type PointTransformSession = { mode: PointTransformMode; sequence: number; ids: string[]; revision: number };
export type PointTransformResult = { ok: boolean; reason?: string };
type Props = { session: PointTransformSession; planeId: WorkPlaneId; snapEnabled: boolean; snapPreferences?: SnapPreferences; orthoEnabled: boolean;
  constructionVisible?: boolean;
  getCanvas: () => HTMLCanvasElement | null; getCamera: () => THREE.Camera | null; getControls: () => OrbitControls | null;
  onCommit: (base: Vec3, target: Vec3, angle: number) => Promise<PointTransformResult>; onCancel: () => void };
type Marker = { x: number; y: number; type: SnapResult["type"] };

export function PointTransformTool(props: Props) {
  const latest = useRef(props); latest.current = props;
  const refreshPreview = useRef(() => {});
  const [readout, setReadout] = useState("");
  const [paths, setPaths] = useState<string[]>([]);
  const [baseMarker, setBaseMarker] = useState<[number, number] | null>(null);
  const [snapMarker, setSnapMarker] = useState<Marker | null>(null);
  const [stage, setStage] = useState<"base" | "target">("base");
  const [placements, setPlacements] = useState(0);
  const [working, setWorking] = useState(false);
  useEffect(() => {
    const canvas = props.getCanvas(), controls = props.getControls();
    if (!canvas) return;
    // Left clicks belong to this tool; middle/wheel navigation remains live.
    // Return keyboard ownership from the toolbar/editor to the canvas.
    canvas.tabIndex = 0; canvas.focus({ preventScroll: true });
    const plane = WORK_PLANES[props.planeId], mode = props.session.mode;
    let base: Vec3 | null = null, hover: Vec3 | null = null, buffer = "", field: "length" | "angle" = "length";
    let locks = emptyPolarLocks(), pending = false, disposed = false, count = 0, suppressed = false;
    let pointer: { clientX: number; clientY: number } | null = null, activeSnap: SnapResult | null = null;
    let entityRevision = -1, cachedEntities: SnapEntity[] = [];
    function entities(): SnapEntity[] {
      if (entityRevision === cadDocument.revision) return cachedEntities;
      cachedEntities = Object.values(cadDocument.features).flatMap((feature) => {
        const object = cadDocument.objects[feature.output], layer = object && cadDocument.layers[object.layerId];
        const world = object?.visible && layer?.visible && feature.type === "drawing" && (latest.current.constructionVisible !== false || !feature.params.construction) ? getWorldDrawingGeometry(object, feature) : null;
        return world?.workPlane === props.planeId && world.planeAligned ? [{ objectId: object.id, kind: world.kind, points: world.points, center: world.center, radius: world.radius, startAngle: world.startAngle, endAngle: world.endAngle, spline:world.spline,ellipse:world.ellipse,profileSegments: world.profileSegments }] : [];
      });
      entityRevision = cadDocument.revision; return cachedEntities;
    }
    const sourcePaths: Vec3[][] = entities().filter(entity => props.session.ids.includes(entity.objectId)).map(entity => {
      if ((entity.kind === "circle" || entity.kind === "arc") && entity.center && entity.radius) {
        const center = worldToPlane(entity.center, plane), start = entity.startAngle ?? 0, end = entity.endAngle ?? Math.PI * 2;
        return Array.from({ length: 65 }, (_, index) => planeToWorld([center[0] + entity.radius! * Math.cos(start + (end - start) * index / 64), center[1] + entity.radius! * Math.sin(start + (end - start) * index / 64)], plane));
      }
      const points = entity.points ?? [], feature = Object.values(cadDocument.features).find(f => f.output === entity.objectId);
      return entity.kind === "rectangle" || entity.kind === "polyline" && feature?.params.closed ? [...points, points[0]].filter(Boolean) : points;
    });
    for (const id of props.session.ids) {
      const object = cadDocument.objects[id], feature = Object.values(cadDocument.features).find(f => f.output === id);
      if (object && feature?.type === "drafting") {
        const data = worldDraftingGeometry(cadDocument, object, feature);
        sourcePaths.push(...data.lines.map(line => line.closed ? [...line.points, line.points[0]] : line.points), ...data.texts.map(text => [text.point, [text.point[0] + text.height * text.text.length * 0.5, text.point[1], text.point[2]] as Vec3]));
      }
    }
    const project = (point: Vec3): [number, number] => {
      const p = new THREE.Vector3(...point).project(latest.current.getCamera()!);
      return [(p.x + 1) * canvas!.clientWidth / 2, (1 - p.y) * canvas!.clientHeight / 2];
    };
    const angleOf = (point: Vec3) => {
      const a = worldToPlane(base!, plane), b = worldToPlane(point, plane);
      return Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
    };
    function target(): Vec3 | null {
      if (!base) return hover;
      if (mode !== "rotate") {
        const value = resolvePointInput(buffer, worldToPlane(base, plane), hover ? worldToPlane(hover, plane) : undefined, locks, field);
        if (value) return planeToWorld(value, plane);
        if (buffer.trim()) return null;
      }
      return hover ?? base;
    }
    function update() {
      const point = target();
      if (base && (mode === "rotate" && buffer.trim() && parseAngle(buffer) === null || !point)) {
        setPaths([]); setSnapMarker(null);
        setReadout(`Invalid ${mode === "rotate" ? "angle" : field} input · ${buffer} · Revise the input or Esc to clear.`);
        return;
      }
      const shownSnap = activeSnap && !buffer && point && Math.hypot(...point.map((v, i) => v - activeSnap!.point[i])) <= 1e-6 ? activeSnap : null;
      const snapped = shownSnap ? project(shownSnap.point) : null;
      setSnapMarker(snapped ? { x: snapped[0], y: snapped[1], type: shownSnap!.type } : null);
      setBaseMarker(base ? project(base) : null); setStage(base ? "target" : "base");
      const snapText = suppressed ? "Snap suppressed" : !latest.current.snapEnabled ? "Snap off" : shownSnap ? snapCaption(shownSnap,cadDocument.objects[shownSnap.objectId??""]?.name) : "Free";
      const navigation = "MMB pan · wheel scroll · Ctrl+wheel zoom · F3 snap · F8 ortho · Alt suppress";
      if (!base) {
        setReadout(`${mode.toUpperCase()} · pick ${mode === "rotate" ? "centre" : "base point"} or enter x,y · ${buffer} · ${snapText} · ${navigation} · Esc exits`);
        setPaths([]); return;
      }
      const degrees = mode === "rotate" ? parseAngle(buffer) ?? angleOf(point!) : 0;
      const delta = new THREE.Vector3(...point!).sub(new THREE.Vector3(...base));
      const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...plane.normal), degrees * Math.PI / 180);
      setPaths(sourcePaths.map(points => points.map(p => {
        const v = new THREE.Vector3(...p);
        if (mode === "rotate") v.sub(new THREE.Vector3(...base!)).applyQuaternion(rotation).add(new THREE.Vector3(...base!)); else v.add(delta);
        return project(v.toArray() as Vec3).map(value => value.toFixed(1)).join(",");
      }).join(" ")));
      const position = worldToPlane(point!, plane).map(v => v.toFixed(3)).join(", ");
      const input = mode === "rotate" ? `${degrees.toFixed(2)}° from plane X` : `target ${position} mm · length ${locks.length ?? "free"} · angle ${locks.angle ?? "free"} · Tab locks ${field}`;
      const repeat = mode === "copy" ? ` · ${count} placed · next target uses the same base · Enter finishes` : "";
      setReadout(`${mode.toUpperCase()} · ${input} · ${buffer} · ${snapText}${repeat} · ${navigation} · Esc backs up`);
    }
    function resolve(event: { clientX: number; clientY: number }): Vec3 | null {
      const camera = latest.current.getCamera(); if (!camera) return null;
      const rect = canvas!.getBoundingClientRect(), ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height * 2 - 1)), camera);
      const raw = intersectRayWithWorkPlane(ray.ray.origin.toArray() as Vec3, ray.ray.direction.toArray() as Vec3, plane);
      if (!raw) return null;
      activeSnap = latest.current.snapEnabled && !suppressed ? querySnap({ point: raw, referencePoint: base ?? undefined, entities: entities(), plane, ...(latest.current.snapPreferences??DEFAULT_SNAP_PREFERENCES), project }) : null;
      const next = activeSnap?.point ?? raw;
      if (!base || mode === "rotate") return next;
      const start = worldToPlane(base, plane), end = worldToPlane(next, plane);
      const orthogonal: [number, number] = latest.current.orthoEnabled
        ? Math.abs(end[0] - start[0]) >= Math.abs(end[1] - start[1]) ? [end[0], start[1]] : [start[0], end[1]]
        : end;
      return planeToWorld(applyPolarLocks(start, orthogonal, locks), plane);
    }
    function refresh() { if (disposed || pending) return; if (pointer) hover = resolve(pointer); update(); }
    async function finish(point: Vec3, angle: number) {
      if (!base || pending) return;
      pending = true; setWorking(true);
      try {
        const result = await latest.current.onCommit(base, point, angle);
        if (disposed) return;
        if (result.ok && mode === "copy") {
          count++; setPlacements(count); buffer = ""; locks = emptyPolarLocks(); field = "length";
          hover = point; activeSnap = null; update();
        } else if (!result.ok) setReadout(`${result.reason ?? "Operation rejected."} · Revise the input or Esc to back up.`);
      } catch (error) {
        if (!disposed) setReadout(`${error instanceof Error ? error.message : "Operation failed."} · Esc to back up.`);
      } finally { pending = false; if (!disposed) setWorking(false); }
    }
    const move = (event: PointerEvent) => { if (pending) return; pointer = event; suppressed = event.altKey; refresh(); };
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || pending) return;
      event.preventDefault(); canvas!.focus({ preventScroll: true }); pointer = event; suppressed = event.altKey;
      const point = resolve(event); if (!point) return;
      if (!base) { base = point; hover = point; buffer = ""; update(); }
      else {
        hover = point;
        const exact = target(), angle = mode === "rotate" && buffer.trim() ? parseAngle(buffer) : mode === "rotate" ? angleOf(point) : 0;
        if (!exact || angle === null) { update(); return; }
        void finish(exact, angle);
      }
    };
    const key = (event: KeyboardEvent) => {
      if (isCadKeyboardBlocked(event.target, event.key) || event.ctrlKey || event.metaKey || pending) return;
      if (event.key === "Alt") { event.preventDefault(); suppressed = true; refresh(); return; }
      if (event.altKey) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (buffer || locks.length !== null || locks.angle !== null) { buffer = ""; locks = emptyPolarLocks(); field = "length"; refresh(); }
        else if (base && !count) { base = null; hover = null; update(); }
        else latest.current.onCancel();
        return;
      }
      if (event.key === "Backspace") { event.preventDefault(); buffer = buffer.slice(0, -1); update(); return; }
      if (event.key === "Tab" && !event.ctrlKey && !event.metaKey && !event.altKey && base && mode !== "rotate") {
        event.preventDefault();
        if (event.shiftKey) locks = emptyPolarLocks();
        else {
          const parsed = field === "length" ? parseLength(buffer) : parseAngle(buffer);
          if (buffer && (parsed === null || field === "length" && parsed < 0)) { setReadout(`Invalid ${field}. Enter a value with units or Esc to clear input.`); return; }
          if (parsed !== null) locks[field] = parsed;
          field = field === "length" ? "angle" : "length";
        }
        buffer = ""; refresh(); return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        if (mode === "copy" && count && !buffer && locks.length === null && locks.angle === null) { latest.current.onCancel(); return; }
        if (mode === "rotate" && base) {
          const angle = parseAngle(buffer);
          if (angle !== null) void finish(base, angle); else setReadout("Enter a rotation angle, e.g. 90deg, or pick a direction from plane X.");
          return;
        }
        const value = resolvePointInput(buffer, base ? worldToPlane(base, plane) : undefined, hover ? worldToPlane(hover, plane) : undefined, locks, field);
        if (!value) { setReadout("Enter x,y, @dx,dy or distance<angle with units. Esc clears input."); return; }
        const point = planeToWorld(value, plane);
        if (!base) { base = point; hover = point; buffer = ""; activeSnap = null; update(); } else void finish(point, 0);
        return;
      }
      if (/^[0-9a-zA-Z.°<,@#+\- ]$/.test(event.key)) { event.preventDefault(); buffer += event.key; update(); }
    };
    const release = (event: KeyboardEvent) => { if (event.key === "Alt") { suppressed = false; refresh(); } };
    const blur = () => { suppressed = false; refresh(); };
    refreshPreview.current = refresh; update();
    canvas.addEventListener("pointermove", move); canvas.addEventListener("pointerdown", down);
    window.addEventListener("keydown", key, true); window.addEventListener("keyup", release, true); window.addEventListener("blur", blur);
    controls?.addEventListener("change", refresh);
    const observer = new ResizeObserver(refresh); observer.observe(canvas);
    return () => {
      disposed = true; refreshPreview.current = () => {}; observer.disconnect(); controls?.removeEventListener("change", refresh);
      canvas.removeEventListener("pointermove", move); canvas.removeEventListener("pointerdown", down);
      window.removeEventListener("keydown", key, true); window.removeEventListener("keyup", release, true); window.removeEventListener("blur", blur);
    };
  }, [props.session.sequence, props.planeId]);
  useEffect(() => { refreshPreview.current(); }, [props.snapEnabled, props.orthoEnabled, props.snapPreferences]);
  return <>
    <svg className="point-transform-preview" aria-hidden="true">
      {paths.map((points, index) => <polyline key={index} points={points} />)}
      {baseMarker && <circle className="point-base-marker" cx={baseMarker[0]} cy={baseMarker[1]} r="5" />}
      {snapMarker && <g data-point-snap={snapMarker.type} transform={`translate(${snapMarker.x},${snapMarker.y})`}><rect x="-5" y="-5" width="10" height="10" /><text x="12" y="-10">{SNAP_SYMBOLS[snapMarker.type]} {snapMarker.type}</text></g>}
    </svg>
    <div className="cad-tool-readout point-operation-readout" role="status" data-point-stage={stage} data-point-mode={props.session.mode}>
      <span>{readout}</span>
      {props.session.mode === "copy" && placements > 0 && <button type="button" disabled={working} onClick={props.onCancel}>Finish copy</button>}
      <button type="button" disabled={working} onClick={props.onCancel}>Cancel point operation</button>
    </div>
  </>;
}
