type MenuBarProps = {
  documentName: string;
  canUndo: boolean;
  canRedo: boolean;
  isModified: boolean;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleExplorer: () => void;
  onToggleProperties: () => void;
  explorerVisible: boolean;
  propertiesVisible: boolean;
};

function closeMenu(event: MouseEvent<HTMLButtonElement>) {
  event.currentTarget.closest("details")?.removeAttribute("open");
}

export function MenuBar(props: MenuBarProps) {
  return (
    <header className="menu-bar">
      <div className="menu-brand" aria-label="agent-webcad">
        <span className="brand-mark">A</span><span>agent-webcad</span>
      </div>

      <nav className="menu-items" aria-label="Application menu">
        <details className="app-menu">
          <summary>File</summary>
          <div className="menu-popover">
            <button type="button" onClick={(event) => { closeMenu(event); props.onNew(); }}><span>New document</span><kbd>Ctrl N</kbd></button>
            <button type="button" onClick={(event) => { closeMenu(event); props.onOpen(); }}><span>Open…</span><kbd>Ctrl O</kbd></button>
            <div className="menu-divider" />
            <button type="button" onClick={(event) => { closeMenu(event); props.onSave(); }}><span>Save</span><kbd>Ctrl S</kbd></button>
            <button type="button" onClick={(event) => { closeMenu(event); props.onSaveAs(); }}><span>Save as…</span><kbd>Ctrl Shift S</kbd></button>
          </div>
        </details>
        <details className="app-menu">
          <summary>Edit</summary>
          <div className="menu-popover">
            <button type="button" disabled={!props.canUndo} onClick={(event) => { closeMenu(event); props.onUndo(); }}><span>Undo</span><kbd>Ctrl Z</kbd></button>
            <button type="button" disabled={!props.canRedo} onClick={(event) => { closeMenu(event); props.onRedo(); }}><span>Redo</span><kbd>Ctrl Y</kbd></button>
          </div>
        </details>
        <details className="app-menu">
          <summary>View</summary>
          <div className="menu-popover">
            <button type="button" onClick={(event) => { closeMenu(event); props.onToggleExplorer(); }}>{props.explorerVisible ? "Hide" : "Show"} Explorer</button>
            <button type="button" onClick={(event) => { closeMenu(event); props.onToggleProperties(); }}>{props.propertiesVisible ? "Hide" : "Show"} Properties</button>
          </div>
        </details>
      </nav>

      <div className="document-title" title={props.documentName}>
        <span className={props.isModified ? "document-state document-state-modified" : "document-state"} aria-hidden="true" />
        {props.documentName}{props.isModified ? " • Modified" : ""}
      </div>

      <button type="button" className="menu-save-as" onClick={props.onSaveAs}>Save As</button>
    </header>
  );
}
import type { MouseEvent } from "react";
