import { useState } from "react";
import type { Sketch, SketchConstraint, SketchPointRef } from "@agent-webcad/cad-document";
import { dispatchCadCommand } from "../state/dispatchCadCommand";
import { sketchPoint } from "../precision/sketchSolver";
import { parseAngle, parseLength } from "../precision/units";
import type { TopologySelectionRef } from "../state/selection";

type Props = { sketch: Sketch; selectedObjectIds: string[]; selectedSubObjects: TopologySelectionRef[]; onDocumentChange: () => void };
type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never;

export function SketchInspector({ sketch, selectedObjectIds, selectedSubObjects, onDocumentChange }: Props) {
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const geometry = sketch.geometry.filter((entity) => selectedObjectIds.includes(entity.id));
  const controls: SketchPointRef[] = selectedSubObjects.filter((ref) => ref.kind === "drawing-control" && geometry.some((entity) => entity.id === ref.objectId))
    .map((ref) => ({ geometryId: ref.objectId, pointId: ref.topologyId }));
  const first = geometry[0];
  const point = (ref: SketchPointRef) => sketchPoint(sketch.geometry.find((entity) => entity.id === ref.geometryId)!, ref.pointId);
  const distance = (a: SketchPointRef, b: SketchPointRef) => { const p = point(a)!, q = point(b)!; return Math.hypot(p[0] - q[0], p[1] - q[1]); };
  async function send(command: Parameters<typeof dispatchCadCommand>[0]) {
    try {
      const result = await dispatchCadCommand(command) as { accepted?: boolean; reason?: string } | undefined;
      if (result?.accepted === false) setError(result.reason ?? "Constraint rejected.");
      else { setError(""); onDocumentChange(); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Invalid sketch command."); }
  }
  const add = (constraint: WithoutId<SketchConstraint>) => void send({ type: "add-sketch-constraint", sketchId: sketch.id, constraint: { ...constraint, id: `constraint-${crypto.randomUUID()}` } as SketchConstraint });
  let pair = controls.length === 2 ? controls : null;
  if (!pair && first?.kind === "line" && geometry.length === 1) pair = [{ geometryId: first.id, pointId: first.startId }, { geometryId: first.id, pointId: first.endId }];
  const dimensionLabel = (constraint: SketchConstraint) => constraint.kind === "distance" ? "Distance" : constraint.kind === "radius" ? "Radius" : constraint.kind === "diameter" ? "Diameter" : "Angle";
  async function commitDimension(constraint: SketchConstraint) {
    if (!("value" in constraint) || typeof constraint.value !== "number") return;
    const draft = drafts[constraint.id];
    if (draft === undefined) return;
    const parsed = constraint.kind === "angle" ? parseAngle(draft) : parseLength(draft);
    if (parsed === null) { setError("Enter a valid dimension value."); return; }
    const value = constraint.kind === "angle" ? parsed * Math.PI / 180 : parsed;
    if (Math.abs(value - constraint.value) > 1e-9) await send({ type: "set-sketch-dimension", sketchId: sketch.id, constraintId: constraint.id, value });
    setDrafts((current) => { const next = { ...current }; delete next[constraint.id]; return next; });
  }
  return <div className="properties-content" data-testid="sketch-inspector">
    <section className="property-section"><h3>Sketch · {sketch.workPlane}</h3>
      <div className="property-row"><span>Entities</span><strong>{sketch.geometry.length}</strong></div>
      <div className="property-row"><span>Selection</span><strong>{geometry.length} · {controls.length} points</strong></div>
      <div className="property-row"><span>Status</span><strong>{sketch.solveState.status === "fully-constrained" ? "Fully constrained" : `${sketch.solveState.degreesOfFreedom} DOF`}</strong></div>
      {error && <div className="empty-panel" role="alert">{error}</div>}
    </section>
    <section className="property-section"><h3>Constraints</h3>
      {pair && <div className="sketch-actions">
        {pair[0].geometryId !== pair[1].geometryId && <button type="button" onClick={() => add({ kind: "coincident", first: pair![0], second: pair![1] })}>Coincident</button>}
        <button type="button" onClick={() => add({ kind: "horizontal", first: pair![0], second: pair![1] })}>Horizontal</button>
        <button type="button" onClick={() => add({ kind: "vertical", first: pair![0], second: pair![1] })}>Vertical</button>
        {distance(pair[0], pair[1]) > 1e-6 && <button type="button" onClick={() => add({ kind: "distance", first: pair![0], second: pair![1], value: distance(pair![0], pair![1]) })}>Distance</button>}
      </div>}
      {controls.length === 1 && <div className="sketch-actions"><button type="button" onClick={() => add({ kind: "fixed-point", point: controls[0], value: point(controls[0])! })}>Fix point</button></div>}
      {geometry.length === 1 && (first.kind === "circle" || first.kind === "arc") && <div className="sketch-actions">
        <button type="button" onClick={() => add({ kind: "radius", geometryId: first.id, value: first.radius })}>Radius</button>
        <button type="button" onClick={() => add({ kind: "diameter", geometryId: first.id, value: first.radius * 2 })}>Diameter</button>
      </div>}
      {geometry.length === 1 && first.kind === "rectangle" && <div className="sketch-actions">
        <button type="button" onClick={() => add({ kind: "distance", first: { geometryId: first.id, pointId: first.cornerIds[0] }, second: { geometryId: first.id, pointId: first.cornerIds[1] }, value: first.width })}>Width</button>
        <button type="button" onClick={() => add({ kind: "distance", first: { geometryId: first.id, pointId: first.cornerIds[0] }, second: { geometryId: first.id, pointId: first.cornerIds[3] }, value: first.height })}>Height</button>
      </div>}
      {geometry.length === 2 && geometry.every((entity) => entity.kind === "line") && <div className="sketch-actions"><button type="button" onClick={() => {
        const a = geometry[0] as Extract<typeof first, { kind: "line" }>, b = geometry[1] as Extract<typeof first, { kind: "line" }>;
        const aa = Math.atan2(a.end[1] - a.start[1], a.end[0] - a.start[0]), bb = Math.atan2(b.end[1] - b.start[1], b.end[0] - b.start[0]);
        add({ kind: "angle", firstLineId: a.id, secondLineId: b.id, value: Math.atan2(Math.sin(bb - aa), Math.cos(bb - aa)) });
      }}>Angle</button></div>}
      {!pair && controls.length !== 1 && geometry.length !== 1 && geometry.length !== 2 && <div className="empty-panel">Select a sketch entity or Direct-select its points to constrain it.</div>}
    </section>
    <section className="property-section"><h3>Driving dimensions &amp; relations</h3>
      {sketch.constraints.map((constraint) => <div className="property-row sketch-constraint" key={constraint.id}>
        <span title={constraint.id}>{"value" in constraint && typeof constraint.value === "number" ? dimensionLabel(constraint) : constraint.kind}</span>
        {"value" in constraint && typeof constraint.value === "number" ? <span className="numeric-control"><input aria-label={`${dimensionLabel(constraint)} ${constraint.id}`} type="number" step="any"
          value={drafts[constraint.id] ?? String(constraint.kind === "angle" ? constraint.value * 180 / Math.PI : constraint.value)}
          onChange={(event) => setDrafts((current) => ({ ...current, [constraint.id]: event.target.value }))}
          onBlur={() => void commitDimension(constraint)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /><span className="numeric-unit">{constraint.kind === "angle" ? "°" : "mm"}</span></span> : <strong>Active</strong>}
        <button type="button" aria-label={`Remove ${constraint.kind} constraint`} title="Remove constraint" onClick={() => void send({ type: "remove-sketch-constraint", sketchId: sketch.id, constraintId: constraint.id })}>×</button>
      </div>)}
      {!sketch.constraints.length && <div className="empty-panel">No constraints yet.</div>}
    </section>
  </div>;
}
