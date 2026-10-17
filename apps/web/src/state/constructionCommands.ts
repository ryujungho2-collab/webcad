import { constructionInputs, constructionExpression, validateConstructionGraph, type CadDocument } from "@agent-webcad/cad-document";
import type { CadCommand, CommandBus } from "@agent-webcad/cad-commands";
import { evaluateConstruction,normalizeConstructionDefinition } from "../precision/constructionGeometry";
import { createDrawingTopology } from "../precision/drawingTopology";

export function registerConstructionCommands(bus: CommandBus, document: CadDocument) {
  bus.registerHandler("update-construction", command => {
    if(command.type!=="update-construction")return;
    const object=document.objects[command.objectId],feature=Object.values(document.features).find(f=>f.output===command.objectId);
    if(!object||!feature?.construction||feature.dependencyMode!=="live")throw new Error("Select a saved live construction to reassign its definition.");
    if(document.layers[object.layerId]?.locked)throw new Error("The construction output layer is locked.");
    if(feature.construction.operation!==command.definition.operation)throw new Error("Construction reassignment must preserve the operation and result kind.");
    const definition=normalizeConstructionDefinition(document,command.definition);
    if(JSON.stringify(feature.construction)===JSON.stringify(definition))return {createdIds:[]};
    feature.construction=definition;
    feature.inputs=constructionInputs(command.definition);
    // Check the new graph before reading evaluated caches, including indirect cycles.
    validateConstructionGraph(document);
    const evaluated=evaluateConstruction(document,feature.construction,feature.params.workPlane as import("../precision/workPlane").WorkPlaneId);
    if(evaluated.kind!==feature.params.kind)throw new Error("Construction reassignment cannot change the result kind.");
    // Coordinate-only changes preserve topology, styles, object identity and annotations.
    if(evaluated.intersectionStatus===undefined)delete feature.params.intersectionStatus;
    feature.params={...feature.params,...evaluated};
    document.revision++;
    return {createdIds:[]};
  });
  bus.registerHandler("create-construction", (command: CadCommand) => {
    if (command.type !== "create-construction") return;
    const id = command.id ?? `construction-${crypto.randomUUID()}`, layerId = command.layerId ?? "layer-default", layer = document.layers[layerId];
    if (!layer?.visible || layer.locked) throw new Error("The construction layer is hidden or locked.");
    if (document.objects[id] || document.features[`feature-${id}`]) throw new Error("Construction ID already exists.");
    const definition=normalizeConstructionDefinition(document,command.definition);
    const params: Record<string, unknown> = { ...evaluateConstruction(document, definition, command.workPlane), construction: command.construction ?? true };
    document.objects[id] = { id, geometryId: `geometry-${id}`, name: command.name ?? constructionExpression(definition, sourceId => document.objects[sourceId]?.name ?? sourceId), visible: true, layerId, transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } };
    document.features[`feature-${id}`] = { id: `feature-${id}`, type: "drawing", output: id, inputs: constructionInputs(definition), dependencyMode: "live", construction: definition, params: { ...params, topology: createDrawingTopology(String(params.kind), params, id) } };
    document.rootObjects.push(id); layer.objectIds.push(id); document.revision++;
    return { createdIds: [id] };
  });
}
