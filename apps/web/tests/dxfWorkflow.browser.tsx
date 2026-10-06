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
import { deserializeDocument, serializeDocument } from "@agent-webcad/cad-document";
import { parseDxf } from "../src/interop/dxfParser";
import { measureDocumentObject } from "../src/state/documentQuery";
import { installBrowserChecks } from "./helpers/browserChecks";
import { click, find, input, physical, waitFor } from "./helpers/physicalInput";
import { curvedDxfFixture } from "./helpers/dxfFixture";

createRoot(document.getElementById("root")!).render(<App/>);
const button=document.getElementById("run-dxf") as HTMLButtonElement,output=document.getElementById("dxf-result")!;
const state=()=>{const {revision:_,...document}=cadDocument;return JSON.stringify([document,cadHistory.getPastLabels(),cadHistory.getFutureLabels()]);};
let download:Promise<string>|undefined;
const nativeClick=HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click=function(){if(this.download.endsWith('.dxf')){download=fetch(this.href).then(r=>r.text());return;}nativeClick.call(this);};
async function file(text:string){await input({type:"fileInput",selector:'input[aria-label="Import DXF file"]',name:"drawing-test.dxf",base64:btoa(text)});}
async function menu(name:string){await physical(document.querySelector('.app-menu summary')!);await click(name);}
const ready=()=>waitFor(()=>!!document.querySelector<HTMLButtonElement>('[aria-label="Apply DXF import"]')&&!document.querySelector<HTMLButtonElement>('[aria-label="Apply DXF import"]')!.disabled,"Reviewed DXF import");
button.onclick=async()=>{
 const checks:string[]=[],check=(condition:unknown,label:string)=>{if(!condition)throw new Error(label);checks.push(`PASS: ${label}`);output.textContent=checks.join('\n');};button.disabled=true;
 try{
  await waitFor(()=>!!document.querySelector('canvas'));await click("New document");await click("2D");
  const before=state(),beforeRevision=cadDocument.revision;await menu("Import DXF…");await file(curvedDxfFixture(1));await ready();
  check(document.querySelector('.dxf-review-dialog')?.textContent?.includes("inches"),"File import review shows the source units before conversion");
  check(!!document.querySelector('[alt="DXF geometry preview"]')&&state()===before&&cadDocument.revision===beforeRevision,"Detached curve preview does not change geometry, revision or History");
  await click("Cancel DXF review");check(state()===before,"Cancel discards the import plan without inserting layers or objects");
  await file(curvedDxfFixture(1));await ready();await click("Apply DXF import");await waitFor(()=>cadDocument.rootObjects.length===1);
  const original=cadDocument.rootObjects[0],feature=Object.values(cadDocument.features).find(f=>f.output===original)!;
  check((feature.params.bulges as number[])[0]===1&&(feature.params.points as number[][])[1][0]===50.8,"Apply retains an exact inch semicircle as millimetre control points and bulge");
  check(cadHistory.getPastLabels().length===1,"Reviewed layer creation and curve insertion are one Undo");
  const imported=state();await click("Undo");check(cadDocument.rootObjects.length===0,"Undo removes the entire DXF import");await click("Redo");check(state()===imported,"Redo restores the imported topology and layers");
  await physical(document.getElementById('tools-tab-modify')!);await click("Explode");await waitFor(()=>!find("Apply contour edit").disabled);const beforeEdit=state();
  check(Object.values(cadDocument.features).filter(f=>f.type==='drawing').length===1,"Explode previews without replacing imported geometry");
  await click("Apply contour edit");await waitFor(()=>cadDocument.rootObjects.length===2);
  check(Object.values(cadDocument.features).some(f=>f.params.kind==='arc'&&Math.abs(Number(f.params.radius)-25.4)<1e-8),"Canvas workflow separates a true 25.4mm arc");
  const canvas=document.querySelector('canvas')!;canvas.focus();await input({type:"key",key:"a",modifiers:2});await click("Join");await waitFor(()=>!find("Apply contour edit").disabled);await click("Apply contour edit");await waitFor(()=>cadDocument.rootObjects.length===1);
  const joined=cadDocument.rootObjects[0],measure=await measureDocumentObject(cadDocument,joined);
  check(Math.abs(measure.length!-(50.8+25.4*Math.PI))<1e-7,"Rejoined curve has independently calculated semicircle-plus-chord length");
  check(state()!==beforeEdit&&JSON.stringify(deserializeDocument(serializeDocument(cadDocument)))===JSON.stringify(cadDocument),"Edited analytic geometry and topology survive portable save/reload");
  const beforeExport=state();await menu("Export DXF…");await click("Download reviewed DXF");await waitFor(()=>!!download);const exported=await download!;
  const parsed=parseDxf(exported);check(parsed.entities.length===1&&parsed.entities[0].kind==='polyline'&&parsed.entities[0].points.length===2,"Actual downloaded DXF uses two analytic control vertices instead of facets");
  check(state()===beforeExport&&exported.includes('42\n'),"DXF output keeps the bulge and does not edit the document");
  await file(exported);await ready();await click("Apply DXF import");await waitFor(()=>cadDocument.rootObjects.length===2);
  const reimported=await measureDocumentObject(cadDocument,cadDocument.rootObjects[1]);check(Math.abs(reimported.length!-measure.length!)<1e-7,"Downloaded file reimport preserves measured curvature and length");
  await click("Undo");await file(curvedDxfFixture());await ready();await dispatchCadCommand({type:"rename-object",objectId:joined,name:"Changed source"});await waitFor(()=>find("Apply DXF import").disabled);
  const stale=state();check(document.querySelector('.dxf-review-dialog')?.textContent?.includes('Document changed'),"A changed document blocks the previous reviewed import with recovery guidance");await click("Cancel DXF review");check(state()===stale,"Stale import rejection creates no partial document change");
  const extra="0\nLWPOLYLINE\n8\nUnsupported\n90\n2\n43\n5\n10\n0\n20\n0\n10\n1\n20\n0\n";
  await file(curvedDxfFixture(4,extra));await waitFor(()=>!!document.querySelector('.dxf-review-dialog'));
  check(find("Apply DXF import").disabled&&document.querySelector('[aria-label="DXF exclusions"]')?.textContent?.includes('width'),"Unsupported width is listed and requires explicit subset acceptance");
  await physical(document.querySelector('[aria-label="Accept DXF exclusions"]')!);await ready();await click("Cancel DXF review");
  check(state()===stale,"Accepting exclusions without Apply still leaves the document unchanged");
  output.textContent=checks.join('\n')+`\nALL ${checks.length} CHECKS PASSED`;
 }catch(error){output.textContent=checks.join('\n')+`\nFAIL: ${error instanceof Error?error.stack:error}`;}
};installBrowserChecks(button,output);
