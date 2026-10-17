import { cadHistory } from "../../state/history";

type HistoryPanelProps = { query: string };

const labels: Record<string, string> = {
  "create-endpoint-radius-arc":"Create endpoint / radius arc",
  "create-three-point-curve":"Create three-point circle / arc",
  "create-shell":"Shell solid",
  "update-shell":"Edit Shell thickness and faces",
  "set-variable":"Edit document variable",
  "remove-variable":"Remove document variable",
  "set-parameter-binding":"Drive parameter by expression",
  "remove-parameter-binding":"Remove parameter binding",
  "batch": "Batch operation",
  "create-box": "Create box",
  "create-drawing": "Create drawing entity",
  "create-primitive": "Create primitive",
  "create-extrude": "Extrude profile",
  "update-extrude": "Edit extrusion",
  "update-primitive": "Edit primitive parameters",
  "boolean-operation": "Boolean operation",
  "fillet": "Fillet edges",
  "chamfer": "Chamfer edges",
  "create-revolve": "Revolve profile",
  "update-revolve": "Edit revolution",
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
  "trim-drawing": "Trim drawing",
  "extend-drawing": "Extend drawing",
};

export function historyOperationLabel(label: string) {
  return labels[label] ?? label.replace(/-/g, " ").replace(/^./, (letter) => letter.toUpperCase());
}

export function HistoryPanel({ query }: HistoryPanelProps) {
  const entries = cadHistory.getPastLabels()
    .map((label, index) => ({ label: historyOperationLabel(label), index }))
    .filter((entry) => !query || entry.label.toLowerCase().includes(query));

  return (
    <div className="history-list operation-log">
      <div className="explorer-view-note">Completed operations in undo history.</div>
      <div role="list" aria-label="Completed operations">
      {entries.map((entry) => (
        <div className="history-row" role="listitem" key={`${entry.index}-${entry.label}`}>
          <small className="operation-number">{entry.index + 1}</small>
          <span>{entry.label}</span>
        </div>
      ))}
      </div>
      {entries.length === 0 && <div className="empty-panel">{query ? "No matching operations." : "No operations yet. Changes to your model will appear here."}</div>}
    </div>
  );
}
