import { createRoot } from "react-dom/client";
import { App } from "../src/App";
import "../src/ui/tokens.css";import "../src/ui/workstation.css";import "../src/ui/commands.css";import "../src/ui/menu.css";import "../src/ui/explorer.css";import "../src/ui/inspector.css";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory } from "../src/state/history";
import { isDocumentCommandPending } from "../src/state/documentCommandQueue";
import { buildExtrudeMesh } from "../src/cad/kernelGeometryService";
import { installBrowserChecks } from "./helpers/browserChecks";
createRoot(document.getElementById("root")!).render(<App/>);
const button=document.getElementById("run-regions") as HTMLButtonElement, output=document.getElementById("region-result")!;
const pause=()=>new Promise<void>(resolve=>setTimeout(resolve,30));
const state=()=>{const {revision:_,...data}=cadDocument;return JSON.stringify(data);};
async function waitFor(check:()=>boolean){const deadline=Date.now()+15000;while(!check()){if(Date.now()>deadline)throw new Error("UI condition timed out");await pause();}await pause();}
async function click(name:string){const element=Array.from(document.querySelectorAll<HTMLButtonElement>("#root button")).find(entry=>(entry.getAttribute("aria-label")??entry.textContent?.trim())===name);if(!element)throw new Error(`Missing ${name}`);element.click();await pause();await waitFor(()=>!isDocumentCommandPending());}
async function keys(text:string){for(const key of text){document.body.dispatchEvent(new KeyboardEvent("keydown",{key,bubbles:true}));await pause();}document.body.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));await pause();await waitFor(()=>!isDocumentCommandPending());}
async function depth(value:string){const input=document.querySelector<HTMLInputElement>('[aria-label="Extrusion depth"]')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,value);input.dispatchEvent(new Event("input",{bubbles:true}));await pause();}
const ready=()=>Boolean(document.querySelector<HTMLButtonElement>('.extrusion-session button[type="submit"]') && !document.querySelector<HTMLButtonElement>('.extrusion-session button[type="submit"]')!.disabled);
button.onclick=async()=>{button.disabled=true;const lines:string[]=[];const check=(value:unknown,label:string)=>{if(!value)throw new Error(label);lines.push(`PASS: ${label}`);output.textContent=lines.join("\n");};try{
  await waitFor(()=>Boolean(document.querySelector("#root canvas")));await click("New document");await click("2D");document.getElementById("tools-tab-draw")!.click();await pause();
  await click("Rectangle");await keys("0,0");await keys("100,60");document.body.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));await pause();
  await click("Circle");for(const center of ["15,15","85,15","15,45","85,45"]){await keys(center);await keys("4");}document.body.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));await pause();
  document.body.dispatchEvent(new KeyboardEvent("keydown",{key:"a",ctrlKey:true,bubbles:true}));await pause();
  const before=state(), history=cadHistory.getPastLabels().length;
  document.getElementById("tools-tab-model")!.click();await pause();await click("Extrude");await waitFor(ready);
  check(Boolean(document.querySelector('.extrusion-session')?.textContent?.includes("4 holes")),"Outer plate and four inner circles appear as one selectable region with four holes");
  check(state()===before && cadHistory.getPastLabels().length===history,"Real Worker preview makes no document/history edit");
  document.querySelector<SVGPathElement>('[data-region-id]')!.dispatchEvent(new MouseEvent("click",{bubbles:true}));await pause();check(!ready(),"Canvas region click deselects the region and disables Apply");
  document.querySelector<HTMLInputElement>('[aria-label="Extrude region 1"]')!.click();await pause();await depth("0");check(!ready(),"Zero depth is rejected before Apply");
  await depth("8mm");await waitFor(ready);await click("Apply extrusion");
  const solid=Object.values(cadDocument.features).find(entry=>entry.type==="extrude")!;
  check(solid.params.distance===8 && (solid.params.profile as {holes:unknown[]}).holes.length===4 && cadHistory.getPastLabels().length===history+1,"Apply commits the chosen depth and four holes in one history entry");
  const mesh=await buildExtrudeMesh(solid.params);check(mesh.indices.length>0,"Committed region generates real Worker triangles");
  const after=state();await click("Undo");check(state()===before,"Extrusion Undo restores all source boundaries and complete document");await click("Redo");check(state()===after,"Redo restores the hole-bearing solid and live inputs");
  output.textContent=lines.join("\n")+`\nALL ${lines.length} CHECKS PASSED`;
}catch(error){output.textContent=lines.join("\n")+`\nFAIL: ${error instanceof Error?error.message:String(error)}`;}};
installBrowserChecks(button,output);
