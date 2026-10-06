import { createRoot } from "react-dom/client";
import { App } from "../src/App";
import "../src/ui/tokens.css";
import "../src/ui/workstation.css";
import "../src/ui/commands.css";
import "../src/ui/menu.css";
import "../src/ui/explorer.css";
import "../src/ui/inspector.css";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory } from "../src/state/history";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { serializeDocument, deserializeDocument } from "@agent-webcad/cad-document";
import { resolveDimension } from "../src/precision/dimensionGeometry";
import { parseDxf } from "../src/interop/dxfParser";
import { installBrowserChecks } from "./helpers/browserChecks";
import { click, find, input, text, physical, waitFor } from "./helpers/physicalInput";

createRoot(document.getElementById("root")!).render(<App/>);
const button=document.getElementById("run-diameter") as HTMLButtonElement,output=document.getElementById("diameter-result")!;
const state=()=>{const {revision:_,...doc}=cadDocument;return JSON.stringify([doc,cadHistory.getPastLabels(),cadHistory.getFutureLabels()]);};
const ready=()=>waitFor(()=>!!document.querySelector('[aria-label="Apply diameter dimension"]')&&!find("Apply diameter dimension").disabled);
async function select(id:string){await physical(document.querySelector(`[data-model-object-id="${id}"] .tree-label`)!);}
let download:Promise<string>|undefined;
const nativeClick=HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click=function(){if(this.download.endsWith(".dxf")){download=fetch(this.href).then(r=>r.text());return;}nativeClick.call(this);};
button.onclick=async()=>{
 button.disabled=true;const checks:string[]=[],check=(ok:unknown,label:string)=>{if(!ok)throw new Error(label);checks.push(`PASS: ${label}`);output.textContent=checks.join('\n');};
 try{
  await waitFor(()=>!!document.querySelector('canvas'));await click("New document");await click("2D");
  await dispatchCadCommand({type:"create-drawing",id:"circle",name:"Diameter source",drawing:"circle",params:{workPlane:"XY",center:[0,0,0],radius:10}});
  await click("Layers");await click("Model tree");await select("circle");await click("Add diameter dimension");await ready();
  const before=state(),revision=cadDocument.revision;
  check(document.querySelector('.dxf-review-dialog')?.textContent?.includes('does not drive sketch'),"The review distinguishes a measuring annotation from a sketch driver");
  check(!!document.querySelector('[alt="Diameter annotation preview"]')&&state()===before&&cadDocument.revision===revision,"The exact diameter line preview does not edit the document or History");
  await text("Diameter leader angle","bad angle");check(find("Apply diameter dimension").disabled&&document.querySelector('[aria-label="Diameter leader angle"]')?.getAttribute('aria-invalid')==='true',"Invalid angle stays editable and blocks old Apply");
  await text("Diameter leader angle","1.5707963267948966rad");await ready();await click("Cancel diameter dimension");check(state()===before,"Cancel leaves the source and annotation list unchanged");
  await click("Add diameter dimension");await text("Diameter leader angle","1.5707963267948966rad");await ready();const history=cadHistory.getPastLabels().length;
  await click("Apply diameter dimension");await waitFor(()=>Object.values(cadDocument.features).some(f=>f.type==='dimension'));
  const dimension=Object.values(cadDocument.features).find(f=>f.type==='dimension')!,id=dimension.output;
  check(Math.abs(Number(dimension.params.angle)-90)<1e-9&&resolveDimension(dimension.params)!.value===20,"Radian precision input creates a 20mm diameter at exactly 90 degrees");
  check(cadHistory.getPastLabels().length===history+1&&document.querySelector('.properties-content')?.textContent?.includes('Diameter'),"Apply selects the new diameter and records one Undo");
  const created=state();await click("Undo");check(!cadDocument.objects[id],"Undo removes the annotation while retaining its source");await click("Redo");check(state()===created,"Redo restores the same annotation identity and source link");
  await text("Dimension Leader angle","30");await input({type:"key",key:"Enter"});await waitFor(()=>cadDocument.features[dimension.id].params.angle===30);
  check(resolveDimension(cadDocument.features[dimension.id].params)!.value===20,"Repositioning the leader preserves the measured diameter");
  await select("circle");await text("Scale X","2");await input({type:"key",key:"Enter"});await waitFor(()=>cadDocument.objects.circle.transform?.scale[0]===2);
  await text("Scale Y","2");await input({type:"key",key:"Enter"});await waitFor(()=>resolveDimension(cadDocument.features[dimension.id].params)!.value===40);
  check(cadDocument.features[dimension.id].params.angle===30&&document.querySelector('.properties-content')?.textContent?.includes('Diameter source'),"Source scaling refreshes the diameter while preserving leader placement");
  const scaled=state();await click("Undo");await click("Undo");check(resolveDimension(cadDocument.features[dimension.id].params)!.value===20,"Source-edit Undo restores associated measurement");await click("Redo");await click("Redo");check(state()===scaled,"Source-edit Redo restores geometry and diameter together");
  const saved=serializeDocument(cadDocument);check(JSON.parse(saved).version===13&&JSON.stringify(deserializeDocument(saved))===JSON.stringify(cadDocument),"Portable v13 preserves diameter identity, angle and source association");
  await select(id);await physical(document.querySelector('.app-menu summary')!);await click("Export DXF…");await click("Download reviewed DXF");await waitFor(()=>!!download);const parsed=parseDxf(await download!);
  check(parsed.entities.some(e=>e.kind==='text'&&e.text.startsWith('Ø 40')),"Actual downloaded DXF contains the measured diameter label");
  check(state()===scaled,"Annotation output leaves geometry and History unchanged");
  await select("circle");await click("Add diameter dimension");await ready();await dispatchCadCommand({type:"set-layer-locked",layerId:"layer-default",locked:true});await waitFor(()=>find("Apply diameter dimension").disabled);
  const locked=state();check(document.querySelector('.dxf-review-dialog')?.textContent?.includes('unlocked'),"A locked source blocks review and explains the required editable target");await click("Cancel diameter dimension");check(state()===locked,"Locked review recovery does not leave a partial annotation");
  output.textContent=checks.join('\n')+`\nALL ${checks.length} CHECKS PASSED`;
 }catch(error){output.textContent=checks.join('\n')+`\nFAIL: ${error instanceof Error?error.stack:error}`;}
};installBrowserChecks(button,output);
