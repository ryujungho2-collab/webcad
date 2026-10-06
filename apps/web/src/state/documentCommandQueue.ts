let tail: Promise<unknown> = Promise.resolve();
let pendingCount = 0;

export function isDocumentCommandPending() { return pendingCount > 0; }
export const DOCUMENT_BUSY_REASON = "A document operation is still running. Try again when it finishes.";

export function assertDocumentIdle() {
  if (isDocumentCommandPending()) throw new Error(DOCUMENT_BUSY_REASON);
}

/** Serialize document mutations, including whole batches and history snapshots.
 * Viewport/navigation remain interactive while the worker computes. */
export function enqueueDocumentCommand<T>(task: () => Promise<T>): Promise<T> {
  pendingCount++;
  const result = tail.then(task).finally(() => { pendingCount--; });
  tail = result.catch(() => {});
  return result;
}
