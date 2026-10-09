import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "./app/AppShell";
import type { ActivityId } from "./activity/ActivityBar";
import { PropertiesPanel } from "./properties/PropertiesPanel";
import { loadSnapPreferences, saveSnapPreferences, type SnapPreferences } from "./precision/snapPreferences";
import type { CanvasEditReview } from "./viewport/CanvasDimensionEditor";
import { SketchInspector } from "./properties/SketchInspector";
import { DependencyNotice } from "./properties/DependencyNotice";
import { cadDocument } from "./state/cadDocument";
import { dispatchCadCommand } from "./state/dispatchCadCommand";
import { loadDocumentFromCache, newDocument, openDocumentFile, saveDocumentAsFile, saveDocumentToCache,startDocumentAutosave } from "./state/documentFile";
import {recoveryStatus,subscribeRecoveryStatus,reportRecoveryStatus} from "./state/documentRecovery";
import {previewCadCommand,applyCadPlan,discardCadPlan,getCadPlanDrawingPaths,type CadPlanPreview} from "./state/documentPlans";
import {documentVersion,sameDocumentVersion,subscribeDocumentChanges} from "./state/documentSession";
import {copilotRequest,requestCopilotPlan,type CopilotConnection} from "./copilot/copilotConnection";
import {captureCopilotContext,copilotContextChange,type CopilotContextInputs,type CopilotPlanningContext} from "./copilot/copilotContext";
import { useCopilotQuery } from "./copilot/useCopilotQuery";
import { validateCopilotEdit } from "./copilot/copilotEdit";
import { cadHistory, redoDocument, undoDocument } from "./state/history";
import type { HistoryStateToken } from "@agent-webcad/cad-history";
import { reduceSelection, selectAllIds, validSelection, type SelectionState, type TopologySelectionRef } from "./state/selection";
import type { CornerPreviewRequest } from "./viewport/cornerPreview";
import { planPrecisionTransform } from "./state/precisionTransformCommands";
import { repeatDuplicateOffset, type DuplicateSeries } from "./state/duplicateWorkflow";
import { planAlignment, planDistribution, planGroupTransform } from "./state/selectionCommands";
import { boundsCenter, getSelectionWorldBounds } from "./precision/worldBounds";
import { parseAngle, parseLength } from "./precision/units";
import { isCadKeyboardBlocked, isCadHistoryBlocked, numericShortcutCharacter, routeCadShortcut, routeHistoryShortcut } from "./input/shortcutRouter";
import { DOCUMENT_BUSY_REASON, isDocumentCommandPending } from "./state/documentCommandQueue";
import type { DrawingTool, MeasurementTool, ObjectTransformValue, PointMeasurement, TransformMode, ViewportAction, ViewportActionType } from "./viewport/CadViewport";
import type { WorkPlaneId } from "./precision/workPlane";
import type { AngularDimensionSession } from "./viewport/AngularDimensionTool";
import type { WorkspaceMode } from "./viewport/workspaceTransition";
import type { KernelStatus } from "./cad/kernelGeometryService";
import { enumerateSolidTopology } from "./cad/kernelGeometryService";
import { buildPavilionBatch, PAVILION_ROOF_FILLET_RADIUS, PAVILION_ROOF_ID } from "./samples/pavilion";
import { ruleCopilotBackend, withCopilotLayer, type CopilotPlan } from "./copilot/copilotPlan";
import {commandInteraction} from "./state/commandInteraction";
import { APARTMENT_PRESET, HOUSE_PRESET, planBuilding } from "./architecture/buildingGenerator";
import { loftReady, sweepReady } from "./state/profileSelection";
import { planDimensionFromSelection } from "./state/dimensionCommands";
import { collectArtboardExportItems, collectExportAnnotations, collectExportDrawings, collectExportImages, collectExportSolids, collectStepSolids, downloadFile, exportStepBytes } from "./export/exportModel";
import { encodeBinaryStl } from "./export/stlWriter";
import { encodeSvg } from "./export/svgWriter";
import { ArtboardPngDialog } from "./export/ArtboardPngDialog";
import type { ArtboardPngScene } from "./export/artboardPng";
import { ArtboardPdfDialog, type ArtboardPdfBoard } from "./export/ArtboardPdfDialog";
import { encodeDxf } from "./interop/dxfWriter";
import { planDxfImport } from "./interop/dxfImport";
import { DxfReviewDialog, type DxfReview } from "./interop/DxfReviewDialog";
import { PlotDialog } from "./plot/PlotDialog";
import { DraftingPanel } from "./properties/DraftingPanel";
import { isKernelCancelled } from "./cad/kernelGeometryService";
import { extractSketchLoops, extrusionProfileParams, type SketchLoop } from "./precision/sketchProfiles";
import { drawingToSketchGeometry } from "./precision/sketchAdapter";
import { WORK_PLANES, planeToWorld, worldToPlane } from "./precision/workPlane";
import { importRasterFile, RASTER_FILE_ACCEPT } from "./interop/rasterImport";
import { resolveActiveArtboardId } from "./viewport/artboardCanvas";
import type { CommandDiagnostic } from "@agent-webcad/cad-commands";
import { subscribeCommandResults } from "./state/commandFeedback";
import { planPointTransform, type PointTransformMode } from "./state/pointTransformCommands";
import type {CadPatternSpec} from "@agent-webcad/cad-document";
import type {PatternSession} from "./viewport/PatternTool";
import type { ContourSession, ContourMode, CurveSession } from "./features/drawing-editing/contracts";
import type { ConstructionSession } from "./viewport/ConstructionTool";
import type { PointTransformSession } from "./viewport/PointTransformTool";
import { inferSketchConstraints, type SketchSnapBinding } from "./precision/automaticSketchConstraints";
import "./styles.css";

const CadViewport = lazy(async () => {
  const module = await import("./viewport/CadViewport");
  return { default: module.CadViewport };
});

function documentFingerprint() {
  const { revision: _revision, ...documentState } = cadDocument;
  return JSON.stringify(documentState);
}

type PrecisionTransformSession = {
  mode: TransformMode;
  axis: 0 | 1 | 2 | null;
  buffer: string;
};

function axisLabel(axis: 0 | 1 | 2 | null) {
  return axis === null ? "" : ["X", "Y", "Z"][axis];
}

export function App() {
  const [activeActivity, setActiveActivity] = useState<ActivityId>("model");
  const [activeSketchId, setActiveSketchId] = useState<string | null>(null);
  const [selectedSketchConstraintId, setSelectedSketchConstraintId] = useState<string | null>(null);
  const [sketchDiagnostic, setSketchDiagnostic] = useState<CommandDiagnostic | undefined>();
  const [selectedLayerId, setSelectedLayerId] = useState("layer-default");
  const [selection, setSelection] = useState<SelectionState>({ ids: [], primaryId: null });
  // Tokens follow states through eviction, Undo/Redo and branching. Weak keys
  // release UI metadata when the corresponding history state is discarded.
  const selectionMemory = useRef(new WeakMap<HistoryStateToken, SelectionState>());
  const selectionStateToken = cadHistory.getStateToken();
  useEffect(() => { selectionMemory.current.set(selectionStateToken, structuredClone(selection)); }, [selection, selectionStateToken]);
  // Temporary viewport-only isolation. Document visibility remains untouched,
  // so exiting isolation restores the exact pre-isolation state without a
  // history entry.
  const [isolatedObjectIds, setIsolatedObjectIds] = useState<string[] | null>(null);
  const [documentRevision, setDocumentRevision] = useState(() => {
    try{loadDocumentFromCache();}catch(error){reportRecoveryStatus({state:"failed",message:error instanceof Error?error.message:"Document recovery failed."});}
    return cadDocument.revision;
  });
  const [recovery,setRecovery]=useState(recoveryStatus);
  useEffect(()=>{const stop=subscribeRecoveryStatus(setRecovery),autosave=startDocumentAutosave();return ()=>{stop();autosave();};},[]);
  const [savedFingerprint, setSavedFingerprint] = useState(documentFingerprint);
  const [activeArtboardId, setActiveArtboardId] = useState<string | null>(null);
  const [artboardPngScene, setArtboardPngScene] = useState<ArtboardPngScene | null>(null);
  const [artboardPdfExport, setArtboardPdfExport] = useState<{ boards: ArtboardPdfBoard[]; activeBoardId: string | null; documentId: string } | null>(null);
  const [projectionMode, setProjectionMode] = useState<"perspective" | "orthographic">("perspective");
  const [gridVisible, setGridVisible] = useState(true);
  const [offsetDistance, setOffsetDistance] = useState("10");
  const [offsetSide, setOffsetSide] = useState<"left" | "right">("left");
  const [offsetActive, setOffsetActive] = useState(false);
  const [cornerPreview, setCornerPreview] = useState<CornerPreviewRequest | null>(null);
  const [filletPreview, setFilletPreview] = useState<Record<string, unknown> | null>(null);
  const [chamferPreview, setChamferPreview] = useState<Record<string, unknown> | null>(null);
  const [lineEditTool, setLineEditTool] = useState<"trim" | "extend" | null>(null);
  const [viewAction, setViewAction] = useState<ViewportAction | null>(null);
  const [transformMode, setTransformMode] = useState<TransformMode | null>(null);
  const [pointTransform, setPointTransform] = useState<PointTransformSession | null>(null);
  const [patternSession,setPatternSession]=useState<PatternSession|null>(null);
  const [contourSession, setContourSession] = useState<ContourSession | null>(null);
  const [curveSession, setCurveSession] = useState<CurveSession | null>(null);
  const [angularSession, setAngularSession] = useState<AngularDimensionSession | null>(null);
  const [constructionSession, setConstructionSession] = useState<ConstructionSession | null>(null);
  const [constructionVisible, setConstructionVisible] = useState(true);
  const pointCommitPending = useRef(false);
  const [extrusion, setExtrusion] = useState<{loops:SketchLoop[]; chosen:string[]; distance:string; layerId:string; revision:number; previousMode:WorkspaceMode} | null>(null);
  const [extrusionStatus, setExtrusionStatus] = useState("Preparing preview…");
  const [draftingOpen,setDraftingOpen]=useState(false);
  const [draftingInitialBlockId,setDraftingInitialBlockId]=useState<string|null>(null);
  const pointSequence = useRef(0);
  const lastCommand = useRef<{ kind: "drawing"; tool: DrawingTool } | { kind: "points"; mode: PointTransformMode } | { kind: "precision"; mode: TransformMode } | { kind: "offset" } | { kind: "line-edit"; mode: "trim" | "extend" } | { kind: "contour"; mode: ContourMode } | null>(null);
  const [drawingTool, setDrawingTool] = useState<DrawingTool | null>(null);
  const [measurementTool, setMeasurementTool] = useState<MeasurementTool | null>(null);
  const [distanceMeasurement, setDistanceMeasurement] = useState<PointMeasurement | null>(null);
  const [activeWorkPlane, setActiveWorkPlane] = useState<WorkPlaneId>("XY");
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [constraintReview, setConstraintReview] = useState<CanvasEditReview>();
  const [constraintReviewReset,setConstraintReviewReset] = useState(0);
  const [snapPreferences,setSnapPreferences] = useState(loadSnapPreferences);
  const changeSnapPreferences = (value:SnapPreferences) => {setSnapPreferences(value);saveSnapPreferences(value);};
  const [automaticConstraints, setAutomaticConstraints] = useState(true);
  const [orthoEnabled, setOrthoEnabled] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("3d");
  const [directSelectMode, setDirectSelectMode] = useState(false);
  const [, setPrecisionTransform] = useState<PrecisionTransformSession | null>(null);
  const [shortcutReadout, setShortcutReadout] = useState("");
  const [kernelStatus, setKernelStatus] = useState<KernelStatus>("deferred");
  const [copilotPlan, setCopilotPlan] = useState<CopilotPlan | null>(null);
  const [copilotDraft,setCopilotDraft]=useState("");
  const [copilotConnection,setCopilotConnection]=useState<CopilotConnection>({mode:"rules",endpoint:"/api/copilot/plan"});
  const [copilotRequestContext,setCopilotRequestContext]=useState<CopilotPlanningContext|null>(null);
  const [copilotReviewedKey,setCopilotReviewedKey]=useState<string>();
  const [copilotError, setCopilotError] = useState("");
  const [copilotPreviewFailed, setCopilotPreviewFailed] = useState(0);
  const [copilotPreviewVisible, setCopilotPreviewVisible] = useState(true);
  const [copilotApplying, setCopilotApplying] = useState(false);
  const [copilotValidated,setCopilotValidated]=useState<CadPlanPreview|null>(null);
  const [copilotCompletedIds,setCopilotCompletedIds]=useState<string[]>([]);
  const copilotSequence=useRef(0);
  const copilotAbort=useRef<AbortController|null>(null);
  const copilotPublishing=useRef(false);
  const copilotApplyOperation=useRef<{controller:AbortController;sequence:number}|null>(null);
  useEffect(()=>()=>{copilotAbort.current?.abort();copilotApplyOperation.current?.controller.abort();},[]);
  const viewActionId = useRef(0);
  const lastDuplicate = useRef<DuplicateSeries | null>(null);
  const precisionTransformRef = useRef<PrecisionTransformSession | null>(null);
  const openFileInput = useRef<HTMLInputElement>(null);
  const dxfFileInput = useRef<HTMLInputElement>(null);
  const [dxfReview,setDxfReview]=useState<DxfReview|null>(null);
  const imageFileInput = useRef<HTMLInputElement>(null);
  const [imageCropPreview, setImageCropPreview] = useState<{ objectId: string; crop: import("@agent-webcad/cad-document").CadImageCrop; mask: import("@agent-webcad/cad-document").CadImageMask; opacity: number; adjustments: import("@agent-webcad/cad-document").CadImageAdjustments; revealSource: boolean; asset?: import("@agent-webcad/cad-document").CadRasterAsset } | null>(null);
  const [imageCropEditingId, setImageCropEditingId] = useState<string | null>(null);
  const imageCropDraftSetter = useRef<{ objectId: string; update: (crop: import("@agent-webcad/cad-document").CadImageCrop) => void } | null>(null);
  const registerImageCropDraft = useCallback((objectId: string, update: ((crop: import("@agent-webcad/cad-document").CadImageCrop) => void) | null) => {
    if (update) imageCropDraftSetter.current = { objectId, update };
    else if (imageCropDraftSetter.current?.objectId === objectId) imageCropDraftSetter.current = null;
  }, []);
  const updateImageCropDraft = useCallback((objectId: string, crop: import("@agent-webcad/cad-document").CadImageCrop) => {
    if (imageCropDraftSetter.current?.objectId === objectId) imageCropDraftSetter.current.update(crop);
  }, []);
  const setImageCropHandleMode = useCallback((objectId: string, active: boolean) => {
    setImageCropEditingId(active ? objectId : null);
    if (active) {
      const feature=Object.values(cadDocument.features).find(entry=>entry.output===objectId&&entry.type==="image");
      const plane=feature?.params.workPlane;
      if(plane==="XY"||plane==="XZ"||plane==="YZ")setActiveWorkPlane(plane);
      setWorkspaceMode("2d");setProjectionMode("orthographic");issueViewAction("fit-selection");
    }
  }, []);
  const [plotOpen, setPlotOpen] = useState(false);
  const currentFingerprint = useMemo(documentFingerprint, [documentRevision]);

  const selectedObjectId = selection.primaryId;
  const selectedObjectIds = selection.ids;
  const copilotQuery = useCopilotQuery(selectedObjectIds, documentVersion());
  const liveCopilotContext:CopilotContextInputs={version:documentVersion(),selectionIds:selectedObjectIds,workPlane:activeWorkPlane,layerId:selectedLayerId,prompt:copilotDraft,connection:copilotConnection};
  const liveCopilotContextRef=useRef(liveCopilotContext);
  liveCopilotContextRef.current=liveCopilotContext;
  const copilotContextError=copilotRequestContext?copilotContextChange(copilotRequestContext,liveCopilotContext):undefined;
  useEffect(() => { if (imageCropEditingId && !selectedObjectIds.includes(imageCropEditingId)) setImageCropEditingId(null); }, [imageCropEditingId, selectedObjectIds.join("\0")]);
  const selectedObject = selectedObjectId ? cadDocument.objects[selectedObjectId] : null;
  const activeSketch = activeSketchId ? cadDocument.sketches?.[activeSketchId] : undefined;
  const selectedFeature = selectedObject
    ? Object.values(cadDocument.features).find((entry) => entry.output === selectedObject.id)
    : undefined;
  const selectedSketchOwned = selectedObjectIds.some((id) => Object.values(cadDocument.features).some((entry) => entry.output === id && typeof entry.params.sketchId === "string"));
  const activeSketchSelection = Boolean(activeSketch && selectedObjectIds.length && selectedObjectIds.every((id) => activeSketch.geometry.some((entry) => entry.id === id)));
  const selectedConstructionOwned = selectedObjectIds.some(id => Object.values(cadDocument.features).some(f => f.output === id && f.construction));
  const canModifySelection = !selectedConstructionOwned && (!selectedSketchOwned && !activeSketch || activeSketchSelection);
  const activeLayerName = cadDocument.layers[selectedLayerId]?.name ?? "Default";
  const activeLayerLocked = cadDocument.layers[selectedLayerId]?.locked ?? false;
  const selectedLayerLocked = selectedObject
    ? cadDocument.layers[selectedObject.layerId]?.locked ?? false
    : false;
  const selectionEditable = selectedObjectIds.length > 0 && selectedObjectIds.every((id) => {
    const candidate = cadDocument.objects[id];
    const layer = candidate ? cadDocument.layers[candidate.layerId] : undefined;
    const feature = Object.values(cadDocument.features).find((entry) => entry.output === id);
    return Boolean(candidate?.visible && layer?.visible && !layer.locked && feature);
  });
  const extrudeProfile = useMemo(
    () => extractSketchLoops(cadDocument, selectedObjectIds),
    [documentRevision, selectedObjectIds.join("\0")],
  );
  const isModified = currentFingerprint !== savedFingerprint;
  const extrusionPreview = useMemo(() => {
    if (!extrusion) return null;
    const distance = parseLength(extrusion.distance), loops = extrusion.loops.filter(loop => extrusion.chosen.includes(loop.id));
    return distance !== null && Math.abs(distance) > 1e-9 && loops.length ? {kind:"extrude", distance, ...extrusionProfileParams(loops)} : null;
  }, [extrusion]);
  useEffect(() => {
    if (extrusion && extrusion.revision !== documentRevision) { setExtrusion(null); setShortcutReadout("Extrusion cancelled because the source document changed"); }
  }, [documentRevision]);

  useEffect(() => subscribeCommandResults((result) => {
    if (result.ok) setSketchDiagnostic(undefined);
    else if (activeSketchId && result.diagnostic && (result.diagnostic.sketchId === activeSketchId ||
      result.diagnostic.geometryIds.some((id) => cadDocument.sketches?.[activeSketchId]?.geometry.some((entry) => entry.id === id)))) {
      setSketchDiagnostic(result.diagnostic);
    }
  }), [activeSketchId]);
  useEffect(() => {
    setSketchDiagnostic(undefined);
    setSelectedSketchConstraintId((id) => id && activeSketch?.constraints.some((entry) => entry.id === id) ? id : null);
  }, [documentRevision, activeSketchId]);
  useEffect(() => {
    setPointTransform(current => current && current.revision !== documentRevision ? null : current);
  }, [documentRevision]);
  useEffect(() => { setPointTransform(null); }, [activeSketchId, activeWorkPlane, workspaceMode]);

  // Keep the authoritative selection set free of objects that became hidden,
  // locked, or were removed by a command (including undo/redo).
  useEffect(() => {
    setSelection((current) => validSelection(current));
    setActiveSketchId((current) => current && cadDocument.sketches?.[current] ? current : null);
    setSelectedLayerId((current) => cadDocument.layers[current] ? current : (cadDocument.rootLayers[0] ?? "layer-default"));
    setActiveArtboardId(current => resolveActiveArtboardId(current, Object.values(cadDocument.artboards ?? {})));
  }, [documentRevision]);

  // 2D drafting always uses an orthographic camera. Keep the React state in
  // sync as well as the viewport's defensive camera invariant so stale view
  // actions or interrupted transitions cannot leave a misleading projection
  // label behind.
  useEffect(() => {
    if (workspaceMode === "2d" && projectionMode !== "orthographic") {
      setProjectionMode("orthographic");
    }
  }, [workspaceMode, projectionMode]);

  function syncRevision() {
    setDocumentRevision(cadDocument.revision);
  }
  useEffect(()=>subscribeDocumentChanges(()=>{
    // A point placement publishes before its promise completes. Its owner must
    // advance the repeat session and revision together, before invalidation.
    if(!pointCommitPending.current)setDocumentRevision(cadDocument.revision);
  }),[]);

  function clearPrecisionTransform() {
    precisionTransformRef.current = null;
    setPrecisionTransform(null);
    setShortcutReadout("");
    setTransformMode(null);
  }

  function clearCommandTools(resetSelectionMode = true) {
    setCornerPreview(null);
    setConstraintReviewReset(v=>v+1);setConstraintReview(undefined);
    setConstructionSession(null);
    setCurveSession(null);
    setAngularSession(null);
    setContourSession(null);
    setPatternSession(null);
    clearPrecisionTransform();
    setPointTransform(null);
    setDrawingTool(null);
    setMeasurementTool(null);
    setDistanceMeasurement(null);
    setLineEditTool(null);
    setOffsetActive(false);
    if (resetSelectionMode) setDirectSelectMode(false);
    cancelExtrusion();
  }

  function updatePrecisionReadout(session: PrecisionTransformSession) {
    const label = session.mode === "translate" ? "MOVE" : session.mode === "rotate" ? "ROTATE" : "SCALE";
    const unit = session.mode === "rotate" ? "°" : session.mode === "scale" ? "×" : "mm";
    const axis = axisLabel(session.axis);
    setShortcutReadout(`${label}${axis ? ` · ${axis}` : ""}${session.buffer ? ` · ${session.buffer} ${unit}` : " · enter value"}`);
  }

  function beginPrecisionTransform(mode: TransformMode) {
    if (!selectedObjectIds.length || !selectionEditable || !canModifySelection) return;
    clearCommandTools();
    const session: PrecisionTransformSession = { mode, axis: null, buffer: "" };
    setPointTransform(null);
    lastCommand.current = { kind: "precision", mode };
    precisionTransformRef.current = session;
    setPrecisionTransform(session);
    setTransformMode(mode);
    updatePrecisionReadout(session);
  }

  async function commitPrecisionTransform(session: PrecisionTransformSession) {
    if (!session.buffer || !selectedObjectIds.length || !selectionEditable) {
      clearPrecisionTransform();
      return;
    }
    const vectorInput = session.mode === "translate" && session.axis === null && session.buffer.includes(",")
      ? session.buffer.split(",").map((part) => parseLength(part))
      : null;
    const parsedValue = vectorInput
      ? null
      : session.mode === "translate"
        ? parseLength(session.buffer)
        : session.mode === "rotate"
          ? parseAngle(session.buffer)
          : Number(session.buffer.replace(",", "."));
    const vectorValid = vectorInput !== null
      && (vectorInput.length === 2 || vectorInput.length === 3)
      && vectorInput.every((entry): entry is number => entry !== null && Number.isFinite(entry));
    if ((!vectorValid && (parsedValue === null || !Number.isFinite(parsedValue))) || (session.mode === "scale" && parsedValue !== null && parsedValue <= 0)) {
      setShortcutReadout("Invalid precision input");
      return;
    }
    const value = parsedValue ?? 0;

    const planned = planPrecisionTransform(cadDocument, selectedObjectIds, session.mode, vectorValid ? vectorInput! as number[] : value, session.axis,
      activeSketch?.workPlane ?? (workspaceMode === "2d" ? activeWorkPlane : undefined), activeSketchSelection ? activeSketch?.id : undefined);
    if (planned.reason) { setShortcutReadout(planned.reason); return; }
    const commands = planned.commands;
    const result = commands.length ? await dispatchCadCommand(commands.length === 1 ? commands[0] : {
      type: "batch", label: `${session.mode === "translate" ? "Move" : session.mode === "rotate" ? "Rotate" : "Scale"} selection`, commands,
    }) : null;
    syncRevision();
    clearPrecisionTransform();
    if (result && !result.ok) setShortcutReadout(result.reason ?? "Transform rejected");
  }

  function documentBusy() {
    if (!isDocumentCommandPending()) return false;
    setShortcutReadout(DOCUMENT_BUSY_REASON);
    return true;
  }

  function handleUndo() {
    if (documentBusy()) return;
    selectionMemory.current.set(cadHistory.getStateToken(), structuredClone(selection));
    if (!undoDocument()) return;
    clearCommandTools(false);
    setSelection(validSelection(selectionMemory.current.get(cadHistory.getStateToken()) ?? selection));
    issueViewAction("reset-interaction");
    setShortcutReadout("Undo · previous geometry and selection restored · choose the next tool");
    syncRevision();
  }

  function handleRedo() {
    if (documentBusy()) return;
    selectionMemory.current.set(cadHistory.getStateToken(), structuredClone(selection));
    if (!redoDocument()) return;
    clearCommandTools(false);
    setSelection(validSelection(selectionMemory.current.get(cadHistory.getStateToken()) ?? selection));
    issueViewAction("reset-interaction");
    setShortcutReadout("Redo · result geometry and selection restored · choose the next tool");
    syncRevision();
  }

  function issueViewAction(type: ViewportActionType, artboardId?: string) {
    viewActionId.current += 1;
    setViewAction({ id: viewActionId.current, type, artboardId });
  }

  const clearCommandToolsRef = useRef(clearCommandTools);
  clearCommandToolsRef.current = clearCommandTools;
  const handleCornerPreview = useCallback((request: CornerPreviewRequest | null) => {
    if (request?.review) clearCommandToolsRef.current(false);
    // Hover cleanup must not cancel a retained, reviewed corner session.
    setCornerPreview(current => current?.review && !request?.review ? current : request);
  }, []);

  function activateArtboard(id: string | null) {
    if (!id) { setActiveArtboardId(null); return; }
    const board = cadDocument.artboards?.[id];
    if (!board?.visible) return;
    clearCommandTools();
    setActiveSketchId(null);
    setActiveArtboardId(id);
    setActiveWorkPlane(board.workPlane);
    setWorkspaceMode("2d");
    setProjectionMode("orthographic");
    issueViewAction("fit-active-artboard", id);
  }

  async function dispatchViewportCommand(command: Parameters<typeof dispatchCadCommand>[0]) {
    const result = await dispatchCadCommand(command);
    if (!result.ok && result.reason) setShortcutReadout(result.reason);
    return result;
  }

  async function commitViewportTransform(objectId: string, mode: TransformMode, transform: ObjectTransformValue) {
    if (precisionTransformRef.current) clearPrecisionTransform();
    if (activeSketchSelection && activeSketch) {
      const plane = WORK_PLANES[activeSketch.workPlane], normal = plane.normal.findIndex((value) => value !== 0);
      const bounds = getSelectionWorldBounds(cadDocument, selectedObjectIds);
      if (!bounds) return;
      const pivot = boundsCenter(bounds);
      const single = selectedObjectIds.length === 1;
      if (mode === "scale" && transform.scale.some((value) => Math.abs(value - transform.scale[0]) > 1e-6)) { setShortcutReadout("Sketch scale must be uniform. Use S and enter a scale."); return; }
      const delta = single ? transform.translation : transform.translation.map((value, index) => value - pivot[index]) as [number, number, number];
      await dispatchViewportCommand({ type: "transform-sketch-geometry", sketchId: activeSketch.id, geometryIds: selectedObjectIds,
        translation: mode === "translate" ? worldToPlane(delta, plane) : [0, 0],
        center: worldToPlane(pivot, plane), angle: mode === "rotate" ? transform.rotation[normal] * plane.normal[normal] * Math.PI / 180 : 0,
        scale: mode === "scale" ? transform.scale[0] : 1 });
      syncRevision(); return;
    }
    if (selectedObjectIds.length > 1 && (mode === "translate" || mode === "rotate" || mode === "scale")) {
      const commands = planGroupTransform(cadDocument, selectedObjectIds, mode, transform);
      if (!commands) return;
      if (commands.length) await dispatchViewportCommand({
        type: "batch",
        label: `${mode === "translate" ? "Move" : mode === "rotate" ? "Rotate" : "Scale"} selection`,
        commands,
      });
      // The batch already contains every member's transform. Falling through
      // would apply rotate/scale a second time to the primary object.
      syncRevision();
      return;
    }
    else if (mode === "translate") await dispatchViewportCommand({ type: "move-object", objectId, translation: transform.translation });
    if (mode === "rotate") await dispatchViewportCommand({ type: "rotate-object", objectId, rotation: transform.rotation });
    if (mode === "scale") await dispatchViewportCommand({ type: "scale-object", objectId, scale: transform.scale });
    syncRevision();
  }

  function resetWorkspaceSelection() {
    setCornerPreview(null);
    setActiveSketchId(null);
    lastDuplicate.current = null;
    setSelection({ ids: [], primaryId: null });
    setIsolatedObjectIds(null);
    setSelectedLayerId(cadDocument.rootLayers[0] ?? "layer-default");
    setActiveArtboardId(null);
    setActiveActivity("model");
    setOffsetActive(false);
    setLineEditTool(null);
  }

  function selectObject(objectId: string | null, additive = false) {
    if (activeSketchId && objectId && !cadDocument.sketches?.[activeSketchId]?.geometry.some((entry) => entry.id === objectId)) {
      // Do not leave normal document geometry looking clickable while silently
      // rejecting it. Selecting outside the active sketch is an intentional
      // exit from sketch editing, matching the workspace switch behavior.
      setActiveSketchId(null);
      setDrawingTool(null);
      setDirectSelectMode(false);
    }
    setOffsetActive(false);
    setLineEditTool(null);
    setSelection((current) => validSelection(reduceSelection(current, objectId, additive)));
  }

  function selectObjects(objectIds: string[], additive = false) {
    if (activeSketchId) {
      const sketchObjectIds = new Set(cadDocument.sketches?.[activeSketchId]?.geometry.map((entry) => entry.id) ?? []);
      if (objectIds.some((id) => !sketchObjectIds.has(id))) {
        setActiveSketchId(null);
        setDrawingTool(null);
        setDirectSelectMode(false);
      } else objectIds = objectIds.filter((id) => sketchObjectIds.has(id));
    }
    setSelection((current) => {
      if (!additive) return validSelection({ ids: objectIds, primaryId: objectIds.at(-1) ?? null, subObjects: [] });
      return validSelection(objectIds.reduce((next, id) => reduceSelection(next, id, true), current));
    });
  }

  function selectSubObject(ref: TopologySelectionRef, additive = false) {
    if (activeSketchId && !cadDocument.sketches?.[activeSketchId]?.geometry.some((entry) => entry.id === ref.objectId)) return;
    setSelection((current) => {
      const objectSelection = current.ids.includes(ref.objectId)
        ? current
        : reduceSelection(current, ref.objectId, additive);
      const existing = objectSelection.subObjects ?? [];
      const same = (entry: TopologySelectionRef) => entry.objectId === ref.objectId && entry.kind === ref.kind && entry.topologyId === ref.topologyId;
      const subObjects = additive
        ? (existing.some(same) ? existing.filter((entry) => !same(entry)) : [...existing, ref])
        : [ref];
      return validSelection({ ...objectSelection, subObjects });
    });
  }

  async function arrangeSelection(mode: "left" | "center-x" | "right" | "top" | "center-y" | "bottom") {
    const commands = planAlignment(cadDocument, selectedObjectIds, mode, activeWorkPlane);
    if (!commands) return;
    if (commands.length) await dispatchCadCommand({
      type: "batch",
      label: ({ left: "Align left", "center-x": "Align horizontal center", right: "Align right", top: "Align top", "center-y": "Align vertical center", bottom: "Align bottom" } as const)[mode],
      commands,
    });
    syncRevision();
  }

  async function distributeSelection(axis: "horizontal" | "vertical") {
    const commands = planDistribution(cadDocument, selectedObjectIds, axis, activeWorkPlane);
    if (!commands) return;
    if (commands.length) await dispatchCadCommand({ type: "batch", label: `Distribute ${axis === "horizontal" ? "horizontally" : "vertically"}`, commands });
    syncRevision();
  }

  function handleNewDocument() {
    if (documentBusy()) return;
    newDocument();
    resetWorkspaceSelection();
    setSavedFingerprint(documentFingerprint());
    syncRevision();
  }

  function handleSave() {
    if (documentBusy()) return;
    try{saveDocumentToCache();}catch(error){setShortcutReadout(error instanceof Error?error.message:"Save failed");return;}
    setSavedFingerprint(currentFingerprint);
  }

  function handleSaveAs() {
    if (documentBusy()) return;
    saveDocumentAsFile();
    try{saveDocumentToCache();}catch(error){setShortcutReadout(error instanceof Error?error.message:"Recovery save failed");return;}
    setSavedFingerprint(currentFingerprint);
  }

  async function handleExportStl() {
    if (documentBusy()) return;
    try {
      const scoped = selectedObjectIds.length ? selectedObjectIds : undefined;
      const triangles = await collectExportSolids(scoped);
      if (!triangles.length) {
        setShortcutReadout(selectedObjectIds.length ? "Nothing to export: selection has no visible solids" : "Nothing to export: no visible solids");
        return;
      }
      downloadFile(encodeBinaryStl(triangles), `${cadDocument.id}.stl`, "model/stl");
      setShortcutReadout(`Exported ${triangles.length} facets${scoped ? " (selection)" : ""} to STL`);
    } catch (error) {
      if (isKernelCancelled(error)) setShortcutReadout("STL export cancelled");
      else setShortcutReadout("STL export failed: kernel could not mesh a solid");
    }
  }

  function handleExportSvg() {
    if (documentBusy()) return;
    const annotations = collectExportAnnotations(activeWorkPlane);
    const lines = [...collectExportDrawings(activeWorkPlane),...annotations.lines];
    const images = collectExportImages(activeWorkPlane);
    if (!lines.length && !images.length) {
      setShortcutReadout(`Nothing to export: no visible drawings on ${activeWorkPlane}`);
      return;
    }
    downloadFile(encodeSvg(lines, { images, texts:annotations.texts }), `${cadDocument.id}-${activeWorkPlane.toLowerCase()}.svg`, "image/svg+xml");
    setShortcutReadout(`Exported ${lines.length} drawing${lines.length === 1 ? "" : "s"} and ${images.length} image${images.length === 1 ? "" : "s"} from ${activeWorkPlane} to SVG`);
  }

  function handleExportArtboardSvg() {
    if (documentBusy()) return;
    const board = activeArtboardId ? cadDocument.artboards?.[activeArtboardId] : undefined;
    if (!board?.visible) { setShortcutReadout("Choose a visible artboard before exporting its SVG"); return; }
    try {
      const items = collectArtboardExportItems(board.id);
      const name = board.name.trim().replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || board.id;
      downloadFile(encodeSvg([], { items, viewBox: { origin: board.origin, size: board.size }, background: board.background }), `${cadDocument.id}-${name}.svg`, "image/svg+xml");
      const drawings = items.filter(item => item.type === "polyline").length, images = items.filter(item => item.type === "image").length;
      setShortcutReadout(`Exported ${drawings} drawing${drawings === 1 ? "" : "s"} and ${images} image${images === 1 ? "" : "s"} from ${board.name} to SVG`);
    } catch (error) {
      setShortcutReadout(error instanceof Error ? error.message : "Artboard SVG export failed");
    }
  }

  function handleExportArtboardPng() {
    if (documentBusy()) return;
    const board = activeArtboardId ? cadDocument.artboards?.[activeArtboardId] : undefined;
    if (!board?.visible) { setShortcutReadout("Choose a visible artboard before exporting its PNG"); return; }
    try {
      const scene: ArtboardPngScene = structuredClone({
        board: { id: board.id, name: board.name, origin: board.origin, size: board.size, workPlane: board.workPlane, background: board.background },
        items: collectArtboardExportItems(board.id),
      });
      setArtboardPngScene(scene);
    } catch (error) {
      setShortcutReadout(error instanceof Error ? error.message : "Artboard PNG export could not be prepared.");
    }
  }

  function handleExportArtboardPdf() {
    if (documentBusy()) return;
    const visibleBoards = Object.values(cadDocument.artboards ?? {}).filter(board => board.visible);
    if (!visibleBoards.length) { setShortcutReadout("Create or show an artboard before exporting an artboard PDF"); return; }
    const boards: ArtboardPdfBoard[] = visibleBoards.map(board => {
      const metadata = { id: board.id, name: board.name, origin: [...board.origin] as [number, number], size: [...board.size] as [number, number], workPlane: board.workPlane, background: board.background };
      try {
        return { board: metadata, scene: { board: metadata, items: collectArtboardExportItems(board.id) } };
      } catch (error) {
        return { board: metadata, error: error instanceof Error ? error.message : `Could not prepare “${board.name}” for PDF output.` };
      }
    });
    setArtboardPdfExport({ boards, activeBoardId: activeArtboardId, documentId: cadDocument.id });
  }

  function handleExportDxf() {
    if (documentBusy()) return;
    const scoped = selectedObjectIds.length ? selectedObjectIds : undefined;
    let exported:ReturnType<typeof encodeDxf>;
    try{exported=encodeDxf(cadDocument,scoped);}catch(error){setShortcutReadout(error instanceof Error?error.message:"DXF export could not be prepared.");return;}
    const { text, entities, skipped, warnings } = exported;
    if (!entities) {
      setShortcutReadout(selectedObjectIds.length ? "Nothing to export: selection has no drawings" : "Nothing to export: no visible drawings");
      return;
    }
    setDxfReview({mode:"export",name:`${cadDocument.id}.dxf`,text,entities,skipped,warnings,baseVersion:documentVersion()});
  }

  async function handleExportStep() {
    if (documentBusy()) return;
    try {
      const scoped = selectedObjectIds.length ? selectedObjectIds : undefined;
      if (!collectStepSolids(scoped).length) {
        setShortcutReadout(selectedObjectIds.length ? "Nothing to export: selection has no visible solids" : "Nothing to export: no visible solids");
        return;
      }
      const bytes = await exportStepBytes(scoped);
      downloadFile(bytes, `${cadDocument.id}.step`, "application/step");
      setShortcutReadout(`Exported STEP (${(bytes.length / 1024).toFixed(1)} KB)${scoped ? " (selection)" : ""}`);
    } catch (error) {
      if (isKernelCancelled(error)) setShortcutReadout("STEP export cancelled");
      else setShortcutReadout("STEP export failed: kernel could not transfer a solid");
    }
  }

  function handleImportDxf() {
    if (documentBusy()) return;
    dxfFileInput.current?.click();
  }

  async function handleImportDxfFile(file: File | undefined) {
    if (!file || documentBusy()) return;
    const baseVersion=documentVersion();
    try {
      if(file.size>20*1024*1024)throw new Error("DXF import supports files up to 20 MiB. Split this drawing before importing.");
      const text = await file.text();
      if(!sameDocumentVersion(baseVersion))throw new Error("Document changed while reading DXF. Choose the file again.");
      const layerByName = new Map(
        Object.values(cadDocument.layers).map((layer) => [layer.name, layer.id] as const),
      );
      const tag = crypto.randomUUID().slice(0, 8);
      const planned = planDxfImport(text, layerByName, tag);
      if (!planned.ok) {
        setShortcutReadout(planned.reason);
        return;
      }
      setDxfReview({mode:"import",name:file.name,command:planned.command,stats:planned.stats,baseVersion});
    } catch (error) {
      setShortcutReadout(error instanceof Error?error.message:"Could not import this DXF file.");
    }
  }

  function handleOpen() {
    if (documentBusy()) return;
    openFileInput.current?.click();
  }

  async function handleOpenFile(file: File | undefined) {
    if (!file) return;
    if (documentBusy()) return;
    try {
      await openDocumentFile(file);
      resetWorkspaceSelection();
      setSavedFingerprint(documentFingerprint());
      syncRevision();
    } catch (error) {
      console.error("Failed to open CAD document:", error);
      setShortcutReadout(error instanceof Error ? error.message : "Could not open this CAD file.");
    }
  }

  async function handleCreateBox() {
    const generatedObjectCount = Object.values(cadDocument.features).filter(
      (feature) => feature.type === "primitive"
    ).length;

    const result = await dispatchCadCommand({
      type: "create-box",
      width: 8,
      depth: 8,
      height: 6,
      layerId: selectedLayerId,
      position: [14 + generatedObjectCount * 10, 0, 0],
    });
    const newId = result.createdIds[0];
    if (newId) selectObject(newId);
    else if (!result.ok) setShortcutReadout(result.reason ?? "Box creation rejected");
    syncRevision();
  }

  async function handleCreatePrimitive(primitive: "cylinder" | "sphere" | "cone" | "torus") {
    const count = cadDocument.rootObjects.length;
    const params: Record<string, number> = primitive === "cylinder" ? { radius: 4, height: 8 }
      : primitive === "sphere" ? { radius: 5 }
      : primitive === "cone" ? { radius1: 5, radius2: 2, height: 8 }
      : { majorRadius: 5, minorRadius: 1.5 };
    const result = await dispatchCadCommand({ type: "create-primitive", primitive, params, layerId: selectedLayerId, position: [14 + count * 12, 0, 0] });
    const newId = result.createdIds[0];
    if (newId) selectObject(newId);
    else if (!result.ok) setShortcutReadout(result.reason ?? "Primitive creation rejected");
    syncRevision();
  }

  async function handleInsertPavilion() {
    const batch = buildPavilionBatch(selectedLayerId);
    const result = await dispatchCadCommand(batch);
    if (!result.ok) {
      setShortcutReadout(result.reason ?? "Pavilion rejected: check the active layer");
      return;
    }
    const created = result.createdIds;
    syncRevision();
    // Finishing pass: fillet every roof edge. The pavilion stands complete
    // even if the kernel rejects this step.
    let selection = created.filter((id) => Boolean(cadDocument.objects[id]));
    try {
      const roofFeature = Object.values(cadDocument.features).find((entry) => entry.output === PAVILION_ROOF_ID);
      if (roofFeature) {
        const topology = await enumerateSolidTopology(roofFeature.params as Record<string, unknown>);
        const filletResult = await dispatchCadCommand({
          type: "fillet",
          target: PAVILION_ROOF_ID,
          edges: topology.edges.map((entry) => entry.key),
          radius: PAVILION_ROOF_FILLET_RADIUS,
        });
        const filletId = filletResult.createdIds[0];
        if (filletId) {
          selection = [...selection.filter((id) => id !== PAVILION_ROOF_ID), filletId];
        }
      }
    } catch {
      // Keep the unfilleted pavilion; kernel failures must not lose the model.
    }
    syncRevision();
    selectObjects(selection);
    issueViewAction("fit-all");
  }

  const buildingLoop = useMemo(() => {
    const loops = extractSketchLoops(cadDocument, selectedObjectIds);
    if (!loops.ok || loops.loops.length !== 1) return null;
    const loop = loops.loops[0];
    if (loop.workPlane !== "XY" || !loop.segments.every((segment) => segment.kind === "line")) return null;
    return loop;
  }, [documentRevision, selectedObjectIds.join("\0")]);

  async function handleBuildHouse(preset: typeof HOUSE_PRESET, tag: string) {
    if (!buildingLoop || activeSketch) {
      setShortcutReadout("Select one closed straight-edge loop on XY to build on");
      return;
    }
    const planned = planBuilding(buildingLoop, preset, tag);
    if (!planned.ok) {
      setShortcutReadout(planned.reason);
      return;
    }
    const withLayer = withCopilotLayer(planned.command, selectedLayerId);
    const result = await dispatchCadCommand(withLayer);
    if (!result.ok) {
      setShortcutReadout(result.reason ?? "Building rejected: check the active layer");
      return;
    }
    syncRevision();
    selectObjects(result.createdIds.filter((id) => Boolean(cadDocument.objects[id])));
    issueViewAction("fit-all");
    setShortcutReadout(`Building done: ${planned.summary.length} parts`);
  }

  function clearCopilot() {
    copilotSequence.current++;copilotAbort.current?.abort();copilotAbort.current=null;
    copilotApplyOperation.current?.controller.abort();copilotApplyOperation.current=null;copilotPublishing.current=false;
    if(copilotValidated)discardCadPlan(copilotValidated.planId);
    setCopilotValidated(null);setCopilotReviewedKey(undefined);setCopilotApplying(false);setCopilotPlan(null);setCopilotError("");setCopilotPreviewFailed(0);setCopilotRequestContext(null);setCopilotCompletedIds([]);
  }

  useEffect(()=>{
    if(!copilotContextError||copilotPublishing.current)return;
    clearCopilot();
    setCopilotError(copilotContextError);
  },[copilotContextError,copilotApplying]);

  async function handleCopilotSubmit(input: string,connection:CopilotConnection={mode:"rules",endpoint:""}) {
    copilotApplyOperation.current?.controller.abort();copilotApplyOperation.current=null;copilotPublishing.current=false;
    const sequence=++copilotSequence.current;
    copilotAbort.current?.abort();const controller=new AbortController();copilotAbort.current=controller;
    const context=captureCopilotContext(cadDocument,{version:documentVersion(),selectionIds:selectedObjectIds,workPlane:activeWorkPlane,layerId:selectedLayerId,prompt:input,connection});
    setCopilotDraft(input);setCopilotConnection(connection);
    liveCopilotContextRef.current={...liveCopilotContextRef.current,prompt:input,connection};
    if(copilotValidated)discardCadPlan(copilotValidated.planId);
    setCopilotValidated(null);
    setCopilotCompletedIds([]);
    setCopilotPlan(null);setCopilotReviewedKey(undefined);
    setCopilotError("");
    setCopilotPreviewFailed(0);
    setCopilotRequestContext(context);
    setActiveActivity("copilot");
    setCopilotApplying(true);
    try{
      const result=connection.mode==="gateway"?{ok:true as const,plan:await requestCopilotPlan(connection.endpoint,copilotRequest(input,cadDocument,context.selectionIds,context.workPlane),{signal:controller.signal,baseUrl:location.href})}:ruleCopilotBackend.plan(input);
      if(sequence!==copilotSequence.current)return;
      const changed=copilotContextChange(context,liveCopilotContextRef.current);
      if(changed)throw new Error(changed);
      if(!result.ok){setCopilotError(result.reason);return;}
      const planned={...result.plan,command:withCopilotLayer(result.plan.command,context.layerId)};
      validateCopilotEdit(planned.command,cadDocument,context.selectionIds,context.workPlane);
      setCopilotPlan(planned);
      const preview=await previewCadCommand(planned.command,{signal:controller.signal});
      if(sequence!==copilotSequence.current){discardCadPlan(preview.planId);return;}
      const changedDuringPreview=copilotContextChange(context,liveCopilotContextRef.current);
      if(changedDuringPreview){discardCadPlan(preview.planId);throw new Error(changedDuringPreview);}
      if(!preview.result.ok||preview.stale){setCopilotError(preview.result.reason??"The document changed; plan again.");discardCadPlan(preview.planId);return;}
      setCopilotValidated(preview);
      setCopilotReviewedKey(JSON.stringify(planned.command));
      if(planned.command.type==="move-object"){
        const ghosts:CopilotPlan["ghosts"]=[];
        for(const change of preview.changes){
          const paths=getCadPlanDrawingPaths(preview.planId,change.objectId);
          if(!paths)continue;
          for(const role of ["source","result"] as const){const points=role==="source"?paths.before:paths.after;
            if(points?.length)ghosts.push({kind:"path",key:`copilot-move-${change.objectId}-${role}`,points,workPlane:context.workPlane,closed:role==="source"?paths.beforeClosed:paths.afterClosed,role});
          }
        }
        planned.ghosts=ghosts;
      }
      setCopilotPlan({...planned,summary:[...planned.summary,...preview.changes.filter(change=>change.after?.volume!==undefined).map(change=>`${change.name}: ${change.after!.volume!.toFixed(4)} mm³`)]});
    }catch(error){if(sequence===copilotSequence.current){setCopilotPlan(null);setCopilotError(error instanceof Error?error.message:"Preview failed.");}}
    finally{if(sequence===copilotSequence.current){setCopilotApplying(false);if(copilotAbort.current===controller)copilotAbort.current=null;}}
  }

  const dimensionCommand = selectedObjectId && !activeSketchId
    ? planDimensionFromSelection(cadDocument, selectedObjectId)
    : null;

  async function handleDimensionFromSelection() {
    if (!dimensionCommand) {
      setShortcutReadout("Select a line or circle to dimension");
      return;
    }
    const result = await dispatchCadCommand({ ...dimensionCommand, layerId: selectedLayerId });
    const id = result.createdIds[0];
    if (id) {
      selectObject(id);
      setShortcutReadout("Dimension added");
    } else if (!result.ok) {
      setShortcutReadout(result.reason ?? "Dimension rejected");
    }
    syncRevision();
  }

  const copilotResults=copilotCompletedIds.filter(id=>!!cadDocument.objects[id]);
  const copilotReviewInput={command:"Copilot",draftKey:JSON.stringify(copilotPlan?.command),reviewedKey:copilotReviewedKey,preview:copilotValidated,visualReady:copilotPreviewFailed===0,targets:copilotRequestContext?.selectionIds??[],completedIds:copilotResults.length?copilotResults:undefined,inputError:copilotContextError??(activeSketchId?"Finish the active sketch first.":activeLayerLocked?"Unlock the active layer first.":copilotError)};
  const copilotInteraction=commandInteraction({...copilotReviewInput,pending:copilotApplying});
  const copilotReviewRef=useRef(copilotReviewInput);copilotReviewRef.current=copilotReviewInput;
  async function handleCopilotApply() {
    if (copilotApplyOperation.current || !copilotInteraction.canApply || !copilotValidated || !copilotRequestContext || copilotContextChange(copilotRequestContext,liveCopilotContextRef.current)) return;
    const preview=copilotValidated,context=copilotRequestContext;
    const operation={controller:new AbortController(),sequence:++copilotSequence.current};
    copilotApplyOperation.current=operation;
    setCopilotApplying(true);
    try {
      const result = await applyCadPlan(preview.planId,{signal:operation.controller.signal,validate:()=>{
        const changed=copilotContextChange(context,{...liveCopilotContextRef.current,version:documentVersion()});
        if(changed)return changed;
        const review=commandInteraction({...copilotReviewRef.current,pending:false});
        if(!review.canApply||copilotReviewRef.current.preview?.planId!==preview.planId)return review.validationError??"The reviewed proposal changed. Plan again.";
        if(copilotPlan)try{validateCopilotEdit(copilotPlan.command,cadDocument,context.selectionIds,context.workPlane);}catch(error){return error instanceof Error?error.message:"The edit target changed. Plan again.";}
        // Only suppress invalidation for this synchronous publication, never
        // while Apply waits in the queue. Cancel remains effective until here.
        copilotPublishing.current=true;
      }});
      if(operation.sequence!==copilotSequence.current)return;
      if (result.ok) {
        const moved=copilotPlan?.command.type==="move-object"?[copilotPlan.command.objectId]:[];
        const created = [...result.createdIds,...moved].filter((id) => Boolean(cadDocument.objects[id]));
        if (created.length) selectObjects(created);
        setShortcutReadout(`Copilot: ${moved.length?"moved":"created"} ${created.length} object${created.length === 1 ? "" : "s"}`);
        setCopilotPlan(null);
        setCopilotValidated(null);
        setCopilotRequestContext(null);
        setCopilotReviewedKey(undefined);
        setCopilotError("");
        setCopilotPreviewFailed(0);
        setCopilotCompletedIds(created);
        discardCadPlan(preview.planId);
      } else {
        setCopilotError(result.reason??"Copilot Apply was rejected. Plan again.");
        setShortcutReadout(result.reason ?? "Copilot apply rejected");
      }
      syncRevision();
    } catch(error) {
      if(operation.sequence===copilotSequence.current){
        discardCadPlan(preview.planId);setCopilotValidated(null);setCopilotReviewedKey(undefined);setCopilotPlan(null);
        setCopilotError(error instanceof Error?error.message:"Copilot Apply failed. Plan again.");
      }
    } finally {
      if(copilotApplyOperation.current===operation){copilotApplyOperation.current=null;copilotPublishing.current=false;setCopilotApplying(false);}
    }
  }

  async function handleExtrude(distance = 10) {
    if (!extrudeProfile.ok || activeSketch) return;
    if (documentBusy()) return;
    clearCommandTools();
    setExtrusion({loops:extrudeProfile.loops, chosen:extrudeProfile.loops.map(loop=>loop.id), distance:String(distance), layerId:selectedLayerId, revision:documentRevision, previousMode:workspaceMode});
    setExtrusionStatus("Preparing preview…"); setWorkspaceMode("3d");
  }

  function handleImportImage() {
    if (documentBusy()) return;
    imageFileInput.current?.click();
  }

  async function handleImportImageFile(file: File | undefined) {
    if (!file || documentBusy()) return;
    const sourceVersion = documentVersion();
    const startedAt = performance.now();
    const layer = cadDocument.layers[selectedLayerId];
    if (!layer || layer.locked || !layer.visible) {
      setShortcutReadout("Choose a visible, unlocked layer before importing an image.");
      return;
    }
    try {
      const { asset, decodeMs, conversionNotice } = await importRasterFile(file);
      const pixelWidth = asset.width, pixelHeight = asset.height;
      if (!sameDocumentVersion(sourceVersion)) {
        setShortcutReadout("The document changed while the image was decoding. Import it again into the current document.");
        return;
      }
      const board = activeArtboardId ? cadDocument.artboards?.[activeArtboardId] : undefined;
      const targetBoard = board?.visible && !board.locked && board.workPlane === activeWorkPlane ? board : undefined;
      const maximumWidth = targetBoard ? targetBoard.size[0] * 0.5 : 100;
      let width = Math.max(1, Math.min(100, maximumWidth));
      let height = width * pixelHeight / pixelWidth;
      if (targetBoard && height > targetBoard.size[1] * 0.5) { height = targetBoard.size[1] * 0.5; width = height * pixelWidth / pixelHeight; }
      const center = targetBoard ? planeToWorld([targetBoard.origin[0] + targetBoard.size[0] / 2, targetBoard.origin[1] + targetBoard.size[1] / 2], WORK_PLANES[targetBoard.workPlane]) : planeToWorld([0, 0], WORK_PLANES[activeWorkPlane]);
      const result = await dispatchCadCommand({ type: "insert-image", asset, workPlane: activeWorkPlane, center, width, height, layerId: selectedLayerId });
      if (!result.ok) { setShortcutReadout(result.reason ?? "Image placement was rejected."); return; }
      syncRevision();
      selectObjects(result.createdIds.filter(id => Boolean(cadDocument.objects[id])));
      const totalMs = performance.now() - startedAt;
      performance.measure("agent-webcad:image-import", { start: startedAt, end: performance.now(), detail: { bytes: file.size, pixels: pixelWidth * pixelHeight, decodedRgbaBytes: pixelWidth * pixelHeight * 4, decodeMs, totalMs } });
      setShortcutReadout(`Imported ${file.name} · ${pixelWidth} × ${pixelHeight} px · ${totalMs.toFixed(1)} ms${conversionNotice ? ` · ${conversionNotice}` : ""}`);
    } catch (error) {
      console.error("Failed to import image:", error);
      setShortcutReadout(error instanceof Error ? error.message : "Could not decode this image.");
    }
  }

  function cancelExtrusion() {
    if (extrusion) { setWorkspaceMode(extrusion.previousMode); issueViewAction("focus"); }
    setExtrusion(null);
  }

  async function applyExtrusion() {
    if (!extrusion || !extrusionPreview || extrusionStatus !== "Preview ready" || documentBusy()) return;
    const result = await dispatchCadCommand({
      type: "create-extrude",
      profileObjectIds: [...new Set(extrusion.loops.filter(loop=>extrusion.chosen.includes(loop.id)).flatMap(loop=>loop.sourceObjectIds))],
      distance: extrusionPreview.distance,
      layerId: extrusion.layerId,
    });
    const newId = result.createdIds[0];
    if (newId) {
      setExtrusion(null);
      setWorkspaceMode("3d");
      selectObject(newId);
    } else if (!result.ok) setShortcutReadout(result.reason ?? "Extrude rejected");
    syncRevision();
  }

  async function handleRevolve() {
    if (!extrudeProfile.ok || activeSketch) return;
    const result = await dispatchCadCommand({
      type: "create-revolve",
      profileObjectIds: selectedObjectIds,
      axis: "x",
      angle: 360,
      layerId: selectedLayerId,
    });
    const newId = result.createdIds[0];
    if (newId) {
      setWorkspaceMode("3d");
      selectObject(newId);
    } else if (!result.ok) setShortcutReadout(result.reason ?? "Revolve rejected");
    syncRevision();
  }

  const sweepMatch = !activeSketch ? sweepReady(cadDocument, selectedObjectIds) : null;
  const loftMatch = !activeSketch ? loftReady(cadDocument, selectedObjectIds) : null;

  async function handleSweep() {
    if (!sweepMatch || activeLayerLocked) return;
    const result = await dispatchCadCommand({
      type: "create-sweep",
      profileObjectIds: [sweepMatch.profile],
      pathObjectId: sweepMatch.path,
      layerId: selectedLayerId,
    });
    const newId = result.createdIds[0];
    if (newId) {
      setWorkspaceMode("3d");
      selectObject(newId);
    } else if (!result.ok) setShortcutReadout(result.reason ?? "Sweep rejected");
    syncRevision();
  }

  async function handleLoft() {
    if (!loftMatch || activeLayerLocked) return;
    const result = await dispatchCadCommand({
      type: "create-loft",
      profileObjectIds: loftMatch,
      layerId: selectedLayerId,
    });
    const newId = result.createdIds[0];
    if (newId) {
      setWorkspaceMode("3d");
      selectObject(newId);
    } else if (!result.ok) setShortcutReadout(result.reason ?? "Loft rejected");
    syncRevision();
  }

  function activateDrawingTool(tool: DrawingTool) {
    const next = drawingTool === tool ? null : tool;
    clearCommandTools();
    setPointTransform(null);
    lastCommand.current = { kind: "drawing", tool };
    setLineEditTool(null);
    setOffsetActive(false);
    setTransformMode(null);
    setMeasurementTool(null);
    setDistanceMeasurement(null);
    setDrawingTool(next);
    if (activeWorkPlane === "XY") {
      setProjectionMode("orthographic");
      issueViewAction("top");
    }
  }

  function activateMeasurementTool() {
    const next = measurementTool === "distance" ? null : "distance";
    clearCommandTools();
    setPointTransform(null);
    setDrawingTool(null);
    setLineEditTool(null);
    setOffsetActive(false);
    setTransformMode(null);
    setDistanceMeasurement(null);
    setMeasurementTool(next);
  }

  function activateOffsetTool() {
    clearCommandTools();
    setPointTransform(null);
    lastCommand.current = { kind: "offset" };
    setDrawingTool(null);
    setMeasurementTool(null);
    setLineEditTool(null);
    setTransformMode(null);
    setOffsetActive(true);
  }

  function changeWorkspace(mode: WorkspaceMode) {
    clearCommandTools();
    if (activeSketchId && mode === "3d") {
      setActiveSketchId(null);
      setDirectSelectMode(false);
    }
    setLineEditTool(null);
    setWorkspaceMode(mode);
    setProjectionMode(mode === "2d" ? "orthographic" : "perspective");
    setDrawingTool(null);
    setMeasurementTool(null);
    setTransformMode(null);
  }

  async function handleDrawingCommit(drawing: DrawingTool, params: Record<string, unknown>) {
    if (activeSketch) {
      const id = `sketch-${drawing}-${crypto.randomUUID()}`;
      const geometry = drawingToSketchGeometry(activeSketch, drawing, params, id);
      if (!geometry) { setShortcutReadout("Sketch geometry rejected: invalid or off work plane"); return; }
      const bindings = Array.isArray(params.sketchSnapBindings) ? params.sketchSnapBindings as SketchSnapBinding[] : [];
      const constraints = automaticConstraints && params.suppressAutomaticConstraints !== true ? inferSketchConstraints(activeSketch, geometry, bindings) : [];
      const result = await dispatchCadCommand({ type: "add-sketch-geometry", sketchId: activeSketch.id, geometry, constraints });
      if (result.ok) selectObject(id);
      else setShortcutReadout(result.reason ?? "Sketch geometry rejected");
    } else {
      const result = await dispatchCadCommand({ type: "create-drawing", drawing, params, layerId: selectedLayerId });
      const newId = result.createdIds[0];
      if (newId) selectObject(newId);
      else if (!result.ok) setShortcutReadout(result.reason ?? "Drawing creation rejected");
    }
    syncRevision();
  }

  async function toggleSketch() {
    if (activeSketchId) { clearCommandTools(); setActiveSketchId(null); setSelection({ ids: [], primaryId: null }); return; }
    const id = `Sketch ${Object.keys(cadDocument.sketches ?? {}).length + 1}`;
    const result = await dispatchCadCommand({ type: "create-sketch", id, workPlane: activeWorkPlane, layerId: selectedLayerId });
    if (!result.ok) { setShortcutReadout(result.reason ?? "Could not create sketch"); return; }
    setActiveSketchId(id); setActiveActivity("model"); setSelection({ ids: [], primaryId: null }); changeWorkspace("2d"); syncRevision();
  }

  function editSketch(id: string) {
    const sketch = cadDocument.sketches?.[id];
    if (!sketch) return;
    setActiveSketchId(id); setSelectedLayerId(sketch.layerId); setActiveWorkPlane(sketch.workPlane);
    setDrawingTool(null); setTransformMode(null); setSelection({ ids: [], primaryId: null }); changeWorkspace("2d");
  }

  async function handleDeleteObject() {
    const ids = selectedObjectIds.length ? selectedObjectIds : selectedObjectId ? [selectedObjectId] : [];
    if (!ids.length) return;
    if (activeSketch && ids.every((id) => activeSketch.geometry.some((entry) => entry.id === id))) {
      const commands = ids.map((geometryId) => ({ type: "remove-sketch-geometry" as const, sketchId: activeSketch.id, geometryId }));
      const result = await dispatchCadCommand(commands.length === 1 ? commands[0] : { type: "batch", label: `Delete ${ids.length} sketch entities`, commands });
      if (!result.ok) { setShortcutReadout(result.reason ?? "Sketch deletion rejected"); return; }
    } else {
      const result = await dispatchCadCommand({ type: "batch", label: `Delete ${ids.length} objects`, commands: ids.map((objectId) => ({ type: "delete-object", objectId })) });
      if (!result.ok) { setShortcutReadout(result.reason ?? "Delete rejected"); return; }
    }
    setSelection({ ids: [], primaryId: null });
    syncRevision();
  }

  function beginPointTransform(mode: PointTransformMode) {
    if (workspaceMode !== "2d" || !selectionEditable || !canModifySelection || documentBusy()) return;
    clearCommandTools();
    lastCommand.current = { kind: "points", mode };
    setShortcutReadout("");
    setPointTransform({ mode, sequence: ++pointSequence.current, ids: [...selectedObjectIds], revision: cadDocument.revision });
  }
  function beginPattern(kind:CadPatternSpec["kind"],patternId?:string){
    if(documentBusy())return;
    const existing=patternId?Object.values(cadDocument.features).find(f=>f.pattern?.id===patternId)?.pattern:undefined;
    const ids=existing?.sourceObjectIds??selectedObjectIds.filter(id=>Object.values(cadDocument.features).some(f=>f.output===id&&f.type==="drawing"));
    const sources=ids.map(id=>Object.values(cadDocument.features).find(f=>f.output===id));
    if(sources.some(f=>f?.type!=="drawing"))return;
    const workPlane=(existing?.spec.workPlane??sources[0]?.params.workPlane??activeWorkPlane) as WorkPlaneId;
    if(sources.some(f=>(f!.params.workPlane??"XY")!==workPlane))return;
    changeWorkspace("2d");setActiveWorkPlane(workPlane);setActiveSketchId(null);
    const spec:CadPatternSpec=existing?.spec??(kind==="linear"?{kind,workPlane,columns:3,rows:1,spacing:[20,20]}:kind==="radial"?{kind,workPlane,count:6,center:[0,0],angle:60}:{kind,workPlane,axisStart:[0,0],axisEnd:[0,50]});
    setPatternSession({id:`pattern-${crypto.randomUUID()}`,sourceObjectIds:[...ids],spec:structuredClone(spec),patternId,layerId:existing?.layerId??selectedLayerId});
  }
  const selectedDrawings = selectedObjectIds.map(id => Object.values(cadDocument.features).find(f => f.output === id));
  const standaloneCurves = selectionEditable && !activeSketch && selectedDrawings.every(f => f?.type === "drawing" && !f.params.sketchId && !f.pattern && !f.construction && !["point", "infinite-line", "ray"].includes(String(f.params.kind)));
  const stretchIds = selectedObjectIds.length ? standaloneCurves && selectedDrawings.every(f => (f?.params.workPlane ?? "XY") === (selectedDrawings[0]?.params.workPlane ?? "XY")) ? [...selectedObjectIds] : [] : !activeSketch ? Object.values(cadDocument.features).filter(f => {
    const object = cadDocument.objects[f.output], layer = object && cadDocument.layers[object.layerId];
    return f.type === "drawing" && !f.params.sketchId && !f.pattern && !f.construction && !["point", "infinite-line", "ray"].includes(String(f.params.kind)) && (constructionVisible || !f.params.construction) && (f.params.workPlane ?? "XY") === activeWorkPlane && object?.visible && layer?.visible && !layer.locked;
  }).map(f => f.output) : [];
  const canContour = {
    join: standaloneCurves && selectedObjectIds.length >= 2 && selectedDrawings.every(f => !f!.params.closed && ["line", "arc", "polyline"].includes(String(f!.params.kind))),
    explode: standaloneCurves && selectedDrawings.every(f => ["polyline", "rectangle"].includes(String(f!.params.kind))),
    break: standaloneCurves && selectedObjectIds.length === 1,
    polyline: standaloneCurves && selectedObjectIds.length === 1 && ["polyline", "rectangle"].includes(String(selectedDrawings[0]?.params.kind)),
    lengthen: standaloneCurves && selectedObjectIds.length === 1 && !selectedDrawings[0]?.params.closed && ["line", "arc", "polyline"].includes(String(selectedDrawings[0]?.params.kind)),
    stretch: stretchIds.length > 0 && stretchIds.length <= 4096,
  };
  function beginContour(mode: ContourMode) {
    if (documentBusy() || !canContour[mode]) return;
    const ids = mode === "stretch" ? stretchIds : [...selectedObjectIds], plane = (Object.values(cadDocument.features).find(f => f.output === ids[0])?.params.workPlane ?? "XY") as WorkPlaneId;
    clearCommandTools(); changeWorkspace("2d"); setActiveWorkPlane(plane);
    lastCommand.current = { kind: "contour", mode };
    setContourSession({ id: `contour-${crypto.randomUUID()}`, mode, objectIds: ids });
  }

  function beginCurveWorkflow() {
    if (documentBusy() || activeSketch) return;
    const ids = selectedObjectIds.filter(id=>{const f=Object.values(cadDocument.features).find(f=>f.output===id);return f?.type==="drawing"&&!f.pattern&&!f.construction&&["line","polyline","rectangle","arc","circle"].includes(String(f.params.kind));});
    const plane = (Object.values(cadDocument.features).find(f => f.output === ids[0])?.params.workPlane ?? activeWorkPlane) as WorkPlaneId;
    clearCommandTools(); changeWorkspace("2d"); setActiveWorkPlane(plane);
    setCurveSession({ id: `curve-workflow-${crypto.randomUUID()}`, objectIds: ids });
  }

  function beginConstruction() {
    if (documentBusy() || activeSketch || activeLayerLocked) return;
    clearCommandTools(); changeWorkspace("2d"); setConstructionVisible(true);
    setConstructionSession({ id: `construction-${crypto.randomUUID()}`, workPlane: activeWorkPlane, layerId: selectedLayerId, selectedIds: [...selectedObjectIds] });
  }

  function beginAngularDimension(editId?: string) {
    if (documentBusy() || activeSketch || activeLayerLocked) return;
    const edited = editId ? Object.values(cadDocument.features).find(f=>f.output===editId) : undefined;
    if (editId && edited?.params.kind !== "angular") return;
    const selected = selectedObjectIds.filter(id=>Object.values(cadDocument.features).some(f=>f.output===id&&f.type==="drawing"));
    const first = Object.values(cadDocument.features).find(f=>f.output===selected[0]);
    const plane = (edited?.params.workPlane ?? first?.params.workPlane ?? activeWorkPlane) as WorkPlaneId;
    clearCommandTools(); changeWorkspace("2d"); setActiveWorkPlane(plane);
    setAngularSession({id:`angular-${crypto.randomUUID()}`,layerId:selectedLayerId,workPlane:plane,selectedIds:selected,editId});
  }

  function toggleConstruction() {
    clearCommandTools(); setConstructionVisible(v => !v);
    setSelection({ ids: [], primaryId: null });
  }
  async function commitPointTransform(base: [number, number, number], target: [number, number, number], angle: number) {
    if (!pointTransform || documentBusy()) return { ok: false, reason: "A document operation is still pending." };
    const command = planPointTransform(cadDocument, pointTransform.ids, pointTransform.mode, base, target, angle, activeWorkPlane, activeSketch?.id);
    if (!command) return { ok: false, reason: "Invalid or unchanged point operation. Choose a different target." };
    pointCommitPending.current=true;
    try {
      const result = await dispatchViewportCommand(command);
      if (result.ok) {
        setPointTransform(current => current?.sequence === pointTransform.sequence
          ? pointTransform.mode === "copy" ? { ...current, revision: cadDocument.revision } : null
          : current);
        if (result.createdIds.length) selectObjects(result.createdIds);
      }
      return { ok: result.ok, reason: result.reason };
    } finally {
      pointCommitPending.current=false;
      syncRevision();
    }
  }
  function repeatLastCommand() {
    const command = lastCommand.current;
    if (command?.kind === "drawing") activateDrawingTool(command.tool);
    else if (command?.kind === "points") beginPointTransform(command.mode);
    else if (command?.kind === "precision") beginPrecisionTransform(command.mode);
    else if (command?.kind === "offset") activateOffsetTool();
    else if (command?.kind === "line-edit") activateLineEditTool(command.mode);
    else if (command?.kind === "contour") beginContour(command.mode);
  }

  async function handleDuplicateObject() {
    const ids = selectedObjectIds.length ? selectedObjectIds : selectedObjectId ? [selectedObjectId] : [];
    // Mirror the canDuplicate gate: every member must be editable and no
    // sketch-owned geometry may leak into a standalone duplicate batch.
    if (!ids.length || !selectionEditable || !canModifySelection) return;
    if (activeSketchSelection && activeSketch) {
      const result = await dispatchViewportCommand({ type: "duplicate-sketch-geometry", sketchId: activeSketch.id, geometryIds: ids, offset: [10, 0] });
      if (result.ok) setSelection({ ids: result.createdIds, primaryId: result.createdIds.at(-1) ?? null });
      syncRevision(); return;
    }
    const offset = repeatDuplicateOffset(cadDocument, lastDuplicate.current, ids) ?? [10, 0, 0];
    let created: string[] = [];
    if (ids.length === 1) {
      const result = await dispatchCadCommand({ type: "duplicate-object", objectId: ids[0], offset });
      if (result.createdIds[0]) created = [result.createdIds[0]];
      else if (!result.ok) setShortcutReadout(result.reason ?? "Duplicate rejected");
    } else {
      const result = await dispatchCadCommand({ type: "batch", label: `Duplicate ${ids.length} objects`, commands: ids.map((objectId) => ({ type: "duplicate-object", objectId, offset })) });
      created = result.createdIds;
      if (!result.ok) setShortcutReadout(result.reason ?? "Duplicate rejected");
    }
    if (created.length === ids.length) {
      lastDuplicate.current = { sourceIds: [...ids], copyIds: created };
      setSelection({ ids: created, primaryId: created.at(-1) ?? null });
    }
    syncRevision();
  }

  async function commitOffsetFromViewport(side = offsetSide) {
    if (selectedObjectIds.length !== 1) return;
    const object = cadDocument.objects[selectedObjectIds[0]];
    const feature = object ? Object.values(cadDocument.features).find((entry) => entry.output === object.id && entry.type === "drawing") : undefined;
    const distance = parseLength(offsetDistance);
    const layer = object ? cadDocument.layers[object.layerId] : undefined;
    if (!object || !feature || distance === null || !Number.isFinite(distance) || distance <= 1e-9 || !object.visible || !layer?.visible || layer.locked) return;
    const result = await dispatchCadCommand(activeSketchSelection && activeSketch ? { type: "offset-sketch-geometry", sketchId: activeSketch.id, geometryId: object.id, distance, side } : { type: "offset-drawing", objectId: object.id, distance, side });
    const id = result.createdIds[0];
    if (id) selectObject(id);
    else if (!result.ok) setShortcutReadout(result.reason ?? "Offset rejected");
    syncRevision();
  }

  function activateLineEditTool(mode: "trim" | "extend") {
    clearCommandTools();
    setPointTransform(null);
    lastCommand.current = { kind: "line-edit", mode };
    if (selectedObjectIds.length !== 1 || selectedFeature?.type !== "drawing" || !selectionEditable) return;
    setDrawingTool(null);
    setMeasurementTool(null);
    setTransformMode(null);
    setOffsetActive(false);
    setDirectSelectMode(false);
    setLineEditTool((current) => current === mode ? null : mode);
  }

  async function commitLineEdit(mode: "trim" | "extend", targetId: string, pickPoint: [number, number, number]) {
    if (!selectedObjectId || targetId === selectedObjectId) return;
    const result = await dispatchCadCommand(activeSketchSelection && activeSketch ? { type: mode === "trim" ? "trim-sketch-geometry" : "extend-sketch-geometry", sketchId: activeSketch.id, targetId, cutterId: selectedObjectId, pickPoint } : { type: mode === "trim" ? "trim-drawing" : "extend-drawing", targetId, cutterId: selectedObjectId, pickPoint });
    if (!result.ok) setShortcutReadout(result.reason ?? `${mode === "trim" ? "Trim" : "Extend"} rejected`);
    syncRevision();
  }

  async function handleHideObject() {
    const ids = selectedObjectIds.length ? selectedObjectIds : selectedObjectId ? [selectedObjectId] : [];
    if (!ids.length) return;
    await dispatchCadCommand({ type: "batch", label: `Hide ${ids.length} objects`, commands: ids.map((objectId) => ({ type: "set-object-visible" as const, objectId, visible: false })) });
    setSelection({ ids: [], primaryId: null });
    syncRevision();
  }

  async function handleIsolateObject() {
    if (isolatedObjectIds) {
      setIsolatedObjectIds(null);
      return;
    }
    const ids = selectedObjectIds.filter((id) => Boolean(cadDocument.objects[id]));
    if (!ids.length) return;
    setIsolatedObjectIds(ids);
  }

  async function handleShowAllObjects() {
    setIsolatedObjectIds(null);
    await dispatchCadCommand({ type: "show-all-objects" });
    syncRevision();
  }

  useEffect(() => {
    function handleHistoryKeyDown(event: KeyboardEvent) {
      const action = routeHistoryShortcut(event);
      if (!action || isCadHistoryBlocked(event.target)) return;
      // Tool forms stop bubbling; capture gives all non-text controls the same
      // document history path, without stealing native input undo.
      event.preventDefault(); event.stopImmediatePropagation();
      action === "undo" ? handleUndo() : handleRedo();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || isCadKeyboardBlocked(event.target, event.key)) return;
      if(patternSession){if(event.key==="Escape"){event.preventDefault();setPatternSession(null);}return;}
      if (extrusion) { if(event.key === "Escape") {event.preventDefault();cancelExtrusion();} return; }
      if (event.key === "F3") { event.preventDefault(); setSnapEnabled((value) => !value); return; }
      if (event.key === "F8") { event.preventDefault(); setOrthoEnabled((value) => !value); return; }
      if (contourSession) { if (event.key === "Escape") { event.preventDefault(); setContourSession(null); } return; }
      if (curveSession && !event.ctrlKey && !event.metaKey) return;
      if (pointTransform) {
        if (event.ctrlKey || event.metaKey) {
          const key = event.key.toLowerCase();
          if (key === "s") { event.preventDefault(); event.shiftKey ? handleSaveAs() : handleSave(); }
        }
        return;
      }
      const precision = precisionTransformRef.current;
      if (precision) {
        if (event.key === "Escape") {
          event.preventDefault();
          clearPrecisionTransform();
          return;
        }
        if (event.key === "Backspace") {
          event.preventDefault();
          precision.buffer = precision.buffer.slice(0, -1);
          setPrecisionTransform({ ...precision });
          updatePrecisionReadout(precision);
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          void commitPrecisionTransform({ ...precision });
          return;
        }
        const axis = event.key.toUpperCase();
        if (axis === "X" || axis === "Y" || axis === "Z") {
          event.preventDefault();
          precision.axis = axis === "X" ? 0 : axis === "Y" ? 1 : 2;
          setPrecisionTransform({ ...precision });
          updatePrecisionReadout(precision);
          return;
        }
        if (numericShortcutCharacter(event.key)) {
          event.preventDefault();
          precision.buffer += event.key === "," && !(precision.mode === "translate" && precision.axis === null) ? "." : event.key;
          setPrecisionTransform({ ...precision });
          updatePrecisionReadout(precision);
          return;
        }
        // A precision transform owns the keyboard until it commits or cancels.
        return;
      }
      if (event.key === "Delete" && selectedObjectId) {
        event.preventDefault();
        void handleDeleteObject();
        return;
      }
      if (event.key === "Escape") {
        if (lineEditTool) { setLineEditTool(null); return; }
        if (offsetActive) { setOffsetActive(false); return; }
        // Drawing owns partial-input cancellation and exits only when idle.
        if (drawingTool) return;
        if (measurementTool) { setMeasurementTool(null); return; }
        if (transformMode) { setTransformMode(null); return; }
        if (directSelectMode) { setDirectSelectMode(false); return; }
        selectObject(null);
        return;
      }
      if (event.key === "F2" && !drawingTool && !measurementTool && !lineEditTool) {
        event.preventDefault();
        setTransformMode(null);
        setDirectSelectMode((enabled) => !enabled);
        return;
      }
      if (drawingTool || measurementTool || directSelectMode || lineEditTool) return;
      if (!event.ctrlKey && !event.metaKey && !event.altKey && (event.key === "Enter" || event.key === " ") && lastCommand.current) {
        event.preventDefault(); repeatLastCommand(); return;
      }
      if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        if (event.key === "1") { event.preventDefault(); issueViewAction("top"); return; }
        if (event.key === "2") { event.preventDefault(); issueViewAction("front"); return; }
        if (event.key === "3") { event.preventDefault(); issueViewAction("right"); return; }
        if (event.key === "0") { event.preventDefault(); issueViewAction("isometric"); return; }
        if (event.key === "5" && workspaceMode !== "2d") { event.preventDefault(); setProjectionMode((mode) => mode === "perspective" ? "orthographic" : "perspective"); return; }
      }
      if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        const action = routeCadShortcut(event.key, {
          workspaceMode,
          hasSelection: selectedObjectIds.length > 0,
          selectionEditable,
          activeLayerLocked,
          canOffset: selectedObjectIds.length === 1 && selectedFeature?.type === "drawing" && selectionEditable && canModifySelection,
          canTrim: selectedObjectIds.length === 1 && selectedFeature?.type === "drawing" && selectionEditable && canModifySelection,
          canExtrude: extrudeProfile.ok && selectionEditable && !activeSketch,
        }, { shiftKey: event.shiftKey });
        if (action) {
          event.preventDefault();
          if (action === "line" || action === "polyline" || action === "rectangle" || action === "circle" || action === "arc") activateDrawingTool(action);
          else if (action === "copy") beginPointTransform("copy");
          else if ((action === "move" || action === "rotate") && workspaceMode === "2d") beginPointTransform(action);
          else if (action === "move" || action === "rotate" || action === "scale") beginPrecisionTransform(action === "move" ? "translate" : action);
          else if (action === "offset") activateOffsetTool();
          else if (action === "trim") activateLineEditTool("trim");
          else if (action === "measure") activateMeasurementTool();
          else if (action === "extrude") void handleExtrude();
          else if (action === "fit") issueViewAction(selectedObjectIds.length ? "fit-selection" : "fit-all");
          else if (action === "hide") void handleHideObject();
          return;
        }
      }
      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier) return;
      const key = event.key.toLowerCase();
      if (key === "a") { event.preventDefault(); selectObjects(selectAllIds(cadDocument, activeSketchId)); }
      else if (key === "s") { event.preventDefault(); event.shiftKey ? handleSaveAs() : handleSave(); }
      else if (key === "d") { event.preventDefault(); void handleDuplicateObject(); }
      else if (key === "o") { event.preventDefault(); handleOpen(); }
      else if (key === "n") { event.preventDefault(); handleNewDocument(); }
    }
    window.addEventListener("keydown", handleHistoryKeyDown, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => { window.removeEventListener("keydown", handleHistoryKeyDown, true); window.removeEventListener("keydown", handleKeyDown); };
  }, [currentFingerprint, selectedObjectId, selectedObjectIds, selectedFeature, selectedLayerLocked, selectionEditable, selectedSketchOwned, activeSketchId, activeLayerLocked, extrudeProfile.ok, drawingTool, measurementTool, transformMode, directSelectMode, lineEditTool, offsetActive, workspaceMode, pointTransform, extrusion,patternSession,contourSession,curveSession]);

  const properties = activeSketch ? <SketchInspector reviewResetKey={constraintReviewReset} onConstraintReview={setConstraintReview} onVariables={()=>setActiveActivity("variables")} selectedConstraintId={selectedSketchConstraintId} onSelectConstraint={setSelectedSketchConstraintId} diagnostic={sketchDiagnostic} offsetDistance={offsetDistance} onOffsetDistanceChange={setOffsetDistance} offsetSide={offsetSide} onOffsetSideChange={setOffsetSide} onOffset={() => void commitOffsetFromViewport()} sketch={activeSketch} selectedObjectIds={selectedObjectIds} selectedSubObjects={selection.subObjects ?? []} onDocumentChange={syncRevision} /> : selectedFeature?.params.sketchId ? <div className="properties-content"><section className="property-section"><h3>Sketch geometry</h3><div className="property-row"><span>Entity</span><strong>{selectedObject?.name}</strong></div><div className="property-row"><span>Owner</span><strong>{String(selectedFeature.params.sketchId)}</strong></div><button type="button" className="sketch-edit-button" onClick={() => editSketch(String(selectedFeature.params.sketchId))}>Edit Sketch</button></section>{selectedObjectId && <DependencyNotice objectId={selectedObjectId} revision={documentRevision}/>}</div> : (
    <PropertiesPanel
      onEditAngularDimension={id=>beginAngularDimension(id)}
      onEditPattern={id=>beginPattern(Object.values(cadDocument.features).find(f=>f.pattern?.id===id)!.pattern!.spec.kind,id)}
      onImageCropPreview={setImageCropPreview}
      imageCropEditingId={imageCropEditingId}
      onImageCropHandleModeChange={setImageCropHandleMode}
      onImageCropDraftRegister={registerImageCropDraft}
      onVariables={()=>setActiveActivity("variables")}
      draftingPlane={workspaceMode === "2d" ? activeWorkPlane : undefined}
      documentRevision={documentRevision}
      selectedObjectId={selectedObjectId}
      selectedObjectIds={selectedObjectIds}
      isolationActive={Boolean(isolatedObjectIds)}
      selectedSubObjects={selection.subObjects}
      selectedLayerId={selectedLayerId}
      onDocumentChange={syncRevision}
      onDuplicate={() => void handleDuplicateObject()}
      onDelete={() => void handleDeleteObject()}
      onHide={() => void handleHideObject()}
      onIsolate={() => void handleIsolateObject()}
      onShowAll={() => void handleShowAllObjects()}
      onBooleanCreated={(id) => selectObject(id)}
      offsetDistance={offsetDistance}
      onOffsetDistanceChange={setOffsetDistance}
      offsetSide={offsetSide}
      onOffsetSideChange={setOffsetSide}
      offsetActive={offsetActive}
      onOffsetStart={activateOffsetTool}
      onOffsetCancel={() => setOffsetActive(false)}
      onCornerPreview={handleCornerPreview}
      onFilletPreview={setFilletPreview}
      onChamferPreview={setChamferPreview}
    />
  );

  return (
    <>
      {plotOpen && (
        <PlotDialog
          activeWorkPlane={activeWorkPlane}
          onClose={() => setPlotOpen(false)}
          onPlotted={(message) => setShortcutReadout(message)}
        />
      )}
      {artboardPngScene && <ArtboardPngDialog
        scene={artboardPngScene}
        filename={`${cadDocument.id}-${artboardPngScene.board.name.trim().replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || artboardPngScene.board.id}.png`}
        onClose={() => setArtboardPngScene(null)}
        onExported={message => setShortcutReadout(message)}
      />}
      {artboardPdfExport && <ArtboardPdfDialog
        boards={artboardPdfExport.boards}
        activeBoardId={artboardPdfExport.activeBoardId}
        documentId={artboardPdfExport.documentId}
        onClose={() => setArtboardPdfExport(null)}
        onExported={message => setShortcutReadout(message)}
      />}
      {dxfReview&&<DxfReviewDialog source={dxfReview} revision={documentRevision} onClose={()=>setDxfReview(null)} onApplied={ids=>{syncRevision();selectObjects(ids.filter(id=>!!cadDocument.objects[id]));setShortcutReadout("Imported reviewed DXF. Edit the selected geometry or save WebCAD JSON to keep its relationships.");}}/>}
      <input
        ref={openFileInput}
        type="file"
        accept=".json,.webcad.json"
        aria-hidden="true"
        tabIndex={-1}
        style={{ display: "none" }}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          void handleOpenFile(file);
        }}
      />
      <input
        ref={dxfFileInput}
        type="file"
        accept=".dxf"
        aria-label="Import DXF file"
        aria-hidden="true"
        tabIndex={-1}
        style={{ display: "none" }}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          void handleImportDxfFile(file);
        }}
      />
      <input ref={imageFileInput} type="file" accept={RASTER_FILE_ACCEPT} aria-label="Import image file" tabIndex={-1} style={{ display: "none" }} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void handleImportImageFile(file); }} />
      <AppShell
      onConstruction={beginConstruction} constructionVisible={constructionVisible} onToggleConstruction={toggleConstruction}
      onAngularDimension={()=>beginAngularDimension()}
      onCurveWorkflow={beginCurveWorkflow} canCurveWorkflow={!activeSketch}
      canContour={canContour} onContour={beginContour}
      activeActivity={activeActivity}
      activeArtboardId={activeArtboardId}
      activeArtboardName={activeArtboardId ? cadDocument.artboards?.[activeArtboardId]?.name : undefined}
      onExportArtboardSvg={handleExportArtboardSvg}
      onExportArtboardPng={handleExportArtboardPng}
      onExportArtboardPdf={handleExportArtboardPdf}
      hasVisibleArtboards={Object.values(cadDocument.artboards ?? {}).some(board => board.visible)}
      onActivateArtboard={activateArtboard}
      onInsertComponent={(blockId) => { setDraftingInitialBlockId(blockId); setDraftingOpen(true); }}
      documentId={cadDocument.id}
      documentRevision={documentRevision}
      selectedLayerId={selectedLayerId}
      activeLayerName={activeLayerName}
      activeSketchId={activeSketchId}
      onToggleSketch={() => void toggleSketch()}
      onEditSketch={editSketch}
      selectedObjectId={selectedObjectId}
      selectedObjectIds={selectedObjectIds}
      isolationActive={Boolean(isolatedObjectIds)}
      canUndo={cadHistory.canUndo()}
      canRedo={cadHistory.canRedo()}
      canCreateBox={!activeLayerLocked}
      canDuplicate={Boolean(selectedFeature) && selectionEditable && canModifySelection}
      canDelete={Boolean(selectedObject) && selectionEditable && (!selectedSketchOwned || Boolean(activeSketch))}
      canTransform={Boolean(selectedObject) && selectionEditable && canModifySelection}
      canArrange={selectedObjectIds.length >= 2 && selectionEditable && !selectedSketchOwned && !activeSketch}
      canDistribute={selectedObjectIds.length >= 3 && selectionEditable && !selectedSketchOwned && !activeSketch}
      canExtrude={extrudeProfile.ok && selectionEditable && !activeSketch}
      canRevolve={extrudeProfile.ok && extrudeProfile.loops.length === 1 && !extrudeProfile.loops[0].holes?.length && selectionEditable && !activeSketch}
      canSweep={Boolean(sweepMatch) && selectionEditable}
      canLoft={Boolean(loftMatch) && selectionEditable}
      canBuild={Boolean(buildingLoop) && !activeSketch && !activeLayerLocked}
      onSweep={() => void handleSweep()}
      onLoft={() => void handleLoft()}
      onBuildHouse={() => void handleBuildHouse(HOUSE_PRESET, "house")}
      onBuildApartment={() => void handleBuildHouse(APARTMENT_PRESET, "apart")}
      canTrim={selectedObjectIds.length === 1 && selectedFeature?.type === "drawing" && selectionEditable && canModifySelection}
      onOffset={activateOffsetTool}
      lineEditTool={lineEditTool}
      isModified={isModified}
      projectionMode={projectionMode}
      gridVisible={gridVisible}
      transformMode={transformMode}
      pointTransformMode={pointTransform?.mode ?? null}
      drawingTool={drawingTool}
      measurementTool={measurementTool}
      distanceMeasurement={distanceMeasurement}
      activeWorkPlane={activeWorkPlane}
      snapEnabled={snapEnabled} snapPreferences={snapPreferences}
      orthoEnabled={orthoEnabled}
      workspaceMode={workspaceMode}
      directSelectMode={directSelectMode}
      kernelStatus={kernelStatus}
      onChangeActivity={setActiveActivity}
      onSelectLayer={setSelectedLayerId}
      onSelectObject={(id, additive) => selectObject(id, additive)}
      onDocumentChange={syncRevision}
      onCreateBox={() => void handleCreateBox()}
      onCreatePrimitive={(primitive) => void handleCreatePrimitive(primitive)}
      onExtrude={() => void handleExtrude()}
      onRevolve={() => void handleRevolve()}
      onDrawingTool={activateDrawingTool}
      onMeasurementTool={activateMeasurementTool}
      onCycleWorkPlane={() => setActiveWorkPlane((plane) => plane === "XY" ? "XZ" : plane === "XZ" ? "YZ" : "XY")}
      onSnapPreferencesChange={changeSnapPreferences}
      onToggleSnap={() => setSnapEnabled((value) => !value)}
      onToggleOrtho={() => setOrthoEnabled((value) => !value)}
      onWorkspaceMode={changeWorkspace}
      onDirectSelectMode={(enabled) => { clearCommandTools(); setDirectSelectMode(enabled); issueViewAction("focus"); }}
      onDuplicate={() => void handleDuplicateObject()}
      onDelete={() => void handleDeleteObject()}
      onHide={() => void handleHideObject()}
      onIsolate={() => void handleIsolateObject()}
      onShowAll={() => void handleShowAllObjects()}
      onPointTransform={beginPointTransform}
      canPattern={!activeSketch&&!activeLayerLocked}
      onPattern={kind=>beginPattern(kind)}
      onTransformMode={(mode) => { const next = transformMode === mode ? null : mode; clearCommandTools(); setTransformMode(next); }}
      onViewAction={issueViewAction}
      onToggleProjection={() => {
        // A 2D workspace is always orthographic; projection toggles are a
        // 3D view concern and must not detach the camera from the work plane.
        if (workspaceMode !== "2d") {
          setProjectionMode((mode) => mode === "perspective" ? "orthographic" : "perspective");
        }
      }}
      onToggleGrid={() => setGridVisible((visible) => !visible)}
      onAlign={(mode) => void arrangeSelection(mode)}
      onDistribute={(axis) => void distributeSelection(axis)}
      onLineEditTool={activateLineEditTool}
      onUndo={handleUndo}
      onRedo={handleRedo}
      onNew={handleNewDocument}
      onSave={handleSave}
      onSaveAs={handleSaveAs}
      onOpen={handleOpen}
      onExportStl={() => void handleExportStl()}
      onExportSvg={handleExportSvg}
      onExportDxf={handleExportDxf}
      onExportStep={() => void handleExportStep()}
      onImportDxf={handleImportDxf}
      onImportImage={handleImportImage}
      onPlot={() => {
        if (documentBusy()) return;
        setPlotOpen(true);
      }}
      canDimension={Boolean(dimensionCommand)}
      onDimension={() => void handleDimensionFromSelection()}
      onInsertPavilion={() => void handleInsertPavilion()}
      copilot={{
        query: { state: copilotQuery.state, selectionCount: selectedObjectIds.length,
          targetId: copilotQuery.targetId, onTargetChange: copilotQuery.setTargetId,
          onOpenLayers: () => setActiveActivity("layers"),
          onRead: () => void copilotQuery.read(), onCancel: copilotQuery.cancel,
          onInspect: id => { clearCommandTools(); selectObject(id); setActiveActivity("model"); },
          onEditSketch: id => { clearCommandTools(); editSketch(id); setActiveActivity("model"); } },
        draft:copilotDraft,
        connection:copilotConnection,
        requestContext:copilotRequestContext,
        interaction:copilotInteraction,
        plan: copilotPlan,
        error: copilotError,
        previewFailed: copilotPreviewFailed,
        previewVisible: copilotPreviewVisible,
        applying: copilotApplying,
        planning:copilotApplying&&!copilotValidated,
        canApply: copilotInteraction.canApply,
        applyDisabledReason: copilotContextError??(activeSketchId
          ? "Finish the active sketch first."
          : activeLayerLocked
            ? "Unlock the active layer first."
            : copilotValidated&&!sameDocumentVersion(copilotValidated.baseVersion)?"The document changed; plan again.":undefined),
        onSubmit: handleCopilotSubmit,
        onDraftChange:setCopilotDraft,
        onConnectionChange:setCopilotConnection,
        onTogglePreview: () => setCopilotPreviewVisible((value) => !value),
        onApply: () => void handleCopilotApply(),
        onClear: clearCopilot,
        onInspectResult:()=>{selectObjects(copilotResults);setActiveActivity("model");},
      }}
      properties={properties}
    >
      <Suspense fallback={<div className="viewport-loading" role="status">Preparing viewport…</div>}>
        <CadViewport
          activeArtboardId={activeArtboardId}
          imageCropPreview={imageCropPreview}
          imageCropEditingId={imageCropEditingId}
          onImageCropDraftChange={updateImageCropDraft}
          onSelectArtboard={activateArtboard}
          activeLayerId={selectedLayerId}
          constructionSession={constructionSession} constructionVisible={constructionVisible}
          onConstructionClose={() => setConstructionSession(null)}
          onConstructionApplied={ids => { syncRevision(); setSelection({ ids, primaryId: ids[0] ?? null }); }}
          extrusionPreview={extrusionPreview}
          onExtrusionStatus={setExtrusionStatus}
          extrusionRegions={extrusion?.loops}
          chosenRegions={extrusion?.chosen}
          onToggleRegion={(id) => {setExtrusionStatus("Preparing preview…");setExtrusion(value=>value && {...value,chosen:value.chosen.includes(id)?value.chosen.filter(entry=>entry!==id):[...value.chosen,id]});}}
          pointTransform={pointTransform}
          patternSession={patternSession}
          contourSession={contourSession}
          curveSession={curveSession}
          angularSession={angularSession}
          onAngularClose={()=>setAngularSession(null)}
          onAngularApplied={id=>{syncRevision();setSelection({ids:[id],primaryId:id});}}
          onAngularEditSketch={editSketch}
          onAngularInspectSource={id=>{clearCommandTools();selectObject(id);}}
          curveNextActions={[
            ...(selectedFeature?.params.sketchId ? [{ label: "Edit Sketch", run: () => editSketch(String(selectedFeature.params.sketchId)) }] : []),
            ...Object.values(cadDocument.features).filter(f=>f.construction&&f.inputs.some(id=>selectedObjectIds.includes(id))).slice(0,1).map(f=>({label:"Inspect Construction",run:()=>{clearCommandTools();selectObject(f.output);}})),
            ...Object.values(cadDocument.features).filter(f=>f.pattern&&f.pattern.sourceObjectIds.some(id=>selectedObjectIds.includes(id))).slice(0,1).map(f=>({label:"Edit Pattern",run:()=>{clearCommandTools();beginPattern(f.pattern!.spec.kind,f.pattern!.id);}})),
            ...(canContour.polyline ? [{ label: "Edit result vertices", run: () => beginContour("polyline") }] : []),
            ...(canContour.break ? [{ label: "Split result", run: () => beginContour("break") }] : []),
            ...(dimensionCommand ? [{ label: "Dimension result", run: () => { clearCommandTools(); void handleDimensionFromSelection(); } }] : []),
            ...(standaloneCurves && selectedObjectIds.length ? [{ label: "Pattern result", run: () => beginPattern("linear") }] : []),
            ...(extrudeProfile.ok && selectionEditable && !activeSketch ? [{ label: "Extrude result", run: () => { clearCommandTools(); void handleExtrude(); } }] : []),
          ]}
          onCurveClose={() => setCurveSession(null)}
          onCurveApplied={ids => { syncRevision(); setSelection({ ids, primaryId: ids[0] ?? null }); }}
          onContourClose={() => setContourSession(null)}
          onContourApplied={ids => { syncRevision(); setSelection({ ids, primaryId: ids[0] ?? null }); }}
      onPatternClose={()=>{setPatternSession(null);issueViewAction("focus");}}
          onPatternApplied={ids=>{syncRevision();if(ids.length)setSelection({ids,primaryId:ids[0]});}}
          onPointTransformCommit={commitPointTransform}
          onPointTransformCancel={() => { setPointTransform(null); setShortcutReadout(""); }}
          constraintReview={constraintReview}
          activeSketch={activeSketch}
          automaticConstraints={automaticConstraints}
          selectedSketchConstraintId={selectedSketchConstraintId}
          sketchDiagnostic={sketchDiagnostic}
          onSelectSketchConstraint={setSelectedSketchConstraintId}
          onSketchDocumentChange={syncRevision}
          onOpenSketch={editSketch}
          documentRevision={documentRevision}
          selectedObjectId={selectedObjectId}
          selectedObjectIds={selectedObjectIds}
          isolatedObjectIds={isolatedObjectIds}
          projectionMode={projectionMode}
          gridVisible={gridVisible}
          viewAction={viewAction}
          transformMode={transformMode}
          drawingTool={drawingTool}
          measurementTool={measurementTool}
          activeWorkPlane={activeWorkPlane}
          snapEnabled={snapEnabled} snapPreferences={snapPreferences}
          orthoEnabled={orthoEnabled}
          workspaceMode={workspaceMode}
          directSelectMode={directSelectMode}
          offsetPreview={(() => {
            if (!offsetActive) return null;
            if (selectedObjectIds.length !== 1) return null;
            const object = cadDocument.objects[selectedObjectIds[0]];
            const feature = object ? Object.values(cadDocument.features).find((entry) => entry.output === object.id && entry.type === "drawing") : undefined;
            const distance = parseLength(offsetDistance);
            if (!object || !feature || distance === null || !Number.isFinite(distance) || distance <= 1e-9) return null;
            const layer = cadDocument.layers[object.layerId];
            if (!object.visible || !layer?.visible || layer.locked) return null;
            return { objectId: object.id, distance, side: offsetSide };
          })()}
          offsetActive={offsetActive}
          lineEditTool={lineEditTool}
          lineEditCutterId={selectedObjectId}
          shortcutReadout={shortcutReadout}
          onLineEditCommit={(mode, targetId, pickPoint) => void commitLineEdit(mode, targetId, pickPoint)}
          onLineEditCancel={() => setLineEditTool(null)}
          onOffsetSideChange={setOffsetSide}
          onOffsetCommit={(side) => { setOffsetSide(side); setOffsetActive(false); void commitOffsetFromViewport(side); }}
          onOffsetCancel={() => setOffsetActive(false)}
          cornerPreview={cornerPreview}
          onCornerClose={() => setCornerPreview(null)}
          onCornerApplied={ids => { syncRevision(); selectObject(ids[0] ?? null); }}
          filletPreview={filletPreview}
          chamferPreview={chamferPreview}
          copilotPreview={copilotPreviewVisible ? copilotPlan?.ghosts ?? null : null}
          onCopilotPreviewStatus={(failed) => setCopilotPreviewFailed(failed)}
          onKernelStatus={setKernelStatus}
          onTransformCommit={(objectId, mode, transform) => void commitViewportTransform(objectId, mode, transform)}
          onSelectObject={(id, additive) => selectObject(id, additive)}
          onSelectObjects={(ids, additive) => selectObjects(ids, additive)}
          onContextMenuAction={(action) => {
            if (action === "fit-selection" || action === "fit-all" || action === "top" || action === "front" || action === "right" || action === "isometric") issueViewAction(action);
            else if (action === "toggle-grid") setGridVisible((value) => !value);
            else if (action === "toggle-projection" && workspaceMode !== "2d") setProjectionMode((value) => value === "perspective" ? "orthographic" : "perspective");
            else if (action === "duplicate") void handleDuplicateObject();
            else if (action === "hide") void handleHideObject();
            else if (action === "isolate") void handleIsolateObject();
            else if (action === "delete") void handleDeleteObject();
            else if (action === "curve-workflow") beginCurveWorkflow();
            else if (action === "construction") beginConstruction();
            else if (action === "angular-dimension") beginAngularDimension();
            else if (action === "edit-sketch") { const f=Object.values(cadDocument.features).find(f=>selectedObjectIds.includes(f.output)&&f.params.sketchId); if(f)editSketch(String(f.params.sketchId));else setShortcutReadout("Select a sketch-owned curve to Edit Sketch."); }
            else if (action === "pattern-linear") beginPattern("linear");
            else if (action === "pattern-radial") beginPattern("radial");
            else if (action === "pattern-mirror") beginPattern("mirror");
          }}
          onDrawingCommit={(drawing, params) => void handleDrawingCommit(drawing, params)}
          onDrawingCancel={() => setDrawingTool(null)}
          onDistanceMeasure={(measurement) => { setDistanceMeasurement(measurement); setMeasurementTool(null); }}
          onDirectSelectSubObject={(ref, additive) => selectSubObject(ref, additive)}
        />
      </Suspense>
      {draftingOpen && <DraftingPanel key={draftingInitialBlockId ?? "default"} ids={selectedObjectIds} layerId={selectedLayerId} plane={activeWorkPlane} initialBlockId={draftingInitialBlockId ?? undefined} onChange={syncRevision} onSelect={selectObject} onClose={()=>{setDraftingOpen(false);setDraftingInitialBlockId(null);}}/>}
      {(recovery.state==="failed"||recovery.state==="recovered")&&<div className="recovery-notice" role={recovery.state==="failed"?"alert":"status"}>{recovery.state==="failed"?"Recovery save failed: ":""}{recovery.message}</div>}
      {extrusion && <form className="extrusion-session" data-cad-editor onSubmit={(event)=>{event.preventDefault();void applyExtrusion();}} onKeyDown={(event)=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();cancelExtrusion();}}}>
        <strong>Extrusion preview</strong><span>Click a shaded region to include or exclude it.</span>
        {extrusion.loops.map((loop,i)=><label key={loop.id}><input type="checkbox" aria-label={`Extrude region ${i+1}`} checked={extrusion.chosen.includes(loop.id)} onChange={()=>{setExtrusionStatus("Preparing preview…");setExtrusion(value=>value&&{...value,chosen:value.chosen.includes(loop.id)?value.chosen.filter(id=>id!==loop.id):[...value.chosen,loop.id]});}}/>Region {i+1} · {loop.holes?.length??0} holes</label>)}
        <label>Depth<input autoFocus aria-label="Extrusion depth" value={extrusion.distance} onChange={(event)=>{setExtrusionStatus("Preparing preview…");setExtrusion({...extrusion,distance:event.target.value});}}/></label>
        <span role="status">{extrusionPreview ? extrusionStatus : "Choose a region and enter a non-zero depth, e.g. 8mm or -2cm."}</span>
        <div><button type="submit" disabled={!extrusionPreview || extrusionStatus!=="Preview ready"}>Apply extrusion</button><button type="button" onClick={cancelExtrusion}>Cancel extrusion</button></div>
      </form>}
      {workspaceMode === "2d" && <div className="point-operations" data-cad-editor>
        <button type="button" disabled={Boolean(activeSketch)||activeLayerLocked} onClick={()=>{clearCommandTools();setDraftingOpen(true);}}>Drafting</button>
        <button type="button" title="Move by base and target points (M or G)" disabled={!selectionEditable || !canModifySelection} onClick={() => beginPointTransform("move")}>Move by points</button>
        <button type="button" title="Place multiple copies from one base point (Shift+C)" disabled={!selectionEditable || !canModifySelection} onClick={() => beginPointTransform("copy")}>Copy by points</button>
        <button type="button" title="Rotate around a chosen centre (Shift+R)" disabled={!selectionEditable || !canModifySelection} onClick={() => beginPointTransform("rotate")}>Rotate about point</button>
        <button type="button" onClick={repeatLastCommand}>Repeat command</button>
        {activeSketch && <label><input type="checkbox" aria-label="Automatic sketch constraints" checked={automaticConstraints} onChange={(event) => setAutomaticConstraints(event.target.checked)} />Auto constraints · Alt suppress</label>}
      </div>}
      </AppShell>
    </>
  );
}
