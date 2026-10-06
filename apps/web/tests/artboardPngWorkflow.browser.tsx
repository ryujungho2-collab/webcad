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
import { collectArtboardExportItems } from "../src/export/exportModel";
import { artboardPngSvg } from "../src/export/artboardPng";
import type { CadRasterAsset } from "@agent-webcad/cad-document";
import { installBrowserChecks } from "./helpers/browserChecks";

createRoot(document.getElementById("root")!).render(<App />);
const button = document.getElementById("run-artboard-png") as HTMLButtonElement, output = document.getElementById("artboard-png-result")!;
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 30));
const state = () => { const { revision: _, ...value } = cadDocument; return JSON.stringify([value, cadHistory.getPastLabels(), cadHistory.getFutureLabels()]); };
function find(name: string) { const element = Array.from(document.querySelectorAll<HTMLButtonElement>("#root button")).find(item => (item.getAttribute("aria-label") ?? item.textContent?.trim()) === name); if (!element) throw new Error(`Missing control: ${name}`); return element; }
async function input(action: Record<string, unknown>) { const run = new URLSearchParams(location.search).get("run"), response = await fetch(`/__browser_input?run=${run}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) }); if (!response.ok) throw new Error(await response.text()); return response; }
async function physical(element: Element) { element.scrollIntoView({ block: "center" }); await pause(); const rect = element.getBoundingClientRect(), x = rect.left + rect.width / 2, y = rect.top + rect.height / 2, hit = document.elementFromPoint(x, y); if (!element.contains(hit)) throw new Error(`Obscured control: ${element.outerHTML.slice(0,160)} by ${hit?.outerHTML.slice(0,160)}`); await input({ type: "mousePressed", x, y, button: "left", buttons: 1 }); await input({ type: "mouseReleased", x, y, button: "left", buttons: 0 }); await pause(); }
async function click(name: string) { const element = find(name); if (element.disabled) throw new Error(`Disabled control: ${name}`); await physical(element); }
async function text(label: string, value: string) { const field = document.querySelector<HTMLInputElement>(`[aria-label="${label}"]`); if (!field) throw new Error(`Missing field: ${label}`); await physical(field); await input({ type: "key", key: "a", modifiers: 2 }); await input({ type: "text", text: value }); await pause(); }
async function waitFor(check: () => boolean, label: string) { const until = Date.now() + 18000; while (!check()) { if (Date.now() > until) throw new Error(`Timed out waiting for ${label}: ${document.querySelector(".artboard-png-dialog")?.textContent ?? output.textContent}`); await pause(); } await pause(); }
async function makeAsset(): Promise<CadRasterAsset> {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 4;
  const context = canvas.getContext("2d")!, pixels = context.createImageData(4,4);
  for (let y=0;y<4;y++) for(let x=0;x<4;x++) { const i=(y*4+x)*4, center=x>=1&&x<=2&&y>=1&&y<=2; pixels.data.set(center?[200,80,40,255]:[20,40,220,255],i); }
  context.putImageData(pixels,0,0); const dataUrl=canvas.toDataURL("image/png"), binary=atob(dataUrl.slice(dataUrl.indexOf(",")+1)), bytes=Uint8Array.from(binary,char=>char.charCodeAt(0));
  const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)); const contentHash=Array.from(digest,value=>value.toString(16).padStart(2,"0")).join("");
  return {id:`asset-${contentHash}`,name:"png-fixture.png",mimeType:"image/png",width:4,height:4,byteLength:bytes.length,dataUrl,contentHash};
}
let downloaded: Promise<{ filename: string; blob: Blob }> | undefined;
const nativeAnchorClick = HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click = function() { if (this.download.endsWith(".png")) { const filename=this.download; downloaded=fetch(this.href).then(response=>response.blob()).then(blob=>({filename,blob})); return; } nativeAnchorClick.call(this); };
async function openPngExport() { const fileMenu=document.querySelector<HTMLSummaryElement>(".app-menu summary"); if(!fileMenu)throw new Error("Missing File menu"); await physical(fileMenu); await click("Export “Artboard 1” PNG…"); await waitFor(()=>Boolean(document.querySelector(".artboard-png-dialog")),"PNG export dialog"); }
async function waitPreview() { await waitFor(()=>Boolean(document.querySelector('[data-png-preview-ready="true"]'))&&!find("Download artboard PNG").disabled,"current rendered preview"); }
function pixel(image: ImageData, x: number, y: number) { const index=(y*image.width+x)*4; return Array.from(image.data.slice(index,index+4)); }

button.onclick = async () => {
  button.disabled=true; const checks:string[]=[], metrics:Record<string,number>={};
  const check=(condition:unknown,label:string)=>{if(!condition)throw new Error(label);checks.push(`PASS: ${label}`);output.textContent=checks.join("\n");};
  try {
    await waitFor(()=>Boolean(document.querySelector("#root canvas")),"viewport");
    await click("New document"); await click("Artboards"); await click("New artboard");
    await waitFor(()=>Object.keys(cadDocument.artboards??{}).length===1,"new artboard");
    const board=Object.values(cadDocument.artboards!)[0];
    check(board.name==="Artboard 1"&&board.visible,"New artboard is active and eligible for a board-scoped export");
    check((await dispatchCadCommand({type:"update-artboard",artboardId:board.id,size:[25.4,25.4]})).ok,"A small board is prepared for exact decoded-pixel checks");
    const asset=await makeAsset();
    check((await dispatchCadCommand({type:"insert-image",id:"png-image",asset,workPlane:"XY",center:[12.7,12.7,0],width:12.7,height:12.7})).ok,"The fixture raster is inserted as an editable image placement");
    check((await dispatchCadCommand({type:"update-image",objectId:"png-image",crop:{x:.25,y:.25,width:.5,height:.5},mask:"ellipse",opacity:.5,adjustments:{brightness:0,contrast:0,saturation:100}})).ok,"Crop, ellipse mask, opacity, and color adjustment remain placement properties");
    const vectorResult=await dispatchCadCommand({type:"create-drawing",id:"png-vector-top",name:"Green overlay",drawing:"rectangle",params:{workPlane:"XY",points:[[8,13,0],[19,13,0],[19,20,0],[8,20,0]]}});
    check(vectorResult.ok,`A later vector object is added above the raster in document order${vectorResult.ok?"":`: ${vectorResult.reason}`}`);
    check((await dispatchCadCommand({type:"set-vector-style",objectId:"png-vector-top",style:{stroke:"#00ff00",fill:"#00ff00",opacity:1,strokeWidth:.25}})).ok,"The later vector fill is styled without replacing its CAD geometry");
    const svgScene={board:{id:board.id,name:board.name,origin:board.origin,size:board.size,workPlane:board.workPlane,background:board.background},items:collectArtboardExportItems(board.id)};
    const svgUrl=URL.createObjectURL(new Blob([artboardPngSvg(svgScene,{width:96,height:96})],{type:"image/svg+xml;charset=utf-8"})),svgImage=new Image();svgImage.src=svgUrl;
    let svgDecoded=false;try{await svgImage.decode();svgDecoded=svgImage.naturalWidth===96&&svgImage.naturalHeight===96;}catch{}URL.revokeObjectURL(svgUrl);
    check(svgDecoded,"The vector/raster artboard SVG decodes at its declared output dimensions before worker composition");
    const before=state(),menuExportStarted=performance.now();
    await openPngExport();
    await waitPreview();
    const dimensions=document.querySelector('[aria-label="PNG output dimensions"]')?.textContent;
    check(dimensions==="96 × 96 px","Scale preview reports exact 96 dpi pixel dimensions for the 25.4 mm artboard");
    check(document.querySelector('[data-png-preview-ready="true"]')!==null&&state()===before,"Detached worker preview leaves document, History, and source image unchanged");

    await text("PNG export scale","2"); await waitFor(()=>document.querySelector('[aria-label="PNG output dimensions"]')?.textContent==="192 × 192 px","updated scale dimensions"); await waitPreview();
    check(document.querySelector('[data-png-preview-ready="true"]')!==null,"Changing scale cancels the prior render and produces a current preview");
    await text("PNG export scale","32");
    await waitFor(()=>Boolean(document.querySelector('.artboard-png-error[role="alert"]')),"invalid scale recovery message");
    check(find("Download artboard PNG").disabled&&state()===before,"Oversized scale blocks download without allocating output pixels or changing the document");
    await text("PNG export scale","1"); await waitPreview();
    check(document.querySelector('[aria-label="PNG output dimensions"]')?.textContent==="96 × 96 px"&&state()===before,"Correcting the scale restores an applicable preview without losing the board context");
    await click("Cancel PNG export"); await waitFor(()=>!document.querySelector(".artboard-png-dialog"),"cancelled preview cleanup");
    check(state()===before,"Cancel discards the rendered preview and leaves document and History unchanged");

    await openPngExport(); await waitPreview();
    const transparent=document.querySelector<HTMLInputElement>('[aria-label="Transparent artboard background"]')!;
    await physical(transparent); await waitPreview();
    const previewImage=document.querySelector<HTMLImageElement>(".artboard-png-preview img")!; await previewImage.decode();
    const sampleCanvas=document.createElement("canvas");sampleCanvas.width=previewImage.naturalWidth;sampleCanvas.height=previewImage.naturalHeight;
    const sampleContext=sampleCanvas.getContext("2d",{willReadFrequently:true})!;sampleContext.drawImage(previewImage,0,0);
    const previewPixels=sampleContext.getImageData(0,0,96,96);
    check(pixel(previewPixels,48,60)[0]>245&&[55,56,57,58,59,60,61,62,63].includes(pixel(previewPixels,48,60)[1])&&pixel(previewPixels,48,60)[2]<8&&[127,128].includes(pixel(previewPixels,48,60)[3]),"Rendered PNG preview composes cropped and color-adjusted source pixels with placement opacity");
    check(pixel(previewPixels,48,31)[1]>245&&pixel(previewPixels,48,31)[0]<8,"Vector geometry is composited above an earlier raster placement");
    check(pixel(previewPixels,5,5)[3]===0&&pixel(previewPixels,25,25)[3]===0,`Transparent output preserves board alpha and ellipse-mask corner transparency (outside=${pixel(previewPixels,5,5).join(",")}; mask=${pixel(previewPixels,25,25).join(",")})`);
    const ready=document.querySelector<HTMLElement>('[data-png-preview-ready="true"]')!;
    metrics.previewDecodeMs=Number(ready.dataset.pngDecodeMs);metrics.previewRenderMs=Number(ready.dataset.pngRenderMs);metrics.previewElapsedMs=Number(ready.dataset.pngElapsedMs);metrics.pngBytes=Number(ready.dataset.pngBytes);metrics.estimatedPeakBytes=Number(ready.dataset.pngEstimatedMemoryBytes);metrics.outputPixels=96*96;metrics.endToEndMs=performance.now()-menuExportStarted;
    await click("Download artboard PNG");
    const result=await downloaded;if(!result)throw new Error("PNG download was not created");
    check(result.filename.endsWith("Artboard-1.png")&&result.blob.type==="image/png"&&result.blob.size>24,"Download applies the reviewed preview as a named PNG file");
    const bytes=new Uint8Array(await result.blob.slice(0,8).arrayBuffer());check(Array.from(bytes).join(",")==="137,80,78,71,13,10,26,10","Downloaded bytes have the PNG signature");
    const bitmap=await createImageBitmap(result.blob),decoded=document.createElement("canvas");decoded.width=bitmap.width;decoded.height=bitmap.height;decoded.getContext("2d",{willReadFrequently:true})!.drawImage(bitmap,0,0);bitmap.close();
    const outputPixels=decoded.getContext("2d",{willReadFrequently:true})!.getImageData(0,0,decoded.width,decoded.height);
    check(decoded.width===96&&decoded.height===96&&[127,128].includes(pixel(outputPixels,48,60)[3])&&pixel(outputPixels,5,5)[3]===0,"Downloaded PNG decodes to reviewed dimensions with fractional-alpha and transparent pixels intact");
    check(pixel(outputPixels,48,60).join(",")===pixel(previewPixels,48,60).join(",")&&pixel(outputPixels,48,31).join(",")===pixel(previewPixels,48,31).join(","),"Downloaded pixels exactly match the reviewed raster/vector composite");
    check(state()===before,"Export does not publish an edit or add a History entry");

    check((await dispatchCadCommand({type:"update-artboard",artboardId:board.id,size:[210,148.5]})).ok,"A medium page fixture is prepared to measure practical output allocation");
    const mediumState=state(),mediumStartedAt=performance.now();await openPngExport();await waitPreview();
    const mediumReady=document.querySelector<HTMLElement>('[data-png-preview-ready="true"]')!;
    check(document.querySelector('[aria-label="PNG output dimensions"]')?.textContent==="794 × 561 px","The medium page reports exact 96 dpi output dimensions");
    metrics.mediumDecodeMs=Number(mediumReady.dataset.pngDecodeMs);metrics.mediumRenderMs=Number(mediumReady.dataset.pngRenderMs);metrics.mediumElapsedMs=Number(mediumReady.dataset.pngElapsedMs);metrics.mediumPngBytes=Number(mediumReady.dataset.pngBytes);metrics.mediumEstimatedPeakBytes=Number(mediumReady.dataset.pngEstimatedMemoryBytes);metrics.mediumPixels=794*561;metrics.mediumEndToEndMs=performance.now()-mediumStartedAt;
    await click("Download artboard PNG");const mediumDownload=await downloaded;
    if(!mediumDownload)throw new Error("Medium PNG preview did not produce a download");
    const mediumBitmap=await createImageBitmap(mediumDownload.blob);check(mediumBitmap.width===794&&mediumBitmap.height===561&&mediumDownload.blob.type==="image/png","Medium fixture download retains the reviewed PNG dimensions and encoding");mediumBitmap.close();
    const afterMedium=state();await openPngExport();await waitPreview();await click("Cancel PNG export");
    check(state()===afterMedium&&state()!==before,"Medium export preview and Cancel leave its existing document state untouched");
    (globalThis as typeof globalThis&{cadTestMetrics?:unknown}).cadTestMetrics=metrics;
    output.textContent=checks.join("\n")+`\nALL ${checks.length} CHECKS PASSED`;
  } catch(error) { output.textContent=checks.join("\n")+`\nFAIL: ${error instanceof Error?error.stack:error}`; }
};
installBrowserChecks(button,output);
