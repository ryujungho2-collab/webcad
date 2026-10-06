import { createRoot } from "react-dom/client";
import { deserializeDocument, serializeDocument, type SketchGeometry } from "@agent-webcad/cad-document";
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
import { recordFeedbackTimings } from "../src/cad/feedbackTiming";
import { createDrawingTopology } from "../src/precision/drawingTopology";
import { sketchGeometryToDrawingParams } from "../src/precision/sketchAdapter";
import { solveSketch } from "../src/precision/sketchSolver";
import { resetTestDocument, restoreTestDocument } from "./helpers/documentHarness";
import { createVariablePlate } from "./helpers/variablePlate";
import { installBrowserChecks } from "./helpers/browserChecks";

const query=new URLSearchParams(location.search),task=query.get("task")??"mechanical",count=Number(query.get("count")??0);
if(!["mechanical","drawing"].includes(task)||![0,250,1000].includes(count))throw new Error("Invalid benchmark case");
resetTestDocument();
if(task==="mechanical")await createVariablePlate();
else {const result=await dispatchCadCommand({type:"create-drawing",id:"room",drawing:"polyline",params:{points:[[0,0,0],[6000,0,0],[6000,4000,0],[0,4000,0]],closed:true,workPlane:"XY"}});if(!result.ok)throw new Error(result.reason);}
// Synthetic reference geometry is a validated load fixture. Fixture construction,
// application startup and first Worker initialization are outside the timed task.
for(let i=0;i<count;i++){
  const id=`reference-${i}`,x=task==="mechanical"?10+(i%40)*1.8:200+(i%40)*120,y=task==="mechanical"?10+Math.floor(i/40)*1.3:200+Math.floor(i/40)*100;
  const geometry:SketchGeometry={id,kind:"line",construction:true,start:[x,y],end:[x+1,y+1],startId:"start",endId:"end",segmentId:"edge"};
  const sketch=cadDocument.sketches?.["plate-sketch"];
  if(sketch)sketch.geometry.push(geometry);
  const points=[[...geometry.start,0],[...geometry.end,0]];
  const params=sketch?sketchGeometryToDrawingParams(sketch,geometry):{kind:"line",points,workPlane:"XY",topology:createDrawingTopology("line",{points})};
  cadDocument.objects[id]={id,geometryId:`geometry-${id}`,name:`Reference ${i}`,visible:true,layerId:"layer-default",transform:{translation:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}};
  cadDocument.features[`feature-${id}`]={id:`feature-${id}`,type:"drawing",inputs:[],output:id,params};
  cadDocument.rootObjects.push(id);cadDocument.layers["layer-default"].objectIds.push(id);
}
if(task==="mechanical"){const solved=solveSketch(cadDocument.sketches!["plate-sketch"]);if(!solved.ok)throw new Error(solved.reason);cadDocument.sketches!["plate-sketch"]=solved.sketch;}
restoreTestDocument(deserializeDocument(serializeDocument(cadDocument)));cadHistory.clear();saveDocumentToCache();
createRoot(document.getElementById("root")!).render(<App/>);
const button=document.getElementById("run-benchmark") as HTMLButtonElement,output=document.getElementById("benchmark-result")!;
const pause=(ms=5)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
const editor=()=>document.querySelector<HTMLElement>('[data-testid="direct-edit-review"]');
const canvas=()=>document.querySelector<HTMLCanvasElement>("#root canvas");
const state=()=>{const {revision:_,...value}=cadDocument;return JSON.stringify(value);};
const find=(name:string)=>Array.from(document.querySelectorAll<HTMLButtonElement>("#root button")).find(b=>(b.getAttribute("aria-label")??b.textContent?.trim())===name);
async function waitFor(check:()=>boolean){const deadline=performance.now()+45000;while(!check()){if(performance.now()>deadline)throw new Error("Benchmark condition timed out: "+editor()?.textContent);await pause();}}
async function click(name:string){const b=find(name);if(!b||b.disabled)throw new Error(`Missing/disabled ${name}`);b.click();await waitFor(()=>!isDocumentCommandPending());await pause(35);}
async function input(action:Record<string,unknown>){const r=await fetch(`/__browser_input?run=${query.get("run")}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(action)});if(!r.ok)throw new Error(await r.text());}
const key=(key:string,modifiers=0)=>input({type:"key",key,modifiers});
const paint=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
const measurements=(name:string)=>performance.getEntriesByName(`agent-webcad:${name}`).map(e=>e.duration);
const stats=(values:number[])=>{const v=[...values].sort((a,b)=>a-b);return {n:v.length,medianMs:v.length?(v[Math.floor((v.length-1)/2)]+v[Math.floor(v.length/2)])/2:0,p95Ms:v.length?v[Math.ceil(v.length*.95)-1]:0,maxMs:v.length?v[v.length-1]:0};};
type Trial={workMs:number;activateMs:number;requestedMs:number;verifiedMs:number;applyMs:number;phases:Record<string,ReturnType<typeof stats>>};
const trials:Trial[]=[],frameGaps:number[]=[],longTasks:number[]=[];let retryCount=0,frame=0,previous=0,running=false;
const observer=new PerformanceObserver(list=>{if(running)longTasks.push(...list.getEntries().map(e=>e.duration));});
if(PerformanceObserver.supportedEntryTypes.includes("longtask"))observer.observe({type:"longtask"});
let inputAt=0,requestedAt=0,ghostBefore="";
document.addEventListener("input",event=>{if((event.target as Element).getAttribute("aria-label")==="Direct target X"){inputAt=performance.now();requestedAt=0;}},true);
const ghost=()=>document.querySelector(task==="mechanical"?'[data-requested-geometry="outline"]':'[data-direct-preview-side="requested"]')?.getAttribute("points")??"";
const mutations=new MutationObserver(()=>{if(inputAt&&!requestedAt&&ghost()&&ghost()!==ghostBefore)requestAnimationFrame(()=>{if(!requestedAt)requestedAt=performance.now();});});
mutations.observe(document.getElementById("root")!,{subtree:true,childList:true,attributes:true,attributeFilter:["points","data-preview-status"]});
const sampleFrames=(at:number)=>{if(running&&previous)frameGaps.push(at-previous);previous=at;frame=requestAnimationFrame(sampleFrames);};
button.onclick=async()=>{button.disabled=true;const checks:string[]=[],check=(ok:unknown,label:string)=>{if(!ok)throw new Error(label);checks.push(`PASS: ${label}`);};
  try{
    await waitFor(()=>Boolean(canvas()));await click("2D");
    const objectId=task==="mechanical"?"outline":"room";
    await waitFor(()=>Boolean(document.querySelector(`[data-model-object-id="${objectId}"]`)));
    (document.querySelector(`[data-model-object-id="${objectId}"]`) as HTMLElement).click();await pause(100);
    await click("Hide Explorer");await click("Hide Properties");await click("Fit all geometry");await pause(400);await click("Direct");
    const feature=cadDocument.features[`feature-${objectId}`],gripId=task==="mechanical"?"b":(feature.params.topology as {controls:{id:string}[]}).controls[2].id;
    const focused=()=>document.activeElement?.getAttribute("data-direct-handle")===gripId;
    await waitFor(()=>Boolean(document.querySelector(`[data-handle-object="${objectId}"][data-direct-handle="${gripId}"]`)));
    (document.querySelector(`[data-handle-object="${objectId}"][data-direct-handle="${gripId}"]`) as SVGElement).focus();await pause(150);
    // Warm preview and Worker caches without changing the document.
    await key("Enter");await waitFor(()=>document.activeElement?.getAttribute("aria-label")==="Direct target X");await key("a",2);await input({type:"text",text:task==="mechanical"?"101mm":"6010mm"});await waitFor(()=>editor()?.dataset.previewStatus==="ready");await paint();await key("Escape");await waitFor(()=>!editor()&&focused());
    const original=state(),past=cadHistory.getPastLabels().length;
    running=true;recordFeedbackTimings(true);frame=requestAnimationFrame(sampleFrames);
    for(let i=1;i<=6;i++){
      const before=state(),start=performance.now();performance.clearMeasures();
      await key("Enter");await waitFor(()=>document.activeElement?.getAttribute("aria-label")==="Direct target X");const activated=performance.now();
      await key("a",2);ghostBefore=ghost();inputAt=0;await input({type:"text",text:`${task==="mechanical"?100+5*i:6000+100*i}mm`});
      await waitFor(()=>editor()?.dataset.previewStatus==="ready"&&Boolean(ghost()));await paint();const verified=performance.now();
      check(state()===before&&cadHistory.getPastLabels().length===past+i-1,`Trial ${i}: preview preserves the complete baseline and History`);
      const phases=Object.fromEntries(["direct-plan","preview-prepare","preview-diff","preview-compare","direct-feedback","kernel-task:inspect"].map(name=>[name,stats(measurements(name))]));
      const applyStart=performance.now();await key("Enter");await waitFor(()=>!editor()&&!isDocumentCommandPending()&&focused());await paint();const applied=performance.now();
      phases["viewport-sync"]=stats(measurements("viewport-sync"));
      const actual=task==="mechanical"?(cadDocument.sketches!["plate-sketch"].geometry.find(g=>g.id==="outline") as {width:number}).width:(cadDocument.features["feature-room"].params.points as number[][])[2][0];
      check(Math.abs(actual-(task==="mechanical"?100+5*i:6000+100*i))<1e-5&&cadHistory.getPastLabels().length===past+i,`Trial ${i}: exact Apply adds one history step and returns to the same grip`);
      trials.push({workMs:applied-start,activateMs:activated-start,requestedMs:(requestedAt||verified)-inputAt,verifiedMs:verified-inputAt,applyMs:applied-applyStart,phases});
      inputAt=0;
    }
    running=false;recordFeedbackTimings(false);cancelAnimationFrame(frame);observer.disconnect();
    const final=state();await click("Undo");await click("Redo");check(state()===final,"One Undo/Redo reproduces the entire last edit");
    for(let i=0;i<6;i++)await click("Undo");check(state()===original,"Six Undo operations restore every source, relation, binding, background object and solid definition");for(let i=0;i<6;i++)await click("Redo");check(state()===final,"Six Redo operations reproduce the complete final document");
    if(task==="mechanical"){const result=await queryCadDocument(["plate-solid"]);check(Math.abs(result.objects[0].measurement!.volume!-(130*60-64*Math.PI)*8)<.01,"Real Worker volume agrees with 130 × 60 plate and four unchanged holes");}
    // Deliberate invalid input is reported separately from unplanned retries.
    (document.querySelector(`[data-handle-object="${objectId}"][data-direct-handle="${gripId}"]`) as SVGElement).focus();await key("Enter");await waitFor(()=>document.activeElement?.getAttribute("aria-label")==="Direct target X");await key("a",2);await input({type:"text",text:"20deg"});await waitFor(()=>editor()?.dataset.previewStatus==="blocked");check(find("Apply direct edit")?.disabled&&state()===final,"Wrong units block Apply without altering the document");await key("Escape");await waitFor(()=>!editor());
    const summary={task,count,objects:Object.keys(cadDocument.objects).length,completedEdits:trials.length,unexpectedRetries:retryCount,intentionalInvalidInputs:1,work:stats(trials.map(t=>t.workMs)),requested:stats(trials.map(t=>t.requestedMs)),verified:stats(trials.map(t=>t.verifiedMs)),apply:stats(trials.map(t=>t.applyMs)),frameGap:stats(frameGaps),longTasks:stats(longTasks),phases:Object.fromEntries(["direct-plan","preview-prepare","preview-diff","preview-compare","direct-feedback","kernel-task:inspect","viewport-sync"].map(name=>[name,stats(trials.map(t=>t.phases[name].maxMs))]))};
    (globalThis as typeof globalThis&{cadTestMetrics?:unknown}).cadTestMetrics={summary,trials,frameGaps,longTasks,method:"Six trusted keyboard precision edits after one canceled warm-up; input event to two animation frames after ready; automatic work time includes adapter overhead and baseline/history guards, excludes setup and Undo/Redo checks. Long tasks/frame gaps include the timed loop and assertions. Median/p95 use nearest-rank samples; software GPU, dev build, local assets."};
    output.textContent=checks.join("\n")+`\nALL ${checks.length} CHECKS PASSED`;
  }catch(cause){running=false;recordFeedbackTimings(false);cancelAnimationFrame(frame);retryCount++;(globalThis as typeof globalThis&{cadTestMetrics?:unknown}).cadTestMetrics={task,count,trials,unexpectedRetries:retryCount};output.textContent=`FAIL: ${cause instanceof Error?cause.message:cause}`;}
};installBrowserChecks(button,output);
