import { createRoot } from "react-dom/client";
import { App } from "../src/App";
import "../src/ui/tokens.css";
import "../src/ui/workstation.css";
import "../src/ui/commands.css";
import "../src/ui/menu.css";
import "../src/ui/explorer.css";
import "../src/ui/inspector.css";
import type { SketchConstraint, SketchGeometry, SketchPoint } from "@agent-webcad/cad-document";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory } from "../src/state/history";
import { saveDocumentToCache } from "../src/state/documentFile";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { isDocumentCommandPending } from "../src/state/documentCommandQueue";
import { resetTestDocument } from "./helpers/documentHarness";
import { installBrowserChecks } from "./helpers/browserChecks";

resetTestDocument();
const ref=(geometryId:string,pointId:string)=>({geometryId,pointId});
const line=(id:string,start:SketchPoint,end:SketchPoint):SketchGeometry=>({id,kind:"line",startId:`${id}:a`,endId:`${id}:b`,segmentId:`${id}:edge`,start,end});
await dispatchCadCommand({type:"create-sketch",id:"motion",workPlane:"XY"});
for(const geometry of [line("horizontal",[0,0],[100,0]),line("linked",[100,0],[160,0]),line("orbit",[0,100],[100,100]),line("locked",[0,200],[100,200]),line("unrelated",[200,0],[250,0])])await dispatchCadCommand({type:"add-sketch-geometry",sketchId:"motion",geometry});
for(const constraint of [
  {id:"horizontal",kind:"horizontal",first:ref("horizontal","horizontal:a"),second:ref("horizontal","horizontal:b")},
  {id:"linked-h",kind:"horizontal",first:ref("linked","linked:a"),second:ref("linked","linked:b")},
  {id:"joint",kind:"coincident",first:ref("horizontal","horizontal:b"),second:ref("linked","linked:a")},
  {id:"orbit-length",kind:"distance",first:ref("orbit","orbit:a"),second:ref("orbit","orbit:b"),value:100},
  {id:"locked-h",kind:"horizontal",first:ref("locked","locked:a"),second:ref("locked","locked:b")},
  {id:"locked-length",kind:"distance",first:ref("locked","locked:a"),second:ref("locked","locked:b"),value:100},
] as SketchConstraint[])await dispatchCadCommand({type:"add-sketch-constraint",sketchId:"motion",constraint});
saveDocumentToCache();createRoot(document.getElementById("root")!).render(<App/>);
const button=document.getElementById("run-motion") as HTMLButtonElement,output=document.getElementById("motion-result")!;
const pause=()=>new Promise<void>(resolve=>setTimeout(resolve,30)),editor=()=>document.querySelector<HTMLElement>('[data-testid="direct-edit-review"]');
const state=()=>{const {revision:_,...value}=cadDocument;return JSON.stringify(value);},history=()=>cadHistory.getPastLabels().length;
const geometry=(id:string)=>cadDocument.sketches!.motion.geometry.find(g=>g.id===id)!;
const near=(a:number,b:number)=>Math.abs(a-b)<1e-5;
const find=(name:string)=>Array.from(document.querySelectorAll<HTMLButtonElement>("#root button")).find(b=>(b.getAttribute("aria-label")??b.textContent?.trim())===name);
async function waitFor(check:()=>boolean){const deadline=Date.now()+12000;while(!check()){if(Date.now()>deadline)throw new Error("UI condition timed out: "+editor()?.textContent);await pause();}await pause();}
async function click(name:string){const b=find(name);if(!b||b.disabled)throw new Error(`Missing or disabled ${name}`);b.click();await pause();await waitFor(()=>!isDocumentCommandPending());}
async function input(action:Record<string,unknown>){const run=new URLSearchParams(location.search).get("run"),response=await fetch(`/__browser_input?run=${run}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(action)});if(!response.ok)throw new Error(await response.text());return response;}
const mouse=(type:string,x:number,y:number)=>input({type,x,y,button:"left",buttons:type==="mouseReleased"?0:1});
async function physical(element:HTMLElement){element.scrollIntoView({block:"nearest"});await pause();const r=element.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;if(!element.contains(document.elementFromPoint(x,y)))throw new Error("Control obscured");await mouse("mousePressed",x,y);await mouse("mouseReleased",x,y);await pause();}
async function type(axis:string,value:string){const e=document.querySelector<HTMLInputElement>(`[aria-label="Direct target ${axis}"]`)!;e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(e,value);e.dispatchEvent(new Event("input",{bubbles:true}));await pause();}
async function handle(id:string){await waitFor(()=>Boolean(document.querySelector(`[data-direct-handle="${id}"]`)));const r=document.querySelector(`[data-direct-handle="${id}"]`)!.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2] as [number,number];}
async function ready(){await waitFor(()=>editor()?.dataset.previewStatus==="ready");await waitFor(()=>Boolean(document.querySelector('[data-preview-side="after"]')));}
async function screenshot(name:string){if(!new URLSearchParams(location.search).has("artifacts"))return;document.querySelector<HTMLElement>("body>aside")!.style.visibility="hidden";const result=await(await input({type:"screenshot"})).json();document.querySelector<HTMLElement>("body>aside")!.style.visibility="";((globalThis as typeof globalThis&{cadTestArtifacts?:Record<string,string>}).cadTestArtifacts??={})[name]=result.data;}
let scale=1;
async function drag(id:string,dx:number,dy:number,release=true){const p=await handle(id),end:[number,number]=[p[0]+dx*scale,p[1]-dy*scale];if(document.elementFromPoint(...p)!==document.querySelector("#root canvas"))throw new Error(`Handle obscured: ${id}`);await mouse("mousePressed",...p);await waitFor(()=>Boolean(document.querySelector('[data-motion-kind]')));await mouse("mouseMoved",...end);await pause();if(release){await mouse("mouseReleased",...end);await pause();}return end;}
function key(key:string){document.querySelector("#root canvas")!.dispatchEvent(new KeyboardEvent("keydown",{key,bubbles:true,cancelable:true}));}
async function selectAt(point:[number,number]){if(document.elementFromPoint(...point)!==document.querySelector("#root canvas"))throw new Error("Selection obscured");await mouse("mousePressed",...point);await mouse("mouseReleased",...point);await pause();}

button.onclick=async()=>{button.disabled=true;const lines:string[]=[],check=(ok:unknown,label:string)=>{if(!ok)throw new Error(label+" · "+editor()?.textContent);lines.push(`PASS: ${label}`);output.textContent=lines.join("\n");};
  try{
    await waitFor(()=>Boolean(document.querySelector("#root canvas")));
    const edit=Array.from(document.querySelectorAll<HTMLButtonElement>("#root button")).find(b=>b.title.startsWith("Edit motion"))!;edit.click();await pause();
    await physical(document.querySelector<HTMLElement>('[data-model-object-id="horizontal"]')!);await click("Hide Explorer");await click("Hide Properties");await click("Fit all geometry");await new Promise(r=>setTimeout(r,350));await click("Direct");
    const a=await handle("horizontal:a"),b=await handle("horizontal:b");scale=(b[0]-a[0])/100;const before=state(),past=history();
    await mouse("mousePressed",...b);await waitFor(()=>Boolean(document.querySelector('[data-motion-kind="line"]')));
    check(editor()?.dataset.directPhase==="dragging"&&document.querySelector('[data-motion-dof="1"]')&&state()===before&&history()===past,"Pointer-down immediately shows this grip's one permitted direction without document or history changes");
    const end:[number,number]=[b[0]+20*scale,b[1]-30*scale];await mouse("mouseMoved",...end);await ready();
    const raw=document.querySelector<SVGCircleElement>('[data-motion-requested]')!,allowed=document.querySelector<SVGCircleElement>('[data-motion-controlled]')!,after=document.querySelector<SVGPolylineElement>('[data-preview-side="after"][data-preview-geometry="horizontal"]')!,linked=document.querySelector<SVGPolylineElement>('[data-preview-side="after"][data-preview-geometry="linked"]')!;
    check(Math.abs(allowed.cy.baseVal.value-(b[1]-document.querySelector("#root canvas")!.getBoundingClientRect().top))<.2&&Math.abs(raw.cy.baseVal.value-allowed.cy.baseVal.value)>20&&Math.abs(after.points.getItem(1).y-allowed.cy.baseVal.value)<.2&&document.querySelector('[data-motion-projection]'),"Trusted diagonal drag distinguishes raw pointer and constrained target; the verified endpoint stays on the horizontal guide");
    check(Math.abs(linked.points.getItem(0).x-after.points.getItem(1).x)<.2&&find("Apply direct edit")?.disabled&&state()===before&&history()===past,"Coincident neighbor follows the full controlled displacement while held-pointer Apply remains disabled");
    await mouse("mouseReleased",...end);await ready();await type("X","140mm");await type("Y","50mm");await ready();
    check(editor()?.textContent?.includes("Allowed target: X 140 mm · Y 0 mm")&&state()===before,"Precision input uses the same motion control and explicitly reports the coordinates that will apply");await screenshot("canvas-motion-projection.png");
    const origin=document.querySelector<SVGRectElement>('[data-motion-origin]')!,oldX=origin.x.baseVal.value,canvas=document.querySelector("#root canvas")!,canvasRect=canvas.getBoundingClientRect(),wheel:[number,number]=[canvasRect.right-50,canvasRect.bottom-60];
    if(document.elementFromPoint(...wheel)!==canvas)throw new Error("Zoom point obscured: "+document.elementFromPoint(...wheel)?.outerHTML.slice(0,250));
    await input({type:"mouseWheel",x:wheel[0],y:wheel[1],deltaX:0,deltaY:-180,modifiers:2});await waitFor(()=>Math.abs(document.querySelector<SVGRectElement>('[data-motion-origin]')!.x.baseVal.value-oldX)>1);
    check(editor()?.textContent?.includes("Allowed target: X 140 mm · Y 0 mm")&&state()===before,"Camera zoom reprojects the direction and targets without changing model coordinates or the proposal");
    await type("Y","50deg");await waitFor(()=>editor()?.dataset.previewStatus==="blocked"&&!document.querySelector('[data-motion-kind]')&&!document.querySelector('[data-preview-side]'));
    check(find("Apply direct edit")?.disabled&&state()===before&&history()===past,"Invalid units clear motion guides and verified ghosts instead of displaying a stale allowed target");
    await type("Y","50mm");await ready();await physical(find("Apply direct edit")!);await waitFor(()=>!editor()&&!isDocumentCommandPending());
    const h=geometry("horizontal"),j=geometry("linked");check(h.kind==="line"&&j.kind==="line"&&near(h.end[0],140)&&near(h.end[1],0)&&near(h.start[0],0)&&near(j.start[0],140)&&history()===past+1,"Apply commits exactly the displayed controlled endpoint and propagation as one transaction");
    const applied=state();await click("Undo");check(state()===before,"One Undo restores the complete document before constrained movement");await click("Redo");check(state()===applied,"Redo reproduces all retained constraints and the reviewed controlled movement");
    await click("Fit all geometry");await new Promise(r=>setTimeout(r,350));const ha=await handle("horizontal:a"),hb=await handle("horizontal:b");scale=(hb[0]-ha[0])/140;
    await drag("horizontal:b",0,30);await waitFor(()=>editor()?.dataset.previewStatus==="unchanged");check(!editor()?.querySelector('[role="alert"]')&&find("Apply direct edit")?.disabled&&document.querySelector('[data-motion-projection]')&&state()===applied&&history()===past+1,"A purely forbidden displacement remains a neutral no-change review with visible projection and no history");await click("Cancel direct edit");
    await selectAt([ha[0]+50*scale,ha[1]-100*scale]);const orbitBefore=state(),orbitPast=history();await drag("orbit:b",20,60);await ready();await type("X","120mm");await type("Y","160mm");await ready();
    const orbitAfter=document.querySelector<SVGPolylineElement>('[data-preview-side="after"][data-preview-geometry="orbit"]')!,guide=document.querySelector<SVGCircleElement>('[data-motion-controlled]')!;
    check(document.querySelector('[data-motion-kind="orbit"][data-motion-dof="1"] [data-motion-orbit]')&&Math.abs(orbitAfter.points.getItem(1).x-guide.cx.baseVal.value)<.2&&Math.abs(orbitAfter.points.getItem(1).y-guide.cy.baseVal.value)<.2&&state()===orbitBefore,"Fixed-length endpoint shows a circular path and the actual verified ghost follows that curve over a large diagonal drag");await screenshot("canvas-motion-orbit.png");
    await physical(find("Apply direct edit")!);await waitFor(()=>!editor()&&!isDocumentCommandPending());const orbit=geometry("orbit"),radius=Math.hypot(120,60);
    check(orbit.kind==="line"&&near(orbit.end[0],120/radius*100)&&near(orbit.end[1],100+60/radius*100)&&near(Math.hypot(orbit.end[0]-orbit.start[0],orbit.end[1]-orbit.start[1]),100)&&history()===orbitPast+1,"Circular movement Apply independently matches the radial projection and retains the original 100 mm distance");await click("Undo");check(state()===orbitBefore,"Circular movement is one exact Undo step");
    await selectAt([ha[0]+50*scale,ha[1]-200*scale]);const lockedBefore=state(),lockedPast=history();await drag("locked:b",20,30);await waitFor(()=>editor()?.dataset.previewStatus==="blocked");
    check(document.querySelector('[data-motion-kind="locked"][data-motion-dof="0"] [data-motion-locked]')&&find("Apply direct edit")?.disabled&&find("Preview release locked-length")&&state()===lockedBefore&&history()===lockedPast,"Fully locked grip shows its retained position and explicit conflict choices despite an unrelated free entity");await screenshot("canvas-motion-locked.png");
    await physical(find("Preview release locked-length")!);await ready();check(document.querySelector('[data-motion-kind="line"][data-motion-dof="1"]')&&editor()?.textContent?.includes("Y 200 mm")&&state()===lockedBefore,"Explicit dimension release immediately recomputes allowed horizontal motion before any commit");
    await click("Keep all constraints");await waitFor(()=>editor()?.dataset.previewStatus==="blocked");check(document.querySelector('[data-motion-kind="locked"]')&&state()===lockedBefore,"Keeping the relation restores the locked guide and conflict without mutation");
    await physical(find("Preview release locked-length")!);await ready();await physical(find("Apply direct edit")!);await waitFor(()=>!editor()&&!isDocumentCommandPending());
    const unlocked=geometry("locked");check(unlocked.kind==="line"&&near(unlocked.end[0],120)&&near(unlocked.end[1],200)&&!cadDocument.sketches!.motion.constraints.some(c=>c.id==="locked-length")&&history()===lockedPast+1,"Explicit release and projected movement apply atomically without releasing the horizontal relation");await click("Undo");check(state()===lockedBefore,"Undo restores the released dimension and the entire pre-drag shape");
    await drag("locked:b",20,30);await waitFor(()=>editor()?.dataset.previewStatus==="blocked");key("Escape");await waitFor(()=>!editor()&&!document.querySelector('[data-motion-kind]'));check(state()===lockedBefore&&history()===lockedPast,"Escape removes the guide and pending proposal without committing a locked drag");
    output.textContent=lines.join("\n")+`\nALL ${lines.length} CHECKS PASSED`;
  }catch(cause){output.textContent=lines.join("\n")+`\nFAIL: ${cause instanceof Error?cause.message:cause}`;}
};installBrowserChecks(button,output);
