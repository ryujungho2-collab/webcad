import type { DrawingTool, MeasurementTool, TransformMode, ViewportActionType, PointMeasurement } from "../viewport/CadViewport";
import type { WorkPlaneId } from "../precision/workPlane";
import type { WorkspaceMode } from "../viewport/workspaceTransition";
import { ToolIcon } from "../ui/ToolIcon";

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
  drawingTool: DrawingTool | null;
  measurementTool: MeasurementTool | null;
  distanceMeasurement: PointMeasurement | null;
  activeWorkPlane: WorkPlaneId;
  snapEnabled: boolean;
  orthoEnabled: boolean;
  workspaceMode: WorkspaceMode;
  activeLayerName: string;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onCreateBox: () => void;
  onCreatePrimitive: (primitive: "cylinder" | "sphere" | "cone" | "torus") => void;
  onDrawingTool: (tool: DrawingTool) => void;
  onMeasurementTool: () => void;
  onCycleWorkPlane: () => void;
  onToggleSnap: () => void;
  onToggleOrtho: () => void;
  onWorkspaceMode: (mode: WorkspaceMode) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onHide: () => void;
  onIsolate: () => void;
  onShowAll: () => void;
  onTransformMode: (mode: TransformMode) => void;
  onViewAction: (action: ViewportActionType) => void;
  onToggleProjection: () => void;
  onToggleGrid: () => void;
  onAlign?: (mode: "left" | "center-x" | "right" | "top" | "center-y" | "bottom") => void;
  onDistribute?: (axis: "horizontal" | "vertical") => void;
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
      aria-pressed={active}
      onClick={onClick}
    >
      <span className="ribbon-command-icon" aria-hidden="true"><ToolIcon name={label} fallback={icon} /></span>
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
  drawingTool,
  measurementTool,
  activeWorkPlane,
  snapEnabled,
  orthoEnabled,
  workspaceMode,
  activeLayerName,
  onNew,
  onOpen,
  onSave,
  onUndo,
  onRedo,
  onCreateBox,
  onCreatePrimitive,
  onDrawingTool,
  onMeasurementTool,
  onCycleWorkPlane,
  onToggleSnap,
  onToggleOrtho,
  onWorkspaceMode,
  onDuplicate,
  onDelete,
  onHide,
  onIsolate,
  onShowAll,
  onTransformMode,
  onViewAction,
  onToggleProjection,
  onToggleGrid,
  onAlign,
  onDistribute,
}: RibbonProps) {
  return (
    <div className="ribbon">
      <div className="ribbon-tabs" aria-label="Model workspace">
        <span className="workspace-label">{workspaceMode === "2d" ? "DRAFT" : "MODEL"}</span>
        <span className="workspace-description">{workspaceMode === "2d" ? "2D drafting · " : "Solid modeling · "}millimeters</span>
        <div className="workspace-switch" role="group" aria-label="Dimensional workspace">
          <button type="button" className={workspaceMode === "2d" ? "workspace-switch-active" : ""} aria-pressed={workspaceMode === "2d"} onClick={() => onWorkspaceMode("2d")}>2D</button>
          <button type="button" className={workspaceMode === "3d" ? "workspace-switch-active" : ""} aria-pressed={workspaceMode === "3d"} onClick={() => onWorkspaceMode("3d")}>3D</button>
        </div>
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
            <RibbonButton icon="○" label="Cylinder" title="Create cylinder on active layer" disabled={!canCreateBox} onClick={() => onCreatePrimitive("cylinder")} />
            <RibbonButton icon="●" label="Sphere" title="Create sphere on active layer" disabled={!canCreateBox} onClick={() => onCreatePrimitive("sphere")} />
            <RibbonButton icon="△" label="Cone" title="Create cone on active layer" disabled={!canCreateBox} onClick={() => onCreatePrimitive("cone")} />
            <RibbonButton icon="⊘" label="Torus" title="Create torus on active layer" disabled={!canCreateBox} onClick={() => onCreatePrimitive("torus")} />
          </div>
          <span className="ribbon-group-label">Create</span>
        </div>

        <div className="ribbon-group">
          <div className="ribbon-commands">
            <RibbonButton icon="╱" label="Line" active={drawingTool === "line"} disabled={!canCreateBox} onClick={() => onDrawingTool("line")} />
            <RibbonButton icon="⌁" label="Polyline" active={drawingTool === "polyline"} disabled={!canCreateBox} onClick={() => onDrawingTool("polyline")} />
            <RibbonButton icon="▭" label="Rectangle" active={drawingTool === "rectangle"} disabled={!canCreateBox} onClick={() => onDrawingTool("rectangle")} />
            <RibbonButton icon="○" label="Circle" active={drawingTool === "circle"} disabled={!canCreateBox} onClick={() => onDrawingTool("circle")} />
            <RibbonButton icon="⌒" label="Arc" active={drawingTool === "arc"} disabled={!canCreateBox} onClick={() => onDrawingTool("arc")} />
          </div>
          <span className="ribbon-group-label">Draw</span>
        </div>

        <div className="ribbon-group">
          <div className="ribbon-commands">
            <RibbonButton icon="⊙" label="Snap" title="Object snap (F3)" active={snapEnabled} onClick={onToggleSnap} />
            <RibbonButton icon="└" label="Ortho" title="Orthogonal constraint (F8)" active={orthoEnabled} onClick={onToggleOrtho} />
            <RibbonButton icon="▱" label={activeWorkPlane} title="Cycle active work plane" onClick={onCycleWorkPlane} />
          </div>
          <span className="ribbon-group-label">Precision</span>
        </div>

        <div className="ribbon-group">
          <div className="ribbon-commands">
            <RibbonButton icon="↔" label="Distance" title="Measure distance between two points" active={measurementTool === "distance"} onClick={onMeasurementTool} />
          </div>
          <span className="ribbon-group-label">Measure</span>
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
            <RibbonButton icon="#" label="Grid" active={gridVisible} title={`${gridVisible ? "Hide" : "Show"} adaptive infinite grid`} onClick={onToggleGrid} />
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

        <div className="ribbon-group">
          <div className="ribbon-commands">
            <RibbonButton icon="⇤" label="Align L" disabled={!hasSelection || !onAlign} onClick={() => onAlign?.("left")} />
            <RibbonButton icon="↔" label="Center X" disabled={!hasSelection || !onAlign} onClick={() => onAlign?.("center-x")} />
            <RibbonButton icon="⇥" label="Align R" disabled={!hasSelection || !onAlign} onClick={() => onAlign?.("right")} />
            <RibbonButton icon="⇅" label="Dist H" disabled={!hasSelection || !onDistribute} onClick={() => onDistribute?.("horizontal")} />
          </div>
          <span className="ribbon-group-label">Arrange</span>
        </div>

        <div className="ribbon-context" title="New objects are created on this layer">
          <span>Active layer</span>
          <strong>{activeLayerName}</strong>
        </div>
      </div>
    </div>
  );
}
