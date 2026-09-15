import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { AppShell } from "./app/AppShell";
import type { ActivityId } from "./activity/ActivityBar";
import { PropertiesPanel } from "./properties/PropertiesPanel";
import { cadDocument } from "./state/cadDocument";
import { dispatchCadCommand } from "./state/dispatchCadCommand";
import { newDocument, openDocumentFile, saveDocumentAsFile, saveDocumentToCache } from "./state/documentFile";
import { cadHistory, redoDocument, undoDocument } from "./state/history";
import { reduceSelection, selectionBounds, validSelection, type SelectionState } from "./state/selection";
import { getObjectTransform } from "./state/objectTransform";
import type { DrawingTool, MeasurementTool, ObjectTransformValue, PointMeasurement, TransformMode, ViewportAction, ViewportActionType } from "./viewport/CadViewport";
import type { WorkPlaneId } from "./precision/workPlane";
import type { WorkspaceMode } from "./viewport/workspaceTransition";
import type { KernelStatus } from "./viewport/kernelGeometryService";
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
  const [documentRevision, setDocumentRevision] = useState(cadDocument.revision);
  const [savedFingerprint, setSavedFingerprint] = useState(documentFingerprint);
  const [projectionMode, setProjectionMode] = useState<"perspective" | "orthographic">("perspective");
  const [gridVisible, setGridVisible] = useState(true);
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
  const isModified = currentFingerprint !== savedFingerprint;

  // Keep the authoritative selection set free of objects that became hidden,
  // locked, or were removed by a command (including undo/redo).
  useEffect(() => {
    setSelection((current) => validSelection(current));
  }, [documentRevision]);

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
      const bounds = selectionBounds(selection); if (!bounds) return;
      const pivot = [(bounds.min[0] + bounds.max[0]) / 2, (bounds.min[1] + bounds.max[1]) / 2, (bounds.min[2] + bounds.max[2]) / 2] as [number, number, number];
      const editable = selectedObjectIds.every((id) => {
        const object = cadDocument.objects[id];
        const layer = object ? cadDocument.layers[object.layerId] : undefined;
        return Boolean(object?.visible && layer?.visible && !layer.locked);
      });
      if (!editable) return;
      // The transform proxy is positioned at the combined bounds center, so
      // translate deltas must be measured from that pivot (not the primary
      // object's origin).
      const delta: [number, number, number] = [transform.translation[0] - pivot[0], transform.translation[1] - pivot[1], transform.translation[2] - pivot[2]];
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...transform.rotation.map((v) => v * Math.PI / 180) as [number, number, number]));
      const commands: Exclude<import("@agent-webcad/cad-commands").CadCommand, { type: "batch" }>[] = [];
      selectedObjectIds.forEach((id) => {
        const object = cadDocument.objects[id]; const f = object && Object.values(cadDocument.features).find((entry) => entry.output === id); const current = object ? getObjectTransform(object, f).translation : [0, 0, 0] as [number, number, number];
        const p = new THREE.Vector3(...current).sub(new THREE.Vector3(...pivot)); if (mode === "rotate") p.applyQuaternion(q); if (mode === "scale") p.multiply(new THREE.Vector3(...transform.scale)); p.add(new THREE.Vector3(...pivot));
        const position = mode === "translate" ? [current[0] + delta[0], current[1] + delta[1], current[2] + delta[2]] : [p.x, p.y, p.z];
        commands.push({ type: "move-object", objectId: id, translation: position as [number, number, number] });
        const currentTransform = getObjectTransform(object!, f);
        if (mode === "rotate") commands.push({ type: "rotate-object", objectId: id, rotation: [currentTransform.rotation[0] + transform.rotation[0], currentTransform.rotation[1] + transform.rotation[1], currentTransform.rotation[2] + transform.rotation[2]] });
        if (mode === "scale") commands.push({ type: "scale-object", objectId: id, scale: [currentTransform.scale[0] * transform.scale[0], currentTransform.scale[1] * transform.scale[1], currentTransform.scale[2] * transform.scale[2]] });
      });
      await dispatchCadCommand({ type: "batch", commands });
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

  function resetWorkspaceSelection() {
    setSelection({ ids: [], primaryId: null });
    setSelectedLayerId(cadDocument.rootLayers[0] ?? "layer-default");
    setActiveActivity("model");
  }

  function selectObject(objectId: string | null, additive = false) {
    setSelection((current) => reduceSelection(current, objectId, additive));
  }

  async function arrangeSelection(mode: "left" | "center-x" | "right" | "top" | "center-y" | "bottom") {
    if (selectedObjectIds.length < 2) return;
    const bounds = selectionBounds(selection); if (!bounds) return;
    const commands = selectedObjectIds.map((id) => {
      const object = cadDocument.objects[id]; const feature = Object.values(cadDocument.features).find((entry) => entry.output === id); if (!object) return null;
      const t = getObjectTransform(object, feature) as { translation: [number, number, number] };
      const objectBounds = selectionBounds({ ids: [id], primaryId: id });
      if (!objectBounds) return null;
      const x = mode === "left" ? bounds.min[0] - objectBounds.min[0] + t.translation[0] : mode === "right" ? bounds.max[0] - objectBounds.max[0] + t.translation[0] : mode === "center-x" ? (bounds.min[0] + bounds.max[0] - objectBounds.min[0] - objectBounds.max[0]) / 2 + t.translation[0] : t.translation[0];
      const y = mode === "bottom" ? bounds.min[1] - objectBounds.min[1] + t.translation[1] : mode === "top" ? bounds.max[1] - objectBounds.max[1] + t.translation[1] : mode === "center-y" ? (bounds.min[1] + bounds.max[1] - objectBounds.min[1] - objectBounds.max[1]) / 2 + t.translation[1] : t.translation[1];
      return { type: "move-object" as const, objectId: id, translation: [x, y, t.translation[2]] as [number, number, number] };
    }).filter((entry): entry is Exclude<typeof entry, null> => Boolean(entry));
    await dispatchCadCommand({ type: "batch", commands }); syncRevision();
  }

  async function distributeSelection(axis: "horizontal" | "vertical") {
    if (selectedObjectIds.length < 3) return;
    const entries = selectedObjectIds.map((id) => { const o = cadDocument.objects[id]; const f = Object.values(cadDocument.features).find((e) => e.output === id); return o ? { id, t: getObjectTransform(o, f) as { translation: [number, number, number] } } : null; }).filter((entry): entry is { id: string; t: { translation: [number, number, number] } } => Boolean(entry));
    entries.sort((a, b) => a.t.translation[axis === "horizontal" ? 0 : 1] - b.t.translation[axis === "horizontal" ? 0 : 1]);
    const first = entries[0].t.translation[axis === "horizontal" ? 0 : 1], last = entries.at(-1)!.t.translation[axis === "horizontal" ? 0 : 1], step = (last - first) / (entries.length - 1);
    await dispatchCadCommand({ type: "batch", commands: entries.map((entry, i) => { const v = [...entry.t.translation] as [number, number, number]; v[axis === "horizontal" ? 0 : 1] = first + step * i; return { type: "move-object" as const, objectId: entry.id, translation: v }; }) }); syncRevision();
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

  function activateDrawingTool(tool: DrawingTool) {
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
    if (ids.length === 1) {
      const newId = await dispatchCadCommand({ type: "duplicate-object", objectId: ids[0] });
      if (typeof newId === "string") selectObject(newId);
    } else {
      const result = await dispatchCadCommand({ type: "batch", commands: ids.map((objectId) => ({ type: "duplicate-object", objectId })) });
      const batchResult = result as { accepted?: unknown; results?: unknown[] } | null;
      const batchResults = batchResult?.accepted === true && Array.isArray(batchResult.results) ? batchResult.results : [];
      const created = batchResults.filter((id): id is string => typeof id === "string");
      if (created.length) setSelection({ ids: created, primaryId: created.at(-1) ?? null });
    }
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
    if (!selectedObjectId) return;
    await dispatchCadCommand({ type: "isolate-object", objectId: selectedObjectId });
    syncRevision();
  }

  async function handleShowAllObjects() {
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
      if (event.key === "Escape") { setTransformMode(null); setDrawingTool(null); setMeasurementTool(null); setDirectSelectMode(false); selectObject(null); return; }
      if (event.key === "F3") { event.preventDefault(); setSnapEnabled((value) => !value); return; }
      if (event.key === "F8") { event.preventDefault(); setOrthoEnabled((value) => !value); return; }
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
  }, [selectedObjectId, selectedObjectIds, selectedFeature, selectedLayerLocked]);

  const properties = (
    <PropertiesPanel
      documentRevision={documentRevision}
      selectedObjectId={selectedObjectId}
      selectedObjectIds={selectedObjectIds}
      selectedLayerId={selectedLayerId}
      onDocumentChange={syncRevision}
      onDuplicate={() => void handleDuplicateObject()}
      onDelete={() => void handleDeleteObject()}
      onHide={() => void handleHideObject()}
      onIsolate={() => void handleIsolateObject()}
      onShowAll={() => void handleShowAllObjects()}
      onBooleanCreated={(id) => selectObject(id)}
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
      canUndo={cadHistory.canUndo()}
      canRedo={cadHistory.canRedo()}
      canCreateBox={!activeLayerLocked}
      canDuplicate={Boolean(selectedFeature) && !selectedLayerLocked}
      canDelete={Boolean(selectedObject) && !selectedLayerLocked}
      canTransform={Boolean(selectedObject) && !selectedLayerLocked}
      canArrange={selectedObjectIds.length >= 2}
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
      onToggleProjection={() => setProjectionMode((mode) => mode === "perspective" ? "orthographic" : "perspective")}
      onToggleGrid={() => setGridVisible((visible) => !visible)}
      onAlign={(mode) => void arrangeSelection(mode)}
      onDistribute={(axis) => void distributeSelection(axis)}
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
          onKernelStatus={setKernelStatus}
          onTransformCommit={(objectId, mode, transform) => void commitViewportTransform(objectId, mode, transform)}
          onSelectObject={(id, additive) => selectObject(id, additive)}
          onDrawingCommit={(drawing, params) => void handleDrawingCommit(drawing, params)}
          onDrawingCancel={() => setDrawingTool(null)}
          onDistanceMeasure={(measurement) => { setDistanceMeasurement(measurement); setMeasurementTool(null); }}
          onDirectEditCommit={(objectId, controlId, point) => void commitDirectEdit(objectId, controlId, point)}
        />
      </Suspense>
      </AppShell>
    </>
  );
}
