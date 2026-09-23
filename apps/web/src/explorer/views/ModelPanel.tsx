import { useEffect, useState } from "react";
import { cadDocument } from "../../state/cadDocument";
import { dispatchCadCommand } from "../../state/dispatchCadCommand";

type ModelPanelProps = {
  query: string;
  selectedObjectId: string | null;
  selectedObjectIds: string[];
  onSelectObject: (objectId: string, additive?: boolean) => void;
  onDocumentChange: () => void;
  activeSketchId?: string | null;
  onEditSketch?: (id: string) => void;
};

export function ModelPanel({ query, selectedObjectId, selectedObjectIds, onSelectObject, onDocumentChange, activeSketchId, onEditSketch }: ModelPanelProps) {
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (query) setExpanded(true);
  }, [query]);

  const objects = cadDocument.rootObjects
    .map((id) => cadDocument.objects[id])
    .filter((object) => object && (!query || object.name.toLowerCase().includes(query) || object.id.toLowerCase().includes(query)));

  return (
    <div className="tree-view">
      <button type="button" className="tree-root" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        <span className="tree-chevron">{expanded ? "⌄" : "›"}</span>
        <span className="tree-document-icon">▧</span>
        <strong>Document</strong>
        <span className="tree-meta">{cadDocument.rootObjects.length}</span>
      </button>

      {expanded && Object.values(cadDocument.sketches ?? {}).filter((sketch) => !query || sketch.id.toLowerCase().includes(query)).map((sketch) => <button key={sketch.id} type="button" className={`tree-row${activeSketchId === sketch.id ? " tree-row-selected" : ""}`} onClick={() => onEditSketch?.(sketch.id)} title={`Edit ${sketch.workPlane} sketch`}><span className="tree-branch" /><span className="tree-object-icon">⌗</span><span className="tree-label">{sketch.id}</span><span className="tree-layer">{sketch.workPlane} · {sketch.geometry.length}</span></button>)}

      {expanded && objects.map((object) => object && (
        <div
          key={object.id}
          role="button"
          tabIndex={0}
          aria-selected={selectedObjectIds.includes(object.id)}
          className={`${selectedObjectIds.includes(object.id) ? "tree-row tree-row-selected" : "tree-row"}${selectedObjectId === object.id ? " tree-row-primary" : ""}`}
          onClick={(event) => onSelectObject(object.id, event.shiftKey || event.ctrlKey || event.metaKey)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelectObject(object.id, event.shiftKey || event.ctrlKey || event.metaKey);
            }
          }}
          title={`${object.name} · ${cadDocument.layers[object.layerId]?.name ?? "Unknown layer"}`}
        >
          <span className="tree-branch" aria-hidden="true" />
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
          >{object.visible ? "◉" : "○"}</button>
          <span className="tree-object-icon">◇</span>
          <span className="tree-label">{object.name}</span>
          <span className="tree-layer">{cadDocument.layers[object.layerId]?.name}</span>
        </div>
      ))}

      {expanded && objects.length === 0 && <div className="empty-panel">{query ? "No matching objects" : "No objects in this document"}</div>}
    </div>
  );
}
