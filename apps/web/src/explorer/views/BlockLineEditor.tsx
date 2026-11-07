import { useEffect, useMemo, useRef, useState } from "react";
import type { CadCommand } from "@agent-webcad/cad-commands";
import type { CadBlock, SketchPoint } from "@agent-webcad/cad-document";
import { editableBlockLines } from "../../precision/blockLineEdit";
import { parsePointEntry } from "../../precision/pointInput";
import { commandInteraction } from "../../state/commandInteraction";
import { applyCadPlan, discardCadPlan, getCadPlanBlockLineEdit, previewCadCommand, type CadPlanPreview } from "../../state/documentPlans";
import { CommandReview } from "../../ui/CommandReview";
import { PrecisionField } from "../../ui/PrecisionField";

type BlockUpdate = Extract<CadCommand, { type: "update-block" }>;
type LinePreview = NonNullable<ReturnType<typeof getCadPlanBlockLineEdit>>;

function LineComparison({ before, after }: LinePreview) {
  const x = [...before, ...after].map(point => point[0]);
  const y = [...before, ...after].map(point => point[1]);
  const left = Math.min(...x), top = Math.max(...y);
  const span = Math.max(Math.max(...x) - left, top - Math.min(...y));
  const path = (points: [SketchPoint, SketchPoint]) =>
    points.map(([u, v]) => `${8 + (u - left) / span * 84},${8 + (top - v) / span * 84}`).join(" ");
  return <div>
    <svg aria-label="Component line before and after" role="img" viewBox="0 0 100 100" width="100%" height="105">
      <polyline points={path(before)} fill="none" stroke="#a3b5c4" strokeDasharray="4 3" strokeWidth="2" />
      <polyline points={path(after)} fill="none" stroke="#36d9c5" strokeWidth="2" />
    </svg>
    <small>Dashed: before · Solid: proposed</small>
  </div>;
}

export function BlockLineEditor({ block, revision, instanceIds, onClose, onChange }: {
  block: CadBlock; revision: number; instanceIds: string[]; onClose: () => void; onChange: () => void;
}) {
  const lines = useMemo(() => editableBlockLines(block), [block]);
  const [memberId, setMemberId] = useState(lines[0]?.id ?? "");
  const [endpoint, setEndpoint] = useState<0 | 1>(1);
  const [pointText, setPointText] = useState("");
  const [request, setRequest] = useState<{ key: string; command: BlockUpdate } | null>(null);
  const [plan, setPlan] = useState<{ key: string; preview: CadPlanPreview; lines?: LinePreview } | null>(null);
  const [error, setError] = useState("");
  const [applying, setApplying] = useState(false);
  const applyAbort = useRef<AbortController | null>(null);
  const line = lines.find(entry => entry.id === memberId);
  const point = parsePointEntry(pointText);
  const key = JSON.stringify([block.id, memberId, endpoint, pointText, revision]);
  const currentPlan = plan?.key === key ? plan : null;
  const reviewing = request?.key === key && !currentPlan && !error;
  const inputError = !line ? "Choose an existing, uniquely identified planar line."
    : pointText && !point ? "Enter two block-local coordinates, such as 25mm,10mm." : undefined;
  const interaction = commandInteraction({ command: "Edit component line", targets: [block.id, ...instanceIds],
    draftKey: key, reviewedKey: currentPlan?.key, preview: currentPlan?.preview,
    inputError: inputError || error || undefined, pending: applying, visualReady: !!currentPlan?.lines });

  useEffect(() => {
    if (!request || request.key !== key) return;
    const controller = new AbortController();
    let planId: string | undefined;
    void previewCadCommand(request.command, { signal: controller.signal }).then(preview => {
      planId = preview.planId;
      if (controller.signal.aborted) {
        discardCadPlan(planId);
        return;
      }
      setPlan({ key: request.key, preview, lines: getCadPlanBlockLineEdit(planId) });
    }).catch(reason => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not review the line edit.");
    });
    return () => {
      controller.abort();
      if (planId) discardCadPlan(planId);
    };
  }, [request, key]);
  useEffect(() => () => applyAbort.current?.abort(), []);

  function clearReview() {
    setRequest(null);
    setPlan(null);
    setError("");
  }

  async function apply() {
    if (!interaction.canApply || !currentPlan) return;
    const controller = new AbortController();
    applyAbort.current = controller;
    setApplying(true);
    try {
      const result = await applyCadPlan(currentPlan.preview.planId, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!result.ok) {
        setError(result.reason ?? "The component changed. Review the line edit again.");
        return;
      }
      onChange();
      onClose();
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not apply the line edit.");
    } finally {
      applyAbort.current = null;
      if (!controller.signal.aborted) setApplying(false);
    }
  }

  return <section className="property-section" aria-label="Component line editor">
    <strong>Edit line in {block.name}</strong>
    <p className="property-hint">Coordinates are local to the {block.workPlane} definition plane. This updates {instanceIds.length} directly linked placements.</p>
    <label>Line member<select aria-label="Component line member" value={memberId} disabled={applying}
      onChange={event => { setMemberId(event.target.value); setPointText(""); clearReview(); }}>
      {!line && <option value={memberId}>Choose a line</option>}
      {lines.map(entry => <option key={entry.id} value={entry.id}>{entry.id}</option>)}
    </select></label>
    <label>Endpoint<select aria-label="Component line endpoint" value={endpoint} disabled={applying}
      onChange={event => { setEndpoint(event.target.value === "0" ? 0 : 1); setPointText(""); clearReview(); }}>
      <option value="0">Start</option><option value="1">End</option>
    </select></label>
    {line && <small>Current endpoint: {line.points[endpoint].map(value => Number(value.toPrecision(10))).join(", ")} mm</small>}
    <PrecisionField label="New endpoint" aria-label="Component endpoint coordinates" kind="coordinate" value={pointText} disabled={applying}
      onChange={value => { setPointText(value); clearReview(); }} />
    <CommandReview state={interaction} />
    {currentPlan?.lines && <LineComparison {...currentPlan.lines} />}
    <div className="property-actions">
      <button type="button" disabled={!line || !point || reviewing || applying} onClick={() => {
        if (!line || !point) return;
        setPlan(null);
        setError("");
        setRequest({ key, command: { type: "update-block", blockId: block.id, lineEdit: { memberId, endpoint, point } } });
      }}>Review component line edit</button>
      <button type="button" disabled={!interaction.canApply} onClick={() => void apply()}>Apply component line edit</button>
      <button type="button" disabled={applying} onClick={onClose}>Cancel component line edit</button>
    </div>
  </section>;
}
