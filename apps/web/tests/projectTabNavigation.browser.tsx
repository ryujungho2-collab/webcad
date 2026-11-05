import {createRoot} from "react-dom/client";
import {ProjectWorkspace} from "../src/app/ProjectWorkspace";
import {projectStorage} from "../src/app/projectSession";
import {writeRecoveryCheckpoint} from "../src/state/documentRecovery";
import {WORKSPACE_KEY,readWorkspace} from "../src/app/projectWorkspaceStore";
import {orderedOpenProjects} from "../src/app/projectTabs";
import {physical,click,input,waitFor,pause,text,choose} from "./helpers/physicalInput";
import {installBrowserChecks} from "./helpers/browserChecks";
import "../src/styles.css";import "../src/ui/tokens.css";

const reloadKey="project-tab-navigation-reload",resumed=sessionStorage.getItem(reloadKey);
const titles:Record<string,string>={a:"중정 주거 A · 수정 전 · 이름이 긴 프로젝트의 탭 탐색",b:"중정 주거 B · 수정안",c:"기계 부품 C",d:"도서관 D",e:"외부 공간 E",f:"상세 도면 F",g:"입면도 G",h:"마지막 열린 프로젝트 H",z:"닫힌 검토안 Z"};
if(!resumed){
  for(const id of Object.keys(titles))writeRecoveryCheckpoint(projectStorage(localStorage,id),{id:`navigation-${id}`,revision:0,objects:{},features:{},rootObjects:[],rootLayers:["layer-default"],layers:{"layer-default":{id:"layer-default",name:"Default",visible:true,locked:false,objectIds:[]}}});
  localStorage.setItem(WORKSPACE_KEY,JSON.stringify({version:1,active:"a",projects:Object.entries(titles).map(([id,title])=>({id,title,closed:id==="z"}))}));
}
createRoot(document.getElementById("root")!).render(<ProjectWorkspace startOnHome={false}/>);
const button=document.getElementById("run") as HTMLButtonElement,output=document.getElementById("output")!;
const frame=(id:string)=>document.querySelector<HTMLIFrameElement>(`#project-panel-${id} iframe`)!;
const tab=(id:string)=>document.getElementById(`project-tab-${id}`)!;
const order=()=>[...document.querySelectorAll<HTMLElement>('[role="tab"]')].map(el=>el.id.replace("project-tab-",""));
const workspace=()=>readWorkspace(localStorage).workspace;
const active=()=>workspace().active;
const visible=()=>[...document.querySelectorAll<HTMLElement>('.project-editors > section:not([hidden])')].map(el=>el.id.replace("project-panel-",""));
const probe=async(id:string)=>(frame(id).contentWindow as any).eval('import("/tests/helpers/projectPerformanceProbe.ts")') as Promise<typeof import("./helpers/projectPerformanceProbe")>;
async function ready(id:string){await waitFor(()=>!!frame(id)?.contentDocument?.querySelector("canvas"));await waitFor(()=>!!frame(id).contentDocument!.querySelector('button[aria-label="Box"]:not([disabled])'));return frame(id);}
async function inside(id:string,element:Element){
  element.scrollIntoView({block:"center"});await pause();const doc=frame(id).contentDocument!,box=element.getBoundingClientRect(),outer=frame(id).getBoundingClientRect(),x=box.left+box.width/2,y=box.top+box.height/2;
  if(!element.contains(doc.elementFromPoint(x,y)))throw Error(`Obscured ${element.outerHTML.slice(0,100)} hit=${doc.elementFromPoint(x,y)?.outerHTML.slice(0,200)} ancestry=${[element,element.parentElement!,element.parentElement!.parentElement!].map(el=>`${el.className}:z${getComputedStyle(el).zIndex}:container${getComputedStyle(el).containerType}`).join("|")}`);
  await input({type:"mousePressed",x:outer.left+x,y:outer.top+y,button:"left",buttons:1});await input({type:"mouseReleased",x:outer.left+x,y:outer.top+y,button:"left",buttons:0});await pause();
}
async function frameClick(id:string,name:string){const buttons=[...frame(id).contentDocument!.querySelectorAll<HTMLButtonElement>("button")],target=buttons.find(b=>b.getAttribute("aria-label")===name)??buttons.find(b=>b.textContent?.trim()===name&&b.getClientRects().length>0);if(!target||target.disabled)throw Error(`Missing ${id}: ${name}`);await inside(id,target);}
async function search(query:string){await click("Find open project");await text("Search open projects",query);}
async function screenshot(name:string,artifacts:Record<string,string>){button.closest("aside")!.style.visibility="hidden";try{artifacts[name]=(await(await input({type:"screenshot"})).json()).data;}finally{button.closest("aside")!.style.visibility="";}}
button.onclick=async()=>{
  const stored=resumed?JSON.parse(resumed):null,lines:string[]=stored?.lines??[],artifacts:Record<string,string>=stored?.artifacts??{};
  const check=(ok:unknown,label:string)=>{if(!ok)throw Error(label);lines.push(`PASS ${label}`);output.textContent=lines.join("\n");};
  try{
    if(stored){
      await ready("a");await ready("b");const a=await probe("a"),b=await probe("b");
      check(JSON.stringify(order())===JSON.stringify(stored.order),"Reload restores the displayed tab order");
      check(workspace().projects.find(p=>p.id==="a")?.pinned&&workspace().projects.find(p=>p.id==="c")?.pinned,"Reload restores both pinned project flags");
      check(visible().join(",")==="a,b"&&active()===stored.active,"Reload preserves comparison pair and active project after reordering");
      check(a.cadDocument.rootObjects.length===1&&b.cadDocument.rootObjects.length===1&&a.cadHistory.getPastLabels().length===0&&b.cadHistory.getPastLabels().length===0,"Reopened projects recover their own geometry with fresh Undo sessions");
      await waitFor(()=>a.rootUuids.has(a.cadDocument.rootObjects[0])&&b.rootUuids.has(b.cadDocument.rootObjects[0]));await frameClick("a","Fit all geometry");await frameClick("b","Fit all geometry");await physical(tab(stored.active));
      await search("주거");await screenshot("tabs-reopened-search.png",artifacts);await input({type:"key",key:"Escape"});
      sessionStorage.removeItem(reloadKey);(globalThis as any).cadTestArtifacts=artifacts;(globalThis as any).cadTestMetrics={openProjects:8,closedProjects:1,viewports:[1440,960],stableIframeOrder:true};output.textContent=lines.join("\n")+`\nALL ${lines.length} CHECKS PASSED`;return;
    }
    const originalA=await ready("a");await frameClick("a","Box");const a=await probe("a");await waitFor(()=>a.cadDocument.rootObjects.length===1);await frameClick("a","Save document");
    await physical(tab("b"));const originalB=await ready("b");await frameClick("b","Box");const b=await probe("b");await waitFor(()=>b.cadDocument.rootObjects.length===1);await frameClick("b","Save document");await physical(tab("a"));await click("Compare projects");
    const docA=originalA.contentDocument,docB=originalB.contentDocument,stateA=JSON.stringify(a.cadDocument),stateB=JSON.stringify(b.cadDocument),undoA=a.cadHistory.getPastLabels().length,undoB=b.cadHistory.getPastLabels().length;
    await waitFor(()=>a.projectKernelMetrics().activeTasks===0&&b.projectKernelMetrics().activeTasks===0);const tasks=[a.projectKernelMetrics().submittedTasks,b.projectKernelMetrics().submittedTasks];
    await click(`Pin project ${titles.c}`);await click(`Pin project ${titles.b}`);
    check(order().slice(0,2).join(",")==="b,c","Pinned projects are grouped before ordinary tabs");
    check(!frame("c"),"Pinning an unloaded project does not allocate a second editor or Worker");
    const handle=document.querySelector(`[aria-label="Move project ${titles.c}"]`)!;handle.scrollIntoView({inline:"nearest"});await pause();const start=handle.getBoundingClientRect(),target=tab("b").closest("[data-project-tab-id]")!.getBoundingClientRect();
    await input({type:"mousePressed",x:start.left+start.width/2,y:start.top+start.height/2,button:"left",buttons:1});
    for(let i=1;i<=6;i++)await input({type:"mouseMoved",x:start.left+(target.left+35-start.left)*i/6,y:start.top+start.height/2,button:"left",buttons:1});
    await input({type:"key",key:"Escape"});await input({type:"mouseReleased",x:target.left+35,y:start.top+start.height/2,button:"left",buttons:0});check(order().slice(0,2).join(",")==="b,c","Escape cancels a pointer reorder without changing stored tabs");
    await input({type:"mousePressed",x:start.left+start.width/2,y:start.top+start.height/2,button:"left",buttons:1});await input({type:"mouseMoved",x:target.left+35,y:start.top+start.height/2,button:"left",buttons:1});
    await input({type:"mouseReleased",x:target.left+35,y:start.top+start.height/2,button:"left",buttons:0});await waitFor(()=>order()[0]==="c");
    check(order().slice(0,2).join(",")==="c,b","Pointer drag reorders pinned tabs and persists the order");
    await input({type:"key",key:"ArrowRight",modifiers:9});await waitFor(()=>order()[0]==="b");check(order().slice(0,2).join(",")==="b,c","Alt Shift arrow reorders the focused tab within its group");
    await click(`Unpin project ${titles.b}`);await input({type:"key",key:"ArrowRight",modifiers:9});
    check(order().slice(0,3).join(",")==="c,a,b","Unpinning and keyboard moves preserve independent ordinary-tab order");
    check(frame("a")===originalA&&frame("b")===originalB&&originalA.contentDocument===docA&&originalB.contentDocument===docB,"Pin and reorder do not move or reload either editor iframe");
    check(JSON.stringify(a.cadDocument)===stateA&&JSON.stringify(b.cadDocument)===stateB&&a.cadHistory.getPastLabels().length===undoA&&b.cadHistory.getPastLabels().length===undoB,"Tab metadata preserves both source revisions and Undo histories");
    check(visible().join(",")==="a,b"&&a.projectKernelMetrics().submittedTasks===tasks[0]&&b.projectKernelMetrics().submittedTasks===tasks[1],"Reordering leaves comparison positions and kernel task counts unchanged");
    await physical(tab("a"));await frameClick("a","Undo");await waitFor(()=>a.cadDocument.rootObjects.length===0);check(b.cadDocument.rootObjects.length===1,"Undo after a tab move remains scoped to the original document");await frameClick("a","Redo");await waitFor(()=>a.cadDocument.rootObjects.length===1);
    await frameClick("a","Fit all geometry");await frameClick("b","Fit all geometry");
    const previous=localStorage.getItem(WORKSPACE_KEY),nativeSet=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){if(key===WORKSPACE_KEY)throw Error("Tab preference quota fixture");nativeSet.call(this,key,value);};
    await click(`Pin project ${titles.a}`);await waitFor(()=>!!document.querySelector('[role="alert"]'));Storage.prototype.setItem=nativeSet;
    check(localStorage.getItem(WORKSPACE_KEY)===previous&&!workspace().projects.find(p=>p.id==="a")?.pinned,"Failed preference write preserves the previous order and pin flags");await click("Retry");await waitFor(()=>!!workspace().projects.find(p=>p.id==="a")?.pinned);check(originalA.contentDocument===docA,"Retry saves tab metadata without restarting the editor");
    await search("닫힌");check(document.querySelectorAll('.project-tab-search [role="option"]').length===0,"Open-tab search excludes closed projects");
    await text("Search open projects","");const beforeComposition=active();await input({type:"ime",text:"주거"});await input({type:"key",key:"Enter"});
    check(!!document.querySelector('.project-tab-search')&&active()===beforeComposition,"IME composition Enter does not select or switch a project prematurely");await input({type:"ime",text:""});await text("Search open projects","주거");
    check(document.querySelectorAll('.project-tab-search [role="option"]').length===2,"Korean name search finds both residential tabs");await screenshot("tabs-search-1440.png",artifacts);await input({type:"key",key:"ArrowDown"});await input({type:"key",key:"Enter"});await waitFor(()=>active()==="b"&&!document.querySelector('.project-tab-search'));check(frame("b")===originalB,"Keyboard search switches to the existing editor session");
    await frameClick("b","Fit all geometry");await input({type:"key",key:"p",modifiers:9});await waitFor(()=>!!document.querySelector('.project-tab-search'));check(!!document.querySelector('.project-tab-search'),"Alt Shift P opens project search from inside the focused iframe");await input({type:"key",key:"Escape"});await waitFor(()=>document.activeElement?.getAttribute("aria-label")==="Find open project");check(document.activeElement?.getAttribute("aria-label")==="Find open project","Escape returns focus to the visible search trigger");
    await frameClick("b","Show Explorer");await inside("b",frame("b").contentDocument!.querySelector('[aria-label="Filter model"]')!);await input({type:"key",key:"p",modifiers:9});check(!document.querySelector('.project-tab-search'),"Typing focus in a child editor keeps its own shortcut and IME scope");await frameClick("b","Hide Explorer");
    await input({type:"viewport",width:960,height:1000});await click("Scroll project tabs right");await waitFor(()=>document.querySelector('.project-tabs')!.scrollLeft>0);check(document.documentElement.scrollWidth<=960,"Overflow controls scroll long tabs at 960px without widening the workspace");
    await search("h");await input({type:"key",key:"Enter"});await ready("h");const bounds=tab("h").getBoundingClientRect(),list=document.querySelector('.project-tabs')!.getBoundingClientRect();check(bounds.right<=list.right+1&&bounds.left>=list.left-1,"Search reveals a previously off-screen active tab");
    await click("Find open project");await text("Search open projects","주거");await screenshot("tabs-search-960.png",artifacts);await input({type:"key",key:"Escape"});
    await search("a");await input({type:"key",key:"Enter"});await waitFor(()=>active()==="a");await input({type:"viewport",width:1440,height:1000});
    await click(`Close project ${titles.c}`);await waitFor(()=>!document.getElementById("project-tab-c"));check(workspace().projects.find(p=>p.id==="c")?.pinned,"Closing a pinned project retains its pin for reopening");await choose("Reopen closed project",1);await ready("c");check(order().slice(0,2).includes("c"),"Reopened pinned project returns to the pinned group");
    await physical(document.querySelector('section[data-comparison-side="right"]:not([hidden]) .project-pane-activate')!);await search("b");await input({type:"key",key:"Enter"});await waitFor(()=>active()==="b"&&visible().includes("b"));await physical(document.querySelector('section[data-comparison-side="left"]:not([hidden]) .project-pane-activate')!);
    await search("a");await input({type:"key",key:"Enter"});await waitFor(()=>active()==="a");await frameClick("a","Save document");await frameClick("b","Save document");await physical(tab("a"));
    sessionStorage.setItem(reloadKey,JSON.stringify({lines,artifacts,order:order(),active:active()}));location.reload();
  }catch(error){await screenshot("tabs-failure.png",artifacts).catch(()=>{});(globalThis as any).cadTestArtifacts=artifacts;output.textContent=lines.join("\n")+`\nFAIL: ${error instanceof Error?error.stack:String(error)}`;}
};
installBrowserChecks(button,output);
