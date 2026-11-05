import {createRoot} from "react-dom/client";
import {App} from "../src/App";
import "../src/ui/tokens.css";import "../src/ui/workstation.css";import "../src/ui/commands.css";import "../src/ui/menu.css";import "../src/ui/explorer.css";import "../src/ui/inspector.css";
import fixture from "../../../output/projects/large-cafe/large-cafe.webcad.json";
import {cadDocument} from "../src/state/cadDocument";
import {openDocumentFile,saveDocumentToCache} from "../src/state/documentFile";
import {serializeDocument} from "@agent-webcad/cad-document";
import {cadHistory} from "../src/state/history";
import {isDocumentCommandPending} from "../src/state/documentCommandQueue";
import {collectArtboardExportItems} from "../src/export/exportModel";
import {artboardPngSvg,planArtboardPng} from "../src/export/artboardPng";
import {renderArtboardPngInWorker} from "../src/export/artboardPngRenderer";
import {planArtboardPdf} from "../src/export/artboardPdf";
import {installBrowserChecks} from "./helpers/browserChecks";
import {click,choose,physical,input,waitFor,pause,text} from "./helpers/physicalInput";
const key="cafe-reload",previous=sessionStorage.getItem(key);
if(!previous)await openDocumentFile(new File([JSON.stringify(fixture)],"large-cafe.webcad.json",{type:"application/json"}));
createRoot(document.getElementById("root")!).render(<App/>);
const button=document.getElementById("run") as HTMLButtonElement,output=document.getElementById("output")!;
const semantic=()=>{const{revision:_,...rest}=cadDocument;return JSON.stringify(rest);};
const base64=async(blob:Blob)=>{const b=new Uint8Array(await blob.arrayBuffer());let s="";for(let i=0;i<b.length;i+=16384)s+=String.fromCharCode(...b.subarray(i,i+16384));return btoa(s);};
const hash=async()=>[...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(semantic())))].map(v=>v.toString(16).padStart(2,"0")).join("");
async function artifactStore(value?:Record<string,string>){const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open("cafe-check-artifacts",1);r.onupgradeneeded=()=>r.result.createObjectStore("data");r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});try{return await new Promise<Record<string,string>>((resolve,reject)=>{const tx=db.transaction("data",value?"readwrite":"readonly"),store=tx.objectStore("data"),r=value?store.put(value,"current"):store.get("current");tx.oncomplete=()=>resolve(value??r.result);tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
let downloaded:Promise<Blob>|undefined;const nativeClick=HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click=function(){if(this.download.endsWith(".pdf")){downloaded=fetch(this.href).then(r=>r.blob());return;}nativeClick.call(this);};
button.onclick=async()=>{button.disabled=true;const saved=previous?JSON.parse(previous):undefined,checks:string[]=saved?.checks??[],check=(v:unknown,label:string)=>{if(!v)throw Error(label);checks.push(`PASS: ${label}`);output.textContent=checks.join("\n");};const artifacts:Record<string,string>=saved?.artifacts??{};
 try{
  await waitFor(()=>!!document.querySelector("canvas"));
  if(saved){check(await hash()===saved.hash,"Actual cache reload preserves all 2D sources, 20 asset definitions and 12 issued sheets");check(cadHistory.getPastLabels().length===0,"Reopened project starts with clean Undo history");sessionStorage.removeItem(key);(globalThis as any).cadTestArtifacts=await artifactStore();output.textContent=`${checks.join("\n")}\nALL ${checks.length} CHECKS PASSED`;return;}
  check(Object.keys(cadDocument.blocks??{}).length===20,"Twenty original furniture/equipment/service CAD blocks load in the real app");
  const boards=Object.values(cadDocument.artboards!).filter(b=>b.visible);check(boards.length===12&&boards.filter(b=>b.size[0]===594).length===5,"Twelve visible issued pages retain five A2 and seven A3 sizes");
  await click("2D");const filter=document.querySelector('[aria-label="Filter model"]');const box=filter?.getBoundingClientRect();if(!filter||!box||!filter.contains(document.elementFromPoint(box.left+box.width/2,box.top+box.height/2)))await click("Model tree");await text("Filter model","cafe-bar-front");await waitFor(()=>!!document.querySelector('[data-model-object-id="cafe-bar-front"] .tree-label'));await physical(document.querySelector('[data-model-object-id="cafe-bar-front"] .tree-label')!);
  const original=semantic(),y=Number((document.querySelector('[aria-label="Position Y"]') as HTMLInputElement).value),past=cadHistory.getPastLabels().length;
  await text("Position Y",String(y+150));await input({type:"key",key:"Enter"});await waitFor(()=>cadHistory.getPastLabels().length===past+1&&!isDocumentCommandPending());
  check(cadDocument.objects["cafe-bar-front"].transform!.translation[1]===150,"Native position input edits the actual bar source as one Undo");
  await click("Undo");check(semantic()===original,"Native Undo restores every source, asset and sheet");await click("Redo");check(cadDocument.objects["cafe-bar-front"].transform!.translation[1]===150,"Native Redo restores the bar edit");await click("Undo");await text("Filter model","");
  const scenes=boards.map(board=>({board:{...board,background:"#ffffff"},items:collectArtboardExportItems(board.id)}));const plan=planArtboardPdf(scenes,96);check(!("error" in plan)&&plan.totalPixels>28_000_000,"Real mixed-size cafe issue passes aggregate PDF preflight at 96dpi");
  const before=semantic(),history=cadHistory.getPastLabels().length;
  await physical(document.querySelector(".app-menu summary")!);await click("Export Artboards PDF…");await waitFor(()=>!!document.querySelector(".artboard-pdf-dialog"));
  await choose("PDF raster resolution",2);await waitFor(()=>!!document.querySelector(".artboard-pdf-dialog [role=alert]"));check(/memory|size|pixels/.test(document.querySelector(".artboard-pdf-dialog [role=alert]")!.textContent!),"150dpi issue gets an explicit memory/file/pixel diagnostic before allocation");
  await choose("PDF raster resolution",1);const end=Date.now()+60000;while(!document.querySelector('[data-pdf-preview-ready="true"]')){const error=document.querySelector(".artboard-pdf-dialog [role=alert]");if(error)throw Error(error.textContent!);if(Date.now()>end)throw Error("PDF rendering timed out");await pause();}
  check(document.querySelector('[data-pdf-preview-ready="true"]')!.getAttribute("data-pdf-pages")==="12","Native PDF dialog previews the complete twelve-page cafe issue");
  document.getElementById("checks")!.style.visibility="hidden";artifacts["viewport.png"]=(await(await input({type:"screenshot"})).json()).data;document.getElementById("checks")!.style.visibility="";
  await click("Download artboard PDF");await waitFor(()=>!!downloaded);const pdf=await downloaded!;artifacts["large-cafe.pdf"]=await base64(pdf);check(/\/Count 12\b/.test(atob(artifacts["large-cafe.pdf"])),"Downloaded PDF contains exactly twelve pages");
  check(semantic()===before&&cadHistory.getPastLabels().length===history,"PDF budget checks, preview and download do not modify source or Undo");
  for(const scene of scenes){const p=planArtboardPng(scene.board.size,1,scene.items);if("error" in p)throw Error(p.error);const render=await renderArtboardPngInWorker(artboardPngSvg(scene,p),p.width,p.height);const code=scene.board.id.split(":")[0].replace("cafe-","");artifacts[`${code}.png`]=await base64(render.blob);}
  check(Object.keys(artifacts).filter(n=>/^[A-Z]\d{3}\.png$/.test(n)).length===12,"Every issued sheet renders through the native SVG/Worker path at 96dpi");
  artifacts["large-cafe.webcad.json"]=serializeDocument(cadDocument);await artifactStore(artifacts);saveDocumentToCache();sessionStorage.setItem(key,JSON.stringify({hash:await hash(),checks}));location.reload();
 }catch(error){(globalThis as any).cadTestArtifacts=artifacts;output.textContent+=`\nFAIL: ${error instanceof Error?error.stack:String(error)}`;}
};installBrowserChecks(button,output);
