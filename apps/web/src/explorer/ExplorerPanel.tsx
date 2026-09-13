import { useEffect, useState } from "react";
import type { ActivityId } from "../activity/ActivityBar";
import { cadDocument } from "../state/cadDocument";
import { cadHistory } from "../state/history";
import { LayersPanel } from "./views/LayersPanel";
import { ModelPanel } from "./views/ModelPanel";
import { HistoryPanel } from "./views/HistoryPanel";
import { TypePanel } from "./views/TypePanel";

type ExplorerPanelProps = {
  activeActivity: ActivityId;
  documentRevision: number;
  selectedLayerId: string;
  selectedObjectId: string | null;
  onSelectLayer: (layerId: string) => void;
  onSelectObject: (objectId: string) => void;
  onDocumentChange: () => void;
};

const titles: Record<ActivityId, string> = {
  model: "Model",
  layers: "Layers",
  type: "Type",
  history: "History",
};

export function ExplorerPanel(props: ExplorerPanelProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const objectCount = cadDocument.rootObjects.length;
  const explorerCount = props.activeActivity === "layers"
    ? cadDocument.rootLayers.length
    : props.activeActivity === "history"
      ? cadHistory.getPastLabels().length
      : objectCount;

  useEffect(() => {
    setQuery("");
  }, [props.activeActivity]);

  return (
    <aside className="side-bar" aria-label={`${titles[props.activeActivity]} explorer`}>
      <div className="explorer-header">
        <span>{titles[props.activeActivity]}</span>
        <span className="explorer-count">{explorerCount}</span>
      </div>

      <label className="explorer-search">
        <span aria-hidden="true">⌕</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Filter ${titles[props.activeActivity].toLowerCase()}`}
          aria-label={`Filter ${titles[props.activeActivity].toLowerCase()}`}
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} title="Clear filter" aria-label="Clear filter">×</button>
        )}
      </label>

      <div className="explorer-content">
        {props.activeActivity === "model" && (
          <ModelPanel query={normalizedQuery} selectedObjectId={props.selectedObjectId} onSelectObject={props.onSelectObject} onDocumentChange={props.onDocumentChange} />
        )}
        {props.activeActivity === "layers" && (
          <LayersPanel
            query={normalizedQuery}
            documentRevision={props.documentRevision}
            selectedLayerId={props.selectedLayerId}
            onSelectLayer={props.onSelectLayer}
            onDocumentChange={props.onDocumentChange}
          />
        )}
        {props.activeActivity === "type" && (
          <TypePanel query={normalizedQuery} selectedObjectId={props.selectedObjectId} onSelectObject={props.onSelectObject} />
        )}
        {props.activeActivity === "history" && <HistoryPanel query={normalizedQuery} />}
      </div>
    </aside>
  );
}
