import type { CadCommand } from "./commands";

export type CommandDiagnostic = {
  kind: "sketch-conflict" | "regeneration-failed";
  sketchId?: string;
  constraintIds: string[];
  geometryIds: string[];
};

/**
 * Standardized command execution result.
 *
 * Handlers historically returned mixed shapes (`string` id, `undefined`,
 * `{ accepted }`). All UI, palette, and future agent/Copilot callers must
 * only depend on this shape via `dispatchCadCommand`.
 */
export type CommandResult = {
  /** True when the document changed as requested. */
  ok: boolean;
  /** True when `cadDocument.revision` advanced. Mirrors `ok` except for validation throws. */
  changed: boolean;
  /** New object ids created by this command (empty for edits/moves). */
  createdIds: string[];
  /** History label used for this command. */
  label: string;
  /** Machine-readable command type that produced this result. */
  commandType: CadCommand["type"];
  /** Human-readable rejection reason when `ok` is false. */
  reason?: string;
  diagnostic?: CommandDiagnostic;
  /** Raw handler return for debugging. Never branch on this in UI/agent code. */
  raw?: unknown;
};

function commandLabel(command: CadCommand): string {
  if (command.type === "batch" && command.label?.trim()) return command.label.trim();
  if (command.type === "replace-image-source") return "Replace image source";
  return command.type;
}

function collectCreatedIds(raw: unknown): string[] {
  if (typeof raw === "string" && raw.length > 0) return [raw];
  if (Array.isArray(raw)) return raw.flatMap(collectCreatedIds);
  if (typeof raw === "object" && raw !== null) {
    const record = raw as Record<string, unknown>;
    const ids: string[] = [];
    if (typeof record.id === "string" && record.id.length > 0) {
      // Single-entity handler envelopes (sketch create etc.) are not object
      // creations; only collect explicit result lists below.
    }
    if (Array.isArray(record.results)) ids.push(...collectCreatedIds(record.results));
    if (Array.isArray(record.createdIds)) ids.push(...record.createdIds.filter((id): id is string => typeof id === "string" && id.length > 0));
    return ids;
  }
  return [];
}

/**
 * Normalize any legacy handler return into a CommandResult using the
 * revision delta as ground truth. `changed` must be computed by the caller
 * as `cadDocument.revision !== revisionBefore`.
 */
export function toCommandResult(command: CadCommand, raw: unknown, changed: boolean): CommandResult {
  const label = commandLabel(command);
  const commandType = command.type;
  if (typeof raw === "object" && raw !== null && "accepted" in raw) {
    const accepted = (raw as { accepted?: unknown }).accepted === true;
    const reason = (raw as { reason?: unknown }).reason;
    if (!accepted) {
      return {
        ok: false,
        changed,
        createdIds: [],
        label,
        commandType,
        reason: typeof reason === "string" && reason.length > 0 ? reason : `Command rejected: ${commandType}`,
        diagnostic: (raw as { diagnostic?: CommandDiagnostic }).diagnostic,
        raw,
      };
    }
    return { ok: true, changed, createdIds: collectCreatedIds(raw), label, commandType, raw };
  }
  if (typeof raw === "string") {
    return { ok: true, changed, createdIds: [raw], label, commandType, raw };
  }
  if (raw === undefined || raw === null) {
    if (changed) return { ok: true, changed, createdIds: [], label, commandType, raw };
    return { ok: false, changed, createdIds: [], label, commandType, reason: `Command rejected: ${commandType}`, raw };
  }
  // Unknown truthy payload: trust the revision delta.
  if (changed) return { ok: true, changed, createdIds: collectCreatedIds(raw), label, commandType, raw };
  return {
    ok: false,
    changed,
    createdIds: [],
    label,
    commandType,
    reason: `Command rejected: ${commandType}`,
    raw,
  };
}

export function failedResult(command: CadCommand, reason: string, raw?: unknown, diagnostic?: CommandDiagnostic): CommandResult {
  return { ok: false, changed: false, createdIds: [], label: commandLabel(command), commandType: command.type, reason, raw, diagnostic };
}
