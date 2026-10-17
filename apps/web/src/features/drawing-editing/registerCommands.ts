import type { CadDocument } from "@agent-webcad/cad-document";
import type { CommandBus } from "@agent-webcad/cad-commands";
import { registerDrawingCommandHandlers } from "./commands/registerDrawingCommandHandlers";
import { registerContourCommandHandlers } from "./commands/contourCommands";
import { registerBasicDrawingCommands } from "./commands/basicDrawingCommands";
import { registerBlockCommandHandlers } from "./commands/blockCommands";

/** One composition entry; adapters only mutate the supplied transaction document. */
export function registerDrawingEditingCommands(bus: CommandBus, document: CadDocument) {
  registerDrawingCommandHandlers(bus, document);
  registerContourCommandHandlers(bus, document);
  registerBasicDrawingCommands(bus, document);
  registerBlockCommandHandlers(bus, document);
}
