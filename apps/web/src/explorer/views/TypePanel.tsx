import { cadDocument } from "../../state/cadDocument";

type TypePanelProps = {
  query: string;
  selectedObjectId: string | null;
  onSelectObject: (objectId: string) => void;
};

export function TypePanel({ query, selectedObjectId, onSelectObject }: TypePanelProps) {
  const groups = new Map<string, typeof cadDocument.rootObjects>();
  const featuresByOutput = new Map(
    Object.values(cadDocument.features).map((feature) => [feature.output, feature])
  );

  for (const objectId of cadDocument.rootObjects) {
    const object = cadDocument.objects[objectId];
    if (!object || (query && !object.name.toLowerCase().includes(query) && !object.id.toLowerCase().includes(query))) continue;
    const feature = featuresByOutput.get(objectId);
    const type = feature?.type === "primitive" ? "Primitives" : "Imported / BRep";
    groups.set(type, [...(groups.get(type) ?? []), objectId]);
  }

  return (
    <div className="tree-view">
      {Array.from(groups).map(([type, objectIds]) => (
        <div key={type} className="type-group">
          <div className="tree-root"><span className="tree-chevron">⌄</span><span className="tree-document-icon">◇</span><strong>{type}</strong><span className="tree-meta">{objectIds.length}</span></div>
          {objectIds.map((objectId) => {
            const object = cadDocument.objects[objectId];
            return object && (
              <button key={objectId} type="button" className={objectId === selectedObjectId ? "tree-row tree-row-selected" : "tree-row"} onClick={() => onSelectObject(objectId)}>
                <span className="tree-branch" /><span className="tree-object-icon">◇</span><span className="tree-label">{object.name}</span>
              </button>
            );
          })}
        </div>
      ))}
      {groups.size === 0 && <div className="empty-panel">{query ? "No matching objects" : "No objects in this document"}</div>}
    </div>
  );
}
