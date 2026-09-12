export type ActivityId =
  | "model"
  | "layers"
  | "history"
  | "settings";

type ActivityBarProps = {
  activeActivity: ActivityId;

  onChange: (
    activity: ActivityId
  ) => void;
};

export function ActivityBar({
  activeActivity,
  onChange,
}: ActivityBarProps) {
  const items: {
    id: ActivityId;
    label: string;
    icon: string;
  }[] = [
    {
      id: "model",
      label: "Model",
      icon: "M",
    },
    {
      id: "layers",
      label: "Layers",
      icon: "L",
    },
    {
      id: "history",
      label: "History",
      icon: "H",
    },
    {
      id: "settings",
      label: "Settings",
      icon: "⚙",
    },
  ];

  return (
    <nav className="activity-bar">
      {items.map(
        (item) => (
          <button
            key={item.id}
            type="button"
            title={item.label}
            className={
              activeActivity === item.id
                ? "activity-button activity-button-active"
                : "activity-button"
            }
            onClick={() =>
              onChange(item.id)
            }
          >
            {item.icon}
          </button>
        )
      )}
    </nav>
  );
}