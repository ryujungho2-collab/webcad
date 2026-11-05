import type {AssemblyJoint,CadObjectTransform} from "@agent-webcad/cad-document";
export type AssemblyPreview={documentId:string;revision:number;highlightIds?:string[];joint?:AssemblyJoint|null;poses:Record<string,CadObjectTransform>};
let value:AssemblyPreview|null=null;const listeners=new Set<()=>void>();
export const assemblyPreview=()=>value;
export function setAssemblyPreview(next:AssemblyPreview|null){value=next;for(const fn of listeners)fn();}
export function subscribeAssemblyPreview(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};}

// A reviewed preview belongs to one document generation, including same-revision reloads.
import {subscribeDocumentChanges} from "./documentSession";
subscribeDocumentChanges(()=>setAssemblyPreview(null));

let selected:{documentId:string;jointId:string}|null=null;
export const selectedAssemblyJoint=()=>selected;
export function selectAssemblyJoint(value:typeof selected){selected=value;for(const fn of listeners)fn();}
