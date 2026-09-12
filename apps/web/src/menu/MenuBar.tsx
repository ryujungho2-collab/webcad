type MenuBarProps = {
  onSave?: () => void;
  onSaveAs?: () => void;
  onOpen?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
};

export function MenuBar({
  onSave,
  onSaveAs,
  onOpen,
  onUndo,
  onRedo,
}: MenuBarProps) {
  return (
    <div className="menu-bar">
      <div className="menu-brand">
        agent-webcad
      </div>

      <button type="button">
        File
      </button>

      <button type="button">
        Edit
      </button>

      <button type="button">
        View
      </button>

      <button type="button">
        Object
      </button>

      <button type="button">
        Layer
      </button>

      <button type="button">
        Settings
      </button>

      <button type="button">
        Help
      </button>

      {/*
        Hidden functional hooks for now.
        Real dropdown menus come later.
      */}
      <div className="menu-hooks">
        <button onClick={onOpen}>
          Open
        </button>

        <button onClick={onSave}>
          Save
        </button>

        <button onClick={onSaveAs}>
          Save As
        </button>

        <button onClick={onUndo}>
          Undo
        </button>

        <button onClick={onRedo}>
          Redo
        </button>
      </div>
    </div>
  );
}