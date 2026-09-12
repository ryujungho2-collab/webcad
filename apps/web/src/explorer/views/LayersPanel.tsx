import {
  cadDocument,
} from "../../state/cadDocument";

import {
  dispatchCadCommand,
} from "../../state/dispatchCadCommand";

type LayersPanelProps = {
  documentRevision: number;

  selectedLayerId: string;

  onSelectLayer: (
    layerId: string
  ) => void;

  onDocumentChange: () => void;
};

export function LayersPanel({
  documentRevision,
  selectedLayerId,
  onSelectLayer,
  onDocumentChange,
}: LayersPanelProps) {
  void documentRevision;

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

  async function renameLayer(
    layerId: string
  ) {
    const layer =
      cadDocument.layers[
        layerId
      ];

    if (!layer) {
      return;
    }

    const name =
      window.prompt(
        "Layer name",
        layer.name
      );

    if (!name?.trim()) {
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
        <h2>Layers</h2>

        <button
          type="button"
          className="layer-add-button"
          onClick={createLayer}
          title="Create layer"
        >
          +
        </button>
      </div>

      {cadDocument.rootLayers.map(
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
                renameLayer(
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

              <span
                className="layer-name"
                title={layer.name}
              >
                {layer.name}
              </span>

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
    </aside>
  );
}