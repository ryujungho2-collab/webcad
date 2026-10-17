import { useEffect, useRef, type MouseEvent, type SyntheticEvent } from "react";
import { ToolIcon } from "../ui/ToolIcon";
import { isCadKeyboardBlocked } from "../input/shortcutRouter";

type MenuBarProps = {
  onCommandPalette: () => void;
  documentName: string;
  canUndo: boolean;
  canRedo: boolean;
  isModified: boolean;
  saveStatus?: string;
  fileStatus?: string;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onExportStl: () => void;
  onExportSvg: () => void;
  onExportArtboardSvg?: () => void;
  onExportArtboardPng?: () => void;
  onExportArtboardPdf?: () => void;
  activeArtboardName?: string;
  hasVisibleArtboards?: boolean;
  onImportFixture?: () => void;
  onExportFixture?: () => void;
  onImportDxf: () => void;
  onFloorTasks?:()=>void;
  onImportImage?: () => void;
  onExportDxf: () => void;
  onExportStep: () => void;
  onPlot: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleExplorer: () => void;
  onToggleProperties: () => void;
  onInsertPavilion: () => void;
  explorerVisible: boolean;
  propertiesVisible: boolean;
};

function closeMenu(event: MouseEvent<HTMLButtonElement>) {
  event.currentTarget.closest("details")?.removeAttribute("open");
}

export function MenuBar(props: MenuBarProps) {
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function dismissOutside(event: PointerEvent) {
      if (!(event.target instanceof Node)) return;
      for (const menu of headerRef.current?.querySelectorAll<HTMLDetailsElement>("details[open]") ?? []) {
        if (!menu.contains(event.target)) menu.open = false;
      }
    }
    function dismissOnEscape(event: KeyboardEvent) {
      if (isCadKeyboardBlocked(event.target)) return;
      if (event.key !== "Escape") return;
      const openMenus = headerRef.current?.querySelectorAll<HTMLDetailsElement>("details[open]");
      if (!openMenus?.length) return;
      const focusedMenu = Array.from(openMenus).find((menu) => menu.contains(document.activeElement)) ?? openMenus[0];
      for (const menu of openMenus) menu.open = false;
      focusedMenu.querySelector("summary")?.focus();
      event.preventDefault();
      event.stopPropagation();
    }
    document.addEventListener("pointerdown", dismissOutside, true);
    document.addEventListener("keydown", dismissOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside, true);
      document.removeEventListener("keydown", dismissOnEscape, true);
    };
  }, []);

  function keepOneMenuOpen(event: SyntheticEvent<HTMLDetailsElement>) {
    const current = event.currentTarget;
    if (!current.open) return;
    for (const menu of headerRef.current?.querySelectorAll<HTMLDetailsElement>("details[open]") ?? []) {
      if (menu !== current) menu.open = false;
    }
  }

  function runQuickAction(action: () => void) {
    for (const menu of headerRef.current?.querySelectorAll<HTMLDetailsElement>("details[open]") ?? []) menu.open = false;
    action();
  }

  return (
    <header className="menu-bar" ref={headerRef}>
      <div className="menu-brand" aria-label="agent-webcad">
        <span className="brand-mark">A</span><span>agent-webcad</span>
      </div>

      <nav className="menu-items" aria-label="Application menu">
        <details className="app-menu" onToggle={keepOneMenuOpen}>
          <summary>File</summary>
          <div className="menu-popover">
            <button type="button" onClick={(event) => { closeMenu(event); props.onNew(); }}><span>New document</span><kbd>Ctrl N</kbd></button>
            <button type="button" onClick={(event) => { closeMenu(event); props.onOpen(); }}><span>Open…</span><kbd>Ctrl O</kbd></button>
            <button type="button" onClick={event=>{closeMenu(event);props.onImportFixture?.();}}><span>Import exchange fixture…</span></button>
            <button type="button" onClick={event=>{closeMenu(event);props.onExportFixture?.();}}><span>Export exchange fixture…</span></button>
            <button type="button" title="Import drawings from a DXF file" onClick={(event) => { closeMenu(event); props.onImportDxf(); }}><span>Import DXF…</span></button>
            <button type="button" onClick={event=>{closeMenu(event);props.onFloorTasks?.();}}>Floor plan tasks…</button>
            <button type="button" title="Place PNG, JPEG, or WebP; single-page 8-bit TIFF is converted to PNG" onClick={(event) => { closeMenu(event); props.onImportImage?.(); }}><span>Import Image…</span></button>
            <div className="menu-divider" />
            <button type="button" onClick={(event) => { closeMenu(event); props.onSave(); }}><span>Save locally</span><kbd>Ctrl S</kbd></button>
            <button type="button" onClick={(event) => { closeMenu(event); props.onSaveAs(); }}><span>Download WebCAD file…</span><kbd>Ctrl Shift S</kbd></button>
            <div className="menu-divider" />
            <button type="button" title="Export visible solids for 3D printing" onClick={(event) => { closeMenu(event); props.onExportStl(); }}><span>Export STL…</span></button>
            <button type="button" title="Export visible solids as STEP for manufacturers" onClick={(event) => { closeMenu(event); props.onExportStep(); }}><span>Export STEP…</span></button>
            <button type="button" title="Export drawings as DXF for other CAD" onClick={(event) => { closeMenu(event); props.onExportDxf(); }}><span>Export DXF…</span></button>
            <button type="button" title="Export active-plane drawings as vectors" onClick={(event) => { closeMenu(event); props.onExportSvg(); }}><span>Export SVG…</span></button>
            {props.activeArtboardName && <button type="button" title="Render the active artboard as a PNG with a scale and pixel preview" onClick={(event) => { closeMenu(event); props.onExportArtboardPng?.(); }}><span>Export “{props.activeArtboardName}” PNG…</span></button>}
            {props.activeArtboardName && <button type="button" title="Clip visible artwork to the active artboard and export its exact page bounds" onClick={(event) => { closeMenu(event); props.onExportArtboardSvg?.(); }}><span>Export “{props.activeArtboardName}” SVG…</span></button>}
            {props.hasVisibleArtboards && <button type="button" title="Export the active or all visible artboards as rasterized PDF pages" onClick={(event) => { closeMenu(event); props.onExportArtboardPdf?.(); }}><span>Export Artboards PDF…</span></button>}
            <div className="menu-divider" />
            <button type="button" title="Plot the active plane to a scale PDF" onClick={(event) => { closeMenu(event); props.onPlot(); }}><span>Plot PDF…</span></button>
          </div>
        </details>
        <details className="app-menu" onToggle={keepOneMenuOpen}>
          <summary>Edit</summary>
          <div className="menu-popover">
            <button type="button" disabled={!props.canUndo} onClick={(event) => { closeMenu(event); props.onUndo(); }}><span>Undo</span><kbd>Ctrl Z</kbd></button>
            <button type="button" disabled={!props.canRedo} onClick={(event) => { closeMenu(event); props.onRedo(); }}><span>Redo</span><kbd>Ctrl Y</kbd></button>
          </div>
        </details>
        <details className="app-menu" onToggle={keepOneMenuOpen}>
          <summary>Samples</summary>
          <div className="menu-popover">
            <button type="button" title="Insert a procedural pavilion model" onClick={(event) => { closeMenu(event); props.onInsertPavilion(); }}><span>Pavilion</span></button>
          </div>
        </details>
        <details className="app-menu" onToggle={keepOneMenuOpen}>
          <summary>View</summary>
          <div className="menu-popover">
            <button type="button" onClick={(event) => { closeMenu(event); props.onToggleExplorer(); }}>{props.explorerVisible ? "Hide" : "Show"} Explorer</button>
            <button type="button" onClick={(event) => { closeMenu(event); props.onToggleProperties(); }}>{props.propertiesVisible ? "Hide" : "Show"} Properties</button>
          </div>
        </details>
      </nav>

      <div className="menu-quick-actions" role="toolbar" aria-label="Quick access">
        <button type="button" className="menu-quick-button" title="Search commands (Ctrl+K)" aria-label="Search commands" onClick={() => runQuickAction(props.onCommandPalette)}>⌕</button>
        <button type="button" className="menu-quick-button" title="New document (Ctrl+N)" aria-label="New document" onClick={() => runQuickAction(props.onNew)}><ToolIcon name="New" fallback="+" /></button>
        <button type="button" className="menu-quick-button" title="Open document (Ctrl+O)" aria-label="Open document" onClick={() => runQuickAction(props.onOpen)}><ToolIcon name="Open" fallback="↗" /></button>
        <button type="button" className="menu-quick-button" title="Save local recovery copy (Ctrl+S)" aria-label="Save document" onClick={() => runQuickAction(props.onSave)}><ToolIcon name="Save" fallback="▣" /></button>
        <span className="menu-quick-divider" role="separator" aria-orientation="vertical" />
        <button type="button" className="menu-quick-button" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!props.canUndo} onClick={() => runQuickAction(props.onUndo)}><ToolIcon name="Undo" fallback="↶" /></button>
        <button type="button" className="menu-quick-button" title="Redo (Ctrl+Y)" aria-label="Redo" disabled={!props.canRedo} onClick={() => runQuickAction(props.onRedo)}><ToolIcon name="Redo" fallback="↷" /></button>
      </div>

      <div className="document-title" title={`${props.documentName} · ${props.saveStatus ?? (props.isModified ? "Unsaved changes" : "Saved")} · ${props.fileStatus ?? ""}`}>
        <span className={props.isModified ? "document-state document-state-modified" : "document-state"} aria-hidden="true" />
        <span className="document-name">{props.documentName}</span>
        {props.isModified && <span className="document-modified-label">Modified</span>}
      </div>

      <button type="button" className="menu-save-as" title={`Download WebCAD file (Ctrl+Shift+S) · ${props.fileStatus ?? "Download completion cannot be confirmed"}`} onClick={() => runQuickAction(props.onSaveAs)}>Download file</button>
    </header>
  );
}
