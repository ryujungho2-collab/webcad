import {createRoot} from "react-dom/client";
import {App} from "../src/App";
import "../src/ui/tokens.css";
import "../src/ui/workstation.css";
import "../src/ui/commands.css";
import "../src/ui/menu.css";
import "../src/ui/explorer.css";
import "../src/ui/inspector.css";
import {cadDocument} from "../src/state/cadDocument";
import {cadHistory} from "../src/state/history";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {saveDocumentToCache} from "../src/state/documentFile";
import {queryCadDocument} from "../src/state/documentQuery";
import {exportStepBytes} from "../src/export/exportModel";
import {resetTestDocument} from "./helpers/documentHarness";
import {installBrowserChecks} from "./helpers/browserChecks";
import {click,text,physical,choose,find,waitFor,input,pause} from "./helpers/physicalInput";
const reloadKey="numeric-pilot-reload",apply=async(command:Parameters<typeof dispatchCadCommand>[0])=>{const result=await dispatchCadCommand(command);if(!result.ok)throw Error(result.reason);};
if(!sessionStorage.getItem(reloadKey)){
 resetTestDocument();await apply({type:"create-primitive",id:"cylinder",primitive:"cylinder",params:{radius:5,height:10}});await apply({type:"rename-object",objectId:"cylinder",name:"Pilot cylinder"});
 await apply({type:"create-sketch",id:"pilot-sketch",workPlane:"XY"});await apply({type:"add-sketch-geometry",sketchId:"pilot-sketch",geometry:{id:"circle",kind:"circle",center:[30,0],radius:5,centerId:"center",curveId:"curve"}});await apply({type:"add-sketch-constraint",sketchId:"pilot-sketch",constraint:{id:"diameter",kind:"diameter",geometryId:"circle",value:10}});await apply({type:"create-extrude",id:"solid",profileObjectIds:["circle"],distance:10});await apply({type:"rename-object",objectId:"solid",name:"Pilot extrusion"});saveDocumentToCache();
}
createRoot(document.getElementById("root")!).render(<App/>);
const button=document.getElementById("run-numeric") as HTMLButtonElement,output=document.getElementById("numeric-result")!,state=()=>{const {revision:_,...d}=cadDocument;return JSON.stringify(d);},feature=(id:string)=>Object.values(cadDocument.features).find(f=>f.output===id)!,near=(a:number,b:number)=>Math.abs(a-b)<.003;
async function select(name:string){const label=[...document.querySelectorAll('.tree-label')].find(e=>e.textContent?.trim()===name);if(!label)throw Error("Missing tree object "+name);await physical(label);await waitFor(()=>!!document.querySelector('[aria-label="Numeric model edit"]'));}
async function ready(){await waitFor(()=>!!document.querySelector('[aria-label="Numeric model edit"] button')&&[...document.querySelectorAll<HTMLButtonElement>('button')].some(b=>b.textContent==="Apply numeric edit"&&!b.disabled));}
button.onclick=async()=>{
 button.disabled=true;const resumed=sessionStorage.getItem(reloadKey),saved=resumed?JSON.parse(resumed):undefined,lines:string[]=saved?.lines??[],check=(v:unknown,s:string)=>{if(!v)throw Error(s);lines.push(`PASS: ${s}`);output.textContent=lines.join("\n");};
 try{
 await waitFor(()=>!!document.querySelector('canvas'));
 if(saved){check(state()===saved.expected,"Reload restores numeric source edits and the linked sketch/solid");check(cadHistory.getPastLabels().length===0,"Reload starts with fresh Undo history");const q=await queryCadDocument(["cylinder","solid"]);check(q.objects.every(o=>o.measurement?.validity==="valid"),"Restored primitives and extrusion build valid Worker solids");sessionStorage.removeItem(reloadKey);output.textContent=lines.join("\n")+`\nALL ${lines.length} CHECKS PASSED`;return;}
 await select("Pilot cylinder");check((document.querySelector('[aria-label="Cylinder size"]') as HTMLInputElement).value==="10","Cylinder starts in diameter mode using its original radius");
 const before=state(),history=cadHistory.getPastLabels().length;await text("Cylinder size","2cm");await text("Cylinder length","1in");await click("Review numeric edit");await ready();check(state()===before&&cadHistory.getPastLabels().length===history,"Unit-aware Review leaves the document and history unchanged");check(document.querySelector('[aria-label="Numeric parameter changes"]')?.textContent?.includes("20 mm")&&document.querySelector('[aria-label="Numeric edit measurements"]')?.textContent?.includes("mm³"),"Review shows normalized diameter, length and actual Worker volume");await click("Cancel numeric review");check(state()===before,"Cancel discards the reviewed proposal");
 await choose("Cylinder size mode",1);check((document.querySelector('[aria-label="Cylinder size"]') as HTMLInputElement).value==="10","Diameter-to-radius switch preserves the drafted physical size");await click("Review numeric edit");await ready();await click("Apply numeric edit");await waitFor(()=>feature("cylinder").params.height===25.4);check(feature("cylinder").params.radius===10&&cadHistory.getPastLabels().length===history+1,"Apply changes both primitive dimensions in one Undo");const after=state();await click("Undo");check(state()===before,"Undo restores the entire source");await click("Redo");check(state()===after,"Redo restores both reviewed values");
 await text("Cylinder length","0mm");await click("Review numeric edit");check(state()===after&&document.querySelector('[aria-label="Numeric model edit"] [role="alert"]')?.textContent?.includes("positive"),"Invalid dimensions show recovery without resetting or publishing the draft");await text("Cylinder length","3cm");await click("Review numeric edit");await ready();await text("Cylinder length","4cm");check(![...document.querySelectorAll('button')].some(b=>b.textContent==="Apply numeric edit"),"Changed input discards its previous Review");await click("Review numeric edit");await ready();await apply({type:"rename-object",objectId:"cylinder",name:"Pilot cylinder revised"});await waitFor(()=>!document.querySelector('[aria-label="Cylinder dimensions review"]'));check(feature("cylinder").params.height===25.4,"Concurrent document edit invalidates the pending numeric proposal");
 await select("Pilot extrusion");const extrusionBefore=state();await text("Extrusion length","-2cm");await click("Review numeric edit");await ready();check(state()===extrusionBefore,"Extrusion length Preview is detached");await click("Apply numeric edit");await waitFor(()=>feature("solid").params.distance===-20);check(near((await queryCadDocument(["solid"])).objects[0].measurement!.volume!,Math.PI*25*20),"Negative unit-aware extrusion edits direction and exact volume");
 const edit=[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.title.includes("Edit")&&b.textContent?.includes("pilot-sketch"));if(!edit)throw Error("Missing Edit sketch");await physical(edit);await waitFor(()=>!!document.querySelector('[aria-label="Diameter diameter"]'));const sketchBefore=state(),sketchHistory=cadHistory.getPastLabels().length;await text("Diameter diameter","R 1cm");await input({type:"key",key:"Enter"});await waitFor(()=>!find("Apply constraint").disabled);check(state()===sketchBefore,"Sketch R input reviews its diameter driver without mutation");check(document.querySelector('[aria-label="Numeric edit measurements"]')?.textContent?.includes("mm³"),"Sketch review reports connected extrusion volume");await click("Apply constraint");await waitFor(()=>cadDocument.sketches!["pilot-sketch"].constraints[0].kind==="diameter"&&cadDocument.sketches!["pilot-sketch"].constraints[0].value===20);check(cadHistory.getPastLabels().length===sketchHistory+1&&near((await queryCadDocument(["solid"])).objects[0].measurement!.volume!,Math.PI*100*20),"Sketch Apply retains driver identity and regenerates its linked solid in one Undo");
 await click("Undo");check(state()===sketchBefore,"Sketch Undo restores projection and extrusion together");await click("Redo");check((await exportStepBytes(["cylinder","solid"])).byteLength>100,"Edited cylinder and sketch extrusion export as actual STEP solids");
 saveDocumentToCache();sessionStorage.setItem(reloadKey,JSON.stringify({expected:state(),lines}));location.reload();
 }catch(cause){output.textContent=lines.join("\n")+`\nFAIL: ${cause instanceof Error?cause.stack:String(cause)}`;}
};installBrowserChecks(button,output);
