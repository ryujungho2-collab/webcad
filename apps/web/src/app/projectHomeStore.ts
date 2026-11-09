import {deserializeDocument,serializeDocument,type CadDocument} from "@agent-webcad/cad-document";
import {writeRecoveryCheckpoint} from "../state/documentRecovery";
import {projectStorage} from "./projectSession";
import {parseWorkspace,WORKSPACE_KEY,WORKSPACE_BACKUP_KEY,type Workspace} from "./projectWorkspaceStore";
import {transactStorage,type StorageJournal} from "./projectStorageTransactions";
import type {ProjectStorageRow} from "./projectManagerStore";
export const PROJECT_HOME_KEY="agent-webcad-project-home-v1";
export function startsOnProjectHome(storage:Pick<Storage,"getItem">){try{return JSON.parse(storage.getItem(PROJECT_HOME_KEY)??"null")?.start!==false;}catch{return true;}}
export function saveProjectHomePreference(storage:Pick<Storage,"setItem">,start:boolean){try{storage.setItem(PROJECT_HOME_KEY,JSON.stringify({start}));return true;}catch{return false;}}
export function homeProjectRows(rows:ProjectStorageRow[],query:string,filter:string){
  const normalize=(text:string)=>text.normalize("NFC").toLocaleLowerCase(),text=normalize(query.trim());
  return rows.filter(row=>(filter==="recovery"?row.unlisted:!row.unlisted&&(filter==="all"||filter==="open"&&!row.closed||filter==="closed"&&row.closed))&&normalize(`${row.title}\n${row.id}`).includes(text)).sort((a,b)=>(b.lastOpenedAt??0)-(a.lastOpenedAt??0)||a.title.localeCompare(b.title)||a.id.localeCompare(b.id));
}
/** Stage checkpoint/assets and list together, with rollback and cross-window guards. */
export async function createProjectCopy(storage:Storage,workspace:Workspace,source:CadDocument,title:string,journal:StorageJournal):Promise<Workspace>{
  if(workspace.projects.length>=200)throw Error("The workspace contains 200 projects. Delete a closed project in Projects to free a slot.");
  const primary=storage.getItem(WORKSPACE_KEY),backup=storage.getItem(WORKSPACE_BACKUP_KEY);
  if(primary&&JSON.stringify(parseWorkspace(primary))!==JSON.stringify(parseWorkspace(JSON.stringify(workspace))))throw Error("Project list changed. Refresh before creating a copy.");
  const id=crypto.randomUUID(),document=deserializeDocument(serializeDocument(source));document.id=`document-${id}`;
  const staged=new Map<string,string>();
  const temporary={getItem:(key:string)=>staged.get(key)??null,setItem:(key:string,value:string)=>{staged.set(key,value);},removeItem:(key:string)=>{staged.delete(key);}};
  writeRecoveryCheckpoint(projectStorage(temporary,id),document);
  const next=parseWorkspace(JSON.stringify({...workspace,active:id,projects:[...workspace.projects,{id,title:title.trim().slice(0,120)||"Project copy",closed:false,lastOpenedAt:Date.now()}]}));
  await transactStorage(storage,journal,id,{...Object.fromEntries(staged),[WORKSPACE_BACKUP_KEY]:primary??JSON.stringify(workspace),[WORKSPACE_KEY]:JSON.stringify(next)},{[WORKSPACE_KEY]:primary,[WORKSPACE_BACKUP_KEY]:backup});
  return next;
}
