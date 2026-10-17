import { createRoot } from "react-dom/client";
import { App } from "../src/App";
import "../src/styles.css";import "../src/ui/tokens.css";import "../src/ui/workstation.css";import "../src/ui/commands.css";import "../src/ui/menu.css";import "../src/ui/explorer.css";import "../src/ui/inspector.css";
import { serializeDocument } from "@agent-webcad/cad-document";
import { buildPrimitiveMesh } from "../src/cad/kernelGeometryService";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory } from "../src/state/history";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { saveDocumentToCache } from "../src/state/documentFile";
import { resetTestDocument } from "./helpers/documentHarness";
import { installBrowserChecks } from "./helpers/browserChecks";
import { click, find, pause, physical, text, waitFor } from "./helpers/physicalInput";

resetTestDocument();
let result=await dispatchCadCommand({type:"create-primitive",id:"body",primitive:"box",params:{width:30,depth:20,height:10}});if(!result.ok)throw Error(result.reason);
const mesh=await buildPrimitiveMesh(cadDocument.features["feature-body"].params),top=mesh.faces!.find(face=>face.key.split("|")[0].endsWith(",10.000000"))!;
result=await dispatchCadCommand({type:"attach-work-plane-face",id:"top",name:"Top",source:{kind:"brep-face",objectId:"body",topologyId:top.key}});if(!result.ok)throw Error(result.reason);
saveDocumentToCache();createRoot(document.getElementById("root")!).render(<App/>);
const button=document.getElementById("run-b5-face") as HTMLButtonElement,output=document.getElementById("b5-face-result")!;
const sketch=()=>Object.values(cadDocument.sketches??{})[0];
async function keys(...values:string[]){for(const key of values){document.body.dispatchEvent(new KeyboardEvent("keydown",{key,bubbles:true,cancelable:true}));await pause();}}
button.onclick=async()=>{button.disabled=true;const lines:string[]=[],check=(condition:unknown,label:string)=>{if(!condition)throw Error(label);lines.push(`PASS: ${label}`);output.textContent=lines.join("\n");};try{
  await waitFor(()=>Boolean(document.querySelector("#root canvas")));const section=Array.from(document.querySelectorAll<HTMLElement>(".property-section")).find(element=>element.querySelector(".property-section-title")?.textContent==="Work planes")!;
  if(section.querySelector(".property-section-trigger")?.getAttribute("aria-expanded")!=="true")await physical(section.querySelector(".property-section-trigger")!);
  const previous=cadHistory.getPastLabels().length;await click("Sketch on work plane Top");await waitFor(()=>Boolean(sketch()&&document.querySelector('[data-testid="sketch-inspector"]')));
  check(sketch().facePlaneId==="top"&&sketch().faceStatus==="resolved"&&cadHistory.getPastLabels().length===previous+1,"Inspector creates an editable sketch on the saved planar face");
  await physical(document.getElementById("tools-tab-draw")!);await click("Rectangle");await keys("0",",","0","Enter","6",",","4","Enter","Escape");await waitFor(()=>sketch().geometry.length===1);
  check(sketch().geometry[0].kind==="rectangle"&&Boolean(cadDocument.features[`feature-${sketch().geometry[0].id}`].params.faceFrame),"Numeric drawing uses face-local coordinates and creates a world projection");
  const entity=sketch().geometry[0];await physical(document.querySelector(`[data-model-object-id="${entity.id}"] .tree-label`)!);await click("Width");await waitFor(()=>Boolean(find("Apply constraint")&&!find("Apply constraint")!.disabled));await click("Apply constraint");
  check(sketch().dimensions.length===1,"Face sketch stores a driving width dimension through the existing solver");
  await text("Face sketch extrude distance","4 mm");await click("Extrude face sketch");await waitFor(()=>Object.values(cadDocument.features).some(feature=>feature.type==="extrude"&&feature.params.faceSketchId===sketch().id));
  const extrusion=Object.values(cadDocument.features).find(feature=>feature.type==="extrude"&&feature.params.faceSketchId===sketch().id)!;
  check(Boolean(extrusion)&&JSON.parse(serializeDocument(cadDocument)).version===19,"Face sketch extrusion is a live solid saved with the v19 contract");
  const projection=()=>cadDocument.features[`feature-${entity.id}`],before=(projection().params.points as number[][])[0];
  result=await dispatchCadCommand({type:"move-object",objectId:"body",translation:[10,0,0]});if(!result.ok)throw Error(result.reason);await waitFor(()=>Math.abs((projection().params.points as number[][])[0][0]-before[0])>1);
  check(Math.abs((projection().params.points as number[][])[0][0]-before[0]-10)<1e-5&&cadDocument.sketches![sketch().id].faceStatus==="resolved","Moving the source BRep face refreshes projection and extrusion in one document edit");
  output.textContent=lines.join("\n")+`\nALL ${lines.length} CHECKS PASSED`;
}catch(cause){output.textContent=lines.join("\n")+`\nFAIL: ${cause instanceof Error?cause.stack:cause}`;}};installBrowserChecks(button,output);
