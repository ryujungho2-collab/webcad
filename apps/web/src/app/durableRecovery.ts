import { serializeDocument, type CadDocument } from "@agent-webcad/cad-document";
import { DOCUMENT_CACHE_KEY, DOCUMENT_BACKUP_KEY, DOCUMENT_RASTER_ASSET_PREFIX, decodeRecoveryDocument, readRecoveryCheckpoint } from "../state/documentRecovery";
import { projectStorage } from "./projectSession";
import { projectDatabase, projectDatabaseRequest } from "./projectDatabase";

export const DURABLE_KEY = "agent-webcad-durable-checkpoint";
export const LARGE_DOCUMENT_CHARS = 1024 * 1024;
export type DurableRecord = { id: string; token: string; current: string; backup?: string; bytes: number; assets: number; legacySnapshot?:Record<string,string> };
const validId = (id: string) => /^(legacy|[a-z0-9-]{1,80})$/.test(id);
export const readDurableRecord = (id: string) => { if (!validId(id)) throw Error("Invalid project identity."); return projectDatabaseRequest<DurableRecord | undefined>("documents", "readonly", store => store.get(id)); };
export const listDurableRecords = () => projectDatabaseRequest<DurableRecord[]>("documents", "readonly", store => store.getAll());
function decode(record: DurableRecord) {
  try { return { document: decodeRecoveryDocument(record.current), recovered: false }; }
  catch { if (record.backup) return { document: decodeRecoveryDocument(record.backup), recovered: true }; throw Error("No valid IndexedDB checkpoint. Original recovery data is preserved."); }
}
export async function readProjectCheckpoint(storage: Storage, id: string) {
  let record: DurableRecord | undefined;
  try { record = await readDurableRecord(id); }
  catch (error) { if (projectStorage(storage, id).getItem(DURABLE_KEY)) throw error; return readRecoveryCheckpoint(projectStorage(storage, id)); }
  if(!record&&projectStorage(storage,id).getItem(DURABLE_KEY))throw Error("IndexedDB checkpoint is missing. Download recovery data before repairing this project.");
  return record ? decode(record) : readRecoveryCheckpoint(projectStorage(storage, id));
}
/** CAS and both self-contained image-bearing snapshots commit in one transaction. */
export async function commitDurableRecord(record: DurableRecord, expected: string | undefined) {
  if (!validId(record.id)) throw Error("Invalid project identity.");
  const db = await projectDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("documents", "readwrite", {durability:"strict"}), store = tx.objectStore("documents"), request = store.get(record.id);
    let conflict = false;
    request.onsuccess = () => { if (request.result?.token !== expected) { conflict = true; tx.abort(); } else store.put(record); };
    tx.oncomplete = () => resolve(); tx.onerror = () => {};
    tx.onabort = () => reject(conflict ? Error("Project checkpoint changed in another window. Export your live document before reloading.") : tx.error ?? Error("Project storage write failed."));
  });
}
const knownTokens = new Map<string, string | undefined>();
export const isDurableProject = (id:string) => knownTokens.get(id)!==undefined;
export async function loadProjectCheckpoint(storage: Storage, id: string) {
  const record = await readDurableRecord(id); knownTokens.set(id, record?.token);
  if(!record&&projectStorage(storage,id).getItem(DURABLE_KEY))throw Error("IndexedDB checkpoint is missing. Original metadata is preserved.");
  return record ? decode(record) : readRecoveryCheckpoint(projectStorage(storage, id));
}
function marker(storage: Storage, record: DurableRecord) {
  projectStorage(storage, record.id).setItem(DURABLE_KEY, JSON.stringify({ bytes: record.bytes, assets: record.assets, token: record.token }));
}
/** Old copies are removed only after a successful durable commit. Interrupted cleanup is repeatable. */
function legacySnapshot(storage: Storage, id: string) {
  const prefix = id === "legacy" ? "" : `agent-webcad-project:${id}:`;
  const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((key): key is string => key !== null);
  return Object.fromEntries(keys.filter(key=>key === prefix + DOCUMENT_CACHE_KEY || key === prefix + DOCUMENT_BACKUP_KEY || key.startsWith(prefix + DOCUMENT_RASTER_ASSET_PREFIX)).map(key=>[key,storage.getItem(key)!]));
}
function retireLegacy(storage:Storage, record:DurableRecord) {
  if(!record.legacySnapshot)return;
  const current=legacySnapshot(storage,record.id);
  if(Object.keys(current).some(key=>current[key]!==record.legacySnapshot![key]))return;
  for(const key of Object.keys(record.legacySnapshot))if(storage.getItem(key)===record.legacySnapshot[key])storage.removeItem(key);
}
export async function writeDurableCheckpoint(storage: Storage, id: string, snapshot: CadDocument) {
  const current = serializeDocument(snapshot); decodeRecoveryDocument(current);
  const originalLegacy = legacySnapshot(storage,id), old = await readDurableRecord(id);
  if (knownTokens.has(id) && old?.token !== knownTokens.get(id)) throw Error("Project checkpoint changed in another window. Export your live document before reloading.");
  let backup = old?.backup;
  if (old) { try { decodeRecoveryDocument(old.current); if (old.current !== current) backup = old.current; } catch { /* Keep the last valid backup. */ } }
  else { const legacy = readRecoveryCheckpoint(projectStorage(storage, id)); if (legacy) backup = serializeDocument(legacy.document); }
  const record: DurableRecord = { id, token: crypto.randomUUID(), current, backup, bytes: (current.length + (backup?.length ?? 0)) * 2, assets: Object.keys(snapshot.rasterAssets ?? {}).length, ...(!old?{legacySnapshot:originalLegacy}:{}) };
  record.bytes+=JSON.stringify(record.legacySnapshot??{}).length*2;
  await commitDurableRecord(record, old?.token); knownTokens.set(id, record.token);
  // IDB is authoritative even when local metadata cleanup is interrupted.
  try { retireLegacy(storage, record); marker(storage, record); } catch { /* Index repair retries after restart. */ }
  return record;
}
export async function repairDurableIndex(storage: Storage) {
  for (const record of await listDurableRecords()) {
    if (!validId(record.id)) throw Error("Invalid durable project record.");
    // Validate before completing migration; corrupt originals must not be discarded.
    try { decode(record); retireLegacy(storage, record); } catch { /* Keep corrupt and legacy copies for raw recovery. */ }
    try { marker(storage, record); } catch { /* Recovery archive still enumerates the authoritative IndexedDB record. */ }
  }
}
