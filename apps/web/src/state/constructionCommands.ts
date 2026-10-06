import { constructionInputs, constructionExpression, type CadDocument } from "@agent-webcad/cad-document";
import type { CadCommand, CommandBus } from "@agent-webcad/cad-commands";
import { evaluateConstruction } from "../precision/constructionGeometry";
import { createDrawingTopology } from "../precision/drawingTopology";

export function registerConstructionCommands(bus: CommandBus, document: CadDocument) {
  bus.registerHandler("create-construction", (command: CadCommand) => {
    if (command.type !== "create-construction") return;
    const id = command.id ?? `construction-${crypto.randomUUID()}`, layerId = command.layerId ?? "layer-default", layer = document.layers[layerId];
    if (!layer?.visible || layer.locked) throw new Error("The construction layer is hidden or locked.");
    if (document.objects[id] || document.features[`feature-${id}`]) throw new Error("Construction ID already exists.");
    const params: Record<string, unknown> = { ...evaluateConstruction(document, command.definition, command.workPlane), construction: command.construction ?? true };
    document.objects[id] = { id, geometryId: `geometry-${id}`, name: command.name ?? constructionExpression(command.definition, sourceId => document.objects[sourceId]?.name ?? sourceId), visible: true, layerId, transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } };
    document.features[`feature-${id}`] = { id: `feature-${id}`, type: "drawing", output: id, inputs: constructionInputs(command.definition), dependencyMode: "live", construction: structuredClone(command.definition), params: { ...params, topology: createDrawingTopology(String(params.kind), params, id) } };
    document.rootObjects.push(id); layer.objectIds.push(id); document.revision++;
    return { createdIds: [id] };
  });
}
