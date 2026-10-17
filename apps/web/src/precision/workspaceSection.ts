import type {CadDocument,CadWorkspaceSection} from "@agent-webcad/cad-document";
/** Include every member, including individually hidden frames, for group navigation. */
export function workspaceSectionBounds(document:CadDocument,s:CadWorkspaceSection){
 const old=document.workspaceSections?.[s.id],delta=old?[s.origin[0]-old.origin[0],s.origin[1]-old.origin[1]]:[0,0];
 const min:[number,number]=[...s.origin],max:[number,number]=[s.origin[0]+s.size[0],s.origin[1]+s.size[1]];
 for(const id of s.frameIds){const b=document.artboards?.[id];if(!b)continue;for(let a=0;a<2;a++){min[a]=Math.min(min[a],b.origin[a]+delta[a]);max[a]=Math.max(max[a],b.origin[a]+delta[a]+b.size[a]);}}
 return {origin:min,size:[max[0]-min[0],max[1]-min[1]] as [number,number]};
}
