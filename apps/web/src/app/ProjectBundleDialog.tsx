import {useRef,useState} from "react";
import type {CadDocument} from "@agent-webcad/cad-document";
import {useModalDialog} from "../ui/useModalDialog";
import type {Workspace} from "./projectWorkspaceStore";
import {compareProjectRevisions,encodeProjectBundle,MAX_BUNDLE_BYTES,parseProjectBundle,type ProjectBundle} from "./projectBundle";

type Props={workspace:Workspace;onClose:()=>void;snapshot:(id:string)=>Promise<CadDocument>;onImport:(bundle:ProjectBundle)=>Promise<void>;download:(text:string,name:string)=>void};
export function ProjectBundleDialog({workspace,onClose,snapshot,onImport,download}:Props){
 const dialog=useModalDialog(true,"button"),file=useRef<HTMLInputElement>(null);
 const [selected,setSelected]=useState([workspace.active].filter(Boolean)),[bundle,setBundle]=useState<ProjectBundle|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [targets,setTargets]=useState<Record<string,string>>({}),[comparisons,setComparisons]=useState<Record<string,{local:CadDocument;rows:ReturnType<typeof compareProjectRevisions>}>>({}),[ack,setAck]=useState(false);
 async function run(task:()=>Promise<void>){if(busy)return;setBusy(true);setError("");setNotice("");try{await task();}catch(reason){setError(reason instanceof Error?reason.message:String(reason));}finally{setBusy(false);}}
 async function open(value?:File){if(!value)return;setBundle(null);setComparisons({});setTargets({});setAck(false);await run(async()=>{if(value.size>MAX_BUNDLE_BYTES)throw Error("Project bundle exceeds 16 MiB.");const next=await parseProjectBundle(await value.text());setBundle(next);setTargets(Object.fromEntries(next.projects.map(p=>[p.id,workspace.projects.some(local=>local.id===p.id)?p.id:""])));});}
 async function compare(id:string,target:string){setTargets(prev=>({...prev,[id]:target}));setComparisons(prev=>{const next={...prev};delete next[id];return next;});if(!target)return;await run(async()=>{const local=await snapshot(target),incoming=bundle!.projects.find(p=>p.id===id)!.document;setComparisons(prev=>({...prev,[id]:{local,rows:compareProjectRevisions(local,incoming)} }));});}
 return <dialog ref={dialog} className="project-bundle-dialog" aria-label="Share project bundle" onCancel={event=>{if(busy)event.preventDefault();else onClose();}}>
  <h2>Share project bundle · 프로젝트 묶음</h2><p>Share portable projects with embedded images. Import creates independent copies and preserves your existing editors.</p>
  <fieldset disabled={busy}><legend>Export selected projects</legend><div className="project-bundle-list">{workspace.projects.map(project=><label key={project.id}><input type="checkbox" aria-label={`Include project ${project.title}`} checked={selected.includes(project.id)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,project.id]:ids.filter(id=>id!==project.id))}/>{project.title}{project.closed?" · closed":" · open"}</label>)}</div>
  <p>Up to 20 projects / 16 MiB. Open editors provide a current revision snapshot; closed projects use their saved checkpoint.</p>
  <button disabled={!selected.length||selected.length>20} onClick={()=>void run(async()=>{const projects=[];for(const id of selected){const project=workspace.projects.find(p=>p.id===id)!;projects.push({id,title:project.title,document:await snapshot(id)});}download(await encodeProjectBundle(projects),"Projects.webcad.bundle.json");setNotice(`Download started for ${projects.length} projects. Verify completion in your browser.`);})}>Download project bundle</button>
  </fieldset>
  <fieldset disabled={busy}><legend>Import & review</legend><input ref={file} hidden type="file" accept=".json,.webcad.bundle.json" aria-label="Open project bundle file" onChange={e=>{const value=e.target.files?.[0];e.target.value="";void open(value);}}/><button onClick={()=>file.current?.click()}>Open project bundle</button>
  {bundle&&<><p>{bundle.projects.length} projects · Exported {bundle.exportedAt}</p>{bundle.projects.map(project=>{const comparison=comparisons[project.id];return <section key={project.id} className="project-bundle-entry" aria-label={`Review project ${project.title}`}><h3>{project.title}</h3><p>Incoming revision {project.document.revision} · {Object.keys(project.document.objects).length} objects · {Object.keys(project.document.rasterAssets??{}).length} images</p>{workspace.projects.some(p=>p.id===project.id)&&<p className="property-hint">Project ID already exists. The import will receive a new project and document ID.</p>}
  <label>Compare with local project<select aria-label={`Compare revision ${project.title}`} value={targets[project.id]??""} onChange={e=>void compare(project.id,e.target.value)}><option value="">Choose local revision</option>{workspace.projects.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
  {targets[project.id]&&!comparison&&<button onClick={()=>void compare(project.id,targets[project.id])}>Compare revisions</button>}
  {comparison&&<><p>Local revision {comparison.local.revision} → incoming revision {project.document.revision}. Revision numbers alone do not establish ancestry.</p><table><caption>Content differences by identity</caption><thead><tr><th>Section</th><th>Added</th><th>Removed</th><th>Changed</th></tr></thead><tbody>{comparison.rows.map(row=><tr key={row.section}><th>{row.section}</th><td>{row.added}</td><td>{row.removed}</td><td>{row.changed}</td></tr>)}</tbody></table></>}
  </section>;})}
  <label><input aria-label="Acknowledge independent project copies" type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>Import all projects as new copies. Local projects stay intact; no automatic merge or overwrite.</label>
  <button disabled={!ack} onClick={()=>void run(async()=>{await onImport(bundle);setBundle(null);setAck(false);setNotice("Project bundle imported. The first copy is open; other copies are available in Closed projects.");})}>Import project copies</button></>}
  </fieldset>
  {busy&&<p role="status">Preparing project snapshots and storage…</p>}{notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
  <div className="property-actions"><button disabled={busy} onClick={onClose}>Close bundle sharing</button></div>
 </dialog>;
}
