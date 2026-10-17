import { createRoot } from "react-dom/client";
import { ProjectWorkspace } from "../src/app/ProjectWorkspace";
import { projectStorage } from "../src/app/projectSession";
import { projectStorageKeys, portableProject } from "../src/app/projectManagerStore";
import { indexedStorageJournal } from "../src/app/projectStorageTransactions";
import { WORKSPACE_KEY, WORKSPACE_BACKUP_KEY, type Workspace } from "../src/app/projectWorkspaceStore";
import { readRecoveryCheckpoint, writeRecoveryCheckpoint, DOCUMENT_CACHE_KEY, DOCUMENT_RASTER_ASSET_PREFIX } from "../src/state/documentRecovery";
import { deserializeDocument, type CadDocument, type CadRasterAsset } from "@agent-webcad/cad-document";
import "../src/styles.css";import "../src/ui/tokens.css";
import { input, pause, waitFor, physical, text, choose } from "./helpers/physicalInput";
import { installBrowserChecks } from "./helpers/browserChecks";

const reloadKey="project-manager-phase",resumed=sessionStorage.getItem(reloadKey),journal=indexedStorageJournal();
const png="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBScAAAAASUVORK5CYII=";
const sourceBytes=Uint8Array.from(atob(png),c=>c.charCodeAt(0)),hash=[...new Uint8Array(await crypto.subtle.digest("SHA-256",sourceBytes))].map(n=>n.toString(16).padStart(2,"0")).join("");
const asset=(name:string):CadRasterAsset=>({id:`asset-${hash}`,contentHash:hash,name,mimeType:"image/png",width:1,height:1,byteLength:sourceBytes.length,dataUrl:`data:image/png;base64,${png}`});
const empty=(name:string):CadDocument=>({id:"same-cad-id",revision:0,objects:{},features:{},sketches:{},layers:{"layer-default":{id:"layer-default",name:"Default",visible:true,locked:false,objectIds:[]}},rootLayers:["layer-default"],rootObjects:[],rasterAssets:{[asset(name).id]:asset(name)}});
if(!resumed){
  const workspace:Workspace={version:1,active:"b",projects:[{id:"a",title:"도서관 A",closed:true},{id:"b",title:"Maker B",closed:false},{id:"legacy",title:"Legacy",closed:true}]};
  localStorage.setItem(WORKSPACE_KEY,JSON.stringify(workspace));localStorage.setItem(WORKSPACE_BACKUP_KEY,JSON.stringify(workspace));
  writeRecoveryCheckpoint(projectStorage(localStorage,"a"),empty("A image"));writeRecoveryCheckpoint(projectStorage(localStorage,"b"),empty("B image"));writeRecoveryCheckpoint(projectStorage(localStorage,"legacy"),empty("legacy image"));
  writeRecoveryCheckpoint(projectStorage(localStorage,"unlisted"),{...empty("unlisted image"),id:"Recovered extra"});
  projectStorage(localStorage,"a").setItem(DOCUMENT_RASTER_ASSET_PREFIX+"asset-unused","unused image source");
}
createRoot(document.getElementById("root")!).render(<ProjectWorkspace/>);
const run=document.getElementById("run") as HTMLButtonElement,output=document.getElementById("output")!;
const active=()=>document.querySelector<HTMLIFrameElement>('section:not([hidden]) > iframe')!;
const buttons=(doc:Document)=>[...doc.querySelectorAll<HTMLButtonElement>('button')];
const count=(frame:HTMLIFrameElement)=>frame.contentDocument!.querySelectorAll('[data-model-object-id]').length;
const manager=()=>document.querySelector<HTMLDialogElement>('[aria-label="Project manager"]')!;
const rows=()=>[...manager().querySelectorAll<HTMLButtonElement>('[data-project-id]')];
async function ready(){await waitFor(()=>!!active()?.contentDocument?.querySelector('canvas'));await waitFor(()=>buttons(active().contentDocument!).some(b=>b.getAttribute('aria-label')==='Box'&&!b.disabled));return active();}
async function click(name:string,frame?:HTMLIFrameElement){
  const doc=frame?.contentDocument??document,target=buttons(doc).find(b=>(b.getAttribute('aria-label')??b.textContent?.trim())===name);
  if(!target||target.disabled)throw Error(`Unavailable ${name}`);
  if(!frame){await physical(target);return;}
  target.scrollIntoView({block:'center'});await pause();const r=target.getBoundingClientRect(),f=frame.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
  if(!target.contains(doc.elementFromPoint(x,y)))throw Error(`Obscured ${name}`);
  await input({type:'mousePressed',x:f.left+x,y:f.top+y,button:'left',buttons:1});await input({type:'mouseReleased',x:f.left+x,y:f.top+y,button:'left',buttons:0});await pause();
}
async function select(id:string){const row=manager().querySelector(`[data-project-id="${id}"]`)!;await physical(row);await waitFor(()=>row.getAttribute('aria-pressed')==='true');}
async function confirm(name:string){const checkbox=manager().querySelector<HTMLInputElement>('[aria-label="Confirm local data deletion"]')!;if(!checkbox.checked)await physical(checkbox);await click(name);await waitFor(()=>!buttons(document).find(b=>b.getAttribute('aria-label')==='Close project manager')?.disabled);}
const downloaded:Blob[]=[],originalURL=URL.createObjectURL;URL.createObjectURL=function(value:Blob|MediaSource){if(value instanceof Blob)downloaded.push(value);return originalURL.call(URL,value);};
run.onclick=async()=>{
  const saved=resumed?JSON.parse(resumed):null,lines:string[]=saved?.lines??[];
  const check=(ok:unknown,label:string)=>{if(!ok)throw Error(label);lines.push(`PASS ${label}`);output.textContent=lines.join('\n');};
  try{
    if(saved?.phase===3){
      const frame=await ready();await waitFor(()=>count(frame)===0);
      check(JSON.parse(localStorage.getItem(WORKSPACE_KEY)!).projects.length===200,'Interrupted delete restores the full original project list before editor load');
      check(portableProject(localStorage,'p-1','P1').text===saved.p1,'Interrupted delete restores its exact checkpoint and image source');
      check(new URL(frame.src).searchParams.get('project-tab')===saved.active,'Recovery keeps the unrelated active project');
      check((await journal.list()).length===0&&localStorage.getItem(WORKSPACE_KEY)===saved.manifest,'Recovery clears its journal only after exact list restoration');
      check(projectStorageKeys(localStorage,'p-0').length===0,'A previously committed deletion is not resurrected by interruption recovery');
      const artifacts=sessionStorage.getItem(`${reloadKey}-artifacts`);if(artifacts)(globalThis as typeof globalThis&{cadTestArtifacts?:Record<string,string>}).cadTestArtifacts=JSON.parse(artifacts);
      sessionStorage.removeItem(reloadKey);sessionStorage.removeItem(`${reloadKey}-artifacts`);output.textContent=lines.join('\n')+`\nALL ${lines.length} CHECKS PASSED`;return;
    }
    if(saved?.phase===2){
      await waitFor(()=>!!document.querySelector('[aria-label="New project"]')&&!document.querySelector<HTMLButtonElement>('[aria-label="New project"]')!.disabled);
      await click('New project');await waitFor(()=>manager()?.open===true);
      check(manager().textContent!.includes('200/200')&&JSON.parse(localStorage.getItem(WORKSPACE_KEY)!).projects.length===200,'Creating at the 200-project limit opens the storage manager without allocating another document');
      await choose('Project filter',2);await select('p-0');await click('Export WebCAD file');await waitFor(()=>manager().textContent!.includes('Download started'));
      check(deserializeDocument(await downloaded.at(-1)!.text()).id==='same-cad-id','A closed project at capacity still exports a portable file');
      await click('Delete project…');await confirm('Delete permanently');await waitFor(()=>JSON.parse(localStorage.getItem(WORKSPACE_KEY)!).projects.length===199);
      check(projectStorageKeys(localStorage,'p-0').length===0&&manager().textContent!.includes('199/200'),'Explicit deletion frees the slot and selected local data at capacity');
      await click('Close project manager');await click('New project');const fresh=await ready();
      check(count(fresh)===0&&JSON.parse(localStorage.getItem(WORKSPACE_KEY)!).projects.length===200,'A freed capacity slot can create a working independent project');
      // Durable journal fault fixture: stop halfway through a deletion and perform a real page reload.
      const manifest=localStorage.getItem(WORKSPACE_KEY)!,workspace=JSON.parse(manifest) as Workspace,owned=projectStorageKeys(localStorage,'p-1'),p1=portableProject(localStorage,'p-1','P1').text;
      const before=Object.fromEntries([WORKSPACE_KEY,WORKSPACE_BACKUP_KEY,...owned].map(key=>[key,localStorage.getItem(key)]));
      const next={...workspace,projects:workspace.projects.filter(p=>p.id!=='p-1')},after={...Object.fromEntries(owned.map(key=>[key,null])),[WORKSPACE_KEY]:JSON.stringify(next),[WORKSPACE_BACKUP_KEY]:JSON.stringify(next)};
      await journal.put({id:'interruption-fixture',target:'p-1',committed:false,before,after});localStorage.setItem(WORKSPACE_KEY,after[WORKSPACE_KEY]);localStorage.removeItem(owned[0]);
      sessionStorage.setItem(reloadKey,JSON.stringify({phase:3,lines,p1,manifest,active:workspace.active}));location.reload();return;
    }
    const b=await ready();await click('Box',b);await waitFor(()=>count(b)===1);await click('Projects');await waitFor(()=>manager()?.open===true);
    check(rows().length===4&&manager().textContent!.includes('3/200'),'Manager lists open, closed, legacy and unlisted recovery projects');
    check(manager().textContent!.includes('not the localStorage quota'),'Capacity display distinguishes estimated storage from guaranteed free space');
    let screenshot:string|undefined;
    if(new URLSearchParams(location.search).get('artifacts')==='1'){
      await select('a');const aside=document.querySelector<HTMLElement>('body>aside')!;aside.style.visibility='hidden';
      try{screenshot=(await(await input({type:'screenshot'})).json()).data;}finally{aside.style.visibility='';}
    }
    await choose('Project filter',2);await text('Search projects','도서관');await waitFor(()=>rows().length===1);await select('a');
    check(rows()[0].dataset.projectId==='a','Closed-project search supports Korean project names');
    const unchanged=projectStorage(localStorage,'a').getItem(DOCUMENT_CACHE_KEY);
    await click('Delete project…');check(buttons(document).find(button=>button.textContent==='Delete permanently')!.disabled,'Permanent deletion requires an explicit review confirmation');await click('Cancel');
    check(projectStorage(localStorage,'a').getItem(DOCUMENT_CACHE_KEY)===unchanged,'Cancelling deletion preserves current and previous data');
    await click('Export WebCAD file');await waitFor(()=>manager().textContent!.includes('Download started'));
    const file=await downloaded.at(-1)!.text();check(deserializeDocument(file).rasterAssets![asset('A').id].name==='A image','Selected export embeds the selected image source despite identical internal CAD IDs');
    if(screenshot)sessionStorage.setItem(`${reloadKey}-artifacts`,JSON.stringify({'project-manager-storage-2026-10-14.png':screenshot,'exported-project.webcad.json':file}));
    await click('Clean unused images…');await confirm('Remove unused images');
    check(projectStorage(localStorage,'a').getItem(DOCUMENT_RASTER_ASSET_PREFIX+'asset-unused')===null&&projectStorage(localStorage,'a').getItem(DOCUMENT_RASTER_ASSET_PREFIX+asset('A').id)!==null,'Unused-image cleanup preserves the referenced current source');
    check(projectStorage(localStorage,'b').getItem(DOCUMENT_RASTER_ASSET_PREFIX+asset('A').id)!==null,'Cleanup cannot remove another namespace with the same image identity');
    // Another-window metadata fixture: refuse the stale review, then refresh through the real UI.
    const external=JSON.parse(localStorage.getItem(WORKSPACE_KEY)!) as Workspace;external.projects=external.projects.map(p=>p.id==='a'?{...p,title:'도서관 A 수정'}:p);localStorage.setItem(WORKSPACE_KEY,JSON.stringify(external));
    await click('Delete project…');await confirm('Delete permanently');await waitFor(()=>manager().querySelector('[role=alert]')?.textContent?.includes('list changed')===true);
    check(projectStorage(localStorage,'a').getItem(DOCUMENT_CACHE_KEY)===unchanged&&JSON.parse(localStorage.getItem(WORKSPACE_KEY)!).projects.find((p:{id:string})=>p.id==='a').title==='도서관 A 수정','A stale delete review preserves another window’s updated list and checkpoint');
    await click('Cancel');await click('Refresh storage');await waitFor(()=>manager().querySelector('h2')?.textContent==='도서관 A 수정');
    check(b.isConnected&&count(b)===1,'Refreshing the project list preserves an unrelated live editing session');
    // Force a partial delete failure in the actual Storage area; rollback must restore image and checkpoint.
    const snapshot=projectStorageKeys(localStorage,'a').map(key=>[key,localStorage.getItem(key)]),originalRemove=Storage.prototype.removeItem;let failed=false;
    Storage.prototype.removeItem=function(key:string){if(key.startsWith('agent-webcad-project:a:')&&key.endsWith(DOCUMENT_CACHE_KEY)&&!failed){failed=true;throw Error('Deletion fault fixture');}originalRemove.call(this,key);};
    await click('Delete project…');await confirm('Delete permanently');await waitFor(()=>manager().querySelector('[role=alert]')?.textContent?.includes('Deletion fault')===true);Storage.prototype.removeItem=originalRemove;
    check(snapshot.every(([key,value])=>localStorage.getItem(key!)===value)&&JSON.parse(localStorage.getItem(WORKSPACE_KEY)!).projects.some((p:{id:string})=>p.id==='a'),'Partial deletion failure restores the exact checkpoint, source and project entry');
    check((await journal.list()).length===0&&b.isConnected&&count(b)===1,'Rollback leaves another live editor and its geometry intact');
    // Real deletion at a mocked local-area quota, with the IndexedDB crash journal outside that area.
    const used=()=>Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)!).reduce((sum,key)=>sum+key.length+(localStorage.getItem(key)?.length??0),0),limit=used(),originalSet=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key:string,value:string){const old=this.getItem(key),size=used()-(old?.length??0)+(old===null?key.length:0)+value.length;if(size>limit)throw Error('Quota fixture exceeded');originalSet.call(this,key,value);};
    await confirm('Delete permanently');await waitFor(()=>!JSON.parse(localStorage.getItem(WORKSPACE_KEY)!).projects.some((p:{id:string})=>p.id==='a'));Storage.prototype.setItem=originalSet;
    check(projectStorageKeys(localStorage,'a').length===0&&used()<limit,'Permanent deletion releases bytes without duplicate writes at the local-area limit');
    check(readRecoveryCheckpoint(projectStorage(localStorage,'b'))!.document.rasterAssets![asset('B').id].name==='B image'&&readRecoveryCheckpoint(projectStorage(localStorage,'legacy'))!==null,'Selected deletion preserves both another identical-ID project and legacy recovery');
    check(!JSON.parse(localStorage.getItem(WORKSPACE_BACKUP_KEY)!).projects.some((p:{id:string})=>p.id==='a'),'Deleted project does not survive in the list backup');
    await text('Search projects','');await choose('Project filter',3);await select('unlisted');await click('Add recovered project');await waitFor(()=>JSON.parse(localStorage.getItem(WORKSPACE_KEY)!).projects.some((p:{id:string})=>p.id==='unlisted'));
    check(readRecoveryCheckpoint(projectStorage(localStorage,'unlisted'))!==null,'An unlisted recovery copy can be registered without replacing its source');
    await choose('Project filter',0);await select('b');check(buttons(document).find(button=>button.textContent==='Delete project…')!.disabled,'Open editors require close-before-delete');
    await click('Close project manager');await click('Undo',b);await waitFor(()=>count(b)===0);await click('Redo',b);await waitFor(()=>count(b)===1);
    check(count(b)===1,'Other-project Undo/Redo survives storage cleanup and deletion');
    // Portable download roundtrip uses a test File chooser fixture; navigation and edits remain physical.
    const inputFile=document.querySelector<HTMLInputElement>('input[type=file]')!,files=new DataTransfer();files.items.add(new File([file],'도서관 복사.webcad.json',{type:'application/json'}));inputFile.files=files.files;inputFile.dispatchEvent(new Event('change',{bubbles:true}));await waitFor(()=>active()!==b);const copied=await ready();
    check(readRecoveryCheckpoint(projectStorage(localStorage,new URL(copied.src).searchParams.get('project-tab')!))!.document.rasterAssets![asset('A').id].name==='A image','Exported project reopens in a fresh namespace with self-contained image data');
    await click('Projects');await choose('Project filter',0);await select('b');await click('Show project');await ready();
    const bWindow=b.contentWindow as Window&typeof globalThis,bSet=bWindow.Storage.prototype.setItem;
    bWindow.Storage.prototype.setItem=function(key:string,value:string){if(key.startsWith('agent-webcad-project:b:'))throw Error('Live save quota fixture');bSet.call(this,key,value);};
    await click('Box',b);await waitFor(()=>count(b)===2);await waitFor(()=>document.querySelector('[aria-label="Project save status"]')?.textContent?.includes('Local recovery failed')===true);
    await click('Projects');await select('b');await click('Export WebCAD file');await waitFor(()=>manager().textContent!.includes('Download started'));
    check(deserializeDocument(await downloaded.at(-1)!.text()).rootObjects.length===2&&readRecoveryCheckpoint(projectStorage(localStorage,'b'))!.document.rootObjects.length===1,'Open-project export preserves the latest live snapshot even when local saving is full');
    bWindow.Storage.prototype.setItem=bSet;
    await click('Close project first');await waitFor(()=>!b.isConnected);check(readRecoveryCheckpoint(projectStorage(localStorage,'b'))!.document.rootObjects.length===2,'Manager close action saves the open source before releasing its editor');
    await click('Close project manager');
    const capacity:Workspace={version:1,active:'',projects:Array.from({length:200},(_,i)=>({id:`p-${i}`,title:`Capacity ${i}`,closed:true}))};
    localStorage.setItem(WORKSPACE_KEY,JSON.stringify(capacity));localStorage.setItem(WORKSPACE_BACKUP_KEY,JSON.stringify(capacity));writeRecoveryCheckpoint(projectStorage(localStorage,'p-0'),empty('capacity zero'));writeRecoveryCheckpoint(projectStorage(localStorage,'p-1'),empty('capacity one'));
    sessionStorage.setItem(reloadKey,JSON.stringify({phase:2,lines}));location.reload();
  }catch(error){output.textContent=lines.join('\n')+`\nFAIL: ${error instanceof Error?error.stack:String(error)}`;}
};
installBrowserChecks(run,output);
