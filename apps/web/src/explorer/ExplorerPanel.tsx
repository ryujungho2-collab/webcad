import type {
  ActivityId,
} from "../activity/ActivityBar";

import {
  LayersPanel,
} from "./views/LayersPanel";

import {
  ModelPanel,
} from "./views/ModelPanel";

import {
  HistoryPanel,
} from "./views/HistoryPanel";

type ExplorerPanelProps = {
  activeActivity:
    ActivityId;

  documentRevision:
    number;

  selectedLayerId:
    string;

  selectedObjectId:
    string | null;

  onSelectLayer: (
    layerId: string
  ) => void;

  onSelectObject: (
    objectId: string
  ) => void;

  onDocumentChange:
    () => void;
};

export function ExplorerPanel({
  activeActivity,
  documentRevision,
  selectedLayerId,
  selectedObjectId,
  onSelectLayer,
  onSelectObject,
  onDocumentChange,
}: ExplorerPanelProps) {
  if (
    activeActivity ===
    "layers"
  ) {
    return (
      <div className="side-bar">
        <LayersPanel
          documentRevision={
            documentRevision
          }
          selectedLayerId={
            selectedLayerId
          }
          onSelectLayer={
            onSelectLayer
          }
          onDocumentChange={
            onDocumentChange
          }
        />
      </div>
    );
  }

  if (
    activeActivity ===
    "history"
  ) {
    return (
      <div className="side-bar">
        <HistoryPanel />
      </div>
    );
  }

  if (
    activeActivity ===
    "settings"
  ) {
    return (
      <div className="side-bar">
        <div className="side-panel-content">
          <h2>
            Settings
          </h2>

          <div className="panel-muted">
            Settings will appear here.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="side-bar">
      <ModelPanel
        selectedObjectId={
          selectedObjectId
        }
        onSelectObject={
          onSelectObject
        }
      />
    </div>
  );
}