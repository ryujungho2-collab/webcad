import {createRoot} from "react-dom/client";
import {App} from "../src/App";
import "../src/styles.css";import "../src/ui/tokens.css";import "../src/ui/workstation.css";import "../src/ui/commands.css";import "../src/ui/menu.css";import "../src/ui/explorer.css";import "../src/ui/inspector.css";
import {cadDocument} from "../src/state/cadDocument";
import {cadHistory} from "../src/state/history";
import {measureDrawing} from "../src/precision/measurements";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {resetTestDocument,documentState} from "./helpers/documentHarness";
import {installBrowserChecks} from "./helpers/browserChecks";
import {click,physical,text,choose,waitFor,find,input,pause} from "./helpers/physicalInput";

resetTestDocument();createRoot(document.getElementById("root")!).render(<App/>);
const button=document.getElementById("run-polygon") as HTMLButtonElement,output=document.getElementById("polygon-result")!;
const editor=()=>document.querySelector('[aria-label="Regular polygon editor"]');
async function start(){await physical(document.getElementById("tools-tab-draw")!);await click("Regular Polygon");await waitFor(()=>Boolean(editor()));}
async function review(){await click("Review polygon");await waitFor(()=>!find("Apply polygon").disabled);}
button.onclick=async()=>{button.disabled=true;const lines:string[]=[],check=(value:unknown,label:string)=>{if(!value)throw Error(label);lines.push(`PASS: ${label}`);output.textContent=lines.join("\n");};try{
  await waitFor(()=>Boolean(document.querySelector("#root canvas")));await start();const before=documentState(),past=cadHistory.getPastLabels().length;
  await text("Polygon centre u","1 cm");await text("Polygon centre v","-2 cm");await text("Polygon sides","4");await text("Polygon radius","1 cm");await choose("Polygon radius type",1);await text("Polygon rotation","90 deg");await review();
  check(JSON.stringify(documentState())===JSON.stringify(before)&&cadHistory.getPastLabels().length===past,"Review is transient with no history mutation");
  check(document.querySelector('[data-testid="polygon-measurements"]')?.textContent?.includes("400.000")&&document.querySelector('[aria-label="Regular polygon preview"] polygon')?.getAttribute("points")?.trim().split(" ").length===4,"Preview shows four edges and independent square area");
  await text("Polygon rotation","0 deg");check(find("Apply polygon").disabled,"Changed draft invalidates the reviewed plan");await review();await click("Apply polygon");await waitFor(()=>!editor()&&cadDocument.rootObjects.length===1);
  const f=cadDocument.features[`feature-${cadDocument.rootObjects[0]}`],p=f.params.points as number[][];check(f.params.kind==="polyline"&&f.params.closed&&Math.abs(p[0][0]-20)<1e-7&&Math.abs(p[0][1]+30)<1e-7&&cadHistory.getPastLabels().length===past+1,"Circumscribed radius, unit centre and rotation create one ordinary polyline and one Undo");
  const after=documentState();await click("Undo");await waitFor(()=>cadDocument.rootObjects.length===0);await click("Redo");await waitFor(()=>cadDocument.rootObjects.length===1);check(JSON.stringify(documentState())===JSON.stringify(after),"Undo/Redo restores all polygon vertices");
  await start();await text("Polygon sides","2");check(find("Review polygon").disabled&&find("Apply polygon").disabled,"Invalid side count cannot review or apply");await text("Polygon sides","129");check(find("Review polygon").disabled,"Side count above the limit rejects");await text("Polygon sides","3");await text("Polygon radius","-1");check(find("Review polygon").disabled,"Negative radius preserves editable draft");await text("Polygon radius","20 mm");await review();await click("Cancel polygon");await waitFor(()=>!editor());check(JSON.stringify(documentState())===JSON.stringify(after),"Cancel reviewed draft leaves document unchanged");
  await start();await review();await dispatchCadCommand({type:"create-drawing",id:"external",drawing:"line",params:{points:[[0,0,0],[10,0,0]],workPlane:"XY"}});await waitFor(()=>find("Apply polygon").disabled);check(find("Apply polygon").disabled,"Document changes invalidate a ready polygon review");await click("Cancel polygon");
  await physical(document.getElementById("tools-tab-draw")!);await click("Sketch");await waitFor(()=>Boolean(document.querySelector('[data-testid="sketch-inspector"]')));await start();await text("Polygon sides","5");await text("Polygon radius","2 cm");await text("Polygon rotation","0.5 rad");await review();await click("Apply polygon");await waitFor(()=>!editor()&&Object.values(cadDocument.sketches??{})[0]?.geometry.length===1);
  const sketch=Object.values(cadDocument.sketches??{})[0],g=sketch.geometry[0];check(g.kind==="polyline"&&g.closed&&g.vertices.length===5&&g.segmentIds.length===5&&sketch.constraints.length===0&&Math.abs(g.vertices[0].point[0]-20*Math.cos(.5))<1e-7,"Sketch polygon retains editable topology and radian rotation without regularity constraints");
  check(Math.abs(measureDrawing(cadDocument.features[`feature-${g.id}`].params).area!-5*400*Math.sin(2*Math.PI/5)/2)<1e-6,"Sketch source uses the same closed polyline measurements");
  await start();await input({type:"key",key:"Escape"});await pause();check(!editor(),"Escape closes the polygon editor");
  output.textContent=lines.join("\n")+`\nALL ${lines.length} CHECKS PASSED`;
}catch(cause){output.textContent=lines.join("\n")+`\nFAIL: ${cause instanceof Error?cause.stack:cause}`;}};installBrowserChecks(button,output);
