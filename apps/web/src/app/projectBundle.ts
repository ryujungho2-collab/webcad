import {sceneHash,decodeSceneBytes} from "@agent-webcad/cad-document";
import {deserializeDocument,serializeDocument,type CadDocument} from "@agent-webcad/cad-document";
import {decodeRecoveryDocument,writeRecoveryCheckpoint} from "../state/documentRecovery";
import {projectStorage} from "./projectSession";
import {parseWorkspace,WORKSPACE_KEY,WORKSPACE_BACKUP_KEY,type Workspace} from "./projectWorkspaceStore";
import {transactStorage,type StorageJournal} from "./projectStorageTransactions";

export const MAX_BUNDLE_BYTES=16*1024*1024;
export type BundleEntry={id:string;title:string;document:CadDocument};
export type ProjectBundle={format:"agent-webcad-project-bundle";version:1;exportedAt:string;projects:BundleEntry[]};
export type RevisionDifference={section:string;added:number;removed:number;changed:number};
function contentKey(value:unknown):string {
  if(Array.isArray(value))return `[${value.map(contentKey).join(",")}]`;
  if(value&&typeof value==="object")return `{${Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${contentKey(v)}`).join(",")}}`;
  return JSON.stringify(value)??"null";
}
export function compareProjectRevisions(local:CadDocument,incoming:CadDocument):RevisionDifference[]{
  const sections=["canvases","objects","features","sketches","layers","artboards","rasterAssets","externalSceneAssets","componentLibrary","workPlanes","scenes"] as const;
  const rows:RevisionDifference[]=sections.map(section=>{
    const a=(local[section]??{}) as Record<string,unknown>,b=(incoming[section]??{}) as Record<string,unknown>;
    return {section,added:Object.keys(b).filter(k=>!(k in a)).length,removed:Object.keys(a).filter(k=>!(k in b)).length,changed:Object.keys(b).filter(k=>k in a&&contentKey(a[k])!==contentKey(b[k])).length};
  });
  const excluded=new Set<string>([...sections,"id","revision"]);
  const metadata=(doc:CadDocument)=>Object.fromEntries(Object.entries(doc).filter(([key])=>!excluded.has(key)));
  rows.push({section:"document settings & order",added:0,removed:0,changed:contentKey(metadata(local))===contentKey(metadata(incoming))?0:1});
  return rows;
}
async function validateAssets(document:CadDocument){
  for(const a of Object.values(document.externalSceneAssets??{}))if(await sceneHash(decodeSceneBytes(a))!==a.contentHash)throw Error(`GLB checksum mismatch: ${a.name}`);
  for(const asset of Object.values(document.rasterAssets??{})){
    const binary=atob(asset.dataUrl.split(",")[1]),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),n=>n.toString(16).padStart(2,"0")).join("");
    if(hash!==asset.contentHash||bytes.length!==asset.byteLength)throw Error(`Image source checksum mismatch: ${asset.name}.`);
  }
}
/** Both export and import validate the portable document and embedded source bytes. */
export async function parseProjectBundle(text:string):Promise<ProjectBundle>{
  if(new Blob([text]).size>MAX_BUNDLE_BYTES)throw Error("Project bundle exceeds 16 MiB.");
  const value=JSON.parse(text);
  if(!value||value.format!=="agent-webcad-project-bundle"||value.version!==1||typeof value.exportedAt!=="string"||!Array.isArray(value.projects)||!value.projects.length||value.projects.length>20)throw Error("Invalid project bundle. Select a version 1 bundle with 1–20 projects.");
  const ids=new Set<string>(),projects:BundleEntry[]=[];
  for(const entry of value.projects){
    if(!entry||typeof entry.id!=="string"||!/^(legacy|[a-z0-9-]{1,80})$/.test(entry.id)||ids.has(entry.id)||typeof entry.title!=="string"||!entry.title.trim()||entry.title.length>120||!entry.document)throw Error("Invalid or duplicate project identity in bundle.");
    ids.add(entry.id);
    const document=decodeRecoveryDocument(serializeDocument(entry.document));
    await validateAssets(document);
    projects.push({id:entry.id,title:entry.title,document});
  }
  return {format:value.format,version:1,exportedAt:value.exportedAt,projects};
}
export async function encodeProjectBundle(projects:BundleEntry[]){
  const text=JSON.stringify({format:"agent-webcad-project-bundle",version:1,exportedAt:new Date().toISOString(),projects});
  await parseProjectBundle(text);return text;
}
/** Keep incoming identities inside independent sessions; never overwrite a local editor or its Undo. */
export async function importProjectBundle(storage:Storage,workspace:Workspace,bundle:ProjectBundle,journal:StorageJournal):Promise<Workspace>{
  const checked=await parseProjectBundle(JSON.stringify(bundle));
  if(workspace.projects.length+checked.projects.length>200)throw Error("The workspace limit is 200 projects. Free space before importing this bundle.");
  const primary=storage.getItem(WORKSPACE_KEY),backup=storage.getItem(WORKSPACE_BACKUP_KEY);
  if(primary&&JSON.stringify(parseWorkspace(primary))!==JSON.stringify(parseWorkspace(JSON.stringify(workspace))))throw Error("Project list changed. Reopen the bundle review.");
  const staged=new Map<string,string>(),temporary={getItem:(key:string)=>staged.get(key)??null,setItem:(key:string,value:string)=>{staged.set(key,value);},removeItem:(key:string)=>{staged.delete(key);}};
  const projects=checked.projects.map(entry=>{
    const id=crypto.randomUUID(),document=deserializeDocument(serializeDocument(entry.document));document.id=`document-${id}`;
    writeRecoveryCheckpoint(projectStorage(temporary,id),document);
    return {id,title:`${entry.title.slice(0,104)} · imported`,closed:true,lastOpenedAt:Date.now()};
  });
  const next=parseWorkspace(JSON.stringify({...workspace,active:projects[0].id,projects:[...workspace.projects,...projects.map((p,i)=>({...p,closed:i!==0}))]}));
  // Refuse namespace collisions, including unlisted recovery copies.
  for(const project of projects)for(let i=0;i<storage.length;i++)if(storage.key(i)?.startsWith(`agent-webcad-project:${project.id}:`))throw Error("Generated project identity already exists. Retry importing.");
  await transactStorage(storage,journal,projects[0].id,{...Object.fromEntries(staged),[WORKSPACE_BACKUP_KEY]:primary??JSON.stringify(workspace),[WORKSPACE_KEY]:JSON.stringify(next)},{[WORKSPACE_KEY]:primary,[WORKSPACE_BACKUP_KEY]:backup},undefined,undefined,projects.map(p=>p.id));
  return next;
}
