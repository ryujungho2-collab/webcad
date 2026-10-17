import { serializeDocument } from "@agent-webcad/cad-document";
import { DOCUMENT_BACKUP_KEY, DOCUMENT_CACHE_KEY, DOCUMENT_RASTER_ASSET_PREFIX, readRecoveryCheckpoint, referencedRecoveryAssetIds } from "../state/documentRecovery";
import { projectStorage } from "./projectSession";
import { parseWorkspace, WORKSPACE_BACKUP_KEY, WORKSPACE_KEY, type Workspace } from "./projectWorkspaceStore";
import { transactStorage, type StorageJournal } from "./projectStorageTransactions";
import { DURABLE_KEY, readDurableRecord, readProjectCheckpoint } from "./durableRecovery";

export type ProjectStorageRow = { id: string; title: string; closed: boolean; unlisted: boolean; bytes: number; assetCount: number; checkpoint: boolean; lastOpenedAt?: number };
const validId = (id: string) => /^(legacy|[a-z0-9-]{1,80})$/.test(id);
const prefix = (id: string) => id === "legacy" ? "" : `agent-webcad-project:${id}:`;
function owns(key: string, id: string) {
  if (!validId(id)) return false;
  if (id !== "legacy") return key.startsWith(prefix(id));
  return key === DOCUMENT_CACHE_KEY || key === DOCUMENT_BACKUP_KEY || key === DURABLE_KEY || key.startsWith(DOCUMENT_RASTER_ASSET_PREFIX);
}
function keys(storage: Storage) { return Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((key): key is string => key !== null); }
export function projectStorageKeys(storage: Storage, id: string) { if (!validId(id)) throw Error("Invalid project identity."); return keys(storage).filter(key => owns(key, id)); }
export function inspectProjectStorage(storage: Storage, workspace: Workspace) {
  const all = keys(storage), ids = new Set(workspace.projects.map(p => p.id));
  for (const key of all) {
    const id = key.match(/^agent-webcad-project:([a-z0-9-]{1,80}):/)?.[1]; if (id) ids.add(id);
    if (owns(key,"legacy")) ids.add("legacy");
  }
  const rows: ProjectStorageRow[] = [...ids].map(id => {
    const project = workspace.projects.find(p => p.id === id), owned = all.filter(key => owns(key,id));
    return { id, title: project?.title ?? `Unlisted ${id}`, closed: project?.closed ?? true, unlisted: !project,
      bytes: owned.reduce((sum,key) => sum + (key.length + (storage.getItem(key)?.length ?? 0)) * 2,0) + durableInfo(storage,id).bytes,
      assetCount: owned.filter(key => key.startsWith(prefix(id)+DOCUMENT_RASTER_ASSET_PREFIX)).length + durableInfo(storage,id).assets,
      checkpoint: owned.some(key => key === prefix(id)+DOCUMENT_CACHE_KEY || key === prefix(id)+DOCUMENT_BACKUP_KEY || key === prefix(id)+DURABLE_KEY), lastOpenedAt: project?.lastOpenedAt };
  });
  const areaBytes = all.reduce((sum,key) => sum + (key.length + (storage.getItem(key)?.length ?? 0))*2,0);
  return { rows, projectBytes: rows.reduce((sum,row)=>sum+row.bytes,0), areaBytes,
    metadataBytes: all.filter(key=>key.startsWith(WORKSPACE_KEY)).reduce((sum,key)=>sum+(key.length+(storage.getItem(key)?.length??0))*2,0) };
}
function durableInfo(storage:Storage,id:string) { try{return JSON.parse(projectStorage(storage,id).getItem(DURABLE_KEY)??'{"bytes":0,"assets":0}') as {bytes:number;assets:number};}catch{return {bytes:0,assets:0};} }
export async function portableProjectAsync(storage:Storage,id:string,title:string) {
  const checkpoint=await readProjectCheckpoint(storage,id);
  if(!checkpoint)throw Error("No saved checkpoint. Open and save the project first.");
  return {text:serializeDocument(checkpoint.document),name:projectExportName(title),recovered:checkpoint.recovered,revision:checkpoint.document.revision};
}
export function portableProject(storage: Storage, id: string, title: string) {
  if (!validId(id)) throw Error("Invalid project identity.");
  const checkpoint = readRecoveryCheckpoint(projectStorage(storage,id));
  if (!checkpoint) throw Error("No saved checkpoint. Open and save this project before exporting.");
  return { text: serializeDocument(checkpoint.document), name: projectExportName(title), recovered: checkpoint.recovered, revision: checkpoint.document.revision };
}
export function projectExportName(title:string) {
  const safeName=title.replace(/[<>:"/\\|?*\x00-\x1f]/g,"_").replace(/[. ]+$/g,"").slice(0,100)||"WebCAD project";
  return `${safeName}.webcad.json`;
}
function assertReview(storage: Storage, workspace: Workspace, id: string) {
  if (!validId(id)) throw Error("Invalid project identity.");
  const raw = storage.getItem(WORKSPACE_KEY);
  if (raw && JSON.stringify(parseWorkspace(raw)) !== JSON.stringify(parseWorkspace(JSON.stringify(workspace)))) throw Error("Project list changed. Refresh before managing storage.");
  if (workspace.projects.find(p=>p.id===id)?.closed === false) throw Error("Close this project before deleting or cleaning its recovery data.");
  return { [WORKSPACE_KEY]: raw, [WORKSPACE_BACKUP_KEY]: storage.getItem(WORKSPACE_BACKUP_KEY) };
}
export async function deleteClosedProject(storage: Storage, workspace: Workspace, id: string, journal: StorageJournal) {
  const durable=typeof indexedDB!=="undefined"?await readDurableRecord(id):undefined;
  const guards = assertReview(storage,workspace,id), owned = projectStorageKeys(storage,id), projects = workspace.projects.filter(p=>p.id!==id);
  const next = parseWorkspace(JSON.stringify({ ...workspace,projects,active:workspace.active===id?"":workspace.active }));
  const changes: Record<string,string|null> = { [WORKSPACE_KEY]: JSON.stringify(next) };
  if (guards[WORKSPACE_BACKUP_KEY]) {
    try { const old = parseWorkspace(guards[WORKSPACE_BACKUP_KEY]!); changes[WORKSPACE_BACKUP_KEY] = JSON.stringify(parseWorkspace(JSON.stringify({ ...old,projects:old.projects.filter(p=>p.id!==id) }))); }
    catch { /* An unreadable historical list is preserved; it cannot restore the deleted project. */ }
  }
  for (const key of owned) changes[key] = null;
  await transactStorage(storage,journal,id,changes,guards,()=>{
    if(JSON.stringify(projectStorageKeys(storage,id).sort())!==JSON.stringify([...owned].sort()))throw Error("Project storage changed while preparing. Refresh and review it again.");
  },durable?.token);
  return next;
}
export function unusedProjectAssetKeys(storage: Storage, workspace: Workspace, id: string) {
  assertReview(storage,workspace,id);
  if(projectStorage(storage,id).getItem(DURABLE_KEY))return []; // Each durable copy embeds exactly its own sources.
  const owned = referencedRecoveryAssetIds(projectStorage(storage,id));
  return projectStorageKeys(storage,id).filter(key => key.startsWith(prefix(id)+DOCUMENT_RASTER_ASSET_PREFIX)
    && !owned.has(key.slice((prefix(id)+DOCUMENT_RASTER_ASSET_PREFIX).length)));
}
export async function cleanProjectAssets(storage: Storage, workspace: Workspace, id: string, journal: StorageJournal) {
  const guards = { ...assertReview(storage,workspace,id), [prefix(id)+DOCUMENT_CACHE_KEY]: projectStorage(storage,id).getItem(DOCUMENT_CACHE_KEY),
    [prefix(id)+DOCUMENT_BACKUP_KEY]: projectStorage(storage,id).getItem(DOCUMENT_BACKUP_KEY) };
  const unused = unusedProjectAssetKeys(storage,workspace,id);
  if (unused.length) await transactStorage(storage,journal,id,Object.fromEntries(unused.map(key=>[key,null])),guards);
  return unused.length;
}
