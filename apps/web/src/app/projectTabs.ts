import type {Project,Workspace} from "./projectWorkspaceStore";

export function orderedOpenProjects(workspace:Workspace):Project[]{
  const open=workspace.projects.filter(p=>!p.closed);
  return [...open.filter(p=>p.pinned),...open.filter(p=>!p.pinned)];
}
export function pinProjectTab(workspace:Workspace,id:string):Workspace {
  const project=workspace.projects.find(p=>p.id===id&&!p.closed);
  if(!project)throw Error("Choose an open project to pin.");
  return {...workspace,projects:workspace.projects.map(p=>{if(p.id!==id)return p;const {pinned,...rest}=p;return pinned?rest:{...rest,pinned:true};})};
}
/** Move only within a pin group; closed records keep their slots and metadata. */
export function reorderProjectTab(workspace:Workspace,id:string,targetId:string,before:boolean):Workspace {
  const open=orderedOpenProjects(workspace),source=open.find(p=>p.id===id),target=open.find(p=>p.id===targetId);
  if(!source||!target)throw Error("Choose two open project tabs.");
  if(id===targetId)return workspace;
  if(!!source.pinned!==!!target.pinned)throw Error("Move within the pinned or unpinned group. Pin or unpin the project to change groups.");
  const next=open.filter(p=>p.id!==id),at=next.findIndex(p=>p.id===targetId);next.splice(at+(before?0:1),0,source);
  if(next.every((p,i)=>p.id===open[i].id))return workspace;
  let index=0;
  return {...workspace,projects:workspace.projects.map(p=>p.closed?p:next[index++])};
}
export function moveProjectTab(workspace:Workspace,id:string,direction:-1|1):Workspace {
  const group=orderedOpenProjects(workspace).filter(p=>!!p.pinned===!!workspace.projects.find(p=>p.id===id)?.pinned);
  const at=group.findIndex(p=>p.id===id),target=group[at+direction];
  return at<0||!target?workspace:reorderProjectTab(workspace,id,target.id,direction<0);
}
export function findOpenProjects(projects:Project[],query:string){
  const text=query.normalize("NFC").trim().toLocaleLowerCase();
  return projects.filter(p=>!p.closed&&(!text||`${p.title}\n${p.id}`.normalize("NFC").toLocaleLowerCase().includes(text)));
}
export function isProjectSearchShortcut(event:{key:string;altKey:boolean;shiftKey:boolean;ctrlKey:boolean;metaKey:boolean;isComposing:boolean;defaultPrevented:boolean;repeat:boolean}){
  return !event.defaultPrevented&&!event.isComposing&&!event.repeat&&event.altKey&&event.shiftKey&&!event.ctrlKey&&!event.metaKey&&event.key.toLowerCase()==="p";
}
