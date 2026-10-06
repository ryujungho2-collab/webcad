import type {
  CadCommand,
  CommandResult,
} from "@agent-webcad/cad-commands";

import {
  toCommandResult,
  failedResult,
  validateCommand,
} from "@agent-webcad/cad-commands";

import {
  createDocumentCommandExecutor,
} from "./commandBus";

import {
  cadHistory,
} from "./history";

import {
  cadDocument,
} from "./cadDocument";
import { enqueueDocumentCommand } from "./documentCommandQueue";
import { refreshAssociativeDimensions } from "./dimensionRefresh";
import { FeatureRegenerationError } from "./featureRegeneration";
import { SketchParameterConflictError } from "./documentParameters";
import { publishCommandResult } from "./commandFeedback";
import { notifyDocumentChanged } from "./documentSession";
import { featureContract,validateFeatureParameters,type CadDocument } from "@agent-webcad/cad-document";
import {measureDocumentObject} from "./documentQuery";
import {getObjectTransform} from "../precision/objectTransform";

export async function dispatchCadCommand(
  command: CadCommand
): Promise<CommandResult> {
  if (!validateCommand(command)) {
    throw new Error("Invalid CAD command payload.");
  }

  const detached = structuredClone(command);
  const result = await enqueueDocumentCommand(() => executeCadCommand(detached));
  publishCommandResult(result);
  return result;
}

async function executeCadCommand(command: CadCommand): Promise<CommandResult> {
  const startedAt = performance.now();
  const documentBefore = structuredClone(cadDocument);
  const prepared = await prepareCadCommand(documentBefore, command);
  const result = prepared.result;
  if (result.ok && result.changed) publishCadProposal(prepared, documentBefore);
  performance.measure(`agent-webcad:command:${command.type}`, {
    start: startedAt, end: performance.now(), detail: { changed: result.changed, ok: result.ok },
  });
  return result;
}

export type PreparedCadCommand = {command:CadCommand;proposed:CadDocument;result:CommandResult};

/** Common UI/automation preview execution. Never publishes or records history. */
export async function prepareCadCommand(document:CadDocument, command:CadCommand):Promise<PreparedCadCommand> {
  if(!validateCommand(command))throw new Error("Invalid CAD command payload.");
  const detached=structuredClone(command),proposed=structuredClone(document);
  let raw: unknown;
  try {
    raw = await createDocumentCommandExecutor(proposed)(detached);
    if(proposed.revision!==document.revision){
      refreshAssociativeDimensions(proposed);
      for(const feature of Object.values(proposed.features)){
        if(!validateFeatureParameters(feature))throw new Error(`Invalid feature parameters: ${feature.id}`);
        if(featureContract(feature).representation!=="brep")continue;
        const prior=Object.values(document.features).find(f=>f.output===feature.output);
        const currentObject=proposed.objects[feature.output],priorObject=document.objects[feature.output];
        if(prior&&priorObject&&JSON.stringify([prior.params,getObjectTransform(priorObject,prior)])===JSON.stringify([feature.params,getObjectTransform(currentObject,feature)]))continue;
        const measured=await measureDocumentObject(proposed,feature.output);
        if(measured.validity!=="valid")throw new Error(`Invalid solid geometry: ${currentObject.name}`);
      }
    }
  } catch (error) {
    return {command:detached,proposed:structuredClone(document),result:failedResult(detached, error instanceof Error ? error.message : "Document operation failed.", undefined,
      error instanceof SketchParameterConflictError ? error.diagnostic : error instanceof FeatureRegenerationError ? { kind: "regeneration-failed", constraintIds: [], geometryIds: error.geometryIds } : undefined)};
  }
  const result=toCommandResult(detached,raw,proposed.revision!==document.revision);
  return {command:detached,proposed:result.ok?proposed:structuredClone(document),result};
}

/** Called inside the mutation queue after checking the complete baseline. */
export function publishCadProposal(prepared:PreparedCadCommand,documentBefore:CadDocument) {
  if(JSON.stringify(cadDocument)!==JSON.stringify(documentBefore))throw new Error("The document changed; preview the edit again.");
  if(!prepared.result.ok||!prepared.result.changed)return;
  if(!prepared.proposed.blocks)delete cadDocument.blocks;
  if(!prepared.proposed.variables)delete cadDocument.variables;
  if(!prepared.proposed.parameterBindings)delete cadDocument.parameterBindings;
  if(!prepared.proposed.artboards)delete cadDocument.artboards;
  if(!prepared.proposed.scenes)delete cadDocument.scenes;
  if(!prepared.proposed.rasterAssets)delete cadDocument.rasterAssets;
  Object.assign(cadDocument,structuredClone(prepared.proposed));
  cadHistory.pushSnapshot(prepared.result.label,structuredClone(documentBefore));
  notifyDocumentChanged();
}
