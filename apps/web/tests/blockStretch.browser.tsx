import {createRoot} from "react-dom/client";
import {App} from "../src/App";
import "../src/ui/tokens.css";import "../src/ui/workstation.css";import "../src/ui/commands.css";import "../src/ui/menu.css";import "../src/ui/explorer.css";import "../src/ui/inspector.css";
import {cadDocument} from "../src/state/cadDocument";
import {cadHistory} from "../src/state/history";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {saveDocumentToCache} from "../src/state/documentFile";
import {serializeDocument,deserializeDocument} from "@agent-webcad/cad-document";
import {resetTestDocument} from "./helpers/documentHarness";
import {installBrowserChecks} from "./helpers/browserChecks";
import {click,text,waitFor,physical,input} from "./helpers/physicalInput";
resetTestDocument();
await dispatchCadCommand({type:"create-drawing",id:"arc",drawing:"arc",params:{workPlane:"XY",center:[0,0,0],radius:10,startAngle:0,endAngle:Math.PI/2}});
await dispatchCadCommand({type:"define-block",id:"symbol",name:"Symbol",objectIds:["arc"],base:[0,0,0]});
await dispatchCadCommand({type:"insert-block",id:"instance",blockId:"symbol",position:[100,200,0]});
await dispatchCadCommand({type:"insert-block",id:"sibling",blockId:"symbol",position:[300,200,0]});
await dispatchCadCommand({type:"create-drawing",id:"line",name:"Stretch line",drawing:"line",params:{workPlane:"XY",points:[[100,205,0],[120,205,0]]}});
saveDocumentToCache();createRoot(document.getElementById("root")!).render(<App/>);
const button=document.getElementById("run-fillet") as HTMLButtonElement,output=document.getElementById("fillet-result")!,editor=()=>document.querySelector<HTMLFormElement>('[aria-label="Basic drawing editor"]'),submit=()=>editor()?.querySelector<HTMLButtonElement>('button[type="submit"]'),canvas=()=>document.querySelector<HTMLCanvasElement>("#root canvas")!;
const state=()=>{const {revision:_,...d}=cadDocument;return JSON.stringify(d);},feature=(id:string)=>Object.values(cadDocument.features).find(f=>f.output===id)!;
const ready=()=>waitFor(()=>!!submit()&&!submit()!.disabled),select=async(ids:string[])=>{for(let i=0;i<ids.length;i++)await physical(document.querySelector(`[data-model-object-id="${ids[i]}"] .tree-label`)!,i?2:0);};
button.onclick=async()=>{
 const checks:string[]=[],check=(v:unknown,s:string)=>{if(!v)throw new Error(s);checks.push(`PASS: ${s}`);output.textContent=checks.join("\n");};button.disabled=true;
 try{
 await waitFor(()=>!!canvas());await click("2D");await physical(document.getElementById("tools-tab-modify")!);await select(["instance"]);
 const before=state(),h=cadHistory.getPastLabels().length,definition=JSON.stringify(cadDocument.blocks),sibling=JSON.stringify(cadDocument.objects.sibling);
 await click("Stretch");check(!!editor(),"Selected block exposes the native Stretch editor");await text("Stretch first corner","99,199");await text("Stretch second corner","105,211");await text("Stretch displacement","2cm,-5mm");await waitFor(()=>!!editor()?.textContent?.includes("partially included"));check(!!submit()?.disabled&&state()===before,"Partial block bounds block Apply without editing geometry");check(editor()!.textContent!.includes("definition")&&editor()!.textContent!.includes("Disband block"),"Partial inclusion identifies explicit definition/disband handoff");
 await text("Stretch second corner","111,211");await ready();check(state()===before&&cadHistory.getPastLabels().length===h,"Full block Preview leaves the document and History unchanged");check(document.querySelectorAll('[data-basic-edit-preview-count] polyline[stroke="#61dcac"]').length>=2,"Preview shows member geometry and the complete block envelope");check(document.querySelectorAll('[data-handle-selected="true"]').length===4,"Four envelope corners mark one rigidly moving instance");
 await click("Fit edit preview");await text("Stretch displacement","oops");await waitFor(()=>!!submit()?.disabled);check(state()===before,"Invalid displacement disables Apply and preserves the instance");await text("Stretch displacement","2cm,-5mm");await ready();await click("Cancel drawing edit");await waitFor(()=>!editor());check(state()===before&&document.activeElement===canvas(),"Cancel discards the plan and restores canvas focus");
 await click("Stretch");await text("Stretch first corner","111,211");await text("Stretch second corner","99,199");await text("Stretch displacement","20,-5");await ready();canvas().focus();await input({type:"key",key:"Enter"});await waitFor(()=>!editor());check(JSON.stringify(cadDocument.objects.instance.transform!.translation)===JSON.stringify([120,195,0]),"Canvas Enter applies the exact rigid world displacement with reversed area corners");check(JSON.stringify(cadDocument.blocks)===definition&&JSON.stringify(cadDocument.objects.sibling)===sibling,"Definition and sibling instance remain unchanged");check(cadHistory.getPastLabels().length===h+1,"Rigid block Stretch is exactly one Undo");const after=state();await click("Undo");check(state()===before,"Undo restores original placement and definition");await click("Redo");check(state()===after,"Redo restores the reviewed instance transform");check(JSON.stringify(deserializeDocument(serializeDocument(cadDocument)))===JSON.stringify(cadDocument),"Block placement survives portable JSON reload");await click("Undo");
 await select(["line","instance"]);await click("Stretch");await text("Stretch first corner","99,199");await text("Stretch second corner","105,211");await text("Stretch displacement","20,-5");await waitFor(()=>!!editor()?.textContent?.includes("partially included"));check(!!submit()?.disabled&&state()===before,"Mixed line/block partial selection rejects the entire preview");await text("Stretch second corner","111,211");await ready();await click("Apply drawing edit");await waitFor(()=>!editor());check(JSON.stringify(feature("line").params.points)===JSON.stringify([[120,200,0],[120,205,0]])&&JSON.stringify(cadDocument.objects.instance.transform!.translation)===JSON.stringify([120,195,0]),"One Apply stretches the included line endpoint and rigidly moves the block");check(cadHistory.getPastLabels().length===h+1,"Mixed geometry and block movement share one history transaction");await click("Undo");check(state()===before,"Mixed Undo restores both sources atomically");
 output.textContent=checks.join("\n")+`\nALL ${checks.length} CHECKS PASSED`;
 }catch(e){output.textContent=checks.join("\n")+`\nFAIL: ${e instanceof Error?e.stack:String(e)}`;}
};installBrowserChecks(button,output);
