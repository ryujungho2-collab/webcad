import { createRoot } from "react-dom/client";
import { App } from "../src/App";
import "../src/ui/tokens.css";import "../src/ui/workstation.css";import "../src/ui/commands.css";import "../src/ui/menu.css";import "../src/ui/explorer.css";import "../src/ui/inspector.css";
import type { SketchGeometry } from "@agent-webcad/cad-document";
import { serializeDocument } from "@agent-webcad/cad-document";
import { arcIntervalError, curveCurveContact, lineArcContact } from "../src/precision/sketchArcRelations";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory } from "../src/state/history";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { saveDocumentToCache } from "../src/state/documentFile";
import { isDocumentCommandPending } from "../src/state/documentCommandQueue";
import { resetTestDocument } from "./helpers/documentHarness";
import { installBrowserChecks } from "./helpers/browserChecks";

resetTestDocument();
const arc:SketchGeometry={id:"arc",kind:"arc",center:[50,20],radius:20,startAngle:-Math.PI/2,endAngle:0,centerId:"arc:center",startId:"arc:start",endId:"arc:end",curveId:"arc:curve"};
const axis:SketchGeometry={id:"axis",kind:"line",start:[0,0],end:[100,0],startId:"axis:start",endId:"axis:end",segmentId:"axis:edge"};
const circle:SketchGeometry={id:"circle",kind:"circle",center:[90,20],radius:20,centerId:"circle:center",curveId:"circle:curve"};
const point:SketchGeometry={id:"point",kind:"line",start:[-30,40],end:[-10,45],startId:"point:start",endId:"point:end",segmentId:"point:edge"};
for(const command of [{type:"create-sketch",id:"b4",workPlane:"XY"},...[axis,arc,circle,point].map(geometry=>({type:"add-sketch-geometry",sketchId:"b4",geometry}))] as const){const result=await dispatchCadCommand(command);if(!result.ok)throw Error(result.reason);}
saveDocumentToCache();createRoot(document.getElementById("root")!).render(<App/>);
const button=document.getElementById("run-b4") as HTMLButtonElement,output=document.getElementById("b4-result")!;
const pause=()=>new Promise<void>(resolve=>setTimeout(resolve,30));
const state=()=>{const {revision:_,...document}=cadDocument;return JSON.stringify(document);};
const find=(name:string)=>Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(entry=>(entry.getAttribute("aria-label")??entry.textContent?.trim())===name);
async function waitFor(check:()=>boolean){const deadline=Date.now()+10000;while(!check()){if(Date.now()>deadline)throw Error("UI timeout: "+document.querySelector('[data-testid="sketch-inspector"]')?.textContent);await pause();}await pause();}
async function input(action:Record<string,unknown>){const run=new URLSearchParams(location.search).get("run"),response=await fetch(`/__browser_input?run=${run}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(action)});if(!response.ok)throw Error(await response.text());}
async function physical(element:Element,modifiers=0){element.scrollIntoView({block:"nearest"});await pause();const bounds=element.getBoundingClientRect(),x=bounds.left+bounds.width/2,y=bounds.top+bounds.height/2;if(!element.contains(document.elementFromPoint(x,y)))throw Error("Obscured: "+element.outerHTML.slice(0,150));await input({type:"mousePressed",x,y,modifiers,button:"left",buttons:1});await input({type:"mouseReleased",x,y,modifiers,button:"left",buttons:0});await pause();}
async function click(name:string){const target=find(name);if(!target||target.disabled)throw Error("Missing or disabled "+name);await physical(target);await waitFor(()=>!isDocumentCommandPending());}
async function select(...ids:string[]){for(let i=0;i<ids.length;i++)await physical(document.querySelector(`[data-model-object-id="${ids[i]}"] .tree-label`)!,i?2:0);}
async function handle(id:string,modifiers=0){await waitFor(()=>Boolean(document.querySelector(`[data-direct-handle="${id}"]`)));const bounds=document.querySelector(`[data-direct-handle="${id}"]`)!.getBoundingClientRect(),x=bounds.left+bounds.width/2,y=bounds.top+bounds.height/2;await input({type:"mousePressed",x,y,modifiers,button:"left",buttons:1});await input({type:"mouseReleased",x,y,modifiers,button:"left",buttons:0});await pause();}
const geometry=(id:string)=>cadDocument.sketches!.b4.geometry.find(entry=>entry.id===id)!;
button.onclick=async()=>{button.disabled=true;const lines:string[]=[],check=(condition:unknown,label:string)=>{if(!condition)throw Error(label);lines.push(`PASS: ${label}`);output.textContent=lines.join("\n");};try{
  await waitFor(()=>Boolean(document.querySelector("#root canvas")));await physical(Array.from(document.querySelectorAll<HTMLButtonElement>("#root button")).find(entry=>entry.title.startsWith("Edit b4"))!);find("Fit all geometry")?.click();await pause();
  await select("axis","arc");check(Boolean(find("Review suggested tangent")),"Actual line and finite arc expose a suggested tangent for review");const before=state(),past=cadHistory.getPastLabels().length;
  await click("Review suggested tangent");await waitFor(()=>Boolean(find("Apply constraint")&&!find("Apply constraint")!.disabled));check(state()===before&&cadHistory.getPastLabels().length===past&&Boolean(document.querySelector('[data-preview-relation-status="added"]')),"Preview shows the candidate without saving it");await input({type:"key",key:"Escape"});await waitFor(()=>!find("Cancel constraint"));check(state()===before&&cadHistory.getPastLabels().length===past,"Escape discards the suggested tangent without persisting it");await click("Review suggested tangent");await waitFor(()=>Boolean(find("Apply constraint")&&!find("Apply constraint")!.disabled));
  await click("Apply constraint");check(cadDocument.sketches!.b4.constraints.some(entry=>entry.kind==="tangent-line"&&entry.curveId==="arc")&&cadHistory.getPastLabels().length===past+1,"Explicit Apply persists the line-arc relation in one step");
  const contact=lineArcContact([(geometry("axis") as typeof axis&{start:[number,number];end:[number,number]}).start,(geometry("axis") as typeof axis&{start:[number,number];end:[number,number]}).end],geometry("arc") as Extract<SketchGeometry,{kind:"arc"}>,1)!;check(Math.max(Math.abs(contact.distanceError),Math.abs(contact.segmentError),Math.abs(contact.arcError))<1e-5,"Committed line-arc contact remains on both finite entities");
  await click("Undo");check(state()===before,"Undo removes the permanent relation");await click("Redo");check(cadDocument.sketches!.b4.constraints.some(entry=>entry.kind==="tangent-line"),"Redo restores the relation");
  await select("arc","circle");check(Boolean(find("Review suggested External tangent")),"Arc-circle near contact is offered as a reviewable external candidate");await click("Review suggested External tangent");await waitFor(()=>Boolean(find("Apply constraint")&&!find("Apply constraint")!.disabled));await click("Apply constraint");const pair=curveCurveContact(geometry("arc") as Extract<SketchGeometry,{kind:"arc"}>,geometry("circle") as Extract<SketchGeometry,{kind:"circle"}>,"external")!;check(Math.max(Math.abs(pair.distanceError),Math.abs(pair.firstError),Math.abs(pair.secondError))<1e-5,"Explicit arc-circle tangency uses the actual shared point");
  await click("Direct");await select("point","arc");await handle("point:end",2);await click("Point on arc");await waitFor(()=>Boolean(find("Apply constraint")&&!find("Apply constraint")!.disabled));await click("Apply constraint");const located=(geometry("point") as Extract<SketchGeometry,{kind:"line"}>).end;check(Math.abs(arcIntervalError(geometry("arc") as Extract<SketchGeometry,{kind:"arc"}>,located))<1e-5,"Selected endpoint is constrained to the directed arc interval");check(JSON.parse(serializeDocument(cadDocument)).version===17,"UI-created bounded relations use version 17 on save");
  output.textContent=lines.join("\n")+`\nALL ${lines.length} CHECKS PASSED`;
}catch(cause){output.textContent=lines.join("\n")+`\nFAIL: ${cause instanceof Error?cause.message:cause}`;}};installBrowserChecks(button,output);
