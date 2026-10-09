import { createRoot } from "react-dom/client";
import { App } from "../src/App";
import "../src/ui/tokens.css"; import "../src/ui/workstation.css"; import "../src/ui/commands.css"; import "../src/ui/menu.css"; import "../src/ui/explorer.css"; import "../src/ui/inspector.css";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory } from "../src/state/history";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { enqueueDocumentCommand, isDocumentCommandPending } from "../src/state/documentCommandQueue";
import { saveDocumentToCache } from "../src/state/documentFile";
import { resetTestDocument } from "./helpers/documentHarness";
import { installBrowserChecks } from "./helpers/browserChecks";
import { click, text, choose, waitFor, pause, physical, input } from "./helpers/physicalInput";
resetTestDocument();
await dispatchCadCommand({type:"create-drawing",id:"line",name:"Move source",drawing:"line",params:{workPlane:"XY",points:[[0,0,0],[30,40,0]]}});
await dispatchCadCommand({type:"create-drawing",id:"other",name:"Other drawing",drawing:"circle",params:{workPlane:"XY",center:[80,0,0],radius:10}});
await dispatchCadCommand({type:"create-dimension",id:"dim",dimension:"linear",params:{points:[[0,0],[30,40]],sourceObjectId:"line"}});
await dispatchCadCommand({type:"create-construction",id:"mid",workPlane:"XY",definition:{operation:"midpoint",segmentId:"line"}});
saveDocumentToCache();
createRoot(document.getElementById("root")!).render(<App/>);
const button=document.getElementById("run-edit") as HTMLButtonElement,output=document.getElementById("edit-result")!;
let command:unknown={type:"move-object",objectId:"line",translation:[10,20,0]},sent:any,delay=false,respond:((r:Response)=>void)|undefined,unhandled=0;
window.addEventListener("unhandledrejection",()=>unhandled++);
const originalFetch=window.fetch.bind(window);
window.fetch=async(url,init)=>{
  if(String(url).endsWith("/api/copilot/move")){sent=JSON.parse(String(init?.body));if(delay)return new Promise(resolve=>{respond=resolve;});return new Response(JSON.stringify({version:1,summary:["Server claims arbitrary effects"],command,ghosts:[{kind:"drawing",params:{points:[[999,999,0]]}}]}),{headers:{"Content-Type":"application/json"}});}
  return originalFetch(url,init);
};
const exact=()=>JSON.stringify(cadDocument),semantic=()=>{const {revision:_,...rest}=cadDocument;return JSON.stringify(rest);},history=()=>JSON.stringify({past:cadHistory.getPastLabels(),future:cadHistory.getFutureLabels()});
const apply=()=>[...document.querySelectorAll<HTMLButtonElement>('[data-testid="copilot-panel"] button')].find(b=>b.textContent?.trim()==="Apply");
const ready=()=>waitFor(()=>!!apply()&&!apply()!.disabled),alert=()=>document.querySelector('[data-testid="copilot-panel"] [role="alert"]')?.textContent??"";
async function select(id:string,modifiers=0){await click("Model tree");await physical(document.querySelector(`[data-model-object-id="${id}"] .tree-label`)!,modifiers);await click("Copilot");}
async function plan(prompt:string){await text("Copilot prompt",prompt);await click("Plan");}
function hold(){let release!:()=>void;const pending=enqueueDocumentCommand(()=>new Promise<void>(resolve=>release=resolve));return {pending,release:()=>release()};}
async function tealPixels(){
  const response=await input({type:"screenshot"}),shot=await response.json() as {data:string};
  const image=await createImageBitmap(await (await originalFetch(`data:image/png;base64,${shot.data}`)).blob());
  const surface=document.createElement("canvas");surface.width=image.width;surface.height=image.height;const ctx=surface.getContext("2d")!;ctx.drawImage(image,0,0);image.close();
  const box=document.querySelector("canvas")!.getBoundingClientRect(),sx=surface.width/window.innerWidth,sy=surface.height/window.innerHeight;
  const data=ctx.getImageData(Math.ceil(box.left*sx),Math.ceil(box.top*sy),Math.floor(box.width*sx),Math.floor(box.height*sy)).data;
  let count=0;for(let i=0;i<data.length;i+=4)if(data[i+1]>80&&data[i]<data[i+1]*0.72&&data[i+2]>data[i+1]*0.7&&data[i+2]<data[i+1]*1.12)count++;return count;
}
button.onclick=async()=>{
  button.disabled=true;const checks:string[]=[],check=(v:unknown,s:string)=>{if(!v)throw new Error(s);checks.push(`PASS: ${s}`);output.textContent=checks.join("\n");};
  try{
    await waitFor(()=>!!document.querySelector("canvas"));await click("2D");await click("Fit all geometry");await click("Copilot");await select("line");await choose("Copilot planner",1);await text("Copilot gateway URL","/api/copilot/move");
    const before=exact(),beforeSemantic=semantic(),labels=history(),past=cadHistory.getPastLabels().length;
    await plan("Move selected drawing to translation 10,20,0 mm");await ready();
    check(sent.edit.target.id==="line"&&sent.edit.coordinates==="absolute-world-translation"&&sent.context.units==="mm","Gateway advertises exact selected edit target and absolute world mm placement");
    check(exact()===before&&history()===labels,"Detached Move preview preserves document and both history branches");
    check(document.body.innerText.includes("Move source: translation [0, 0, 0] → [10, 20, 0]")&&!document.body.innerText.includes("Server claims arbitrary effects"),"Locally derived review names target and actual before/after values");
    await physical(document.querySelector('[aria-label="Copilot review"] details summary')!);
    check(document.body.innerText.includes("Dimensions")&&document.body.innerText.includes("Constructions"),"Impact review includes downstream dimension and construction updates");
    await pause();const visible=await tealPixels();await click("Hide preview");const hidden=await tealPixels();
    check(visible>hidden+10,`Actual canvas screenshot contains result ghost pixels that disappear when preview is hidden (${visible} → ${hidden})`);await click("Show preview");
    await click("Clear");check(exact()===before&&history()===labels,"Clear discards Move and keeps the source/relationships/history unchanged");
    await click("Plan");await ready();await click("Apply");await waitFor(()=>cadDocument.objects.line.transform?.translation[0]===10);
    check(cadHistory.getPastLabels().length===past+1&&Object.keys(cadDocument.objects).length===4,"Move edits the existing target in one Undo and creates no duplicate geometry");
    check(JSON.stringify(cadDocument.features["feature-mid"].params.points)==="[[25,40,0]]","Move recomputes the midpoint relationship in the same transaction");
    check(document.body.innerText.includes("Completed on 1 object"),"Edited result is offered through completed handoff");
    const after=semantic();await click("Undo");check(semantic()===beforeSemantic,"Undo restores geometry and all linked relationships");await click("Redo");check(semantic()===after,"Redo restores the exact moved model");const committedHistory=history();
    await click("Inspect result");check(document.querySelector('[data-model-object-id="line"]')?.getAttribute("aria-pressed")==="true"&&/inspector/i.test(document.body.innerText)&&/geometry/i.test(document.body.innerText),"Inspect result hands the moved source to manual Properties");await click("Copilot");
    command={type:"move-object",objectId:"other",translation:[15,0,0]};await plan("Unselected target");await waitFor(()=>alert().includes("outside the reviewed edit selection"));check(semantic()===after&&!apply(),"Gateway cannot move an unselected drawing");
    command={type:"move-object",objectId:"line",translation:[10,20,1]};await plan("Off-plane target");await waitFor(()=>alert().includes("stay on"));check(semantic()===after,"Off-plane input explains recovery and never changes the model");
    command={type:"move-object",objectId:"line",translation:[20,30,0]};await plan("Corrected Move");await ready();check(semantic()===after,"Corrected input can be reviewed without leaving the tool");
    const queued=hold();await pause();await click("Apply");await click("Cancel apply");queued.release();await queued.pending;await waitFor(()=>!isDocumentCommandPending());check(semantic()===after&&history()===committedHistory&&!apply(),"Cancel queued Move publishes no model, relationship or history changes");
    await click("Plan");await ready();const selectionQueue=hold();await pause();await click("Apply");await select("other");selectionQueue.release();await selectionQueue.pending;await waitFor(()=>!isDocumentCommandPending());check(semantic()===after&&history()===committedHistory&&!apply(),"Selection change while queued invalidates Move before publication");
    await select("line");delay=true;await plan("Delayed Move");await waitFor(()=>!!respond);await click("Cancel request");respond!(new Response(JSON.stringify({version:1,summary:["Late Move"],command}),{headers:{"Content-Type":"application/json"}}));respond=undefined;delay=false;await pause();check(semantic()===after&&!apply(),"Cancelled late gateway Move cannot restore an applicable proposal");
    await click("Plan");await ready();await dispatchCadCommand({type:"set-layer-locked",layerId:"layer-default",locked:true});await waitFor(()=>alert().includes("document changed"));
    const locked=exact();check(!apply()&&exact()===locked,"Locking a target invalidates its previously reviewed Move");
    await dispatchCadCommand({type:"set-layer-locked",layerId:"layer-default",locked:false});await select("line");
    command={type:"move-object",objectId:"mid",translation:[20,30,0]};await select("mid");await plan("Move owned construction");await waitFor(()=>!!alert());check(alert().includes("finite 2D")||alert().includes("owner"),"Generated construction offers manual recovery instead of editing its coordinates");
    check(cadDocument.objects.line.transform?.translation[0]===10,"Rejected/cancelled edits preserve the last committed source placement");
    await dispatchCadCommand({type:"create-layer",id:"dimension-lock"});await dispatchCadCommand({type:"move-object-to-layer",objectId:"dim",layerId:"dimension-lock"});await dispatchCadCommand({type:"set-layer-locked",layerId:"dimension-lock",locked:true});
    await select("line");command={type:"move-object",objectId:"line",translation:[20,30,0]};const downstreamBefore=exact(),downstreamHistory=history();
    await plan("Move with locked downstream dimension");await waitFor(()=>alert().includes("locked"));
    check(exact()===downstreamBefore&&history()===downstreamHistory&&apply()?.disabled,"Locked downstream dimension rejects the whole reviewed Move with document/history unchanged");
    await dispatchCadCommand({type:"set-layer-locked",layerId:"dimension-lock",locked:false});await click("Plan");await ready();
    check(document.body.innerText.includes("3 affected objects"),"Unlocking the dependency recovers the same Move and all linked effects");await click("Clear");
    await select("line");await select("other",2);const multiBefore=exact(),multiHistory=history();await plan("Move two selected drawings");await waitFor(()=>alert().includes("exactly one"));
    check(exact()===multiBefore&&history()===multiHistory&&!apply(),"Unsupported multiple edit targets preserve both source objects and history");
    check(unhandled===0,"No unhandled promises from rejected, stale, cancelled or late Move operations");
    output.textContent=checks.join("\n")+`\nALL ${checks.length} CHECKS PASSED`;
  }catch(error){output.textContent=checks.join("\n")+`\nFAIL: ${error instanceof Error?error.stack:error}`;}
};installBrowserChecks(button,output);
