import type { CadCommand } from "./commands";
import { validateCommand } from "./validator";

export type CommandHandler = (
  command: CadCommand
) => unknown | Promise<unknown>;

export class CommandBus {
  private readonly handlers = new Map<CadCommand["type"], CommandHandler>();

  registerHandler(type: CadCommand["type"], handler: CommandHandler) {
    this.handlers.set(type, handler);
  }

  async dispatch(command: unknown): Promise<unknown> {
    if (!validateCommand(command)) {
      throw new Error("Invalid CAD command payload.");
    }

    const handler = this.handlers.get(command.type);

    if (!handler) {
      throw new Error(`No handler registered for command type: ${command.type}`);
    }

    return handler(command);
  }
}
