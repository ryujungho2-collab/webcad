import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "./app/AppShell";
import type { ActivityId } from "./activity/ActivityBar";
import { PropertiesPanel } from "./properties/PropertiesPanel";
import { cadDocument } from "./state/cadDocument";
import { dispatchCadCommand } from "./state/dispatchCadCommand";
import { newDocument, openDocumentFile, saveDocumentAsFile, saveDocumentToCache } from "./state/documentFile";
import { cadHistory, redoDocument, undoDocument } from "./state/history";
import type { ObjectTransformValue, TransformMode, ViewportAction, ViewportActionType } from "./viewport/CadViewport";
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
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [documentRevision, setDocumentRevision] = useState(cadDocument.revision);
  const [savedFingerprint, setSavedFingerprint] = useState(documentFingerprint);
  const [projectionMode, setProjectionMode] = useState<"perspective" | "orthographic">("perspective");
  const [gridVisible, setGridVisible] = useState(true);
  const [viewAction, setViewAction] = useState<ViewportAction | null>(null);
  const [transformMode, setTransformMode] = useState<TransformMode | null>(null);
  const [kernelStatus, setKernelStatus] = useState<KernelStatus>("deferred");
  const viewActionId = useRef(0);
  const currentFingerprint = useMemo(documentFingerprint, [documentRevision]);

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

  function syncRevision() {
    setDocumentRevision(cadDocument.revision);
  }

  function handleUndo() {
    if (!undoDocument()) return;
    if (selectedObjectId && !cadDocument.objects[selectedObjectId]) setSelectedObjectId(null);
    syncRevision();
  }

  function handleRedo() {
    if (!redoDocument()) return;
    if (selectedObjectId && !cadDocument.objects[selectedObjectId]) setSelectedObjectId(null);
    syncRevision();
  }

  function issueViewAction(type: ViewportActionType) {
    viewActionId.current += 1;
    setViewAction({ id: viewActionId.current, type });
  }

  async function commitViewportTransform(objectId: string, mode: TransformMode, transform: ObjectTransformValue) {
    if (mode === "translate") await dispatchCadCommand({ type: "move-object", objectId, translation: transform.translation });
    if (mode === "rotate") await dispatchCadCommand({ type: "rotate-object", objectId, rotation: transform.rotation });
    if (mode === "scale") await dispatchCadCommand({ type: "scale-object", objectId, scale: transform.scale });
    syncRevision();
  }

  function resetWorkspaceSelection() {
    setSelectedObjectId(null);
    setSelectedLayerId(cadDocument.rootLayers[0] ?? "layer-default");
    setActiveActivity("model");
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
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.webcad.json";
    input.onchange = async () => {
      const file = input.files?.[0];
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
    };
    input.click();
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
    if (typeof newId === "string") setSelectedObjectId(newId);
    syncRevision();
  }

  async function handleDeleteObject() {
    if (!selectedObjectId) return;
    await dispatchCadCommand({ type: "delete-object", objectId: selectedObjectId });
    setSelectedObjectId(null);
    syncRevision();
  }

  async function handleDuplicateObject() {
    if (!selectedObjectId || !selectedFeature) return;
    const newId = await dispatchCadCommand({ type: "duplicate-object", objectId: selectedObjectId });
    if (typeof newId === "string") setSelectedObjectId(newId);
    syncRevision();
  }

  async function handleHideObject() {
    if (!selectedObjectId) return;
    await dispatchCadCommand({ type: "set-object-visible", objectId: selectedObjectId, visible: false });
    setSelectedObjectId(null);
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
      if (event.key === "Escape") { setTransformMode(null); return; }
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
      else if (key === "o") { event.preventDefault(); handleOpen(); }
      else if (key === "n") { event.preventDefault(); handleNewDocument(); }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedObjectId, selectedFeature, selectedLayerLocked]);

  const properties = (
    <PropertiesPanel
      documentRevision={documentRevision}
      selectedObjectId={selectedObjectId}
      selectedLayerId={selectedLayerId}
      onDocumentChange={syncRevision}
      onDuplicate={() => void handleDuplicateObject()}
      onDelete={() => void handleDeleteObject()}
      onHide={() => void handleHideObject()}
      onIsolate={() => void handleIsolateObject()}
      onShowAll={() => void handleShowAllObjects()}
    />
  );

  return (
    <AppShell
      activeActivity={activeActivity}
      documentId={cadDocument.id}
      documentRevision={documentRevision}
      selectedLayerId={selectedLayerId}
      activeLayerName={activeLayerName}
      selectedObjectId={selectedObjectId}
      canUndo={cadHistory.canUndo()}
      canRedo={cadHistory.canRedo()}
      canCreateBox={!activeLayerLocked}
      canDuplicate={Boolean(selectedFeature) && !selectedLayerLocked}
      canDelete={Boolean(selectedObject) && !selectedLayerLocked}
      canTransform={Boolean(selectedObject) && !selectedLayerLocked}
      isModified={isModified}
      projectionMode={projectionMode}
      gridVisible={gridVisible}
      transformMode={transformMode}
      kernelStatus={kernelStatus}
      onChangeActivity={setActiveActivity}
      onSelectLayer={setSelectedLayerId}
      onSelectObject={setSelectedObjectId}
      onDocumentChange={syncRevision}
      onCreateBox={() => void handleCreateBox()}
      onDuplicate={() => void handleDuplicateObject()}
      onDelete={() => void handleDeleteObject()}
      onHide={() => void handleHideObject()}
      onIsolate={() => void handleIsolateObject()}
      onShowAll={() => void handleShowAllObjects()}
      onTransformMode={(mode) => setTransformMode((current) => current === mode ? null : mode)}
      onViewAction={issueViewAction}
      onToggleProjection={() => setProjectionMode((mode) => mode === "perspective" ? "orthographic" : "perspective")}
      onToggleGrid={() => setGridVisible((visible) => !visible)}
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
          projectionMode={projectionMode}
          gridVisible={gridVisible}
          viewAction={viewAction}
          transformMode={transformMode}
          onKernelStatus={setKernelStatus}
          onTransformCommit={(objectId, mode, transform) => void commitViewportTransform(objectId, mode, transform)}
          onSelectObject={setSelectedObjectId}
        />
      </Suspense>
    </AppShell>
  );
}
