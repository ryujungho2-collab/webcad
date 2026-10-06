export type ActivityId = "scenes" | "model" | "layers" | "artboards" | "components" | "type" | "history" | "copilot" | "variables";

type ActivityBarProps = {
  activeActivity: ActivityId;
  onChange: (activity: ActivityId) => void;
  workspaceMode?: "2d" | "3d";
};

const items: { id: ActivityId; label: string; path: string }[] = [
  { id: "model", label: "Model tree", path: "m12 3 8 4.5v9L12 21l-8-4.5v-9Z m-8 4.5 8 4.5 8-4.5 M12 12v9" },
  { id: "layers", label: "Layers", path: "m3 8 9-5 9 5-9 5Z m-9 5 9 5 9-5 m-18 5 9 5 9-5" },
  { id: "artboards", label: "Artboards", path: "M3 5h18v14H3Z M7 9h5v5H7Z M15 9h3 M15 13h3" },
  { id: "scenes", label: "Scenes", path: "M3 4h18v13H3Z M8 21h8 M12 17v4 M9 7l7 4-7 4Z" },
  { id: "components", label: "Components", path: "M4 4h7v7H4Z M13 13h7v7h-7Z M13 4h7v7h-7Z M7.5 11v4.5h5.5" },
  { id: "type", label: "Group by type", path: "M3 3h7v7H3Z M14 3h7v7h-7Z M3 14h7v7H3Z m14 0 4 7h-8Z" },
  { id: "history", label: "Operation log", path: "M8 5h13 M8 12h13 M8 19h13 M3 5h.01 M3 12h.01 M3 19h.01" },
  { id: "variables", label: "Variables", path: "M5 20 10 4h7 M4 10h11 m0 4 5 6 m0-6-5 6" },
  { id: "copilot", label: "Copilot", path: "M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5.6 5.6l2.1 2.1 M16.3 16.3l2.1 2.1 M18.4 5.6l-2.1 2.1 M7.7 16.3l-2.1 2.1 M12 8.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 1 0 12 8.5Z" },
];

export function ActivityBar({ activeActivity, onChange, workspaceMode = "3d" }: ActivityBarProps) {
  return (
    <nav className="activity-bar" aria-label="CAD Explorer views">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          title={item.label}
          aria-label={item.label}
          aria-pressed={activeActivity === item.id}
          className={activeActivity === item.id ? "activity-button activity-button-active" : "activity-button"}
          onClick={() => onChange(item.id)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={item.path} /></svg>
        </button>
      ))}
      <span className="activity-spacer" />
      <div className="activity-wordmark" title={workspaceMode === "2d" ? "2D drafting workspace" : "3D modeling workspace"}>{workspaceMode.toUpperCase()}</div>
    </nav>
  );
}
