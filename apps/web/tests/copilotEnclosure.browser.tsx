import "../src/styles.css";import {createRoot} from "react-dom/client";import {App} from "../src/App";
import "../src/ui/tokens.css";import "../src/ui/workstation.css";import "../src/ui/commands.css";import "../src/ui/menu.css";import "../src/ui/explorer.css";import "../src/ui/inspector.css";
import {cadDocument} from "../src/state/cadDocument";import {cadHistory} from "../src/state/history";
import {measureDocumentObject} from "../src/state/documentQuery";import {serializeDocument} from "@agent-webcad/cad-document";
import {saveDocumentToCache} from "../src/state/documentFile";import {exportStepBytes} from "../src/export/exportModel";
import {click,text,waitFor,input,physical} from "./helpers/physicalInput";import {installBrowserChecks} from "./helpers/browserChecks";
createRoot(document.getElementById("root")!).render(<App/>);
const button=document.getElementById("run-tools") as HTMLButtonElement,output=document.getElementById("tools-result")!;
const panel=()=>document.querySelector('[data-testid="copilot-panel"]')!,apply=()=>[...panel().querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent?.trim()==="Apply");
const state=()=>{const{revision:_,...d}=cadDocument;return JSON.stringify(d);};
const prompts=["100x70 사각형 스케치","선택한 윤곽 30mm 돌출","수직 모서리 반지름 4mm 필렛","윗면 제거 두께 2mm 셸","안쪽 바닥 중심에 지름 8mm 관통 구멍","앞면 중심에 지름 10mm 깊이 2mm 구멍"];
const area=(w:number,d:number,r:number)=>w*d-(4-Math.PI)*r*r,volumes=[0,210000,area(100,70,4)*30,area(100,70,4)*30-area(96,66,2)*28,area(100,70,4)*30-area(96,66,2)*28-32*Math.PI,area(100,70,4)*30-area(96,66,2)*28-82*Math.PI];
const plan=async(prompt:string)=>{await text("Copilot prompt",prompt);await click("Plan");};
const screenshot=async()=>{(output.closest("aside") as HTMLElement).hidden=true;const r=await(await input({type:"screenshot"})).json();(output.closest("aside") as HTMLElement).hidden=false;return r.data;};
button.onclick=async()=>{button.disabled=true;const checks:string[]=[],check=(ok:unknown,label:string)=>{if(!ok)throw Error(label);checks.push("PASS "+label);output.textContent=checks.join("\n");};try{
 await waitFor(()=>!!document.querySelector("canvas"));const saved=sessionStorage.getItem("enclosure-reopen");
 if(saved){const old=JSON.parse(saved);checks.push(...old.checks);check(state()===old.state,"Actual reload preserves the six-stage source and face-reference graph");const m=await measureDocumentObject(cadDocument,old.final);check(m.validity==="valid"&&Math.abs(m.volume!-volumes[5])<.02,"Reopened enclosure rebuilds to the independent analytical volume");await click("3D");await click("Copilot");await click("Model tree");await physical(document.querySelector(`[data-model-object-id="${old.final}"] .tree-label`)!);await click("Copilot");await click("Fit all geometry");const hover=document.querySelector<HTMLInputElement>('[aria-label="Enable hover distance"]');if(hover?.checked)await physical(hover);
 (globalThis as any).cadTestArtifacts={"model.webcad.json":serializeDocument(cadDocument),"model.step":old.step,"sketch-2d.png":old.sketch,"enclosure-3d.png":await screenshot()};(globalThis as any).cadTestMetrics={prompts,expectedVolumesMm3:volumes,final:old.final,wallThicknessMm:2,outerCornerRadiusMm:4,floorHoleDiameterMm:8,frontPortDiameterMm:10,frontPortDepthMm:2,planner:"Local rules; real queries and BRep"};sessionStorage.removeItem("enclosure-reopen");output.textContent=checks.join("\n")+`\nALL ${checks.length} CHECKS PASSED`;return;}
 await click("New document");await click("2D");await click("Copilot");check(cadDocument.rootObjects.length===0,"Complex enclosure starts from an empty 2D document");let sketch="",final="",beforeLast="";
 for(const [i,prompt]of prompts.entries()){
  const before=state(),past=cadHistory.getPastLabels().length;await plan(prompt);await waitFor(()=>!!apply()&&!apply()!.disabled);
  check(state()===before,`Stage ${i+1} reviews without changing its committed source`);
  if(i===4)check(panel().textContent?.includes("lowest upward"),"Floor review explains the selected inner face, not the empty upper opening");
  if(i===5){check(panel().textContent?.includes("world −Y"),"Front-port review states the world direction and inward depth");beforeLast=before;}
  await click("Apply");await waitFor(()=>cadHistory.getPastLabels().length===past+1);
  const feature=Object.values(cadDocument.features).find(f=>cadDocument.objects[f.output]?.visible&&["extrude","fillet","shell","boolean"].includes(f.type));if(i){final=feature!.output;const m=await measureDocumentObject(cadDocument,final);check(m.validity==="valid"&&Math.abs(m.volume!-volumes[i])<.02,`Stage ${i+1} matches independent exact-solid volume`);}else{
   check(Object.values(cadDocument.sketches!)[0].constraints.length===3,"Original 2D rectangle remains a constrained editable sketch");await click("Fit all geometry");const h=document.querySelector<HTMLInputElement>('[aria-label="Enable hover distance"]');if(h?.checked)await physical(h);sketch=await screenshot();await click("3D");}
 }
 check(cadHistory.getPastLabels().length===6&&Object.values(cadDocument.features).filter(f=>f.params.faceHole).length===2,"Six user requests retain one sketch, source features and two face-bound holes");
 const complete=state();await click("Undo");check(state()===beforeLast,"Undo removes only the front-wall port");await click("Redo");check(state()===complete,"Redo restores the complete enclosure and all references");
 const invalidBefore=state(),depth=cadHistory.getPastLabels().length;await plan("안쪽 바닥 중심에 지름 500mm 관통 구멍");await waitFor(()=>!!panel().querySelector('[role="alert"]'));check(state()===invalidBefore&&cadHistory.getPastLabels().length===depth&&(!apply()||apply()!.disabled),"A hole crossing the floor boundary is rejected without losing the finished enclosure");
 const step=new TextDecoder().decode(await exportStepBytes());check(step.includes("ISO-10303-21"),"Finished enclosure exports as a STEP BRep");saveDocumentToCache();sessionStorage.setItem("enclosure-reopen",JSON.stringify({checks,state:state(),final,step,sketch}));location.reload();
}catch(e){output.textContent=checks.join("\n")+"\nFAIL: "+String(e);}};installBrowserChecks(button,output);
