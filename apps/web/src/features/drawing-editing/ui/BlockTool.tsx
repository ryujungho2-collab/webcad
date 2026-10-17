import { requestProjectFrame as requestAnimationFrame, cancelProjectFrame as cancelAnimationFrame } from "../../../app/projectActivity";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CadCommand } from "@agent-webcad/cad-commands";
import { cadDocument } from "../../../state/cadDocument";
import { previewCadCommand, applyCadPlan, discardCadPlan, getCadPlanDrawingPaths, type CadPlanPreview } from "../../../state/documentPlans";
import { subscribeDocumentChanges } from "../../../state/documentSession";
import { commandInteraction } from "../../../state/commandInteraction";
import { disbandBlockMembers, type DisbandedMember } from "../geometry/blockDisband";
import { exactDrawingContour, segmentPoint } from "../geometry/contourEditing";
import type { Vec3 } from "../../../precision/workPlane";
import type { BlockToolProps } from "../contracts";

type Ghost = { points: Vec3[]; closed: boolean; removed: boolean };

function outlineOf(member: DisbandedMember): { points: Vec3[]; closed: boolean } | null {
  if (member.type !== "drawing" || !member.drawing || ["point", "infinite-line", "ray"].includes(member.drawing)) return null;
  try {
    const path = exactDrawingContour(
      { id: "ghost", geometryId: "ghost", name: "ghost", visible: true, layerId: member.layerId, transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
      { id: "ghost", type: "drawing", inputs: [], output: "ghost", params: member.params },
    );
    const points = path.segments.flatMap(s => Array.from({ length: s.kind === "arc" ? 33 : 2 }, (_, i) => segmentPoint(s, i / (s.kind === "arc" ? 32 : 1), path.workPlane)));
    return { points, closed: path.closed };
  } catch { return null; }
}

export function BlockTool(props: BlockToolProps) {
  const { session } = props;
  const [recursive, setRecursive] = useState(false);
  const [preview, setPreview] = useState<CadPlanPreview | null>(null), [message, setMessage] = useState("Preparing exact preview…"), [pending, setPending] = useState(false), [revision, setRevision] = useState(0);
  const [paths, setPaths] = useState<{ points: string; removed: boolean }[]>([]);
  const [projectedPlan, setProjectedPlan] = useState<string | null>(null);
  const [reviewedKey, setReviewedKey] = useState<string>();
  const draftKey = JSON.stringify([session.objectId, recursive, revision, session.id]);
  const members = useMemo(() => {
    try { return { ok: true as const, members: disbandBlockMembers(cadDocument, session.objectId, recursive) }; }
    catch (error) { return { ok: false as const, reason: error instanceof Error ? error.message : String(error) }; }
  }, [session.objectId, recursive, revision]);
  const interaction = commandInteraction({ command: "Disband block", draftKey, reviewedKey, preview, pending, targets: [session.objectId], inputError: members.ok ? undefined : members.reason, visualReady: projectedPlan === preview?.planId });
  const plan = useRef<string | null>(null), ghosts = useRef<Ghost[]>([]), latest = useRef(props), applyRef = useRef<() => void>(() => {}), pendingRef = useRef(false);
  latest.current = props; pendingRef.current = pending;
  const draftGhosts = (members.ok ? members.members : []).flatMap(member => {
    const outline = outlineOf(member);
    return outline ? [{ closed: outline.closed, removed: false, points: outline.points }] : [];
  });
  const labelPoints = (members.ok ? members.members : []).map(member => {
    const outline = outlineOf(member);
    if (outline) { const p = props.project(outline.points[Math.floor(outline.points.length / 2)]); return { x: p[0] + 8, y: p[1] - 8 }; }
    if (member.type === "drafting" && Array.isArray(member.params.point)) { const p = props.project(member.params.point as Vec3); return { x: p[0] + 8, y: p[1] - 8 }; }
    return null;
  });
  const draftGhostsRef = useRef(draftGhosts); draftGhostsRef.current = draftGhosts;
  useEffect(() => subscribeDocumentChanges(() => { if (plan.current) discardCadPlan(plan.current); plan.current = null; setPreview(null); setRevision(v => v + 1); }), []);
  useEffect(() => {
    const controller = new AbortController(); let localPlan: string | undefined;
    if (plan.current) discardCadPlan(plan.current); plan.current = null; setPreview(null); ghosts.current = [];
    if (!members.ok) { setMessage(members.reason); return; }
    const command: CadCommand = { type: "explode-block", objectId: session.objectId, recursive };
    setMessage("Preparing exact preview…");
    const timer = setTimeout(() => {
      void previewCadCommand(command, { signal: controller.signal }).then(result => {
        localPlan = result.planId;
        if (controller.signal.aborted) { discardCadPlan(result.planId); return; }
        plan.current = result.planId; setPreview(result); setReviewedKey(draftKey);
        setMessage(result.stale ? "Document changed; preparing again…" : !result.result.ok ? result.result.reason ?? "Edit rejected." : `1 instance → ${result.result.createdIds.length} standalone object${result.result.createdIds.length > 1 ? "s" : ""} · one Undo`);
        ghosts.current = result.result.ok && !result.stale ? result.changes.flatMap<Ghost>(change => {
          const data = getCadPlanDrawingPaths(result.planId, change.objectId);
          if (!data) return [];
          return data.after ? [{ points: data.after, closed: data.afterClosed, removed: false }] : data.before ? [{ points: data.before, closed: data.beforeClosed, removed: true }] : [];
        }) : [];
      }).catch(e => { if (!controller.signal.aborted) setMessage(e instanceof Error ? e.message : String(e)); });
    }, 120);
    return () => { clearTimeout(timer); controller.abort(); if (localPlan) discardCadPlan(localPlan); };
  }, [draftKey]);
  useEffect(() => {
    let frame: number, previous = "";
    const draw = () => {
      const paths = (ghosts.current.length ? ghosts.current : draftGhostsRef.current).map(ghost => {
        const points = ghost.closed ? [...ghost.points, ghost.points[0]] : ghost.points;
        return { points: points.map(p => latest.current.project(p).join(",")).join(" "), removed: ghost.removed };
      });
      const signature = JSON.stringify([paths, plan.current]);
      if (signature !== previous) { previous = signature; setPaths(paths); setProjectedPlan(plan.current); }
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
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.target instanceof Element && event.target.closest("[data-cad-editor], input, textarea, select, dialog[open]")) return;
      if (event.key === "Escape" && !pendingRef.current) { event.preventDefault(); close(); }
      else if (event.key === "Enter") { event.preventDefault(); applyRef.current(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [session]);
  const instance = cadDocument.objects[session.objectId];
  return <>
    <svg className="cad-contour-ghosts" aria-label="Block disband preview" data-block-preview-count={paths.filter(p => !p.removed).length}>{paths.map((path, i) => <polyline key={i} points={path.points} fill="none" stroke={path.removed ? "#ffb282" : "#61dcac"} strokeWidth={path.removed ? 3 : 2} strokeDasharray={path.removed ? "5 5" : undefined} />)}{labelPoints.map((p, i) => p && <text key={`result-${i}`} data-block-result={i} x={p.x} y={p.y} fill="#61dcac">Result {i + 1}</text>)}</svg>
    <form className="cad-contour-tool" data-cad-editor="true" data-block-generation={preview?.baseVersion.generation} aria-label="Block disband editor" onSubmit={e => { e.preventDefault(); void apply(); }} onKeyDown={e => { e.stopPropagation(); if (e.key === "Escape" && !pending) { e.preventDefault(); close(); } }}>
      <strong>Disband block instance</strong>
      <small>{instance ? `'${instance.name}'` : "The instance"} becomes standalone drawings and text on its members' layers. The definition and other instances stay intact.</small>
      <label><input type="checkbox" aria-label="Disband nested blocks recursively" checked={recursive} disabled={pending} onChange={e => setRecursive(e.target.checked)} /> Disband nested blocks recursively</label>
      {members.ok && <ul>{members.members.map((member, i) => <li key={i}>Result {i + 1} · {String(member.params.kind)}{member.params.kind === "block" ? ` → ${(cadDocument.blocks?.[String(member.params.blockId)]?.name ?? member.params.blockId)}` : ""} · {cadDocument.layers[member.layerId]?.name ?? member.layerId}</li>)}</ul>}
      <p role="status">{message}</p><small>Green: restored members. Nested instances stay placed unless recursive disband is checked. Esc cancels; Enter applies.</small>
      <button type="button" disabled={!draftGhosts.length && !paths.length} onClick={() => props.onFrame((ghosts.current.length ? ghosts.current : draftGhostsRef.current).flatMap(p => p.points))}>Fit disband preview</button>
      <div><button type="submit" disabled={!interaction.canApply}>Apply block disband</button><button type="button" disabled={pending} onClick={close}>Cancel block disband</button></div>
    </form>
  </>;
}
