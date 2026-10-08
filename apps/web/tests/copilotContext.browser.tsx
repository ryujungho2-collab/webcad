import {createRoot} from "react-dom/client";
import {App} from "../src/App";
import "../src/ui/tokens.css";import "../src/ui/workstation.css";import "../src/ui/commands.css";import "../src/ui/menu.css";import "../src/ui/explorer.css";import "../src/ui/inspector.css";
import {cadDocument} from "../src/state/cadDocument";
import {cadHistory} from "../src/state/history";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {installBrowserChecks} from "./helpers/browserChecks";
import {click,find,text,choose,waitFor,pause,physical} from "./helpers/physicalInput";

createRoot(document.getElementById("root")!).render(<App/>);
const button=document.getElementById("run-context") as HTMLButtonElement,output=document.getElementById("context-result")!;
const originalFetch=window.fetch.bind(window),responders:((response:Response)=>void)[]=[];
let delayed=false,nextId=0,lastRequest:unknown;
function response(){return new Response(JSON.stringify({version:1,summary:["Context circle"],command:{type:"create-drawing",id:`context-circle-${++nextId}`,drawing:"circle",params:{workPlane:"XY",center:[0,0,0],radius:12}}}),{headers:{"Content-Type":"application/json"}});}
window.fetch=async(url,init)=>{
  if(String(url).includes("/api/copilot/context")){lastRequest=JSON.parse(String(init?.body));return delayed?new Promise(resolve=>responders.push(resolve)):response();}
  return originalFetch(url,init);
};
const state=()=>{const {revision:_,...rest}=cadDocument;return JSON.stringify(rest);};
const field=(name:string)=>(document.querySelector(`[aria-label="${name}"]`) as HTMLInputElement|HTMLSelectElement|null)?.value;
const applyVisible=()=>[...document.querySelectorAll<HTMLButtonElement>('[data-testid="copilot-panel"] button')].find(b=>b.textContent?.trim()==="Apply");
const ready=()=>waitFor(()=>!!applyVisible()&&!applyVisible()!.disabled);
async function delayedPlan(prompt:string){delayed=true;await text("Copilot prompt",prompt);await click("Plan");await waitFor(()=>responders.length>0);}
async function replyLate(){responders.shift()!(response());await pause();}
button.onclick=async()=>{button.disabled=true;const checks:string[]=[];const check=(ok:unknown,label:string)=>{if(!ok)throw new Error(label);checks.push(`PASS: ${label}`);output.textContent=checks.join("\n");};
  try{
    await waitFor(()=>!!document.querySelector("canvas"));await click("New document");await click("Copilot");await choose("Copilot planner",1);
    await text("Copilot gateway URL","/api/copilot/context-a");await text("Copilot prompt","First proposal");const before=state();await click("Plan");await ready();
    check(JSON.stringify(lastRequest).includes('"workPlane":"XY"')&&document.querySelector('[aria-label="Copilot request context"]')?.textContent?.includes("XY"),"Review names the request work plane and sends its context");
    await click("Layers");await click("Copilot");
    check(field("Copilot prompt")==="First proposal"&&field("Copilot gateway URL")==="/api/copilot/context-a"&&!applyVisible()?.disabled&&state()===before,"Activity round trip preserves prompt, endpoint and reviewed plan");
    await text("Copilot gateway URL","/api/copilot/context-b");
    check(!applyVisible()&&field("Copilot prompt")==="First proposal","Editing the endpoint clears the old review without losing the prompt");
    await click("Model tree");await click("Copilot");check(field("Copilot gateway URL")==="/api/copilot/context-b","Gateway setting survives an unmounted Copilot panel");
    await delayedPlan("Finish while viewing layers");await click("Layers");await replyLate();delayed=false;
    check(document.querySelector('[aria-label="Layers explorer"]')&&state()===before,"Off-panel response does not navigate away or publish geometry");
    await click("Copilot");await ready();check(field("Copilot prompt")==="Finish while viewing layers"&&field("Copilot gateway URL")==="/api/copilot/context-b","Off-panel proposal returns to the same editable draft and review");
    const historyBefore=cadHistory.getPastLabels().length;await click("Apply");await waitFor(()=>!!cadDocument.objects["context-circle-2"]);
    check(cadHistory.getPastLabels().length===historyBefore+1,"Reviewed off-panel proposal applies as one CAD transaction");const after=state();await click("Undo");check(state()===before,"Undo restores the document before the off-panel proposal");await click("Redo");check(state()===after,"Redo restores the exact reviewed result");

    await dispatchCadCommand({type:"create-drawing",id:"other",drawing:"line",params:{workPlane:"XY",points:[[0,0,0],[30,0,0]]}});
    await click("Model tree");await physical(document.querySelector('[data-model-object-id="other"] .tree-label')!);await click("Copilot");const beforeSelection=state();
    await delayedPlan("Selection changes");await click("Model tree");await physical(document.querySelector('[data-model-object-id="context-circle-2"] .tree-label')!);await replyLate();delayed=false;await click("Copilot");
    check(!applyVisible()&&document.querySelector('[data-testid="copilot-panel"] [role="alert"]')?.textContent?.includes("selection changed")&&state()===beforeSelection,"Selection change cancels the pending proposal and keeps the document unchanged");

    await delayedPlan("Work plane changes");await click("Work plane XY");await replyLate();delayed=false;
    check(!applyVisible()&&document.querySelector('[data-testid="copilot-panel"] [role="alert"]')?.textContent?.includes("work plane changed"),"Work-plane change invalidates a late response");

    await dispatchCadCommand({type:"create-layer",id:"layer-alt"});await delayedPlan("Layer changes");await click("Layers");await waitFor(()=>!!document.querySelector('.layer-row:not(.layer-row-selected)'));await physical(document.querySelector('.layer-row:not(.layer-row-selected)')!);await replyLate();delayed=false;await click("Copilot");
    check(!applyVisible()&&document.querySelector('[data-testid="copilot-panel"] [role="alert"]')?.textContent?.includes("active layer changed"),"Active-layer change invalidates a late response");

    await delayedPlan("Mode changes");await choose("Copilot planner",0);await replyLate();delayed=false;
    check(!applyVisible()&&field("Copilot prompt")==="Mode changes","Planner switch cancels the request and preserves the prompt");await choose("Copilot planner",1);
    check(field("Copilot gateway URL")==="/api/copilot/context-b","Returning to gateway retains its unsaved endpoint draft");

    await delayedPlan("Replace document");await click("New document");await replyLate();delayed=false;await click("Copilot");
    check(!applyVisible()&&field("Copilot prompt")==="Replace document"&&field("Copilot gateway URL")==="/api/copilot/context-b"&&state()!==beforeSelection,"Document replacement rejects the previous request while keeping local Copilot input");
    output.textContent=checks.join("\n")+`\nALL ${checks.length} CHECKS PASSED`;
  }catch(error){output.textContent=checks.join("\n")+`\nFAIL: ${error instanceof Error?error.stack:error}`;}
};installBrowserChecks(button,output);
