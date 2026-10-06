import { createRoot } from "react-dom/client";
import { App } from "../src/App";
import "../src/ui/tokens.css";
import "../src/ui/workstation.css";
import "../src/ui/commands.css";
import "../src/ui/menu.css";
import "../src/ui/explorer.css";
import "../src/ui/inspector.css";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory, undoDocument, redoDocument } from "../src/state/history";
import { isDocumentCommandPending } from "../src/state/documentCommandQueue";
import { DOCUMENT_CACHE_KEY } from "../src/state/documentRecovery";
import { deserializeDocument, serializeDocument } from "@agent-webcad/cad-document";
import { encodeSvg } from "../src/export/svgWriter";
import { collectArtboardExportDrawings, collectArtboardExportImages } from "../src/export/exportModel";
import { getObjectWorldBounds } from "../src/precision/worldBounds";
import { installBrowserChecks } from "./helpers/browserChecks";

createRoot(document.getElementById("root")!).render(<App />);
const button = document.getElementById("run-images") as HTMLButtonElement, output = document.getElementById("images-result")!;
const state = () => { const { revision: _, ...value } = cadDocument; return JSON.stringify(value); };
const completeState = () => JSON.stringify([cadDocument, cadHistory.getPastLabels(), cadHistory.getFutureLabels()]);
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 30));
function find(name:string) { const item=Array.from(document.querySelectorAll<HTMLButtonElement>("#root button")).find(element=>(element.getAttribute("aria-label")??element.textContent?.trim())===name);if(!item)throw new Error(`Missing control: ${name}`);return item; }
function field(name:string){return document.querySelector<HTMLInputElement>(`[aria-label="${name}"]`)!;}
function review(){return document.querySelector<HTMLElement>('[aria-label="Edit image size and crop review"]');}
async function input(action:Record<string,unknown>){const run=new URLSearchParams(location.search).get("run"),response=await fetch(`/__browser_input?run=${run}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(action)});if(!response.ok)throw new Error(await response.text());return response;}
async function physical(element:Element,modifiers=0){element.scrollIntoView({block:"center"});await pause();const box=element.getBoundingClientRect(),x=box.left+box.width/2,y=box.top+box.height/2,hit=document.elementFromPoint(x,y);if(!element.contains(hit))throw new Error(`Obscured control: ${element.outerHTML.slice(0,180)} by=${hit?.outerHTML.slice(0,180)} rect=${JSON.stringify({x:box.x,y:box.y,width:box.width,height:box.height})}`);await input({type:"mousePressed",x,y,button:"left",buttons:1,modifiers});await input({type:"mouseReleased",x,y,button:"left",buttons:0,modifiers});await pause();}
async function drag(element:Element,dx:number,dy:number){const box=element.getBoundingClientRect(),x=box.left+box.width/2,y=box.top+box.height/2;if(!element.contains(document.elementFromPoint(x,y)))throw new Error(`Crop handle is obscured: ${element.outerHTML}`);await input({type:"mousePressed",x,y,button:"left",buttons:1});await input({type:"mouseMoved",x:x+dx,y:y+dy,button:"left",buttons:1});await input({type:"mouseReleased",x:x+dx,y:y+dy,button:"left",buttons:0});await pause();}
async function click(name:string){const element=find(name);if(element.disabled)throw new Error(`Disabled control: ${name}`);await physical(element);await waitFor(()=>!isDocumentCommandPending());}
async function text(name:string,value:string){await physical(field(name));await input({type:"key",key:"a",modifiers:2});await input(value?{type:"text",text:value}:{type:"key",key:"Backspace"});await pause();}
async function enter(){await input({type:"key",key:"Enter"});await waitFor(()=>!isDocumentCommandPending());}
async function selectObjectTree(id:string,modifiers=0){const row=document.querySelector(`[data-model-object-id="${id}"] .tree-label`);if(!row)throw new Error(`Missing model row for ${id}`);await physical(row,modifiers);}
async function waitFor(check:()=>boolean){const end=Date.now()+18000;while(!check()){if(Date.now()>end)throw new Error(`Image workflow timed out: ${document.querySelector('[data-testid="artboards-panel"]')?.textContent??document.querySelector('[aria-label="Edit image size and crop review"]')?.textContent??document.querySelector('.cad-tool-readout')?.textContent??document.body.innerText.slice(-700)}`);await pause();}await pause();}
async function ready(){await waitFor(()=>review()?.dataset.commandStage==="ready"&&!find("Apply image edit").disabled);}
async function upload(){const run=new URLSearchParams(location.search).get("run"),canvas=document.createElement("canvas");canvas.width=canvas.height=128;const context=canvas.getContext("2d")!,pixels=context.createImageData(128,128);for(let i=0;i<pixels.data.length;i+=4){const n=i/4;pixels.data[i]=(n*73+11)&255;pixels.data[i+1]=(n*37+83)&255;pixels.data[i+2]=(n*19+151)&255;pixels.data[i+3]=255;}context.putImageData(pixels,0,0);const base64=canvas.toDataURL("image/png").split(",")[1];const response=await fetch(`/__browser_input?run=${run}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"fileInput",selector:'input[aria-label="Import image file"]',name:"image-test.png",base64})});if(!response.ok)throw new Error(await response.text());}
async function sampleCanvasColor(){const response=await input({type:"screenshot"}),payload=await response.json() as {data:string},image=new Image();image.src=payload.data.startsWith("data:")?payload.data:`data:image/png;base64,${payload.data}`;await image.decode();const target=document.createElement("canvas"),context=target.getContext("2d")!,rect=document.querySelector<HTMLCanvasElement>("#root canvas")!.getBoundingClientRect(),size=24,x=Math.max(0,Math.min(image.naturalWidth-size,Math.round(rect.left+rect.width*.36)-size/2)),y=Math.max(0,Math.min(image.naturalHeight-size,Math.round(rect.top+rect.height*.32)-size/2));target.width=target.height=size;context.drawImage(image,x,y,size,size,0,0,size,size);const pixels=context.getImageData(0,0,size,size).data,sum=[0,0,0];for(let i=0;i<pixels.length;i+=4)for(let channel=0;channel<3;channel++)sum[channel]+=pixels[i+channel];return sum.map(channel=>channel/(size*size));}
const nativeAnchorClick=HTMLAnchorElement.prototype.click;let exported:Promise<{filename:string;text:string}>|undefined;
HTMLAnchorElement.prototype.click=function(){if(this.download.endsWith(".svg")){const filename=this.download;exported=fetch(this.href).then(response=>response.text()).then(text=>({filename,text}));return;}nativeAnchorClick.call(this);};
const reloadKey="g3-image-reload";
button.onclick=async()=>{
  button.disabled=true;const saved=sessionStorage.getItem(reloadKey),restart=saved?JSON.parse(saved) as {checks:string[];expected:string;metrics:Record<string,number>}:undefined,checks=restart?.checks??[];
  const check=(condition:unknown,label:string)=>{if(!condition)throw new Error(label);checks.push(`PASS: ${label}`);output.textContent=checks.join("\n");};
  try{
    await waitFor(()=>!!document.querySelector("#root canvas"));
    if(restart){
      (globalThis as typeof globalThis&{cadTestMetrics?:unknown}).cadTestMetrics=restart.metrics;
      const actual=JSON.parse(state()) as Record<string,unknown>,wanted=JSON.parse(restart.expected) as Record<string,unknown>,mismatch=[...new Set([...Object.keys(actual),...Object.keys(wanted)])].filter(key=>JSON.stringify(actual[key])!==JSON.stringify(wanted[key])).map(key=>`${key}: ${JSON.stringify(wanted[key])?.slice(0,240)} -> ${JSON.stringify(actual[key])?.slice(0,240)}`);
      check(!mismatch.length,`Reload rehydrates both image placements, shared source bytes, crop, transforms, and artboard${mismatch.length?` · ${mismatch.join(" | ")}`:""}`);
      check(cadHistory.getPastLabels().length===0&&JSON.parse(localStorage.getItem(DOCUMENT_CACHE_KEY)!).format==="agent-webcad-recovery","Recovery reload starts a clean history and keeps raster bytes out of duplicated checkpoint metadata");
      const portable=serializeDocument(cadDocument),roundTrip=deserializeDocument(portable);
       const adjusted=Object.values(roundTrip.features).find(feature=>feature.type==="image"&&feature.params.adjustments?.brightness===20);
       check(JSON.parse(portable).version===11&&roundTrip.rasterAssets?.[Object.keys(cadDocument.rasterAssets!)[0]]?.dataUrl===Object.values(cadDocument.rasterAssets!)[0].dataUrl&&Object.values(roundTrip.features).some(feature=>feature.type==="image"&&feature.params.mask==="ellipse"&&feature.params.opacity===.4)&&adjusted?.params.adjustments?.contrast===25&&adjusted.params.adjustments.saturation===50,"Portable v11 save keeps image bytes self-contained and round-trips mask, opacity, and color adjustments");
      sessionStorage.removeItem(reloadKey);output.textContent=checks.join("\n")+`\nALL ${checks.length} CHECKS PASSED`;return;
    }
    await click("New document");
    const fileMenu=document.querySelector<HTMLSummaryElement>(".app-menu summary")!;await physical(fileMenu);await click("Import Image…");output.textContent="Import image chooser ready";await upload();output.textContent="Image file supplied; waiting for placement";
    await waitFor(()=>Object.values(cadDocument.features).some(feature=>feature.type==="image")&&!!field("Image width"));
    const imageFeature=Object.values(cadDocument.features).find(feature=>feature.type==="image")!,imageId=imageFeature.output,assetId=String(imageFeature.params.assetId),source=structuredClone(cadDocument.rasterAssets![assetId]);
    const importMeasure=performance.getEntriesByName("agent-webcad:image-import").at(-1) as PerformanceMeasure|undefined;
    const metrics:Record<string,number>={sourceBytes:source.byteLength,sourcePixels:source.width*source.height,decodedRgbaBytes:source.width*source.height*4,importDurationMs:importMeasure?.duration??0,decodeDurationMs:Number((importMeasure?.detail as {decodeMs?:number}|undefined)?.decodeMs??0)};
    check(cadDocument.objects[imageId].name==="image-test"&&cadDocument.rootObjects.includes(imageId)&&imageFeature.params.workPlane==="XY","File menu import places a decoded raster on the active work plane and selects its image node");
    const initial=state(),historyCount=cadHistory.getPastLabels().length;
    await text("Image width","");
    check(field("Image width").getAttribute("aria-invalid")==="true"&&find("Apply image edit").disabled&&review()?.dataset.commandStage==="invalid"&&state()===initial,"Invalid size explains the range and disables the stale Apply plan without mutating the document");
    await text("Image width","120mm");await text("Image height","60mm");await text("Crop left","10");await text("Crop top","15");await text("Crop right","20");await text("Crop bottom","5");const inputReadyAt=performance.now();await ready();metrics.cropPreviewFeedbackMs=performance.now()-inputReadyAt;
    check(state()===initial&&cadHistory.getPastLabels().length===historyCount&&review()?.textContent?.includes("Images"),"Precise size and crop are detached, reviewed inputs with an explicit image impact");
    if(new URLSearchParams(location.search).get("artifacts")==="1"){const shot=await input({type:"screenshot"}),data=await shot.json() as {data:string};(globalThis as typeof globalThis&{cadTestArtifacts?:Record<string,string>}).cadTestArtifacts={"cad-image-review.png":data.data};}
    const applyStartedAt=performance.now();await click("Apply image edit");metrics.cropApplyFeedbackMs=performance.now()-applyStartedAt;
    let applied=state();
    check(cadDocument.features[`feature-${imageId}`].params.width===120&&cadDocument.features[`feature-${imageId}`].params.height===60&&JSON.stringify(cadDocument.features[`feature-${imageId}`].params.crop)===JSON.stringify({x:.1,y:.15,width:.7,height:.8})&&JSON.stringify(cadDocument.rasterAssets![assetId])===JSON.stringify(source),"Apply commits crop and exact dimensions while preserving original embedded pixels");
    check(cadHistory.getPastLabels().length===historyCount+1,"Image import and image edit each create one undoable document transaction");
    await text("Image width","140mm");await ready();const beforeCancel=completeState();await click("Cancel image edit");
    check(completeState()===beforeCancel&&field("Image width").value==="120"&&state()===applied,"Cancel restores the exact saved size and crop without adding history");
    await click("Undo");check(cadDocument.objects[imageId]&&cadDocument.features[`feature-${imageId}`].params.width===100&&cadDocument.rasterAssets?.[assetId],"Undo restores the full-source image frame and its original dimensions");
    await click("Redo");check(state()===applied&&field("Image width").value==="120","Redo restores placement identity, source bytes, and inspector values");

    const handleHistoryStart=cadHistory.getPastLabels().length,handleState=state(),rightInsetBefore=Number(field("Crop right").value);
    await click("Edit crop on canvas");
    await waitFor(()=>Boolean(document.querySelector('[aria-label="Image crop handles"] [data-crop-handle="right"]')));
    const cropOverlay=document.querySelector<SVGSVGElement>('[aria-label="Image crop handles"]')!,rightHandle=cropOverlay.querySelector('[data-crop-handle="right"]')!;
    check(find("Edit crop on canvas").getAttribute("aria-pressed")==="true"&&cropOverlay.querySelectorAll("[data-crop-boundary]").length===1&&cropOverlay.querySelectorAll("[data-crop-source-outline]").length===1,"Crop mode reveals the full source frame and marks the current crop boundary separately");
    const cropHandleBox=rightHandle.getBoundingClientRect(),cropCanvasBox=document.querySelector("#root canvas")!.getBoundingClientRect(),cropPosition=cadDocument.objects[imageId].transform?.translation;
    check(cropHandleBox.right>=cropCanvasBox.left&&cropHandleBox.left<=cropCanvasBox.right&&cropHandleBox.bottom>=cropCanvasBox.top&&cropHandleBox.top<=cropCanvasBox.bottom,`Crop boundary projects into the visible canvas (handle=${Math.round(cropHandleBox.left)},${Math.round(cropHandleBox.top)} canvas=${Math.round(cropCanvasBox.left)},${Math.round(cropCanvasBox.top)},${Math.round(cropCanvasBox.width)}x${Math.round(cropCanvasBox.height)} translation=${JSON.stringify(cropPosition)})`);
    const canvasCropPreviewStarted=performance.now();await drag(rightHandle,-18,0);await ready();metrics.canvasCropPreviewFeedbackMs=performance.now()-canvasCropPreviewStarted;
    const rightInsetAfter=Number(field("Crop right").value);
    check(rightInsetAfter>rightInsetBefore&&state()===handleState&&find("Apply image edit").disabled===false,"Dragging the right crop edge updates the same precise inset draft while the saved document stays unchanged");
    const canvasCropApplyStarted=performance.now();await click("Apply image edit");metrics.canvasCropApplyFeedbackMs=performance.now()-canvasCropApplyStarted;
    const committedCrop=cadDocument.features[`feature-${imageId}`].params.crop,committedAsset=cadDocument.rasterAssets?.[assetId];
    check(committedCrop.width<.7&&committedCrop.x===.1&&committedAsset?.contentHash===source.contentHash&&cadHistory.getPastLabels().length===handleHistoryStart+1,`Crop handle Apply changes only normalized placement crop, preserves source identity, and commits once (crop=${JSON.stringify(committedCrop)} hash=${committedAsset?.contentHash??"missing"}/${source.contentHash} history=${cadHistory.getPastLabels().length}/${handleHistoryStart+1})`);
    const afterCanvasCrop=state();await click("Undo");check(state()===handleState,"Undo restores the previous crop after direct canvas editing");await click("Redo");check(state()===afterCanvasCrop,"Redo restores the exact crop handle result");applied=afterCanvasCrop;
    const aspectLock=document.querySelector<HTMLInputElement>('[aria-label="Keep image aspect ratio"]')!;
    await physical(aspectLock);await text("Image width","140mm");
    check(field("Image height").value==="70","Image size keeps its current width-to-height ratio when the lock is enabled");
    await ready();await click("Apply image edit");
    check(cadDocument.features[`feature-${imageId}`].params.width===140&&cadDocument.features[`feature-${imageId}`].params.height===70,"Aspect-locked exact size is applied without changing the crop or source bytes");

    const historyBeforeDuplicate=cadHistory.getPastLabels().length,duplicateStarted=performance.now();await click("Duplicate");
    await waitFor(()=>Object.values(cadDocument.features).filter(feature=>feature.type==="image").length===2);
    metrics.duplicateFeedbackMs=performance.now()-duplicateStarted;
    const copyId=Object.values(cadDocument.features).find(feature=>feature.type==="image"&&feature.output!==imageId)!.output;
    const copyFeature=Object.values(cadDocument.features).find(feature=>feature.type==="image"&&feature.output===copyId)!;
    check(copyId!==imageId&&copyFeature.id!==imageFeature.id&&copyFeature.params.assetId===assetId&&Object.keys(cadDocument.rasterAssets??{}).length===1,"Duplicate creates an independently addressable image placement that shares immutable source bytes");
    check(cadHistory.getPastLabels().length===historyBeforeDuplicate+1,"Duplicate placement is one undoable document transaction");

    const transformStarted=performance.now();await text("Position X","250");await enter();
    await text("Rotation Z","35");await enter();metrics.transformFeedbackMs=performance.now()-transformStarted;
    check(cadDocument.objects[copyId].transform?.translation[0]===250&&Math.abs(cadDocument.objects[copyId].transform?.rotation[2]!-35)<1e-8&&cadDocument.objects[imageId].transform?.rotation[2]===0,"Exact placement move and rotation affect only the selected duplicate");

    await selectObjectTree(imageId);await selectObjectTree(copyId,2);await physical(document.getElementById("tools-tab-modify")!);
    const alignButton=document.querySelector<HTMLButtonElement>('#root button[aria-label="Align L"], #root button[title*="Align left"]');
    if(!alignButton)throw new Error("Image selection did not reveal the shared Align Left command.");
    const alignStarted=performance.now();await physical(alignButton);await waitFor(()=>!isDocumentCommandPending());metrics.alignFeedbackMs=performance.now()-alignStarted;
    const sourceBounds=getObjectWorldBounds(cadDocument,imageId),copyBounds=getObjectWorldBounds(cadDocument,copyId);
    check(!!sourceBounds&&!!copyBounds&&Math.abs(sourceBounds.min[0]-copyBounds.min[0])<1e-7,"Align Left uses each image's transformed frame bounds and retains both selections");
    const aligned=state();await click("Undo");check(state()!==aligned&&!!cadDocument.objects[copyId],"Undo restores the pre-alignment placement while retaining the duplicate");await click("Redo");check(state()===aligned,"Redo restores the aligned image placements");

    await selectObjectTree(imageId);
    const mask=document.querySelector<HTMLSelectElement>('[aria-label="Image mask"]')!;
    await physical(mask);await input({type:"key",key:"End"});await input({type:"key",key:"Enter"});const maskPreviewStarted=performance.now();await ready();metrics.maskPreviewFeedbackMs=performance.now()-maskPreviewStarted;
    const beforeMaskCancel=completeState();
    check(mask.value==="ellipse"&&(cadDocument.features[`feature-${imageId}`].params.mask??"rect")==="rect"&&state()===aligned,`Ellipse mask previews on the canvas without changing source, saved mask, or history (ui=${mask.value}, saved=${String(cadDocument.features[`feature-${imageId}`].params.mask)}, unchanged=${state()===aligned})`);
    await click("Cancel image edit");
    check(completeState()===beforeMaskCancel&&mask.value==="rect","Cancel restores the saved rectangular mask with no document mutation");
    await physical(mask);await input({type:"key",key:"End"});await input({type:"key",key:"Enter"});await ready();const maskApplyStarted=performance.now();await click("Apply image edit");metrics.maskApplyFeedbackMs=performance.now()-maskApplyStarted;
    check(cadDocument.features[`feature-${imageId}`].params.mask==="ellipse"&&(cadDocument.features[`feature-${copyId}`].params.mask??"rect")==="rect","Ellipse mask applies to one image placement without changing its duplicate");

    const maskApplied=state();
    await text("Image opacity","20");const opacityPreviewStarted=performance.now();await ready();metrics.opacityPreviewFeedbackMs=performance.now()-opacityPreviewStarted;
    check(state()===maskApplied&&(cadDocument.features[`feature-${imageId}`].params.opacity??1)===1,`Opacity preview keeps the saved placement unchanged while a reviewed command is ready (state=${state()===maskApplied}, saved=${String(cadDocument.features[`feature-${imageId}`].params.opacity)}, field=${field("Image opacity").value}, stage=${review()?.dataset.commandStage})`);
    await click("Cancel image edit");
    check(state()===maskApplied&&field("Image opacity").value==="100"&&(cadDocument.features[`feature-${imageId}`].params.opacity??1)===1,"Cancel restores the saved opacity without changing the applied mask");
    await text("Image opacity","40");await ready();
    check(state()===maskApplied&&(cadDocument.features[`feature-${imageId}`].params.opacity??1)===1,"Revised opacity remains a detached edit until Apply");
    const opacityApplyStarted=performance.now();await click("Apply image edit");metrics.opacityApplyFeedbackMs=performance.now()-opacityApplyStarted;
    check(cadDocument.features[`feature-${imageId}`].params.opacity===.4&&(cadDocument.features[`feature-${copyId}`].params.opacity??1)===1,"Opacity applies only to the selected image placement");

    const adjustmentBaseline=state(),adjustmentHistoryStart=cadHistory.getPastLabels().length,canvasColorBefore=await sampleCanvasColor(),adjustmentPreviewStarted=performance.now();
    await text("Image brightness","20");await text("Image contrast","25");await text("Image saturation","50");await ready();metrics.adjustmentPreviewFeedbackMs=performance.now()-adjustmentPreviewStarted;
    const canvasColorPreview=await sampleCanvasColor(),canvasColorDelta=Math.max(...canvasColorBefore.map((channel,index)=>Math.abs(channel-canvasColorPreview[index])));metrics.canvasAdjustmentSampleDelta=canvasColorDelta;
    check(state()===adjustmentBaseline&&field("Image brightness slider").value==="20"&&review()?.dataset.commandStage==="ready"&&canvasColorDelta>4,`Numeric color adjustments synchronize with sliders and visibly update the canvas preview without mutating saved placements (sample Δ=${canvasColorDelta.toFixed(1)} ${canvasColorBefore.map(v=>v.toFixed(0)).join(",")}→${canvasColorPreview.map(v=>v.toFixed(0)).join(",")})`);
    await text("Image saturation","101");
    check(review()?.dataset.commandStage==="invalid"&&find("Apply image edit").disabled&&state()===adjustmentBaseline,"Out-of-range color adjustment rejects the stale preview and keeps the document unchanged");
    await text("Image saturation","50");await ready();
    const adjustmentApplyStarted=performance.now();await click("Apply image edit");metrics.adjustmentApplyFeedbackMs=performance.now()-adjustmentApplyStarted;
    check(JSON.stringify(cadDocument.features[`feature-${imageId}`].params.adjustments)===JSON.stringify({brightness:20,contrast:25,saturation:50})&&(cadDocument.features[`feature-${copyId}`].params.adjustments===undefined||JSON.stringify(cadDocument.features[`feature-${copyId}`].params.adjustments)===JSON.stringify({brightness:0,contrast:0,saturation:0}))&&JSON.stringify(cadDocument.rasterAssets?.[assetId])===JSON.stringify(source)&&cadHistory.getPastLabels().length===adjustmentHistoryStart+1,"Color adjustment applies once to the selected placement, keeps its duplicate independent, and preserves original asset bytes");

    await click("Artboards");await click("New artboard");await waitFor(()=>!!cadDocument.artboards&&!!document.querySelector('[data-testid="artboards-panel"]'));
    const board=Object.values(cadDocument.artboards!)[0];
    const svgStartedAt=performance.now(),artboardImages=collectArtboardExportImages(board.id),svg=encodeSvg(collectArtboardExportDrawings(board.id),{images:artboardImages,viewBox:{origin:board.origin,size:board.size},background:board.background});metrics.artboardSvgGenerationMs=performance.now()-svgStartedAt;metrics.artboardSvgBytes=new Blob([svg]).size;
    check(artboardImages.length===2&&svg.includes(source.dataUrl)&&svg.includes("artboard-crop")&&svg.includes("<ellipse")&&svg.includes('opacity="0.4"')&&svg.includes("raster-adjustment-0")&&svg.includes("feColorMatrix"),"An artboard SVG carries crop/mask/opacity and the reviewed placement color adjustment inside its board bounds");
    const currentMenu=document.querySelector<HTMLSummaryElement>(".app-menu summary")!;await physical(currentMenu);await click(`Export “${board.name}” SVG…`);const menuExport=await exported;
    check(!!menuExport&&menuExport.text.includes(source.dataUrl)&&menuExport.text.includes("artboard-crop")&&menuExport.text.includes('opacity="0.4"')&&menuExport.text.includes("feComponentTransfer"),"File menu hands off the actual artboard SVG with source pixels, crop, mask, opacity, color adjustment, and board clipping");
    await click("Save document");
    const checkpoint=localStorage.getItem(DOCUMENT_CACHE_KEY)!;
    check(JSON.parse(checkpoint).format==="agent-webcad-recovery"&&!checkpoint.includes(source.dataUrl),"Save stores compact recovery metadata and a single separately keyed image source");
    const expected=state();(globalThis as typeof globalThis&{cadTestMetrics?:unknown}).cadTestMetrics=metrics;sessionStorage.setItem(reloadKey,JSON.stringify({checks,expected,metrics}));location.reload();
  }catch(error){if(new URLSearchParams(location.search).get("artifacts")==="1")try{const shot=await input({type:"screenshot"}),data=await shot.json() as {data:string};(globalThis as typeof globalThis&{cadTestArtifacts?:Record<string,string>}).cadTestArtifacts={"cad-image-review.png":data.data};}catch{}output.textContent=checks.join("\n")+`\nFAIL: ${error instanceof Error?error.stack:error}`;}
};
installBrowserChecks(button,output);
