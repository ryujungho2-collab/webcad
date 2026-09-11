import {CadCommand} from './commands';

export class CommandBus {
  private handlers: Map<string, (command: CadCommand) => void> = new Map();

  registerHandler(type: string, handler: (command: CadCommand) => void) {
    this.handlers.set(type, handler);
  }

  async dispatch(command: CadCommand) {
    const handler = this.handlers.get(command.type);
    if (handler) {
      return await handler(command);
    }
    throw new Error(`No handler registered for command type: ${command.type}`);
  }
}