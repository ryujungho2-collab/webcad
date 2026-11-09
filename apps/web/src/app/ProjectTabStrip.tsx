import {useEffect,useRef,useState,type ReactNode} from "react";
import type {Project} from "./projectWorkspaceStore";
import {isProjectSearchShortcut} from "./projectTabs";
import {isCadKeyboardBlocked} from "../input/shortcutRouter";
import {ProjectTabSearch} from "./ProjectTabSearch";

type Status={modified:boolean;recoveryFailed:boolean;localSaveStatus:string;fileDownloadStatus:string};
export function ProjectTabStrip({projects,active,statuses,disabled,searchRequest,onActivate,onRename,onClose,onPin,onMove,onDrop,leadingAction}:{
  leadingAction?:ReactNode;
  projects:Project[];active:string;statuses:Record<string,Status>;disabled:boolean;searchRequest:number;
  onActivate:(id:string)=>void;onRename:(project:Project)=>void;onClose:(id:string)=>void;onPin:(id:string)=>void;
  onMove:(id:string,direction:-1|1)=>void;onDrop:(id:string,target:string,before:boolean)=>void;
}){
  const list=useRef<HTMLDivElement>(null),searchButton=useRef<HTMLButtonElement>(null),previousRequest=useRef(searchRequest);
  const [search,setSearch]=useState(false),[notice,setNotice]=useState(""),[edges,setEdges]=useState({left:false,right:false});
  const drag=useRef<{id:string;pointer:number;x:number;y:number;target?:string;before?:boolean;moving:boolean}|null>(null);
  const [dragging,setDragging]=useState(false),[drop,setDrop]=useState<{id:string;before:boolean}|null>(null);
  const measure=()=>{const el=list.current;if(el)setEdges({left:el.scrollLeft>1,right:el.scrollLeft+el.clientWidth<el.scrollWidth-1});};
  useEffect(()=>{const observer=new ResizeObserver(measure);if(list.current)observer.observe(list.current);measure();return()=>observer.disconnect();},[]);
  useEffect(()=>{measure();},[projects.map(p=>`${p.id}:${p.title}:${!!p.pinned}`).join("\0")]);
  useEffect(()=>{document.getElementById(`project-tab-${active}`)?.scrollIntoView({block:"nearest",inline:"nearest"});measure();},[active]);
  useEffect(()=>{if(previousRequest.current!==searchRequest&&!disabled)setSearch(true);previousRequest.current=searchRequest;},[searchRequest,disabled]);
  useEffect(()=>{
    const shortcut=(e:KeyboardEvent)=>{if(disabled||!isProjectSearchShortcut(e)||isCadKeyboardBlocked(e.target))return;e.preventDefault();setSearch(true);};
    window.addEventListener("keydown",shortcut);return()=>window.removeEventListener("keydown",shortcut);
  },[disabled]);
  function focus(id:string){requestAnimationFrame(()=>{document.getElementById(`project-tab-${id}`)?.focus();document.getElementById(`project-tab-${id}`)?.scrollIntoView({block:"nearest",inline:"nearest"});measure();});}
  function finish(cancel=false){
    const current=drag.current;drag.current=null;setDragging(false);setDrop(null);
    if(!cancel&&current?.moving&&current.target){onDrop(current.id,current.target,current.before??true);focus(current.id);}
  }
  useEffect(()=>{
    if(!dragging)return;
    const cancel=(e:KeyboardEvent)=>{if(e.key==="Escape"){e.preventDefault();finish(true);}};
    const blur=()=>finish(true);
    window.addEventListener("keydown",cancel,true);window.addEventListener("blur",blur);
    return()=>{window.removeEventListener("keydown",cancel,true);window.removeEventListener("blur",blur);};
  },[dragging]);
  return <>
    <div className="project-tab-navigation">
      {leadingAction}
      <button aria-label="Scroll project tabs left" title="Scroll tabs left" disabled={!edges.left} onClick={()=>list.current?.scrollBy({left:-240,behavior:"smooth"})}>‹</button>
      <div ref={list} className="project-tabs" role="tablist" aria-label="Projects" onScroll={measure}>
        {projects.map(p=><div key={p.id} data-project-tab-id={p.id} data-pinned={!!p.pinned} data-drop={drop?.id===p.id?(drop.before?"before":"after"):undefined} className={`project-tab${p.id===active?" project-tab-active":""}`}>
          <button className="project-tab-move" aria-label={`Move project ${p.title}`} title="Drag to reorder within this group · Alt Shift ←/→ on the tab" disabled={disabled}
            onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);drag.current={id:p.id,pointer:e.pointerId,x:e.clientX,y:e.clientY,moving:false};}}
            onPointerMove={e=>{
              const current=drag.current;if(!current||current.pointer!==e.pointerId)return;
              if(!current.moving&&Math.hypot(e.clientX-current.x,e.clientY-current.y)<5)return;
              current.moving=true;setDragging(true);
              const target=[...list.current!.querySelectorAll<HTMLElement>("[data-project-tab-id]")].find(el=>{const r=el.getBoundingClientRect();return e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom;});
              current.target=target?.dataset.projectTabId;current.before=target?e.clientX<target.getBoundingClientRect().left+target.getBoundingClientRect().width/2:true;
              setDrop(target?{id:current.target!,before:current.before}:null);
              const bounds=list.current!.getBoundingClientRect();if(e.clientX<bounds.left+25)list.current!.scrollBy(-20,0);else if(e.clientX>bounds.right-25)list.current!.scrollBy(20,0);
            }} onPointerUp={()=>finish()} onPointerCancel={()=>finish(true)} onLostPointerCapture={()=>finish(true)} onKeyDown={e=>{if(e.key==="Escape"){e.preventDefault();finish(true);}}}>⠿</button>
          <button role="tab" id={`project-tab-${p.id}`} aria-controls={`project-panel-${p.id}`} aria-selected={p.id===active} tabIndex={p.id===active?0:-1} disabled={disabled}
            onClick={()=>onActivate(p.id)} onDoubleClick={()=>onRename(p)} title={`${p.title} · F2 or double-click to rename · ${statuses[p.id]?.localSaveStatus??"Not loaded"} · ${statuses[p.id]?.fileDownloadStatus??"File download status unavailable"}`}
            onKeyDown={e=>{
              if(e.nativeEvent.isComposing||e.keyCode===229||e.repeat)return;
              if(e.altKey&&e.shiftKey&&!e.ctrlKey&&!e.metaKey&&(e.key==="ArrowLeft"||e.key==="ArrowRight")){e.preventDefault();onMove(p.id,e.key==="ArrowLeft"?-1:1);focus(p.id);setNotice(`Moved ${p.title}`);return;}
              if(e.altKey||e.ctrlKey||e.metaKey||e.shiftKey)return;
              if(e.key==="F2"){e.preventDefault();onRename(p);return;}
              const at=projects.findIndex(item=>item.id===p.id),index=e.key==="ArrowRight"?(at+1)%projects.length:e.key==="ArrowLeft"?(at+projects.length-1)%projects.length:e.key==="Home"?0:e.key==="End"?projects.length-1:-1;
              if(index>=0){e.preventDefault();onActivate(projects[index].id);focus(projects[index].id);}
            }}>
            {statuses[p.id]?.recoveryFailed?<span className="project-dirty" aria-label="Local recovery failed">!</span>:statuses[p.id]?.modified&&<span className="project-dirty" aria-label="Local changes pending">●</span>}{p.title}</button>
          <button className="project-tab-pin" aria-label={`${p.pinned?"Unpin":"Pin"} project ${p.title}`} aria-pressed={!!p.pinned} title={p.pinned?"Unpin project":"Pin project to the start"} disabled={disabled} onClick={()=>{onPin(p.id);focus(p.id);}}>{p.pinned?"◆":"◇"}</button>
          <button aria-label={`Close project ${p.title}`} disabled={disabled} title="Close after saving locally; reopening starts fresh Undo. This does not download a file." onClick={()=>onClose(p.id)}>×</button>
        </div>)}
      </div>
      <button aria-label="Scroll project tabs right" title="Scroll tabs right" disabled={!edges.right} onClick={()=>list.current?.scrollBy({left:240,behavior:"smooth"})}>›</button>
    </div>
    <button ref={searchButton} aria-label="Find open project" title="Find open project · Alt Shift P" disabled={disabled||!projects.length} onClick={()=>setSearch(true)}>Find tab</button>
    <span className="project-tab-announcement" role="status" aria-live="polite">{notice}</span>
    {dragging&&<div className="project-tab-drag-shield" aria-hidden="true"/>}
    {search&&<ProjectTabSearch projects={projects} active={active} onSelect={onActivate} onClose={()=>{setSearch(false);requestAnimationFrame(()=>searchButton.current?.focus());}}/>}
  </>;
}
