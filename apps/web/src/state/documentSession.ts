import type { CadDocument } from "@agent-webcad/cad-document";
import { cadDocument } from "./cadDocument";

let generation=0;
let replacementGeneration=0;
const listeners=new Set<()=>void>();
export type DocumentVersion={documentId:string;revision:number;generation:number};
export function documentVersion(document:CadDocument=cadDocument):DocumentVersion {return {documentId:document.id,revision:document.revision,generation};}
/** Unlike revision/generation, this identity survives edits and Undo/Redo. */
export function documentSessionIdentity(){return JSON.stringify([cadDocument.id,replacementGeneration]);}
export function notifyDocumentChanged(replaced=false){generation++;if(replaced)replacementGeneration++;for(const listener of listeners)listener();}
export function subscribeDocumentChanges(listener:()=>void){listeners.add(listener);return ()=>{listeners.delete(listener);};}
export function sameDocumentVersion(version:DocumentVersion){const now=documentVersion();return now.documentId===version.documentId&&now.revision===version.revision&&now.generation===version.generation;}
