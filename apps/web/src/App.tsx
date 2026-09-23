import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "./app/AppShell";
import type { ActivityId } from "./activity/ActivityBar";
import { PropertiesPanel } from "./properties/PropertiesPanel";
import { cadDocument } from "./state/cadDocument";
import { dispatchCadCommand } from "./state/dispatchCadCommand";
import { loadDocumentFromCache, newDocument, openDocumentFile, saveDocumentAsFile, saveDocumentToCache } from "./state/documentFile";
import { cadHistory, redoDocument, undoDocument } from "./state/history";
import { reduceSelection, validSelection, type SelectionState, type TopologySelectionRef } from "./state/selection";
import { getObjectTransform } from "./state/objectTransform";
import { repeatDuplicateOffset, type DuplicateSeries } from "./state/duplicateWorkflow";
import { planAlignment, planDistribution, planGroupTransform } from "./state/selectionCommands";
import type { DrawingTool, MeasurementTool, ObjectTransformValue, PointMeasurement, TransformMode, ViewportAction, ViewportActionType } from "./viewport/CadViewport";
import type { WorkPlaneId } from "./precision/workPlane";
import type { WorkspaceMode } from "./viewport/workspaceTransition";
import type { KernelStatus } from "./viewport/kernelGeometryService";
import { extractSketchLoops } from "./precision/sketchProfiles";
import "./styles.css";

const CadViewport = lazy(async () => {
  const module = await import("./viewport/CadViewport");
  return { default: module.CadViewport };
});

function documentFingerprint() {
  const { revision: _revision, ...documentState } = cadDocument;
  return JSON.stringify(documentState);
}

export function App() {
  const [activeActivity, setActiveActivity] = useState<ActivityId>("model");
  const [selectedLayerId, setSelectedLayerId] = useState("layer-default");
  const [selection, setSelection] = useState<SelectionState>({ ids: [], primaryId: null });
  // Temporary viewport-only isolation. Document visibility remains untouched,
  // so exiting isolation restores the exact pre-isolation state without a
  // history entry.
  const [isolatedObjectIds, setIsolatedObjectIds] = useState<string[] | null>(null);
  const [documentRevision, setDocumentRevision] = useState(() => {
    loadDocumentFromCache();
    return cadDocument.revision;
  });
  const [savedFingerprint, setSavedFingerprint] = useState(documentFingerprint);
  const [projectionMode, setProjectionMode] = useState<"perspective" | "orthographic">("perspective");
  const [gridVisible, setGridVisible] = useState(true);
  const [offsetDistance, setOffsetDistance] = useState("10");
  const [offsetSide, setOffsetSide] = useState<"left" | "right">("left");
  const [offsetActive, setOffsetActive] = useState(false);
  const [lineEditTool, setLineEditTool] = useState<"trim" | "extend" | null>(null);
  const [viewAction, setViewAction] = useState<ViewportAction | null>(null);
  const [transformMode, setTransformMode] = useState<TransformMode | null>(null);
  const [drawingTool, setDrawingTool] = useState<DrawingTool | null>(null);
  const [measurementTool, setMeasurementTool] = useState<MeasurementTool | null>(null);
  const [distanceMeasurement, setDistanceMeasurement] = useState<PointMeasurement | null>(null);
  const [activeWorkPlane, setActiveWorkPlane] = useState<WorkPlaneId>("XY");
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [orthoEnabled, setOrthoEnabled] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("3d");
  const [directSelectMode, setDirectSelectMode] = useState(false);
  const [kernelStatus, setKernelStatus] = useState<KernelStatus>("deferred");
  const viewActionId = useRef(0);
  const lastDuplicate = useRef<DuplicateSeries | null>(null);
  const openFileInput = useRef<HTMLInputElement>(null);
  const currentFingerprint = useMemo(documentFingerprint, [documentRevision]);

  const selectedObjectId = selection.primaryId;
  const selectedObjectIds = selection.ids;
  const selectedObject = selectedObjectId ? cadDocument.objects[selectedObjectId] : null;
  const selectedFeature = selectedObject
    ? Object.values(cadDocument.features).find((entry) => entry.output === selectedObject.id)
    : undefined;
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

  // Keep the authoritative selection set free of objects that became hidden,
  // locked, or were removed by a command (including undo/redo).
  useEffect(() => {
    setSelection((current) => validSelection(current));
    setSelectedLayerId((current) => cadDocument.layers[current] ? current : (cadDocument.rootLayers[0] ?? "layer-default"));
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

  function handleUndo() {
    if (!undoDocument()) return;
    setSelection((current) => validSelection(current));
    syncRevision();
  }

  function handleRedo() {
    if (!redoDocument()) return;
    setSelection((current) => validSelection(current));
    syncRevision();
  }

  function issueViewAction(type: ViewportActionType) {
    viewActionId.current += 1;
    setViewAction({ id: viewActionId.current, type });
  }

  async function commitViewportTransform(objectId: string, mode: TransformMode, transform: ObjectTransformValue) {
    if (selectedObjectIds.length > 1 && (mode === "translate" || mode === "rotate" || mode === "scale")) {
      const commands = planGroupTransform(cadDocument, selectedObjectIds, mode, transform);
      if (!commands) return;
      if (commands.length) await dispatchCadCommand({ type: "batch", commands });
      // The batch already contains every member's transform. Falling through
      // would apply rotate/scale a second time to the primary object.
      syncRevision();
      return;
    }
    else if (mode === "translate") await dispatchCadCommand({ type: "move-object", objectId, translation: transform.translation });
    if (mode === "rotate") await dispatchCadCommand({ type: "rotate-object", objectId, rotation: transform.rotation });
    if (mode === "scale") await dispatchCadCommand({ type: "scale-object", objectId, scale: transform.scale });
    syncRevision();
  }

  async function commitDirectEdit(objectId: string, controlId: string, point: [number, number, number]) {
    await dispatchCadCommand({ type: "edit-drawing-control", objectId, controlId, point });
    setSelection({ ids: [objectId], primaryId: objectId, subObjects: [{ objectId, kind: "drawing-control", topologyId: controlId }] });
    syncRevision();
  }

  async function commitDirectSegmentEdit(objectId: string, segmentId: string, delta: [number, number, number]) {
    if (!delta.some((value) => Math.abs(value) > 1e-9)) return;
    await dispatchCadCommand({ type: "edit-drawing-segment", objectId, segmentId, delta });
    setSelection({ ids: [objectId], primaryId: objectId, subObjects: [{ objectId, kind: "drawing-segment", topologyId: segmentId }] });
    syncRevision();
  }

  function resetWorkspaceSelection() {
    lastDuplicate.current = null;
    setSelection({ ids: [], primaryId: null });
    setIsolatedObjectIds(null);
    setSelectedLayerId(cadDocument.rootLayers[0] ?? "layer-default");
    setActiveActivity("model");
    setOffsetActive(false);
    setLineEditTool(null);
  }

  function selectObject(objectId: string | null, additive = false) {
    setOffsetActive(false);
    setLineEditTool(null);
    setSelection((current) => validSelection(reduceSelection(current, objectId, additive)));
  }

  function selectObjects(objectIds: string[], additive = false) {
    setSelection((current) => {
      if (!additive) return validSelection({ ids: objectIds, primaryId: objectIds.at(-1) ?? null, subObjects: [] });
      return validSelection(objectIds.reduce((next, id) => reduceSelection(next, id, true), current));
    });
  }

  function selectSubObject(ref: TopologySelectionRef, additive = false) {
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
    if (commands.length) await dispatchCadCommand({ type: "batch", commands });
    syncRevision();
  }

  async function distributeSelection(axis: "horizontal" | "vertical") {
    const commands = planDistribution(cadDocument, selectedObjectIds, axis, activeWorkPlane);
    if (!commands) return;
    if (commands.length) await dispatchCadCommand({ type: "batch", commands });
    syncRevision();
  }

  function handleNewDocument() {
    newDocument();
    resetWorkspaceSelection();
    setSavedFingerprint(documentFingerprint());
    syncRevision();
  }

  function handleSave() {
    saveDocumentToCache();
    setSavedFingerprint(currentFingerprint);
  }

  function handleSaveAs() {
    saveDocumentAsFile();
    saveDocumentToCache();
    setSavedFingerprint(currentFingerprint);
  }

  function handleOpen() {
    openFileInput.current?.click();
  }

  async function handleOpenFile(file: File | undefined) {
    if (!file) return;
    try {
      await openDocumentFile(file);
      resetWorkspaceSelection();
      setSavedFingerprint(documentFingerprint());
      syncRevision();
    } catch (error) {
      console.error("Failed to open CAD document:", error);
      window.alert("Could not open this CAD file.");
    }
  }

  async function handleCreateBox() {
    const generatedObjectCount = Object.values(cadDocument.features).filter(
      (feature) => feature.type === "primitive"
    ).length;

    const newId = await dispatchCadCommand({
      type: "create-box",
      width: 8,
      depth: 8,
      height: 6,
      layerId: selectedLayerId,
      position: [14 + generatedObjectCount * 10, 0, 0],
    });
    if (typeof newId === "string") selectObject(newId);
    syncRevision();
  }

  async function handleCreatePrimitive(primitive: "cylinder" | "sphere" | "cone" | "torus") {
    const count = cadDocument.rootObjects.length;
    const params: Record<string, number> = primitive === "cylinder" ? { radius: 4, height: 8 }
      : primitive === "sphere" ? { radius: 5 }
      : primitive === "cone" ? { radius1: 5, radius2: 2, height: 8 }
      : { majorRadius: 5, minorRadius: 1.5 };
    const newId = await dispatchCadCommand({ type: "create-primitive", primitive, params, layerId: selectedLayerId, position: [14 + count * 12, 0, 0] });
    if (typeof newId === "string") selectObject(newId);
    syncRevision();
  }

  async function handleExtrude(distance = 10) {
    if (!extrudeProfile.ok) return;
    const newId = await dispatchCadCommand({
      type: "create-extrude",
      profileObjectIds: selectedObjectIds,
      distance,
      layerId: selectedLayerId,
    });
    if (typeof newId === "string") {
      setWorkspaceMode("3d");
      selectObject(newId);
    }
    syncRevision();
  }

  function activateDrawingTool(tool: DrawingTool) {
    setLineEditTool(null);
    setTransformMode(null);
    setMeasurementTool(null);
    setDistanceMeasurement(null);
    setMeasurementTool(null);
    setDrawingTool((current) => current === tool ? null : tool);
    if (activeWorkPlane === "XY") {
      setProjectionMode("orthographic");
      issueViewAction("top");
    }
  }

  function changeWorkspace(mode: WorkspaceMode) {
    setLineEditTool(null);
    setWorkspaceMode(mode);
    setProjectionMode(mode === "2d" ? "orthographic" : "perspective");
    setDrawingTool(null);
    setMeasurementTool(null);
    setTransformMode(null);
  }

  async function handleDrawingCommit(drawing: DrawingTool, params: Record<string, unknown>) {
    const newId = await dispatchCadCommand({ type: "create-drawing", drawing, params, layerId: selectedLayerId });
    if (typeof newId === "string") selectObject(newId);
    setDrawingTool(null);
    syncRevision();
  }

  async function handleDeleteObject() {
    const ids = selectedObjectIds.length ? selectedObjectIds : selectedObjectId ? [selectedObjectId] : [];
    if (!ids.length) return;
    await dispatchCadCommand({ type: "batch", commands: ids.map((objectId) => ({ type: "delete-object", objectId })) });
    setSelection({ ids: [], primaryId: null });
    syncRevision();
  }

  async function handleDuplicateObject() {
    const ids = selectedObjectIds.length ? selectedObjectIds : selectedObjectId ? [selectedObjectId] : [];
    if (!ids.length || !selectedFeature) return;
    const offset = repeatDuplicateOffset(cadDocument, lastDuplicate.current, ids) ?? [10, 0, 0];
    let created: string[] = [];
    if (ids.length === 1) {
      const newId = await dispatchCadCommand({ type: "duplicate-object", objectId: ids[0], offset });
      if (typeof newId === "string") created = [newId];
    } else {
      const result = await dispatchCadCommand({ type: "batch", commands: ids.map((objectId) => ({ type: "duplicate-object", objectId, offset })) });
      const batchResult = result as { accepted?: unknown; results?: unknown[] } | null;
      const batchResults = batchResult?.accepted === true && Array.isArray(batchResult.results) ? batchResult.results : [];
      created = batchResults.filter((id): id is string => typeof id === "string");
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
    const distance = Number(offsetDistance);
    const layer = object ? cadDocument.layers[object.layerId] : undefined;
    if (!object || !feature || !Number.isFinite(distance) || distance <= 1e-9 || !object.visible || !layer?.visible || layer.locked) return;
    const id = await dispatchCadCommand({ type: "offset-drawing", objectId: object.id, distance, side });
    if (typeof id === "string") selectObject(id);
    syncRevision();
  }

  function activateLineEditTool(mode: "trim" | "extend") {
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
    await dispatchCadCommand({ type: mode === "trim" ? "trim-drawing" : "extend-drawing", targetId, cutterId: selectedObjectId, pickPoint });
    syncRevision();
  }

  async function handleHideObject() {
    const ids = selectedObjectIds.length ? selectedObjectIds : selectedObjectId ? [selectedObjectId] : [];
    if (!ids.length) return;
    await dispatchCadCommand({ type: "batch", commands: ids.map((objectId) => ({ type: "set-object-visible" as const, objectId, visible: false })) });
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
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable) return;
      if (event.key === "Delete" && selectedObjectId) {
        event.preventDefault();
        void handleDeleteObject();
        return;
      }
      if (event.key === "Escape") {
        if (lineEditTool) { setLineEditTool(null); return; }
        if (offsetActive) { setOffsetActive(false); return; }
        if (drawingTool) { setDrawingTool(null); return; }
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
      if (event.key === "F3") { event.preventDefault(); setSnapEnabled((value) => !value); return; }
      if (event.key === "F8") { event.preventDefault(); setOrthoEnabled((value) => !value); return; }
      if (event.key.toLowerCase() === "h" && selectedObjectIds.length) { event.preventDefault(); void handleHideObject(); return; }
      if (event.key.toLowerCase() === "f" && selectedObjectIds.length) { event.preventDefault(); issueViewAction("fit-selection"); return; }
      if (event.key.toLowerCase() === "a") {
        event.preventDefault();
        selectObjects(cadDocument.rootObjects.filter((id) => { const object = cadDocument.objects[id]; const layer = object ? cadDocument.layers[object.layerId] : undefined; return Boolean(object?.visible && layer?.visible && !layer.locked); }));
        return;
      }
      if (selectedObjectId && !selectedLayerLocked) {
        if (event.key.toLowerCase() === "g") { setTransformMode("translate"); return; }
        if (event.key.toLowerCase() === "r") { setTransformMode("rotate"); return; }
        if (event.key.toLowerCase() === "s" && !event.ctrlKey && !event.metaKey) { setTransformMode("scale"); return; }
      }
      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier) return;
      const key = event.key.toLowerCase();
      if (key === "z") { event.preventDefault(); event.shiftKey ? handleRedo() : handleUndo(); }
      else if (key === "y") { event.preventDefault(); handleRedo(); }
      else if (key === "s") { event.preventDefault(); event.shiftKey ? handleSaveAs() : handleSave(); }
      else if (key === "d") { event.preventDefault(); void handleDuplicateObject(); }
      else if (key === "o") { event.preventDefault(); handleOpen(); }
      else if (key === "n") { event.preventDefault(); handleNewDocument(); }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedObjectId, selectedObjectIds, selectedFeature, selectedLayerLocked, drawingTool, measurementTool, transformMode, directSelectMode, lineEditTool, offsetActive]);

  const properties = (
    <PropertiesPanel
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
      onOffsetStart={() => setOffsetActive(true)}
      onOffsetCancel={() => setOffsetActive(false)}
    />
  );

  return (
    <>
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
      <AppShell
      activeActivity={activeActivity}
      documentId={cadDocument.id}
      documentRevision={documentRevision}
      selectedLayerId={selectedLayerId}
      activeLayerName={activeLayerName}
      selectedObjectId={selectedObjectId}
      selectedObjectIds={selectedObjectIds}
      isolationActive={Boolean(isolatedObjectIds)}
      canUndo={cadHistory.canUndo()}
      canRedo={cadHistory.canRedo()}
      canCreateBox={!activeLayerLocked}
      canDuplicate={Boolean(selectedFeature) && selectionEditable}
      canDelete={Boolean(selectedObject) && selectionEditable}
      canTransform={Boolean(selectedObject) && selectionEditable}
      canArrange={selectedObjectIds.length >= 2 && selectionEditable}
      canDistribute={selectedObjectIds.length >= 3 && selectionEditable}
      canExtrude={extrudeProfile.ok && selectionEditable}
      canTrim={selectedObjectIds.length === 1 && selectedFeature?.type === "drawing" && selectionEditable}
      lineEditTool={lineEditTool}
      isModified={isModified}
      projectionMode={projectionMode}
      gridVisible={gridVisible}
      transformMode={transformMode}
      drawingTool={drawingTool}
      measurementTool={measurementTool}
      distanceMeasurement={distanceMeasurement}
      activeWorkPlane={activeWorkPlane}
      snapEnabled={snapEnabled}
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
      onDrawingTool={activateDrawingTool}
      onMeasurementTool={() => { setDrawingTool(null); setTransformMode(null); setDistanceMeasurement(null); setMeasurementTool((current) => current === "distance" ? null : "distance"); }}
      onCycleWorkPlane={() => setActiveWorkPlane((plane) => plane === "XY" ? "XZ" : plane === "XZ" ? "YZ" : "XY")}
      onToggleSnap={() => setSnapEnabled((value) => !value)}
      onToggleOrtho={() => setOrthoEnabled((value) => !value)}
      onWorkspaceMode={changeWorkspace}
      onDirectSelectMode={(enabled) => { setDirectSelectMode(enabled); setDrawingTool(null); setMeasurementTool(null); setTransformMode(null); }}
      onDuplicate={() => void handleDuplicateObject()}
      onDelete={() => void handleDeleteObject()}
      onHide={() => void handleHideObject()}
      onIsolate={() => void handleIsolateObject()}
      onShowAll={() => void handleShowAllObjects()}
      onTransformMode={(mode) => setTransformMode((current) => current === mode ? null : mode)}
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
      properties={properties}
    >
      <Suspense fallback={<div className="viewport-loading" role="status">Preparing viewport…</div>}>
        <CadViewport
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
          snapEnabled={snapEnabled}
          orthoEnabled={orthoEnabled}
          workspaceMode={workspaceMode}
          directSelectMode={directSelectMode}
          offsetPreview={(() => {
            if (!offsetActive) return null;
            if (selectedObjectIds.length !== 1) return null;
            const object = cadDocument.objects[selectedObjectIds[0]];
            const feature = object ? Object.values(cadDocument.features).find((entry) => entry.output === object.id && entry.type === "drawing") : undefined;
            const distance = Number(offsetDistance);
            if (!object || !feature || !Number.isFinite(distance) || distance <= 1e-9) return null;
            const layer = cadDocument.layers[object.layerId];
            if (!object.visible || !layer?.visible || layer.locked) return null;
            return { objectId: object.id, distance, side: offsetSide };
          })()}
          offsetActive={offsetActive}
          lineEditTool={lineEditTool}
          lineEditCutterId={selectedObjectId}
          onLineEditCommit={(mode, targetId, pickPoint) => void commitLineEdit(mode, targetId, pickPoint)}
          onLineEditCancel={() => setLineEditTool(null)}
          onOffsetSideChange={setOffsetSide}
          onOffsetCommit={(side) => { setOffsetSide(side); setOffsetActive(false); void commitOffsetFromViewport(side); }}
          onOffsetCancel={() => setOffsetActive(false)}
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
          }}
          onDrawingCommit={(drawing, params) => void handleDrawingCommit(drawing, params)}
          onDrawingCancel={() => setDrawingTool(null)}
          onDistanceMeasure={(measurement) => { setDistanceMeasurement(measurement); setMeasurementTool(null); }}
          onDirectEditCommit={(objectId, controlId, point) => void commitDirectEdit(objectId, controlId, point)}
          onDirectSegmentEditCommit={(objectId, segmentId, delta) => void commitDirectSegmentEdit(objectId, segmentId, delta)}
          onDirectSelectSubObject={(ref, additive) => selectSubObject(ref, additive)}
        />
      </Suspense>
      </AppShell>
    </>
  );
}
