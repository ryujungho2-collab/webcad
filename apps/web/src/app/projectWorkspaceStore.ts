import { readRecoveryCheckpoint } from "../state/documentRecovery";
import { projectStorage } from "./projectSession";

export type Project = { id: string; title: string; closed: boolean; lastOpenedAt?: number };
export type Workspace = { version: 1; active: string; projects: Project[] };
type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "getItem" | "setItem">;
export const WORKSPACE_KEY = "agent-webcad-project-workspace-v1";
export const WORKSPACE_BACKUP_KEY = `${WORKSPACE_KEY}-backup`;
export const WORKSPACE_DAMAGED_KEY = `${WORKSPACE_KEY}-damaged`;
export const initialWorkspace = (): Workspace => ({ version: 1, active: "legacy", projects: [{ id: "legacy", title: "Project 1", closed: false }] });

export function parseWorkspace(raw: string): Workspace {
  const value = JSON.parse(raw) as Workspace;
  if (!value || value.version !== 1 || typeof value.active !== "string" || !Array.isArray(value.projects) || value.projects.length > 200
    || !value.projects.every(p => p && typeof p.id === "string" && /^(legacy|[a-z0-9-]{1,80})$/.test(p.id)
      && typeof p.title === "string" && !!p.title.trim() && p.title.length <= 120 && typeof p.closed === "boolean")
    || new Set(value.projects.map(p => p.id)).size !== value.projects.length) throw Error("Invalid project list.");
  // Session save indicators are ephemeral, never trusted after reload.
  const projects = value.projects.map(({ id, title, closed, lastOpenedAt }) => ({ id, title, closed,
    ...(typeof lastOpenedAt === "number" && Number.isSafeInteger(lastOpenedAt) && lastOpenedAt >= 0 && lastOpenedAt <= 8.64e15 ? { lastOpenedAt } : {}) }));
  return { version: 1, projects, active: projects.find(p => p.id === value.active && !p.closed)?.id ?? projects.find(p => !p.closed)?.id ?? "" };
}

export function readWorkspace(storage: StorageReader) {
  const current = storage.getItem(WORKSPACE_KEY), backup = storage.getItem(WORKSPACE_BACKUP_KEY);
  if (current) try { return { workspace: parseWorkspace(current), blocked: false, error: "", backup: null as Workspace | null }; } catch { /* Explicit recovery below. */ }
  if (!current && !backup) return { workspace: initialWorkspace(), blocked: false, error: "", backup: null as Workspace | null };
  let restored: Workspace | null = null;
  if (backup) try { restored = parseWorkspace(backup); } catch { /* Preserve both raw copies. */ }
  return { workspace: restored ?? initialWorkspace(), blocked: true, backup: restored,
    error: "Project list could not be restored. Existing drawings and recovery copies have been kept." };
}

/** A failed primary write leaves the previous readable list and its checkpoint untouched. */
export function writeWorkspace(storage: StorageWriter, next: Workspace) {
  const data = JSON.stringify(parseWorkspace(JSON.stringify(next))), current = storage.getItem(WORKSPACE_KEY);
  if (current === data) return;
  if (current) {
    parseWorkspace(current); // Never overwrite a damaged list through ordinary editing.
    storage.setItem(WORKSPACE_BACKUP_KEY, current);
  } else storage.setItem(WORKSPACE_BACKUP_KEY, data);
  storage.setItem(WORKSPACE_KEY, data);
}

/** Repair is explicit. Archive the damaged list before changing it, and keep a valid fallback. */
export function restoreWorkspace(storage: StorageWriter, next: Workspace) {
  const data = JSON.stringify(parseWorkspace(JSON.stringify(next)));
  const primary = storage.getItem(WORKSPACE_KEY), backup = storage.getItem(WORKSPACE_BACKUP_KEY);
  const archived = storage.getItem(WORKSPACE_DAMAGED_KEY);
  if (!archived) storage.setItem(WORKSPACE_DAMAGED_KEY, JSON.stringify({ primary, backup }));
  else {
    let previous: { primary?: string | null; backup?: string | null; copies?: { primary: string | null; backup: string | null }[] };
    try { previous = JSON.parse(archived); if (!previous || typeof previous !== "object") throw Error("Invalid archive"); }
    catch { previous = {}; }
    const copies = Array.isArray(previous.copies) ? previous.copies : [{ primary: previous.primary ?? null, backup: previous.backup ?? null }];
    if (!copies.some(copy => copy.primary === primary && copy.backup === backup))
      storage.setItem(WORKSPACE_DAMAGED_KEY, JSON.stringify({ ...previous, primary: previous.primary ?? primary, backup: previous.backup ?? backup,
        copies: [...copies, { primary, backup }], ...(!("primary" in previous) ? { previousRaw: archived } : {}) }));
  }
  storage.setItem(WORKSPACE_BACKUP_KEY, data);
  storage.setItem(WORKSPACE_KEY, data);
}

function isRecoveryKey(key: string) {
  return key.startsWith("agent-webcad-project:") || key.startsWith(WORKSPACE_KEY)
    || key.startsWith("agent-webcad-working-document") || key.startsWith("agent-webcad-recovery-asset-");
}
export function recoveryArchive(storage: Pick<Storage, "length" | "key" | "getItem">) {
  const entries: Record<string, string> = {};
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && isRecoveryKey(key)) { const value = storage.getItem(key); if (value !== null) entries[key] = value; }
  }
  return JSON.stringify({ format: "agent-webcad-workspace-recovery", version: 1, exportedAt: new Date().toISOString(), entries });
}

/** Rescue documents whose namespace remains readable even when both lists are damaged. */
export function discoverWorkspace(storage: Storage) {
  const ids = new Set<string>();
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    const id = key?.match(/^agent-webcad-project:([a-z0-9-]{1,80}):agent-webcad-working-document(?:-backup)?$/)?.[1];
    if (id) ids.add(id);
    if (key === "agent-webcad-working-document" || key === "agent-webcad-working-document-backup") ids.add("legacy");
  }
  const projects: Project[] = []; let failed = 0;
  for (const id of ids) {
    try {
      const checkpoint = readRecoveryCheckpoint(projectStorage(storage, id));
      if (checkpoint) projects.push({ id, title: checkpoint.document.id.slice(0, 120) || "Recovered project", closed: false });
    } catch { failed++; }
  }
  if (projects.length > 200) throw Error("More than 200 saved projects found. Download recovery data before managing this workspace.");
  return { workspace: { version: 1, active: projects[0]?.id ?? "", projects } satisfies Workspace, failed };
}
