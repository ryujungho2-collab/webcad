import type { CadCommand, CommandBus } from "@agent-webcad/cad-commands";
import type { CadDocument } from "@agent-webcad/cad-document";

export function registerVectorCommandHandlers(bus: CommandBus, document: CadDocument) {
  bus.registerHandler("set-vector-style", (command: CadCommand) => {
    if (command.type !== "set-vector-style") return;
    const object = document.objects[command.objectId];
    const layer = object && document.layers[object.layerId];
    const feature = Object.values(document.features).find(entry => entry.output === command.objectId);
    if (!object || !layer || !object.visible || !layer.visible || layer.locked || feature?.type !== "drawing") return;
    if (JSON.stringify(feature.params.vectorStyle) === JSON.stringify(command.style)) return;
    feature.params = { ...feature.params, vectorStyle: structuredClone(command.style) };
    document.revision++;
  });
}
