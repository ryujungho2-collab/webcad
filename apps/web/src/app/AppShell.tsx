import { useState, type ReactNode } from "react";
import { ActivityBar, type ActivityId } from "../activity/ActivityBar";
import { ExplorerPanel } from "../explorer/ExplorerPanel";
import { MenuBar } from "../menu/MenuBar";
import { Ribbon } from "../ribbon/Ribbon";
import { StatusBar } from "../status/StatusBar";
import type { DrawingTool, MeasurementTool, PointMeasurement, TransformMode, ViewportActionType } from "../viewport/CadViewport";
import type { WorkPlaneId } from "../precision/workPlane";
import type { WorkspaceMode } from "../viewport/workspaceTransition";
import type { KernelStatus } from "../viewport/kernelGeometryService";

type AppShellProps = {
  activeActivity: ActivityId;
  documentId: string;
  documentRevision: number;
  selectedLayerId: string;
  activeLayerName: string;
  selectedObjectId: string | null;
  selectedObjectIds: string[];
  canUndo: boolean;
  canRedo: boolean;
  canCreateBox: boolean;
  canDuplicate: boolean;
  canDelete: boolean;
  canTransform: boolean;
  isModified: boolean;
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
  kernelStatus: KernelStatus;
  onChangeActivity: (activity: ActivityId) => void;
  onSelectLayer: (layerId: string) => void;
  onSelectObject: (objectId: string, additive?: boolean) => void;
  onDocumentChange: () => void;
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
  onUndo: () => void;
  onRedo: () => void;
  onNew: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onOpen: () => void;
  children: ReactNode;
  properties: ReactNode;
};

export function AppShell(props: AppShellProps) {
  const [explorerCollapsed, setExplorerCollapsed] = useState(false);
  const [propertiesCollapsed, setPropertiesCollapsed] = useState(false);

  function changeActivity(activity: ActivityId) {
    setExplorerCollapsed((collapsed) => !collapsed);
    props.onChangeActivity(activity);
  }

  return (
    <main className="app-shell">
      <MenuBar
        documentName={props.documentId}
        canUndo={props.canUndo}
        canRedo={props.canRedo}
        isModified={props.isModified}
        onNew={props.onNew}
        onOpen={props.onOpen}
        onSave={props.onSave}
        onSaveAs={props.onSaveAs}
        onUndo={props.onUndo}
        onRedo={props.onRedo}
        explorerVisible={!explorerCollapsed}
        propertiesVisible={!propertiesCollapsed}
        onToggleExplorer={() => setExplorerCollapsed((value) => !value)}
        onToggleProperties={() => setPropertiesCollapsed((value) => !value)}
      />

      <Ribbon
        canUndo={props.canUndo}
        canRedo={props.canRedo}
        hasSelection={Boolean(props.selectedObjectId)}
        canCreateBox={props.canCreateBox}
        canDuplicate={props.canDuplicate}
        canDelete={props.canDelete}
        canTransform={props.canTransform}
        projectionMode={props.projectionMode}
        gridVisible={props.gridVisible}
        transformMode={props.transformMode}
        drawingTool={props.drawingTool}
        measurementTool={props.measurementTool}
        distanceMeasurement={props.distanceMeasurement}
        activeWorkPlane={props.activeWorkPlane}
        snapEnabled={props.snapEnabled}
        orthoEnabled={props.orthoEnabled}
        workspaceMode={props.workspaceMode}
        activeLayerName={props.activeLayerName}
        onNew={props.onNew}
        onOpen={props.onOpen}
        onSave={props.onSave}
        onUndo={props.onUndo}
        onRedo={props.onRedo}
        onCreateBox={props.onCreateBox}
        onCreatePrimitive={props.onCreatePrimitive}
        onDrawingTool={props.onDrawingTool}
        onMeasurementTool={props.onMeasurementTool}
        onCycleWorkPlane={props.onCycleWorkPlane}
        onToggleSnap={props.onToggleSnap}
        onToggleOrtho={props.onToggleOrtho}
        onWorkspaceMode={props.onWorkspaceMode}
        onDuplicate={props.onDuplicate}
        onDelete={props.onDelete}
        onHide={props.onHide}
        onIsolate={props.onIsolate}
        onShowAll={props.onShowAll}
        onTransformMode={props.onTransformMode}
        onViewAction={props.onViewAction}
        onToggleProjection={props.onToggleProjection}
        onToggleGrid={props.onToggleGrid}
        onAlign={props.onAlign}
        onDistribute={props.onDistribute}
      />

      <div className={`workbench${explorerCollapsed ? " explorer-collapsed" : ""}${propertiesCollapsed ? " properties-collapsed" : ""}`}>
        <ActivityBar activeActivity={props.activeActivity} onChange={changeActivity} />
        <ExplorerPanel
          activeActivity={props.activeActivity}
          documentRevision={props.documentRevision}
          selectedLayerId={props.selectedLayerId}
          selectedObjectId={props.selectedObjectId}
          selectedObjectIds={props.selectedObjectIds}
          onSelectLayer={props.onSelectLayer}
          onSelectObject={props.onSelectObject}
          onDocumentChange={props.onDocumentChange}
        />

        <section className="workbench-viewport">
          {props.children}
          <button className="panel-toggle panel-toggle-left" type="button" onClick={() => setExplorerCollapsed((collapsed) => !collapsed)} title={`${explorerCollapsed ? "Show" : "Hide"} Explorer`} aria-label={`${explorerCollapsed ? "Show" : "Hide"} Explorer`}>{explorerCollapsed ? "›" : "‹"}</button>
          <button className="panel-toggle panel-toggle-right" type="button" onClick={() => setPropertiesCollapsed((collapsed) => !collapsed)} title={`${propertiesCollapsed ? "Show" : "Hide"} Properties`} aria-label={`${propertiesCollapsed ? "Show" : "Hide"} Properties`}>{propertiesCollapsed ? "‹" : "›"}</button>
          <div className="viewport-label"><strong>{props.projectionMode === "perspective" ? "Perspective" : "Orthographic"}</strong><span>Shaded</span></div>
          <div className="view-triad" aria-label="World axes">
            <span className="axis-z">Z</span><span className="axis-y">Y</span><span className="axis-x">X</span><i />
          </div>
          <div className="navigation-hint"><span>Orbit</span> LMB <b>·</b> <span>Pan</span> RMB <b>·</b> <span>Zoom</span> wheel <b>·</b> <span>G / R / S</span> transform <b>·</b> <span>Esc</span> cancel</div>
        </section>

        <aside className="workbench-properties">{props.properties}</aside>
      </div>

      <StatusBar
        selectedObjectId={props.selectedObjectId}
        selectedObjectIds={props.selectedObjectIds}
        selectedLayerId={props.selectedLayerId}
        canUndo={props.canUndo}
        isModified={props.isModified}
        gridVisible={props.gridVisible}
        kernelStatus={props.kernelStatus}
        snapEnabled={props.snapEnabled}
        orthoEnabled={props.orthoEnabled}
        activeWorkPlane={props.activeWorkPlane}
        distanceMeasurement={props.distanceMeasurement}
      />
    </main>
  );
}
