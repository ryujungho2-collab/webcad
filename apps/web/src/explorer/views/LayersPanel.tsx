import {
  useState,
} from "react";

import {
  cadDocument,
} from "../../state/cadDocument";

import {
  dispatchCadCommand,
} from "../../state/dispatchCadCommand";
import { ToolIcon } from "../../ui/ToolIcon";
import { layerStyle } from "../../precision/layerStyle";

type LayersPanelProps = {
  query: string;

  documentRevision: number;

  selectedLayerId: string;

  onSelectLayer: (
    layerId: string
  ) => void;

  onDocumentChange: () => void;
};

export function LayersPanel({
  query,
  documentRevision,
  selectedLayerId,
  onSelectLayer,
  onDocumentChange,
}: LayersPanelProps) {
  void documentRevision;
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  async function createLayer() {
    const id =
      `layer-${crypto.randomUUID()}`;

    await dispatchCadCommand({
      type: "create-layer",
      id,
    });

    onSelectLayer(id);
    onDocumentChange();
  }

  function startRename(layerId: string) {
    const layer =
      cadDocument.layers[
        layerId
      ];

    if (!layer) {
      return;
    }

    setEditingLayerId(layerId);
    setDraftName(layer.name);
  }

  async function commitRename(layerId: string) {
    const layer = cadDocument.layers[layerId];
    const name = draftName.trim();
    setEditingLayerId(null);

    if (!layer || !name || name === layer.name) {
      return;
    }

    await dispatchCadCommand({
      type: "rename-layer",
      layerId,
      name,
    });

    onDocumentChange();
  }

  async function toggleVisibility(
    layerId: string
  ) {
    const layer =
      cadDocument.layers[
        layerId
      ];

    if (!layer) {
      return;
    }

    await dispatchCadCommand({
      type: "set-layer-visible",
      layerId,
      visible:
        !layer.visible,
    });

    onDocumentChange();
  }

  async function toggleLock(
    layerId: string
  ) {
    const layer =
      cadDocument.layers[
        layerId
      ];

    if (!layer) {
      return;
    }

    await dispatchCadCommand({
      type: "set-layer-locked",
      layerId,
      locked:
        !layer.locked,
    });

    onDocumentChange();
  }

  async function deleteLayer(
    layerId: string
  ) {
    if (
      layerId ===
      "layer-default"
    ) {
      return;
    }

    await dispatchCadCommand({
      type: "delete-layer",
      layerId,
    });

    if (
      selectedLayerId ===
      layerId
    ) {
      onSelectLayer(
        "layer-default"
      );
    }

    onDocumentChange();
  }

  return (
    <aside className="layers-panel">
      <div className="layers-header">
        <span>Working layers</span>

        <button
          type="button"
          className="layer-add-button"
          onClick={createLayer}
          title="Create layer"
          aria-label="Create layer"
        >
          <span aria-hidden="true">+</span> New
        </button>
      </div>

      {cadDocument.rootLayers.filter((layerId) => {
        const layer = cadDocument.layers[layerId];
        return layer && (!query || layer.name.toLowerCase().includes(query));
      }).map(
        (layerId) => {
          const layer =
            cadDocument.layers[
              layerId
            ];

          if (!layer) {
            return null;
          }

          const selected =
            selectedLayerId ===
            layer.id;

          return (
            <div
              key={layer.id}
              className={
                selected
                  ? "layer-row layer-row-selected"
                  : "layer-row"
              }
              onClick={() =>
                onSelectLayer(
                  layer.id
                )
              }
              onDoubleClick={() =>
                startRename(
                  layer.id
                )
              }
            >
              <button
                type="button"
                className="layer-icon-button"
                title={`${layer.visible ? "Hide" : "Show"} layer`}
                aria-label={`${layer.visible ? "Hide" : "Show"} ${layer.name}`}
                onClick={(event) => {
                  event.stopPropagation();

                  toggleVisibility(
                    layer.id
                  );
                }}
              >
                <ToolIcon name={layer.visible ? "Show All" : "Hide"} fallback={layer.visible ? "◉" : "○"} />
              </button>

              {editingLayerId === layer.id ? (
                <input
                  className="layer-name-input"
                  value={draftName}
                  autoFocus
                  aria-label="Layer name"
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => setDraftName(event.target.value)}
                  onBlur={() => void commitRename(layer.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                    if (event.key === "Escape") setEditingLayerId(null);
                  }}
                />
              ) : (
                <button type="button" className="layer-name" aria-pressed={selected} title={`${layer.name}${selected ? " · Active layer" : " · Set as active layer"} · Double-click to rename`}>{layer.name}</button>
              )}

              <span className="layer-count">
                {
                  layer
                    .objectIds
                    .length
                }
              </span>

              <button
                type="button"
                className="layer-icon-button"
                title={
                  layer.locked
                    ? "Unlock layer"
                    : "Lock layer"
                }
                aria-label={`${layer.locked ? "Unlock" : "Lock"} ${layer.name}`}
                onClick={(event) => {
                  event.stopPropagation();

                  toggleLock(
                    layer.id
                  );
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2" /><path d={layer.locked ? "M8 10V6a4 4 0 0 1 8 0v4 M12 14v3" : "M8 10V6a4 4 0 0 1 8 0 M12 14v3"} /></svg>
              </button>

              {layer.id !==
                "layer-default" && (
                <button
                  type="button"
                  className="layer-delete-button"
                  disabled={layer.locked || cadDocument.layers["layer-default"]?.locked}
                  title={layer.locked || cadDocument.layers["layer-default"]?.locked ? "Unlock source and Default layers to delete" : "Delete layer"}
                  aria-label={`Delete ${layer.name}`}
                  onClick={(event) => {
                    event.stopPropagation();

                    deleteLayer(
                      layer.id
                    );
                  }}
                >
                  <ToolIcon name="Delete" fallback="×" />
                </button>
              )}
            </div>
          );
        }
      )}
      {!query && <div className="explorer-view-note">Click a layer to make it active. Double-click its name to rename.</div>}
      {cadDocument.layers[selectedLayerId] && <fieldset className="layer-style-editor" disabled={cadDocument.layers[selectedLayerId].locked}>
        <legend>Active layer style</legend>
        <label>Color<input type="color" aria-label="Layer color" value={layerStyle(cadDocument.layers[selectedLayerId]).color} onChange={async(event)=>{await dispatchCadCommand({type:"set-layer-style",layerId:selectedLayerId,style:{...layerStyle(cadDocument.layers[selectedLayerId]),color:event.target.value}});onDocumentChange();}}/></label>
        <label>Line type<select aria-label="Layer line type" value={layerStyle(cadDocument.layers[selectedLayerId]).lineType} onChange={async(event)=>{await dispatchCadCommand({type:"set-layer-style",layerId:selectedLayerId,style:{...layerStyle(cadDocument.layers[selectedLayerId]),lineType:event.target.value as "continuous"|"dashed"|"center"}});onDocumentChange();}}><option value="continuous">Continuous</option><option value="dashed">Dashed</option><option value="center">Center</option></select></label>
        <label>Weight<select aria-label="Layer line weight" value={layerStyle(cadDocument.layers[selectedLayerId]).lineWeight} onChange={async(event)=>{await dispatchCadCommand({type:"set-layer-style",layerId:selectedLayerId,style:{...layerStyle(cadDocument.layers[selectedLayerId]),lineWeight:Number(event.target.value)}});onDocumentChange();}}>{[0.13,0.18,0.25,0.35,0.5,0.7,1].map(value=><option key={value} value={value}>{value} mm</option>)}</select></label>
      </fieldset>}
      {cadDocument.rootLayers.filter((layerId) => {
        const layer = cadDocument.layers[layerId];
        return layer && (!query || layer.name.toLowerCase().includes(query));
      }).length === 0 && <div className="empty-panel">No matching layers</div>}
    </aside>
  );
}
