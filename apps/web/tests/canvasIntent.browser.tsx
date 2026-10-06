import { createRoot } from "react-dom/client";
import { App } from "../src/App";
import "../src/ui/tokens.css";
import "../src/ui/workstation.css";
import "../src/ui/commands.css";
import "../src/ui/menu.css";
import "../src/ui/explorer.css";
import "../src/ui/inspector.css";
import { CAD_PRECISION } from "@agent-webcad/cad-document";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory } from "../src/state/history";
import { saveDocumentToCache } from "../src/state/documentFile";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { isDocumentCommandPending } from "../src/state/documentCommandQueue";
import { queryCadDocument } from "../src/state/documentQuery";
import { resetTestDocument } from "./helpers/documentHarness";
import { createVariablePlate } from "./helpers/variablePlate";
import { installBrowserChecks } from "./helpers/browserChecks";

resetTestDocument();await createVariablePlate();saveDocumentToCache();
createRoot(document.getElementById("root")!).render(<App/>);
const button=document.getElementById("run-intent") as HTMLButtonElement,output=document.getElementById("intent-result")!;
const pause=()=>new Promise<void>(resolve=>setTimeout(resolve,30));
const state=()=>{const {revision:_,...document}=cadDocument;return JSON.stringify(document);};
const history=()=>cadHistory.getPastLabels().length;
const sketch=()=>cadDocument.sketches!["plate-sketch"];
const width=()=>sketch().constraints.find(c=>c.id==="width")!;
const editor=()=>document.querySelector<HTMLElement>(".sketch-dimension-editor");
const input=()=>document.querySelector<HTMLInputElement>('[aria-label="Canvas dimension value"]')!;
const find=(name:string)=>Array.from(document.querySelectorAll<HTMLButtonElement>("#root button")).find(b=>(b.getAttribute("aria-label")??b.textContent?.trim())===name);
const runtimeErrors:string[]=[];window.addEventListener("error",event=>runtimeErrors.push(event.message));
async function waitFor(check:()=>boolean){const deadline=Date.now()+18000;while(!check()){if(Date.now()>deadline)throw new Error("UI condition timed out: "+editor()?.textContent);await pause();}await pause();}
async function click(name:string){const b=find(name);if(!b||b.disabled)throw new Error(`Missing or disabled ${name}`);b.click();await pause();await waitFor(()=>!isDocumentCommandPending());}
async function browserInput(action:Record<string,unknown>){const run=new URLSearchParams(location.search).get("run");const response=await fetch(`/__browser_input?run=${run}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(action)});if(!response.ok)throw new Error(await response.text());return response;}
async function pointerClick(name:string){const b=find(name);if(!b||b.disabled)throw new Error(`Missing or disabled ${name}`);b.scrollIntoView({block:"nearest",inline:"nearest"});await pause();const r=b.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);if(!hit||!b.contains(hit))throw new Error(`Button obscured or outside canvas: ${name}`);await browserInput({type:"mousePressed",x,y,button:"left",buttons:1});await browserInput({type:"mouseReleased",x,y,button:"left",buttons:0});await pause();await waitFor(()=>!isDocumentCommandPending());}
async function screenshot(name:string){if(!new URLSearchParams(location.search).has("artifacts"))return;document.querySelector<HTMLElement>("body>aside")!.style.visibility="hidden";const result=await(await browserInput({type:"screenshot"})).json();document.querySelector<HTMLElement>("body>aside")!.style.visibility="";const target=globalThis as typeof globalThis&{cadTestArtifacts?:Record<string,string>};(target.cadTestArtifacts??={})[name]=result.data;}
async function type(value:string){const target=input();if(!target)throw new Error("Canvas editor missing");target.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(target,value);target.dispatchEvent(new Event("input",{bubbles:true}));await pause();}
async function ready(){await waitFor(()=>editor()?.dataset.previewStatus==="ready");await waitFor(()=>Boolean(document.querySelector('[data-preview-side="after"]')));}
async function blocked(){await waitFor(()=>editor()?.dataset.previewStatus==="blocked");}
async function open(){await waitFor(()=>Boolean(find("Canvas Width width")));await pointerClick("Canvas Width width");}
async function ghostsCleared(){await waitFor(()=>!document.querySelector('[data-preview-side]'));}
const near=(a:number,b:number)=>Math.abs(a-b)<1e-5;

button.onclick=async()=>{
  button.disabled=true;const lines:string[]=[];
  const check=(condition:unknown,label:string)=>{if(!condition)throw new Error(label);lines.push(`PASS: ${label}`);output.textContent=lines.join("\n");};
  try{
    await waitFor(()=>Boolean(document.querySelector("#root canvas")));
    const edit=Array.from(document.querySelectorAll<HTMLButtonElement>("#root button")).find(b=>b.title.includes("Edit")&&b.textContent?.includes("plate-sketch"));if(!edit)throw new Error("Edit sketch missing");edit.click();await pause();
    await click("Hide Explorer");await click("Hide Properties");await click("Fit all geometry");await new Promise(resolve=>setTimeout(resolve,350));
    const before=state(),past=history();await open();
    check(document.activeElement===input()&&input().value==="100mm"&&document.querySelector('[data-dimension-driver="variable"]')?.textContent?.includes("plateWidth"),"Canvas identifies and focuses the actual variable driver with both side panels hidden");
    check(state()===before&&history()===past&&document.querySelector('[data-testid="sketch-canvas-context"]')?.textContent?.includes("fully constrained"),"Selecting a dimension reports sketch freedom without changing the document or history");
    await type("120mm");await ready();
    check(state()===before&&history()===past&&Boolean(document.querySelector('[data-preview-side="before"][data-preview-geometry="outline"]'))&&Boolean(document.querySelector('[data-preview-side="after"][data-preview-geometry="hole-3"]')),"Before and solved preview outlines show propagated geometry while the document stays unchanged");
    const a=document.querySelector<SVGPolylineElement>('[data-preview-side="before"][data-preview-geometry="outline"]')!,b=document.querySelector<SVGPolylineElement>('[data-preview-side="after"][data-preview-geometry="outline"]')!;
    check(b.points.getItem(1).x>a.points.getItem(1).x+5&&Math.abs(a.points.getItem(0).x-b.points.getItem(0).x)<.1,"Canvas ghosts visibly extend the width while preserving the anchored origin");
    check(/100.+→.+120/.test(find("Canvas Width width")!.textContent??""),"The canvas dimension itself distinguishes the current and proposed values");
    check(document.querySelector('[data-impact-constraint="height"]')?.getAttribute("data-relation-status")==="maintained"&&document.querySelector('[data-impact-constraint="diameter-3"]')?.getAttribute("data-relation-status")==="maintained"&&document.querySelector('[data-impact-variable="holePitch"]'),"Preview explains maintained height and hole diameter, plus the changed hole pitch");
    const text=document.querySelector('[data-impact-object="plate-solid"]')?.textContent??"",volumes=text.match(/Volume: ([\d.]+) → ([\d.]+)/);
    check(volumes&&Math.abs(Number(volumes[1])-(100*60-64*Math.PI)*8)<.01&&Math.abs(Number(volumes[2])-(120*60-64*Math.PI)*8)<.01&&text.includes("brep"),"Dependent plate impact reports independently checked before/after BRep volumes on the canvas");
    const inspect=find("Inspect relation diameter-3")!;inspect.focus();await waitFor(()=>Boolean(document.querySelector('[data-highlight-geometry="hole-3"].focused')));
    check(!document.querySelector('[data-highlight-geometry="outline"].focused')&&state()===before,"Inspecting a maintained relation highlights its actual geometry without replacing the edit draft");input().focus();await pause();
    const expandedHeight=editor()!.getBoundingClientRect().height;await pointerClick("Collapse review");
    check(editor()!.getBoundingClientRect().height<expandedHeight&&editor()?.dataset.previewStatus==="ready"&&Boolean(document.querySelector('[data-preview-side="after"]')),"Review can collapse to reveal the drawing while keeping the solved preview and Apply controls");await pointerClick("Expand review");
    const formRect=editor()!.getBoundingClientRect(),canvasRect=document.querySelector<HTMLCanvasElement>("#root canvas")!.getBoundingClientRect();
    check(formRect.left>=canvasRect.left&&formRect.right<=canvasRect.right&&formRect.bottom<=canvasRect.bottom,"The docked review and its controls stay inside the actual canvas bounds");
    await screenshot("canvas-dimension-preview.png");
    for(const invalid of ["120deg","holePitch"]){await type(invalid);await blocked();await ghostsCleared();check(state()===before&&history()===past&&find("Apply")?.disabled&&Boolean(editor()?.querySelector('[role="alert"]')),"Invalid "+(invalid==="120deg"?"units":"cyclic variable dependency")+" clears the preview and blocks Apply without mutation");}
    await type("120mm");await ready();input().dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true}));await pause();await ghostsCleared();
    check(!input()&&state()===before&&history()===past,"Escape discards the evaluated proposal and all ghosts without an Undo entry");
    await open();await type("100");await waitFor(()=>editor()?.dataset.previewStatus==="unchanged");check(!editor()?.querySelector('[role="alert"]')&&find("Apply")?.disabled,"Equivalent numeric input stays a neutral unchanged edit");await type("120");await ready();await pointerClick("Apply");await ghostsCleared();
    check(cadDocument.variables!.plateWidth.expression==="120mm"&&Object.keys(cadDocument.parameterBindings!).length===10&&history()===past+1&&!editor(),"Applying the visible preview edits the driver, preserves every binding and creates one Undo step");
    const plate=await queryCadDocument(["plate-solid"]),hole=sketch().geometry.find(g=>g.id==="hole-3")!;
    const volumeTolerance=(2*(120+60)+8*Math.PI*4)*8*CAD_PRECISION.linearTolerance;
    check(hole.kind==="circle"&&near(hole.center[0],110)&&near(hole.radius,4)&&plate.objects[0].measurement?.validity==="valid"&&Math.abs(plate.objects[0].measurement!.volume!-(120*60-64*Math.PI)*8)<volumeTolerance,"Applied sketch and real Worker solid match the preview with anchored margins and unchanged holes");
    const after=state();await click("Undo");check(state()===before,"Undo restores the complete pre-edit parametric document");await click("Redo");check(state()===after,"Redo restores definitions, constraints, bindings and regenerated solid together");
    await open();await type("150mm");await ready();await click("Undo");await waitFor(()=>editor()?.dataset.previewStatus==="stale");await ghostsCleared();
    check(find("Apply")?.disabled&&state()===before&&find("Refresh preview"),"Undo during review removes ghosts and requires an explicit refresh before applying");
    await click("Refresh preview");await ready();check(editor()?.textContent?.includes("150.000"),"Refresh evaluates the retained draft against the current document");await click("Cancel");await ghostsCleared();await click("Redo");
    await dispatchCadCommand({type:"add-sketch-constraint",sketchId:sketch().id,constraint:{...structuredClone(width()),id:"width-lock"}});await click("Undo");await click("Redo");
    const conflictBefore=state(),conflictPast=history();await open();await type("140mm");await blocked();
    check(state()===conflictBefore&&history()===conflictPast&&document.querySelector('[data-constraint-id="width-lock"].conflict')&&document.querySelector('[data-highlight-geometry="outline"].conflict')&&find("Preview release width-lock"),"Rejected variable edit identifies the blocking dimension and affected outline without relaxing constraints");
    await screenshot("canvas-dimension-conflict.png");await pointerClick("Preview release width-lock");await ready();
    check(state()===conflictBefore&&history()===conflictPast&&document.querySelector('[data-impact-constraint="width-lock"]')?.getAttribute("data-relation-status")==="released","Explicit release is reviewed with its changed shape and removed relation before any mutation");
    check(document.querySelector('[data-constraint-id="width-lock"]')?.getAttribute("data-preview-relation-status")==="released","The blocking canvas dimension explicitly marks its pending release until Apply");
    await click("Keep all constraints");await blocked();check(sketch().constraints.some(c=>c.id==="width-lock")&&state()===conflictBefore,"Keeping constraints reverses the release proposal and restores the conflict");
    await pointerClick("Preview release width-lock");await ready();await pointerClick("Apply");
    await waitFor(()=>!editor()&&Boolean(find("Undo")&&!find("Undo")!.disabled));
    const released=state();check(history()===conflictPast+1&&!sketch().constraints.some(c=>c.id==="width-lock")&&cadDocument.variables!.plateWidth.expression==="140mm"&&Object.keys(cadDocument.parameterBindings!).length===10&&runtimeErrors.length===0,"Reviewed release and driver edit commit once, close the editor and retain the live Undo UI without runtime errors");
    await click("Undo");check(state()===conflictBefore,"Undo restores the released constraint and all geometry and driver values");await click("Redo");check(state()===released,"Redo reproduces the reviewed release and edit exactly");
    output.textContent=lines.join("\n")+`\nALL ${lines.length} CHECKS PASSED`;
  }catch(cause){output.textContent=lines.join("\n")+`\nFAIL: ${cause instanceof Error?cause.message:cause} · runtime errors: ${runtimeErrors.join(" / ")} · history Undo: ${cadHistory.canUndo()} · root: ${document.getElementById("root")?.childElementCount}`;}
};
installBrowserChecks(button,output);
