import {useState} from "react";
import {cadDocument} from "../../state/cadDocument";
import {filterProjectTargets,projectTargets,projectTreeGroups,type ProjectTarget} from "../projectTree";
import "../projectTree.css";
export function ProjectTreePanel({query,onNavigate,busy}:{query:string;onNavigate:(key:string)=>void;busy?:boolean}){
 const [closed,setClosed]=useState<Set<string>>(new Set()),[current,setCurrent]=useState("");
 const all=projectTargets(cadDocument),rows=filterProjectTargets(all,query);
 const navigate=(row:ProjectTarget)=>{if(row.unavailable||busy)return;setCurrent(row.key);onNavigate(row.key);};
 return <div className="project-tree" aria-label="Project navigation">
 {busy&&<p role="status">Finish the current frame operation before navigating.</p>}
 {projectTreeGroups.map(group=>{const children=rows.filter(r=>r.group===group),open=!!query||!closed.has(group);if(!children.length)return null;return <section key={group}>
 <button type="button" className="tree-root" aria-expanded={open} onClick={()=>setClosed(old=>{const next=new Set(old);next.has(group)?next.delete(group):next.add(group);return next;})}><span aria-hidden="true">{open?"⌄":"›"}</span><strong>{group}</strong><span className="tree-meta">{children.length}</span></button>
 {open&&<ul>{children.map(row=><li key={row.key}><button type="button" className="project-tree-target" data-project-target={row.key} aria-current={current===row.key?"location":undefined} disabled={!!row.unavailable||busy} title={`${row.name} · ${row.id} · ${row.unavailable??row.status}`} onClick={()=>navigate(row)}><span className="project-tree-name">{row.name}</span><small>{row.status}{row.unavailable?` · ${row.unavailable}`:""}</small></button></li>)}</ul>}
 </section>;})}
 {!rows.length&&<p role="status">{all.length?"No matching project items.":"Create a model, drawing or sheet to navigate this project."}</p>}
 </div>;
}
