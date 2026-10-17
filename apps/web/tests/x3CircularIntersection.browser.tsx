import {createRoot} from "react-dom/client";
import {App} from "../src/App";
import "../src/styles.css";import "../src/ui/tokens.css";import "../src/ui/workstation.css";import "../src/ui/commands.css";import "../src/ui/menu.css";import "../src/ui/explorer.css";import "../src/ui/inspector.css";
import type {CadCommand} from "@agent-webcad/cad-commands";
import {cadDocument} from "../src/state/cadDocument";
import {cadHistory} from "../src/state/history";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {saveDocumentToCache} from "../src/state/documentFile";
import {resetTestDocument,documentState} from "./helpers/documentHarness";
import {createConstructionChain} from "./helpers/constructionChain";
import {installBrowserChecks} from "./helpers/browserChecks";
import {click,physical,choose,text,waitFor,find} from "./helpers/physicalInput";

async function apply(command:CadCommand){const r=await dispatchCadCommand(command);if(!r.ok)throw Error(r.reason);}
resetTestDocument();
for(const [id,x] of [["a",0],["b",6],["same",0]] as const)await apply({type:"create-drawing",id,name:id,drawing:"circle",params:{center:[x,0,0],radius:5,workPlane:"XY"}});
await apply({type:"create-drawing",id:"arc",name:"arc",drawing:"arc",params:{center:[0,0,0],radius:5,startAngle:0,endAngle:Math.PI,workPlane:"XY"}});
saveDocumentToCache();createRoot(document.getElementById("root")!).render(<App/>);
const button=document.getElementById("run-circular") as HTMLButtonElement,output=document.getElementById("circular-result")!;
const f=(id:string)=>Object.values(cadDocument.features).find(f=>f.output===id)!,p=(id:string)=>(f(id).params.points as number[][])[0];
const tool=()=>document.querySelector('[aria-label="Construction editor"]');
async function select(label:string,value:string){const field=document.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!;await choose(label,[...field.options].findIndex(o=>o.value===value));await waitFor(()=>field.value===value);}
async function draft(name:string,first="a",second="b",branch="positive") {await click("Construction");await waitFor(()=>Boolean(tool()));await select("Construction operation","intersection");await text("Construction name",name);await select("First construction source",first);await select("Second construction source",second);await select("Intersection branch",branch);}
async function ready(){await waitFor(()=>tool()?.getAttribute("data-construction-status")==="ready");}
async function finish(name:string){await click("Apply construction");await waitFor(()=>!tool());return Object.values(cadDocument.objects).find(o=>o.name===name)!.id;}
button.onclick=async()=>{button.disabled=true;const lines:string[]=[],check=(ok:unknown,label:string)=>{if(!ok)throw Error(label);lines.push(`PASS: ${label}`);output.textContent=lines.join("\n");};try{
 await waitFor(()=>Boolean(document.querySelector('#root canvas')));await click("2D");
 const before=documentState(),past=cadHistory.getPastLabels().length;await draft("Left hit");await ready();
 check(JSON.stringify(documentState())===JSON.stringify(before)&&cadHistory.getPastLabels().length===past,"Detached circular review leaves document/history unchanged");
 check(tool()?.textContent?.includes("Left of first")&&tool()?.textContent?.includes("two-points")&&document.querySelector('[data-construction-result-point]'),"Centre-axis branch labels, classification and viewport point preview appear");
 const left=await finish("Left hit");check(Math.abs(p(left)[1]-4)<1e-6&&(f(left).construction as any).branchBasis==="center-line"&&cadHistory.getPastLabels().length===past+1,"Apply persists exact positive branch in one Undo");
 await click("Undo");await waitFor(()=>!cadDocument.objects[left]);await click("Redo");await waitFor(()=>Boolean(cadDocument.objects[left]));check(Math.abs(p(left)[1]-4)<1e-6,"Circular result survives Undo/Redo");
 await draft("Right hit","a","b","negative");await ready();const right=await finish("Right hit");check(Math.abs(p(right)[1]+4)<1e-6,"Negative branch creates the other exact intersection");
 await apply({type:"move-object",objectId:"b",translation:[4,0,0]});check(f(left).params.intersectionStatus==="tangent"&&p(left)[0]===5&&p(right)[0]===5&&p(left)[1]===0&&p(right)[1]===0,"Live tangency merges positions while retaining both IDs");
 await apply({type:"move-object",objectId:"b",translation:[0,0,0]});check(p(left)[1]>0&&p(right)[1]<0,"Leaving tangency restores the saved signed branches");
 await draft("Arc hit","arc","b");await ready();check(tool()?.textContent?.includes("one-domain-point"),"Arc domain review reports one valid branch");const arc=await finish("Arc hit");check(Math.abs(p(arc)[1]-4)<1e-6,"Circle-arc Apply uses the finite domain");
 const state=documentState();await draft("Invalid arc","arc","b","negative");await waitFor(()=>Boolean(tool()?.textContent?.includes("does not exist")));check(find("Apply construction").disabled&&JSON.stringify(documentState())===JSON.stringify(state),"Absent arc branch rejects without switching to the remaining root");await click("Cancel construction");
 await draft("Coincident","a","same");await waitFor(()=>Boolean(tool()?.textContent?.includes("coincident")));check(find("Apply construction").disabled,"Coincident supports reject ambiguous intersection");await click("Cancel construction");
 await physical(document.querySelector(`[data-model-object-id="${right}"] .tree-label`)!);await waitFor(()=>Boolean(document.querySelector('[data-testid="construction-saved-definition"]')));await select("Construction intersection branch","positive");await click("Review construction reassignment");await waitFor(()=>Boolean(document.querySelector('[aria-label="Reassign construction review"][data-command-stage="ready"]')));check(document.querySelector('[data-testid="construction-intersection-status"]')?.textContent?.includes("two-points"),"Saved definition review exposes circular classification");await click("Apply construction reassignment");await waitFor(()=>p(right)[1]>0);check(f(right).construction?.operation==="intersection"&&f(right).construction.branch==="positive","Inspector explicitly reassigns the saved branch");
 const intact=documentState();const rejected=await dispatchCadCommand({type:"move-object",objectId:"b",translation:[6,0,0]});check(!rejected.ok&&JSON.stringify(documentState())===JSON.stringify(intact),"Source edit that loses an intersection rolls back atomically");
 output.textContent=lines.join("\n")+`\nALL ${lines.length} CHECKS PASSED`;
}catch(cause){output.textContent=lines.join("\n")+`\nFAIL: ${cause instanceof Error?cause.stack:cause}`;}};installBrowserChecks(button,output);
