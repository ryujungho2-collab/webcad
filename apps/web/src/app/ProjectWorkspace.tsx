import { LARGE_DOCUMENT_CHARS, writeDurableCheckpoint, repairDurableIndex, listDurableRecords, readProjectCheckpoint } from "./durableRecovery";
import { useEffect, useRef, useState } from "react";
import { deserializeDocument, serializeDocument, type CadDocument } from "@agent-webcad/cad-document";
import { writeRecoveryCheckpoint } from "../state/documentRecovery";
import { CheckpointGate, PROJECT_CHANNEL, projectStorage, type CheckpointRequest } from "./projectSession";
import { discoverWorkspace, initialWorkspace, readWorkspace, recoveryArchive, restoreWorkspace, writeWorkspace, type Workspace } from "./projectWorkspaceStore";
import "./projects.css";
import { ProjectManager } from "./ProjectManager";
import { cleanProjectAssets, deleteClosedProject, portableProjectAsync, projectExportName } from "./projectManagerStore";
import { indexedStorageJournal, recoverStorageTransactions } from "./projectStorageTransactions";

type EditorStatus = { modified: boolean; localSaveStatus: string; fileDownloadStatus: string; recoveryFailed: boolean };
function bootWorkspace() {
  try { return readWorkspace(localStorage); }
  catch (reason) { return { workspace: initialWorkspace(), blocked: true, error: String(reason), backup: null }; }
}
function emptyDocument(id: string): CadDocument {
  return { id, revision: 0, objects: {}, features: {}, sketches: {}, rootObjects: [], rootLayers: ["layer-default"],
    layers: { "layer-default": { id: "layer-default", name: "Default", visible: true, locked: false, objectIds: [] } } };
}

export function ProjectWorkspace() {
  const [boot,setBoot] = useState(bootWorkspace);
  const [blocked, setBlocked] = useState(boot.blocked), blockedRef = useRef(blocked); blockedRef.current = blocked;
  const [error, setError] = useState(boot.error), retry = useRef<(() => void) | null>(null);
  const [workspace, setWorkspace] = useState<Workspace>(boot.workspace), current = useRef(workspace); current.current = workspace;
  const [visited, setVisited] = useState(() => new Set([workspace.active]));
  const frames = useRef(new Map<string, HTMLIFrameElement>()), generations = useRef(new Map<string, string>());
  function sendActivity() {
    for (const [id, frame] of frames.current) {
      const generation = generations.current.get(id); if (!generation) continue;
      frame.contentWindow?.postMessage({ channel: PROJECT_CHANNEL, id, generation, type: "activity", active: id === current.current.active && !document.hidden }, location.origin);
    }
  }
  useEffect(() => { sendActivity(); }, [workspace.active]);
  useEffect(() => { document.addEventListener("visibilitychange", sendActivity); return () => document.removeEventListener("visibilitychange", sendActivity); }, []);
  const [statuses, setStatuses] = useState<Record<string, EditorStatus>>({});
  const [renaming, setRenaming] = useState<string | null>(null), [title, setTitle] = useState("");
  const gate = useRef(new CheckpointGate()), [pending, setPending] = useState<CheckpointRequest | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [rescue, setRescue] = useState<ReturnType<typeof discoverWorkspace> | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const [managerOpen,setManagerOpen] = useState(false),[storageBusy,setStorageBusy] = useState(false);
  const storageAction = useRef(false),[storageReady,setStorageReady] = useState(false),storageReadyRef = useRef(false);
  const [journal] = useState(indexedStorageJournal);
  const initializing = useRef<Promise<void>|null>(null),everReady=useRef(false);
  const exportRequest = useRef<{resolve:(message:string)=>void;reject:(error:Error)=>void}|null>(null);

  function initializeStorage():Promise<void> {
    if(initializing.current)return initializing.current;
    const run=async()=>{
    try {
      const recovered = await recoverStorageTransactions(localStorage,journal); await repairDurableIndex(localStorage); const next = bootWorkspace();
      setBoot(next); blockedRef.current=next.blocked;setBlocked(next.blocked);
      current.current=next.workspace;setWorkspace(next.workspace);setVisited(previous=>new Set([...previous,next.workspace.active]));
      setError(next.error || (recovered ? "An interrupted storage operation was rolled back. Original project copies were restored." : ""));
      everReady.current=true;storageReadyRef.current=true;setStorageReady(true);retry.current=null;
    }catch(reason){storageReadyRef.current=false;setStorageReady(false);fail(reason,()=>void initializeStorage());}
    };
    initializing.current=run().finally(()=>{initializing.current=null;});return initializing.current;
  }
  useEffect(()=>{void initializeStorage();},[]);

  function fail(reason: unknown, again?: () => void) { setError(reason instanceof Error ? reason.message : String(reason)); retry.current = again ?? null; }
  function commit(next: Workspace) {
    if(!storageReadyRef.current)throw Error("Finish storage recovery before editing the project list.");
    if (blockedRef.current) throw Error("Restore the project list before editing this workspace.");
    writeWorkspace(localStorage, next);
    current.current = next; setWorkspace(next); setError(""); retry.current = null;
  }
  function activate(id: string) {
    if (gate.current.pending || storageAction.current || !storageReadyRef.current) return;
    try {
      const w = current.current;
      if (!w.projects.some(p => p.id === id)) return;
      commit({ ...w, active: id, projects: w.projects.map(p => p.id === id ? { ...p, closed: false, lastOpenedAt: Date.now() } : p) });
      setVisited(previous => new Set([...previous, id]));
    } catch (reason) { fail(reason, () => activate(id)); }
  }
  async function add(text?: string, name?: string) {
    if (gate.current.pending || storageAction.current || !storageReadyRef.current) return;
    storageAction.current=true;setStorageBusy(true);
    try {
      if (blockedRef.current) throw Error("Restore the project list before opening another project.");
      if (current.current.projects.length >= 200) { setManagerOpen(true); throw Error("The workspace contains 200 projects. Close and delete a project in Projects to free a slot."); }
      const id = crypto.randomUUID(), document = text === undefined ? emptyDocument(`document-${id}`) : deserializeDocument(text);
      if(serializeDocument(document).length>=LARGE_DOCUMENT_CHARS)await writeDurableCheckpoint(localStorage,id,document);else writeRecoveryCheckpoint(projectStorage(localStorage, id), document);
      const project = { id, title: (name?.replace(/\.webcad\.json$/i, "").replace(/\.json$/i, "") || `Project ${current.current.projects.length + 1}`).slice(0, 120), closed: false, lastOpenedAt: Date.now() };
      commit({ version: 1, active: id, projects: [...current.current.projects, project] });
      setVisited(previous => new Set([...previous, id]));
    } catch (reason) { fail(reason); }
    finally{storageAction.current=false;setStorageBusy(false);}
  }
  async function openFile(value?: File) {
    if (!value) return;
    try { await add(await value.text(), value.name); } catch (reason) { fail(reason); }
  }
  function clearPending() { gate.current.clear(); setPending(null); clearTimeout(timer.current); }
  function requestCheckpoint(id: string, intent: CheckpointRequest["intent"]) {
    if (gate.current.pending || storageAction.current || !storageReadyRef.current) return;
    const frame = frames.current.get(id), generation = generations.current.get(id);
    if (!frame?.contentWindow && intent === "close") { finishClose(id); return; }
    if (!frame?.contentWindow || !generation) { failCheckpoint("Project is still loading. Wait for it to finish, then retry.",id,intent); return; }
    try {
      const request = gate.current.begin(id, generation, intent); setPending(request);
      frame.contentWindow.postMessage({ ...request, channel: PROJECT_CHANNEL, type: "checkpoint" }, location.origin);
      timer.current = setTimeout(() => {
        if (gate.current.pending?.requestId !== request.requestId) return;
        clearPending(); failCheckpoint("Project save timed out. Its editor and recovery data remain available.",id,intent);
      }, 10000);
    } catch (reason) { clearPending(); failCheckpoint(reason,id,intent); }
  }
  function failCheckpoint(reason:unknown,id:string,intent:CheckpointRequest["intent"]) {
    if(intent==="export"){exportRequest.current?.reject(reason instanceof Error?reason:Error(String(reason)));exportRequest.current=null;}
    fail(reason,intent==="export"?undefined:()=>requestCheckpoint(id,intent));
  }
  async function downloadPortable(id:string,title:string) {
    const portable=await portableProjectAsync(localStorage,id,title);
    download(portable.text,portable.name);
    return `Download started for ${portable.name}${portable.recovered?" from the previous valid checkpoint":""}. Verify completion in your browser.`;
  }
  function exportManagedProject(id:string,title:string):Promise<string> {
    if(gate.current.pending||storageAction.current)return Promise.reject(Error("Another project operation is running."));
    if(!frames.current.has(id))try{return Promise.resolve(downloadPortable(id,title));}catch(reason){return Promise.reject(reason);}
    return new Promise((resolve,reject)=>{exportRequest.current={resolve,reject};requestCheckpoint(id,"export");});
  }
  async function manageStorage<T>(task:()=>Promise<T>):Promise<T> {
    if(gate.current.pending||storageAction.current||!storageReadyRef.current)throw Error("Another storage or save operation is running.");
    storageAction.current=true;setStorageBusy(true);
    try{return await task();}
    catch(reason){
      let pendingRecovery=true;try{pendingRecovery=(await journal.list()).some(record=>!record.committed);}catch{/* Do not resume editing until journal availability is verified. */}
      if(pendingRecovery){storageReadyRef.current=false;setStorageReady(false);setManagerOpen(false);fail(reason,()=>void initializeStorage());}
      throw reason;
    }finally{storageAction.current=false;setStorageBusy(false);}
  }
  async function deleteManagedProject(id:string) {
    await manageStorage(async()=>{
      if(frames.current.has(id))throw Error("Close this project's editor before permanent deletion.");
      const next=await deleteClosedProject(localStorage,current.current,id,journal);
      current.current=next;setWorkspace(next);setError("");
      setVisited(previous=>{const copy=new Set(previous);copy.delete(id);return copy;});
      setStatuses(previous=>{const copy={...previous};delete copy[id];return copy;});
    });
  }
  async function addRecoveredProject(id:string) {
    try{
      const stored=readWorkspace(localStorage);
      if(stored.blocked||JSON.stringify(stored.workspace)!==JSON.stringify(current.current))throw Error("Project list changed. Refresh storage before adding a recovery copy.");
      if(current.current.projects.length>=200)throw Error("Delete a listed project to free a recovery slot.");
      const portable=await portableProjectAsync(localStorage,id,id),data=JSON.parse(portable.text);
      commit({...current.current,projects:[...current.current.projects,{id,title:String(data.document.id).slice(0,120),closed:true}]});
    }catch(reason){fail(reason);}
  }
  async function refreshManagedWorkspace() {
    if(gate.current.pending||storageAction.current)throw Error("Another project operation is running.");
    await repairDurableIndex(localStorage);
    const stored=readWorkspace(localStorage);
    if(stored.blocked)throw Error("The project list is damaged. Download recovery data and reload to restore it; live editors have been kept.");
    if([...frames.current.keys()].some(id=>!stored.workspace.projects.some(project=>project.id===id&&!project.closed)))
      throw Error("Another window closed or removed a live project. Export its live editor before reloading this workspace; its session has been kept.");
    current.current=stored.workspace;setWorkspace(stored.workspace);setVisited(previous=>new Set([...previous,stored.workspace.active]));setError("");
  }
  function finishClose(id: string) {
    try {
      const w = current.current, projects = w.projects.map(p => p.id === id ? { ...p, closed: true } : p);
      const index = w.projects.findIndex(p => p.id === id), next = projects.slice(index + 1).find(p => !p.closed) ?? [...projects.slice(0, index)].reverse().find(p => !p.closed);
      commit({ ...w, projects, active: w.active === id ? next?.id ?? "" : w.active });
      setVisited(previous => { const copy = new Set(previous); copy.delete(id); if (w.active === id && next) copy.add(next.id); return copy; });
      generations.current.delete(id);
      setStatuses(previous => { const copy = { ...previous }; delete copy[id]; return copy; });
    } catch (reason) { fail(reason, () => requestCheckpoint(id, "close")); }
    clearPending();
  }
  function restore(next: Workspace) {
    try {
      restoreWorkspace(localStorage, next);
      blockedRef.current = false; setBlocked(false); setError(""); retry.current = null;
      current.current = next; setWorkspace(next); setVisited(new Set([next.active])); setRescue(null);
    } catch (reason) { fail(reason, () => restore(next)); }
  }
  async function scan() {
    try {
      const result=discoverWorkspace(localStorage);
      for(const record of await listDurableRecords())if(!result.workspace.projects.some(p=>p.id===record.id)) {
        try { const checkpoint=await readProjectCheckpoint(localStorage,record.id);if(checkpoint)result.workspace.projects.push({id:record.id,title:checkpoint.document.id.slice(0,120),closed:false}); } catch { result.failed++; }
      }
      if(result.workspace.projects.length>200)throw Error("More than 200 recovery projects found. Download recovery data first.");
      result.workspace.active||=result.workspace.projects[0]?.id??"";setRescue(result);
    }catch(reason){fail(reason,()=>void scan());}
  }
  function download(text:string,name:string) {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = name;
    document.body.appendChild(anchor); anchor.click(); setTimeout(() => { anchor.remove(); URL.revokeObjectURL(url); }, 1000);
  }
  async function downloadRecovery() {
    try {
      const archive=JSON.parse(recoveryArchive(localStorage));
      try{archive.durableDocuments=await listDurableRecords();}catch(reason){archive.durableRecoveryError=String(reason);}
      try{archive.storageOperations=(await journal.list()).filter(record=>!record.committed);}catch(reason){archive.operationRecoveryError=String(reason);}
      download(JSON.stringify(archive),"webcad-workspace-recovery.json");
    } catch (reason) { fail(reason, downloadRecovery); }
  }
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      const data = event.data;
      if (event.origin !== location.origin || !data || data.channel !== PROJECT_CHANNEL || typeof data.id !== "string"
        || frames.current.get(data.id)?.contentWindow !== event.source || typeof data.generation !== "string") return;
      if (data.type === "ready") {
        const previous = generations.current.get(data.id); generations.current.set(data.id, data.generation);
        sendActivity();
        if (previous && previous !== data.generation) setStatuses(status => { const copy = { ...status }; delete copy[data.id]; return copy; });
        const request = gate.current.pending;
        if (previous && previous !== data.generation && request && request.id === data.id) {
          const intent = request.intent; clearPending(); failCheckpoint("Project editor restarted before saving. Retry in its new session.",data.id,intent);
        }
        return;
      }
      if (generations.current.get(data.id) !== data.generation) return;
      if (data.type === "new") add();
      if (data.type === "open" && typeof data.text === "string" && typeof data.name === "string") add(data.text, data.name);
      if (data.type === "status" && typeof data.modified === "boolean" && typeof data.localSaveStatus === "string" && typeof data.fileDownloadStatus === "string") {
        setStatuses(previous => ({ ...previous, [data.id]: { modified: data.modified, localSaveStatus: data.localSaveStatus, fileDownloadStatus: data.fileDownloadStatus, recoveryFailed: data.recoveryFailed === true } }));
      }
      if (data.type === "checkpoint-result" && gate.current.matches(data)) {
        const request = gate.current.pending!;
        if (data.ok === true && data.version && typeof data.version.documentId === "string" && Number.isInteger(data.version.revision) && Number.isInteger(data.version.generation)) {
          if (request.intent === "close") finishClose(request.id);
          else if(request.intent==="export"){
            try{
              if(typeof data.exportText!=="string")throw Error("Project export snapshot is missing.");
              const snapshot=deserializeDocument(data.exportText);
              if(snapshot.id!==data.version.documentId||snapshot.revision!==data.version.revision)throw Error("Project export snapshot does not match its revision.");
              const name=projectExportName(current.current.projects.find(project=>project.id===request.id)?.title??request.id);
              download(data.exportText,name);
              frames.current.get(request.id)?.contentWindow?.postMessage({channel:PROJECT_CHANNEL,id:request.id,generation:request.generation,type:"export-started",requestId:request.requestId},location.origin);
              exportRequest.current?.resolve(`Download started for ${name} from the live editor snapshot. Verify completion in your browser.`);
            }
            catch(reason){exportRequest.current?.reject(reason instanceof Error?reason:Error(String(reason)));}
            finally{exportRequest.current=null;clearPending();}
          }else { clearPending(); setError(""); retry.current = null; }
        } else {
          clearPending(); failCheckpoint(typeof data.error === "string" ? data.error : "Checkpoint failed; project remains open.",request.id,request.intent);
        }
      }
    };
    window.addEventListener("message", receive);
    return () => { window.removeEventListener("message", receive); clearTimeout(timer.current); };
  }, []);
  const status = statuses[workspace.active];

  return <main className="project-workspace">
    <header className="project-strip">
      <div className="project-tabs" role="tablist" aria-label="Projects">
        {workspace.projects.filter(p => !p.closed).map(p => <div className={`project-tab${p.id === workspace.active ? " project-tab-active" : ""}`} key={p.id}>
          <button role="tab" id={`project-tab-${p.id}`} aria-controls={`project-panel-${p.id}`} aria-selected={p.id === workspace.active} tabIndex={p.id === workspace.active ? 0 : -1} disabled={blocked || !!pending || storageBusy || !storageReady}
            onClick={() => activate(p.id)} onDoubleClick={() => { setTitle(p.title); setRenaming(p.id); }}
            onKeyDown={e => { const open = workspace.projects.filter(p => !p.closed), at = open.findIndex(x => x.id === p.id); const index = e.key === "ArrowRight" ? (at + 1) % open.length : e.key === "ArrowLeft" ? (at + open.length - 1) % open.length : e.key === "Home" ? 0 : e.key === "End" ? open.length - 1 : -1; if (index >= 0) { e.preventDefault(); activate(open[index].id); document.getElementById(`project-tab-${open[index].id}`)?.focus(); } }}
            title={`${p.title} · double-click to rename · ${statuses[p.id]?.localSaveStatus ?? "Not loaded"} · ${statuses[p.id]?.fileDownloadStatus ?? "File download status unavailable"}`}>
            {statuses[p.id]?.recoveryFailed ? <span className="project-dirty" aria-label="Local recovery failed">!</span> : statuses[p.id]?.modified && <span className="project-dirty" aria-label="Local changes pending">●</span>}{p.title}</button>
          <button aria-label={`Close project ${p.title}`} disabled={blocked || !!pending || storageBusy || !storageReady} title="Close after saving locally; reopening starts fresh Undo. This does not download a file." onClick={() => requestCheckpoint(p.id, "close")}>×</button>
        </div>)}
      </div>
      <button aria-label="New project" title="New project" disabled={blocked || !!pending || storageBusy || !storageReady} onClick={() => add()}>＋</button>
      <button disabled={blocked || !!pending || storageBusy || !storageReady} onClick={() => file.current?.click()}>Open project</button>
      <button disabled={blocked || !!pending || storageBusy || !storageReady} onClick={()=>setManagerOpen(true)}>Projects</button>
      <select aria-label="Reopen closed project" disabled={blocked || !!pending || storageBusy || !storageReady} value="" onChange={e => { if (e.target.value) activate(e.target.value); }}><option value="">Closed projects</option>{workspace.projects.filter(p => p.closed).map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select>
      <input ref={file} type="file" accept=".json,.webcad.json" hidden onChange={e => { void openFile(e.target.files?.[0]); e.target.value = ""; }} />
    </header>
    {error && <div role="alert" className="project-error">{error}{retry.current && <button onClick={() => retry.current?.()}>Retry</button>}<button onClick={downloadRecovery}>Download recovery data</button>{!blocked && <button onClick={() => { setError(""); retry.current = null; }}>Dismiss</button>}</div>}
    {!storageReady&&<div className="project-storage-check" role="status">{error?"Finish storage recovery before editing. Existing editor sessions are kept.":"Checking interrupted storage operations…"}</div>}
    {blocked ? <div className="project-recovery">
      <h1>Recover your project list</h1><p>The saved drawings are kept. Restore a verified list or find projects in their saved recovery copies.</p>
      {boot.backup && <button onClick={() => restore(boot.backup!)}>Restore backup project list</button>}
      <button onClick={scan}>Find saved projects</button><button onClick={downloadRecovery}>Download recovery data</button>
      {rescue && <div><p>{rescue.workspace.projects.length} readable projects found. {rescue.failed} unreadable recovery copies remain untouched.</p><ul>{rescue.workspace.projects.map(p => <li key={p.id}>{p.title}</li>)}</ul>
        <button disabled={!rescue.workspace.projects.length} onClick={() => restore(rescue.workspace)}>Restore recovered project list</button></div>}
    </div> : <>
      {workspace.active && <div className="project-save-status" role="status" aria-label="Project save status">
        <span>{pending ? "Saving local recovery copy…" : status?.localSaveStatus ?? "Loading local recovery copy…"}</span>
        <span>{status?.fileDownloadStatus ?? "File download status unavailable"}</span>
        {status?.recoveryFailed && <button disabled={!!pending} onClick={() => requestCheckpoint(workspace.active, "save")}>Retry local save</button>}
      </div>}
      <div className="project-editors">
        {workspace.projects.filter(p => !p.closed).map(p => <section key={p.id} id={`project-panel-${p.id}`} role="tabpanel" aria-labelledby={`project-tab-${p.id}`} hidden={p.id !== workspace.active} inert={!storageReady||storageBusy||pending?.id === p.id}>
          {everReady.current&&visited.has(p.id) && <iframe ref={node => { if (node) frames.current.set(p.id, node); else frames.current.delete(p.id); }} title={`Project editor: ${p.title}`} src={`/?project-tab=${p.id}`} />}
        </section>)}
        {!workspace.active && <div className="project-empty"><h1>Your projects</h1><p>Open a drawing or create a project. Closed projects keep their recovery copy.</p><button onClick={() => add()}>New project</button><button onClick={() => file.current?.click()}>Open project</button></div>}
      </div>
    </>}
    {managerOpen&&<ProjectManager workspace={workspace} statuses={statuses} notice={error} busy={!!pending||storageBusy} onClose={()=>setManagerOpen(false)} onOpen={activate}
      onCloseProject={id=>requestCheckpoint(id,"close")} onExport={exportManagedProject} onDelete={deleteManagedProject}
      onClean={id=>manageStorage(()=>cleanProjectAssets(localStorage,current.current,id,journal))} onRecover={addRecoveredProject} onRefresh={refreshManagedWorkspace} onDownloadRecovery={()=>void downloadRecovery()}/>}
    {renaming && <dialog className="project-rename" ref={node => { if(node && !node.open) node.showModal(); }} onCancel={() => setRenaming(null)} aria-label="Rename project"><form onSubmit={e => { e.preventDefault(); if (!title.trim()) return; const rename = () => { try { commit({ ...current.current, projects: current.current.projects.map(p => p.id === renaming ? { ...p, title: title.trim().slice(0,120) } : p) }); setRenaming(null); } catch (reason) { fail(reason, rename); } }; rename(); }}><label>Project name<input autoFocus maxLength={120} value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => { if(e.key === "Escape") setRenaming(null); }} /></label><button type="submit">Rename</button><button type="button" onClick={() => setRenaming(null)}>Cancel</button></form></dialog>}
  </main>;
}
