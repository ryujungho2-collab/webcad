type StatusBarProps = {
  selectedObjectId:
    | string
    | null;
};

export function StatusBar({
  selectedObjectId,
}: StatusBarProps) {
  return (
    <footer className="status-bar">
      <span>Ready</span>

      <span>mm</span>

      <span>Grid: On</span>

      <span>Snap: Off</span>

      <span className="status-spacer" />

      <span>
        {selectedObjectId
          ? `Selected: ${selectedObjectId}`
          : "No selection"}
      </span>

      <span>
        OpenCascade
      </span>
    </footer>
  );
}