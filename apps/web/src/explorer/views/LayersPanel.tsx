import {
  useState,
} from "react";

import {
  cadDocument,
} from "../../state/cadDocument";

import {
  dispatchCadCommand,
} from "../../state/dispatchCadCommand";

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
        <span>Layer controls</span>

        <button
          type="button"
          className="layer-add-button"
          onClick={createLayer}
          title="Create layer"
        >
          +
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
                title="Visibility"
                onClick={(event) => {
                  event.stopPropagation();

                  toggleVisibility(
                    layer.id
                  );
                }}
              >
                {layer.visible
                  ? "◉"
                  : "○"}
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
                <span className="layer-name" title={`${layer.name} · Double-click to rename`}>
                  {layer.name}
                </span>
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
                    ? "Unlock"
                    : "Lock"
                }
                onClick={(event) => {
                  event.stopPropagation();

                  toggleLock(
                    layer.id
                  );
                }}
              >
                {layer.locked
                  ? "🔒"
                  : "🔓"}
              </button>

              {layer.id !==
                "layer-default" && (
                <button
                  type="button"
                  className="layer-delete-button"
                  title="Delete layer"
                  onClick={(event) => {
                    event.stopPropagation();

                    deleteLayer(
                      layer.id
                    );
                  }}
                >
                  ×
                </button>
              )}
            </div>
          );
        }
      )}
      {cadDocument.rootLayers.filter((layerId) => {
        const layer = cadDocument.layers[layerId];
        return layer && (!query || layer.name.toLowerCase().includes(query));
      }).length === 0 && <div className="empty-panel">No matching layers</div>}
    </aside>
  );
}
