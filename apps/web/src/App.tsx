import {
  useEffect,
  useState,
} from "react";

import {
  CadViewport,
} from "./viewport/CadViewport";

import {
  cadDocument,
} from "./state/cadDocument";

import {
  undoDocument,
  redoDocument,
} from "./state/history";

import {
  dispatchCadCommand,
} from "./state/dispatchCadCommand";

import {
  newDocument,
  openDocumentFile,
  saveDocumentAsFile,
  saveDocumentToCache,
} from "./state/documentFile";

import {
  AppShell,
} from "./app/AppShell";

import type {
  ActivityId,
} from "./activity/ActivityBar";

import "./styles.css";

export function App() {
  const [
    activeActivity,
    setActiveActivity,
  ] =
    useState<ActivityId>(
      "model"
    );

  const [
    selectedLayerId,
    setSelectedLayerId,
  ] =
    useState(
      "layer-default"
    );

  const [
    selectedObjectId,
    setSelectedObjectId,
  ] =
    useState<string | null>(
      null
    );

  const [
    documentRevision,
    setDocumentRevision,
  ] =
    useState(
      cadDocument.revision
    );

  const selectedObject =
    selectedObjectId
      ? cadDocument.objects[
          selectedObjectId
        ]
      : null;

  function syncRevision() {
    setDocumentRevision(
      cadDocument.revision
    );
  }

  function handleDocumentChange() {
    syncRevision();
  }

  function handleUndo() {
    const changed =
      undoDocument();

    if (!changed) {
      return;
    }

    setSelectedObjectId(
      null
    );

    syncRevision();
  }

  function handleRedo() {
    const changed =
      redoDocument();

    if (!changed) {
      return;
    }

    setSelectedObjectId(
      null
    );

    syncRevision();
  }

  function handleSave() {
    saveDocumentToCache();
  }

  function handleSaveAs() {
    saveDocumentAsFile();
  }

  function handleNewDocument() {
    newDocument();

    setSelectedObjectId(
      null
    );

    setSelectedLayerId(
      "layer-default"
    );

    setActiveActivity(
      "model"
    );

    syncRevision();
  }

  function handleOpen() {
    const input =
      document.createElement(
        "input"
      );

    input.type =
      "file";

    input.accept =
      ".json,.webcad.json";

    input.onchange =
      async () => {
        const file =
          input.files?.[0];

        if (!file) {
          return;
        }

        try {
          await openDocumentFile(
            file
          );

          setSelectedObjectId(
            null
          );

          setSelectedLayerId(
            cadDocument.rootLayers[
              0
            ] ??
              "layer-default"
          );

          setActiveActivity(
            "model"
          );

          syncRevision();
        } catch (error) {
          console.error(
            "Failed to open CAD document:",
            error
          );

          window.alert(
            "Could not open this CAD file."
          );
        }
      };

    input.click();
  }

  async function handleCreateBox() {
    await dispatchCadCommand({
      type:
        "create-box",

      width: 8,
      depth: 8,
      height: 6,

      layerId:
        selectedLayerId,

      position: [
        14 +
          cadDocument.revision *
            10,
        0,
        0,
      ],
    });

    syncRevision();
  }

  async function handleDeleteObject() {
    if (
      !selectedObjectId
    ) {
      return;
    }

    await dispatchCadCommand({
      type:
        "delete-object",

      objectId:
        selectedObjectId,
    });

    setSelectedObjectId(
      null
    );

    syncRevision();
  }

  async function handleDuplicateObject() {
    if (
      !selectedObjectId
    ) {
      return;
    }

    const newId =
      await dispatchCadCommand({
        type:
          "duplicate-object",

        objectId:
          selectedObjectId,
      });

    if (
      typeof newId ===
      "string"
    ) {
      setSelectedObjectId(
        newId
      );
    }

    syncRevision();
  }

  async function handleObjectLayerChange(
    layerId: string
  ) {
    if (
      !selectedObjectId
    ) {
      return;
    }

    await dispatchCadCommand({
      type:
        "move-object-to-layer",

      objectId:
        selectedObjectId,

      layerId,
    });

    syncRevision();
  }

  async function handleObjectVisibilityChange() {
    if (
      !selectedObject
    ) {
      return;
    }

    await dispatchCadCommand({
      type:
        "set-object-visible",

      objectId:
        selectedObject.id,

      visible:
        !selectedObject.visible,
    });

    syncRevision();
  }

  useEffect(() => {
    function handleKeyDown(
      event: KeyboardEvent
    ) {
      const target =
        event.target as
          HTMLElement | null;

      if (
        target instanceof
          HTMLInputElement ||
        target instanceof
          HTMLTextAreaElement ||
        target instanceof
          HTMLSelectElement ||
        target?.isContentEditable
      ) {
        return;
      }

      if (
        event.key ===
          "Delete" &&
        selectedObjectId
      ) {
        event.preventDefault();

        void handleDeleteObject();

        return;
      }

      const modifier =
        event.ctrlKey ||
        event.metaKey;

      if (
        modifier &&
        event.key.toLowerCase() ===
          "z"
      ) {
        event.preventDefault();

        if (
          event.shiftKey
        ) {
          handleRedo();
        } else {
          handleUndo();
        }

        return;
      }

      if (
        modifier &&
        event.key.toLowerCase() ===
          "y"
      ) {
        event.preventDefault();

        handleRedo();

        return;
      }

      if (
        modifier &&
        event.key.toLowerCase() ===
          "s"
      ) {
        event.preventDefault();

        if (
          event.shiftKey
        ) {
          handleSaveAs();
        } else {
          handleSave();
        }

        return;
      }

      if (
        modifier &&
        event.key.toLowerCase() ===
          "o"
      ) {
        event.preventDefault();

        handleOpen();

        return;
      }

      if (
        modifier &&
        event.key.toLowerCase() ===
          "n"
      ) {
        event.preventDefault();

        handleNewDocument();
      }
    }

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [
    selectedObjectId,
    selectedObject,
  ]);

  const properties = (
    <div className="properties-content">
      <div className="panel-header">
        PROPERTIES
      </div>

      {selectedObject ? (
        <>
          <div className="property-group">
            <div className="property-label">
              Name
            </div>

            <div className="property-value">
              {
                selectedObject.name
              }
            </div>
          </div>

          <div className="property-group">
            <div className="property-label">
              ID
            </div>

            <div
              className="property-value property-id"
              title={
                selectedObject.id
              }
            >
              {
                selectedObject.id
              }
            </div>
          </div>

          <div className="property-group">
            <div className="property-label">
              Geometry
            </div>

            <div
              className="property-value property-id"
              title={
                selectedObject.geometryId
              }
            >
              {
                selectedObject.geometryId
              }
            </div>
          </div>

          <div className="property-group">
            <div className="property-label">
              Layer
            </div>

            <select
              className="property-select"
              value={
                selectedObject.layerId
              }
              onChange={(
                event
              ) =>
                void handleObjectLayerChange(
                  event.target.value
                )
              }
            >
              {cadDocument.rootLayers.map(
                (
                  layerId
                ) => {
                  const layer =
                    cadDocument.layers[
                      layerId
                    ];

                  if (!layer) {
                    return null;
                  }

                  return (
                    <option
                      key={
                        layer.id
                      }
                      value={
                        layer.id
                      }
                    >
                      {
                        layer.name
                      }
                    </option>
                  );
                }
              )}
            </select>
          </div>

          <div className="property-group">
            <div className="property-label">
              Visibility
            </div>

            <label className="property-checkbox">
              <input
                type="checkbox"
                checked={
                  selectedObject.visible
                }
                onChange={() =>
                  void handleObjectVisibilityChange()
                }
              />

              Visible
            </label>
          </div>

          <div className="property-actions">
            <button
              type="button"
              onClick={() =>
                void handleDuplicateObject()
              }
            >
              Duplicate
            </button>

            <button
              type="button"
              className="danger-button"
              onClick={() =>
                void handleDeleteObject()
              }
            >
              Delete
            </button>
          </div>
        </>
      ) : (
        <div className="empty-panel">
          No object selected
        </div>
      )}
    </div>
  );

  return (
    <AppShell
      activeActivity={
        activeActivity
      }

      documentRevision={
        documentRevision
      }

      selectedLayerId={
        selectedLayerId
      }

      selectedObjectId={
        selectedObjectId
      }

      onChangeActivity={
        setActiveActivity
      }

      onSelectLayer={
        setSelectedLayerId
      }

      onSelectObject={
        setSelectedObjectId
      }

      onDocumentChange={
        handleDocumentChange
      }

      onCreateBox={() =>
        void handleCreateBox()
      }

      onUndo={
        handleUndo
      }

      onRedo={
        handleRedo
      }

      onSave={
        handleSave
      }

      onSaveAs={
        handleSaveAs
      }

      onOpen={
        handleOpen
      }

      properties={
        properties
      }
    >
      <CadViewport
        documentRevision={
          documentRevision
        }

        selectedObjectId={
          selectedObjectId
        }

        onSelectObject={
          setSelectedObjectId
        }
      />
    </AppShell>
  );
}