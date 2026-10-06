import { createRoot } from "react-dom/client";
import { App } from "../src/App";
import "../src/ui/tokens.css";
import "../src/ui/workstation.css";
import "../src/ui/commands.css";
import "../src/ui/menu.css";
import "../src/ui/explorer.css";
import "../src/ui/inspector.css";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory } from "../src/state/history";
import { saveDocumentToCache } from "../src/state/documentFile";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { isDocumentCommandPending } from "../src/state/documentCommandQueue";
import { queryCadDocument } from "../src/state/documentQuery";
import { resetTestDocument } from "./helpers/documentHarness";
import { createVariablePlate } from "./helpers/variablePlate";
import { installBrowserChecks } from "./helpers/browserChecks";

resetTestDocument();await createVariablePlate();
for(const id of ["guide-a","guide-b","guide-c"]){
  await dispatchCadCommand({type:"add-sketch-geometry",sketchId:"plate-sketch",geometry:{id,kind:"line",start:[0,100],end:[100,100],startId:"start",endId:"end",segmentId:"edge"}});
  if(id!=="guide-c")await dispatchCadCommand({type:"add-sketch-constraint",sketchId:"plate-sketch",constraint:{id:`${id}-horizontal`,kind:"horizontal",first:{geometryId:id,pointId:"start"},second:{geometryId:id,pointId:"end"}}});
}
saveDocumentToCache();createRoot(document.getElementById("root")!).render(<App/>);
const button=document.getElementById("run-target") as HTMLButtonElement,output=document.getElementById("target-result")!;
const pause=()=>new Promise<void>(resolve=>setTimeout(resolve,35)),editor=()=>document.querySelector<HTMLElement>('[data-testid="direct-edit-review"]'),chooser=()=>document.querySelector<HTMLElement>('[data-testid="direct-target-chooser"]');
const state=()=>{const {revision:_,...value}=cadDocument;return JSON.stringify(value);},history=()=>cadHistory.getPastLabels().length,sketch=()=>cadDocument.sketches!["plate-sketch"];
const canvas=()=>document.querySelector<HTMLCanvasElement>("#root canvas")!;
const near=(a:number,b:number)=>Math.abs(a-b)<1e-5;
const find=(name:string)=>Array.from(document.querySelectorAll<HTMLButtonElement>("#root button")).find(b=>(b.getAttribute("aria-label")??b.textContent?.trim())===name);
async function waitFor(check:()=>boolean){const deadline=Date.now()+12000;while(!check()){if(Date.now()>deadline)throw new Error("UI condition timed out: "+editor()?.textContent+" · "+chooser()?.textContent+" · focused "+document.activeElement?.outerHTML.slice(0,200));await pause();}await pause();}
async function click(name:string){const b=find(name);if(!b||b.disabled)throw new Error(`Missing or disabled ${name}`);b.click();await pause();await waitFor(()=>!isDocumentCommandPending());}
async function input(action:Record<string,unknown>){const run=new URLSearchParams(location.search).get("run"),r=await fetch(`/__browser_input?run=${run}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(action)});if(!r.ok)throw new Error(await r.text());return r;}
const mouse=(type:string,x:number,y:number,modifiers=0)=>input({type,x,y,button:"left",buttons:type==="mouseReleased"?0:type==="mouseMoved"?0:1,modifiers});
async function physical(element:HTMLElement){const r=element.getBoundingClientRect(),p:[number,number]=[r.left+r.width/2,r.top+r.height/2];if(!element.contains(document.elementFromPoint(...p)))throw new Error("Control obscured");await mouse("mousePressed",...p);await mouse("mouseReleased",...p);await pause();}
async function key(key:string,modifiers=0){await input({type:"key",key,modifiers});await pause();}
async function replace(value:string){await key("a",2);await input({type:"text",text:value});await pause();}
async function handle(objectId:string,id:string){await waitFor(()=>Boolean(document.querySelector(`[data-handle-object="${objectId}"][data-direct-handle="${id}"]`)));const r=document.querySelector(`[data-handle-object="${objectId}"][data-direct-handle="${id}"]`)!.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2] as [number,number];}
const focused=(objectId:string,id:string)=>document.activeElement?.getAttribute("data-handle-object")===objectId&&document.activeElement?.getAttribute("data-direct-handle")===id;
async function ready(){await waitFor(()=>editor()?.dataset.previewStatus==="ready");await waitFor(()=>Boolean(document.querySelector('[data-preview-side="after"]')));}
async function pointClick(p:[number,number],modifiers=0){if(document.elementFromPoint(...p)!==canvas())throw new Error("Canvas point obscured");await mouse("mousePressed",...p,modifiers);await mouse("mouseReleased",...p,modifiers);await pause();}
async function screenshot(name:string){if(!new URLSearchParams(location.search).has("artifacts"))return;document.querySelector<HTMLElement>("body>aside")!.style.visibility="hidden";const r=await(await input({type:"screenshot"})).json();document.querySelector<HTMLElement>("body>aside")!.style.visibility="";((globalThis as typeof globalThis&{cadTestArtifacts?:Record<string,string>}).cadTestArtifacts??={})[name]=r.data;}

button.onclick=async()=>{button.disabled=true;const lines:string[]=[],check=(ok:unknown,label:string)=>{if(!ok)throw new Error(label+" · "+editor()?.textContent+" · "+chooser()?.textContent);lines.push(`PASS: ${label}`);output.textContent=lines.join("\n");};
  try{
    await waitFor(()=>Boolean(canvas()));const edit=Array.from(document.querySelectorAll<HTMLButtonElement>("#root button")).find(b=>b.title.startsWith("Edit plate-sketch"))!;await physical(edit);
    await physical(document.querySelector<HTMLElement>('[data-model-object-id="outline"]')!);await click("Hide Explorer");await click("Hide Properties");await click("Fit all geometry");await new Promise(r=>setTimeout(r,350));await click("Direct");
    const before=state(),past=history(),rootCount=cadDocument.rootObjects.length;await pointClick(await handle("outline","c"));
    check(document.activeElement===canvas(),"A trusted no-movement grip click focuses the native canvas without editing the drawing");
    await key("Tab");await waitFor(()=>focused("outline","a"));
    check(document.querySelectorAll('[data-direct-handle][tabindex="0"]').length===1&&document.querySelector('[data-target-inspected="a"][data-target-object="outline"]')&&state()===before&&history()===past,"Native Tab enters one visible grip group and previews the source without editing the document");
    await key("ArrowRight");await waitFor(()=>focused("outline","b"));await key("ArrowRight");await waitFor(()=>focused("outline","c"));
    check(document.activeElement?.getAttribute("aria-label")?.includes("Corner 3")&&document.querySelector('.direct-target-caption')?.textContent?.includes("Sketch plate-sketch")&&document.querySelector('[data-target-related="outline"]')&&state()===before,"Arrow navigation identifies the persistent corner, sketch owner and source relations on canvas");await screenshot("canvas-target-keyboard.png");
    await key("Enter");await waitFor(()=>Boolean(editor()));check(editor()?.dataset.directPhase==="review"&&editor()?.dataset.previewStatus==="unchanged"&&document.activeElement===document.querySelector('[aria-label="Direct target X"]')&&document.querySelector('[data-motion-dof="2"]')&&history()===past,"Enter activates a keyboard grip, focuses precision input and shows permitted movement before any change");
    await replace("120mm");await key("Tab");check(document.activeElement===document.querySelector('[aria-label="Direct target Y"]'),"Native Tab keeps the precision input sequence inside the chosen grip's coordinate fields");await replace("80mm");await ready();
    check(cadDocument.rootObjects.length===rootCount&&state()===before&&history()===past&&document.querySelector('[data-impact-variable="holePitch"]')&&document.querySelector('[data-preview-side="after"][data-preview-geometry="hole-3"]'),"Unit entry previews the variable-driven corner and linked holes without triggering letter shortcuts or mutating the model");await screenshot("canvas-target-precision.png");
    await key("Enter");await waitFor(()=>!editor()&&!isDocumentCommandPending()&&focused("outline","c"));
    const solid=await queryCadDocument(["plate-solid"]),outline=sketch().geometry.find(g=>g.id==="outline")!;
    check(outline.kind==="rectangle"&&near(outline.width,120)&&near(outline.height,80)&&cadDocument.variables!.plateWidth.expression==="120mm"&&Object.keys(cadDocument.parameterBindings!).length===10&&Math.abs(solid.objects[0].measurement!.volume!-(120*80-64*Math.PI)*8)<.01&&history()===past+1,"Keyboard Enter applies the exact reviewed corner, parameter graph and independently checked Worker solid once");
    const applied=state();check(focused("outline","c")&&document.querySelector('[data-target-inspected="c"]'),"After Apply the keyboard returns to the same persistent grip for the next edit");
    await key("Escape");check(document.activeElement===canvas()&&Boolean(document.querySelector('[data-direct-handle]'))&&state()===applied,"Escape leaves grip focus for the canvas while preserving Direct mode and selection");
    await key("z",2);await waitFor(()=>state()===before);check(history()===past,"Native Ctrl+Z in Direct mode restores the complete document with one Undo");await key("y",2);await waitFor(()=>state()===applied);check(history()===past+1,"Native Ctrl+Y restores the entire reviewed edit without leaving Direct mode");
    await key("Tab");await waitFor(()=>focused("outline","c"));await key(" ");await waitFor(()=>document.activeElement===document.querySelector('[aria-label="Direct target X"]'));await replace("20deg");await waitFor(()=>editor()?.dataset.previewStatus==="blocked");
    check(!document.querySelector('[data-motion-kind]')&&find("Apply direct edit")?.disabled&&state()===applied&&history()===past+1,"Space activates precision editing; invalid native unit input clears guidance and blocks mutation");await key("Escape");await waitFor(()=>!editor()&&focused("outline","c"));check(state()===applied,"Escape from an invalid precision edit returns to its grip without losing the selection or document");
    await key("Enter");await waitFor(()=>document.activeElement===document.querySelector('[aria-label="Direct target X"]'));await replace("130mm");await ready();await key("z",2);await pause();check(state()===applied&&history()===past+1,"Ctrl+Z inside a coordinate input belongs to text editing and cannot undo the CAD document");await key("Escape");await waitFor(()=>!editor()&&focused("outline","c"));await key("Escape");
    const a=await handle("outline","a"),b=await handle("outline","b"),scale=(b[0]-a[0])/120,overlap:[number,number]=[a[0]+100*scale,a[1]-100*scale];
    await pointClick(overlap);await waitFor(()=>Boolean(chooser()));
    check(["guide-a","guide-b","guide-c"].every(id=>document.querySelector(`[data-choice-object="${id}"][data-target-choice="end"]`))&&!editor()&&state()===applied&&history()===past+1,"An ambiguous click lists all three overlapping endpoints despite their identical topology IDs; it never starts an edit");
    await key("ArrowDown");await waitFor(()=>document.activeElement?.getAttribute("data-choice-object")==="guide-b");
    check(document.querySelector('[data-target-object="guide-b"][data-target-inspected="end"]')&&chooser()?.textContent?.includes("guide-b-horizontal")&&state()===applied,"Candidate navigation previews the exact source and its real relation before selecting it");await screenshot("canvas-target-overlap.png");
    const freeOption=document.querySelector<HTMLElement>('[data-choice-object="guide-c"][data-target-choice="end"]')!,freeRect=freeOption.getBoundingClientRect();await mouse("mouseMoved",freeRect.left+30,freeRect.top+15);await waitFor(()=>document.activeElement===freeOption&&Boolean(document.querySelector('[data-target-object="guide-c"][data-target-inspected="end"]')));
    const relation=document.querySelector<HTMLElement>('.direct-target-relations')!.getBoundingClientRect(),choiceRect=chooser()!.getBoundingClientRect();
    check(chooser()?.textContent?.includes("Free drawing geometry")&&relation.top>=choiceRect.top&&relation.bottom<=choiceRect.bottom&&state()===applied,"Native option hover previews the free source and keeps its relations visible independently of the scrolling candidate list");await key("ArrowUp");await waitFor(()=>document.activeElement?.getAttribute("data-choice-object")==="guide-b");
    await key("Enter");await waitFor(()=>!chooser()&&focused("guide-b","end"));check(!editor()&&state()===applied&&history()===past+1,"Selecting an overlap candidate focuses that object's persistent endpoint without changing geometry or History");
    await key("Enter");await waitFor(()=>document.activeElement===document.querySelector('[aria-label="Direct target X"]'));await replace("120mm");await key("Tab");await replace("130mm");await ready();
    check(editor()?.textContent?.includes("Allowed target: X 120 mm · Y 100 mm")&&document.querySelector('[data-preview-side="after"][data-preview-geometry="guide-b"]')&&!document.querySelector('[data-preview-side="after"][data-preview-geometry="guide-a"]')&&!document.querySelector('[data-preview-side="after"][data-preview-geometry="guide-c"]'),"The chosen endpoint uses its own horizontal constraint and projects precision input without editing either overlapping neighbor");
    await key("Enter");await waitFor(()=>!editor()&&focused("guide-b","end"));const guides=sketch().geometry.filter(g=>g.id.startsWith("guide-"));
    check(guides.every(g=>g.kind==="line"&&near(g.end[0],g.id==="guide-b"?120:100)&&near(g.end[1],100))&&history()===past+2,"Apply changes only the selected object-scoped endpoint even when all neighbors share the same topology ID");const guideApplied=state();
    await key("Escape");await key("z",2);await waitFor(()=>state()===applied);check(history()===past+1,"The explicitly chosen endpoint edit is one complete Undo step");await key("y",2);await waitFor(()=>state()===guideApplied);
    const sharedStart:[number,number]=[a[0],a[1]-100*scale];await pointClick(sharedStart);check(!chooser()&&!editor()&&document.activeElement===canvas()&&state()===guideApplied,"A selected visible grip keeps its object identity on a plain click at three overlapping endpoints");
    await mouse("mousePressed",...sharedStart);await input({type:"mouseMoved",x:sharedStart[0]-10*scale,y:sharedStart[1]-10*scale,button:"left",buttons:1});await mouse("mouseReleased",sharedStart[0]-10*scale,sharedStart[1]-10*scale);await ready();
    check(!chooser()&&Boolean(document.querySelector('[data-preview-side="after"][data-preview-geometry="guide-b"]'))&&!document.querySelector('[data-preview-side="after"][data-preview-geometry="guide-a"]')&&state()===guideApplied&&history()===past+2,"Trusted held-pointer drag of the selected overlapping grip previews only its own constrained source");await key("Escape");await waitFor(()=>!editor());
    await pointClick([a[0],a[1]-100*scale],1);await waitFor(()=>Boolean(chooser()));check(document.querySelectorAll('[data-target-choice="start"]').length===3&&state()===guideApplied,"Alt+click can choose an overlapping target even where the selected source already has a visible grip");await key("Escape");await waitFor(()=>!chooser());check(document.activeElement===canvas()&&state()===guideApplied&&history()===past+2,"Canceling overlap selection returns to canvas with the complete selection and document preserved");
    await pointClick(overlap);await waitFor(()=>Boolean(chooser()));const stale=document.querySelector<HTMLButtonElement>('[data-choice-object="guide-a"][data-target-choice="end"]')!;
    await dispatchCadCommand({type:"set-object-visible",objectId:"guide-a",visible:false});await waitFor(()=>!chooser());stale.click();await pause();check(!chooser()&&!editor()&&document.activeElement===canvas()&&cadDocument.objects["guide-a"].visible===false&&history()===past+3,"A document change invalidates the choice and returns focus to canvas; a late click cannot select or edit its stale target");
    await pointClick(overlap);await waitFor(()=>Boolean(chooser()));check(!document.querySelector('[data-choice-object="guide-a"]')&&Boolean(document.querySelector('[data-choice-object="guide-c"]')),"A fresh choice excludes hidden geometry after an externally dispatched document change");await key("Escape");await click("Undo");await waitFor(()=>state()===guideApplied);
    await pointClick(overlap);await waitFor(()=>Boolean(chooser()));await click("Object");await waitFor(()=>!chooser()&&!document.querySelector('[data-direct-handle]'));check(!document.querySelector('[data-target-inspected]')&&state()===guideApplied,"Switching selection mode clears choices, target inspection and keyboard grips without history");
    output.textContent=lines.join("\n")+`\nALL ${lines.length} CHECKS PASSED`;
  }catch(cause){await screenshot("canvas-target-keyboard.png");output.textContent=lines.join("\n")+`\nFAIL: ${cause instanceof Error?cause.message:cause} · canvas ${canvas()?.outerHTML.slice(0,250)} · grips ${Array.from(document.querySelectorAll('[data-direct-handle]')).map(h=>h.outerHTML.slice(0,240)).join(" / ")}`;}
};installBrowserChecks(button,output);
