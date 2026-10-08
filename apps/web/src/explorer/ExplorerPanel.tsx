import { ScenesPanel } from "../scenes/ScenesPanel";
import { useEffect, useState } from "react";
import type { ActivityId } from "../activity/ActivityBar";
import { cadDocument } from "../state/cadDocument";
import { cadHistory } from "../state/history";
import { LayersPanel } from "./views/LayersPanel";
import { ModelPanel } from "./views/ModelPanel";
import { HistoryPanel, historyOperationLabel } from "./views/HistoryPanel";
import { TypePanel } from "./views/TypePanel";
import { CopilotPanel, type CopilotPanelProps } from "../copilot/CopilotPanel";
import {VariablesPanel} from "../properties/VariablesPanel";
import { ArtboardsPanel } from "./views/ArtboardsPanel";
import { ComponentsPanel } from "./views/ComponentsPanel";
import type { WorkPlaneId } from "../precision/workPlane";

type ExplorerPanelProps = {
  activeActivity: ActivityId;
  documentRevision: number;
  selectedLayerId: string;
  selectedObjectId: string | null;
  selectedObjectIds: string[];
  onSelectLayer: (layerId: string) => void;
  onSelectObject: (objectId: string | null, additive?: boolean) => void;
  onDocumentChange: () => void;
  activeArtboardId: string | null;
  onActivateArtboard: (id: string | null) => void;
  activeWorkPlane: WorkPlaneId;
  onInsertComponent: (blockId: string) => void;
  activeSketchId?: string | null;
  onEditSketch?: (id: string) => void;
  copilot?: CopilotPanelProps;
};

const titles: Record<ActivityId, string> = {
  scenes: "Scenes",
  model: "Model",
  layers: "Layers",
  artboards: "Artboards",
  components: "Components",
  type: "By type",
  history: "Operation log",
  copilot: "Copilot",
  variables: "Variables",
};

const filterNames: Record<ActivityId, string> = { scenes: "scenes", model: "model", layers: "layers", artboards: "artboards", components: "components", type: "objects", history: "operations", copilot: "prompts",variables:"variables" };

export function ExplorerPanel(props: ExplorerPanelProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const objectEntries = cadDocument.rootObjects.map((id) => cadDocument.objects[id]).filter(Boolean).map((object) => `${object.name}\n${object.id}`.toLowerCase());
  const entries = props.activeActivity === "layers"
    ? cadDocument.rootLayers.map((id) => cadDocument.layers[id]?.name.toLowerCase()).filter((name): name is string => Boolean(name))
    : props.activeActivity === "history"
      ? cadHistory.getPastLabels().map((label) => historyOperationLabel(label).toLowerCase())
      : props.activeActivity === "model"
        ? [...objectEntries, ...Object.values(cadDocument.sketches ?? {}).map((sketch) => sketch.id.toLowerCase())]
        : props.activeActivity === "variables" ? Object.values(cadDocument.variables??{}).map(variable=>`${variable.name} ${variable.expression}`.toLowerCase())
        : props.activeActivity === "scenes" ? Object.values(cadDocument.scenes??{}).map(scene=>`${scene.name} ${scene.id}`.toLowerCase()) : props.activeActivity === "artboards" ? Object.values(cadDocument.artboards??{}).map(board=>`${board.name} ${board.id}`.toLowerCase())
          : props.activeActivity === "components" ? Object.values(cadDocument.blocks??{}).map(block=>`${block.name} ${block.id}`.toLowerCase()) : objectEntries;
  const matchCount = entries.filter((entry) => !normalizedQuery || entry.includes(normalizedQuery)).length;

  useEffect(() => {
    setQuery("");
  }, [props.activeActivity]);

  return (
    <aside className="side-bar" aria-label={`${titles[props.activeActivity]} explorer`}>
      <div className="explorer-header">
        <span>{titles[props.activeActivity]}</span>
        <span className="explorer-count" title={normalizedQuery ? `${matchCount} of ${entries.length} matching items` : `${entries.length} items`}>{normalizedQuery ? `${matchCount} / ${entries.length}` : entries.length}</span>
      </div>

      <label className="explorer-search">
        <span aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5" /></svg></span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={props.activeActivity === "copilot" ? "Copilot has no filter…" : `Filter ${filterNames[props.activeActivity]}…`}
          aria-label={props.activeActivity === "copilot" ? "No filter for Copilot" : `Filter ${filterNames[props.activeActivity]}`}
          disabled={props.activeActivity === "copilot"}
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} title="Clear filter" aria-label="Clear filter">×</button>
        )}
      </label>

      <div
        className="explorer-content"
        onClick={(event) => {
          // Empty padding clears, mirroring empty-space click in the viewport.
          // Row and control clicks target inner elements and are unaffected.
          if (event.target === event.currentTarget) props.onSelectObject(null);
        }}
      >
        {props.activeActivity === "model" && (
          <ModelPanel query={normalizedQuery} selectedObjectId={props.selectedObjectId} selectedObjectIds={props.selectedObjectIds} onSelectObject={props.onSelectObject} onDocumentChange={props.onDocumentChange} activeSketchId={props.activeSketchId} onEditSketch={props.onEditSketch} />
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
        {props.activeActivity === "artboards" && <ArtboardsPanel query={normalizedQuery} documentRevision={props.documentRevision} onDocumentChange={props.onDocumentChange} activeArtboardId={props.activeArtboardId} onActivateArtboard={props.onActivateArtboard} />}
        {props.activeActivity === "scenes" && <ScenesPanel query={normalizedQuery} revision={props.documentRevision} selectedObjectIds={props.selectedObjectIds} activeArtboardId={props.activeArtboardId} onChange={props.onDocumentChange} onActivate={props.onActivateArtboard} onSelectObject={props.onSelectObject} />}
        {props.activeActivity === "components" && <ComponentsPanel query={normalizedQuery} revision={props.documentRevision} selectedObjectIds={props.selectedObjectIds} activeWorkPlane={props.activeWorkPlane} onChange={props.onDocumentChange} onInsert={props.onInsertComponent} />}
        {props.activeActivity === "type" && (
          <TypePanel query={normalizedQuery} selectedObjectId={props.selectedObjectId} selectedObjectIds={props.selectedObjectIds} onSelectObject={props.onSelectObject} />
        )}
        {props.activeActivity === "history" && <HistoryPanel query={normalizedQuery} />}
        {props.activeActivity === "variables" && <VariablesPanel query={normalizedQuery} documentRevision={props.documentRevision} selectedObjectId={props.selectedObjectId} activeSketchId={props.activeSketchId} onDocumentChange={props.onDocumentChange}/>}
        {props.activeActivity === "copilot" && props.copilot && (
          <CopilotPanel
            draft={props.copilot.draft}
            connection={props.copilot.connection}
            requestContext={props.copilot.requestContext}
            plan={props.copilot.plan}
            interaction={props.copilot.interaction}
            error={props.copilot.error}
            previewFailed={props.copilot.previewFailed}
            previewVisible={props.copilot.previewVisible}
            applying={props.copilot.applying}
            planning={props.copilot.planning}
            canApply={props.copilot.canApply}
            applyDisabledReason={props.copilot.applyDisabledReason}
            onSubmit={props.copilot.onSubmit}
            onDraftChange={props.copilot.onDraftChange}
            onConnectionChange={props.copilot.onConnectionChange}
            onTogglePreview={props.copilot.onTogglePreview}
            onApply={props.copilot.onApply}
            onClear={props.copilot.onClear}
            onInspectResult={props.copilot.onInspectResult}
          />
        )}
      </div>
    </aside>
  );
}
