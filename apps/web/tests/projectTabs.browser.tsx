import { createRoot } from "react-dom/client";
import { ProjectWorkspace } from "../src/app/ProjectWorkspace";
import { projectStorage } from "../src/app/projectSession";
import { readRecoveryCheckpoint } from "../src/state/documentRecovery";
import { serializeDocument } from "@agent-webcad/cad-document";
import "../src/styles.css";import "../src/ui/tokens.css";
import { input, pause, waitFor, physical } from "./helpers/physicalInput";
import { installBrowserChecks } from "./helpers/browserChecks";
createRoot(document.getElementById("root")!).render(<ProjectWorkspace/>);
const button=document.getElementById("run") as HTMLButtonElement,output=document.getElementById("output")!;
const tabs=()=>[...document.querySelectorAll<HTMLElement>('[role="tab"]')];
const active=()=>document.querySelector<HTMLIFrameElement>('section:not([hidden]) > iframe')!;
const buttons=(doc:Document)=>[...doc.querySelectorAll<HTMLButtonElement>('button')];
async function click(name:string,frame?:HTMLIFrameElement){
  const doc=frame?.contentDocument??document;
  const target=buttons(doc).find(b=>(b.getAttribute('aria-label')??b.textContent?.trim())===name);
  if(!target||target.disabled)throw Error(`Unavailable ${name}`);
  if(!frame){await physical(target);return;}
  target.scrollIntoView({block:'center'});await pause();const r=target.getBoundingClientRect(),f=frame.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
  if(!target.contains(doc.elementFromPoint(x,y)))throw Error(`Obscured ${name}`);
  await input({type:'mousePressed',x:f.left+x,y:f.top+y,button:'left',buttons:1});await input({type:'mouseReleased',x:f.left+x,y:f.top+y,button:'left',buttons:0});await pause();
}
async function ready(){await waitFor(()=>!!active()?.contentDocument?.querySelector('canvas'));await waitFor(()=>buttons(active().contentDocument!).some(b=>b.getAttribute('aria-label')==='Box'&&!b.disabled));return active();}
const count=(frame:HTMLIFrameElement)=>frame.contentDocument!.querySelectorAll('[data-model-object-id]').length;
const reloadKey='project-tabs-reload', restored=sessionStorage.getItem(reloadKey);
button.onclick=async()=>{const lines:string[]=restored?JSON.parse(restored).lines:[],check=(ok:unknown,label:string)=>{if(!ok)throw Error(label);lines.push(`PASS ${label}`);output.textContent=lines.join('\n');};try{
  if(restored){const saved=JSON.parse(restored);const frame=await ready();await waitFor(()=>count(frame)===1);check(tabs().length===saved.tabs,'Page reload restores the project list');check(new URL(frame.src).searchParams.get('project-tab')===saved.active,'Page reload restores the active project');check(count(frame)===1,'Recovered active project contains its own saved geometry');check(buttons(frame.contentDocument!).find(b=>b.getAttribute('aria-label')==='Undo')?.disabled,'Reload explicitly starts a fresh editing history');sessionStorage.removeItem(reloadKey);output.textContent=lines.join('\n')+`\nALL ${lines.length} CHECKS PASSED`;return;}
  await click('New project');const a=await ready(),aTab=tabs().at(-1)!,aId=new URL(a.src).searchParams.get('project-tab')!;
  check(count(a)===0,'New project starts with a separate empty document');
  await click('Box',a);await waitFor(()=>count(a)===1);await click('Save document',a);
  check(readRecoveryCheckpoint(projectStorage(localStorage,aId))?.document.rootObjects.length===1,'Project A saves into its own checkpoint');
  await click('2D',a);
  await click('New document',a);const b=await ready(),bTab=tabs().at(-1)!,bId=new URL(b.src).searchParams.get('project-tab')!;
  check(a!==b&&count(b)===0&&a.isConnected,'File New opens another editor and retains A');
  await click('Box',b);await waitFor(()=>count(b)===1);await click('Box',b);await waitFor(()=>count(b)===2);
  await click('Undo',b);await waitFor(()=>count(b)===1);
  await physical(aTab);check(active()===a&&count(a)===1,'Switching back preserves A and its mounted viewport');
  check(a.contentDocument!.querySelector('[aria-label="2D"]')?.getAttribute('aria-pressed')==='true'&&b.contentDocument!.querySelector('[aria-label="3D"]')?.getAttribute('aria-pressed')==='true','Workspace mode stays local to each tab');
  await click('Undo',a);await waitFor(()=>count(a)===0);check(count(b)===1,'Undo A cannot modify B');
  await physical(bTab);await click('Redo',b);await waitFor(()=>count(b)===2);check(count(a)===0,'Redo B uses only B history');
  await click('Close project Project 3');await waitFor(()=>!b.isConnected);
  check(readRecoveryCheckpoint(projectStorage(localStorage,bId))?.document.rootObjects.length===2,'Closing flushes latest changes before releasing the editor');
  const select=document.querySelector<HTMLSelectElement>('[aria-label="Reopen closed project"]')!;await physical(select);await input({type:'key',key:'End'});await input({type:'key',key:'Enter'});const reopened=await ready();await waitFor(()=>count(reopened)===2);
  check(new URL(reopened.src).searchParams.get('project-tab')===bId,'Closed project reopens its own recovered document');
  check(buttons(reopened.contentDocument!).find(b=>b.getAttribute('aria-label')==='Undo')?.disabled,'Reopened project starts fresh history');
  await physical(aTab);await click('Redo',a);await waitFor(()=>count(a)===1);check(count(a)===1,'A history survives closing and reopening B');
  const before=tabs().length;window.postMessage({channel:'agent-webcad-project-v1',id:aId,type:'new'},location.origin);await pause();check(tabs().length===before,'Unregistered message source cannot create a project');
  await click('Save document',a);
  const fileInput=document.querySelector<HTMLInputElement>('input[type=file]')!;
  const chooseFile=(name:string,text:string)=>{const files=new DataTransfer();files.items.add(new File([text],name,{type:'application/json'}));fileInput.files=files.files;fileInput.dispatchEvent(new Event('change',{bubbles:true}));};
  chooseFile('Copy.webcad.json',serializeDocument(readRecoveryCheckpoint(projectStorage(localStorage,aId))!.document));await waitFor(()=>tabs().length===before+1);const copied=await ready();await waitFor(()=>count(copied)===1);check(new URL(copied.src).searchParams.get('project-tab')!==aId,'Opening a file with the same document ID creates an independent project');
  await click('Box',copied);await waitFor(()=>count(copied)===2);check(count(a)===1,'Edits to an imported copy cannot change the original tab');
  chooseFile('Broken.webcad.json','{"broken":true}');await waitFor(()=>!!document.querySelector('[role=alert]'));check(tabs().length===before+1&&active()===copied,'Invalid file leaves active project and tab list intact');
  await physical(aTab);await click('Save document',a);sessionStorage.setItem(reloadKey,JSON.stringify({lines,tabs:tabs().length,active:aId}));location.reload();
}catch(error){output.textContent=lines.join('\n')+`\nFAIL: ${error instanceof Error?error.stack:String(error)}`;}};
installBrowserChecks(button,output);
