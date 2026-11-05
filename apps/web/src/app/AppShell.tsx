import { useEffect, useState, type ReactNode } from "react";
import { CommandPalette } from "../commands/CommandPalette";
import { createPaletteCommands } from "../commands/paletteCommands";
import { isCompositionKey, isCadKeyboardBlocked } from "../input/shortcutRouter";
import { ActivityBar, type ActivityId } from "../activity/ActivityBar";
import { ExplorerPanel } from "../explorer/ExplorerPanel";
import type { CopilotPanelProps } from "../copilot/CopilotPanel";
import { MenuBar } from "../menu/MenuBar";
import { Ribbon } from "../ribbon/Ribbon";
import { StatusBar } from "../status/StatusBar";
import type { DrawingTool, MeasurementTool, PointMeasurement, TransformMode, ViewportActionType } from "../viewport/CadViewport";
import type { WorkPlaneId } from "../precision/workPlane";
import type { WorkspaceMode } from "../viewport/workspaceTransition";
import type { KernelStatus } from "../cad/kernelGeometryService";
import { ToolIcon } from "../ui/ToolIcon";
import { useCompactComparison } from "./useCompactComparison";
import "../ui/projectComparison.css";
import "../ui/accessibility.css";
import {SelectionToolbar} from "../ui/SelectionToolbar";
import {selectionContext} from "../commands/selectionContext";
import {cadDocument} from "../state/cadDocument";
import {InspectorSectionScope} from "../ui/PropertySection";

export type AppShellProps = {
  onCurveLayout?:()=>void;
  onRepeatCommand?:()=>void;
  frameToolsBusy?:boolean;
  onFrameAction?:(action:"edit"|"links"|"sheets")=>void;
  onAssembly?:()=>void;
  onModelViews?: () => void;
  onRecallModelView?: (viewId: string) => void;
  onAddText?: () => void;
  onDrafting?: () => void;
  onCurveWorkflow?: () => void;
  canCurveWorkflow?: boolean;
  onCadPilot?: (mode:import("../viewport/CadPilotTool").CadPilotMode)=>void;
  activeUcsName?:string;
  onEndpointRadiusArc?: () => void;
  onRegularPolygon?: () => void;
  onSpline?:()=>void;
  onEllipse?:()=>void;
  onConstruction?: () => void;
  onAngularDimension?: () => void;
  constructionVisible?: boolean;
  onToggleConstruction?: () => void;
  canContour?: Partial<Record<import("../features/drawing-editing/contracts").ContourMode, boolean>>;
  onContour?: (mode: import("../features/drawing-editing/contracts").ContourMode) => void;
  canDisbandBlock?: boolean;
  onDisbandBlock?: () => void;
  canPattern?:boolean;
  onPattern?:(kind:"linear"|"radial"|"mirror")=>void;
  activeActivity: ActivityId;
  activeArtboardId: string | null;
  activeArtboardName?: string;
  hasVisibleArtboards: boolean;
  onActivateArtboard: (id: string | null, options?: { keepSelection?: boolean }) => void;
  onNavigateProject: (key:string)=>void;
  onInsertComponent: (blockId: string) => void;
  documentId: string;
  documentRevision: number;
  selectedLayerId: string;
  activeLayerName: string;
  activeSketchId?: string | null;
  onToggleSketch?: () => void;
  onEditSketch?: (id: string) => void;
  selectedObjectId: string | null;
  selectedObjectIds: string[];
  isolationActive?: boolean;
  canUndo: boolean;
  canRedo: boolean;
  canCreateBox: boolean;
  canDuplicate: boolean;
  canDelete: boolean;
  canTransform: boolean;
  canArrange: boolean;
  canDistribute: boolean;
  canExtrude: boolean;
  canRevolve: boolean;
  canSweep?: boolean;
  canLoft?: boolean;
  canBuild?: boolean;
  onSweep?: () => void;
  onLoft?: () => void;
  onBuildHouse?: () => void;
  onBuildApartment?: () => void;
  canTrim?: boolean;
  onOffset: () => void;
  lineEditTool?: "trim" | "extend" | null;
  isModified: boolean;
  saveStatus?: string;
  fileStatus?: string;
  projectionMode: "perspective" | "orthographic";
  gridVisible: boolean;
  transformMode: TransformMode | null;
  pointTransformMode?: "move" | "copy" | "rotate" | null;
  drawingTool: DrawingTool | null;
  measurementTool: MeasurementTool | null;
  distanceMeasurement: PointMeasurement | null;
  activeWorkPlane: WorkPlaneId;
  snapEnabled: boolean;
  snapPreferences?: import("../precision/snapPreferences").SnapPreferences;
  onSnapPreferencesChange?: (value: import("../precision/snapPreferences").SnapPreferences) => void;
  orthoEnabled: boolean;
  workspaceMode: WorkspaceMode;
  directSelectMode: boolean;
  kernelStatus: KernelStatus;
  onChangeActivity: (activity: ActivityId) => void;
  onSelectLayer: (layerId: string) => void;
  onSelectObject: (objectId: string | null, additive?: boolean) => void;
  onDocumentChange: () => void;
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
  onPointTransform?: (mode: "move" | "copy" | "rotate") => void;
  onViewAction: (action: ViewportActionType, artboardId?: string) => void;
  onToggleProjection: () => void;
  onToggleGrid: () => void;
  onAlign?: (mode: "left" | "center-x" | "right" | "top" | "center-y" | "bottom") => void;
  onDistribute?: (axis: "horizontal" | "vertical") => void;
  onLineEditTool?: (mode: "trim" | "extend") => void;
  onUndo: () => void;
  onRedo: () => void;
  onNew: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onOpen: () => void;
  onExportStl?: () => void;
  onExportSvg?: () => void;
  onExportArtboardSvg?: () => void;
  onExportArtboardPng?: () => void;
  onOutputPreflight?:()=>void;
  onExportArtboardPdf?: () => void;
  onExportDxf?: () => void;
  onExportStep?: () => void;
  onExportGlb?: () => void;
  solidEdgesVisible?: boolean;
  onToggleSolidEdges?: () => void;
  onImportFixture?: () => void;
  onExportFixture?: () => void;
  onImportDxf?: () => void;
  onFloorTasks?:()=>void;
  onImportImage?: () => void;
  onPlot?: () => void;
  canDimension?: boolean;
  onDimension?: () => void;
  onInsertPavilion: () => void;
  copilot?: CopilotPanelProps;
  children: ReactNode;
  properties: ReactNode;
};

export function AppShell(props: AppShellProps) {
  const [normalExplorerCollapsed, setExplorerCollapsed] = useState(false);
  const [normalPropertiesCollapsed, setPropertiesCollapsed] = useState(false);
  const compact=useCompactComparison(),[compactPanel,setCompactPanel]=useState<"explorer"|"properties"|null>(null);
  const explorerCollapsed=compact?compactPanel!=="explorer":normalExplorerCollapsed;
  const propertiesCollapsed=compact?compactPanel!=="properties":normalPropertiesCollapsed;
  const toggleExplorer=()=>{if(compact)setCompactPanel(panel=>panel==="explorer"?null:"explorer");else setExplorerCollapsed(value=>!value);};
  const toggleProperties=()=>{if(compact)setCompactPanel(panel=>panel==="properties"?null:"properties");else setPropertiesCollapsed(value=>!value);};
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    function openPalette(event: KeyboardEvent) {
      if (isCompositionKey(event) || event.repeat || event.altKey || event.shiftKey || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "k") return;
      if (isCadKeyboardBlocked(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setPaletteOpen(true);
    }
    window.addEventListener("keydown", openPalette, true);
    return () => window.removeEventListener("keydown", openPalette, true);
  }, []);

  const paletteCommands = createPaletteCommands(props, {
    inspectSelection:()=>{if(compact)setCompactPanel("properties");else setPropertiesCollapsed(false);requestAnimationFrame(()=>document.querySelector<HTMLElement>(".workbench-properties input:not(:disabled), .workbench-properties button:not(:disabled)")?.focus());},
    toggleExplorer,
    toggleProperties,
    openActivity: (activity) => { if(compact)setCompactPanel("explorer");else setExplorerCollapsed(false); props.onChangeActivity(activity); },
  });

  function changeActivity(activity: ActivityId) {
    // A different activity is a navigation request and must reveal its panel.
    // Clicking the already-active activity is the compact CAD/VS Code-style
    // shortcut for toggling the Explorer without hunting for the edge button.
    if(compact)setCompactPanel(panel=>activity===props.activeActivity&&panel==="explorer"?null:"explorer");
    else setExplorerCollapsed((collapsed) => activity === props.activeActivity ? !collapsed : false);
    props.onChangeActivity(activity);
  }

  return (
    <main className="app-shell">
      {paletteOpen && <CommandPalette commands={paletteCommands} onClose={() => setPaletteOpen(false)} />}
      <MenuBar
        onCommandPalette={() => setPaletteOpen(true)}
        documentName={props.documentId}
        canUndo={props.canUndo}
        canRedo={props.canRedo}
        isModified={props.isModified}
        saveStatus={props.saveStatus}
        fileStatus={props.fileStatus}
        onNew={props.onNew}
        onOpen={props.onOpen}
        onSave={props.onSave}
        onSaveAs={props.onSaveAs}
        onExportStl={() => props.onExportStl?.()}
        onExportSvg={() => props.onExportSvg?.()}
        onExportArtboardSvg={() => props.onExportArtboardSvg?.()}
        onExportArtboardPng={() => props.onExportArtboardPng?.()}
        onOutputPreflight={props.onOutputPreflight}
        onExportArtboardPdf={() => props.onExportArtboardPdf?.()}
        activeArtboardName={props.activeArtboardName}
        hasVisibleArtboards={props.hasVisibleArtboards}
        onImportFixture={()=>props.onImportFixture?.()}
        onExportFixture={()=>props.onExportFixture?.()}
        onImportDxf={() => props.onImportDxf?.()}
        onFloorTasks={props.onFloorTasks}
        onImportImage={() => props.onImportImage?.()}
        onExportDxf={() => props.onExportDxf?.()}
        onExportStep={() => props.onExportStep?.()}
        onExportGlb={props.onExportGlb}
        solidEdgesVisible={props.solidEdgesVisible}
        onToggleSolidEdges={props.onToggleSolidEdges}
        onPlot={() => props.onPlot?.()}
        onInsertPavilion={props.onInsertPavilion}
        onUndo={props.onUndo}
        onRedo={props.onRedo}
        explorerVisible={!explorerCollapsed}
        propertiesVisible={!propertiesCollapsed}
        onToggleExplorer={toggleExplorer}
        onToggleProperties={toggleProperties}
      />

      <Ribbon
        editingCommands={paletteCommands.filter(c=>["drafting","points-move","points-copy","points-rotate","repeat-command"].includes(c.id))}
        annotationCommands={["add-text","drafting"].map(id=>paletteCommands.find(c=>c.id===id&&!c.reference)).filter((c):c is NonNullable<typeof c>=>Boolean(c))}
        onAssembly={props.onAssembly} onModelViews={props.onModelViews}
        onCurveWorkflow={props.onCurveWorkflow} canCurveWorkflow={props.canCurveWorkflow}
        onCadPilot={props.onCadPilot} activeUcsName={props.activeUcsName} onEndpointRadiusArc={props.onEndpointRadiusArc} onCurveLayout={props.onCurveLayout} onSpline={props.onSpline} onEllipse={props.onEllipse} onRegularPolygon={props.onRegularPolygon} onConstruction={props.onConstruction} onAngularDimension={props.onAngularDimension} constructionVisible={props.constructionVisible} onToggleConstruction={props.onToggleConstruction}
        canContour={props.canContour} onContour={props.onContour}
        canDisbandBlock={props.canDisbandBlock} onDisbandBlock={props.onDisbandBlock}
        canPattern={props.canPattern} onPattern={props.onPattern}
        canUndo={props.canUndo}
        canRedo={props.canRedo}
        hasSelection={Boolean(props.selectedObjectId)}
        isolationActive={props.isolationActive}
        canCreateBox={props.canCreateBox}
        canDuplicate={props.canDuplicate}
        canDelete={props.canDelete}
        canTransform={props.canTransform}
        canArrange={props.canArrange}
        canDistribute={props.canDistribute}
        canExtrude={props.canExtrude}
        canRevolve={props.canRevolve}
        canTrim={props.canTrim}
        lineEditTool={props.lineEditTool}
        projectionMode={props.projectionMode}
        gridVisible={props.gridVisible}
        transformMode={props.transformMode}
        pointTransformMode={props.pointTransformMode}
        drawingTool={props.drawingTool}
        measurementTool={props.measurementTool}
        distanceMeasurement={props.distanceMeasurement}
        activeWorkPlane={props.activeWorkPlane}
        snapEnabled={props.snapEnabled}
        orthoEnabled={props.orthoEnabled}
        workspaceMode={props.workspaceMode}
        directSelectMode={props.directSelectMode}
        activeLayerName={props.activeLayerName}
        activeSketchId={props.activeSketchId}
        onToggleSketch={props.onToggleSketch}
        onNew={props.onNew}
        onOpen={props.onOpen}
        onSave={props.onSave}
        onUndo={props.onUndo}
        onRedo={props.onRedo}
        onCreateBox={props.onCreateBox}
        onCreatePrimitive={props.onCreatePrimitive}
        onExtrude={props.onExtrude}
        onRevolve={props.onRevolve}
        onDrawingTool={props.onDrawingTool}
        onMeasurementTool={props.onMeasurementTool}
        onCycleWorkPlane={props.onCycleWorkPlane}
        onToggleSnap={props.onToggleSnap}
        onToggleOrtho={props.onToggleOrtho}
        onWorkspaceMode={props.onWorkspaceMode}
        onDirectSelectMode={props.onDirectSelectMode}
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
        onLineEditTool={props.onLineEditTool}
      />

      <div className={`workbench${compact?" project-comparison-compact":""}${explorerCollapsed ? " explorer-collapsed" : ""}${propertiesCollapsed ? " properties-collapsed" : ""}`}>
        <ActivityBar activeActivity={props.activeActivity} workspaceMode={props.workspaceMode} onChange={changeActivity} />
        <ExplorerPanel
          navigationBusy={props.frameToolsBusy}
          onNavigateProject={props.onNavigateProject}
          activeActivity={props.activeActivity}
          activeArtboardId={props.activeArtboardId}
          onActivateArtboard={props.onActivateArtboard}
          activeWorkPlane={props.activeWorkPlane}
          onInsertComponent={props.onInsertComponent}
          documentRevision={props.documentRevision}
          selectedLayerId={props.selectedLayerId}
          selectedObjectId={props.selectedObjectId}
          selectedObjectIds={props.selectedObjectIds}
          onSelectLayer={props.onSelectLayer}
          onSelectObject={props.onSelectObject}
          onDocumentChange={props.onDocumentChange}
          activeSketchId={props.activeSketchId}
          onEditSketch={props.onEditSketch}
          copilot={props.copilot}
        />

        <section className="workbench-viewport">
          <SelectionToolbar selectionKey={JSON.stringify([props.documentId,props.selectedObjectIds,props.activeArtboardId,props.activeSketchId])} context={selectionContext(cadDocument,props.selectedObjectIds,{workspace:props.workspaceMode,sketch:props.activeSketchId,artboard:props.activeArtboardId,frameBusy:props.frameToolsBusy})} commands={paletteCommands}/>
          <div className="selection-viewport-content">
          {props.children}
          <button className="panel-toggle panel-toggle-left" type="button" onClick={toggleExplorer} title={`${explorerCollapsed ? "Show" : "Hide"} Explorer`} aria-label={`${explorerCollapsed ? "Show" : "Hide"} Explorer`}>{explorerCollapsed ? "›" : "‹"}</button>
          <button className="panel-toggle panel-toggle-right" type="button" onClick={toggleProperties} title={`${propertiesCollapsed ? "Show" : "Hide"} Properties`} aria-label={`${propertiesCollapsed ? "Show" : "Hide"} Properties`}>{propertiesCollapsed ? "‹" : "›"}</button>
          <div className="viewport-label"><strong>{props.projectionMode === "perspective" ? "Perspective" : "Orthographic"}</strong><span>{props.workspaceMode === "2d" ? `${props.activeWorkPlane} plane` : "Shaded"}</span></div>
          <div className="viewport-frame-actions" role="group" aria-label="Frame geometry">
            <button type="button" title="Fit all visible geometry" aria-label="Fit all geometry" onClick={() => props.onViewAction("fit-all")}><ToolIcon name="Fit" fallback="□" /></button>
            <button type="button" title="Fit selection (F)" aria-label="Fit selected geometry" disabled={!props.selectedObjectIds.length} onClick={() => props.onViewAction("fit-selection")}><ToolIcon name="Selection" fallback="▣" /></button>
            {props.activeArtboardId && <button type="button" title="Fit the active artboard" aria-label="Fit active artboard" onClick={() => props.onViewAction("fit-active-artboard", props.activeArtboardId!)}><ToolIcon name="Artboard" fallback="▤" /></button>}
            {props.hasVisibleArtboards && <button type="button" title={props.workspaceMode === "2d" ? "Fit visible artboards on this plane" : "Fit all visible artboards in 3D"} aria-label="Fit visible artboards" onClick={() => props.onViewAction("fit-visible-artboards")}><ToolIcon name="Artboard" fallback="▱" /></button>}
          </div>
          {props.activeArtboardName && <div className="viewport-artboard-label" aria-label={`Active artboard ${props.activeArtboardName}`}>Canvas · {props.activeArtboardName}</div>}
          {props.isolationActive && <div className="viewport-isolation">Isolated view <button type="button" onClick={props.onIsolate}>Exit isolation</button></div>}
          <div className="navigation-hint"><span>Wheel</span> Up/down <b>·</b> <span>Shift Wheel</span> Left/right <b>·</b> <span>Ctrl Wheel</span> Zoom <b>·</b> <span>Alt Wheel</span> Rotate <b>·</b> <span>MMB</span> Pan <b>·</b> <span>Ctrl K</span> Commands / Shortcuts</div>
          </div>
        </section>

        <aside className="workbench-properties"><InspectorSectionScope scope={props.activeSketchId?"sketch":props.activeArtboardId&&!props.selectedObjectIds.length?"frame":Object.values(cadDocument.features).find(f=>f.output===props.selectedObjectId)?.type??"document"}>{props.properties}</InspectorSectionScope></aside>
      </div>

      <StatusBar saveStatus={props.saveStatus} fileStatus={props.fileStatus} onSave={props.onSave} onSaveAs={props.onSaveAs}
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
        workPlaneLocked={Boolean(props.activeSketchId)}
        snapPreferences={props.snapPreferences} onSnapPreferencesChange={props.onSnapPreferencesChange}
        onCycleWorkPlane={props.onCycleWorkPlane}
        onToggleGrid={props.onToggleGrid}
        onToggleSnap={props.onToggleSnap}
        onToggleOrtho={props.onToggleOrtho}
      />
    </main>
  );
}
