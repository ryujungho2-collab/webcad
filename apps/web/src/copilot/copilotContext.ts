import type { CadDocument } from "@agent-webcad/cad-document";
import type { WorkPlaneId } from "../precision/workPlane";
import type { DocumentVersion } from "../state/documentSession";
import type { CopilotConnection } from "./copilotConnection";

export type CopilotContextInputs = {
  version: DocumentVersion;
  selectionIds: string[];
  workPlane: WorkPlaneId;
  layerId: string;
  prompt: string;
  connection: CopilotConnection;
};
export type CopilotPlanningContext = CopilotContextInputs & {
  layerName: string;
  selectionNames: string[];
};

/** Snapshot the exact inputs used for a proposal without storing document geometry. */
export function captureCopilotContext(document: CadDocument, inputs: CopilotContextInputs): CopilotPlanningContext {
  return {
    version: { ...inputs.version },
    selectionIds: [...inputs.selectionIds],
    workPlane: inputs.workPlane,
    layerId: inputs.layerId,
    prompt: inputs.prompt,
    connection: { ...inputs.connection },
    layerName: document.layers[inputs.layerId]?.name ?? inputs.layerId,
    selectionNames: inputs.selectionIds.map(id => document.objects[id]?.name ?? id),
  };
}

/** A proposal belongs to its document, selection, plane, layer and request draft. */
export function copilotContextChange(saved: CopilotContextInputs, current: CopilotContextInputs): string | undefined {
  if (saved.version.documentId !== current.version.documentId || saved.version.revision !== current.version.revision || saved.version.generation !== current.version.generation)
    return "The document changed during planning or review. Plan again.";
  if (saved.selectionIds.length !== current.selectionIds.length || saved.selectionIds.some((id, index) => id !== current.selectionIds[index]))
    return "The selection changed during planning or review. Plan again with the current selection.";
  if (saved.workPlane !== current.workPlane) return "The work plane changed during planning or review. Plan again.";
  if (saved.layerId !== current.layerId) return "The active layer changed during planning or review. Plan again.";
  if (saved.prompt !== current.prompt) return "The prompt changed. Plan again.";
  if (saved.connection.mode !== current.connection.mode || saved.connection.endpoint !== current.connection.endpoint)
    return "The planner settings changed. Plan again.";
}
