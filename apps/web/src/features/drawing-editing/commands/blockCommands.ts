import type { CadDocument, CadFeature, CadObject } from "@agent-webcad/cad-document";
import type { CadCommand, CommandBus } from "@agent-webcad/cad-commands";
import { createDrawingTopology } from "../../../precision/drawingTopology";
import { disbandBlockMembers } from "../geometry/blockDisband";

/** Instance disassembly keeps the definition and sibling instances intact.
 * Geometry baking is pure; document mutation only starts after every output,
 * layer and ID is prepared, so failures leave the document and History alone. */
export function registerBlockCommandHandlers(bus: CommandBus, document: CadDocument) {
  bus.registerHandler("explode-block", (command: CadCommand) => {
    if (command.type !== "explode-block") return;
    const source = document.objects[command.objectId];
    const outputs = disbandBlockMembers(document, command.objectId, command.recursive === true);
    const prepared = outputs.map((member, index) => {
      const id = `disband-${crypto.randomUUID()}`, featureId = `feature-${id}`;
      if (document.objects[id] || document.features[featureId]) throw new Error("The output ID already exists.");
      const layer = document.layers[member.layerId];
      if (!layer) throw new Error("A member layer no longer exists.");
      const object: CadObject = {
        id, geometryId: `geometry-${id}`, name: `${source?.name ?? "Block"} · ${member.label}`,
        visible: true, layerId: member.layerId,
        transform: member.transform ?? { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      };
      const params: Record<string, unknown> = structuredClone(member.params);
      const feature: CadFeature = member.type === "drawing"
        ? {
          id: featureId, type: "drawing", inputs: [], dependencyMode: "snapshot", output: id,
          params: { ...params, topology: createDrawingTopology(String(params.kind), params, id) },
        }
        : { id: featureId, type: "drafting", inputs: [], dependencyMode: "snapshot", output: id, params };
      return { id, featureId, object, feature, index };
    });
    if (new Set(prepared.map(entry => entry.id)).size !== prepared.length) throw new Error("Output IDs must be unique.");
    const feature = Object.values(document.features).find(entry => entry.output === command.objectId);
    if (source && feature) {
      delete document.objects[source.id];
      delete document.features[feature.id];
      document.rootObjects = document.rootObjects.filter(id => id !== source.id);
      for (const layer of Object.values(document.layers)) layer.objectIds = layer.objectIds.filter(id => id !== source.id);
    }
    for (const entry of prepared) {
      document.objects[entry.id] = entry.object;
      document.features[entry.featureId] = entry.feature;
      document.rootObjects.push(entry.id);
      document.layers[entry.object.layerId].objectIds.push(entry.id);
    }
    document.revision++;
    return { createdIds: prepared.map(entry => entry.id) };
  });
}
