import {createRoot} from "react-dom/client";
import {App} from "../src/App";
import "../src/styles.css";import "../src/ui/tokens.css";import "../src/ui/workstation.css";import "../src/ui/commands.css";import "../src/ui/menu.css";import "../src/ui/explorer.css";import "../src/ui/inspector.css";
import {buildPrimitiveMesh} from "../src/cad/kernelGeometryService";
import {cadDocument} from "../src/state/cadDocument";
import {cadHistory} from "../src/state/history";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {saveDocumentToCache} from "../src/state/documentFile";
import {resetTestDocument} from "./helpers/documentHarness";
import {installBrowserChecks} from "./helpers/browserChecks";
import {click,find,pause,physical,text,waitFor} from "./helpers/physicalInput";

resetTestDocument();
let result=await dispatchCadCommand({type:"create-primitive",id:"body",primitive:"box",params:{width:30,depth:20,height:10}});if(!result.ok)throw Error(result.reason);
const mesh=await buildPrimitiveMesh(cadDocument.features["feature-body"].params),top=mesh.faces!.find(face=>face.key.split("|")[0].endsWith(",10.000000"))!;
result=await dispatchCadCommand({type:"attach-work-plane-face",id:"top",name:"Top",source:{kind:"brep-face",objectId:"body",topologyId:top.key}});if(!result.ok)throw Error(result.reason);
saveDocumentToCache();createRoot(document.getElementById("root")!).render(<App/>);
const button=document.getElementById("run-b5-cut") as HTMLButtonElement,output=document.getElementById("b5-cut-result")!;
const sketch=()=>Object.values(cadDocument.sketches??{})[0];
async function keys(...values:string[]){for(const key of values){document.body.dispatchEvent(new KeyboardEvent("keydown",{key,bubbles:true,cancelable:true}));await pause();}}
button.onclick=async()=>{button.disabled=true;const lines:string[]=[],check=(condition:unknown,label:string)=>{if(!condition)throw Error(label);lines.push(`PASS: ${label}`);output.textContent=lines.join("\n");};try{
  await waitFor(()=>Boolean(document.querySelector("#root canvas")));const section=Array.from(document.querySelectorAll<HTMLElement>(".property-section")).find(element=>element.querySelector(".property-section-title")?.textContent==="Work planes")!;
  if(section.querySelector(".property-section-trigger")?.getAttribute("aria-expanded")!=="true")await physical(section.querySelector(".property-section-trigger")!);
  await click("Sketch on work plane Top");await waitFor(()=>Boolean(sketch()&&document.querySelector('[data-testid="sketch-inspector"]')));
  await physical(document.getElementById("tools-tab-draw")!);await click("Rectangle");await keys("0",",","0","Enter","6",",","4","Enter","Escape");await waitFor(()=>sketch().geometry.length===1);
  check(sketch().faceStatus==="resolved"&&sketch().geometry[0].kind==="rectangle","Face sketch and closed profile are ready for cutting");
  await text("Face cut depth","3 mm");const past=cadHistory.getPastLabels().length;await click("Review face cut");await waitFor(()=>Boolean(Array.from(document.querySelectorAll("button")).find(button=>button.textContent==="Apply face cut"&&!button.disabled)));
  check(cadHistory.getPastLabels().length===past&&Boolean(document.querySelector('[data-testid="face-cut-volume"]')),"Review measures the result without changing the document");
  await click("Apply face cut");await waitFor(()=>Object.values(cadDocument.features).some(feature=>feature.type==="boolean"&&Boolean(feature.params.faceCut)));
  const cut=Object.values(cadDocument.features).find(feature=>Boolean(feature.params.faceCut))!;
  check(cut.inputs[0]==="body"&&!cadDocument.objects.body.visible&&cadHistory.getPastLabels().length===past+1,"Apply creates one live Boolean cut and one Undo entry");
  output.textContent=lines.join("\n")+`\nALL ${lines.length} CHECKS PASSED`;
}catch(cause){output.textContent=lines.join("\n")+`\nFAIL: ${cause instanceof Error?cause.stack:cause}`;}};installBrowserChecks(button,output);
