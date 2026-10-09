import { createRoot } from "react-dom/client";
import type { CadCommand } from "@agent-webcad/cad-commands";
import { App } from "../src/App";
import "../src/ui/tokens.css"; import "../src/ui/workstation.css"; import "../src/ui/commands.css"; import "../src/ui/menu.css"; import "../src/ui/explorer.css"; import "../src/ui/inspector.css";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory } from "../src/state/history";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { notifyDocumentChanged } from "../src/state/documentSession";
import { queryCadDocument } from "../src/state/documentQuery";
import { saveDocumentToCache } from "../src/state/documentFile";
import { readCopilotSelection } from "../src/copilot/copilotQuery";
import { resetTestDocument } from "./helpers/documentHarness";
import { createConstrainedChain } from "./helpers/constrainedChain";
import { installBrowserChecks } from "./helpers/browserChecks";
import { click, find, text, choose, waitFor, pause, physical } from "./helpers/physicalInput";

async function apply(command:CadCommand) { const result=await dispatchCadCommand(command); if(!result.ok)throw new Error(result.reason); }
resetTestDocument();
await apply({ type:"create-drawing",id:"line",name:"Measured line",drawing:"line",params:{points:[[0,0,0],[30,40,0]],workPlane:"XY"} });
await apply({ type:"create-drawing",id:"circle",name:"Exact circle",drawing:"circle",params:{center:[80,0,0],radius:10,workPlane:"XY"} });
await apply({ type:"create-dimension",id:"dim",dimension:"linear",params:{points:[[0,0],[30,40]],sourceObjectId:"line"} });
await apply({ type:"create-construction",id:"mid",workPlane:"XY",definition:{operation:"midpoint",segmentId:"line"} });
await createConstrainedChain(apply);
await apply({ type:"create-box",id:"box",name:"Measured box",width:10,depth:6,height:8 });
saveDocumentToCache();
createRoot(document.getElementById("root")!).render(<App/>);
const button=document.getElementById("run-query") as HTMLButtonElement,output=document.getElementById("query-result")!;
let network=0,unhandled=0;
window.addEventListener("unhandledrejection",()=>unhandled++);
const originalFetch=window.fetch.bind(window);
window.fetch=async(url,init)=>{
  if(String(url).includes("/api/copilot/")){network++;return new Response(JSON.stringify({version:1,summary:["Create circle"],command:{type:"create-drawing",id:"planned",drawing:"circle",params:{center:[0,0,0],radius:4,workPlane:"XY"}}}),{headers:{"Content-Type":"application/json"}});}
  return originalFetch(url,init);
};
const exact=()=>JSON.stringify(cadDocument),history=()=>JSON.stringify({past:cadHistory.getPastLabels(),future:cadHistory.getFutureLabels()});
const query=()=>document.querySelector<HTMLElement>('[aria-label="Copilot selection read"]')!;
const row=(id:string)=>query()?.querySelector<HTMLElement>(`[data-query-object-id="${id}"]`);
const ready=()=>waitFor(()=>query()?.dataset.queryStage==="ready");
const invalid=()=>waitFor(()=>query()?.dataset.queryStage==="invalid");
async function select(id:string) { await click("Model tree");await physical(document.querySelector(`[data-model-object-id="${id}"] .tree-label`)!);await click("Copilot"); }
async function target(id?:string) {
  const field=document.querySelector<HTMLSelectElement>('[aria-label="Read target"]')!;
  await choose("Read target",Array.from(field.options).findIndex(option=>option.value===(id??"")));
}
async function read() { await click((document.querySelector<HTMLSelectElement>('[aria-label="Read target"]')!.value)?"Read target":"Read selection");await ready(); }
// Delay the actual cold OCCT inspection at the transport boundary. The shared
// Inspector and Query still use the real Worker/cache; no production hook is used.
function holdInspection(offset:number) {
  const original=Worker.prototype.postMessage;
  let release:(()=>void)|undefined;
  Worker.prototype.postMessage=function(message,transfer){
    if(message.operation==="inspect"&&!release)release=()=>original.call(this,message,transfer as Transferable[]);
    else original.call(this,message,transfer as Transferable[]);
  };
  cadDocument.objects.box.transform={translation:[offset,0,0],rotation:[0,0,0],scale:[1,1,1]};notifyDocumentChanged();
  return { held:()=>!!release, release:()=>{Worker.prototype.postMessage=original;release?.();} };
}

button.onclick=async()=>{
  button.disabled=true;const checks:string[]=[],check=(ok:unknown,label:string)=>{if(!ok)throw new Error(label);checks.push(`PASS: ${label}`);output.textContent=checks.join("\n");};
  try {
    await waitFor(()=>!!document.querySelector("canvas"));await click("Copilot");
    check(find("Read selection").disabled&&query().textContent?.includes("Select objects"),"Empty selection explains how to choose a target instead of reading the whole document");
    await select("line");await choose("Copilot planner",1);await text("Copilot gateway URL","/api/copilot/query-check");await text("Copilot prompt","Keep this draft");
    const before=exact(),labels=history();await read();
    check(row("line")?.textContent?.includes("Length: 50 mm")&&query().querySelectorAll("article").length===1,"Explicit selected line reports its independent 3-4-5 length with mm units");
    check(row("line")?.textContent?.includes("2 potentially affected objects"),"Stored dimension and construction dependencies are exposed as potential downstream effects");
    check(exact()===before&&history()===labels&&network===0,"Query is local in gateway mode and leaves full document/history unchanged");
    check((document.querySelector<HTMLInputElement>('[aria-label="Copilot prompt"]')!).value==="Keep this draft","Read does not replace the editable planning draft");
    await click("Layers");await click("Copilot");
    check(query().dataset.queryStage==="ready"&&!!row("line"),"Ready read survives activity navigation with unchanged context");
    await select("dim");await invalid();check(!query().querySelector("article")&&query().textContent?.includes("selection changed"),"Changed selection removes old measurements and asks for a fresh read");
    await read();check(row("dim")?.textContent?.includes("Measures / references")&&row("dim")?.textContent?.includes("no exact geometric measurement"),"Annotation reference semantics are distinct from geometric measurement");
    await physical(row("dim")!.querySelector("li button")!);
    check(document.querySelector('[data-model-object-id="line"]')?.getAttribute("aria-pressed")==="true","Inspect source opens Model tree with the exact referenced geometry selected");
    await click("Copilot");await read();
    await apply({type:"rename-object",objectId:"line",name:"Renamed line"});await invalid();
    check(!row("line")&&query().textContent?.includes("document changed"),"Manual document edit invalidates the old read immediately");
    await read();check(row("line")?.textContent?.includes("Renamed line"),"Read again uses the latest authoritative object name");

    await select("ab");await read();check(row("ab")?.textContent?.includes("4 simultaneous constraints")&&row("ab")?.textContent?.includes("degrees of freedom"),"Sketch read explains the stored simultaneous constraint group");
    await physical([...row("ab")!.querySelectorAll("button")].find(b=>b.textContent==="Edit Sketch")!);
    check(!!find("Finish")&&document.querySelector('[data-testid="sketch-inspector"]')!==null&&[...document.querySelectorAll('.tree-row-sketch')].some(element=>element.textContent?.includes("chain")&&element.getAttribute("aria-pressed")==="true"),"Edit Sketch hands off the exact owning sketch to the existing manual editor");
    await click("Finish");await click("Copilot");
    await apply({type:"set-layer-locked",layerId:"layer-default",locked:true});
    await target("ab");const locked=exact(),lockedHistory=history();await read();
    check(row("ab")?.textContent?.includes("Default is locked")&&[...row("ab")!.querySelectorAll("button")].find(b=>b.textContent==="Edit Sketch")?.disabled,"Explicit read target explains layer lock and blocks editable handoff without editing canvas selection");
    check(exact()===locked&&history()===lockedHistory,"Reading a locked sketch target does not unlock or mutate the document/history");
    await click("Open Layers");await click("Unlock Default");await click("Copilot");await invalid();await read();
    check(![...row("ab")!.querySelectorAll("button")].find(b=>b.textContent==="Edit Sketch")?.disabled,"Unlock and reread recover the same explicit target");
    await target("mid");await read();check(row("mid")?.textContent?.includes("midpoint")&&row("mid")?.textContent?.includes("Live source"),"Construction definition and live source use the same read grammar");

    const lineFeature=Object.values(cadDocument.features).find(f=>f.output==="line")!;
    lineFeature.inputs=["lost-source"];notifyDocumentChanged();await target("line");const missing=exact(),missingHistory=history();await read();
    check(row("line")?.textContent?.includes("missing source")&&row("line")?.textContent?.includes("reconnect"),"Missing reference names the problem and recovery while retaining valid measurement");
    check(exact()===missing&&history()===missingHistory,"Missing-reference read is document/history read-only");
    lineFeature.inputs=[];cadDocument.objects.circle.transform={translation:[0,0,0],rotation:[0,0,0],scale:[2,1,1]};notifyDocumentChanged();await target("circle");await read();
    check(row("circle")?.textContent?.includes("nonuniformly")&&row("circle")?.textContent?.includes("transform"),"Unsupported exact measurement reports geometry/transform recovery instead of inventing an ellipse measurement");
    // Publish a geometry correction at the native click boundary, before
    // React's read handler. This deterministically exposes a render/version race.
    find("Read target").addEventListener("click",()=>{cadDocument.objects.circle.transform!.scale=[1,1,1];notifyDocumentChanged();},{once:true,capture:true});
    await read();
    check(row("circle")?.textContent?.includes("Area: 314.1592654 mm²"),"Correcting the transform recovers analytic measurement without a new session");

    await target();const cancelled=holdInspection(101);await select("box");await waitFor(cancelled.held);
    const cancelBefore=exact(),cancelHistory=history();await click("Read selection");await waitFor(()=>query().dataset.queryStage==="loading");
    check(find("Read selection").disabled,"Read disables duplicate requests while the shared Worker inspection waits");
    await click("Cancel read");await invalid();check(query().textContent?.includes("cancelled")&&!row("box"),"Native Cancel leaves recovery and no partial result while the Worker still waits");
    await select("line");await read();cancelled.release();await queryCadDocument(["box"]);await pause();
    check(!!row("line")&&!row("box")&&query().dataset.queryStage==="ready","Late real Worker completion cannot overwrite a newer read");
    check(exact()===cancelBefore&&history()===cancelHistory,"Cancel, late completion and replacement read leave document/history unchanged");

    const changed=holdInspection(202);await select("box");await waitFor(changed.held);await click("Read selection");await select("circle");await invalid();
    check(query().textContent?.includes("selection changed")&&!row("box"),"Selection change cancels a pending read without stale result publication");
    changed.release();await queryCadDocument(["box"]);await read();
    check(!!row("circle"),"Selection race recovers through the same Read selection command");

    const replaced=holdInspection(303);await select("box");await waitFor(replaced.held);await click("Read selection");
    notifyDocumentChanged();await invalid();replaced.release();await queryCadDocument(["box"]);await pause();
    check(query().textContent?.includes("document changed")&&!row("box"),"Same document identity/revision with new generation invalidates an in-flight read and ignores late completion");
    await read();check(row("box")?.textContent?.includes("Volume: 480 mm³"),"Reread uses the real OCCT volume after cancellation and generation change");

    const retargeted=holdInspection(404);await target("box");await click("Read target");await waitFor(retargeted.held);await target("circle");await invalid();
    check(query().textContent?.includes("read target changed")&&!row("box"),"Changing an explicit read target cancels its pending read while keeping canvas selection independent");
    retargeted.release();await queryCadDocument(["box"]);await read();
    check(!!row("circle")&&!row("box"),"A late old target cannot replace the freshly read explicit target");
    await target();

    // A short warm read timing sample, not a browser interaction benchmark.
    const timings:number[]=[];for(let i=0;i<9;i++){const start=performance.now();await readCopilotSelection(["line","circle","box"]);timings.push(performance.now()-start);}
    (globalThis as typeof globalThis&{cadTestMetrics?:unknown}).cadTestMetrics={fixtureObjects:Object.keys(cadDocument.objects).length,targets:3,warmSamples:9,queryMs:timings,p95Ms:[...timings].sort((a,b)=>a-b)[8],environment:"Edge/SwiftShader; local warmed Query; no provider/heap measurement"};
    await select("line");await click("Model tree");
    await physical(document.querySelector('[data-model-object-id="circle"] .tree-label')!,2);
    await physical(document.querySelector('[data-model-object-id="box"] .tree-label')!,2);
    await click("Copilot");await read();
    check(query().querySelectorAll("article").length===3&&!!row("line")&&!!row("circle")&&!!row("box"),"Native multi-selection reads exactly three targets and keeps long results inside the scrollable explorer");
    const beforePlan=exact(),planHistory=history();await click("Plan");await waitFor(()=>!![...document.querySelectorAll<HTMLButtonElement>('[data-testid="copilot-panel"] button')].find(b=>b.textContent==="Apply"&&!b.disabled));
    await click("Apply");await waitFor(()=>!!cadDocument.objects.planned);
    check(network===1&&cadHistory.getPastLabels().length===JSON.parse(planHistory).past.length+1,"Existing gateway Plan/Apply remain native pointer accessible beneath the Query results and commit once");
    await click("Undo");const {revision:_,...baseline}=JSON.parse(beforePlan),{revision:__,...undone}=cadDocument;
    check(JSON.stringify(undone)===JSON.stringify(baseline),"Query inspection does not alter the existing planning Undo baseline");
    check(unhandled===0,"Read cancellation/context races produce zero unhandled asynchronous errors");
    output.textContent=checks.join("\n")+`\nALL ${checks.length} CHECKS PASSED`;
  }catch(error){output.textContent=checks.join("\n")+`\nFAIL: ${error instanceof Error?error.stack:error}\nQuery state: ${query()?.outerHTML.slice(0,4000)}`;}
};
installBrowserChecks(button,output);
