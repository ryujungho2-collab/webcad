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
import { serializeDocument, type ExchangeFixture } from "@agent-webcad/cad-document";
import { openDocumentFile } from "../src/state/documentFile";
import { decodeFixture } from "../src/interop/fixtureAdapter";
import { getWorldDrawingGeometry } from "../src/precision/worldGeometry";
import { exchangeFixture } from "./helpers/exchangeFixture";
import { installBrowserChecks } from "./helpers/browserChecks";
import { click, find, input, physical, waitFor } from "./helpers/physicalInput";
createRoot(document.getElementById("root")!).render(<App/>);
const button=document.getElementById("run-fixture") as HTMLButtonElement, output=document.getElementById("fixture-result")!;
const state=()=>{const {revision:_,...doc}=cadDocument;return JSON.stringify([doc,cadHistory.getPastLabels(),cadHistory.getFutureLabels()]);};
const view=()=>JSON.stringify(cadDocument.modelViews);
let download:Promise<string>|undefined;
const nativeClick=HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click=function(){if(this.download.endsWith(".fixture.json")){download=fetch(this.href).then(r=>r.text());return;}nativeClick.call(this);};
async function file(fixture:ExchangeFixture|string){const text=typeof fixture==="string"?fixture:JSON.stringify(fixture);await input({type:"fileInput",selector:'input[aria-label="Import exchange fixture file"]',name:"exchange-test.fixture.json",base64:btoa(text)});}
async function menu(name:string){await physical(document.querySelector(".app-menu summary")!);await click(name);}
const review=()=>document.querySelector('[aria-label="Import Exchange fixture review"]');
const ready=()=>waitFor(()=>!!review()&&!find("Apply Exchange fixture import").disabled,"Fixture preview ready");
button.onclick=async()=>{
 const checks:string[]=[],check=(condition:unknown,label:string)=>{if(!condition)throw new Error(label);checks.push(`PASS: ${label}`);output.textContent=checks.join("\n");};button.disabled=true;
 try{
  await waitFor(()=>!!document.querySelector("canvas"));await click("New document");await click("2D");
  await dispatchCadCommand({type:"upsert-model-view",view:{id:"saved",name:"Saved",camera:{projection:"perspective",eye:[0,-100,100],target:[0,0,0],up:[0,0,1],near:0.1,far:10000,zoom:1,fov:45,aspect:1}}});
  const before=state(),savedViews=view(),h=cadHistory.getPastLabels().length;await menu("Import exchange fixture…");await file(exchangeFixture());await ready();
  check(review()?.textContent?.includes("inch → mm")&&review()?.textContent?.includes("source-survey")&&review()?.textContent?.includes("line-A →"),"Source units, document identity and fresh ID mapping are visible before Apply");
  check(!!document.querySelector('[alt="Exchange fixture geometry preview"]')&&state()===before,"Native file selection creates a detached geometry preview with no document or History mutation");
  await click("Cancel Exchange fixture review");check(state()===before,"Cancel discards the proposal and source receipt");
  await file(exchangeFixture());await ready();await click("Apply Exchange fixture import");await waitFor(()=>cadDocument.rootObjects.length===2);
  const receipt=Object.values(cadDocument.exchangeImports!)[0],lineId=receipt.mappings[0].objectId,rectangleId=receipt.mappings[1].objectId;
  const line=Object.values(cadDocument.features).find(f=>f.output===lineId)!;
  check(Math.abs((line.params.points as number[][])[1][1]-5130.8)<1e-8,"Apply produces independently expected inch/basis world coordinates");
  check(cadHistory.getPastLabels().length===h+1&&receipt.documentId==="source-survey","Geometry and source mapping publish as one History step");
  check(view()===savedViews,"Import preserves the saved camera collection");
  const imported=state();await click("Undo");check(cadDocument.rootObjects.length===0&&cadDocument.exchangeImports===undefined&&view()===savedViews,"Undo removes geometry and provenance together while preserving views");await click("Redo");check(state()===imported,"Redo restores exact geometry, source IDs and manifest");
  const fixture=exchangeFixture();fixture.assets=[{id:"texture",mediaType:"image/png",byteLength:100,sha256:"a".repeat(64)}];fixture.entities[1].assetIds=["texture"];fixture.entities.push({kind:"unsupported",sourceId:"wall",reason:"Unsupported wall."});
  await file(fixture);await waitFor(()=>!!review());check(find("Apply Exchange fixture import").disabled&&review()?.textContent?.includes("required asset bytes"),"Unsupported geometry and required asset exclusions block Apply until accepted");
  await physical(document.querySelector('[aria-label="Accept Exchange fixture exclusions"]')!);await ready();check(state()===imported,"Acknowledging losses alone leaves the live document unchanged");
  await click("Apply Exchange fixture import");await waitFor(()=>cadDocument.rootObjects.length===3&&!review());check(Object.values(cadDocument.exchangeImports!).some(r=>r.assets.length===1&&r.losses.length===3),"Accepted subset retains asset hash/size metadata and loss report");await click("Undo");
  await file(exchangeFixture());await ready();await dispatchCadCommand({type:"rename-object",objectId:lineId,name:"Changed line"});await waitFor(()=>find("Apply Exchange fixture import").disabled);const stale=state();check(review()?.textContent?.includes("Document changed"),"A stale reviewed proposal cannot be applied");await click("Cancel Exchange fixture review");check(state()===stale,"Stale cancellation creates no partial import");
  await dispatchCadCommand({type:"set-layer-locked",layerId:"layer-default",locked:true});const locked=state();await file(exchangeFixture());await waitFor(()=>!!review());await waitFor(()=>!!review()?.querySelector('[role="alert"]')||review()!.textContent!.includes("locked"));check(find("Apply Exchange fixture import").disabled&&state()===locked,"Locked target layer rejects preparation atomically");await click("Cancel Exchange fixture review");await dispatchCadCommand({type:"set-layer-locked",layerId:"layer-default",locked:false});
  const badBefore=state();await file('{"schema":"webcad.exchange.fixture","version":999}');await waitFor(()=>document.body.textContent!.includes("Invalid or unsupported exchange"));check(!review()&&state()===badBefore,"Fatal malformed fixture reports an error without an acknowledgeable partial preview");
  await dispatchCadCommand({type:"move-object",objectId:lineId,translation:[10,-20,5]});
  // Clear selection through the public UI so export reviews the whole supported document.
  document.querySelector<HTMLCanvasElement>("canvas")!.focus();await input({type:"key",key:"Escape"});
  const exportBefore=state();await menu("Export exchange fixture…");await waitFor(()=>!!document.querySelector('[aria-label="Export Exchange fixture review"]'));
  check(find("Download reviewed Exchange fixture").disabled,"Geometry-only export lists relationship losses and requires review");await physical(document.querySelector('[aria-label="Accept Exchange fixture exclusions"]')!);await click("Download reviewed Exchange fixture");await waitFor(()=>!!download);const text=await download!,exported=decodeFixture(text);
  check(exported.coordinates.unit==="mm"&&exported.entities.filter(e=>e.kind!=="unsupported").length===2&&state()===exportBefore,"Actual downloaded fixture uses canonical mm and leaves the document/History intact");
  await file(text);await waitFor(()=>!!review());await physical(document.querySelector('[aria-label="Accept Exchange fixture exclusions"]')!);await ready();await click("Apply Exchange fixture import");await waitFor(()=>cadDocument.rootObjects.length===4);
  const last=Object.values(cadDocument.exchangeImports!).at(-1)!;const newLine=last.mappings.find(m=>m.provenance.objectId==="line-A")!,newRectangle=last.mappings.find(m=>m.provenance.objectId==="rectangle-B")!;
  check(newLine.objectId!==lineId&&newRectangle.objectId!==rectangleId&&last.mappings.length===2,"Reimport adds fresh IDs while retaining original source identity tuples");
  const geometry=(id:string)=>getWorldDrawingGeometry(cadDocument.objects[id],Object.values(cadDocument.features).find(f=>f.output===id)!)!.points;
  check(JSON.stringify(geometry(newLine.objectId))===JSON.stringify(geometry(lineId))&&JSON.stringify(geometry(newRectangle.objectId))===JSON.stringify(geometry(rectangleId)),"Edited line and rectangle survive the downloaded fixture roundtrip exactly");
  const saved=serializeDocument(cadDocument),savedFields=JSON.parse(saved).document;delete savedFields.revision;await openDocumentFile(new File([saved],"fixture.webcad.json"));const reopened=JSON.parse(serializeDocument(cadDocument)).document;delete reopened.revision;check(JSON.stringify(reopened)===JSON.stringify(savedFields)&&view()===savedViews,"Public portable File Open retains receipts, asset losses and saved cameras");
  output.textContent=checks.join("\n")+`\nALL ${checks.length} CHECKS PASSED`;
 }catch(error){output.textContent=checks.join("\n")+`\nFAIL: ${error instanceof Error?error.stack:error}`;}
};installBrowserChecks(button,output);
