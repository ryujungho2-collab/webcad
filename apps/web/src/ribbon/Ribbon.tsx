import type { TransformMode, ViewportActionType } from "../viewport/CadViewport";

type RibbonProps = {
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
  canCreateBox: boolean;
  canDuplicate: boolean;
  canDelete: boolean;
  canTransform: boolean;
  projectionMode: "perspective" | "orthographic";
  gridVisible: boolean;
  transformMode: TransformMode | null;
  activeLayerName: string;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onCreateBox: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onHide: () => void;
  onIsolate: () => void;
  onShowAll: () => void;
  onTransformMode: (mode: TransformMode) => void;
  onViewAction: (action: ViewportActionType) => void;
  onToggleProjection: () => void;
  onToggleGrid: () => void;
};

type RibbonButtonProps = {
  icon: string;
  label: string;
  title?: string;
  disabled?: boolean;
  danger?: boolean;
  active?: boolean;
  onClick: () => void;
};

function RibbonButton({ icon, label, title, disabled, danger, active, onClick }: RibbonButtonProps) {
  return (
    <button
      type="button"
      className={`ribbon-command${danger ? " ribbon-command-danger" : ""}${active ? " ribbon-command-active" : ""}`}
      title={title ?? label}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="ribbon-command-icon" aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

export function Ribbon({
  canUndo,
  canRedo,
  hasSelection,
  canCreateBox,
  canDuplicate,
  canDelete,
  canTransform,
  projectionMode,
  gridVisible,
  transformMode,
  activeLayerName,
  onNew,
  onOpen,
  onSave,
  onUndo,
  onRedo,
  onCreateBox,
  onDuplicate,
  onDelete,
  onHide,
  onIsolate,
  onShowAll,
  onTransformMode,
  onViewAction,
  onToggleProjection,
  onToggleGrid,
}: RibbonProps) {
  return (
    <div className="ribbon">
      <div className="ribbon-tabs" role="tablist" aria-label="CAD tools">
        <button type="button" className="ribbon-tab ribbon-tab-active" role="tab" aria-selected="true">
          Home
        </button>
        {["Sketch", "Solid", "Surface", "Inspect"].map((label) => (
          <button
            key={label}
            type="button"
            className="ribbon-tab"
            role="tab"
            aria-selected="false"
            title={`${label} workspace is not available yet`}
            disabled
          >
            {label}
          </button>
        ))}
      </div>

      <div className="ribbon-body">
        <div className="ribbon-group">
          <div className="ribbon-commands">
            <RibbonButton icon="＋" label="New" title="New document (Ctrl+N)" onClick={onNew} />
            <RibbonButton icon="↗" label="Open" title="Open document (Ctrl+O)" onClick={onOpen} />
            <RibbonButton icon="▣" label="Save" title="Save document (Ctrl+S)" onClick={onSave} />
          </div>
          <span className="ribbon-group-label">Document</span>
        </div>

        <div className="ribbon-group">
          <div className="ribbon-commands">
            <RibbonButton icon="↶" label="Undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={onUndo} />
            <RibbonButton icon="↷" label="Redo" title="Redo (Ctrl+Y)" disabled={!canRedo} onClick={onRedo} />
          </div>
          <span className="ribbon-group-label">History</span>
        </div>

        <div className="ribbon-group">
          <div className="ribbon-commands">
            <RibbonButton icon="◇" label="Box" title={canCreateBox ? "Create box on active layer" : "Unlock the active layer to create geometry"} disabled={!canCreateBox} onClick={onCreateBox} />
          </div>
          <span className="ribbon-group-label">Create</span>
        </div>

        <div className="ribbon-group">
          <div className="ribbon-commands">
            <RibbonButton icon="⧉" label="Duplicate" disabled={!canDuplicate} onClick={onDuplicate} />
            <RibbonButton icon="⌫" label="Delete" title={hasSelection && !canDelete ? "Unlock the object's layer to delete it" : "Delete selection (Delete)"} disabled={!canDelete} danger onClick={onDelete} />
          </div>
          <span className="ribbon-group-label">Modify</span>
        </div>

        <div className="ribbon-group">
          <div className="ribbon-commands">
            <RibbonButton icon="→" label="Move" title="Move gizmo (G); use Properties for exact XYZ" active={transformMode === "translate"} disabled={!canTransform} onClick={() => onTransformMode("translate")} />
            <RibbonButton icon="↻" label="Rotate" title="Rotate gizmo (R); use Properties for exact angles" active={transformMode === "rotate"} disabled={!canTransform} onClick={() => onTransformMode("rotate")} />
            <RibbonButton icon="⤢" label="Scale" title="Scale gizmo (S); use Properties for exact factors" active={transformMode === "scale"} disabled={!canTransform} onClick={() => onTransformMode("scale")} />
          </div>
          <span className="ribbon-group-label">Transform</span>
        </div>

        <div className="ribbon-group ribbon-view-group">
          <div className="ribbon-commands">
            <RibbonButton icon="□" label="Fit" title="Fit all visible objects" onClick={() => onViewAction("fit-all")} />
            <RibbonButton icon="▣" label="Selection" title="Fit selected object" disabled={!hasSelection} onClick={() => onViewAction("fit-selection")} />
            <RibbonButton icon="T" label="Top" onClick={() => onViewAction("top")} />
            <RibbonButton icon="F" label="Front" onClick={() => onViewAction("front")} />
            <RibbonButton icon="R" label="Right" onClick={() => onViewAction("right")} />
            <RibbonButton icon="◇" label="Iso" title="Isometric view" onClick={() => onViewAction("isometric")} />
            <RibbonButton icon={projectionMode === "perspective" ? "P" : "O"} label={projectionMode === "perspective" ? "Perspective" : "Orthographic"} title="Toggle perspective / orthographic projection" onClick={onToggleProjection} />
            <RibbonButton icon="#" label="Grid" title={`${gridVisible ? "Hide" : "Show"} adaptive infinite grid`} onClick={onToggleGrid} />
          </div>
          <span className="ribbon-group-label">View</span>
        </div>

        <div className="ribbon-group">
          <div className="ribbon-commands">
            <RibbonButton icon="◌" label="Hide" title="Hide selected object" disabled={!hasSelection} onClick={onHide} />
            <RibbonButton icon="◎" label="Isolate" title="Show only the selected object" disabled={!hasSelection} onClick={onIsolate} />
            <RibbonButton icon="◉" label="Show All" title="Show all document objects" onClick={onShowAll} />
          </div>
          <span className="ribbon-group-label">Visibility</span>
        </div>

        <div className="ribbon-context" title="New objects are created on this layer">
          <span>Active layer</span>
          <strong>{activeLayerName}</strong>
        </div>
      </div>
    </div>
  );
}
