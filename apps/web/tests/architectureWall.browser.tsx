import {createRoot} from "react-dom/client";
import {App} from "../src/App";
import "../src/styles.css";import "../src/ui/tokens.css";import "../src/ui/workstation.css";import "../src/ui/commands.css";import "../src/ui/menu.css";import "../src/ui/explorer.css";import "../src/ui/inspector.css";
import {cadDocument} from "../src/state/cadDocument";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {cadHistory} from "../src/state/history";
import {saveDocumentToCache} from "../src/state/documentFile";
import {serializeDocument,type ArchitectureWall} from "@agent-webcad/cad-document";
import {measureDocumentObject} from "../src/state/documentQuery";
import {resetTestDocument} from "./helpers/documentHarness";
import {physical,click,text,find,input,waitFor,choose} from "./helpers/physicalInput";
import {installBrowserChecks} from "./helpers/browserChecks";
import {rootUuids} from "./helpers/projectPerformanceProbe";
resetTestDocument();
for(const [id,y] of [["axis",0],["second",3000]] as const)await dispatchCadCommand({type:"create-drawing",id,drawing:"line",params:{points:[[0,y,0],[6000,y,0]],workPlane:"XY"}});
saveDocumentToCache();createRoot(document.getElementById("root")!).render(<App/>);
const button=document.getElementById("run") as HTMLButtonElement,output=document.getElementById("output")!;
const walls=()=>Object.values(cadDocument.features).filter(f=>f.params.architecturalWall),def=()=>walls()[0].params.architecturalWall as ArchitectureWall;
const state=()=>{const {revision:_,...d}=cadDocument;return JSON.stringify(d);};
const select=async(id:string)=>{const reopen=!!document.querySelector('[aria-label="Floor plan tasks"]');if(reopen)await click("Close floor tasks");await physical(document.querySelector(`[data-model-object-id="${id}"] .tree-label`)!);if(reopen){await physical(document.querySelector(".menu-items summary")!);await click("Floor plan tasks…");}};
const review=async(name:string)=>{await click(name);await waitFor(()=>!find("Apply wall review").disabled);};
button.onclick=async()=>{const lines:string[]=[],check=(ok:unknown,label:string)=>{if(!ok)throw Error(label);lines.push("PASS "+label);output.textContent=lines.join("\n");};try{
 await waitFor(()=>!!document.querySelector("canvas"));await select("axis");await physical(document.querySelector(".menu-items summary")!);await click("Floor plan tasks…");
 await text("Wall height","2.7m");const before=state(),past=cadHistory.getPastLabels().length;await review("Review create walls");
 await waitFor(()=>[...rootUuids.keys()].some(k=>k.startsWith("wall-review-")));check(state()===before&&cadHistory.getPastLabels().length===past,"Exact wall ghost renders in viewport without document mutation");
 await click("Cancel wall review");check(state()===before&&find("Use last applied wall height").disabled,"Canceled height is not remembered as a completed extrusion");
 await review("Review create walls");await click("Apply wall review");await waitFor(()=>walls().length===1);const host=walls()[0].output;
 check(def().height===2700&&cadHistory.getPastLabels().length===past+1,"Unit input creates wall in one Undo");await waitFor(()=>rootUuids.has(host));check(rootUuids.has(host),"Committed exact wall is rendered by viewport");
 await select("second");await click("Use last applied wall height");check((document.querySelector('[aria-label="Wall height"]') as HTMLInputElement).value==="2700","Repeat uses last successfully applied height");await review("Review create walls");await click("Apply wall review");await waitFor(()=>walls().length===2);check(walls().every(f=>(f.params.architecturalWall as ArchitectureWall).height===2700),"Next wall repeats height through the same Review workflow");
 await select(host);await text("Opening along","1.5m");await text("Opening width","900mm");await text("Opening height","2100mm");const solid=state();await review("Review opening");check(state()===solid,"Door review keeps original solid untouched");await click("Apply wall review");await waitFor(()=>def().openings.length===1);
 const door=def().openings[0].id;check(Math.abs((await measureDocumentObject(cadDocument,host)).volume!-(6000*200*2700-900*200*2100))<1,"Door cuts exact current wall thickness");
 await choose("Wall opening",0);await choose("Wall opening kind",1);await text("Opening along","4m");await text("Opening width","1200mm");await text("Opening height","1200mm");await text("Opening sill","900mm");await review("Review opening");await click("Apply wall review");await waitFor(()=>def().openings.length===2);check(def().openings[1].sill===900&&def().openings[0].id===door,"Window keeps sill and door host identity");
 await text("Wall thickness","250mm");await review("Review wall dimensions");await click("Apply wall review");await waitFor(()=>def().thickness===250);check(Math.abs((await measureDocumentObject(cadDocument,host)).volume!-(6000*250*2700-900*250*2100-1200*250*1200))<1,"Thickness edit rebuilds both through openings");
 await choose("Wall opening",1);const withBoth=state();await review("Review remove opening");await click("Apply wall review");await waitFor(()=>def().openings.length===1);check(!def().openings.some(o=>o.id===door),"Remove opening restores host material");await click("Undo");check(state()===withBoth,"One Undo restores removed opening and exact wall");
 const portable=serializeDocument(cadDocument),saved=state();await input({type:"key",key:"s",modifiers:2});await input({type:"fileInput",selector:'input[accept=".json,.webcad.json"]',name:'prepared.webcad.json',base64:btoa(unescape(encodeURIComponent(portable)))});await waitFor(()=>cadHistory.getPastLabels().length===0&&walls().length===2);check(state()===saved,"Portable v41 reopen retains wall sources, dimensions and openings");
 await click("Close floor tasks");await click("Copilot");await click("Clean / Make face…");check(!!document.querySelector('[aria-label="Walls and openings"]'),"Copilot opens the shared wall/opening task panel");
 output.textContent=lines.join("\n")+`\nALL ${lines.length} CHECKS PASSED`;
 }catch(e){output.textContent=lines.join("\n")+`\nFAIL: ${e instanceof Error?e.stack:String(e)}`;}};installBrowserChecks(button,output);



