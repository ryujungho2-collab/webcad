import {useEffect,useRef,useState} from "react";
import type {Project} from "./projectWorkspaceStore";
import {findOpenProjects} from "./projectTabs";

export function ProjectTabSearch({projects,active,onSelect,onClose}:{projects:Project[];active:string;onSelect:(id:string)=>void;onClose:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null),input=useRef<HTMLInputElement>(null);
  const [query,setQuery]=useState(""),[index,setIndex]=useState(0),results=findOpenProjects(projects,query),chosen=results[Math.min(index,Math.max(0,results.length-1))];
  useEffect(()=>{dialog.current?.showModal();input.current?.focus();},[]);
  useEffect(()=>{if(chosen)document.getElementById(`project-search-${chosen.id}`)?.scrollIntoView({block:"nearest"});},[chosen?.id]);
  const select=(id:string)=>{onSelect(id);onClose();requestAnimationFrame(()=>document.getElementById(`project-tab-${id}`)?.focus());};
  return <dialog ref={dialog} className="project-tab-search" aria-label="Find open project" onCancel={e=>{e.preventDefault();onClose();}}>
    <header><strong>Find open project</strong><button aria-label="Close project search" onClick={onClose}>×</button></header>
    <label>Project name or ID<input ref={input} aria-label="Search open projects" role="combobox" aria-expanded="true" aria-controls="project-search-results" aria-autocomplete="list" aria-activedescendant={chosen?`project-search-${chosen.id}`:undefined} value={query}
      onChange={e=>{setQuery(e.target.value);setIndex(0);}} onKeyDown={e=>{
        if(e.nativeEvent.isComposing||e.keyCode===229)return;
        if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();setIndex(value=>results.length?(value+(e.key==="ArrowDown"?1:-1)+results.length)%results.length:0);}
        if(e.key==="Enter"){e.preventDefault();if(chosen)select(chosen.id);}
      }}/></label>
    <div id="project-search-results" role="listbox" aria-label="Matching open projects">{results.map(p=><button role="option" tabIndex={-1} id={`project-search-${p.id}`} key={p.id} aria-selected={chosen?.id===p.id} onClick={()=>select(p.id)}><span>{p.pinned?"◆ ":""}{p.title}</span><small>{p.id===active?"Active project":p.pinned?"Pinned":"Open"}</small></button>)}</div>
    {!results.length&&<p role="status">No matching open projects.</p>}
    <footer>{results.length} open projects · ↑↓ choose · Enter switch · Esc close</footer>
  </dialog>;
}
