import {createRoot} from "react-dom/client";
import {App} from "../src/App";
import "../src/ui/tokens.css";
import "../src/ui/workstation.css";
import "../src/ui/commands.css";
import "../src/ui/menu.css";
import "../src/ui/explorer.css";
import "../src/ui/inspector.css";
import {cadDocument} from "../src/state/cadDocument";
import {cadHistory} from "../src/state/history";
import {isDocumentCommandPending} from "../src/state/documentCommandQueue";
import {queryCadDocument} from "../src/state/documentQuery";
import {DOCUMENT_CACHE_KEY,DOCUMENT_BACKUP_KEY} from "../src/state/documentRecovery";
import {deserializeDocument} from "@agent-webcad/cad-document";
import {installBrowserChecks} from "./helpers/browserChecks";

createRoot(document.getElementById("root")!).render(<App/>);
const button=document.getElementById("run-trust") as HTMLButtonElement,output=document.getElementById("trust-result")!;
const pause=()=>new Promise<void>(resolve=>setTimeout(resolve,30));
async function waitFor(check:()=>boolean){const deadline=Date.now()+20000;while(!check()){if(Date.now()>deadline)throw new Error("UI condition timed out: "+document.querySelector('[data-testid="copilot-panel"]')?.textContent);await pause();}await pause();}
const find=(name:string)=>Array.from(document.querySelectorAll<HTMLButtonElement>("#root button")).find(b=>(b.getAttribute("aria-label")??b.textContent?.trim())===name);
async function click(name:string){const b=find(name);if(!b)throw new Error(`Missing ${name}`);b.click();await pause();await waitFor(()=>!isDocumentCommandPending());}
async function plan(prompt:string){const input=document.querySelector<HTMLInputElement>('[aria-label="Copilot prompt"]')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,prompt);input.dispatchEvent(new Event("input",{bubbles:true}));await pause();await click("Plan");await waitFor(()=>Boolean(find("Apply")&&!find("Apply")!.disabled));}
const state=()=>{const {revision:_,...state}=cadDocument;return JSON.stringify(state);};
const reloadKey="trust-workflow-reload";
button.onclick=async()=>{
  const resumed=sessionStorage.getItem(reloadKey);
  const restart=resumed?JSON.parse(resumed) as {lines:string[];expected:string;id:string}:null;
  const lines:string[]=restart?.lines??[];const check=(value:unknown,label:string)=>{if(!value)throw new Error(label);lines.push(`PASS: ${label}`);output.textContent=lines.join("\n");};
  try{
    if(restart){
      await waitFor(()=>Boolean(document.querySelector("#root canvas")));
      check(state()===restart.expected&&cadHistory.getPastLabels().length===0,"Reload restores the complete last valid checkpoint into a fresh history session");
      check(document.querySelector(".recovery-notice")?.textContent?.includes("Recovered the previous valid checkpoint"),"Reload visibly explains recovery from a damaged working copy");
      const query=await queryCadDocument([restart.id]);
      check(query.objects[0].measurement?.volume===6000&&query.objects[0].measurement?.validity==="valid"&&Boolean(deserializeDocument(localStorage.getItem(DOCUMENT_CACHE_KEY)!).objects[restart.id]),"Recovered source is valid in the real Worker and replaces the damaged cache");
      sessionStorage.removeItem(reloadKey);
      output.textContent=lines.join("\n")+`\nALL ${lines.length} CHECKS PASSED`;
      return;
    }
    await waitFor(()=>Boolean(document.querySelector("#root canvas")));await click("New document");await click("Copilot");
    const before=state();await plan("10x20x30 box");
    check(state()===before&&cadHistory.getPastLabels().length===0,"Planning through the UI evaluates real geometry without a mutation or history entry");
    check(document.querySelector('[data-testid="copilot-panel"]')?.textContent?.includes("6000.0000 mm³"),"Review displays the exact Worker-computed volume");
    await click("Apply");await waitFor(()=>Boolean(document.querySelector("[data-measured-volume]")));
    const id=cadDocument.rootObjects[0],after=state();
    check(cadHistory.getPastLabels().length===1&&Number(document.querySelector("[data-measured-volume]")?.getAttribute("data-measured-volume"))===6000,"Apply produces one history entry and the selected Inspector reports exact volume");
    const query=await queryCadDocument([id]);check(query.objects[0].measurement?.basis==="brep"&&query.objects[0].measurement?.validity==="valid","Browser queries use the actual Worker BRep validation and measurement");
    await click("Undo");check(state()===before,"Undo restores the complete document after a prepared commit");await click("Redo");check(state()===after,"Redo restores the prepared geometry and references");
    await waitFor(()=>Boolean(localStorage.getItem(DOCUMENT_CACHE_KEY)?.includes(id)));
    check(Boolean(localStorage.getItem(DOCUMENT_BACKUP_KEY)),"Automatic recovery preserves a previous valid checkpoint");
    const savedSolid=localStorage.getItem(DOCUMENT_CACHE_KEY)!;
    const originalWrite=Storage.prototype.setItem;
    try{
      Storage.prototype.setItem=function(key:string,value:string){if(key===DOCUMENT_CACHE_KEY)throw new DOMException("Quota exceeded","QuotaExceededError");originalWrite.call(this,key,value);};
      await click("Save document");
      check(Boolean(document.querySelector(".document-modified-label"))&&document.querySelector('.recovery-notice[role="alert"]')?.textContent?.includes("Quota"),"A failed save keeps the Modified state and displays the storage failure");
      check(localStorage.getItem(DOCUMENT_CACHE_KEY)===savedSolid,"A storage failure preserves the last readable checkpoint");
    }finally{Storage.prototype.setItem=originalWrite;}
    await click("Save document");
    check(!document.querySelector(".document-modified-label")&&!document.querySelector(".recovery-notice"),"A successful retry clears the save failure only after writing");
    await plan("radius 5 sphere");await click("New document");await click("Copilot");
    await waitFor(()=>Boolean(document.querySelector('[data-testid="copilot-panel"] [role="alert"]')?.textContent?.includes("document changed")));
    check(!find("Apply")&&(document.querySelector('[aria-label="Copilot prompt"]') as HTMLInputElement).value==="radius 5 sphere","A document change discards a stale prepared plan with an explanation and preserves the prompt");
    check(!find("Apply")&&cadDocument.rootObjects.length===0&&cadHistory.getPastLabels().length===0,"Automatic invalidation removes the review without creating geometry or history");
    // Wait for the New-document debounce before injecting corruption and doing a real reload.
    await new Promise(resolve=>setTimeout(resolve,400));
    localStorage.setItem(DOCUMENT_BACKUP_KEY,savedSolid);
    localStorage.setItem(DOCUMENT_CACHE_KEY,"damaged working copy");
    sessionStorage.setItem(reloadKey,JSON.stringify({lines,expected:after,id}));
    location.reload();
  }catch(error){output.textContent=lines.join("\n")+`\nFAIL: ${error instanceof Error?error.message:String(error)}`;}
};
installBrowserChecks(button,output);
