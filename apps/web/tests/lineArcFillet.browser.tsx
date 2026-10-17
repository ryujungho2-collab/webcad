import { createRoot } from "react-dom/client";
import { App } from "../src/App";
import "../src/ui/tokens.css";import "../src/ui/workstation.css";import "../src/ui/commands.css";import "../src/ui/menu.css";import "../src/ui/explorer.css";import "../src/ui/inspector.css";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory } from "../src/state/history";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { saveDocumentToCache } from "../src/state/documentFile";
import { serializeDocument,deserializeDocument } from "@agent-webcad/cad-document";
import { exactDrawingContour } from "../src/features/drawing-editing/geometry/contourEditing";
import { resetTestDocument } from "./helpers/documentHarness";
import { installBrowserChecks } from "./helpers/browserChecks";
import { click,text,waitFor,physical,input,choose,pause } from "./helpers/physicalInput";
resetTestDocument();
await dispatchCadCommand({type:"create-drawing",id:"line",name:"Retained line",drawing:"line",params:{workPlane:"XY",points:[[0,0,0],[30,0,0]]}});
await dispatchCadCommand({type:"create-drawing",id:"arc",name:"Retained arc",drawing:"arc",params:{workPlane:"XY",center:[0,10,0],radius:10,startAngle:-Math.PI/2,endAngle:Math.PI/2}});
saveDocumentToCache();createRoot(document.getElementById("root")!).render(<App/>);
const button=document.getElementById("run-fillet") as HTMLButtonElement,output=document.getElementById("fillet-result")!;
const canvas=()=>document.querySelector<HTMLCanvasElement>("#root canvas")!,editor=()=>document.querySelector<HTMLFormElement>('form[aria-label="Curve workflow"]');
const submit=()=>editor()?.querySelector<HTMLButtonElement>('button[type="submit"]'),ready=()=>waitFor(()=>!!submit()&&!submit()!.disabled).catch(e=>{throw new Error(`${e.message}\nEDITOR: ${editor()?.textContent}\nSOLUTION: ${document.querySelector<HTMLSelectElement>('[aria-label="Fillet solution"]')?.value}`);});
const state=()=>{const {revision:_,...doc}=cadDocument;return JSON.stringify(doc);};
const feature=(id:string)=>Object.values(cadDocument.features).find(f=>f.output===id)!,path=(id:string)=>exactDrawingContour(cadDocument.objects[id],feature(id));
async function select(){await physical(document.querySelector('[data-model-object-id="line"] .tree-label')!);await physical(document.querySelector('[data-model-object-id="arc"] .tree-label')!,2);}
button.onclick=async()=>{
 const checks:string[]=[],check=(v:unknown,s:string)=>{if(!v)throw new Error(s);checks.push(`PASS: ${s}`);output.textContent=checks.join("\n");};button.disabled=true;
 try{
  await waitFor(()=>!!canvas());await click("2D");await select();await physical(document.getElementById("tools-tab-modify")!);await click("Curve workflow");await click("Fillet");await text("Workflow distance",".2cm");await ready();await click("Fit workflow preview");
  await new Promise(resolve=>setTimeout(resolve,400));
  const pickBefore=state();
  for(const [index,label] of [[0,"Pick target branch"],[1,"Pick second branch"]] as const){
    await click(label);
    const line=[...document.querySelectorAll<SVGPolylineElement>('[data-curve-workflow-preview] polyline[stroke="#e7b369"]')][index];
    const points=line.getAttribute("points")!.split(" ").map(s=>s.split(",").map(Number)),p=index===0?points[0].map((n,i)=>n+.8*(points.at(-1)![i]-n)):points[Math.round((points.length-1)*.7)],rect=canvas().getBoundingClientRect(),x=rect.left+p[0],y=rect.top+p[1];
    if(document.elementFromPoint(x,y)!==canvas())throw new Error("Retained branch pick is hidden by the editor");
    await input({type:"mousePressed",x,y,button:"left",buttons:1});await input({type:"mouseReleased",x,y,button:"left",buttons:0});await ready();
  }
  check(state()===pickBefore&&document.querySelectorAll('[data-curve-workflow-preview] circle').length===2,"Native canvas picks choose both retained branches without publishing geometry");
  const before=state(),h=cadHistory.getPastLabels().length;
  check(document.querySelector('[aria-label="Fillet solution"]')?.textContent?.includes("T1")&&document.querySelector('[aria-label="Fillet solution"]')?.textContent?.includes("T2"),"Analytic tangent coordinates are offered in the solution review");
  check(document.querySelectorAll('[data-chamfer-distance]').length===2,"Canvas displays two exact radius/contact guides");
  check(state()===before&&cadHistory.getPastLabels().length===h,"Line–arc preview leaves geometry and History unchanged");
  await text("Workflow distance","100mm");await waitFor(()=>!!submit()?.disabled&&!!editor()?.textContent?.includes("No tangent"));check(state()===before,"No-fit bounded radius blocks Apply without partial edits");
  await text("Workflow distance","oops");await waitFor(()=>!!submit()?.disabled);check(state()===before,"Invalid radius preserves the source and allows input recovery");
  await text("Workflow distance","2mm");await ready();await click("Cancel workflow");check(state()===before&&document.activeElement===canvas(),"Cancel restores canvas focus and discards the reviewed tangent plan");
  await click("Curve workflow");await click("Fillet");await text("Workflow distance","2mm");await ready();await dispatchCadCommand({type:"set-layer-locked",layerId:"layer-default",locked:true});await waitFor(()=>!!submit()?.disabled);const locked=state();canvas().focus();await input({type:"key",key:"Enter"});check(state()===locked,"Locking a reviewed source blocks Enter and leaves geometry intact");
  await dispatchCadCommand({type:"set-layer-locked",layerId:"layer-default",locked:false});await ready();canvas().focus();await input({type:"key",key:"Enter"});await waitFor(()=>!!editor()?.textContent?.includes("Fillet applied"));
  const id=cadDocument.rootObjects.find(id=>id.startsWith("fillet-"))!,fillet=path(id).segments[0];
  check(Math.abs(fillet.center![0]-Math.sqrt(80))<1e-6&&Math.abs(fillet.center![1]-2)<1e-6&&Math.abs(fillet.radius!-2)<1e-6,"Canvas Enter applies the independently calculated radius-2 tangent circle");
  check(Math.abs(path("line").segments[0].start[0]-Math.sqrt(80))<1e-6&&Math.abs(path("arc").segments[0].start[1]-10/3)<1e-6,"Both retained branches end at their exact analytic contact points");
  check(cadHistory.getPastLabels().length===h+3&&editor()!.textContent!.includes("Join result"),"Fillet is one Undo plus lock/unlock and hands all three curves to Join");
  const after=state();await click("Finish workflow");await click("Undo");check(state()===before,"Undo Fillet restores the exact original line and arc");await click("Redo");check(state()===after,"Redo restores the reviewed tangent geometry");check(JSON.stringify(deserializeDocument(serializeDocument(cadDocument)))===JSON.stringify(cadDocument),"Analytic arcs and topology survive portable JSON reload");
  // A second fixture exercises explicit solution selection through the native select.
  await click("Undo");await dispatchCadCommand({type:"delete-object",objectId:"line"});await dispatchCadCommand({type:"delete-object",objectId:"arc"});
  await dispatchCadCommand({type:"create-drawing",id:"line",drawing:"line",params:{workPlane:"XY",points:[[-30,0,0],[50,0,0]]}});await dispatchCadCommand({type:"create-drawing",id:"arc",drawing:"arc",params:{workPlane:"XY",center:[0,0,0],radius:10,startAngle:0,endAngle:Math.PI*1.9}});
  await select();await click("Curve workflow");await click("Fillet");await text("Workflow distance","2mm");
  await waitFor(()=>!!editor()?.textContent?.includes("Multiple tangent"));check(!!submit()?.disabled,"Multiple exact tangencies require a deliberate solution selection");
  const multiBefore=state();await choose("Fillet solution",2);await ready();check(state()===multiBefore&&document.querySelectorAll('[data-chamfer-distance]').length===2,"Choosing a solution regenerates detached contact guides before publication");await click("Apply workflow edit");await waitFor(()=>!!editor()?.textContent?.includes("Fillet applied"));check(cadDocument.rootObjects.length===3,"Selected tangent solution publishes both trims and one connector atomically");
  output.textContent=checks.join("\n")+`\nALL ${checks.length} CHECKS PASSED`;
 }catch(e){output.textContent=checks.join("\n")+`\nFAIL: ${e instanceof Error?e.stack:String(e)}`;}
};installBrowserChecks(button,output);
