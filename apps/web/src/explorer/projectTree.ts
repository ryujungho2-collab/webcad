import {canvasTarget,canvasTargetKey,workspaceFrameVisible,type CadDocument} from "@agent-webcad/cad-document";

export type ProjectTarget = {key:string; id:string; name:string; group:string; objectIds:string[]; workspace:"2d"|"3d"; plane?:"XY"|"XZ"|"YZ"; artboardId?:string; canvasId?:string; status:string; unavailable?:string};
const groups = ["Model", "Plans and projections", "Sections", "Details", "Sheets", "Frames and drawings"];
export const projectTreeGroups = groups;
/** Derived references only: navigation never creates or modifies document entities. */
export function projectTargets(doc:CadDocument):ProjectTarget[] {
 const rows:ProjectTarget[] = [], p=doc.modelPresentation;
 const add=(row:Omit<ProjectTarget,"status"> & {status?:string})=>{
  const ids=row.objectIds.filter(id=>!!doc.objects[id]);
  const visible=ids.filter(id=>doc.objects[id].visible && doc.layers[doc.objects[id].layerId]?.visible!==false);
  const board=row.artboardId?doc.artboards?.[row.artboardId]:undefined;
  const unavailable=row.canvasId?undefined:row.artboardId?(!board?"Missing frame":!board.visible?"Frame is hidden":!workspaceFrameVisible(doc,board.id)?"Workspace section is collapsed":undefined):!ids.length?"No existing output":!visible.length?"Target is hidden":undefined;
  const missing=ids.length!==row.objectIds.length;
  rows.push({...row,objectIds:ids,status:missing?"Missing references":row.status??"Ready",unavailable});
 };
 const derived=new Set<string>();
 for(const view of Object.values(p?.projections??{})){
  const ids=Object.values(view.outputs).map(o=>o.objectId);ids.forEach(id=>derived.add(id));
  add({key:`projection:${view.id}`,id:view.id,name:view.name,group:groups[1],objectIds:ids,workspace:"2d",plane:"XY",status:view.status==="unresolved"?`Needs update${view.reason?": "+view.reason:""}`:"Ready"});
 }
 for(const view of Object.values(p?.sections??{})){
  const ids=[...Object.values(view.outputs),...Object.values(view.decorations??{})].map(o=>o.objectId);ids.forEach(id=>derived.add(id));
  add({key:`section:${view.id}`,id:view.id,name:view.name,group:groups[2],objectIds:ids,workspace:"2d",plane:"XY",status:view.status==="unresolved"?`Needs update${view.reason?": "+view.reason:""}`:"Ready"});
 }
 const sheets=new Set<string>();
 for(const sheet of Object.values(p?.sheets??{})){
  sheets.add(sheet.artboardId);derived.add(sheet.titleId);for(const id of sheet.publication?.frameIds??[])derived.add(id);
  add({key:`sheet:${sheet.id}`,id:sheet.id,name:sheet.name,group:groups[4],objectIds:[],workspace:"2d",artboardId:sheet.artboardId,status:`1:${sheet.denominator}${sheet.publication?` · ${sheet.publication.page}/${sheet.publication.pageCount}`:""}`});
 }
 const details=new Set(Object.values(doc.frameLinks??{}).filter(l=>l.reference.kind==="detail").map(l=>l.toId));
 for(const board of Object.values(doc.artboards??{}))if(!sheets.has(board.id))add({key:`frame:${board.id}`,id:board.id,name:board.name,group:details.has(board.id)?groups[3]:groups[5],objectIds:[],workspace:"2d",artboardId:board.id,status:board.locked?"Locked":"Ready"});
 const features=new Map(Object.values(doc.features).map(f=>[f.output,f]));
 for(const id of doc.rootObjects){const o=doc.objects[id];if(!o||derived.has(id))continue;const f=features.get(id),drawing=!!f&&["drawing","drafting","dimension","image"].includes(f.type);add({key:`object:${id}`,id,name:o.name,group:drawing?groups[5]:groups[0],objectIds:[id],workspace:drawing?"2d":"3d",plane:drawing&&["XY","XZ","YZ"].includes(String(f.params.workPlane))?f.params.workPlane as "XY"|"XZ"|"YZ":undefined,status:doc.layers[o.layerId]?.locked?"Locked":"Ready"});}
 for(const canvas of Object.values(doc.canvases??{})){
  add({key:`canvas:${canvas.id}`,id:canvas.id,name:canvas.name,group:"Canvases",objectIds:[],workspace:"2d",plane:canvas.workPlane,canvasId:canvas.id,status:`${canvas.units}${canvas.locked?" · Locked":""}`});
  for(const member of canvas.members){if(member.kind==="canvas")continue;
   const target=canvasTarget(doc,member);if(!target)continue;
   const existing=rows.find(r=>r.key===`${member.kind}:${member.id}`||member.kind==="artboard"&&r.artboardId===member.id);
   const f=member.kind==="object"?features.get(member.id):undefined;
   add({key:`canvas-member:${canvas.id}:${canvasTargetKey(member)}`,id:member.id,name:target.name,group:"Canvases",objectIds:existing?.objectIds??target.objectIds,workspace:existing?.workspace??(member.kind==="object"&&f&&!["drawing","drafting","dimension","image"].includes(f.type)?"3d":"2d"),plane:existing?.plane??target.workPlane,artboardId:existing?.artboardId??target.artboardIds[0],...!target.objectIds.length&&!target.artboardIds.length?{canvasId:canvas.id}:{},status:`${member.relation} · ${target.units}`});
  }
 }
 return rows;
}
export function filterProjectTargets(rows:ProjectTarget[],query:string){const q=query.trim().toLocaleLowerCase();return rows.filter(r=>!q||`${r.name} ${r.id} ${r.group} ${r.status} ${r.unavailable??""}`.toLocaleLowerCase().includes(q));}
