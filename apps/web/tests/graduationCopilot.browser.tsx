import {createRoot} from "react-dom/client";
import {App} from "../src/App";
import "../src/styles.css";import "../src/ui/tokens.css";import "../src/ui/workstation.css";import "../src/ui/commands.css";import "../src/ui/menu.css";import "../src/ui/explorer.css";import "../src/ui/inspector.css";
import {cadDocument} from "../src/state/cadDocument";
import {cadHistory} from "../src/state/history";
import {saveDocumentToCache} from "../src/state/documentFile";
import {inspectFittedCurve} from "../src/copilot/fittedCurveTools";
import {serializeDocument} from "@agent-webcad/cad-document";
import {repairSchoolTask} from "./fixtures/repairSchoolTask";
import {click,text,physical,waitFor,input} from "./helpers/physicalInput";
import {installBrowserChecks} from "./helpers/browserChecks";
createRoot(document.getElementById("root")!).render(<App/>);
const button=document.getElementById("run-academic") as HTMLButtonElement,output=document.getElementById("academic-output")!,task=repairSchoolTask();
const panel=()=>document.querySelector('[data-testid="copilot-panel"]')!,state=()=>{const {revision:_,...d}=cadDocument;return JSON.stringify(d);};
const apply=()=>[...panel().querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent?.trim()==="Apply");
const ready=()=>waitFor(()=>!!apply()&&!apply()!.disabled||!!panel().querySelector('[role="alert"]'));
const artifacts:Record<string,string>={};let modelRequests=0;const originalFetch=window.fetch.bind(window);window.fetch=async(url,init)=>{if(new URL(String(url),location.href).pathname.startsWith("/api/copilot/"))modelRequests++;return originalFetch(url,init);};
button.onclick=async()=>{button.disabled=true;const checks:string[]=[],check=(ok:unknown,label:string)=>{if(!ok)throw Error(label);checks.push("PASS "+label);output.textContent=checks.join("\n");};try{
 await waitFor(()=>!!document.querySelector("canvas"));const stored=sessionStorage.getItem("academic-reload");
 if(stored){const old=JSON.parse(stored);checks.push(...old.checks);check(state()===old.state,"Actual reload restores all 365 CAD objects, annotations and revised curve");check(modelRequests===0,"Reload needs no model connection");(globalThis as any).cadTestArtifacts=old.artifacts;sessionStorage.removeItem("academic-reload");output.textContent=checks.join("\n")+`\nALL ${checks.length} CHECKS PASSED`;return;}
 await click("New document");await click("2D");await click("Copilot");const empty=state();await text("Copilot prompt",task.brief);await click("Plan");await waitFor(()=>!!panel().querySelector('[role="alert"]'));check(panel().textContent?.includes("건축 과제 범위 미지원")&&state()===empty,"Complex graduation brief visibly reports the unsupported scope without drawing one misleading rectangle");
 let count=0;for(const [i,stage]of task.stages.entries()){
 const before=state(),past=cadHistory.getPastLabels().length;await text("Copilot prompt",JSON.stringify({version:1,toolCalls:stage.calls}));await click("Plan");await ready();const error=panel().querySelector('[role="alert"]');if(error)throw Error(error.textContent??"No plan");check(state()===before&&panel().textContent?.includes("Designer-supplied structured"),`Batch ${i+1}: designer-origin geometry is disclosed and native review is detached`);
 await click("Apply");count+=stage.calls.length;await waitFor(()=>Object.keys(cadDocument.objects).length===count);check(cadHistory.getPastLabels().length===past+1,`Batch ${i+1}: actual UI Apply creates the exact objects as one Undo`);
 }
 check(count===365&&modelRequests===0,"All 365 reference objects are created through the Copilot UI without external/local model calls");
 await click("Model tree");await text("Filter model",task.curveId);await physical(document.querySelector(`[data-model-object-id="${task.curveId}"] .tree-label`)!);await click("Copilot");const source=inspectFittedCurve(cadDocument,task.curveId),before=state(),kept=JSON.stringify(Object.entries(cadDocument.features).filter(([,f])=>f.output!==task.curveId)),past=cadHistory.getPastLabels().length;
 await text("Copilot prompt",JSON.stringify({version:1,toolCalls:[{id:"one-point",name:"curve.adjust",arguments:{objectId:task.curveId,pointIndex:3,delta:[1000,0,0]}}]}));await click("Plan");await ready();check(state()===before,"Graduation reference follow-up is a detached native preview");await click("Apply");await waitFor(()=>inspectFittedCurve(cadDocument,task.curveId).points[3][0]===source.points[3][0]+1000);
 const changed=state();check(cadHistory.getPastLabels().length===past+1&&JSON.stringify(Object.entries(cadDocument.features).filter(([,f])=>f.output!==task.curveId))===kept,"Precise edit preserves retained building, both floor programs, independent section and all other sources");await click("Undo");check(state()===before,"One Undo restores every academic reference source exactly");await click("Redo");check(state()===changed,"Redo restores the same source identity and point adjustment");
 await click("Fit all geometry");document.getElementById("academic-controls")!.hidden=true;artifacts["native-overview.png"]=(await(await input({type:"screenshot"})).json()).data;document.getElementById("academic-controls")!.hidden=false;artifacts["browser-created.webcad.json"]=serializeDocument(cadDocument);saveDocumentToCache();sessionStorage.setItem("academic-reload",JSON.stringify({checks,state:state(),artifacts}));location.reload();
 }catch(e){(globalThis as any).cadTestArtifacts=artifacts;output.textContent=checks.join("\n")+"\nFAIL: "+(e instanceof Error?e.stack:String(e));}};
installBrowserChecks(button,output);
