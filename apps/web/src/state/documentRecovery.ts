import { deserializeDocument,serializeDocument,type CadDocument,type CadRasterAsset } from "@agent-webcad/cad-document";
import { assertConstructionEvaluation } from "../precision/constructionGeometry";
import { assertAngularEvaluation } from "../precision/angularDimensionSource";
import {gzipSync,gunzipSync,strToU8,strFromU8} from "fflate";
const decodeCheckpoint = (data: string) => { const document = deserializeDocument(data); assertConstructionEvaluation(document); assertAngularEvaluation(document); return document; };
export const decodeRecoveryDocument = decodeCheckpoint;
export const DOCUMENT_CACHE_KEY="agent-webcad-working-document";
export const DOCUMENT_BACKUP_KEY=`${DOCUMENT_CACHE_KEY}-backup`;
export const DOCUMENT_RASTER_ASSET_PREFIX="agent-webcad-recovery-asset-";
type RecoveryStorage=Pick<Storage,"getItem"|"setItem"> & Partial<Pick<Storage,"removeItem">>;
type RecoveryEnvelope={format:"agent-webcad-recovery";version:1;document:CadDocument;assetIds:string[]};
type CompressedRecovery={format:"agent-webcad-recovery-compressed";version:1;encoding:"gzip-base64";decodedBytes:number;data:string};
const MAX_CHECKPOINT_BYTES=64*1024*1024;
function unpackCheckpoint(data:string):string{
 const value=JSON.parse(data) as Partial<CompressedRecovery>;
 if(value.format!=="agent-webcad-recovery-compressed")return data;
 if(value.version!==1||value.encoding!=="gzip-base64"||typeof value.data!=="string"||!Number.isInteger(value.decodedBytes)||value.decodedBytes!<=0||value.decodedBytes!>MAX_CHECKPOINT_BYTES)throw Error("Invalid compressed recovery checkpoint.");
 const bytes=Uint8Array.from(atob(value.data),c=>c.charCodeAt(0));
 if(bytes.length<18||new DataView(bytes.buffer).getUint32(bytes.length-4,true)!==value.decodedBytes)throw Error("Compressed recovery size does not match its header.");
 const decoded=gunzipSync(bytes,{out:new Uint8Array(value.decodedBytes)});return strFromU8(decoded);
}
function packCheckpoint(data:string):string{
 if(data.length<128*1024)return data;
 const bytes=strToU8(data);if(bytes.length>MAX_CHECKPOINT_BYTES)throw Error("Recovery checkpoint exceeds 64 MiB. Save a WebCAD file.");
 const compressed=gzipSync(bytes,{level:1,mtime:0});let binary="";
 for(let i=0;i<compressed.length;i+=32768)binary+=String.fromCharCode(...compressed.subarray(i,i+32768));
 return JSON.stringify({format:"agent-webcad-recovery-compressed",version:1,encoding:"gzip-base64",decodedBytes:bytes.length,data:btoa(binary)} satisfies CompressedRecovery);
}
export type RecoveryStatus={state:"idle"|"pending"|"saved"|"failed"|"recovered";message?:string;fingerprint?:string;revision?:number;documentId?:string};
let status:RecoveryStatus={state:"idle"};
const listeners=new Set<(status:RecoveryStatus)=>void>();
export function recoveryStatus(){return status;}
export function reportRecoveryStatus(value:RecoveryStatus){status=value;for(const listener of listeners)listener(value);}
export function subscribeRecoveryStatus(listener:(status:RecoveryStatus)=>void){listeners.add(listener);listener(status);return ()=>{listeners.delete(listener);};}

function assetKey(id:string){return `${DOCUMENT_RASTER_ASSET_PREFIX}${id}`;}
function makeCheckpoint(storage:Pick<Storage,"getItem"|"setItem">,data:string):CadDocument {
  data=unpackCheckpoint(data);
  const parsed=JSON.parse(data) as Partial<RecoveryEnvelope>;
  if(parsed.format!=="agent-webcad-recovery")return decodeCheckpoint(data);
  if(parsed.version!==1||!parsed.document||!Array.isArray(parsed.assetIds)||!parsed.assetIds.every(id=>typeof id==="string"&&id.startsWith("asset-")))throw new Error("Invalid image recovery checkpoint.");
  const document=structuredClone(parsed.document);
  const assets:Record<string,CadRasterAsset>={};
  for(const id of parsed.assetIds){
    const saved=storage.getItem(assetKey(id));
    if(!saved)throw new Error(`Image recovery source is missing: ${id}.`);
    const asset=JSON.parse(saved) as CadRasterAsset;
    if(asset.id!==id)throw new Error(`Image recovery source does not match its identity: ${id}.`);
    assets[id]=asset;
  }
  document.rasterAssets=assets;
  return decodeCheckpoint(serializeDocument(document));
}
function assetIds(data:string|null):string[]{
  if(!data)return [];
  try{const value=JSON.parse(unpackCheckpoint(data)) as {format?:string;assetIds?:unknown;document?:CadDocument};
    if(value.format==="agent-webcad-recovery"&&Array.isArray(value.assetIds))return value.assetIds.filter((id):id is string=>typeof id==="string");
    if(value.format==="agent-webcad"&&value.document?.rasterAssets)return Object.keys(value.document.rasterAssets);
  }catch{/* Damaged checkpoints do not own recoverable assets. */}
  return [];
}
/** Prune only sources absent from both independently validated recovery copies. */
export function referencedRecoveryAssetIds(storage:Pick<Storage,"getItem"|"setItem">):Set<string>{
  const owned=new Set<string>();
  for(const key of [DOCUMENT_CACHE_KEY,DOCUMENT_BACKUP_KEY]){
    const data=storage.getItem(key);if(!data)continue;
    makeCheckpoint(storage,data);
    for(const id of assetIds(data))owned.add(id);
  }
  return owned;
}
function checkpointData(storage:Pick<Storage,"getItem"|"setItem">,document:CadDocument):string{
  const full=serializeDocument(document);decodeCheckpoint(full);
  if(!document.rasterAssets||!Object.keys(document.rasterAssets).length)return full;
  for(const asset of Object.values(document.rasterAssets))storage.setItem(assetKey(asset.id),JSON.stringify(asset));
  const metadata=structuredClone(document);delete metadata.rasterAssets;
  return JSON.stringify({format:"agent-webcad-recovery",version:1,document:metadata,assetIds:Object.keys(document.rasterAssets)} satisfies RecoveryEnvelope);
}

/** Keep portable file data self-contained, but store each recovery image only once outside current/backup metadata. */
export function writeRecoveryCheckpoint(storage:RecoveryStorage,document:CadDocument){
  const data=packCheckpoint(checkpointData(storage,document));makeCheckpoint(storage,data);
  const current=storage.getItem(DOCUMENT_CACHE_KEY);
  const previousBackup=storage.getItem(DOCUMENT_BACKUP_KEY);
  if(current){
    let valid=false;try{makeCheckpoint(storage,current);valid=true;}catch{/* Keep the existing good backup. */}
    if(valid&&current!==data)storage.setItem(DOCUMENT_BACKUP_KEY,packCheckpoint(unpackCheckpoint(current)));
  }
  storage.setItem(DOCUMENT_CACHE_KEY,data);
  // If current was damaged, the old valid backup survives. Its image sources must survive too.
  const referenced=new Set([...assetIds(data),...assetIds(storage.getItem(DOCUMENT_BACKUP_KEY))]);
  for(const id of new Set([...assetIds(current),...assetIds(previousBackup)]))if(!referenced.has(id))storage.removeItem?.(assetKey(id));
}

export function readRecoveryCheckpoint(storage:Pick<Storage,"getItem"|"setItem">):{document:CadDocument;recovered:boolean}|null {
  const current=storage.getItem(DOCUMENT_CACHE_KEY),backup=storage.getItem(DOCUMENT_BACKUP_KEY);
  if(!current&&!backup)return null;
  if(current)try{return {document:makeCheckpoint(storage,current),recovered:false};}catch{/* Try the previous valid checkpoint. */}
  if(backup)try{return {document:makeCheckpoint(storage,backup),recovered:true};}catch{/* Report unusable checkpoints without replacing the document. */}
  throw new Error("No valid recovery checkpoint. Open a saved WebCAD file.");
}
