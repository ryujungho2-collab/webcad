type RibbonProps = {
  onCreateBox: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave?: () => void;
};

export function Ribbon({
  onCreateBox,
  onUndo,
  onRedo,
  onSave,
}: RibbonProps) {
  return (
    <div className="tool-bar">
      <button
        type="button"
        onClick={onCreateBox}
      >
        Box
      </button>

      <div className="tool-separator" />

      <button
        type="button"
        onClick={onUndo}
      >
        Undo
      </button>

      <button
        type="button"
        onClick={onRedo}
      >
        Redo
      </button>

      <div className="tool-separator" />

      <button
        type="button"
        onClick={onSave}
      >
        Save
      </button>
    </div>
  );
}