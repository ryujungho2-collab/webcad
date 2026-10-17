import {createRoot} from "react-dom/client";
import {App} from "../src/App";
import "../src/styles.css";import "../src/ui/tokens.css";import "../src/ui/workstation.css";import "../src/ui/commands.css";import "../src/ui/menu.css";import "../src/ui/explorer.css";import "../src/ui/inspector.css";
import {cadDocument} from "../src/state/cadDocument";
import {cadHistory} from "../src/state/history";
import {saveDocumentToCache} from "../src/state/documentFile";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {resetTestDocument,documentState} from "./helpers/documentHarness";
import {installBrowserChecks} from "./helpers/browserChecks";
import {click,physical,text,choose,waitFor,find,input,pause} from "./helpers/physicalInput";

resetTestDocument();for(const [id,x] of [["snap-start",0],["snap-end",6]] as const)await dispatchCadCommand({type:"create-drawing",id,name:id,drawing:"point",params:{points:[[x,0,0]],workPlane:"XY"}});saveDocumentToCache();createRoot(document.getElementById("root")!).render(<App/>);
const button=document.getElementById("run-endpoint-arc") as HTMLButtonElement,output=document.getElementById("endpoint-arc-result")!;
const editor=()=>document.querySelector('[aria-label="Endpoint radius arc editor"]');
const latest=()=>Object.values(cadDocument.features).filter(f=>f.params.kind==="arc").at(-1)!;
async function start(){await physical(document.getElementById("tools-tab-draw")!);await click("Endpoint Radius Arc");await waitFor(()=>Boolean(editor()));}
async function review(){await click("Review arc");await waitFor(()=>!find("Apply arc").disabled);}
async function apply(){await click("Apply arc");await waitFor(()=>!editor());}
const summary=()=>document.querySelector('[data-testid="endpoint-radius-arc-summary"]')?.textContent??"";
button.onclick=async()=>{button.disabled=true;const lines:string[]=[],check=(ok:unknown,label:string)=>{if(!ok)throw Error(label);lines.push(`PASS: ${label}`);output.textContent=lines.join("\n");};try{
 await waitFor(()=>Boolean(document.querySelector('#root canvas')));await start();const before=documentState(),past=cadHistory.getPastLabels().length;
 await text("Arc start coordinate","1 cm,-2 cm");await text("Arc end coordinate","@6mm,0");await text("Arc radius","0.5 cm");await review();
 check(JSON.stringify(documentState())===JSON.stringify(before)&&cadHistory.getPastLabels().length===past,"Review stays transient with unit and relative endpoint inputs");
 check(summary().includes("13, -16")&&summary().includes("Minor arc")&&document.querySelector('[aria-label="Endpoint radius arc preview"] polyline')?.getAttribute("points")?.trim().split(" ").length===97,"Exact centre and minor sweep appear with viewport preview");
 await choose("Arc direction",1);check(find("Apply arc").disabled&&summary().includes("Major arc"),"Direction selects major CW arc and invalidates prior review");await review();await apply();
 const c=latest().params.center as number[];check(c[0]===13&&c[1]===-16&&Number(latest().params.radius)===5&&Number(latest().params.endAngle)-Number(latest().params.startAngle)<-Math.PI&&cadHistory.getPastLabels().length===past+1,"Apply stores one exact ordinary arc and one Undo");
 const after=documentState();await click("Undo");await waitFor(()=>Object.values(cadDocument.features).every(f=>f.params.kind!=="arc"));await click("Redo");await waitFor(()=>Object.values(cadDocument.features).some(f=>f.params.kind==="arc"));check(JSON.stringify(documentState())===JSON.stringify(after),"Undo/Redo restores full authored arc");
 await start();await text("Arc start coordinate","0,0");await text("Arc end coordinate","6,0");await text("Arc radius","5");await choose("Arc centre side",1);check(summary().includes("3, -4")&&summary().includes("Major arc"),"Opposite centre side independently selects the other centre");
 await text("Arc radius","2");check(find("Review arc").disabled&&find("Apply arc").disabled&&editor()?.textContent?.includes("twice the radius")&&(document.querySelector('[aria-label="Arc end coordinate"]') as HTMLInputElement).value==="6,0","No-solution input retains endpoints and blocks Apply");
 await text("Arc end coordinate","0,0");check(find("Review arc").disabled&&editor()?.textContent?.includes("distinct"),"Coincident endpoints reject");await text("Arc end coordinate","@10mm<0deg");await text("Arc radius","5 mm");check(summary().includes("Diameter: one centre")&&summary().includes("180.000000"),"Diameter reports one centre and exact semicircle");await review();await click("Cancel arc");await waitFor(()=>!editor());check(JSON.stringify(documentState())===JSON.stringify(after),"Cancel reviewed arc leaves document unchanged");
 await start();await review();await dispatchCadCommand({type:"rename-object",objectId:"snap-start",name:"Start"});await waitFor(()=>find("Apply arc").disabled);check(find("Apply arc").disabled,"External document changes invalidate ready Review");await click("Cancel arc");
 await start();await text("Arc start coordinate","0,0");await text("Arc end coordinate","6,0");await text("Arc radius","5");await click("Fit arc preview");await pause();await click("Pick arc start");
 const screen=()=>document.querySelector('[aria-label="Endpoint radius arc preview"] polyline')!.getAttribute("points")!.split(" ").map(p=>p.split(",").map(Number));
 await waitFor(()=>screen()[0][0]>0);await new Promise(r=>setTimeout(r,200));
 for(const i of [0,96]){const [u,v]=screen()[i],box=document.querySelector("#root canvas")!.getBoundingClientRect(),x=u+box.left,y=v+box.top;await input({type:"mouseMoved",x:x+2,y:y+2});await input({type:"mousePressed",x:x+2,y:y+2,button:"left",buttons:1});await input({type:"mouseReleased",x:x+2,y:y+2,button:"left",buttons:0});await pause();}
 check((document.querySelector('[aria-label="Arc start coordinate"]') as HTMLInputElement).value==="0,0"&&(document.querySelector('[aria-label="Arc end coordinate"]') as HTMLInputElement).value==="6,0","Physical pointer acquisition snaps both endpoints to saved points");await review();await apply();check(Number(latest().params.radius)===5,"Snapped endpoints apply through the same public command");
 await physical(document.getElementById("tools-tab-draw")!);await click("Sketch");await waitFor(()=>Boolean(document.querySelector('[data-testid="sketch-inspector"]')));await start();await text("Arc start coordinate","5,0");await text("Arc end coordinate","-5,0");await text("Arc radius","5");await choose("Arc direction",1);await review();await apply();
 const sketch=Object.values(cadDocument.sketches??{})[0],g=sketch.geometry[0];check(g.kind==="arc"&&Math.abs(g.endAngle-g.startAngle+Math.PI)<1e-8&&sketch.constraints.length===0,"Sketch Apply preserves clockwise semicircle and editable identities without permanent endpoint constraints");
 await start();await input({type:"key",key:"Escape"});await pause();check(!editor(),"Escape closes the arc editor");
 output.textContent=lines.join("\n")+`\nALL ${lines.length} CHECKS PASSED`;
}catch(cause){output.textContent=lines.join("\n")+`\nFAIL: ${cause instanceof Error?cause.stack:cause}`;}};installBrowserChecks(button,output);
