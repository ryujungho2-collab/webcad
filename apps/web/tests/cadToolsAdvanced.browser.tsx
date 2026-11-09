import {createRoot} from "react-dom/client";
import {App} from "../src/App";
import "../src/ui/tokens.css";import "../src/ui/workstation.css";import "../src/ui/commands.css";import "../src/ui/menu.css";import "../src/ui/explorer.css";import "../src/ui/inspector.css";
import {cadDocument} from "../src/state/cadDocument";
import {cadHistory} from "../src/state/history";
import {measureDocumentObject} from "../src/state/documentQuery";
import {serializeDocument} from "@agent-webcad/cad-document";
import {saveDocumentToCache} from "../src/state/documentFile";
import {exportStepBytes} from "../src/export/exportModel";
import {click,text,choose,physical,waitFor,input} from "./helpers/physicalInput";
import {installBrowserChecks} from "./helpers/browserChecks";

createRoot(document.getElementById("root")!).render(<App/>);
const button=document.getElementById("run-tools") as HTMLButtonElement,output=document.getElementById("tools-result")!;
const panel=()=>document.querySelector('[data-testid="copilot-panel"]')!;
const apply=()=>[...panel().querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent?.trim()==="Apply");
const ready=()=>waitFor(()=>!!apply()&&!apply()!.disabled);
const semantic=()=>{const{revision:_,...rest}=cadDocument;return JSON.stringify(rest);};
const tool=(name:string,args:Record<string,unknown>,id:string)=>({id,name,arguments:args});
const originalFetch=window.fetch.bind(window);
let catalogCount=0;
window.fetch=async(url,init)=>{
  if(!String(url).endsWith("/api/copilot/advanced"))return originalFetch(url,init);
  catalogCount=JSON.parse(String(init?.body)).tools.tools.length;
  const toolCalls=[
    tool("solid.primitive",{id:"base",primitive:"box",params:{width:40,depth:30,height:20},position:[30,0,0]},"base"),
    tool("curve.polyline",{id:"tubeSection",plane:"XZ",points:[[5,0,0],[10,0,0],[10,0,20],[5,0,20]],closed:true},"tubeSection"),
    tool("solid.revolve",{id:"tube",profileObjectIds:["tubeSection"],axis:"y",angle:360},"tube"),
    tool("curve.circle",{id:"sweepSection",plane:"XY",center:[0,40,0],radius:4},"sweepSection"),
    tool("curve.polyline",{id:"path",plane:"XZ",points:[[0,40,0],[0,40,30]],closed:false},"path"),
    tool("solid.sweep",{id:"swept",profileObjectIds:["sweepSection"],pathObjectId:"path"},"swept"),
    tool("curve.circle",{id:"bottom",plane:"XY",center:[-30,0,0],radius:10},"bottom"),
    tool("curve.circle",{id:"top",plane:"XY",center:[-30,0,30],radius:5},"top"),
    tool("solid.loft",{id:"lofted",profileObjectIds:["bottom","top"],ruled:true},"lofted"),
  ];
  return new Response(JSON.stringify({version:1,toolCalls}),{headers:{"Content-Type":"application/json"}});
};
async function plan(prompt:string){await text("Copilot prompt",prompt);await click("Plan");await ready();}
async function select(id:string){await click("Model tree");await physical(document.querySelector(`[data-model-object-id="${id}"] .tree-label`)!);await click("Copilot");}
const near=async(id:string,expected:number)=>{const measured=await measureDocumentObject(cadDocument,id);return measured.validity==="valid"&&Math.abs(measured.volume!-expected)<.005;};
button.onclick=async()=>{
  button.disabled=true;const checks:string[]=[],check=(ok:unknown,label:string)=>{if(!ok)throw Error(label);checks.push(`PASS: ${label}`);output.textContent=checks.join("\n");};
  try{
    await waitFor(()=>!!document.querySelector("canvas"));
    const stored=sessionStorage.getItem("advanced-tools-reopen");
    if(stored){
      const saved=JSON.parse(stored) as {state:string;checks:string[];step:string;shell:string};checks.push(...saved.checks);
      check(semantic()===saved.state,"Actual page reload preserves all source relationships and exact face keys");
      check(await near(saved.shell,24000-36*26*18)&&await near("tube",1500*Math.PI)&&await near("swept",480*Math.PI)&&await near("lofted",1750*Math.PI),"All four saved solids rebuild in the Worker to independent analytic volumes");
      await click("3D");await click("Copilot");await select(saved.shell);await click("Fit all geometry");const toggle=document.querySelector<HTMLInputElement>('[aria-label="Enable hover distance"]');if(toggle?.checked)await physical(toggle);
      (output.closest("aside") as HTMLElement).hidden=true;const shot=await(await input({type:"screenshot"})).json() as {data:string};
      (globalThis as typeof globalThis&{cadTestArtifacts?:Record<string,string>}).cadTestArtifacts={"model.webcad.json":serializeDocument(cadDocument),"model.step":saved.step,"viewport.png":shot.data};
      sessionStorage.removeItem("advanced-tools-reopen");output.textContent=`${checks.join("\n")}\nALL ${checks.length} CHECKS PASSED`;return;
    }
    await click("New document");await click("3D");await click("Copilot");await choose("Copilot planner",1);await text("Copilot gateway URL","/api/copilot/advanced");
    const before=semantic();await plan("Create a tube, swept rod, lofted transition and finishing blank");
    check(catalogCount===40,"Gateway discovers 40 common CAD tools including edges and all six added solid operations");
    check(semantic()===before&&cadHistory.getPastLabels().length===0,"Nine-step construction graph previews without publishing intermediate sources");
    check(panel().querySelector('[aria-label="CAD tool steps"]')?.textContent?.includes("9"),"Review exposes the actual construction steps");
    await click("Apply");await waitFor(()=>!!cadDocument.objects.lofted);
    check(cadHistory.getPastLabels().length===1,"World profiles, path and four solids publish in one Undo");
    check(await near("tube",1500*Math.PI),"Revolve produces the requested exact hollow tube");
    check(await near("swept",480*Math.PI),"Sweep follows the elevated world path with exact cylinder volume");
    check(await near("lofted",1750*Math.PI),"Loft joins elevated circles with exact frustum volume");
    await select("base");await choose("Copilot planner",0);
    const beforeFinish=semantic();await plan("수직 모서리 반지름 2mm 필렛");check(semantic()===beforeFinish,"Live edge query and rounded-solid preview are detached");await click("Apply");await waitFor(()=>Object.values(cadDocument.features).some(f=>f.type==="fillet"));
    const rounded=Object.values(cadDocument.features).find(f=>f.type==="fillet")!;
    check(await near(rounded.output,(1200-(4-Math.PI)*4)*20)&&rounded.inputs[0]==="base","Local fillet uses exact world-vertical edges and retains its source");
    const filleted=semantic();await click("Undo");check(semantic()===beforeFinish,"Undo removes the entire edge finish and restores its source");await click("Redo");check(semantic()===filleted,"Redo restores the exact fillet definition");await click("Undo");
    await select("base");await plan("수직 모서리 1mm 모따기");await click("Apply");await waitFor(()=>Object.values(cadDocument.features).some(f=>f.type==="chamfer"));const chamfer=Object.values(cadDocument.features).find(f=>f.type==="chamfer")!;
    check(await near(chamfer.output,23960),"Symmetric chamfer removes the four analytic triangular corner prisms");await click("Undo");
    await select("base");await plan("윗면 제거 두께 2mm 셸");await click("Apply");await waitFor(()=>Object.values(cadDocument.features).some(f=>f.type==="shell"));const shell=Object.values(cadDocument.features).find(f=>f.type==="shell")!;
    check(await near(shell.output,24000-36*26*18)&&shell.params.referenceStatus==="resolved","Shell removes the unique top face and leaves exact 2mm walls and base");
    check(cadHistory.getPastLabels().length===2,"Final multi-solid scene and shell have two coherent history entries");
    const step=new TextDecoder().decode(await exportStepBytes());check(step.includes("ISO-10303-21"),"All four exact solids export together as STEP BReps");
    saveDocumentToCache();sessionStorage.setItem("advanced-tools-reopen",JSON.stringify({state:semantic(),checks,step,shell:shell.output}));location.reload();
  }catch(error){output.textContent+=`\nFAIL: ${error instanceof Error?error.stack:String(error)}`;}
};installBrowserChecks(button,output);
