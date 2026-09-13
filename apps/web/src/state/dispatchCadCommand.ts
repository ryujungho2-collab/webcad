import type {
  CadCommand,
} from "@agent-webcad/cad-commands";

import {
  validateCommand,
} from "@agent-webcad/cad-commands";

import {
  commandBus,
} from "./commandBus";

import {
  cadHistory,
} from "./history";

import {
  cadDocument,
} from "./cadDocument";

export async function dispatchCadCommand(
  command: CadCommand
) {
  if (!validateCommand(command)) {
    throw new Error("Invalid CAD command payload.");
  }

  const startedAt = performance.now();
  const revisionBefore = cadDocument.revision;
  const documentBefore = structuredClone(cadDocument);
  const result = await commandBus.dispatch(command);

  if (cadDocument.revision !== revisionBefore) {
    // `documentBefore` is already detached from the live document. Transferring
    // it avoids cloning every history snapshot twice.
    cadHistory.pushSnapshot(command.type, documentBefore);
  }

  performance.measure(`agent-webcad:command:${command.type}`, {
    start: startedAt,
    end: performance.now(),
    detail: { changed: cadDocument.revision !== revisionBefore },
  });
  if (import.meta.env.DEV) {
    console.info("[agent-webcad:perf]", JSON.stringify({
      command: command.type,
      changed: cadDocument.revision !== revisionBefore,
      commandMs: Number((performance.now() - startedAt).toFixed(2)),
    }));
  }

  return result;
}
