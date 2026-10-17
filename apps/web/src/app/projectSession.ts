export const PROJECT_CHANNEL = "agent-webcad-project-v1";
let generation: string | undefined;
export function projectSessionGeneration() { return generation ??= crypto.randomUUID(); }
export function projectErrorMessage(reason: unknown, fallback: string) {
  // Errors can originate in a different iframe realm or be DOMExceptions.
  return reason && typeof reason === "object" && "message" in reason && typeof reason.message === "string" ? reason.message : fallback;
}

export type CheckpointRequest = { id: string; generation: string; requestId: string; intent: "close" | "save" | "export"; expiresAt: number };
/** Correlate responses to the current live editor and the exact, unexpired request. */
export class CheckpointGate {
  pending: CheckpointRequest | null = null;
  begin(id: string, generation: string, intent: CheckpointRequest["intent"], now = Date.now()) {
    if (this.pending && this.pending.expiresAt > now) throw Error("A project save is already in progress.");
    return this.pending = { id, generation, intent, requestId: crypto.randomUUID(), expiresAt: now + 10000 };
  }
  matches(data: { id?: unknown; generation?: unknown; requestId?: unknown }, now = Date.now()) {
    const p = this.pending;
    return !!p && now < p.expiresAt && data.id === p.id && data.generation === p.generation && data.requestId === p.requestId;
  }
  clear() { this.pending = null; }
}
export function embeddedProjectId(): string | null {
  if (typeof window === "undefined" || window.parent === window) return null;
  const id = new URLSearchParams(window.location.search).get("project-tab");
  return id && /^(legacy|[a-z0-9-]{1,80})$/.test(id) ? id : null;
}

/** Namespace every checkpoint, backup and raster asset, including cleanup operations. */
export function projectStorage(storage: Pick<Storage,"getItem"|"setItem"|"removeItem">, id = embeddedProjectId()) {
  const prefix = id && id !== "legacy" ? `agent-webcad-project:${id}:` : "";
  return {
    getItem: (key: string) => storage.getItem(prefix + key),
    setItem: (key: string, value: string) => storage.setItem(prefix + key, value),
    removeItem: (key: string) => storage.removeItem(prefix + key),
  };
}

export function notifyProjectHost(type: string, payload: Record<string, unknown> = {}): boolean {
  const id = embeddedProjectId();
  if (!id) return false;
  window.parent.postMessage({ ...payload, channel: PROJECT_CHANNEL, id, generation: projectSessionGeneration(), type }, window.location.origin);
  return true;
}
