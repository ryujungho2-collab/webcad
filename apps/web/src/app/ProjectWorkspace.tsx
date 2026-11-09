import {ProjectBundleDialog} from "./ProjectBundleDialog";
import {importProjectBundle,type ProjectBundle} from "./projectBundle";
import {useModalDialog} from "../ui/useModalDialog";
import {isCompositionKey} from "../input/shortcutRouter";
import {ProjectHome} from "./ProjectHome";
import {createProjectCopy,startsOnProjectHome} from "./projectHomeStore";
import {PROJECT_TEMPLATES,projectTemplate} from "./projectTemplates";
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
import { COMPARISON_KEY, readProjectComparison, reconcileComparison, replaceComparisonPane, type ProjectComparison } from "./projectComparison";
import { ProjectComparisonDivider } from "./ProjectComparisonDivider";
import { orderedOpenProjects, pinProjectTab, moveProjectTab, reorderProjectTab } from "./projectTabs";
import { ProjectTabStrip } from "./ProjectTabStrip";

type EditorStatus = { modified: boolean; localSaveStatus: string; fileDownloadStatus: string; recoveryFailed: boolean };
function bootWorkspace() {
  try { return readWorkspace(localStorage); }
  catch (reason) { return { workspace: initialWorkspace(), blocked: true, error: String(reason), backup: null }; }
}
function emptyDocument(id: string): CadDocument {
  return { id, revision: 0, objects: {}, features: {}, sketches: {}, rootObjects: [], rootLayers: ["layer-default"],
    layers: { "layer-default": { id: "layer-default", name: "Default", visible: true, locked: false, objectIds: [] } } };
}

export function ProjectWorkspace({startOnHome}:{startOnHome?:boolean}={}) {
  const [homeOpen,setHomeOpen]=useState(()=>startOnHome??startsOnProjectHome(localStorage)),homeRef=useRef(homeOpen);homeRef.current=homeOpen;
  const [boot,setBoot] = useState(bootWorkspace);
  const [blocked, setBlocked] = useState(boot.blocked), blockedRef = useRef(blocked); blockedRef.current = blocked;
  const [error, setError] = useState(boot.error), retry = useRef<(() => void) | null>(null);
  const [workspace, setWorkspace] = useState<Workspace>(boot.workspace), current = useRef(workspace); current.current = workspace;
  // Tab order is independent of DOM order: moving an iframe would reload it.
  const [editorOrder,setEditorOrder]=useState(()=>boot.workspace.projects.map(p=>p.id));
  const [searchRequest,setSearchRequest]=useState(0);
  useEffect(()=>{setEditorOrder(previous=>{
    const ids=workspace.projects.map(p=>p.id),next=[...previous.filter(id=>ids.includes(id)),...ids.filter(id=>!previous.includes(id))];
    return next.length===previous.length&&next.every((id,i)=>id===previous[i])?previous:next;
  });},[workspace.projects]);
  const [comparison, setComparison] = useState(() => reconcileComparison(readProjectComparison(localStorage), boot.workspace));
  const comparisonRef = useRef(comparison); comparisonRef.current = comparison;
  const visibleIds = comparison.pair ?? [workspace.active];
  const [visited, setVisited] = useState(() => new Set(comparison.pair ?? [workspace.active]));
  const frames = useRef(new Map<string, HTMLIFrameElement>()), generations = useRef(new Map<string, string>());
  function sendActivity() {
    for (const [id, frame] of frames.current) {
      const generation = generations.current.get(id); if (!generation) continue;
      const visible = comparisonRef.current.pair ?? [current.current.active];
      frame.contentWindow?.postMessage({ channel: PROJECT_CHANNEL, id, generation, type: "activity", active: !homeRef.current && visible.includes(id) && !document.hidden, comparison: !!comparisonRef.current.pair&&visible.includes(id) }, location.origin);
    }
  }
  useEffect(() => { sendActivity(); }, [workspace.active, comparison.pair?.join("\0"),homeOpen]);
  useEffect(() => { document.addEventListener("visibilitychange", sendActivity); return () => document.removeEventListener("visibilitychange", sendActivity); }, []);
  const [statuses, setStatuses] = useState<Record<string, EditorStatus>>({});
  const [renaming, setRenaming] = useState<string | null>(null), [title, setTitle] = useState("");
  const renameDialog=useModalDialog(!!renaming,"input");
  const gate = useRef(new CheckpointGate()), [pending, setPending] = useState<CheckpointRequest | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [rescue, setRescue] = useState<ReturnType<typeof discoverWorkspace> | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const [managerFilter,setManagerFilter]=useState<"all"|"unlisted">("all");
  const [managerOpen,setManagerOpen] = useState(false),[storageBusy,setStorageBusy] = useState(false);
  const storageAction = useRef(false),[storageReady,setStorageReady] = useState(false),storageReadyRef = useRef(false);
  const [journal] = useState(indexedStorageJournal);
  const initializing = useRef<Promise<void>|null>(null),everReady=useRef(false);
  const [bundleOpen,setBundleOpen]=useState(false);
  const bundleSnapshot=useRef<{resolve:(document:CadDocument)=>void;reject:(error:Error)=>void}|null>(null);
  const exportRequest = useRef<{resolve:(message:string)=>void;reject:(error:Error)=>void}|null>(null);

  function initializeStorage():Promise<void> {
    if(initializing.current)return initializing.current;
    const run=async()=>{
    try {
      const recovered = await recoverStorageTransactions(localStorage,journal); await repairDurableIndex(localStorage); const next = bootWorkspace();
      setBoot(next); blockedRef.current=next.blocked;setBlocked(next.blocked);
      const layout=reconcileComparison(comparisonRef.current,next.workspace);comparisonRef.current=layout;setComparison(layout);
      current.current=next.workspace;setWorkspace(next.workspace);setVisited(previous=>new Set([...previous,...layout.pair??[next.workspace.active]]));
      setError(next.error || (recovered ? "An interrupted storage operation was rolled back. Original project copies were restored." : ""));
      everReady.current=true;storageReadyRef.current=true;setStorageReady(true);retry.current=null;
    }catch(reason){storageReadyRef.current=false;setStorageReady(false);fail(reason,()=>void initializeStorage());}
    };
    initializing.current=run().finally(()=>{initializing.current=null;});return initializing.current;
  }
  useEffect(()=>{void initializeStorage();},[]);

  function fail(reason: unknown, again?: () => void) { setError(reason instanceof Error ? reason.message : String(reason)); retry.current = again ?? null; }
  function saveComparison() {
    try { localStorage.setItem(COMPARISON_KEY, JSON.stringify(comparisonRef.current)); }
    catch { fail("The live layout is available, but its preference could not be saved. Retry to keep it after reload.", saveComparison); }
  }
  function changeComparison(next: ProjectComparison, persist = true) {
    comparisonRef.current=next;setComparison(next);
    setVisited(previous=>new Set([...previous,...next.pair??[]]));
    if(persist)saveComparison();
  }
  function toggleComparison() {
    if(gate.current.pending||storageAction.current||!storageReadyRef.current)return;
    const w=current.current,other=w.projects.find(p=>!p.closed&&p.id!==w.active);
    if(comparisonRef.current.pair)changeComparison({...comparisonRef.current,pair:null});
    else if(other)changeComparison({...comparisonRef.current,pair:[w.active,other.id]});
  }
  function choosePane(side:number,id:string) {
    if(gate.current.pending||storageAction.current||!storageReadyRef.current)return;
    if(!current.current.projects.some(p=>!p.closed&&p.id===id))return;
    const next=replaceComparisonPane(comparisonRef.current,side,id);
    try { commit({...current.current,active:id});changeComparison(next); }
    catch(reason){fail(reason,()=>choosePane(side,id));}
  }
  function commit(next: Workspace) {
    if(!storageReadyRef.current)throw Error("Finish storage recovery before editing the project list.");
    if (blockedRef.current) throw Error("Restore the project list before editing this workspace.");
    writeWorkspace(localStorage, next);
    const layout=reconcileComparison(comparisonRef.current,next,current.current.active);
    current.current = next; setWorkspace(next); setError(""); retry.current = null;
    if(layout!==comparisonRef.current)changeComparison(layout);
  }
  function leaveHome(id=current.current.active){const returning=homeRef.current;setHomeOpen(false);if(returning)requestAnimationFrame(()=>document.getElementById(`project-tab-${id}`)?.focus());}
  function activate(id: string) {
    if (gate.current.pending || storageAction.current || !storageReadyRef.current) return;
    try {
      const w = current.current;
      if (!w.projects.some(p => p.id === id)) return;
      if(w.active===id&&!w.projects.find(p=>p.id===id)?.closed&&!homeRef.current)return;
      commit({ ...w, active: id, projects: w.projects.map(p => p.id === id ? { ...p, closed: false, lastOpenedAt: Date.now() } : p) });
      setVisited(previous => new Set([...previous, id]));leaveHome(id);
    } catch (reason) { fail(reason, () => activate(id)); }
  }
  async function addTemplate(templateId:string){
    if(blockedRef.current||gate.current.pending||storageAction.current||!storageReadyRef.current)return;
    try{await manageStorage(async()=>{
      const template=PROJECT_TEMPLATES.find(t=>t.id===templateId);if(!template)throw Error("Unknown project template.");
      const next=await createProjectCopy(localStorage,current.current,projectTemplate(templateId),template.title,journal);
      commit(next);setVisited(previous=>new Set([...previous,next.active]));leaveHome(next.active);
    });}catch(reason){if(storageReadyRef.current)fail(reason,()=>void addTemplate(templateId));}
  }
  function editTabs(operation:(workspace:Workspace)=>Workspace){
    if(gate.current.pending||storageAction.current||!storageReadyRef.current||blockedRef.current)return;
    try{const next=operation(current.current);if(next!==current.current)commit(next);}
    catch(reason){fail(reason,()=>editTabs(operation));}
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
      commit({ ...current.current, active: id, projects: [...current.current.projects, project] });
      setVisited(previous => new Set([...previous, id]));leaveHome(id);
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
    if(intent==="export"){bundleSnapshot.current?.reject(reason instanceof Error?reason:Error(String(reason)));bundleSnapshot.current=null;exportRequest.current?.reject(reason instanceof Error?reason:Error(String(reason)));exportRequest.current=null;}
    fail(reason,intent==="export"?undefined:()=>requestCheckpoint(id,intent));
  }
  async function snapshotForBundle(id:string):Promise<CadDocument> {
    if(gate.current.pending||storageAction.current||!storageReadyRef.current)throw Error("Another save or storage operation is running.");
    if(!frames.current.has(id)){
      const checkpoint=await readProjectCheckpoint(localStorage,id);
      if(!checkpoint)throw Error("No saved checkpoint. Open and save the project first.");
      if(checkpoint.recovered)throw Error("The current checkpoint is damaged. Open and restore the project before sharing it.");
      return checkpoint.document;
    }
    return new Promise((resolve,reject)=>{bundleSnapshot.current={resolve,reject};requestCheckpoint(id,"export");});
  }
  async function importBundle(bundle:ProjectBundle){
    await manageStorage(async()=>{
      const next=await importProjectBundle(localStorage,current.current,bundle,journal);
      // Storage already published the list atomically. Do not perform another fallible list write.
      current.current=next;setWorkspace(next);setVisited(previous=>new Set([...previous,next.active]));
      changeComparison({...comparisonRef.current,pair:null});leaveHome(next.active);
    });
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
      const layout=reconcileComparison(comparisonRef.current,next,current.current.active);
      current.current=next;setWorkspace(next);setError("");
      if(layout!==comparisonRef.current)changeComparison(layout);
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
    const layout=reconcileComparison(comparisonRef.current,stored.workspace,current.current.active);
    current.current=stored.workspace;setWorkspace(stored.workspace);setVisited(previous=>new Set([...previous,stored.workspace.active]));setError("");
    if(layout!==comparisonRef.current)changeComparison(layout);
  }
  function finishClose(id: string) {
    try {
      const w = current.current, projects = w.projects.map(p => p.id === id ? { ...p, closed: true } : p);
      const survivor=comparisonRef.current.pair?.find(other=>other!==id);
      const open=orderedOpenProjects(w),index=open.findIndex(p=>p.id===id),next=(comparisonRef.current.pair?.includes(id)?projects.find(p=>p.id===survivor&&!p.closed):undefined)??open[index+1]??open[index-1];
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
      changeComparison(reconcileComparison(comparisonRef.current,next));
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
      if(data.type==="activate"&&!homeRef.current&&(comparisonRef.current.pair??[current.current.active]).includes(data.id))activate(data.id);
      if(data.type==="find-project"&&!homeRef.current&&(comparisonRef.current.pair??[current.current.active]).includes(data.id)&&!gate.current.pending&&!storageAction.current&&storageReadyRef.current&&!document.querySelector("dialog[open]"))setSearchRequest(value=>value+1);
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
              if(bundleSnapshot.current){const waiting=bundleSnapshot.current;bundleSnapshot.current=null;waiting.resolve(snapshot);return;}
              const name=projectExportName(current.current.projects.find(project=>project.id===request.id)?.title??request.id);
              download(data.exportText,name);
              frames.current.get(request.id)?.contentWindow?.postMessage({channel:PROJECT_CHANNEL,id:request.id,generation:request.generation,type:"export-started",requestId:request.requestId},location.origin);
              exportRequest.current?.resolve(`Download started for ${name} from the live editor snapshot. Verify completion in your browser.`);
            }
            catch(reason){bundleSnapshot.current?.reject(reason instanceof Error?reason:Error(String(reason)));bundleSnapshot.current=null;exportRequest.current?.reject(reason instanceof Error?reason:Error(String(reason)));}
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
  const openProjects=orderedOpenProjects(workspace),editors=editorOrder.flatMap(id=>workspace.projects.find(p=>p.id===id&&!p.closed)??[]);

  return <main className="project-workspace">
    <header className="project-strip">

      <ProjectTabStrip leadingAction={<button className="project-home-button" aria-label="Project home" aria-pressed={homeOpen||!workspace.active} disabled={!!pending||storageBusy||!storageReady} onClick={()=>setHomeOpen(true)}>Home</button>} projects={openProjects} active={workspace.active} statuses={statuses} disabled={blocked||!!pending||storageBusy||!storageReady} searchRequest={searchRequest}
        onActivate={activate} onRename={p=>{setTitle(p.title);setRenaming(p.id);}} onClose={id=>requestCheckpoint(id,"close")}
        onPin={id=>editTabs(w=>pinProjectTab(w,id))} onMove={(id,direction)=>editTabs(w=>moveProjectTab(w,id,direction))} onDrop={(id,target,before)=>editTabs(w=>reorderProjectTab(w,id,target,before))}/>
      <button aria-label="New project" title="New project" disabled={blocked || !!pending || storageBusy || !storageReady} onClick={() => add()}>＋</button>
      <button disabled={blocked || !!pending || storageBusy || !storageReady} onClick={() => file.current?.click()}>Open project</button>
      <button disabled={blocked || !!pending || storageBusy || !storageReady} onClick={()=>{setManagerFilter("all");setManagerOpen(true);}}>Projects</button>
      <button disabled={blocked||!!pending||storageBusy||!storageReady} onClick={()=>setBundleOpen(true)}>Share bundle</button>
      <button aria-label={comparison.pair?"Single project view":"Compare projects"} aria-pressed={!!comparison.pair} title={workspace.projects.filter(p=>!p.closed).length<2?"Open two projects to compare":"Show two projects side by side; keep both editing sessions"} disabled={blocked||!!pending||storageBusy||!storageReady||workspace.projects.filter(p=>!p.closed).length<2} onClick={toggleComparison}>{comparison.pair?"Single view":"Compare"}</button>
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
      {!homeOpen&&workspace.active && <div className="project-save-status" role="status" aria-label="Project save status">
        <span>{pending ? "Saving local recovery copy…" : status?.localSaveStatus ?? "Loading local recovery copy…"}</span>
        <span>{status?.fileDownloadStatus ?? "File download status unavailable"}</span>
        {status?.recoveryFailed && <button disabled={!!pending} onClick={() => requestCheckpoint(workspace.active, "save")}>Retry local save</button>}
      </div>}
      {(homeOpen||!workspace.active)&&<ProjectHome workspace={workspace} ready={storageReady} busy={!!pending||storageBusy} live={statuses} onOpen={activate} onContinue={()=>activate(workspace.active)} onNew={()=>void add()} onFile={()=>file.current?.click()} onTemplate={id=>void addTemplate(id)} onManage={()=>{setManagerFilter("all");setManagerOpen(true);}} onRecovery={()=>{setManagerFilter("unlisted");setManagerOpen(true);}} onRecover={id=>manageStorage(()=>addRecoveredProject(id))} onRefresh={refreshManagedWorkspace}/>}
      <div hidden={homeOpen||!workspace.active} className={`project-editors${comparison.pair?" project-editors-comparison":""}`}>
        {editors.map(p => <section key={p.id} id={`project-panel-${p.id}`} role="tabpanel" aria-labelledby={`project-tab-${p.id}`} hidden={!visibleIds.includes(p.id)} inert={!storageReady||storageBusy||!!pending}
          data-project-active={p.id===workspace.active} data-comparison-side={comparison.pair?.indexOf(p.id)===0?"left":comparison.pair?.indexOf(p.id)===1?"right":undefined}
          style={!comparison.pair?undefined:comparison.pair[0]===p.id?{left:0,width:`calc(${comparison.ratio*100}% - 4px)`}:{left:`calc(${comparison.ratio*100}% + 4px)`,width:`calc(${(1-comparison.ratio)*100}% - 4px)`}}>
          <header className="project-pane-header" hidden={!comparison.pair}>
            <button className="project-pane-activate" aria-label={`Activate project ${p.title}`} aria-pressed={p.id===workspace.active} disabled={!!pending||storageBusy||!storageReady} onClick={()=>activate(p.id)} title={p.title}>{p.id===workspace.active?"Editing":"Activate"} · {p.title}</button>
            <select aria-label={comparison.pair?.[0]===p.id?"Left comparison project":"Right comparison project"} value={p.id} disabled={!!pending||storageBusy||!storageReady} onChange={e=>choosePane(comparison.pair?.[0]===p.id?0:1,e.target.value)}>{workspace.projects.filter(project=>!project.closed).map(project=><option key={project.id} value={project.id}>{project.title}</option>)}</select>
          </header>
          {everReady.current&&visited.has(p.id)&&(!homeOpen||frames.current.has(p.id)) && <iframe key={p.id} ref={node => { if (node) frames.current.set(p.id, node); else frames.current.delete(p.id); }} title={`Project editor: ${p.title}`} src={`/?project-tab=${p.id}`} />}
        </section>)}
        {comparison.pair&&<ProjectComparisonDivider ratio={comparison.ratio} disabled={!storageReady||storageBusy||!!pending} onChange={ratio=>changeComparison({...comparisonRef.current,ratio},false)} onCommit={saveComparison}/>}
        {!workspace.active && <div className="project-empty"><h1>Your projects</h1><p>Open a drawing or create a project. Closed projects keep their recovery copy.</p><button onClick={() => add()}>New project</button><button onClick={() => file.current?.click()}>Open project</button></div>}
      </div>
    </>}
    {bundleOpen&&<ProjectBundleDialog workspace={workspace} onClose={()=>setBundleOpen(false)} snapshot={snapshotForBundle} onImport={importBundle} download={download}/>}
    {managerOpen&&<ProjectManager initialFilter={managerFilter} workspace={workspace} statuses={statuses} notice={error} busy={!!pending||storageBusy} onClose={()=>setManagerOpen(false)} onOpen={activate}
      onCloseProject={id=>requestCheckpoint(id,"close")} onExport={exportManagedProject} onDelete={deleteManagedProject}
      onClean={id=>manageStorage(()=>cleanProjectAssets(localStorage,current.current,id,journal))} onRecover={addRecoveredProject} onRefresh={refreshManagedWorkspace} onDownloadRecovery={()=>void downloadRecovery()}/>}
    {renaming && <dialog className="project-rename" ref={renameDialog} onCancel={() => setRenaming(null)} aria-label="Rename project"><form onSubmit={e => { e.preventDefault(); if (!title.trim()) return; const rename = () => { try { commit({ ...current.current, projects: current.current.projects.map(p => p.id === renaming ? { ...p, title: title.trim().slice(0,120) } : p) }); setRenaming(null); } catch (reason) { fail(reason, rename); } }; rename(); }}><label>Project name<input maxLength={120} value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => { if(isCompositionKey(e.nativeEvent)){if(e.key==="Enter")e.preventDefault();return;} if(e.key === "Escape") setRenaming(null); }} /></label><button type="submit">Rename</button><button type="button" onClick={() => setRenaming(null)}>Cancel</button></form></dialog>}
  </main>;
}
