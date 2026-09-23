import { cadHistory } from "../../state/history";

type HistoryPanelProps = { query: string };

const labels: Record<string, string> = {
  "create-box": "Create box",
  "create-drawing": "Create drawing entity",
  "create-primitive": "Create primitive",
  "create-extrude": "Extrude profile",
  "update-extrude": "Edit extrusion",
  "update-primitive": "Edit primitive parameters",
  "boolean-operation": "Boolean operation",
  "create-layer": "Create layer",
  "delete-layer": "Delete layer",
  "rename-layer": "Rename layer",
  "set-layer-visible": "Change layer visibility",
  "set-layer-locked": "Change layer lock",
  "move-object-to-layer": "Move to layer",
  "set-object-visible": "Change visibility",
  "rename-object": "Rename object",
  "update-box": "Edit box parameters",
  "move-object": "Move object",
  "rotate-object": "Rotate object",
  "scale-object": "Scale object",
  "isolate-object": "Isolate object",
  "show-all-objects": "Show all objects",
  "delete-object": "Delete object",
  "duplicate-object": "Duplicate object",
};

export function HistoryPanel({ query }: HistoryPanelProps) {
  const entries = cadHistory.getPastLabels()
    .map((label, index) => ({ label: labels[label] ?? label, index }))
    .filter((entry) => !query || entry.label.toLowerCase().includes(query));

  return (
    <div className="history-list">
      <div className="history-origin"><span />Document opened</div>
      {entries.map((entry) => (
        <div className="history-row" key={`${entry.index}-${entry.label}`}>
          <span className="history-node" />
          <span>{entry.label}</span>
          <small>{entry.index + 1}</small>
        </div>
      ))}
      {entries.length === 0 && cadHistory.getPastLabels().length > 0 && <div className="empty-panel">No matching operations</div>}
    </div>
  );
}
