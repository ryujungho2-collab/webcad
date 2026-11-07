import { createRoot } from "react-dom/client";
import { App } from "../src/App";
import { PROJECT_CHANNEL, embeddedProjectId, projectSessionGeneration } from "../src/app/projectSession";
import "../src/ui/tokens.css";import "../src/ui/workstation.css";import "../src/ui/commands.css";import "../src/ui/menu.css";import "../src/ui/explorer.css";import "../src/ui/inspector.css";
import { serializeDocument } from "@agent-webcad/cad-document";
import type { CadCommand } from "@agent-webcad/cad-commands";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory } from "../src/state/history";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { saveDocumentToCache } from "../src/state/documentFile";
import { isDocumentCommandPending } from "../src/state/documentCommandQueue";
import { resetTestDocument } from "./helpers/documentHarness";
import { installBrowserChecks } from "./helpers/browserChecks";
import { click,find,input,physical,pause,waitFor } from "./helpers/physicalInput";
import { collectExportDrawings } from "../src/export/exportModel";

const reloadKey="layer-isolation-reload", resumed=sessionStorage.getItem(reloadKey);
if(!resumed){
  resetTestDocument();
  const apply=async(c:CadCommand)=>{const r=await dispatchCadCommand(c);if(!r.ok)throw Error(r.reason);};
  for(const id of ["A","B","Hidden","Locked"])await apply({type:"create-layer",id,name:id});
  for(const [id,layer,x,y] of [["a0","A",0,0],["a1","A",0,30],["b0","B",60,0],["h0","Hidden",60,30],["l0","Locked",120,0],["hidden-object","A",120,30]] as const){
    await apply({type:"create-drawing",id,layerId:layer,drawing:"rectangle",params:{workPlane:"XY",points:[[x,y,0],[x+40,y,0],[x+40,y+20,0],[x,y+20,0]]}});
  }
  await apply({type:"set-layer-visible",layerId:"Hidden",visible:false});
  await apply({type:"set-layer-locked",layerId:"Locked",locked:true});
  await apply({type:"set-object-visible",objectId:"hidden-object",visible:false});
  saveDocumentToCache();
}
createRoot(document.getElementById("root")!).render(<App/>);
const button=document.getElementById("run-layer-isolation") as HTMLButtonElement,output=document.getElementById("layer-isolation-result")!;
const row=(id:string)=>document.querySelector<HTMLElement>(`[data-model-object-id="${id}"]`)!, canvas=()=>document.querySelector<HTMLCanvasElement>("#root canvas")!;
const selected=(id:string)=>row(id)?.getAttribute("aria-pressed")==="true";
const isolated=()=>document.body.innerText.includes("Layer isolated view");
const settle=()=>waitFor(()=>!isDocumentCommandPending());
async function selectAll(){canvas().focus();await input({type:"key",key:"a",modifiers:2});await pause();}
async function palette(id:string){canvas().focus();await input({type:"key",key:"k",modifiers:2});await waitFor(()=>!!document.getElementById(`palette-${id}`));await physical(document.getElementById(`palette-${id}`)!);}
button.onclick=async()=>{button.disabled=true;button.style.display="none";const checks:string[]=resumed?JSON.parse(resumed):[];
const check=(ok:unknown,label:string)=>{if(!ok)throw Error(label);checks.push(`PASS: ${label}`);};try{
  await waitFor(()=>!!canvas()&&!!row("a0"));
  if(resumed){
    sessionStorage.removeItem(reloadKey);
    check(!isolated(),"Reload clears temporary layer isolation");
    check(!cadDocument.layers.Hidden.visible&&cadDocument.layers.Locked.locked&&!cadDocument.objects["hidden-object"].visible,"Reload preserves document visibility and locks");
    await selectAll();check(selected("a0")&&selected("b0")&&!selected("l0")&&!selected("h0"),"Reload restores unrestricted visible unlocked selection");
    output.textContent=[...checks,`ALL ${checks.length} CHECKS PASSED`].join("\n");return;
  }
  await click("2D");await click("Fit all geometry");await physical(row("a0"));await click("Direct");
  const controls=(cadDocument.features["feature-a0"].params.topology as {controls:{id:string}[]}).controls;
  const grip=(i:number)=>document.querySelector<SVGRectElement>(`[data-direct-handle="${controls[i].id}"]`);
  await waitFor(()=>!!grip(0)&&!!grip(1)&&!!grip(3));await pause();
  const center=(i:number)=>{const r=grip(i)!.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2];},a=center(0),b=center(1),c=center(3);
  const screen=(x:number,y:number)=>({x:a[0]+x/40*(b[0]-a[0])+y/20*(c[0]-a[0]),y:a[1]+x/40*(b[1]-a[1])+y/20*(c[1]-a[1])});
  async function hit(x:number,y:number){const p=screen(x,y);await input({type:"mousePressed",...p,button:"left",buttons:1});await input({type:"mouseReleased",...p,button:"left",buttons:0});await pause();}
  await click("Object");
  const before=serializeDocument(cadDocument),history=cadHistory.getStateToken(),exported=JSON.stringify(collectExportDrawings("XY"));
  await click("Layers");await click("Isolate selected layers");check(isolated(),"Layers panel activates layer isolation banner");
  await click("Model tree");await selectAll();check(selected("a0")&&selected("a1")&&!selected("b0")&&!selected("hidden-object"),"Ctrl+A selects layer siblings, excludes filtered and hidden objects");
  await physical(row("b0"));check(!selected("b0"),"Explorer selection respects isolated layers");
  await hit(80,0);check(!selected("b0"),"Physical canvas hit test excludes filtered layer");
  await physical(row("a0"));await click("Direct");await waitFor(()=>!!grip(0));
  const excludedControls=(cadDocument.features["feature-b0"].params.topology as {controls:{id:string}[]}).controls;
  check(excludedControls.every(control=>!document.querySelector(`[data-direct-handle="${control.id}"]`)),"Filtered objects expose no direct editing handles");await click("Object");
  const start=screen(55,-5),end=screen(105,25);
  await input({type:"mousePressed",...start,button:"left",buttons:1});await input({type:"mouseMoved",...end,button:"left",buttons:1});await input({type:"mouseReleased",...end,button:"left",buttons:0});await pause();
  check(!selected("b0"),"Physical box selection excludes filtered layer");
  check(serializeDocument(cadDocument)===before&&cadHistory.getStateToken()===history&&JSON.stringify(collectExportDrawings("XY"))===exported,"Isolation and selection do not change document, History or export");
  await click("Exit isolation");await selectAll();check(selected("b0")&&!selected("l0")&&!selected("h0"),"Exit restores other visible layers without unlocking or unhiding");
  await physical(row("a0"));await physical(row("b0"),8);await palette("layer-isolate");check(isolated(),"Command palette isolates multiple selected layers");
  await selectAll();check(selected("a1")&&selected("b0"),"Multi-layer isolation includes siblings from selected layers");
  await physical(row("a0"));await palette("isolate");await selectAll();check(selected("a0")&&!selected("a1")&&!isolated(),"Object isolation replaces layer mode rather than stacking filters");
  await palette("layer-isolate");await selectAll();check(selected("a1")&&isolated(),"Layer mode replaces object isolation");
  await click("Layers");await click("Hide A");await settle();await click("Undo");await settle();check(cadDocument.layers.A.visible,"Undo restores explicit visibility while isolated");await click("Redo");await settle();
  await click("Exit layer isolation");check(!cadDocument.layers.A.visible,"Exit preserves explicit layer visibility edits");
  check(find("Isolate selected layers").disabled,"No selection disables layer isolation");
  await click("Show A");await settle();await click("Model tree");await physical(row("a0"));await palette("layer-isolate");
  await click("Show all");await settle();check(!isolated()&&cadDocument.objects["hidden-object"].visible,"Existing Show all clears isolation and retains its document visibility semantics");
  await click("Undo");await settle();check(!cadDocument.objects["hidden-object"].visible,"Undo restores the explicit Show all visibility edit");
  await physical(row("a0"));await palette("layer-isolate");
  // Exercise the existing host activity protocol without pretending this is a full multi-tab audit.
  const protocol={channel:PROJECT_CHANNEL,id:embeddedProjectId(),generation:projectSessionGeneration(),type:"activity",active:false};
  window.postMessage({...protocol,generation:"stale"},location.origin);await pause();check(isolated(),"Stale project activity messages do not clear the active filter");
  window.postMessage(protocol,location.origin);await waitFor(()=>!isolated());check(true,"Validated project deactivation clears the temporary filter");
  window.postMessage({...protocol,active:true},location.origin);await pause();await physical(row("a0"));await palette("layer-isolate");
  const saved=serializeDocument(cadDocument);
  await input({type:"fileInput",selector:'input[accept=".json,.webcad.json"]',name:"prepared.webcad.json",base64:btoa(unescape(encodeURIComponent(saved)))});
  await waitFor(()=>!isolated());check(cadDocument.objects.a0.layerId==="A","Same-ID file reopen clears isolation and preserves object layers");
  await waitFor(()=>!!row("a0")&&row("a0").getBoundingClientRect().width>0);await physical(row("a0"));await palette("layer-isolate");
  check(!serializeDocument(cadDocument).includes('"isolation"'),"Native saved document contains no temporary filter");
  saveDocumentToCache();sessionStorage.setItem(reloadKey,JSON.stringify(checks));location.reload();
}catch(error){output.textContent=[...checks,`FAIL: ${error instanceof Error?error.stack:String(error)}`].join("\n");}};
installBrowserChecks(button,output);
