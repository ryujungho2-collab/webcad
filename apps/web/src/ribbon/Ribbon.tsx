import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import type { DrawingTool, MeasurementTool, TransformMode, ViewportActionType, PointMeasurement } from "../viewport/CadViewport";
import type { WorkPlaneId } from "../precision/workPlane";
import type { WorkspaceMode } from "../viewport/workspaceTransition";
import { ToolIcon } from "../ui/ToolIcon";
import { interactionTools } from "../commands/interactionTools";

type RibbonProps = {
  onCurveWorkflow?: () => void;
  canCurveWorkflow?: boolean;
  onConstruction?: () => void;
  onAngularDimension?: () => void;
  constructionVisible?: boolean;
  onToggleConstruction?: () => void;
  canContour?: Partial<Record<import("../features/drawing-editing/contracts").ContourMode, boolean>>;
  onContour?: (mode: import("../features/drawing-editing/contracts").ContourMode) => void;
  canPattern?:boolean;
  onPattern?:(kind:"linear"|"radial"|"mirror")=>void;
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
  isolationActive?: boolean;
  canCreateBox: boolean;
  canDuplicate: boolean;
  canDelete: boolean;
  canTransform: boolean;
  canArrange: boolean;
  canDistribute: boolean;
  canExtrude: boolean;
  canRevolve: boolean;
  projectionMode: "perspective" | "orthographic";
  gridVisible: boolean;
  transformMode: TransformMode | null;
  pointTransformMode?: "move" | "copy" | "rotate" | null;
  drawingTool: DrawingTool | null;
  measurementTool: MeasurementTool | null;
  distanceMeasurement: PointMeasurement | null;
  activeWorkPlane: WorkPlaneId;
  snapEnabled: boolean;
  orthoEnabled: boolean;
  workspaceMode: WorkspaceMode;
  directSelectMode: boolean;
  activeLayerName: string;
  activeSketchId?: string | null;
  onToggleSketch?: () => void;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onCreateBox: () => void;
  onCreatePrimitive: (primitive: "cylinder" | "sphere" | "cone" | "torus") => void;
  onExtrude: () => void;
  onRevolve: () => void;
  onDrawingTool: (tool: DrawingTool) => void;
  onMeasurementTool: () => void;
  onCycleWorkPlane: () => void;
  onToggleSnap: () => void;
  onToggleOrtho: () => void;
  onWorkspaceMode: (mode: WorkspaceMode) => void;
  onDirectSelectMode: (enabled: boolean) => void;
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
  canTrim?: boolean;
  lineEditTool?: "trim" | "extend" | null;
  onLineEditTool?: (mode: "trim" | "extend") => void;
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
      aria-label={label}
      disabled={disabled}
      aria-pressed={active}
      onClick={onClick}
    >
      <span className="ribbon-command-icon" aria-hidden="true"><ToolIcon name={label} fallback={icon} /></span>
      <span>{label}</span>
    </button>
  );
}

type ToolTab = "draw" | "model" | "modify" | "view";
const toolTabs: { id: ToolTab; label: string }[] = [
  { id: "draw", label: "Draw" }, { id: "model", label: "Model" },
  { id: "modify", label: "Modify" }, { id: "view", label: "View" },
];

function ToolGroup({ label, children }: { label: string; children: ReactNode }) {
  return <div className="ribbon-group"><div className="ribbon-commands">{children}</div><span className="ribbon-group-label">{label}</span></div>;
}

export function Ribbon(props: RibbonProps) {
  const [tab, setTab] = useState<ToolTab>(props.workspaceMode === "2d" ? "draw" : "model");
  useEffect(() => { setTab(props.workspaceMode === "2d" || props.activeSketchId ? "draw" : "model"); }, [props.workspaceMode, props.activeSketchId]);
  useEffect(() => { if (props.drawingTool) setTab("draw"); }, [props.drawingTool]);
  useEffect(() => { if (props.transformMode || props.pointTransformMode || props.lineEditTool) setTab("modify"); }, [props.transformMode, props.pointTransformMode, props.lineEditTool]);
  useEffect(() => { if (props.measurementTool) setTab("view"); }, [props.measurementTool]);

  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === "ArrowRight" ? (index + 1) % toolTabs.length
      : event.key === "ArrowLeft" ? (index + toolTabs.length - 1) % toolTabs.length
      : event.key === "Home" ? 0 : event.key === "End" ? toolTabs.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    setTab(toolTabs[next].id);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }

  return (
    <div className="ribbon">
      <div className="ribbon-tabs">
        <div className="workspace-switch" role="group" aria-label="Dimensional workspace">
          <button type="button" aria-label="2D" title="2D drafting · orthographic on the active work plane" className={props.workspaceMode === "2d" ? "workspace-switch-active" : ""} aria-pressed={props.workspaceMode === "2d"} onClick={() => props.onWorkspaceMode("2d")}>2D <span>Draft</span></button>
          <button type="button" aria-label="3D" title={props.activeSketchId ? "Finish sketch editing and enter 3D" : "3D modeling"} className={props.workspaceMode === "3d" ? "workspace-switch-active" : ""} aria-pressed={props.workspaceMode === "3d"} onClick={() => props.onWorkspaceMode("3d")}>3D <span>Model</span></button>
        </div>
        <div className="command-tabs" role="tablist" aria-label="Tool groups">
          {toolTabs.map((entry, index) => <button key={entry.id} id={`tools-tab-${entry.id}`} type="button" role="tab" aria-selected={tab === entry.id} aria-controls="tools-panel" tabIndex={tab === entry.id ? 0 : -1} className={`ribbon-tab${tab === entry.id ? " ribbon-tab-active" : ""}`} onClick={() => setTab(entry.id)} onKeyDown={(event) => navigateTabs(event, index)}>{entry.label}</button>)}
        </div>
        <div className="workspace-context">
          {props.activeSketchId ? <><span className="workspace-mode-badge">Sketch</span><span>{props.activeSketchId}</span></> : <span>{props.workspaceMode === "2d" ? "Drafting" : "Solid modeling"}</span>}
          <span className="workspace-plane">{props.activeWorkPlane}</span>
          <span>mm</span>
        </div>
      </div>

      <div id="tools-panel" role="tabpanel" aria-labelledby={`tools-tab-${tab}`} className="ribbon-body">
        <ToolGroup label="Selection">
          <RibbonButton icon="◇" label="Object" title="Select whole objects · Shift / Ctrl / Cmd to toggle" active={!props.directSelectMode} onClick={() => props.onDirectSelectMode(false)} />
          <RibbonButton icon="•" label="Direct" title="Select drawing controls or solid edges and faces (F2)" active={props.directSelectMode} onClick={() => props.onDirectSelectMode(true)} />
        </ToolGroup>

        {(tab === "draw" || tab === "model" || props.activeSketchId) && <ToolGroup label="Sketch">
          <RibbonButton icon="⌗" label={props.activeSketchId ? "Finish" : "Sketch"} title={props.activeSketchId ? "Finish sketch editing" : `Create sketch on ${props.activeWorkPlane}`} active={Boolean(props.activeSketchId)} disabled={!props.activeSketchId && !props.canCreateBox} onClick={() => props.onToggleSketch?.()} />
        </ToolGroup>}

        {tab === "draw" && <>
          <ToolGroup label={props.activeSketchId ? "Sketch geometry" : "Drawing geometry"}>
            <RibbonButton icon="╱" label="Line" title="Draw line (L)" active={props.drawingTool === "line"} disabled={!props.canCreateBox} onClick={() => props.onDrawingTool("line")} />
            <RibbonButton icon="⌁" label="Polyline" title="Draw polyline (P) · Enter to finish" active={props.drawingTool === "polyline"} disabled={!props.canCreateBox} onClick={() => props.onDrawingTool("polyline")} />
            <RibbonButton icon="▭" label="Rectangle" title="Draw rectangle (R) · selection does not change the shortcut" active={props.drawingTool === "rectangle"} disabled={!props.canCreateBox} onClick={() => props.onDrawingTool("rectangle")} />
            <RibbonButton icon="○" label="Circle" title="Draw circle (C)" active={props.drawingTool === "circle"} disabled={!props.canCreateBox} onClick={() => props.onDrawingTool("circle")} />
            <RibbonButton icon="⌒" label="Arc" title="Draw arc (A)" active={props.drawingTool === "arc"} disabled={!props.canCreateBox} onClick={() => props.onDrawingTool("arc")} />
            <RibbonButton icon="⊥" label="Construction" title="Points, infinite lines, rays and saved construction relationships" disabled={!props.canCreateBox || Boolean(props.activeSketchId)} onClick={() => props.onConstruction?.()} />
            <RibbonButton icon="◉" label={props.constructionVisible === false ? "Show construction" : "Hide construction"} title="Toggle construction geometry in the canvas without changing the document" active={props.constructionVisible !== false} onClick={() => props.onToggleConstruction?.()} />
          </ToolGroup>
          <ToolGroup label="Measure">
            <RibbonButton icon="↔" label="Distance" title="Measure between two points (I)" active={props.measurementTool === "distance"} onClick={props.onMeasurementTool} />
            <RibbonButton icon="∠" label="Angular Dimension" title="Choose two straight edges, angle region and arc radius" disabled={!props.canCreateBox || Boolean(props.activeSketchId)} onClick={() => props.onAngularDimension?.()} />
          </ToolGroup>
        </>}

        {tab === "model" && <>
          <ToolGroup label="Primitives">
            <RibbonButton icon="◇" label="Box" title={props.canCreateBox ? "Create box on active layer" : "Unlock the active layer to create geometry"} disabled={!props.canCreateBox || Boolean(props.activeSketchId)} onClick={props.onCreateBox} />
            {(["cylinder", "sphere", "cone", "torus"] as const).map((primitive) => <RibbonButton key={primitive} icon="◇" label={primitive[0].toUpperCase() + primitive.slice(1)} title={`Create ${primitive} on active layer`} disabled={!props.canCreateBox || Boolean(props.activeSketchId)} onClick={() => props.onCreatePrimitive(primitive)} />)}
          </ToolGroup>
          <ToolGroup label="Profile to solid">
            <RibbonButton icon="▰" label="Extrude" title={props.canExtrude ? "Extrude selected closed profile 10 mm (E)" : "Select a closed profile or connected closed chain"} disabled={!props.canExtrude || Boolean(props.activeSketchId)} onClick={props.onExtrude} />
            <RibbonButton icon="◉" label="Revolve" title={props.canRevolve ? "Revolve selected closed profile 360° around the work-plane X axis" : "Select a closed profile or connected closed chain"} disabled={!props.canRevolve || Boolean(props.activeSketchId)} onClick={props.onRevolve} />
          </ToolGroup>
        </>}

        {tab === "modify" && <>
          <ToolGroup label="Transform">
            <RibbonButton icon="→" label="Move" title="Move selection with gizmo · M or G uses base/target points in 2D" active={props.transformMode === "translate"} disabled={!props.canTransform} onClick={() => props.onTransformMode("translate")} />
            <RibbonButton icon="↻" label="Rotate" title="Rotate selection with gizmo · Shift+R uses a chosen centre in 2D" active={props.transformMode === "rotate"} disabled={!props.canTransform} onClick={() => props.onTransformMode("rotate")} />
            <RibbonButton icon="⤢" label="Scale" title="Scale selection (S)" active={props.transformMode === "scale"} disabled={!props.canTransform} onClick={() => props.onTransformMode("scale")} />
          </ToolGroup>
          <ToolGroup label="Edit">
            <RibbonButton icon="⌁" label="Curve workflow" title="Connected Offset, Trim/Extend, Fillet/Chamfer and Join with exact previews and next actions" disabled={!props.canCurveWorkflow} onClick={() => props.onCurveWorkflow?.()} />
            <RibbonButton icon="⤳" label="Join" title="Join connected lines, arcs and open polylines; preview before replacing" disabled={!props.canContour?.join} onClick={() => props.onContour?.("join")} />
            <RibbonButton icon="⋈" label="Explode" title="Separate polylines and rectangles into exact lines and arcs" disabled={!props.canContour?.explode} onClick={() => props.onContour?.("explode")} />
            <RibbonButton icon="✂" label="Break" title="Split at one exact point or remove a gap between two points" disabled={!props.canContour?.break} onClick={() => props.onContour?.("break")} />
            <RibbonButton icon="⋯" label="Edit polyline" title="Insert/delete vertices or open/close a polyline with a canvas preview" disabled={!props.canContour?.polyline} onClick={() => props.onContour?.("polyline")} />
            <RibbonButton icon="↔" label="Lengthen" title="Set total, delta or percentage length; pick or drag an endpoint" disabled={!props.canContour?.lengthen} onClick={() => props.onContour?.("lengthen")} />
            <RibbonButton icon="⤢" label="Stretch" title="Move vertices inside a crossing area. With no selection, use visible unlocked drawings on the active plane" disabled={!props.canContour?.stretch} onClick={() => props.onContour?.("stretch")} />
            <RibbonButton icon="⧉" label="Duplicate" title="Duplicate (Ctrl+D) · move the copy, then repeat its spacing" disabled={!props.canDuplicate} onClick={props.onDuplicate} />
            <RibbonButton icon="⌫" label="Delete" title="Delete selection (Delete)" disabled={!props.canDelete} danger onClick={props.onDelete} />
          </ToolGroup>
          <ToolGroup label="Patterns">
            {interactionTools.filter(tool=>tool.id.startsWith("pattern-")).map(tool=><RibbonButton key={tool.id} icon={tool.icon} label={tool.label} title={tool.hint} disabled={!props.canPattern} onClick={()=>props.onPattern?.(tool.id.slice(8) as "linear"|"radial"|"mirror")} />)}
          </ToolGroup>
          {(props.workspaceMode === "2d" || props.canTrim || props.lineEditTool) && <ToolGroup label="Drawing edits">
            <RibbonButton icon="✂" label="Trim" title="Select a drawing boundary, then click a line portion to remove (T)" disabled={!props.canTrim} active={props.lineEditTool === "trim"} onClick={() => props.onLineEditTool?.("trim")} />
            <RibbonButton icon="↦" label="Extend" title="Select a drawing boundary, then click a line endpoint to extend" disabled={!props.canTrim} active={props.lineEditTool === "extend"} onClick={() => props.onLineEditTool?.("extend")} />
          </ToolGroup>}
          {props.canArrange && <ToolGroup label={`Align · ${props.activeWorkPlane}`}>
            {([["left", "Align L", "⇤"], ["center-x", "Center X", "↔"], ["right", "Align R", "⇥"], ["top", "Align T", "⇑"], ["center-y", "Center Y", "⇕"], ["bottom", "Align B", "⇓"]] as const).map(([mode, label, icon]) => <RibbonButton key={mode} icon={icon} label={label} disabled={!props.onAlign} onClick={() => props.onAlign?.(mode)} />)}
          </ToolGroup>}
          {props.canArrange && <ToolGroup label="Distribute">
            <RibbonButton icon="⇅" label="Dist H" title="Distribute horizontally with equal spacing" disabled={!props.canDistribute || !props.onDistribute} onClick={() => props.onDistribute?.("horizontal")} />
            <RibbonButton icon="⇳" label="Dist V" title="Distribute vertically with equal spacing" disabled={!props.canDistribute || !props.onDistribute} onClick={() => props.onDistribute?.("vertical")} />
          </ToolGroup>}
        </>}

        {tab === "view" && <>
          <ToolGroup label="Frame">
            <RibbonButton icon="□" label="Fit" title="Fit all visible objects" onClick={() => props.onViewAction("fit-all")} />
            <RibbonButton icon="▣" label="Selection" title="Fit complete selection" disabled={!props.hasSelection} onClick={() => props.onViewAction("fit-selection")} />
          </ToolGroup>
          <ToolGroup label="Orientation">
            {([["top", "Top", "T"], ["front", "Front", "F"], ["right", "Right", "R"], ["isometric", "Iso", "◇"]] as const).map(([action, label, icon]) => <RibbonButton key={action} icon={icon} label={label} disabled={props.workspaceMode === "2d"} title={props.workspaceMode === "2d" ? "2D view follows the active work plane · switch to 3D for other views" : `${label} view`} onClick={() => props.onViewAction(action)} />)}
            <RibbonButton icon={props.projectionMode === "perspective" ? "P" : "O"} label={props.projectionMode === "perspective" ? "Perspective" : "Orthographic"} title={props.workspaceMode === "2d" ? "2D drafting uses orthographic projection" : "Toggle perspective / orthographic projection"} disabled={props.workspaceMode === "2d"} onClick={props.onToggleProjection} />
          </ToolGroup>
          <ToolGroup label="Visibility">
            <RibbonButton icon="◌" label="Hide" title="Hide selection" disabled={!props.hasSelection} onClick={props.onHide} />
            <RibbonButton icon="◎" label={props.isolationActive ? "Exit Isolation" : "Isolate"} title={props.isolationActive ? "Restore visibility before isolation" : "Show only selected objects"} disabled={!props.hasSelection && !props.isolationActive} onClick={props.onIsolate} />
            <RibbonButton icon="◉" label="Show All" title="Show all document objects" onClick={props.onShowAll} />
          </ToolGroup>
          <ToolGroup label="Measure"><RibbonButton icon="↔" label="Distance" title="Measure between two points (I)" active={props.measurementTool === "distance"} onClick={props.onMeasurementTool} /><RibbonButton icon="∠" label="Angular Dimension" title="Choose two straight edges, angle region and arc radius" disabled={!props.canCreateBox || Boolean(props.activeSketchId)} onClick={() => props.onAngularDimension?.()} /></ToolGroup>
        </>}

        <div className="ribbon-context" title="New objects are created on this layer">
          <span>Active layer</span><strong>{props.activeLayerName}</strong>
          {!props.canCreateBox && <small>Layer locked</small>}
        </div>
      </div>
    </div>
  );
}
