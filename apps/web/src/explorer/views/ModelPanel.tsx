import { useEffect, useState } from "react";
import { cadDocument } from "../../state/cadDocument";
import { dispatchCadCommand } from "../../state/dispatchCadCommand";

type ModelPanelProps = {
  query: string;
  selectedObjectId: string | null;
  onSelectObject: (objectId: string) => void;
  onDocumentChange: () => void;
};

export function ModelPanel({ query, selectedObjectId, onSelectObject, onDocumentChange }: ModelPanelProps) {
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

      {expanded && objects.map((object) => object && (
        <div
          key={object.id}
          role="button"
          tabIndex={0}
          className={object.id === selectedObjectId ? "tree-row tree-row-selected" : "tree-row"}
          onClick={() => onSelectObject(object.id)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") onSelectObject(object.id);
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
