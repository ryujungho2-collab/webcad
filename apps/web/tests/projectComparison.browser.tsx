import {createRoot} from "react-dom/client";
import {ProjectWorkspace} from "../src/app/ProjectWorkspace";
import {projectStorage} from "../src/app/projectSession";
import {writeRecoveryCheckpoint} from "../src/state/documentRecovery";
import {deserializeDocument} from "@agent-webcad/cad-document";
import {COMPARISON_KEY} from "../src/app/projectComparison";
import {WORKSPACE_KEY} from "../src/app/projectWorkspaceStore";
import {physical,click,input,waitFor,pause,choose} from "./helpers/physicalInput";
import {installBrowserChecks} from "./helpers/browserChecks";
import "../src/styles.css";import "../src/ui/tokens.css";

const reloadKey="project-comparison-reload",resumed=sessionStorage.getItem(reloadKey);
const titles={a:"중정 주거 A · 수정 전 · 긴 프로젝트 이름으로도 작업 대상을 확인합니다",b:"중정 주거 B · 변경안",c:"기계 부품 C"};
if(!resumed){
  for(const id of ["a","b","c"])writeRecoveryCheckpoint(projectStorage(localStorage,id),{
    id:`comparison-${id}`,revision:0,objects:{},features:{},rootObjects:[],rootLayers:["layer-default"],
    layers:{"layer-default":{id:"layer-default",name:"Default",visible:true,locked:false,objectIds:[]}},
  });
  localStorage.setItem(WORKSPACE_KEY,JSON.stringify({version:1,active:"a",projects:Object.entries(titles).map(([id,title])=>({id,title,closed:false}))}));
  localStorage.removeItem(COMPARISON_KEY);
}
createRoot(document.getElementById("root")!).render(<ProjectWorkspace startOnHome={false}/>);
const button=document.getElementById("run") as HTMLButtonElement,output=document.getElementById("output")!;
const frame=(id:string)=>document.querySelector<HTMLIFrameElement>(`#project-panel-${id} iframe`)!;
const panel=(id:string)=>document.getElementById(`project-panel-${id}`)!;
const visible=()=>[...document.querySelectorAll<HTMLElement>('.project-editors > section:not([hidden])')].map(s=>s.id.replace("project-panel-",""));
const active=()=>JSON.parse(localStorage.getItem(WORKSPACE_KEY)!).active;
const buttons=(doc:Document)=>[...doc.querySelectorAll<HTMLButtonElement>("button")];
async function ready(id:string){
  await waitFor(()=>!!frame(id)?.contentDocument?.querySelector("canvas"),`Editor ${id} ready`);
  const mode=frame(id).contentDocument!.querySelector<HTMLButtonElement>('button[aria-label="3D"]');
  if(mode?.getAttribute("aria-pressed")==="false")await inFrame(id,mode);
  await waitFor(()=>buttons(frame(id).contentDocument!).some(b=>b.getAttribute("aria-label")==="Box"&&!b.disabled));
  return frame(id);
}
async function inFrame(id:string,element:Element){
  const iframe=frame(id),doc=iframe.contentDocument!,popover=element.closest<HTMLElement>("[popover]");
  if(popover&&!popover.matches(":popover-open")){
    const trigger=[...doc.querySelectorAll<HTMLButtonElement>("button[popovertarget]")].find(b=>b.popoverTargetElement===popover);
    if(!trigger)throw Error("Unavailable tool group");await inFrame(id,trigger);
  }
  element.scrollIntoView({block:"center"});await pause();const box=element.getBoundingClientRect(),outer=iframe.getBoundingClientRect();
  const x=box.left+box.width/2,y=box.top+box.height/2;
  if(!element.contains(doc.elementFromPoint(x,y)))throw Error(`Obscured frame control ${element.outerHTML.slice(0,120)}`);
  await input({type:"mousePressed",x:outer.left+x,y:outer.top+y,button:"left",buttons:1});
  await input({type:"mouseReleased",x:outer.left+x,y:outer.top+y,button:"left",buttons:0});await pause();
}
async function frameClick(id:string,name:string){const candidates=buttons(frame(id).contentDocument!);const element=candidates.find(b=>b.getAttribute("aria-label")===name)??candidates.find(b=>b.textContent?.trim()===name&&b.getClientRects().length>0);if(!element||element.disabled)throw Error(`Unavailable ${id}: ${name}`);await inFrame(id,element);}
const tab=(id:string)=>physical(document.getElementById(`project-tab-${id}`)!);
const probe=async(id:string)=>(frame(id).contentWindow as any).eval('import("/tests/helpers/projectPerformanceProbe.ts")') as Promise<typeof import("./helpers/projectPerformanceProbe")>;
const state=(p:Awaited<ReturnType<typeof probe>>)=>JSON.stringify(p.cadDocument);
async function screenshot(name:string,artifacts:Record<string,string>){button.closest("aside")!.style.visibility="hidden";try{artifacts[name]=(await(await input({type:"screenshot"})).json()).data;}finally{button.closest("aside")!.style.visibility="";}}

button.onclick=async()=>{
  const stored=resumed?JSON.parse(resumed):null,lines:string[]=stored?.lines??[],artifacts:Record<string,string>=stored?.artifacts??{};
  const check=(ok:unknown,label:string)=>{if(!ok)throw Error(label);lines.push(`PASS ${label}`);output.textContent=lines.join("\n");};
  try{
    if(stored){
      await ready("a");await ready("b");const a=await probe("a"),b=await probe("b");
      check(visible().join(",")==="a,b"&&active()===stored.active,"Reload restores the distinct comparison pair and active editor");
      check(Math.abs(JSON.parse(localStorage.getItem(COMPARISON_KEY)!).ratio-stored.ratio)<.001,"Reload restores the divider preference");
      check(a.cadDocument.rootObjects.length===1&&b.cadDocument.rootObjects.length===1,"Both visible editors reopen their own saved geometry");
      check(a.cadHistory.getPastLabels().length===0&&b.cadHistory.getPastLabels().length===0,"Page reload starts two fresh Undo sessions");
      await waitFor(()=>a.projectActivityMetrics().active&&b.projectActivityMetrics().active);
      await waitFor(()=>a.rootUuids.has(a.cadDocument.rootObjects[0])&&b.rootUuids.has(b.cadDocument.rootObjects[0]));
      await frameClick("a","Fit all geometry");await frameClick("b","Fit all geometry");await tab(stored.active);
      await screenshot("comparison-reopened.png",artifacts);
      sessionStorage.removeItem(reloadKey);(globalThis as any).cadTestArtifacts=artifacts;
      (globalThis as any).cadTestMetrics={visibleProjects:2,viewports:[1440,960],lifecycle:"stable section and iframe parents; no reparent",reload:true};
      output.textContent=lines.join("\n")+`\nALL ${lines.length} CHECKS PASSED`;return;
    }
    const originalA=await ready("a");await frameClick("a","Box");const a=await probe("a");
    await waitFor(()=>a.cadDocument.rootObjects.length===1);await frameClick("a","Save document");
    await tab("b");const originalB=await ready("b");await frameClick("b","Box");const b=await probe("b");
    await waitFor(()=>b.cadDocument.rootObjects.length===1);await frameClick("b","Save document");await tab("a");
    const docA=originalA.contentDocument,docB=originalB.contentDocument,beforeA=state(a),beforeB=state(b),historyA=a.cadHistory.getPastLabels().length,historyB=b.cadHistory.getPastLabels().length;
    await click("Compare projects");await ready("b");
    check(visible().join(",")==="a,b"&&frame("a")===originalA&&frame("b")===originalB,"Compare positions the existing two iframe elements without cloning them");
    check(originalA.contentDocument===docA&&originalB.contentDocument===docB&&a.cadHistory.getPastLabels().length===historyA&&b.cadHistory.getPastLabels().length===historyB,"Split preserves both live documents and Undo histories without iframe reload");
    await waitFor(()=>a.projectActivityMetrics().active&&b.projectActivityMetrics().active);
    await frameClick("a","Fit all geometry");await frameClick("b","Fit all geometry");
    check(a.projectActivityMetrics().active&&b.projectActivityMetrics().active,"Both displayed viewports render while background projects remain paused");
    await frameClick("b","Box");await waitFor(()=>b.cadDocument.rootObjects.length===2&&active()==="b");
    check(panel("b").dataset.projectActive==="true"&&panel("a").dataset.projectActive==="false","Pointer focus inside an iframe updates the active pane indicator");
    await input({type:"key",key:"z",modifiers:2});await waitFor(()=>b.cadDocument.rootObjects.length===1);
    check(state(a)===beforeA,"Keyboard Undo in B cannot mutate A");
    await frameClick("a","Box");await waitFor(()=>a.cadDocument.rootObjects.length===2&&active()==="a");await frameClick("a","Undo");await waitFor(()=>a.cadDocument.rootObjects.length===1);
    check(b.cadDocument.rootObjects.length===1,"Each pane edits and undoes its own command history");
    await frameClick("a","Show Explorer");
    const row=frame("a").contentDocument!.querySelector("[data-model-object-id] .tree-label")!;await inFrame("a",row);await frameClick("a","Hide Explorer");
    const viewportWidth=frame("a").contentDocument!.querySelector(".workbench-viewport")!.getBoundingClientRect().width;
    await frameClick("a","Show Properties");
    check(getComputedStyle(frame("a").contentDocument!.querySelector(".workbench-properties")!).visibility==="visible"&&frame("a").contentDocument!.querySelector(".workbench-viewport")!.getBoundingClientRect().width===viewportWidth,"Compact comparison opens Explorer and Properties on demand without shrinking the canvas");
    await frameClick("a","Hide Properties");
    const selected=frame("a").contentDocument!.querySelector("[data-model-object-id][aria-pressed=true]")?.getAttribute("data-model-object-id");
    const unchangedA=state(a),unchangedB=state(b);await waitFor(()=>a.projectKernelMetrics().activeTasks===0&&b.projectKernelMetrics().activeTasks===0);await pause();
    const tasks=[a.projectKernelMetrics().submittedTasks,b.projectKernelMetrics().submittedTasks];
    const separator=document.querySelector('[role="separator"][aria-label="Resize project comparison"]')!;
    await physical(separator);await input({type:"key",key:"ArrowRight"});await input({type:"key",key:"ArrowRight"});
    check(JSON.parse(localStorage.getItem(COMPARISON_KEY)!).ratio>.5,"Keyboard divider adjustment is persisted");
    const box=separator.getBoundingClientRect(),container=separator.parentElement!.getBoundingClientRect();
    await input({type:"mousePressed",x:box.left+4,y:box.top+80,button:"left",buttons:1});
    await input({type:"mouseMoved",x:container.left+container.width*.58,y:box.top+80,button:"left",buttons:1});
    await input({type:"mouseReleased",x:container.left+container.width*.58,y:box.top+80,button:"left",buttons:0});
    check(Math.abs(JSON.parse(localStorage.getItem(COMPARISON_KEY)!).ratio-.58)<.02,"Pointer divider drag crosses iframe boundaries and commits its size");
    await click("Single project view");check(visible().join(",")==="a"&&originalB.isConnected,"Single view keeps the other editor mounted");await click("Compare projects");
    check(originalA.contentDocument===docA&&originalB.contentDocument===docB&&frame("a").contentDocument!.querySelector("[data-model-object-id][aria-pressed=true]")?.getAttribute("data-model-object-id")===selected,"Split exit/reentry preserves iframe identity and object selection");
    check(state(a)===unchangedA&&state(b)===unchangedB&&a.projectKernelMetrics().submittedTasks===tasks[0]&&b.projectKernelMetrics().submittedTasks===tasks[1],"Split, pointer/keyboard resizing and single view submit no geometry work or CAD revisions");
    await screenshot("comparison-1440.png",artifacts);
    await input({type:"viewport",width:960,height:1000});await pause();
    check(frame("a").getBoundingClientRect().width>=319&&frame("b").getBoundingClientRect().width>=319&&document.documentElement.scrollWidth<=960,"960px comparison keeps two usable panes and no host horizontal overflow");
    check(["a","b"].every(id=>frame(id).contentDocument!.querySelector(".workbench-viewport")!.getBoundingClientRect().width>280),"Both 960px comparison canvases retain at least 280px of drawing space");
    check(["a","b"].every(id=>frame(id).contentDocument!.querySelector(".menu-save-as")!.getClientRects().length===0),"Compact editor menus keep file download available through File/shortcut without wrapping the header");
    await frameClick("a","Fit all geometry");await frameClick("b","Fit all geometry");
    await screenshot("comparison-960.png",artifacts);await input({type:"viewport",width:1440,height:1000});await tab("a");
    await tab("c");await ready("c");const c=await probe("c");
    check(visible().join(",")==="b,c"&&originalA.isConnected,"A third project replaces only the active pane and retains the hidden editor");
    await waitFor(()=>!a.projectActivityMetrics().active&&b.projectActivityMetrics().active&&c.projectActivityMetrics().active);
    check(!a.projectActivityMetrics().active,"The hidden third editor remains paused");await tab("a");
    await choose("Right comparison project",0);check(panel("a").dataset.comparisonSide==="right"&&panel("b").dataset.comparisonSide==="left"&&document.querySelectorAll("#project-panel-a iframe").length===1,"Selecting the opposite project swaps the pair without a duplicate iframe");
    await choose("Left comparison project",0);
    // Capture the real download path in each editor's own realm.
    for(const [id,p] of [["a",a],["b",b]] as const){
      const win=frame(id).contentWindow as Window&typeof globalThis;let downloaded:Promise<string>|undefined;
      const native=win.HTMLAnchorElement.prototype.click;
      win.HTMLAnchorElement.prototype.click=function(){if(this.download)downloaded=win.fetch(this.href).then(r=>r.text());else native.call(this);};
      try{await frameClick(id,"Save document");await input({type:"key",key:"s",modifiers:10});await waitFor(()=>!!downloaded);const portable=await downloaded!;const d=deserializeDocument(portable);check(d.id===p.cadDocument.id&&d.rootObjects.length===1,`Pane ${id.toUpperCase()} downloads its own live WebCAD file`);artifacts[`comparison-${id}.webcad.json`]=portable;}finally{win.HTMLAnchorElement.prototype.click=native;}
    }
    await tab("b");await click(`Close project ${titles.b}`);await waitFor(()=>!originalB.isConnected);
    check(visible().join(",")==="a"&&active()==="a"&&originalA.contentDocument===docA,"Closing a compared pane saves it, collapses the split and keeps its surviving session");
    await choose("Reopen closed project",1);await ready("b");await tab("a");await click("Compare projects");
    const ratio=JSON.parse(localStorage.getItem(COMPARISON_KEY)!).ratio;
    sessionStorage.setItem(reloadKey,JSON.stringify({lines,artifacts,ratio,active:active()}));location.reload();
  }catch(error){await screenshot("comparison-failure.png",artifacts).catch(()=>{});(globalThis as any).cadTestArtifacts=artifacts;output.textContent=lines.join("\n")+`\nFAIL: ${error instanceof Error?error.stack:String(error)}`;}
};
installBrowserChecks(button,output);

