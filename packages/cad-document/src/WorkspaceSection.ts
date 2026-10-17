import type {CadDocument} from "./CadDocument";
export type CadWorkspaceSection = {
 id:string; name:string; color:string; workPlane:"XY"|"XZ"|"YZ";
 origin:[number,number]; size:[number,number]; frameIds:string[]; collapsed:boolean;
};
export function validWorkspaceSection(value:unknown):value is CadWorkspaceSection {
 if(!value||typeof value!=="object")return false;
 const s=value as CadWorkspaceSection;
 return typeof s.id==="string"&&s.id.length>0&&typeof s.name==="string"&&s.name.trim().length>0&&s.name.length<=200&&typeof s.color==="string"&&/^#[0-9a-f]{6}$/i.test(s.color)&&["XY","XZ","YZ"].includes(s.workPlane)&&Array.isArray(s.origin)&&s.origin.length===2&&s.origin.every(Number.isFinite)&&Array.isArray(s.size)&&s.size.length===2&&s.size.every(n=>Number.isFinite(n)&&n>0)&&Array.isArray(s.frameIds)&&s.frameIds.length<=1000&&s.frameIds.every(id=>typeof id==="string"&&id.length>0)&&new Set(s.frameIds).size===s.frameIds.length&&typeof s.collapsed==="boolean";
}
export function validateWorkspaceSections(document:CadDocument):void {
 const sections=document.workspaceSections;
 if(sections===undefined)return;
 if(!sections||typeof sections!=="object"||Array.isArray(sections))throw Error("Invalid workspace section collection.");
 const owned=new Set<string>();
 for(const [id,s] of Object.entries(sections)){
  if(!validWorkspaceSection(s)||s.id!==id)throw Error(`Invalid workspace section: ${id}`);
  for(const frameId of s.frameIds){const b=document.artboards?.[frameId];if(!b?.frame||b.workPlane!==s.workPlane||owned.has(frameId))throw Error(`Invalid workspace section frame ownership: ${frameId}`);owned.add(frameId);}
 }
}
/** Screen-only filtering. Export uses the artboard's own visible flag. */
export function workspaceFrameVisible(document:CadDocument,frameId:string):boolean {
 return !Object.values(document.workspaceSections??{}).some(s=>s.collapsed&&s.frameIds.includes(frameId));
}
