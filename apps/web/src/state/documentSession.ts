import type { CadDocument } from "@agent-webcad/cad-document";
import { cadDocument } from "./cadDocument";

let generation=0;
const listeners=new Set<()=>void>();
export type DocumentVersion={documentId:string;revision:number;generation:number};
export function documentVersion(document:CadDocument=cadDocument):DocumentVersion {return {documentId:document.id,revision:document.revision,generation};}
export function notifyDocumentChanged(){generation++;for(const listener of listeners)listener();}
export function subscribeDocumentChanges(listener:()=>void){listeners.add(listener);return ()=>{listeners.delete(listener);};}
export function sameDocumentVersion(version:DocumentVersion){const now=documentVersion();return now.documentId===version.documentId&&now.revision===version.revision&&now.generation===version.generation;}
