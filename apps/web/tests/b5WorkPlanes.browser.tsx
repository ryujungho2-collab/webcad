import { createRoot } from "react-dom/client";
import * as THREE from "three";
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
import { click, find, input, pause, physical, text, waitFor } from "./helpers/physicalInput";

resetTestDocument();const created=await dispatchCadCommand({type:"create-primitive",id:"body",primitive:"box",params:{width:30,depth:20,height:10},position:[0,0,0]});if(!created.ok)throw Error(created.reason);saveDocumentToCache();
let camera:THREE.Camera;const update=THREE.Camera.prototype.updateMatrixWorld;THREE.Camera.prototype.updateMatrixWorld=function(force){camera=this;return update.call(this,force);};
createRoot(document.getElementById("root")!).render(<App/>);
const button=document.getElementById("run-b5") as HTMLButtonElement,output=document.getElementById("b5-result")!;
const planes=()=>Object.values(cadDocument.workPlanes??{});
const section=()=>Array.from(document.querySelectorAll<HTMLElement>(".property-section")).find(element=>element.querySelector(".property-section-title")?.textContent==="Work planes");
async function openSection(){const target=section();if(!target)throw Error("Work plane Inspector section missing");const trigger=target.querySelector<HTMLButtonElement>(".property-section-trigger")!;if(trigger.getAttribute("aria-expanded")!=="true")await physical(trigger);}
async function settle(){await waitFor(()=>Boolean(document.querySelector("#root canvas")&&camera));await pause();}
async function faceClick(point:[number,number,number]){camera.updateMatrixWorld();const ndc=new THREE.Vector3(...point).project(camera),rect=document.querySelector("#root canvas")!.getBoundingClientRect(),x=rect.left+(ndc.x+1)*rect.width/2,y=rect.top+(1-ndc.y)*rect.height/2;await input({type:"mousePressed",x,y,button:"left",buttons:1});await input({type:"mouseReleased",x,y,button:"left",buttons:0});await pause();}
button.onclick=async()=>{button.disabled=true;const lines:string[]=[],check=(condition:unknown,label:string)=>{if(!condition)throw Error(label);lines.push(`PASS: ${label}`);output.textContent=lines.join("\n");};try{
  await settle();await openSection();await text("Work plane name","Datum");await text("Work plane origin","10, 20, 30");await text("Work plane X axis","0, 1, 0");await text("Work plane Y axis","0, 0, 1");const before=cadHistory.getPastLabels().length;
  await click("Create work plane");await waitFor(()=>planes().length===1);check(planes()[0].normal[0]===1&&planes()[0].origin[2]===30,"Inspector creates a normalized user frame from origin and two basis directions");check(cadHistory.getPastLabels().length===before+1&&JSON.parse(serializeDocument(cadDocument)).version===18,"User plane is one Undo step and saves in v18");
  await click("Undo");await waitFor(()=>planes().length===0);check(planes().length===0,"Undo removes the new work plane");await click("Redo");await waitFor(()=>planes().length===1);
  await physical(document.getElementById("tools-tab-view")!);await click("Model views");await click("Top view");await click("Close model views");find("Fit all geometry").click();await pause();await click("Direct");await faceClick([15,10,10]);await waitFor(()=>Boolean(Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(entry=>entry.textContent?.trim()==="Create plane from selected face")));await openSection();const past=cadHistory.getPastLabels().length;
  await text("Work plane name","Face datum");await click("Create plane from selected face");await waitFor(()=>planes().length===2);const attached=planes().find(plane=>plane.source)!;check(Boolean(attached.source?.topologyId.startsWith("face:"))&&attached.normal[2]>0.99,"Actual viewport face selection creates a plane bound to its exact BRep face key");check(cadHistory.getPastLabels().length===past+1,"Face plane attachment is one reversible transaction");
  await click("Undo");await waitFor(()=>planes().length===1);await click("Redo");await waitFor(()=>planes().length===2);check(planes().some(plane=>plane.id===attached.id&&plane.source?.topologyId===attached.source!.topologyId),"Undo/Redo restores the same face identity");
  const resized=await dispatchCadCommand({type:"update-primitive",objectId:"body",params:{width:35,depth:20,height:10}});if(!resized.ok)throw Error(resized.reason);await waitFor(()=>section()?.textContent?.includes("missing")??false);check(planes().find(plane=>plane.id===attached.id)?.source?.topologyId===attached.source!.topologyId,"Changed source geometry reports missing while preserving the original face key");
  const revised=await buildPrimitiveMesh(cadDocument.features["feature-body"].params),newTop=revised.faces!.find(face=>face.key.split("|")[0].endsWith(",10.000000"))!;await new Promise(resolve=>setTimeout(resolve,800));await faceClick([17.5,10,10]);const direct=()=>Array.from(document.querySelectorAll(".property-section")).find(element=>element.querySelector(".property-section-title")?.textContent==="Direct selection");await pause();if(!direct()?.textContent?.includes(newTop.key))throw Error(`New top face was not selected: expected ${newTop.key}, actual ${direct()?.textContent}`);await click(`Rebind work plane ${attached.name}`);await waitFor(()=>planes().find(plane=>plane.id===attached.id)?.source?.topologyId===newTop.key);check(planes().find(plane=>plane.id===attached.id)?.source?.topologyId!==attached.source!.topologyId,"Explicit selected-face rebind repairs the attachment without nearest-face substitution");
  output.textContent=lines.join("\n")+`\nALL ${lines.length} CHECKS PASSED`;
}catch(cause){output.textContent=lines.join("\n")+`\nFAIL: ${cause instanceof Error?cause.stack:cause}`;}};installBrowserChecks(button,output);
