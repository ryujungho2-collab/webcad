import { createRoot } from "react-dom/client";
import { App } from "../src/App";
import "../src/ui/tokens.css"; import "../src/ui/workstation.css"; import "../src/ui/commands.css"; import "../src/ui/menu.css"; import "../src/ui/explorer.css"; import "../src/ui/inspector.css";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory } from "../src/state/history";
import { measureDocumentObject } from "../src/state/documentQuery";
import { serializeDocument } from "@agent-webcad/cad-document";
import { saveDocumentToCache } from "../src/state/documentFile";
import { exportStepBytes } from "../src/export/exportModel";
import { click, text, choose, physical, waitFor, pause, input } from "./helpers/physicalInput";
import { installBrowserChecks } from "./helpers/browserChecks";

createRoot(document.getElementById("root")!).render(<App/>);
const button=document.getElementById("run-tools") as HTMLButtonElement,output=document.getElementById("tools-result")!;
const panel=()=>document.querySelector('[data-testid="copilot-panel"]')!;
const apply=()=>[...panel().querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent?.trim()==="Apply");
const ready=()=>waitFor(()=>!!apply()&&!apply()!.disabled);
const alert=()=>panel().querySelector('[role="alert"]')?.textContent??"";
const semantic=()=>{const{revision:_,...rest}=cadDocument;return JSON.stringify(rest);};
const exact=()=>JSON.stringify(cadDocument),history=()=>JSON.stringify([cadHistory.getPastLabels(),cadHistory.getFutureLabels()]);
async function plan(prompt:string){await text("Copilot prompt",prompt);await click("Plan");}
const tool=(id:string,name:string,args:Record<string,unknown>)=>({id,name,arguments:args});
const json=(value:unknown)=>new Response(JSON.stringify(value),{headers:{"Content-Type":"application/json"}});
const originalFetch=window.fetch.bind(window);
let gatewayMode="union",targetId="",round=0,sent:any,paused:((value:Response)=>void)|undefined;
window.fetch=async(url,init)=>{
  if(!String(url).endsWith("/api/copilot/tools"))return originalFetch(url,init);
  sent=JSON.parse(String(init?.body));round++;
  if(gatewayMode==="late")return new Promise(resolve=>{paused=resolve;});
  if(gatewayMode==="foreign")return json({version:1,toolCalls:[tool("bad","solid.boolean",{id:"badUnion",operation:"union",targetId:"gatewayTool",toolId:"unionResult"})]});
  if(!sent.toolResults)return json({version:1,toolCalls:[tool("inspect","cad.inspect",{objectIds:[targetId]}),tool("measure","cad.measure",{objectIds:[targetId]}),tool("faces","cad.faces",{objectId:targetId})]});
  return json({version:1,toolCalls:[tool("newTool","solid.primitive",{id:"gatewayTool",primitive:"box",params:{width:30,depth:20,height:20},position:[60,20,0]}),tool("union","solid.boolean",{id:"unionResult",operation:"union",targetId,toolId:"gatewayTool"})]});
};

button.onclick=async()=>{
  button.disabled=true;const checks:string[]=[],check=(ok:unknown,label:string)=>{if(!ok)throw new Error(label);checks.push(`PASS: ${label}`);output.textContent=checks.join("\n");};
  try{
    await waitFor(()=>!!document.querySelector("canvas"));
    const stored=sessionStorage.getItem("cad-tools-reopen");
    if(stored){
      const saved=JSON.parse(stored) as {state:string;checks:string[];step:string};checks.push(...saved.checks);
      check(semantic()===saved.state,"Actual cache reload restores the linked sketch/extrude/hole/Boolean graph");
      check(Math.abs((await measureDocumentObject(cadDocument,"unionResult")).volume!-(84000-180*Math.PI))<.002,"Reopened graph rebuilds to the analytic union and through-hole volume");
      await click("3D");await click("Copilot");await click("Model tree");await physical(document.querySelector('[data-model-object-id="unionResult"] .tree-label')!);await click("Copilot");
      await click("Fit all geometry");const toggle=document.querySelector<HTMLInputElement>('[aria-label="Enable hover distance"]');if(toggle?.checked)await physical(toggle);
      (output.closest("aside") as HTMLElement).hidden=true;
      const shot=await(await input({type:"screenshot"})).json() as {data:string};
      (globalThis as typeof globalThis&{cadTestArtifacts?:Record<string,string>}).cadTestArtifacts={"model.webcad.json":serializeDocument(cadDocument),"model.step":saved.step,"viewport.png":shot.data};
      sessionStorage.removeItem("cad-tools-reopen");output.textContent=`${checks.join("\n")}\nALL ${checks.length} CHECKS PASSED`;return;
    }
    await click("New document");await click("3D");await click("Copilot");
    const before=exact(),labels=history();
    await plan("80x50 사각형 스케치");await ready();
    check(exact()===before&&history()===labels,"Shared sketch tool preview is detached from document and Undo");
    check(!!panel().querySelector('[aria-label="CAD tool steps"]')&&panel().textContent?.includes("80 × 50 mm"),"Review lists real modeling steps and explicit sketch dimensions");
    await click("Apply");await waitFor(()=>Object.keys(cadDocument.sketches??{}).length===1);
    const sketch=Object.values(cadDocument.sketches!)[0],profile=sketch.geometry[0].id;
    check(sketch.geometry.length===1&&sketch.constraints.length===3&&cadHistory.getPastLabels().length===1,"Rectangle tool creates an anchored dimensioned sketch as one Undo");
    await plan("선택한 윤곽 20mm 돌출");await ready();await click("Apply");await waitFor(()=>Object.values(cadDocument.features).some(f=>f.type==="extrude"));
    const body=Object.values(cadDocument.features).find(f=>f.type==="extrude")!;
    check(body.inputs.includes(profile)&&Math.abs((await measureDocumentObject(cadDocument,body.output)).volume!-80000)<.001,"Selected-profile extrusion retains the original sketch and exact requested solid");
    const beforeHole=semantic(),holePast=cadHistory.getPastLabels().length;
    await plan("윗면 중심에 지름 6mm 관통 구멍");await ready();check(semantic()===beforeHole,"Face lookup and hole preview leave the source unchanged");
    await click("Apply");await waitFor(()=>Object.values(cadDocument.features).some(f=>!!f.params.faceHole));
    const hole=Object.values(cadDocument.features).find(f=>!!f.params.faceHole)!;targetId=hole.output;
    check(cadHistory.getPastLabels().length===holePast+1&&Object.keys(cadDocument.workPlanes??{}).length===1,"Face work plane and hole publish together in a single Undo");
    check(Math.abs((await measureDocumentObject(cadDocument,targetId)).volume!-(80000-180*Math.PI))<.001,"Through-hole volume agrees with the independent cylinder subtraction formula");
    const holed=semantic();await click("Undo");check(semantic()===beforeHole,"Undo restores the original extrusion and removes the hole's plane");await click("Redo");check(semantic()===holed,"Redo restores exact source face identity and hole definition");
    await choose("Copilot planner",1);await text("Copilot gateway URL","/api/copilot/tools");
    const gatewayBefore=exact(),gatewayHistory=history();await plan("Inspect and union with an additional block");await ready();
    check(round===2&&sent.tools.tools.some((tool:any)=>tool.name==="solid.extrude")&&sent.toolResults.length===3,"Gateway discovers common schemas and receives bounded inspect/measure/face results");
    check(exact()===gatewayBefore&&history()===gatewayHistory,"All gateway read rounds and multi-step modeling review remain detached");
    check(panel().querySelector('[aria-label="CAD tool steps"]')?.textContent?.includes("5 query/model steps"),"Review explains query steps and both proposed modeling operations");
    const unionPast=cadHistory.getPastLabels().length;await click("Apply");await waitFor(()=>!!cadDocument.objects.unionResult);
    check(cadHistory.getPastLabels().length===unionPast+1&&!cadDocument.objects.gatewayTool.visible&&!cadDocument.objects[targetId].visible,"Primitive plus linked Boolean applies once and selects the final result");
    check(Math.abs((await measureDocumentObject(cadDocument,"unionResult")).volume!-(84000-180*Math.PI))<.002,"Real Worker union retains the existing hole and matches analytic overlap volume");
    const union=semantic(),unionHistory=history();gatewayMode="foreign";await plan("Try a hidden input");await waitFor(()=>!!alert());check(!apply()&&semantic()===union&&history()===unionHistory,"A queried or hidden input outside edit selection cannot be used as a Boolean source");
    gatewayMode="late";await plan("Cancel a pending query request");await waitFor(()=>!!paused);await click("Cancel request");paused!(json({version:1,toolCalls:[tool("late","cad.objects",{})]}));await pause();
    check(!apply()&&semantic()===union&&history()===unionHistory,"A late gateway tool request cannot revive a cancelled plan");
    const step=new TextDecoder().decode(await exportStepBytes());check(step.includes("ISO-10303-21"),"Linked final geometry exports as a STEP BRep");
    saveDocumentToCache();sessionStorage.setItem("cad-tools-reopen",JSON.stringify({state:semantic(),checks,step}));location.reload();
  }catch(error){output.textContent+=`\nFAIL: ${error instanceof Error?error.stack:String(error)}`;}
};installBrowserChecks(button,output);
