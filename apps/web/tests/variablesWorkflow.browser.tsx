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
import {saveDocumentToCache} from "../src/state/documentFile";
import {isDocumentCommandPending} from "../src/state/documentCommandQueue";
import {queryCadDocument} from "../src/state/documentQuery";
import {parameterTargetKey} from "@agent-webcad/cad-document";
import {resetTestDocument} from "./helpers/documentHarness";
import {createVariablePlate} from "./helpers/variablePlate";
import {installBrowserChecks} from "./helpers/browserChecks";

const reloadKey="variables-workflow-reload";
// Set up the mechanical model through real commands; the editing journey below uses the UI.
if(!sessionStorage.getItem(reloadKey)){resetTestDocument();await createVariablePlate();saveDocumentToCache();}
createRoot(document.getElementById("root")!).render(<App/>);
const button=document.getElementById("run-variables") as HTMLButtonElement,output=document.getElementById("variables-result")!;
const pause=()=>new Promise<void>(resolve=>setTimeout(resolve,30));
async function waitFor(check:()=>boolean){const deadline=Date.now()+20000;while(!check()){if(Date.now()>deadline)throw new Error("UI condition timed out: "+document.querySelector('[data-testid="variables-panel"]')?.textContent);await pause();}await pause();}
const find=(name:string)=>Array.from(document.querySelectorAll<HTMLButtonElement>("#root button")).find(b=>(b.getAttribute("aria-label")??b.textContent?.trim())===name);
async function click(name:string){const b=find(name);if(!b||b.disabled)throw new Error(`Missing or disabled ${name}`);b.click();await pause();await waitFor(()=>!isDocumentCommandPending());}
async function input(label:string,value:string){const element=document.querySelector<HTMLInputElement|HTMLSelectElement>(`[aria-label="${label}"]`);if(!element)throw new Error(`Missing ${label}`);Object.getOwnPropertyDescriptor(element instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype,"value")!.set!.call(element,value);element.dispatchEvent(new Event(element instanceof HTMLSelectElement?"change":"input",{bubbles:true}));await pause();}
const state=()=>{const {revision:_,...state}=cadDocument;return JSON.stringify(state);};
async function reviewWidth(value:string){await input("Expression for plateWidth",value);await click("Preview plateWidth");await waitFor(()=>Boolean(find("Apply parameter change")||document.querySelector('[data-testid="variables-panel"] [role="alert"]')));}
button.onclick=async()=>{
  const resumed=sessionStorage.getItem(reloadKey),restart=resumed?JSON.parse(resumed) as {lines:string[];expected:string;volume:number}:null;
  const lines:string[]=restart?.lines??[],check=(value:unknown,label:string)=>{if(!value)throw new Error(label);lines.push(`PASS: ${label}`);output.textContent=lines.join("\n");};
  try{
    await waitFor(()=>Boolean(document.querySelector("#root canvas")));await click("Variables");
    if(restart){
      check(state()===restart.expected&&cadHistory.getPastLabels().length===0,"Reload restores variables, bindings, solved sketch projections and exact feature parameters into a fresh session");
      check(document.querySelector('[data-variable="plateWidth"]')?.textContent==="120 mm","Reload displays the restored evaluated variable rather than a stale draft");
      const query=await queryCadDocument(["plate-solid"]);check(query.objects[0].measurement?.validity==="valid"&&Math.abs(query.objects[0].measurement!.volume!-restart.volume)<1e-5&&Object.keys(query.bindings).length===10,"Restored binding graph still yields the expected valid Worker BRep");
      sessionStorage.removeItem(reloadKey);output.textContent=lines.join("\n")+`\nALL ${lines.length} CHECKS PASSED`;return;
    }
    await input("New variable name","halfWidth");await input("New variable expression","plateWidth / 2");await click("Add variable");
    check(document.querySelector('[data-variable="halfWidth"]')?.textContent==="50 mm","Add variable resolves a unit-aware expression through the actual UI");
    await click("Remove halfWidth");check(!cadDocument.variables?.halfWidth,"Removing an unused variable is an undoable definition edit");
    const initial=state(),initialHistory=cadHistory.getPastLabels().length;
    await input("New variable name"," plateWidth ");await input("New variable expression","5mm");await click("Add variable");
    check(state()===initial&&cadHistory.getPastLabels().length===initialHistory&&document.querySelector('[data-testid="variables-panel"] [role="alert"]')?.textContent?.includes("Name already exists"),"Duplicate names with surrounding spaces do not silently replace a variable");
    const before=state(),history=cadHistory.getPastLabels().length;
    await reviewWidth("120mm");
    check(state()===before&&cadHistory.getPastLabels().length===history,"Variable preview preserves the entire model and history");
    check(document.querySelector('[data-testid="parameter-review"]')?.textContent?.includes("holePitch")&&document.querySelector('[data-testid="parameter-review"]')?.textContent?.includes("mm³"),"Review reports derived pitch and the actual Worker volume change");
    await click("Discard parameter change");check(state()===before,"Discard changes neither variable definitions nor geometry");
    await reviewWidth("120mm");await click("Apply parameter change");
    const after=state(),geometry=cadDocument.sketches!["plate-sketch"].geometry;
    check(cadHistory.getPastLabels().length===history+1&&geometry[0].kind==="rectangle"&&Math.abs(geometry[0].width-120)<1e-6,"Apply updates the driving width as one undoable transaction");
    const last=geometry.find(entry=>entry.id==="hole-3")!;check(last.kind==="circle"&&Math.abs(last.center[0]-110)<1e-6,"Changing plateWidth preserves edge margin while moving the dependent hole center");
    const query=await queryCadDocument(["plate-solid"]);check(Math.abs(query.objects[0].measurement!.volume!-(120*60-4*Math.PI*16)*8)<0.003&&query.objects[0].measurement?.validity==="valid","The edited through-hole plate is valid and matches its analytic volume within propagated solver tolerance");
    await click("Undo");check(state()===before,"Undo restores complete definitions, bindings, sketches and solid");await click("Redo");check(state()===after,"Redo restores the same full parametric state");
    for(const expression of ["120deg","holePitch"]){await reviewWidth(expression);check(state()===after&&Boolean(document.querySelector('[data-testid="variables-panel"] [role="alert"]')),"UI rejects "+(expression==="120deg"?"incompatible angle units":"cyclic variable dependencies")+" without mutation");}
    await click("Remove edgeMargin");check(state()===after&&document.querySelector('[data-testid="variables-panel"] [role="alert"]')?.textContent?.includes("Unknown variable"),"Removing an in-use variable explains the broken dependency and preserves the model");
    await input("Binding target",parameterTargetKey({kind:"feature",objectId:"plate-solid",parameter:"distance"}));await input("Binding expression","thickness * 1.5");await click("Preview binding edit");await waitFor(()=>Boolean(find("Apply parameter change")));await click("Apply parameter change");
    check(cadDocument.features["feature-plate-solid"].params.distance===12&&Object.keys(cadDocument.parameterBindings!).length===10,"Editing a binding in the UI updates extrusion depth without duplicating the relationship");
    const bound=state();await reviewWidth("140mm");await click("Undo");await click("Redo");
    check(state()===bound&&Boolean(find("Apply parameter change")?.disabled)&&document.querySelector('[data-testid="variables-panel"]')?.textContent?.includes("document changed"),"Undo/Redo invalidates an old preview even when document contents return to the same values");
    await click("Discard parameter change");
    document.body.dispatchEvent(new KeyboardEvent("keydown",{key:"s",ctrlKey:true,bubbles:true,cancelable:true}));await pause();
    check(!document.querySelector(".document-modified-label"),"Keyboard Save records the current variable-only editing fingerprint");
    const saved=await queryCadDocument(["plate-solid"]);
    sessionStorage.setItem(reloadKey,JSON.stringify({lines,expected:state(),volume:saved.objects[0].measurement!.volume}));location.reload();
  }catch(error){output.textContent=lines.join("\n")+`\nFAIL: ${error instanceof Error?error.message:String(error)}`;}
};
installBrowserChecks(button,output);
