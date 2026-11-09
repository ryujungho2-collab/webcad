import type { CommandBus } from "@agent-webcad/cad-commands";
import type { CadDocument } from "@agent-webcad/cad-document";
import { drawingStack } from "../precision/drawOrder";

export function registerDrawOrderCommands(bus: CommandBus, document: CadDocument) {
  bus.registerHandler("reorder-drawing", command => {
    if (command.type !== "reorder-drawing") return;
    const stack = drawingStack(document, command.plane);
    const stackIds = new Set(stack);
    const editable = (id: string) => {
      const object = document.objects[id];
      const layer = document.layers[object.layerId];
      return object.visible && layer?.visible && !layer.locked;
    };
    const hatches = new Set(Object.values(document.features)
      .filter(feature => feature.type === "drafting" && feature.params.kind === "hatch")
      .map(feature => feature.output));
    const targets = new Set(command.direction === "hatch-back"
      ? stack.filter(id => hatches.has(id) && editable(id))
      : command.objectIds);
    if (!targets.size) return { accepted: false, reason: "No eligible drawings or hatches to reorder." };
    if ([...targets].some(id => !stackIds.has(id) || !editable(id))) {
      return { accepted: false, reason: "Select visible, unlocked 2D vectors or hatches on the current plane." };
    }
    const moving = stack.filter(id => targets.has(id));
    const rest = stack.filter(id => !targets.has(id));
    const front = command.direction === "front";
    const next = front ? [...rest, ...moving] : [...moving, ...rest];
    if (next.every((id, i) => id === stack[i])) {
      return { accepted: false, reason: "Drawings are already at this stacking boundary." };
    }
    const edge = document.objects[front ? rest[rest.length - 1] : rest[0]].drawOrder ?? 0;
    const first = front ? edge + 1 : edge - moving.length;
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(first + moving.length - 1)) {
      return { accepted: false, reason: "The drawing order exceeds its supported range." };
    }
    moving.forEach((id, i) => { document.objects[id].drawOrder = first + i; });
    document.revision++;
  });
}
