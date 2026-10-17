import {createRoot} from "react-dom/client";
import {App} from "../src/App";
import "../src/styles.css";import "../src/ui/tokens.css";import "../src/ui/workstation.css";import "../src/ui/commands.css";import "../src/ui/menu.css";import "../src/ui/explorer.css";import "../src/ui/inspector.css";
import {cadDocument} from "../src/state/cadDocument";
import {cadHistory} from "../src/state/history";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {saveDocumentToCache} from "../src/state/documentFile";
import {isDocumentCommandPending} from "../src/state/documentCommandQueue";
import {serializeDocument,deserializeDocument} from "@agent-webcad/cad-document";
import {resetTestDocument} from "./helpers/documentHarness";
import {installBrowserChecks} from "./helpers/browserChecks";
import {click,physical,text,choose,input,waitFor,pause,find} from "./helpers/physicalInput";
resetTestDocument();
for(const c of [
 {type:"create-drawing",id:"source",drawing:"line",params:{points:[[0,0,0],[100,0,0]],workPlane:"XY"}},
 {type:"create-dimension",id:"D",dimension:"linear",params:{sourceObjectId:"source",points:[[0,0],[100,0]],workPlane:"XY",offset:15}},
 {type:"create-construction",id:"M",workPlane:"XY",definition:{operation:"midpoint",segmentId:"source"}},
] as Parameters<typeof dispatchCadCommand>[0][]){const r=await dispatchCadCommand(c);if(!r.ok)throw new Error(r.reason);}
saveDocumentToCache();createRoot(document.getElementById("root")!).render(<App/>);
const editor=()=>document.querySelector<HTMLFormElement>('[aria-label="Contour editor"]'),canvas=()=>document.querySelector<HTMLCanvasElement>("#root canvas")!;
const state=()=>{const {revision:_,...d}=cadDocument;return JSON.stringify(d);},past=()=>cadHistory.getPastLabels().length,feature=(id:string)=>Object.values(cadDocument.features).find(f=>f.output===id)!;
const select=async(id:string)=>physical(document.querySelector(`[data-model-object-id="${id}"]`)!);
const ready=()=>waitFor(()=>!!editor()&&!find("Apply contour edit").disabled);
async function configure(){await choose("Break operation",1);await text("First break point","4cm,0");await text("Second break point","@2cm,0");await waitFor(()=>document.querySelectorAll('[data-break-result]').length===2);}
async function routes(source="source"){for(const id of ["D","M"]){await choose(`Reference result ${id} ${source}`,1);await choose(`Reference portion ${id} ${source}`,1);}await ready();}
const button=document.getElementById("run-break") as HTMLButtonElement,output=document.getElementById("break-result")!;
button.onclick=async()=>{button.disabled=true;button.style.pointerEvents="none";const lines:string[]=[],check=(ok:unknown,label:string)=>{if(!ok)throw new Error(label);lines.push(`PASS: ${label}`);};try{
 await waitFor(()=>!!canvas());await click("2D");await select("source");await physical(document.getElementById("tools-tab-modify")!);await click("Break");const before=state(),h=past();await configure();
 check(find("Apply contour edit").disabled&&state()===before&&past()===h,"Exact gap draft shows two numbered pieces and waits for all references without mutation");
 await choose("Reference result D source",2);await choose("Reference portion D source",2);check(find("Apply contour edit").disabled,"A mapped dimension alone cannot apply while midpoint remains unresolved");
 await choose("Reference result M source",1);await choose("Reference portion M source",1);await ready();check(editor()!.textContent!.includes("100.00 mm → 40.00 mm"),"Review displays the retained dimension extent");check(document.querySelectorAll('[data-break-reference]').length===2,"Chosen edge and whole-span references are highlighted");
 await click("Cancel contour edit");await waitFor(()=>!editor());check(state()===before&&past()===h&&document.activeElement===canvas(),"Cancel discards the plan and restores canvas focus");
 await click("Break");await configure();await choose("Keep Break pieces",2);check(find("Apply contour edit").disabled,"Changing kept fragments requires fresh reference choices");await routes();
 check(document.querySelectorAll('[data-break-result]').length===1,"Only the selected remaining piece is numbered and reviewed");
 await text("Second break point","bad");await waitFor(()=>find("Apply contour edit").disabled);check(state()===before,"Invalid replacement coordinates disable Apply and preserve document");await text("Second break point","@2cm,0");await ready();
 canvas().focus();await input({type:"key",key:"Enter"});await waitFor(()=>!editor()&&!isDocumentCommandPending());const result=String(feature("D").params.sourceObjectId),after=state();
 check(!cadDocument.objects.source&&cadDocument.rootObjects.filter(id=>id.startsWith("contour-")).length===1,"Canvas Enter retains only the selected Break fragment");check(JSON.stringify(feature("D").params.points)==="[[60,0],[100,0]]"&&JSON.stringify(feature("M").params.points)==="[[80,0,0]]","Dimension and midpoint regenerate on the retained second piece");check(past()===h+1,"Break and all remapped relationships occupy one history entry");
 await click("Undo");check(state()===before,"Undo restores source and original relationships");await click("Redo");check(state()===after,"Redo restores reviewed fragment identities and references");check(JSON.stringify(deserializeDocument(serializeDocument(cadDocument)))===JSON.stringify(cadDocument),"Fragment topology and relationship routes survive serialization");
 await select(result);await click("Break");await text("First break point","8cm,0");await waitFor(()=>document.querySelectorAll('[data-break-result]').length===2);await routes(result);await click("Apply contour edit");await waitFor(()=>!editor());check(JSON.stringify(feature("D").params.points)==="[[60,0],[80,0]]","The retained result can be split again with the same live relationships");
 await click("Undo");check(state()===after,"A subsequent Break also undoes as a single edit");
 output.textContent=lines.join("\n")+`\nALL ${lines.length} CHECKS PASSED`;
}catch(e){output.textContent=lines.join("\n")+`\nFAIL: ${e instanceof Error?e.message:String(e)}`;}finally{button.disabled=false;button.style.pointerEvents="";}};
installBrowserChecks(button,output);
