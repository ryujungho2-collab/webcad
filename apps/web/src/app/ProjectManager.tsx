import { useEffect, useMemo, useRef, useState } from "react";
import { inspectProjectStorage, portableProjectAsync, unusedProjectAssetKeys, type ProjectStorageRow } from "./projectManagerStore";
import { projectErrorMessage } from "./projectSession";
import type { Workspace } from "./projectWorkspaceStore";

export function storageSize(bytes: number) { return bytes >= 1024*1024 ? `${(bytes/1024/1024).toFixed(2)} MiB` : `${Math.ceil(bytes/1024)} KiB`; }
type Props = { workspace: Workspace; statuses: Record<string,{localSaveStatus:string}>; busy: boolean; notice?:string;
  onClose:()=>void; onOpen:(id:string)=>void; onCloseProject:(id:string)=>void; onExport:(id:string,title:string)=>Promise<string>;
  onDelete:(id:string)=>Promise<void>; onClean:(id:string)=>Promise<number>; onRecover:(id:string)=>void|Promise<void>; onRefresh:()=>void|Promise<void>; onDownloadRecovery:()=>void };

export function ProjectManager(props: Props) {
  const dialog=useRef<HTMLDialogElement>(null),[query,setQuery]=useState(""),[filter,setFilter]=useState("all"),[refresh,setRefresh]=useState(0);
  const [selected,setSelected]=useState<string|null>(null),[confirmation,setConfirmation]=useState<"delete"|"clean"|null>(null),[confirmed,setConfirmed]=useState(false);
  const [localBusy,setLocalBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
  const [detail,setDetail]=useState<{sourceId?:string;revision?:number;unused?:number;error?:string;cleanupError?:string;recovered?:boolean}>({});
  const [estimate,setEstimate]=useState<{usage?:number;quota?:number}>({});
  const inventory=useMemo(()=>{try{return {...inspectProjectStorage(localStorage,props.workspace),error:""};}catch(reason){return {rows:[] as ProjectStorageRow[],areaBytes:0,projectBytes:0,metadataBytes:0,error:projectErrorMessage(reason,"Storage could not be read.")};}},[props.workspace,refresh]);
  const busy=localBusy||props.busy,row=inventory.rows.find(item=>item.id===selected);
  const rows=inventory.rows.filter(item=> (filter==="all"||filter==="closed"&&item.closed&&!item.unlisted||filter==="open"&&!item.closed||filter==="unlisted"&&item.unlisted)
    &&`${item.title} ${item.id}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a,b)=>(b.lastOpenedAt??0)-(a.lastOpenedAt??0)||a.title.localeCompare(b.title));
  useEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close();},[]);
  useEffect(()=>{let disposed=false;void navigator.storage?.estimate?.().then(value=>{if(!disposed)setEstimate(value);}).catch(()=>{});return()=>{disposed=true;};},[refresh]);
  useEffect(()=>{
    setConfirmation(null);setConfirmed(false);setDetail({});
    if(!selected)return;
    let disposed=false;void(async()=>{try{
      const portable=await portableProjectAsync(localStorage,selected,row?.title??selected);
      const parsed=JSON.parse(portable.text) as {document:{id:string}};
      let unused:number|undefined,cleanupError:string|undefined;
      if(row?.closed)try{unused=unusedProjectAssetKeys(localStorage,props.workspace,selected).length;}catch(reason){cleanupError=projectErrorMessage(reason,"Both checkpoints must be valid before image cleanup.");}
      if(!disposed)setDetail({sourceId:parsed.document.id,revision:portable.revision,unused,cleanupError,recovered:portable.recovered});
    }catch(reason){if(!disposed)setDetail({error:projectErrorMessage(reason,"Recovery data could not be verified.")});}})();return()=>{disposed=true;};
  },[selected,refresh,props.workspace,row?.closed]);
  async function action(task:()=>Promise<void>){if(busy)return;setLocalBusy(true);setError("");setMessage("");try{await task();setRefresh(value=>value+1);}catch(reason){setError(projectErrorMessage(reason,"Project storage operation failed."));}finally{setLocalBusy(false);}}

  return <dialog ref={dialog} className="project-manager" aria-label="Project manager" onCancel={event=>{event.preventDefault();if(!busy)props.onClose();}}>
    <header><div><h1>Projects</h1><p>{props.workspace.projects.length}/200 listed · {storageSize(inventory.projectBytes)} project recovery data</p></div><button disabled={busy} aria-label="Close project manager" onClick={props.onClose}>×</button></header>
    <div className="project-manager-tools"><input aria-label="Search projects" placeholder="Search name or project ID" value={query} onChange={event=>setQuery(event.target.value)} disabled={busy}/>
      <select aria-label="Project filter" value={filter} onChange={event=>setFilter(event.target.value)} disabled={busy}><option value="all">All projects</option><option value="open">Open tabs</option><option value="closed">Closed projects</option><option value="unlisted">Unlisted recovery copies</option></select>
      <button disabled={busy} onClick={()=>void action(async()=>{await props.onRefresh();})}>Refresh storage</button></div>
    <div className="project-manager-capacity"><span>Local storage estimate: {storageSize(inventory.areaBytes)} · list/archive {storageSize(inventory.metadataBytes)}</span>
      <span>Browser origin estimate: {estimate.usage!==undefined&&estimate.quota!==undefined?`${storageSize(estimate.usage)} / ${storageSize(estimate.quota)}`:"unavailable"}</span>
      <small>These estimates are not the localStorage quota or guaranteed remaining space. At 200 projects, close and permanently delete a project to free a slot.</small></div>
    {(error||inventory.error||props.notice)&&<p role="alert" className="project-manager-error">{error||inventory.error||props.notice}</p>}{message&&<p role="status" className="project-manager-message">{message}</p>}
    <div className="project-manager-content"><div className="project-manager-list" aria-label="Project results">
      {rows.length===0&&<p>No matching projects.</p>}
      {rows.map(item=><button type="button" key={item.id} data-project-id={item.id} disabled={busy} aria-pressed={selected===item.id} onClick={()=>{setSelected(item.id);setError("");setMessage("");}}>
        <strong>{item.title}</strong><span>{item.unlisted?"Unlisted recovery":item.closed?"Closed":"Open"} · {storageSize(item.bytes)} · {item.assetCount} image sources</span>
        <small>{props.statuses[item.id]?.localSaveStatus??(item.checkpoint?"Checkpoint available · verify by selecting":"No saved checkpoint")}{item.lastOpenedAt?` · opened ${new Date(item.lastOpenedAt).toLocaleString()}`:""}</small>
      </button>)}
    </div><section className="project-manager-detail" aria-label="Selected project">
      {!row?<p>Select a project to open, export or manage its local copies.</p>:<><h2>{row.title}</h2><p className="project-manager-id">{row.id}</p>
        <p>{storageSize(row.bytes)} local data · {row.assetCount} image source keys</p>
        {detail.sourceId&&<p>Source: {detail.sourceId} · saved revision {detail.revision}</p>}
        {detail.recovered&&<p>Export uses the previous valid recovery checkpoint.</p>}
        {detail.cleanupError&&<p className="project-manager-error">Image cleanup unavailable: {detail.cleanupError}</p>}
        {detail.error&&<p className="project-manager-error">{detail.error} Unreadable copies can be downloaded as raw recovery data.</p>}
        <div className="project-manager-actions">
          {!row.unlisted&&<button disabled={busy} onClick={()=>{props.onOpen(row.id);props.onClose();}}>{row.closed?"Reopen project":"Show project"}</button>}
          {row.unlisted&&<button disabled={busy||!!detail.error||!row.checkpoint||props.workspace.projects.length>=200} onClick={()=>void action(async()=>{await props.onRecover(row.id);})}>Add recovered project</button>}
          {!row.closed&&<button disabled={busy} onClick={()=>props.onCloseProject(row.id)}>Close project first</button>}
          <button disabled={busy||row.closed&&(!detail.sourceId||!!detail.error)} onClick={()=>void action(async()=>{setMessage(await props.onExport(row.id,row.title));})}>Export WebCAD file</button>
          <button disabled={busy||!row.closed} onClick={()=>{setConfirmation("delete");setConfirmed(false);}}>Delete project…</button>
          <button disabled={busy||!row.closed||!!detail.error||!detail.unused} onClick={()=>{setConfirmation("clean");setConfirmed(false);}}>Clean unused images…</button>
        </div>
        {!row.closed&&<p>Export uses the live editor even if local saving fails. Close this tab before deletion or image cleanup; closing saves its latest changes.</p>}
        {row.unlisted&&<p>This recovery namespace is not in the current list. Add it to the list or explicitly delete it after reviewing its saved data.</p>}
        {confirmation&&<div className="project-manager-confirm" role="group" aria-label="Storage operation confirmation">
          <h3>{confirmation==="delete"?`Permanently delete ${row.title}?`:`Remove ${detail.unused} unused image sources?`}</h3>
          <p>{confirmation==="delete"?`Deletes this project's current checkpoint, previous checkpoint, and ${row.assetCount} image source keys. Other projects keep their copies. This cannot be undone.`:"Keeps every image referenced by either the current or previous verified checkpoint. The project remains available."}</p>
          <label><input type="checkbox" aria-label="Confirm local data deletion" checked={confirmed} disabled={busy} onChange={event=>setConfirmed(event.target.checked)}/>I have reviewed the local data being removed.</label>
          <button disabled={busy||!confirmed} onClick={()=>void action(async()=>{if(confirmation==="delete"){await props.onDelete(row.id);setSelected(null);setMessage(row.unlisted?"Unlisted recovery data deleted. Listed project count is unchanged.":"Project deleted. Its slot and local recovery data have been released.");}else{const count=await props.onClean(row.id);setMessage(`Removed ${count} unused image sources.`);}setConfirmation(null);})}>{confirmation==="delete"?"Delete permanently":"Remove unused images"}</button>
          <button disabled={busy} onClick={()=>setConfirmation(null)}>Cancel</button>
        </div>}
      </>}
    </section></div>
    <footer><button disabled={busy} onClick={props.onDownloadRecovery}>Download raw recovery data</button><span>{busy?"Saving or managing project storage…":"Exported file downloads must be checked in your browser."}</span></footer>
  </dialog>;
}
