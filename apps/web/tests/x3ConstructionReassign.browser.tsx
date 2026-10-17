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
import {click,physical,choose,waitFor,find} from "./helpers/physicalInput";

async function apply(command:CadCommand){const r=await dispatchCadCommand(command);if(!r.ok)throw Error(r.reason);}
resetTestDocument();await createConstructionChain(apply);
await apply({type:"create-drawing",id:"C",name:"C",drawing:"point",params:{workPlane:"XY",points:[[20,0,0]],construction:true}});
await apply({type:"create-drawing",id:"path",name:"Path",drawing:"polyline",params:{workPlane:"XY",points:[[0,20,0],[100,20,0],[100,60,0]]}});
await apply({type:"create-construction",id:"M2",name:"M2",workPlane:"XY",definition:{operation:"midpoint",segmentId:"path",elements:{segment:{topologyId:(cadDocument.features["feature-path"].params.topology as {segments:{id:string}[]}).segments[0].id}}}});
saveDocumentToCache();createRoot(document.getElementById("root")!).render(<App/>);
const button=document.getElementById("run-reassign") as HTMLButtonElement,output=document.getElementById("reassign-result")!;
const f=(id:string)=>cadDocument.features[`feature-${id}`],points=(id:string)=>f(id).params.points as number[][];
async function select(id:string){await physical(document.querySelector(`[data-model-object-id="${id}"] .tree-label`)!);await waitFor(()=>Boolean(document.querySelector('[data-testid="construction-saved-definition"]')));}
async function source(role:string,id:string){const label=`Construction ${role} source`,field=document.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!;const index=[...field.options].findIndex(o=>o.value===id);if(index<0)throw Error(`Source absent: ${id}`);await choose(label,index);await waitFor(()=>field.value===id);}
async function element(role:string,label:string){const name=`Construction ${role} element`,field=document.querySelector<HTMLSelectElement>(`[aria-label="${name}"]`)!;const i=[...field.options].findIndex(o=>o.textContent===label);if(i<0)throw Error(`Missing element ${label}`);await choose(name,i);}
async function review(){await click("Review construction reassignment");await waitFor(()=>Boolean(document.querySelector('[aria-label="Reassign construction review"][data-command-stage="ready"]')));}
async function commit(){await click("Apply construction reassignment");await waitFor(()=>!document.querySelector('[aria-label="Reassign construction review"]'));}
button.onclick=async()=>{button.disabled=true;const lines:string[]=[],check=(value:unknown,label:string)=>{if(!value)throw Error(label);lines.push(`PASS: ${label}`);output.textContent=lines.join("\n");};try{
  await waitFor(()=>Boolean(document.querySelector('#root canvas')));await select("AB");const before=documentState(),past=cadHistory.getPastLabels().length;
  await source("first","C");await review();check(JSON.stringify(documentState())===JSON.stringify(before)&&cadHistory.getPastLabels().length===past,"Source reassignment review leaves live document and history unchanged");
  check(document.querySelector('[data-testid="construction-coordinate-review"]')?.textContent?.includes("(20, 0, 0)")&&document.querySelector('[aria-label="Reassign construction review"]')?.textContent?.includes("5 affected objects"),"Review exposes exact new coordinates and downstream impact");
  await source("first","A");check(!document.querySelector('[data-testid="construction-coordinate-review"]'),"Source draft change discards prior review");
  await source("first","C");await review();await click("Cancel construction reassignment");check(JSON.stringify(documentState())===JSON.stringify(before)&&(document.querySelector('[aria-label="Construction first source"]') as HTMLSelectElement).value==="A","Cancel restores stored definition without mutation");
  await source("first","C");await review();await commit();check(f("AB").inputs.join(",")==="C,B"&&Math.abs(points("M")[0][0]-60)<1e-7&&Math.abs(points("P")[0][1]-Math.sqrt(6300))<1e-6&&cadHistory.getPastLabels().length===past+1,"Apply updates definition, graph and dependent geometry in one Undo");
  const after=documentState();await click("Undo");await waitFor(()=>f("AB").inputs[0]==="A");await click("Redo");await waitFor(()=>f("AB").inputs[0]==="C");check(JSON.stringify(documentState())===JSON.stringify(after),"Undo/Redo restores the complete reassignment");
  await source("first","M");await click("Review construction reassignment");await waitFor(()=>Boolean(document.querySelector('[aria-label="Reassign construction review"][data-command-stage="invalid"]')));check(find("Apply construction reassignment").disabled&&document.body.innerText.includes("Cyclic")&&JSON.stringify(documentState())===JSON.stringify(after),"Indirect cycle stays in editable draft and rejects atomically");
  await source("first","A");await review();await click("Cancel construction reassignment");
  await select("P");await choose("Construction intersection branch",0);await review();await commit();check(points("P")[0][1]<0&&f("P").construction?.operation==="intersection"&&f("P").construction.branch==="negative","Intersection branch changes only after reviewed Apply");
  await select("M2");await element("segment","Edge 2");await review();await commit();check(Math.abs(points("M2")[0][0]-100)<1e-7&&Math.abs(points("M2")[0][1]-40)<1e-7,"Saved topology edge is explicitly reassigned");
  await element("segment","Whole endpoint span");await review();await commit();check(Math.abs(points("M2")[0][0]-50)<1e-7&&Math.abs(points("M2")[0][1]-40)<1e-7,"Whole endpoint span uses the actual saved path endpoints");
  await element("segment","Edge 1");await review();await apply({type:"rename-object",objectId:"C",name:"Changed C"});await waitFor(()=>!document.querySelector('[data-testid="construction-coordinate-review"]'));check(!document.querySelector('[aria-label="Reassign construction review"]'),"External document change invalidates a ready review");
  const lockedDefinition=JSON.stringify(f("M2").construction);await apply({type:"set-layer-locked",layerId:"layer-default",locked:true});await physical(document.querySelector('[data-model-object-id="M2"] .tree-label')!);await waitFor(()=>!document.querySelector('[data-testid="construction-saved-definition"]'));check(JSON.stringify(f("M2").construction)===lockedDefinition,"Locked output cannot enter the definition editor");
  output.textContent=lines.join("\n")+`\nALL ${lines.length} CHECKS PASSED`;
}catch(cause){output.textContent=lines.join("\n")+`\nFAIL: ${cause instanceof Error?cause.stack:cause}`;}};installBrowserChecks(button,output);
