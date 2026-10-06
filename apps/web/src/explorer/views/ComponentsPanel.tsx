import { useEffect, useMemo, useState } from "react";
import { cadDocument } from "../../state/cadDocument";
import { applyCadPlan, discardCadPlan, previewCadCommand, type CadPlanPreview } from "../../state/documentPlans";
import { dispatchCadCommand } from "../../state/dispatchCadCommand";
import { commandInteraction } from "../../state/commandInteraction";
import { CommandReview } from "../../ui/CommandReview";
import { PrecisionField } from "../../ui/PrecisionField";
import { parsePointEntry } from "../../precision/pointInput";
import { planeToWorld, WORK_PLANES, type WorkPlaneId } from "../../precision/workPlane";

type Mode = "create" | "update" | "rename";
type Props = { query: string; revision: number; selectedObjectIds: string[]; activeWorkPlane: WorkPlaneId; onChange: () => void; onInsert: (blockId: string) => void };

export function ComponentsPanel({ query, revision, selectedObjectIds, activeWorkPlane, onChange, onInsert }: Props) {
  const components = useMemo(() => Object.values(cadDocument.blocks ?? {}).filter(block => !query || `${block.name} ${block.id}`.toLowerCase().includes(query)), [query, revision]);
  const [selectedId, setSelectedId] = useState<string | null>(components[0]?.id ?? null);
  const [name, setName] = useState(components[0]?.name ?? "Component");
  const [basePoint, setBasePoint] = useState("0,0");
  const [mode, setMode] = useState<Mode | null>(null);
  const [plan, setPlan] = useState<{ key: string; preview: CadPlanPreview } | null>(null);
  const [error, setError] = useState("");
  const [applying, setApplying] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const selected = selectedId ? cadDocument.blocks?.[selectedId] : undefined;
  const plane = mode === "create" ? activeWorkPlane : selected?.workPlane ?? activeWorkPlane;
  const point = parsePointEntry(basePoint);
  const worldBase = point ? planeToWorld(point, WORK_PLANES[plane]) : null;
  const key = JSON.stringify([mode, selectedId, name, basePoint, selectedObjectIds, plane, revision]);
  const inputError = mode && !name.trim() ? "Enter a component name." : mode !== "rename" && mode && selectedObjectIds.length === 0 ? "Select one or more editable drawings or component instances first." : mode !== "rename" && mode && !worldBase ? "Enter a base point as x,y with optional units." : undefined;
  const interaction = commandInteraction({ command: mode === "rename" ? "Rename Component" : mode === "update" ? "Update Component Definition" : "Create Component", targets: mode === "create" ? selectedObjectIds : selected ? [selected.id, ...selectedObjectIds] : selectedObjectIds, draftKey: key, reviewedKey: plan?.key, preview: plan?.preview, inputError: inputError || error || undefined, pending: applying, idle: !mode && !error });

  useEffect(() => {
    if (selectedId && cadDocument.blocks?.[selectedId]) return;
    const next = components[0];
    setSelectedId(next?.id ?? null); setName(next?.name ?? "Component"); setMode(null); setPlan(null);
  }, [revision, selectedId]);

  useEffect(() => {
    const selected = selectedId ? cadDocument.blocks?.[selectedId] : undefined;
    if (selected && mode === null) setName(selected.name);
  }, [selectedId, revision, mode]);

  useEffect(() => {
    setPlan(null);
    if (!mode || inputError) return;
    let cancelled = false, planId: string | undefined;
    const command = mode === "create"
      ? { type: "define-block" as const, id: createdId ?? `component-${crypto.randomUUID()}`, name: name.trim(), objectIds: selectedObjectIds, base: worldBase! }
      : mode === "rename"
        ? { type: "update-block" as const, blockId: selectedId!, name: name.trim() }
        : { type: "update-block" as const, blockId: selectedId!, name: name.trim(), objectIds: selectedObjectIds, base: worldBase! };
    const timer = setTimeout(() => {
      void previewCadCommand(command).then(preview => { planId = preview.planId; if (cancelled) discardCadPlan(planId); else setPlan({ key, preview }); })
        .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not review the component change."); });
    }, 90);
    return () => { cancelled = true; clearTimeout(timer); if (planId) discardCadPlan(planId); };
  }, [key, mode, inputError]);

  function begin(next: Mode) { setMode(next); setPlan(null); setError(""); if (next === "create") { setSelectedId(null); setName(`Component ${Object.keys(cadDocument.blocks ?? {}).length + 1}`); setCreatedId(`component-${crypto.randomUUID()}`); setBasePoint("0,0"); } else if (selected) { if (next === "update") setName(selected.name); setBasePoint("0,0"); } }
  function cancel() { setMode(null); setPlan(null); setError(""); setCreatedId(null); if (selectedId && cadDocument.blocks?.[selectedId]) setName(cadDocument.blocks[selectedId].name); }
  async function apply() {
    if (!interaction.canApply || !plan) return;
    setApplying(true);
    try {
      const result = await applyCadPlan(plan.preview.planId);
      if (!result.ok) { setError(result.reason ?? "The component changed during review. Review again."); return; }
      if (mode === "create" && createdId) setSelectedId(createdId);
      setMode(null); setPlan(null); setError(""); onChange();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not apply the component change."); }
    finally { setApplying(false); }
  }

  const showEditor = mode === "create" || !!selected;
  return <div className="components-panel" data-testid="components-panel">
    <div className="layers-header"><span>Reusable components</span><button type="button" className="layer-add-button" disabled={!selectedObjectIds.length} onClick={() => begin("create")} aria-label="Create component from selection">+ Create</button></div>
    <p className="property-hint">A component keeps one editable definition and any number of placed instances. Instances update together when the definition is replaced.</p>
    <div className="layers-list" role="listbox" aria-label="Components">
      {components.map(component => {
        const instances = Object.values(cadDocument.features).filter(feature => feature.type === "drafting" && feature.params.kind === "block" && feature.params.blockId === component.id).length;
        return <button key={component.id} type="button" role="option" aria-selected={selectedId === component.id} className={selectedId === component.id ? "layer-row layer-row-selected" : "layer-row"} onClick={() => { setSelectedId(component.id); setName(component.name); setMode(null); setPlan(null); }}><span className="layer-name">{component.name}</span><small>{component.members.length} elements · {instances} instance{instances === 1 ? "" : "s"} · {component.workPlane}</small></button>;
      })}
      {!components.length && <p className="property-hint">Select drawings and create a component to build a reusable library.</p>}
    </div>
    {showEditor && <section className="property-section" aria-label={mode === "create" ? "Create component" : "Selected component"}>
      {mode === "create" && <strong>Create reusable component</strong>}
      <label>Name<input aria-label="Component name" value={name} onChange={event => { setError(""); setName(event.target.value); }} /></label>
      {selected && <p className="property-hint">Base point and plane: {selected.workPlane}. Existing instances keep their position and orientation when this definition updates.</p>}
      {mode && mode !== "rename" && <><PrecisionField label="Base point" aria-label="Component base point" value={basePoint} onChange={value => { setError(""); setBasePoint(value); }} /><small>Enter plane coordinates such as 0,0 or 25mm,10mm.</small></>}
      {mode && <CommandReview state={interaction} />}
      {!mode && selected && <div className="property-actions">
        <button type="button" disabled={selectedObjectIds.length === 0} onClick={() => begin("update")} aria-label="Update component from selection">Update from selection</button>
        <button type="button" disabled={name.trim() === selected.name} onClick={() => begin("rename")} aria-label="Rename component">Rename</button>
        <button type="button" onClick={() => onInsert(selected.id)} aria-label="Insert component">Insert</button>
      </div>}
      {mode && <div className="property-actions"><button type="button" aria-label="Apply component change" disabled={!interaction.canApply} onClick={() => void apply()}>Apply</button><button type="button" aria-label="Cancel component change" disabled={applying} onClick={cancel}>Cancel</button></div>}
    </section>}
  </div>;
}
