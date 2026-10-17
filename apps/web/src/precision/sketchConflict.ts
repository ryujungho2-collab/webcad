import type { CommandDiagnostic } from "@agent-webcad/cad-commands";

/** Shared diagnostic identity for command adapters and document regeneration. */
export class SketchParameterConflictError extends Error {
  constructor(message: string, public diagnostic: CommandDiagnostic) { super(message); }
}
