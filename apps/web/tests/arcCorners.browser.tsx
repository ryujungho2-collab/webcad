import {createRoot} from "react-dom/client";
import {App} from "../src/App";
import "../src/ui/tokens.css";import "../src/ui/workstation.css";import "../src/ui/commands.css";import "../src/ui/menu.css";import "../src/ui/explorer.css";import "../src/ui/inspector.css";
import {cadDocument} from "../src/state/cadDocument";
import {cadHistory} from "../src/state/history";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {saveDocumentToCache} from "../src/state/documentFile";
import {exactDrawingContour,segmentPoint} from "../src/features/drawing-editing/geometry/contourEditing";
import {curveCornerSolutions} from "../src/features/drawing-editing/geometry/arcCorners";
import {resetTestDocument} from "./helpers/documentHarness";
import {installBrowserChecks} from "./helpers/browserChecks";
import {click,text,waitFor,physical,choose} from "./helpers/physicalInput";
resetTestDocument();
await dispatchCadCommand({type:"create-drawing",id:"a",name:"Incoming arc",drawing:"arc",params:{workPlane:"XY",center:[0,10,0],radius:10,startAngle:Math.PI,endAngle:Math.PI*1.5}});
await dispatchCadCommand({type:"create-drawing",id:"b",name:"Outgoing arc",drawing:"arc",params:{workPlane:"XY",center:[-10,0,0],radius:10,startAngle:0,endAngle:Math.PI/2}});
await dispatchCadCommand({type:"create-drawing",id:"lens",name:"Closed lens",drawing:"polyline",params:{workPlane:"XY",closed:true,points:[[0,0,0],[-10,10,0]],bulges:[Math.tan(Math.PI/8),Math.tan(Math.PI/8)]}});
saveDocumentToCache();createRoot(document.getElementById("root")!).render(<App/>);
const button=document.getElementById("run-fillet") as HTMLButtonElement,output=document.getElementById("fillet-result")!;
const editor=()=>document.querySelector<HTMLFormElement>('form[aria-label="Curve workflow"]'),submit=()=>editor()?.querySelector<HTMLButtonElement>('button[type="submit"]'),ready=()=>waitFor(()=>!!submit()&&!submit()!.disabled);
const state=()=>{const {revision:_,...doc}=cadDocument;return JSON.stringify(doc);};
const feature=(id:string)=>Object.values(cadDocument.features).find(f=>f.output===id)!,entry=(id:string)=>({object:cadDocument.objects[id],feature:feature(id)}),path=(id:string)=>exactDrawingContour(entry(id).object,feature(id));
const near=(a:number,b:number)=>Math.abs(a-b)<1e-6;
const closed=(id:string)=>{const p=path(id);return p.closed&&p.segments.every((s,i)=>s.end.every((v,j)=>near(v,p.segments[(i+1)%p.segments.length].start[j])));};
async function select(ids:string[]){for(let i=0;i<ids.length;i++)await physical(document.querySelector(`[data-model-object-id="${ids[i]}"] .tree-label`)!,i?2:0);}
button.onclick=async()=>{
 const checks:string[]=[],check=(v:unknown,s:string)=>{if(!v)throw new Error(s);checks.push(`PASS: ${s}`);output.textContent=checks.join("\n");};button.disabled=true;
 try{
 await waitFor(()=>!!document.querySelector("#root canvas"));await click("2D");await physical(document.getElementById("tools-tab-modify")!);
 for(const mode of ["Fillet","Chamfer"] as const){
  await select(["a","b"]);await click("Curve workflow");await click(mode);await text("Workflow distance","2mm");if(mode==="Chamfer")await text("Workflow second distance","3mm");
  const ss=curveCornerSolutions(entry("a"),entry("b"),segmentPoint(path("a").segments[0],.35,"XY"),segmentPoint(path("b").segments[0],.35,"XY"),mode.toLowerCase() as "fillet"|"chamfer",2,mode==="Chamfer"?3:2);
  if(ss.length>1){await waitFor(()=>!!document.querySelector('[aria-label="Fillet solution"]'));check(!!submit()?.disabled,`${mode} requires explicit review when both bounded corners fit`);const index=ss.findIndex(s=>(s.center??s.corner)[0]>-5);await choose("Fillet solution",index+1);}
  await ready();const before=state(),h=cadHistory.getPastLabels().length;check(document.querySelectorAll('[data-chamfer-distance]').length===2,`${mode} displays two assigned contact guides`);check(state()===before,`${mode} review is detached from the document`);
  await click("Apply workflow edit");await waitFor(()=>!!editor()?.textContent?.includes(`${mode} applied`));const id=cadDocument.rootObjects.find(id=>id.startsWith(`${mode.toLowerCase()}-`))!,s=path(id).segments[0];
  check(mode==="Fillet"?near(s.radius!,2)&&near(s.center![0],-(5-Math.sqrt(7)))&&near(s.center![1],5-Math.sqrt(7)):near(s.start[0],-10*Math.sin(.2))&&near(s.end[1],10*Math.sin(.3)),`${mode} applies independent analytic circle/arc-length coordinates`);
  check(cadHistory.getPastLabels().length===h+1,`${mode} trims both arcs and creates its connector in one Undo`);await click("Finish workflow");await click("Undo");check(state()===before,`${mode} Undo restores both finite source arcs`);
 }
 for(const mode of ["Fillet","Chamfer"] as const){
  await select(["lens"]);await click("Curve workflow");await click(mode);await physical(document.querySelector('[aria-label="Closed contour corner"]')!);
  await waitFor(()=>!!document.querySelector('[aria-label="Workflow corner"]'));if(mode==="Chamfer")await choose("Workflow corner",1);await text("Workflow distance","2mm");if(mode==="Chamfer")await text("Workflow second distance","3mm");await ready();const before=state(),h=cadHistory.getPastLabels().length;
  check(!document.querySelector('[aria-label="Workflow second curve"]'),`${mode} closed corner uses one contour and a stable vertex`);check(state()===before,`${mode} closed preview publishes no geometry`);await click("Apply workflow edit");await waitFor(()=>!!editor()?.textContent?.includes(`${mode} applied`));check(closed("lens")&&path("lens").segments.length===3,`${mode} retains exact cyclic connectivity at wrapping vertex`);check(cadHistory.getPastLabels().length===h+1,`${mode} closed edit is a single history transaction`);await click("Finish workflow");await click("Undo");check(state()===before,`${mode} closed Undo restores the original bulges and topology`);
 }
 output.textContent=checks.join("\n")+`\nALL ${checks.length} CHECKS PASSED`;
 }catch(e){output.textContent=checks.join("\n")+`\nFAIL: ${e instanceof Error?e.stack:String(e)}`;}
};installBrowserChecks(button,output);
