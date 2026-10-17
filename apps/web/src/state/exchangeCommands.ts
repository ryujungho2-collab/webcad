import type { CommandBus } from "@agent-webcad/cad-commands";
import { validateExchangeImports, type CadDocument } from "@agent-webcad/cad-document";

export function registerExchangeCommands(bus: CommandBus, document: CadDocument) {
  bus.registerHandler("record-exchange-import", command => {
    if (command.type !== "record-exchange-import") return;
    if (document.exchangeImports?.[command.receipt.id]) return { accepted: false, reason: "Exchange receipt already exists." };
    for (const mapping of command.receipt.mappings) {
      const object = document.objects[mapping.objectId], feature = Object.values(document.features).find(f=>f.output === mapping.objectId);
      if (!object || feature?.type !== "drawing" || document.layers[object.layerId]?.locked) return { accepted: false, reason: "Exchange mapping requires an editable imported drawing." };
    }
    const receipts = { ...document.exchangeImports, [command.receipt.id]: structuredClone(command.receipt) };
    validateExchangeImports(receipts);
    document.exchangeImports = receipts;
    document.revision++;
  });
}
