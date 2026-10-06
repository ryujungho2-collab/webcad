import {createRoot} from "react-dom/client";
import {App} from "../src/App";
import "../src/ui/tokens.css";import "../src/ui/workstation.css";import "../src/ui/commands.css";import "../src/ui/menu.css";import "../src/ui/explorer.css";import "../src/ui/inspector.css";
import {cadDocument} from "../src/state/cadDocument";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {installBrowserChecks} from "./helpers/browserChecks";
import {click,find,text,choose,waitFor,pause} from "./helpers/physicalInput";
createRoot(document.getElementById("root")!).render(<App/>);
const button=document.getElementById("run-gateway") as HTMLButtonElement,output=document.getElementById("gateway-result")!;
let reply:unknown={version:1,summary:["Circle radius 12 mm"],command:{type:"create-drawing",id:"remote-circle",drawing:"circle",params:{workPlane:"XY",center:[0,0,0],radius:12}}},pending:((r:Response)=>void)|null=null,delay=false,sent:unknown;
const originalFetch=window.fetch.bind(window);
window.fetch=async(url,init)=>{if(String(url).endsWith("/api/copilot/plan")){sent=JSON.parse(String(init?.body));if(delay)return new Promise(resolve=>{pending=resolve;});return new Response(JSON.stringify(reply),{headers:{"Content-Type":"application/json"}});}return originalFetch(url,init);};
const state=()=>{const {revision:_,...rest}=cadDocument;return JSON.stringify(rest);};
const ready=()=>waitFor(()=>!find("Apply").disabled);
button.onclick=async()=>{button.disabled=true;const checks:string[]=[];const check=(v:unknown,s:string)=>{if(!v)throw new Error(s);checks.push(`PASS: ${s}`);output.textContent=checks.join("\n");};
 try{
  await waitFor(()=>!!document.querySelector("canvas"));await click("New document");await click("Copilot");await choose("Copilot planner",1);await text("Copilot prompt","Create a circle with radius 12 mm");const before=state();await click("Plan");await ready();
  check(state()===before&&JSON.stringify(sent).includes('"units":"mm"'),"Gateway response is reviewed without document mutation and receives explicit unit context");
  await text("Copilot prompt","Change my request");check(!document.querySelector('[aria-label="Copilot review"] [data-command-stage="ready"]')&&state()===before,"Editing a prompt invalidates the previous proposal");
  await click("Plan");await ready();await click("Apply");await waitFor(()=>!!cadDocument.objects["remote-circle"]);check(cadDocument.features["feature-remote-circle"].params.radius===12,"Apply uses the reviewed command through the CAD transaction");const after=state();
  await click("Undo");check(state()===before,"Undo restores the document before gateway Apply");await click("Redo");check(state()===after,"Redo restores the exact gateway result");
  reply={version:1,summary:["Bad response"],command:{type:"unknown-operation"}};await text("Copilot prompt","Invalid response test");await click("Plan");await waitFor(()=>!!document.querySelector('[data-testid="copilot-panel"] [role="alert"]'));check(state()===after&&document.body.innerText.includes("invalid version or CAD command"),"Malformed model responses explain recovery and never edit the document");
  delay=true;await text("Copilot prompt","Delayed request");await click("Plan");await waitFor(()=>!!pending);await click("Cancel request");pending!(new Response(JSON.stringify(reply),{headers:{"Content-Type":"application/json"}}));pending=null;await pause();check(state()===after&&!document.body.innerText.includes("Requesting a command"),"Cancelled late response cannot restore an old plan");
  await text("Copilot prompt","Stale document test");await click("Plan");await waitFor(()=>!!pending);await dispatchCadCommand({type:"rename-object",objectId:"remote-circle",name:"Manual edit"});const edited=state();pending!(new Response(JSON.stringify({...reply,command:{type:"create-drawing",drawing:"circle",params:{workPlane:"XY",center:[0,0,0],radius:4}}}),{headers:{"Content-Type":"application/json"}}));pending=null;await waitFor(()=>document.body.innerText.includes("document changed during planning"));check(state()===edited,"A document change during the request prevents the response from reaching Apply");
  output.textContent=checks.join("\n")+`\nALL ${checks.length} CHECKS PASSED`;
 }catch(error){output.textContent=checks.join("\n")+`\nFAIL: ${error instanceof Error?error.stack:error}`;}
};installBrowserChecks(button,output);
