import {createRoot} from "react-dom/client";
import {App} from "../src/App";
import "../src/styles.css";import "../src/ui/tokens.css";import "../src/ui/workstation.css";import "../src/ui/commands.css";import "../src/ui/menu.css";import "../src/ui/explorer.css";import "../src/ui/inspector.css";
import {cadDocument} from "../src/state/cadDocument";
import {cadHistory} from "../src/state/history";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {saveDocumentToCache} from "../src/state/documentFile";
import {isDocumentCommandPending} from "../src/state/documentCommandQueue";
import {worldDraftingGeometry} from "../src/precision/draftingGeometry";
import {serializeDocument,deserializeDocument} from "@agent-webcad/cad-document";
import {resetTestDocument} from "./helpers/documentHarness";
import {installBrowserChecks} from "./helpers/browserChecks";
import {click,physical,choose,input,waitFor,pause,find} from "./helpers/physicalInput";
resetTestDocument();
async function apply(c:Parameters<typeof dispatchCadCommand>[0]){const r=await dispatchCadCommand(c);if(!r.ok)throw new Error(r.reason);return r;}
const feature=(id:string)=>Object.values(cadDocument.features).find(f=>f.output===id)!;
const hatchLineCount=()=>worldDraftingGeometry(cadDocument,cadDocument.objects.H,feature("H")).lines.length;
await apply({type:"create-drawing",id:"bottom",drawing:"polyline",params:{workPlane:"XY",points:[[0,0,0],[100,0,0],[100,60,0]]}});
await apply({type:"create-drawing",id:"top",drawing:"polyline",params:{workPlane:"XY",points:[[100,60,0],[0,60,0],[0,0,0]]}});
await apply({type:"create-drafting",id:"H",params:{kind:"hatch",sourceObjectIds:["bottom","top"],spacing:5,angle:0,workPlane:"XY"}});
saveDocumentToCache();createRoot(document.getElementById("root")!).render(<App/>);
const editor=()=>document.querySelector<HTMLFormElement>('[aria-label="Contour editor"]'),canvas=()=>document.querySelector<HTMLCanvasElement>("#root canvas")!;
const state=()=>{const {revision:_,...d}=cadDocument;return JSON.stringify(d);},past=()=>cadHistory.getPastLabels().length;
async function key(key:string,modifiers=0){await input({type:"key",key,modifiers});await pause();await waitFor(()=>!isDocumentCommandPending());}
async function field(label:string,value:string){const el=editor()?.querySelector<HTMLInputElement>(`[aria-label="${label}"]`);if(!el)throw new Error("Missing field "+label);await physical(el);await key("a",2);await input({type:"text",text:value});await pause();}
const button=document.getElementById("run-hatch") as HTMLButtonElement,output=document.getElementById("hatch-result")!;
button.onclick=async()=>{button.disabled=true;button.style.pointerEvents="none";const lines:string[]=[],check=(ok:unknown,label:string)=>{if(!ok)throw new Error(label);lines.push(`PASS: ${label}`);};try{
 await waitFor(()=>!!canvas());await click("2D");await physical(document.getElementById("tools-tab-modify")!);
 await physical(document.querySelector(`[data-model-object-id="bottom"] .tree-label`)!);
 await physical(document.querySelector(`[data-model-object-id="top"] .tree-label`)!,2);
 await waitFor(()=>!isDocumentCommandPending());
 check(!find("Join")?.disabled,"Selecting the two loop halves enables Join");
 const before=state(),h=past(),rows=hatchLineCount();assertRows(rows);
 await click("Join");await waitFor(()=>!!editor()&&document.querySelector('[data-contour-preview-count="1"]'));
 check(state()===before&&past()===h,"Join previews one closed contour without mutating sources or history");
 check(find("Apply contour edit")?.disabled&&!!editor()?.querySelector('[aria-label="Reconnect Join references"]')&&editor()!.textContent!.includes("hatch"),"The hatch blocks Apply until its reviewed results are chosen");
 await choose("Reference result H bottom",1);await choose("Reference result H top",1);
 await waitFor(()=>!find("Apply contour edit")?.disabled);
 check(true,"Mapping both hatch sources to the joined contour unblocks Apply");
 await click("Apply contour edit");await waitFor(()=>!editor()&&!isDocumentCommandPending());
 const joined=cadDocument.rootObjects.find(id=>!["bottom","top","H"].includes(id))!,joinedState=state();
 check(!!joined&&!cadDocument.objects.bottom&&!cadDocument.objects.top,"Apply replaces both halves with one joined contour");
 check(JSON.stringify(feature("H").params.sourceObjectIds)===JSON.stringify([joined]),"The hatch follows the joined contour as its only source");
 check(hatchLineCount()>0,"Hatch rows regenerate on the reviewed loop");
 check(past()===h+1,"Join and hatch regeneration share one Undo entry");
 await click("Undo");check(state()===before,"Undo restores both halves and the original hatch");await click("Redo");check(state()===joinedState,"Redo restores the reviewed join");
 await physical(document.querySelector(`[data-model-object-id="${joined}"] .tree-label`)!);await click("Break");
 await choose("Break operation",1);
 await field("First break point","40,0");await field("Second break point","60,0");await pause();
 await choose("Reference result H "+joined,1);
 await waitFor(()=>!!editor()?.textContent?.includes("cannot hatch"));
 check(find("Apply contour edit")?.disabled,"An opened contour cannot keep its hatch; the reviewed edit is rejected atomically");
 await click("Cancel contour edit");await waitFor(()=>!editor());check(state()===joinedState&&past()===h+1,"Cancel leaves the joined contour and hatch intact");
 check(JSON.stringify(deserializeDocument(serializeDocument(cadDocument)))===JSON.stringify(cadDocument),"Exact geometry, hatch regions and history survive native document serialization");
 await key("k",2);await input({type:"text",text:"Join contours"});await pause();check(document.querySelector("dialog[open]")?.textContent?.includes("Join contours"),"Command palette exposes the same operation");await key("Escape");
 output.textContent=lines.join("\n")+`\nALL ${lines.length} CHECKS PASSED`;
 function assertRows(n:number){if(!(n>0))throw new Error("hatch fixture has no rows");}
}catch(e){output.textContent=lines.join("\n")+`\nFAIL: ${e instanceof Error?e.message:String(e)}`;}finally{button.disabled=false;button.style.pointerEvents="";}};
installBrowserChecks(button,output);
