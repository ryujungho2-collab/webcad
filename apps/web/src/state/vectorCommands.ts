import type { CadCommand, CommandBus } from "@agent-webcad/cad-commands";
import type { CadDocument, CadVectorStyle } from "@agent-webcad/cad-document";

export function registerVectorCommandHandlers(bus: CommandBus, document: CadDocument) {
  bus.registerHandler("set-vector-style", (command: CadCommand) => {
    if (command.type !== "set-vector-style") return;
    const object = document.objects[command.objectId];
    const layer = object && document.layers[object.layerId];
    const feature = Object.values(document.features).find(entry => entry.output === command.objectId);
    if (!object || !layer || !object.visible || !layer.visible || layer.locked || feature?.type !== "drawing") {
      if (command.merge) throw Error("Choose visible drawings on unlocked layers.");
      return;
    }
    if (command.merge && feature.params.dxfStyle) throw Error("Imported DXF styling cannot be partially replaced.");
    const previous = feature.params.vectorStyle as Partial<CadVectorStyle> | undefined;
    const style = command.merge ? { ...previous, ...command.style } : command.style;
    if (JSON.stringify(feature.params.vectorStyle) === JSON.stringify(style)) return;
    feature.params = { ...feature.params, vectorStyle: structuredClone(style) };
    delete feature.params.dxfStyle;
    document.revision++;
  });
}
