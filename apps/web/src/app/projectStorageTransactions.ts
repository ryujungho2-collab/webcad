import { projectDatabase, projectDatabaseRequest } from "./projectDatabase";
import { DURABLE_KEY } from "./durableRecovery";
import { DOCUMENT_BACKUP_KEY, DOCUMENT_CACHE_KEY, DOCUMENT_RASTER_ASSET_PREFIX } from "../state/documentRecovery";
import { WORKSPACE_BACKUP_KEY, WORKSPACE_KEY } from "./projectWorkspaceStore";

export type StorageUndo = { id: string; target: string; committed: boolean; durableToken?: string; rollingBack?:boolean; before: Record<string, string | null>; after: Record<string, string | null> };
export type StorageJournal = { list(): Promise<StorageUndo[]>; put(value: StorageUndo): Promise<void>; remove(id: string): Promise<void> };

/** Journal and durable deletion commit atomically in the same database. */
export function indexedStorageJournal(): StorageJournal {
  return {
    list: () => projectDatabaseRequest<StorageUndo[]>("undo", "readonly", store => store.getAll()),
    remove: async id => { await projectDatabaseRequest("undo", "readwrite", store => store.delete(id)); },
    put: async value => {
      const db = await projectDatabase();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(["undo", "documents"], "readwrite", {durability:"strict"});
        let conflict = false;
        if (value.committed && value.durableToken) {
          const store = tx.objectStore("documents"), request = store.get(value.target);
          request.onsuccess = () => { if (request.result?.token !== value.durableToken) { conflict = true; tx.abort(); } else { store.delete(value.target); tx.objectStore("undo").put(value); } };
        } else tx.objectStore("undo").put(value);
        tx.oncomplete = () => resolve(); tx.onerror = () => {};
        tx.onabort = () => reject(conflict ? Error("Project checkpoint changed while deleting. Refresh and review it again.") : tx.error ?? Error("Recovery journal write failed."));
      });
    },
  };
}
type MutableStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
function assertJournalRecord(record:StorageUndo) {
  const object=(value:unknown)=>!!value&&typeof value==="object"&&!Array.isArray(value);
  if(record?.durableToken!==undefined&&typeof record.durableToken!=="string")throw Error("Invalid durable deletion token.");
  if(!record||typeof record.id!=="string"||!record.id||typeof record.target!=="string"||!/^(legacy|[a-z0-9-]{1,80})$/.test(record.target)
    ||typeof record.committed!=="boolean"||record.rollingBack!==undefined&&typeof record.rollingBack!=="boolean"||!object(record.before)||!object(record.after))throw Error("Invalid storage recovery record. Download recovery data before manual repair.");
  const owns=(key:string)=>key===WORKSPACE_KEY||key===WORKSPACE_BACKUP_KEY||(record.target==="legacy"?
    key===DOCUMENT_CACHE_KEY||key===DOCUMENT_BACKUP_KEY||key===DURABLE_KEY||key.startsWith(DOCUMENT_RASTER_ASSET_PREFIX):key.startsWith(`agent-webcad-project:${record.target}:`));
  if(Object.keys(record.before).length!==Object.keys(record.after).length||Object.entries(record.before).some(([key,value])=>!owns(key)
    ||!(key in record.after)||(value!==null&&typeof value!=="string")||(record.after[key]!==null&&typeof record.after[key]!=="string")))throw Error("Storage recovery record crosses project ownership boundaries. Original copies have been kept.");
}
function rollback(storage: MutableStorage, before: StorageUndo["before"]) {
  // Free the operation's footprint before restoring it; no extra localStorage quota is needed.
  for (const key of Object.keys(before)) storage.removeItem(key);
  for (const [key, value] of Object.entries(before)) if (value !== null) storage.setItem(key, value);
}
function assertRollbackSafe(storage: MutableStorage, record: StorageUndo) {
  for (const [key, before] of Object.entries(record.before)) {
    const value=storage.getItem(key);
    if(value!==before&&value!==record.after[key]&&!(record.rollingBack&&value===null))throw Error("Storage changed outside this operation. Original copies are kept in the recovery journal; download them before manual recovery.");
  }
}
export async function recoverStorageTransactions(storage: MutableStorage, journal: StorageJournal) {
  const records = await journal.list(); let recovered = 0;
  for (const record of records) {
    assertJournalRecord(record);
    if (!record.committed) { assertRollbackSafe(storage,record);const restoring={...record,rollingBack:true};await journal.put(restoring);assertRollbackSafe(storage,restoring);rollback(storage, record.before); recovered++; }
    await journal.remove(record.id);
  }
  return recovered;
}

/** Writes and deletion are journalled before mutation. A crash replays the full original data. */
export async function transactStorage(storage: MutableStorage, journal: StorageJournal, target: string,
  changes: Record<string, string | null>, guards: Record<string, string | null>, validate?:()=>void, durableToken?:string) {
  const before = Object.fromEntries(Object.keys(changes).map(key => [key, storage.getItem(key)]));
  const record: StorageUndo = { id: crypto.randomUUID(), target, committed: false, before, after: changes, ...(durableToken?{durableToken}:{}) };
  assertJournalRecord(record);
  await journal.put(record); // IndexedDB is separate from the localStorage per-area quota.
  try {
    for (const [key, value] of Object.entries({ ...before, ...guards }))
      if (storage.getItem(key) !== value) throw Error("Project storage changed while preparing. Refresh and review it again.");
    validate?.();
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) storage.removeItem(key); else storage.setItem(key, value);
    }
    await journal.put({ ...record, committed: true });
  } catch (reason) {
    // A stale review did not mutate anything, so it must not overwrite another window's newer data.
    const stale = reason instanceof Error && reason.message.startsWith("Project storage changed");
    if (!stale) {
      try { assertRollbackSafe(storage,record);const restoring={...record,rollingBack:true};await journal.put(restoring);assertRollbackSafe(storage,restoring);rollback(storage, before); }
      catch { throw Error("Storage recovery is pending. Original copies remain in the recovery journal. Free browser space and retry recovery before editing."); }
    }
    await journal.remove(record.id);
    throw reason;
  }
  // A committed record can safely be removed on the next startup if this cleanup fails.
  try { await journal.remove(record.id); } catch { /* Recovery sees committed=true and never restores a deleted project. */ }
}
