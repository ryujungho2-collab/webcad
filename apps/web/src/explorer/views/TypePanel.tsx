import { useEffect, useState } from "react";
import { cadDocument } from "../../state/cadDocument";
import { ToolIcon } from "../../ui/ToolIcon";
import { objectPresentation } from "./ModelPanel";

type TypePanelProps = {
  query: string;
  selectedObjectId: string | null;
  selectedObjectIds: string[];
  onSelectObject: (objectId: string, additive?: boolean) => void;
};

export function TypePanel({ query, selectedObjectId, selectedObjectIds, onSelectObject }: TypePanelProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  useEffect(() => { if (query) setCollapsedGroups(new Set()); }, [query]);
  function toggleGroup(type: string) {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  }
  const groups = new Map<string, typeof cadDocument.rootObjects>();
  const featuresByOutput = new Map(
    Object.values(cadDocument.features).map((feature) => [feature.output, feature])
  );

  for (const objectId of cadDocument.rootObjects) {
    const object = cadDocument.objects[objectId];
    if (!object || (query && !object.name.toLowerCase().includes(query) && !object.id.toLowerCase().includes(query))) continue;
    const feature = featuresByOutput.get(objectId);
    const type = feature?.type === "primitive" ? "Primitives" : feature?.type === "drawing" ? "Drawing entities" : feature?.type === "extrude" ? "Extrude features" : feature?.type === "boolean" ? "Boolean features" : feature?.type === "fillet" ? "Fillet features" : "Imported / BRep";
    groups.set(type, [...(groups.get(type) ?? []), objectId]);
  }

  return (
    <div className="tree-view">
      {Array.from(groups).map(([type, objectIds]) => (
        <div key={type} className="type-group">
          <button type="button" className="tree-root tree-type-heading" aria-expanded={!collapsedGroups.has(type)} onClick={() => toggleGroup(type)}><span className="tree-chevron" aria-hidden="true">{collapsedGroups.has(type) ? "›" : "⌄"}</span><strong>{type}</strong><span className="tree-meta">{objectIds.length}</span></button>
          {!collapsedGroups.has(type) && objectIds.map((objectId) => {
            const object = cadDocument.objects[objectId];
            const presentation = objectPresentation(featuresByOutput.get(objectId));
              return object && (
              <button key={objectId} type="button" aria-pressed={selectedObjectIds.includes(objectId)} className={`tree-row tree-row-type${selectedObjectIds.includes(objectId) ? " tree-row-selected" : ""}${selectedObjectId === objectId ? " tree-row-primary" : ""}`} title={`${object.name} · ${presentation.label}`} onClick={(event) => onSelectObject(objectId, event.shiftKey || event.ctrlKey || event.metaKey)}>
                <span className="tree-branch" aria-hidden="true" /><span className="tree-object-icon" aria-hidden="true"><ToolIcon name={presentation.label} fallback={presentation.icon} /></span><span className="tree-label">{object.name}</span>
              </button>
            );
          })}
        </div>
      ))}
      {groups.size === 0 && <div className="empty-panel">{query ? "No matching objects." : "Objects appear here grouped by their feature type."}</div>}
    </div>
  );
}
