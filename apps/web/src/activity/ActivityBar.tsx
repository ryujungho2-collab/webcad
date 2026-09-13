export type ActivityId = "model" | "layers" | "type" | "history";

type ActivityBarProps = {
  activeActivity: ActivityId;
  onChange: (activity: ActivityId) => void;
};

const items: { id: ActivityId; label: string; icon: string }[] = [
  { id: "model", label: "Model tree", icon: "⌘" },
  { id: "layers", label: "Layers", icon: "▱" },
  { id: "type", label: "Group by type", icon: "◇" },
  { id: "history", label: "Command history", icon: "↶" },
];

export function ActivityBar({ activeActivity, onChange }: ActivityBarProps) {
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
          {item.icon}
        </button>
      ))}
      <span className="activity-spacer" />
      <div className="activity-wordmark" title="Model workspace">3D</div>
    </nav>
  );
}
