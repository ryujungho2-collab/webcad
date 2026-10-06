import {createRoot} from "react-dom/client";import {App} from "../src/App";
import "../src/ui/tokens.css";import "../src/ui/workstation.css";import "../src/ui/commands.css";import "../src/ui/menu.css";import "../src/ui/explorer.css";import "../src/ui/inspector.css";
import {cadDocument} from "../src/state/cadDocument";import {cadHistory} from "../src/state/history";
import {isDocumentCommandPending} from "../src/state/documentCommandQueue";
import {planPlot,renderPlotPdfForDownload} from "../src/plot/plotPlan";
import {encodeDxf} from "../src/interop/dxfWriter";import {parseDxf} from "../src/interop/dxfParser";
import {installBrowserChecks} from "./helpers/browserChecks";
import {worldDraftingGeometry} from "../src/precision/draftingGeometry";
createRoot(document.getElementById("root")!).render(<App/>);
const button=document.getElementById("run-delivery") as HTMLButtonElement,output=document.getElementById("delivery-result")!;
const pause=()=>new Promise<void>(resolve=>setTimeout(resolve,30));
const state=()=>{const {revision:_,...data}=cadDocument;return JSON.stringify(data);};
async function waitFor(check:()=>boolean){const deadline=Date.now()+15000;while(!check()){if(Date.now()>deadline)throw new Error("UI condition timed out");await pause();}await pause();}
async function click(name:string){const element=Array.from(document.querySelectorAll<HTMLButtonElement>("#root button")).find(entry=>(entry.getAttribute("aria-label")??entry.textContent?.trim())===name);if(!element)throw new Error(`Missing ${name}`);element.click();await pause();await waitFor(()=>!isDocumentCommandPending());}
async function input(name:string,value:string){const element=document.querySelector<HTMLInputElement>(`[aria-label="${name}"]`)!;if(!element)throw new Error(`Missing ${name}`);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(element,value);element.dispatchEvent(new Event("input",{bubbles:true}));await pause();}
async function select(name:string,value:string){const element=document.querySelector<HTMLSelectElement>(`[aria-label="${name}"]`)!;element.value=value;element.dispatchEvent(new Event("change",{bubbles:true}));await pause();}
button.onclick=async()=>{button.disabled=true;const lines:string[]=[];const check=(value:unknown,label:string)=>{if(!value)throw new Error(label);lines.push(`PASS: ${label}`);output.textContent=lines.join("\n");};try{
  await waitFor(()=>Boolean(document.querySelector("#root canvas")));await click("New document");await click("2D");await click("Drafting");await select("Drafting operation","floor-plan");await input("Drafting text","거실");
  const before=state();await click("Apply drafting");const room=Object.values(cadDocument.features).find(f=>f.params.kind==="floor-plan")!;
  check(room.params.width===6000&&room.params.depth===4000&&room.params.wall===150,"Room plan UI creates the requested 6000×4000 footprint with 150mm walls");
  const original=state(),history=cadHistory.getPastLabels().length;await click("Drafting");await input("Plan doorCenter","2000");await input("Plan windowCenter","4500");await click("Apply drafting");
  check(room.output in cadDocument.objects && cadDocument.features[room.id].params.doorCenter===2000 && cadHistory.getPastLabels().length===history+1,"Opening edit moves door and window 500mm in one transaction");
  const changed=state();await click("Undo");check(state()===original,"Opening edit Undo restores the full plan");await click("Redo");check(state()===changed,"Opening edit Redo restores linked linework and dimensions");
  await click("Drafting");await input("Plan doorCenter","0");await click("Apply drafting");check(state()===changed&&Boolean(document.querySelector('.drafting-panel [role="alert"]')),"Invalid opening rejects without changing the model");await click("Cancel drafting");
  await click("Layers");await input("Layer color","#222222");await select("Layer line weight","0.5");await select("Layer line type","continuous");await waitFor(()=>!isDocumentCommandPending());
  check(cadDocument.layers["layer-default"].style?.color==="#222222"&&cadDocument.layers["layer-default"].style?.lineWeight===0.5,"Layer panel sets persisted color and physical line weight");
  await click("Fit all geometry");const plot=planPlot("XY","A4","landscape","1:50")!;
  const edge=plot.page.polylines.find(line=>line.closed && Math.abs(line.points[2][1]-line.points[0][1])>70)!;
  check(plot.ratio===0.02&&Math.abs(edge.points[2][1]-edge.points[0][1])===80,"1:50 plot maps 4000mm to 80mm on paper");
  const pdf=await renderPlotPdfForDownload(plot),encoded=new TextDecoder().decode(pdf);
  check(encoded.includes("/Subtype /Image")&&encoded.includes("/ActualText <FEFF")&&!encoded.includes("(??)"),"Browser PDF preserves Korean labels using installed fonts and Unicode ActualText");
  const parsed=parseDxf(encodeDxf(cadDocument).text);check(parsed.entities.some(entity=>entity.kind==="text"&&entity.text==="거실"),"DXF carries editable Korean TEXT beside the plan vectors");
  (globalThis as typeof globalThis & {cadTestArtifacts?:Record<string,string>}).cadTestArtifacts={"room-plan-1-50.pdf":btoa(Array.from(pdf,b=>String.fromCharCode(b)).join("")),"room-plan.dxf":encodeDxf(cadDocument).text,"room-plan.webcad.json":JSON.stringify({format:"agent-webcad",version:1,document:cadDocument}),"room-plan.plot.json":JSON.stringify(plot)};
  await click("Drafting");await select("Drafting operation","text");await input("Drafting text","NOTE");await input("Drafting point","2m,1m");await input("Drafting angle","0");await click("Apply drafting");
  check(Object.values(cadDocument.features).some(f=>f.params.kind==="text"&&f.params.text==="NOTE"),"Text tool accepts model-unit coordinates and a real document annotation");
  while(cadHistory.getPastLabels().length)await click("Undo");check(state()===before,"Representative plan creation and edits restore the complete empty document");
  await click("New document");await click("2D");document.getElementById("tools-tab-draw")!.click();await pause();await click("Rectangle");
  const keys=async(text:string)=>{for(const key of text){document.body.dispatchEvent(new KeyboardEvent("keydown",{key,bubbles:true}));await pause();}document.body.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));await pause();await waitFor(()=>!isDocumentCommandPending());};
  await keys("0,0");await keys("1000,600");document.body.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));await pause();
  const source=cadDocument.rootObjects[0];await click("Drafting");await select("Drafting operation","hatch");await input("Hatch spacing","100");await input("Drafting angle","45");await click("Apply drafting");
  const hatch=Object.values(cadDocument.features).find(f=>f.params.kind==="hatch")!;
  check(hatch.inputs.includes(source)&&worldDraftingGeometry(cadDocument,cadDocument.objects[hatch.output],hatch).lines.length>0,"Hatch UI creates clipped linework with a live boundary reference");
  await click("Model");const row=Array.from(document.querySelectorAll<HTMLElement>(".tree-row-model")).find(entry=>entry.textContent?.includes("Rectangle"))!;row.click();await pause();
  await click("Drafting");await select("Drafting operation","chain");await input("Drafting text height","40");await select("Dimension chain direction","aligned");await click("Apply drafting");
  check(Object.values(cadDocument.features).some(f=>f.params.kind==="chain"&&f.params.sourceObjectId===source),"Continuous dimension UI retains its source instead of duplicating measured values");
  row.click();await pause();await click("Drafting");await select("Drafting operation","define-block");await input("Block name","Window symbol");await click("Apply drafting");
  check(Object.keys(cadDocument.blocks??{}).length===1,"Selection defines a reusable block in the document");
  await input("Drafting point","2m,1m");await input("Drafting angle","90");await click("Apply drafting");
  const instance=Object.values(cadDocument.features).find(f=>f.params.kind==="block")!,blockLine=worldDraftingGeometry(cadDocument,cadDocument.objects[instance.output],instance).lines[0];
  check(Math.abs(blockLine.points[1][1]-blockLine.points[0][1]-1000)<1e-5,"Block insertion applies point and rotation to its actual geometry");
  (globalThis as typeof globalThis & {cadTestArtifacts:Record<string,string>}).cadTestArtifacts["room-symbols.dxf"]=encodeDxf(cadDocument).text;
  output.textContent=lines.join("\n")+`\nALL ${lines.length} CHECKS PASSED`;
}catch(error){output.textContent=lines.join("\n")+`\nFAIL: ${error instanceof Error?error.message:String(error)}`;}};
installBrowserChecks(button,output);
