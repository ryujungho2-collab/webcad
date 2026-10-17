import type {CommandBus} from "@agent-webcad/cad-commands";
import {validateWorkspaceSections,type CadDocument} from "@agent-webcad/cad-document";
export function registerWorkspaceSectionCommands(bus:CommandBus,document:CadDocument){
 bus.registerHandler("upsert-workspace-section",command=>{
  if(command.type!=="upsert-workspace-section")return;
  const next=structuredClone(command.section),old=document.workspaceSections?.[next.id];
  if(old&&old.workPlane!==next.workPlane)throw Error("Create a separate work area for another plane.");
  if(JSON.stringify(old)===JSON.stringify(next))return {accepted:false,reason:"Work area is unchanged."};
  const delta=old?[next.origin[0]-old.origin[0],next.origin[1]-old.origin[1]]:[0,0];
  for(const id of next.frameIds){const b=document.artboards?.[id];if(!b?.frame||b.workPlane!==next.workPlane)throw Error("Choose existing drawing frames on the work area's plane.");if((delta[0]||delta[1])&&(b.locked||Object.values(document.frameLinks??{}).some(l=>l.toId===id&&l.fixed)))throw Error(`Frame ${b.name} is fixed or locked. Release the connection fixed setting or unlock it before moving the work area.`);}
  const sections=document.workspaceSections??={};
  // Reassignment and member ordering are part of the same proposal and Undo.
  for(const s of Object.values(sections))if(s.id!==next.id)s.frameIds=s.frameIds.filter(id=>!next.frameIds.includes(id));
  sections[next.id]=next;
  for(const id of next.frameIds){const b=document.artboards![id];b.origin=[b.origin[0]+delta[0],b.origin[1]+delta[1]];}
  validateWorkspaceSections(document);document.revision++;return next.id;
 });
 bus.registerHandler("delete-workspace-section",command=>{
  if(command.type!=="delete-workspace-section")return;
  if(!document.workspaceSections?.[command.sectionId])return {accepted:false,reason:"Work area no longer exists."};
  delete document.workspaceSections[command.sectionId];if(!Object.keys(document.workspaceSections).length)delete document.workspaceSections;
  document.revision++;
 });
}
