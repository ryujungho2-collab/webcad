import type { CommandResult } from "@agent-webcad/cad-commands";

const listeners = new Set<(result: CommandResult) => void>();
export function subscribeCommandResults(listener: (result: CommandResult) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function publishCommandResult(result: CommandResult) {
  for (const listener of listeners) listener(result);
}
