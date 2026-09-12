import type {
  CadCommand,
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
  cadHistory.push(
    command.type,
    cadDocument
  );

  return commandBus.dispatch(
    command
  );
}