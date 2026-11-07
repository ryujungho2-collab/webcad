import { useEffect, useRef, useState } from "react";
import { cadDocument } from "../state/cadDocument";
import { commandInteraction } from "../state/commandInteraction";
import { applyCadPlan, discardCadPlan, previewCadCommand, type CadPlanPreview } from "../state/documentPlans";
import { MATCH_VECTOR_FIELDS, planMatchVectorAppearance, type MatchVectorField } from "../state/matchVectorAppearance";
import { CommandReview } from "../ui/CommandReview";
import "../ui/modelViews.css";

type Props = {
  sourceId: string;
  visibleIds: ReadonlySet<string> | null;
  onClose: () => void;
  onApplied: () => void;
};

const fields = Object.keys(MATCH_VECTOR_FIELDS) as MatchVectorField[];
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

export function MatchVectorAppearanceDialog({ sourceId, visibleIds, onClose, onApplied }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const controller = useRef<AbortController | undefined>(undefined);
  const planId = useRef<string | undefined>(undefined);
  const [selectedFields, setSelectedFields] = useState<MatchVectorField[]>(["stroke"]);
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [review, setReview] = useState<{ key: string; preview: CadPlanPreview; match: ReturnType<typeof planMatchVectorAppearance> }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = JSON.stringify([sourceId, selectedFields, targetIds]);
  const interaction = commandInteraction({
    command: "Match vector appearance", targets: targetIds, draftKey: key,
    reviewedKey: review?.key, preview: review?.preview, pending: busy, inputError: error || undefined,
  });
  const candidates = cadDocument.rootObjects.filter(id => {
    const object = cadDocument.objects[id];
    return id !== sourceId && object?.visible && cadDocument.layers[object.layerId]?.visible
      && (!visibleIds || visibleIds.has(id));
  });

  useEffect(() => {
    dialog.current?.showModal();
    return () => {
      controller.current?.abort();
      if (planId.current) discardCadPlan(planId.current);
    };
  }, []);

  function clearReview() {
    if (planId.current) discardCadPlan(planId.current);
    planId.current = undefined;
    setReview(undefined);
    setError("");
  }

  async function prepare() {
    clearReview();
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    try {
      if (targetIds.some(id => !candidates.includes(id))) throw Error("A target is no longer available in this view.");
      const match = planMatchVectorAppearance(cadDocument, sourceId, targetIds, selectedFields);
      const preview = await previewCadCommand(match.command, { signal: request.signal });
      if (request.signal.aborted) {
        discardCadPlan(preview.planId);
        return;
      }
      planId.current = preview.planId;
      setReview({ key, preview, match });
    } catch (reason) {
      if (!request.signal.aborted) setError(message(reason));
    } finally {
      if (!request.signal.aborted) setBusy(false);
    }
  }

  async function apply() {
    if (!review || !interaction.canApply) return;
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    try {
      const result = await applyCadPlan(review.preview.planId, { signal: request.signal });
      if (!result.ok) {
        setError(result.reason ?? "Could not apply appearance. Preview again.");
        return;
      }
      onApplied();
      onClose();
    } catch (reason) {
      if (!request.signal.aborted) setError(message(reason));
    } finally {
      if (!request.signal.aborted) setBusy(false);
    }
  }

  return <dialog ref={dialog} className="model-views-dialog" aria-label="Match vector appearance"
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <h2>Match vector appearance</h2>
    <p>Source: {cadDocument.objects[sourceId]?.name ?? sourceId} · {sourceId}</p>
    <fieldset disabled={busy}>
      <legend>Properties to copy</legend>
      {fields.map(field => <label key={field}>
        <input type="checkbox" aria-label={`Copy ${MATCH_VECTOR_FIELDS[field]}`} checked={selectedFields.includes(field)}
          onChange={event => {
            clearReview();
            setSelectedFields(event.target.checked ? [...selectedFields, field] : selectedFields.filter(entry => entry !== field));
          }} />
        {MATCH_VECTOR_FIELDS[field]}
      </label>)}
    </fieldset>
    <fieldset disabled={busy} style={{ maxHeight: "28vh", overflow: "auto" }}>
      <legend>Targets</legend>
      {candidates.length === 0 && <p>No other visible objects.</p>}
      {candidates.map(id => {
        const object = cadDocument.objects[id];
        const layer = cadDocument.layers[object.layerId];
        return <label key={id}>
          <input type="checkbox" aria-label={`Match target ${id}`} checked={targetIds.includes(id)}
            onChange={event => {
              clearReview();
              setTargetIds(event.target.checked ? [...targetIds, id] : targetIds.filter(entry => entry !== id));
            }} />
          {object.name} · {layer.name}{layer.locked ? " (locked)" : ""} · {id}
        </label>;
      })}
    </fieldset>
    <CommandReview state={interaction} />
    {review?.preview.result.ok && <ul aria-label="Appearance changes">
      {review.match.rows.map(row => <li key={row.objectId}>{row.label} · {row.objectId}
        <ul>{selectedFields.map(field => <li key={field}>
          {MATCH_VECTOR_FIELDS[field]}: {field === "fill" && row.before.fillGradient ? "Gradient" : row.before[field] ?? "None"}
          {" → "}{review.match.style[field] ?? "None"}
        </li>)}</ul>
      </li>)}
    </ul>}
    <div className="model-view-actions">
      <button type="button" disabled={busy || !targetIds.length || !selectedFields.length} onClick={() => void prepare()}>Preview appearance match</button>
      <button type="button" disabled={!interaction.canApply} onClick={() => void apply()}>Apply appearance match</button>
      <button type="button" onClick={onClose}>Cancel appearance match</button>
    </div>
  </dialog>;
}
