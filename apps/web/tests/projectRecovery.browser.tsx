import { createRoot } from "react-dom/client";
import { ProjectWorkspace } from "../src/app/ProjectWorkspace";
import { projectStorage } from "../src/app/projectSession";
import { readRecoveryCheckpoint, writeRecoveryCheckpoint, DOCUMENT_CACHE_KEY } from "../src/state/documentRecovery";
import { WORKSPACE_KEY, WORKSPACE_BACKUP_KEY, WORKSPACE_DAMAGED_KEY } from "../src/app/projectWorkspaceStore";
import type { CadDocument } from "@agent-webcad/cad-document";
import "../src/styles.css"; import "../src/ui/tokens.css";
import { input, pause, waitFor, physical } from "./helpers/physicalInput";
import { installBrowserChecks } from "./helpers/browserChecks";

const reloadKey = "project-recovery-phase", resumed = sessionStorage.getItem(reloadKey);
if (!resumed) {
  const empty = (id:string):CadDocument => ({id,revision:0,objects:{},features:{},sketches:{},layers:{"layer-default":{id:"layer-default",name:"Default",visible:true,locked:false,objectIds:[]}},rootLayers:["layer-default"],rootObjects:[]});
  writeRecoveryCheckpoint(projectStorage(localStorage,"a"),empty("document-a")); writeRecoveryCheckpoint(projectStorage(localStorage,"b"),empty("document-b"));
  projectStorage(localStorage,"unreadable").setItem(DOCUMENT_CACHE_KEY,"unreadable drawing");
  localStorage.setItem(WORKSPACE_KEY,"damaged project list");
  localStorage.setItem(WORKSPACE_BACKUP_KEY,JSON.stringify({version:1,active:"a",projects:[{id:"a",title:"Recovered A",closed:false},{id:"b",title:"Recovered B",closed:false}]}));
}
createRoot(document.getElementById("root")!).render(<ProjectWorkspace/>);
const run=document.getElementById("run") as HTMLButtonElement,output=document.getElementById("output")!;
const active=()=>document.querySelector<HTMLIFrameElement>('section:not([hidden]) > iframe')!;
const buttons=(doc:Document)=>[...doc.querySelectorAll<HTMLButtonElement>('button')];
const count=(frame:HTMLIFrameElement)=>frame.contentDocument!.querySelectorAll('[data-model-object-id]').length;
const status=()=>document.querySelector('[aria-label="Project save status"]')?.textContent??"";
async function ready(){await waitFor(()=>!!active()?.contentDocument?.querySelector('canvas'));await waitFor(()=>buttons(active().contentDocument!).some(b=>b.getAttribute('aria-label')==='Box'&&!b.disabled));return active();}
async function click(name:string,frame?:HTMLIFrameElement){
  const doc=frame?.contentDocument??document,target=buttons(doc).find(b=>(b.getAttribute('aria-label')??b.textContent?.trim())===name);
  if(!target||target.disabled)throw Error(`Unavailable ${name}`);
  if(!frame){await physical(target);return;}
  target.scrollIntoView({block:'center'});await pause();const r=target.getBoundingClientRect(),f=frame.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
  if(!target.contains(doc.elementFromPoint(x,y)))throw Error(`Obscured ${name}`);
  await input({type:'mousePressed',x:f.left+x,y:f.top+y,button:'left',buttons:1});await input({type:'mouseReleased',x:f.left+x,y:f.top+y,button:'left',buttons:0});await pause();
}
run.onclick=async()=>{
  const saved=resumed?JSON.parse(resumed):null,lines:string[]=saved?.lines??[];
  const check=(ok:unknown,label:string)=>{if(!ok)throw Error(label);lines.push(`PASS ${label}`);output.textContent=lines.join('\n');};
  try{
    if(saved?.phase===3){
      const a=await ready();await waitFor(()=>count(a)===2);
      check(new URL(a.src).searchParams.get('project-tab')==='a'&&count(a)===2,'Rescued project list and latest geometry survive another full reload');
      check(buttons(a.contentDocument!).find(b=>b.getAttribute('aria-label')==='Undo')?.disabled,'Recovered project starts a fresh Undo session');
      await waitFor(()=>status().includes('File download not started'));
      check(status().includes('File download not started'),'A new session does not claim a previous download was saved to disk');
      sessionStorage.removeItem(reloadKey);output.textContent=lines.join('\n')+`\nALL ${lines.length} CHECKS PASSED`;return;
    }
    if(saved?.phase===2){
      await waitFor(()=>!!document.querySelector('.project-recovery'));
      check(!document.querySelector('iframe')&&localStorage.getItem(WORKSPACE_KEY)==='both lists damaged','Both damaged lists are preserved without mounting a blank replacement editor');
      await click('Find saved projects');await waitFor(()=>document.querySelector('.project-recovery')!.textContent!.includes('2 readable projects'));
      check(document.querySelector('.project-recovery')!.textContent!.includes('1 unreadable'),'Rescue finds both independent documents and reports the unreadable namespace');
      await click('Restore recovered project list');const a=await ready();await waitFor(()=>count(a)===2);
      check(document.querySelectorAll('[role=tab]').length===2&&count(a)===2,'Explicit rescue reconnects the latest saved geometry with working project tabs');
      check(projectStorage(localStorage,'unreadable').getItem(DOCUMENT_CACHE_KEY)==='unreadable drawing','Rescue leaves unreadable recovery data untouched');
      await click('Save document',a);sessionStorage.setItem(reloadKey,JSON.stringify({phase:3,lines}));location.reload();return;
    }
    await waitFor(()=>!!document.querySelector('.project-recovery'));
    check(!document.querySelector('iframe')&&localStorage.getItem(WORKSPACE_KEY)==='damaged project list','A damaged manifest shows recovery UI and does not overwrite the original');
    await click('Download recovery data');check(localStorage.getItem(WORKSPACE_KEY)==='damaged project list','Downloading raw recovery data does not mutate saved projects');
    await click('Restore backup project list');const a=await ready();
    check(document.querySelectorAll('[role=tab]').length===2&&new URL(a.src).searchParams.get('project-tab')==='a','Restore backup opens its exact projects and active editor');
    check(JSON.parse(localStorage.getItem(WORKSPACE_DAMAGED_KEY)!).primary==='damaged project list','Explicit restore archives the damaged original list');
    await click('Box',a);await waitFor(()=>count(a)===1);await waitFor(()=>status().includes('Saved locally'));
    check(status().includes('File download not started'),'Autosave distinguishes local recovery from a portable file download');
    await click('Download file',a);await waitFor(()=>status().includes('completion unverified'));
    check(status().includes('File download started'),'Download reports initiation and does not claim disk-write completion');
    await click('Undo',a);await waitFor(()=>count(a)===0);await waitFor(()=>status().includes('Saved locally')&&status().includes('Changed since last file download'));
    check(count(a)===0,'Undo updates local recovery while retaining the separate file snapshot');
    await click('Redo',a);await waitFor(()=>count(a)===1);await waitFor(()=>status().includes('Saved locally')&&status().includes('completion unverified'));
    check(status().includes('completion unverified'),'Redo back to the downloaded content restores its snapshot status');
    // Install fault fixtures inside the actual editor realm; all user actions below are physical.
    const win=a.contentWindow as Window & typeof globalThis,script=win.document.createElement('script');script.type='module';script.src='/tests/helpers/projectRecoveryFixture.ts';win.document.body.appendChild(script);
    const fixtureWindow=win as unknown as {projectRecoveryFixture?:{hold:()=>void;release:()=>void}};
    await waitFor(()=>!!fixtureWindow.projectRecoveryFixture);fixtureWindow.projectRecoveryFixture!.hold();await pause();
    await click('Close project Recovered A');await waitFor(()=>document.querySelector('[role=alert]')?.textContent?.includes('still running')===true);
    check(a.isConnected&&count(a)===1,'A pending document command refuses close and keeps its live editor');
    fixtureWindow.projectRecoveryFixture!.release();await pause();await click('Dismiss');
    const originalSet=win.Storage.prototype.setItem;
    win.Storage.prototype.setItem=function(key:string,value:string){if(key.startsWith('agent-webcad-project:a:'))throw Error('Quota fixture exceeded');return originalSet.call(this,key,value);};
    await click('Box',a);await waitFor(()=>count(a)===2);await waitFor(()=>status().includes('Local recovery failed'));
    check(readRecoveryCheckpoint(projectStorage(localStorage,'a'))!.document.rootObjects.length===1,'Quota failure keeps the last valid checkpoint and the live unsaved geometry');
    await click('Retry local save');await waitFor(()=>document.querySelector('[role=alert]')?.textContent?.includes('Quota fixture')===true);
    check(a.isConnected&&status().includes('Local recovery failed'),'Failed retry retains the error and live editor');
    await click('Close project Recovered A');await waitFor(()=>!document.querySelector<HTMLButtonElement>('[aria-label="Close project Recovered A"]')?.disabled);
    check(a.isConnected&&count(a)===2,'Checkpoint failure prevents close without clearing unsaved changes');
    win.Storage.prototype.setItem=originalSet;await click('Retry');await waitFor(()=>!a.isConnected);await ready();
    check(readRecoveryCheckpoint(projectStorage(localStorage,'a'))!.document.rootObjects.length===2,'Retry after quota recovery saves the latest revision before closing');
    const select=document.querySelector<HTMLSelectElement>('[aria-label="Reopen closed project"]')!;await physical(select);await input({type:'key',key:'End'});await input({type:'key',key:'Enter'});const reopened=await ready();await waitFor(()=>count(reopened)===2);
    check(new URL(reopened.src).searchParams.get('project-tab')==='a'&&count(reopened)===2,'Failed-close recovery reopens the exact saved source in its own namespace');
    await waitFor(()=>status().includes('File download not started'));
    check(status().includes('File download not started'),'Closing and reopening clears the old editor session download indicator');
    const manifest=localStorage.getItem(WORKSPACE_KEY)!,parentSet=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key:string,value:string){if(key===WORKSPACE_KEY)throw Error('List quota fixture exceeded');return parentSet.call(this,key,value);};
    await physical(document.querySelector<HTMLElement>('[role=tab][id="project-tab-b"]')!);await waitFor(()=>document.querySelector('[role=alert]')?.textContent?.includes('List quota')===true);
    check(active()===reopened&&localStorage.getItem(WORKSPACE_KEY)===manifest,'Project-list write failure keeps the active editor and prior list');
    Storage.prototype.setItem=parentSet;await click('Retry');const b=await ready();check(new URL(b.src).searchParams.get('project-tab')==='b','Project-list retry succeeds without replacing another document');
    await physical(document.querySelector<HTMLElement>('[role=tab][id="project-tab-a"]')!);await click('Save document',reopened);
    localStorage.setItem(WORKSPACE_KEY,'both lists damaged');localStorage.setItem(WORKSPACE_BACKUP_KEY,'both lists damaged');
    sessionStorage.setItem(reloadKey,JSON.stringify({phase:2,lines}));location.reload();
  }catch(error){output.textContent=lines.join('\n')+`\nFAIL: ${error instanceof Error?error.stack:String(error)}`;}
};
installBrowserChecks(run,output);
