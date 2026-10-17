import {createRoot} from "react-dom/client";
import {App} from "../src/App";
import "../src/styles.css";import "../src/ui/tokens.css";import "../src/ui/workstation.css";import "../src/ui/commands.css";import "../src/ui/menu.css";import "../src/ui/explorer.css";import "../src/ui/inspector.css";
import {cadDocument} from "../src/state/cadDocument";
import {cadHistory} from "../src/state/history";
import {resetTestDocument,documentState} from "./helpers/documentHarness";
import {installBrowserChecks} from "./helpers/browserChecks";
import {click,physical,input,pause,waitFor} from "./helpers/physicalInput";

resetTestDocument();createRoot(document.getElementById("root")!).render(<App/>);
const button=document.getElementById("run-x1-three") as HTMLButtonElement,output=document.getElementById("x1-three-result")!;
const canvas=()=>document.querySelector<HTMLCanvasElement>("#root canvas")!;
const curve=()=>Object.values(cadDocument.features).filter(f=>f.type==="drawing").at(-1)!;
async function keys(value:string){for(const key of value)await input({type:"key",key});await pause();}
async function enter(value:string){await keys(value);await input({type:"key",key:"Enter"});await pause();}
async function escape(){await input({type:"key",key:"Escape"});await pause();}
async function start(name:string){await physical(document.getElementById("tools-tab-draw")!);await click(name);canvas().focus();await pause();}
button.onclick=async()=>{button.disabled=true;const lines:string[]=[],check=(value:unknown,label:string)=>{if(!value)throw Error(label);lines.push(`PASS: ${label}`);output.textContent=lines.join("\n");};try{
  await waitFor(()=>Boolean(canvas()));await start("3-Point Circle");const before=documentState(),past=cadHistory.getPastLabels().length;
  await enter("1cm,0");await enter("0,1cm");check(JSON.stringify(documentState())===JSON.stringify(before)&&cadHistory.getPastLabels().length===past,"First two points remain transient");
  await enter("-1cm,0");await waitFor(()=>cadDocument.rootObjects.length===1);await escape();
  check(curve().params.kind==="circle"&&Math.abs(Number(curve().params.radius)-10)<1e-8&&cadHistory.getPastLabels().length===past+1,"Three numeric points with units create one exact circle and one Undo entry");
  const after=documentState();await click("Undo");await waitFor(()=>cadDocument.rootObjects.length===0);await click("Redo");await waitFor(()=>cadDocument.rootObjects.length===1);check(JSON.stringify(documentState())===JSON.stringify(after),"Undo/Redo restores the authored circle");
  await start("3-Point Arc");await enter("10,0");await enter("-10,0");await enter("0,10");await waitFor(()=>cadDocument.rootObjects.length===2);await escape();
  check(Math.abs(Number(curve().params.endAngle)-Number(curve().params.startAngle)+1.5*Math.PI)<1e-8,"Start-through-end creates the major clockwise arc");
  await start("3-Point Circle");await enter("0,0");await enter("10,0");const invalid=documentState(),invalidPast=cadHistory.getPastLabels().length;await enter("20,0");
  check(JSON.stringify(documentState())===JSON.stringify(invalid)&&cadHistory.getPastLabels().length===invalidPast&&document.body.innerText.includes("collinear"),"Collinear third point rejects without discarding the first two points");
  for(let i=0;i<4;i++)await input({type:"key",key:"Backspace"});await enter("0,10");await waitFor(()=>cadDocument.rootObjects.length===3);await escape();
  check(Math.abs(Number(curve().params.radius)-Math.sqrt(50))<1e-8,"Corrected third point completes the same retained drawing draft");
  await start("3-Point Circle");await enter("30,0");await enter("20,10");await keys("10,0");
  const box=canvas().getBoundingClientRect(),x=box.left+box.width*.6,y=box.top+box.height*.5;
  await input({type:"mouseMoved",x,y});await input({type:"mousePressed",x,y,button:"left",buttons:1});await input({type:"mouseReleased",x,y,button:"left",buttons:0});await waitFor(()=>cadDocument.rootObjects.length===4);await escape();
  check(Math.abs(Number(curve().params.radius)-10)<1e-8&&Math.abs((curve().params.center as number[])[0]-20)<1e-8,"Pointer confirmation after hover uses the exact typed third point");
  await start("3-Point Arc");await enter("0,0");await escape();await escape();check(cadDocument.rootObjects.length===4,"Escape cancels acquired points without creating an object");
  await physical(document.getElementById("tools-tab-draw")!);await click("Sketch");await waitFor(()=>Boolean(document.querySelector('[data-testid="sketch-inspector"]')));await start("3-Point Circle");
  await enter("2,0");await enter("0,2");await enter("-2,0");await waitFor(()=>Object.values(cadDocument.sketches??{})[0]?.geometry.length===1);await escape();
  const sketch=Object.values(cadDocument.sketches??{})[0],geometry=sketch.geometry[0];check(geometry.kind==="circle"&&Math.abs(geometry.radius-2)<1e-8&&sketch.constraints.length===0,"Sketch three-point circle retains editable circle geometry without false centre constraints");
  await start("3-Point Arc");await enter("3,0");await enter("0,-3");await enter("-3,0");await waitFor(()=>Object.values(cadDocument.sketches??{})[0]?.geometry.length===2);await escape();
  const arc=Object.values(cadDocument.sketches??{})[0].geometry[1];check(arc.kind==="arc"&&Math.abs(arc.endAngle-arc.startAngle+Math.PI)<1e-8,"Sketch three-point arc preserves clockwise semicircle direction");
  output.textContent=lines.join("\n")+`\nALL ${lines.length} CHECKS PASSED`;
}catch(cause){output.textContent=lines.join("\n")+`\nFAIL: ${cause instanceof Error?cause.stack:cause}`;}};installBrowserChecks(button,output);
