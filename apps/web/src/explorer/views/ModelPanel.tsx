import { useEffect, useState } from "react";
import { cadDocument } from "../../state/cadDocument";
import { dispatchCadCommand } from "../../state/dispatchCadCommand";
import { ToolIcon } from "../../ui/ToolIcon";
import { liveFeatureInputs } from "../../state/featureRegeneration";

type ModelPanelProps = {
  query: string;
  selectedObjectId: string | null;
  selectedObjectIds: string[];
  onSelectObject: (objectId: string, additive?: boolean) => void;
  onDocumentChange: () => void;
  activeSketchId?: string | null;
  onEditSketch?: (id: string) => void;
};

export function objectPresentation(feature?: { type: string; params: Record<string, unknown> }) {
  const kind = feature?.type === "primitive" || feature?.type === "drawing" ? String(feature.params.kind ?? "box") : feature?.type ?? "body";
  const symbols: Record<string, string> = { box: "◇", cylinder: "▱", sphere: "○", cone: "△", torus: "◎", line: "╱", polyline: "⌁", rectangle: "▭", circle: "○", arc: "⌒", extrude: "▰", boolean: "◧", fillet: "◜", body: "◇" };
  return { label: kind.charAt(0).toUpperCase() + kind.slice(1), icon: symbols[kind] ?? "◇" };
}

export function ModelPanel({ query, selectedObjectId, selectedObjectIds, onSelectObject, onDocumentChange, activeSketchId, onEditSketch }: ModelPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (query) setExpanded(true);
  }, [query]);

  const sketches = Object.values(cadDocument.sketches ?? {}).filter((sketch) => !query || sketch.id.toLowerCase().includes(query));
  const featuresByOutput = new Map(Object.values(cadDocument.features).map((feature) => [feature.output, feature]));
  const sourceIds = (id: string) => {
    const feature = featuresByOutput.get(id);
    return feature ? liveFeatureInputs(feature, cadDocument) : [];
  };
  const matches = (id: string, path = new Set<string>()): boolean => {
    const object = cadDocument.objects[id];
    if (!object || path.has(id)) return false;
    if (!query || object.name.toLowerCase().includes(query) || id.toLowerCase().includes(query)) return true;
    return sourceIds(id).some(source => matches(source, new Set([...path, id])));
  };
  const rows: { id: string; key: string; depth: number }[] = [];
  const append = (id: string, path: string[]) => {
    if (path.includes(id) || !matches(id)) return;
    rows.push({ id, key: [...path, id].join("/"), depth: path.length });
    if (query || expandedSources.has(id)) sourceIds(id).forEach(source => append(source, [...path, id]));
  };
  cadDocument.rootObjects.forEach(id => append(id, []));

  return (
    <div className="tree-view">
      <button type="button" className="tree-root" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        <span className="tree-chevron">{expanded ? "⌄" : "›"}</span>
        <span className="tree-document-icon"><ToolIcon name="Model" fallback="▧" /></span>
        <strong>Document</strong>
        <span className="tree-meta">{cadDocument.rootObjects.length} objects</span>
      </button>

      {expanded && sketches.map((sketch) => (
        <button key={sketch.id} type="button" className={`tree-row tree-row-sketch${activeSketchId === sketch.id ? " tree-row-selected" : ""}`} aria-pressed={activeSketchId === sketch.id} onClick={() => onEditSketch?.(sketch.id)} title={`Edit ${sketch.id} · ${sketch.workPlane} plane · ${sketch.geometry.length} entities`}>
          <span className="tree-branch" aria-hidden="true" />
          <span className="tree-object-icon" aria-hidden="true"><ToolIcon name="Sketch" fallback="⌗" /></span>
          <span className="tree-label">{sketch.id}</span>
          <span className="tree-layer">{activeSketchId === sketch.id ? "Editing" : sketch.workPlane}</span>
        </button>
      ))}

      {expanded && rows.map(({ id, key, depth }) => {
        const object = cadDocument.objects[id];
        const sources = sourceIds(id);
        const sourcesOpen = Boolean(query) || expandedSources.has(id);
        const presentation = objectPresentation(featuresByOutput.get(object.id));
        const layer = cadDocument.layers[object.layerId];
        return (
        <div
          key={key}
          style={{ paddingLeft: 8 + depth * 14 }}
          role="button"
          data-model-object-id={object.id}
          tabIndex={0}
          aria-pressed={selectedObjectIds.includes(object.id)}
          className={`tree-row tree-row-model${selectedObjectIds.includes(object.id) ? " tree-row-selected" : ""}${selectedObjectId === object.id ? " tree-row-primary" : ""}${!object.visible || layer?.visible === false ? " tree-row-hidden" : ""}`}
          onClick={(event) => onSelectObject(object.id, event.shiftKey || event.ctrlKey || event.metaKey)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelectObject(object.id, event.shiftKey || event.ctrlKey || event.metaKey);
            }
          }}
          title={`${object.name} · ${presentation.label} · ${layer?.name ?? "Unknown layer"}${layer?.locked ? " · Locked layer" : ""}${depth > 0 && !object.visible ? " · Show this source to edit it" : ""}`}
        >
          {sources.length ? <button type="button" className="tree-chevron" aria-label={`${sourcesOpen ? "Collapse" : "Expand"} ${object.name} sources`} aria-expanded={sourcesOpen} onClick={event => {
            event.stopPropagation();
            setExpandedSources(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
          }}>{sourcesOpen ? "⌄" : "›"}</button> : <span className="tree-branch" aria-hidden="true" />}
          <button
            type="button"
            className={`tree-visibility${object.visible ? "" : " tree-visibility-off"}`}
            title={object.visible ? "Hide object" : "Show object"}
            aria-label={`${object.visible ? "Hide" : "Show"} ${object.name}`}
            onClick={(event) => {
              event.stopPropagation();
              void dispatchCadCommand({ type: "set-object-visible", objectId: object.id, visible: !object.visible })
                .then(onDocumentChange);
            }}
          ><ToolIcon name={object.visible ? "Show All" : "Hide"} fallback={object.visible ? "◉" : "○"} /></button>
          <span className="tree-object-icon" title={presentation.label} aria-hidden="true"><ToolIcon name={presentation.label} fallback={presentation.icon} /></span>
          <span className="tree-label">{object.name}</span>
          <span className="tree-layer">{layer?.locked ? "Locked" : layer?.name}</span>
        </div>
      ); })}

      {expanded && rows.length === 0 && sketches.length === 0 && <div className="empty-panel">{query ? "No matching objects or sketches." : "Your model is empty. Create a solid or start a sketch to begin."}</div>}
    </div>
  );
}
