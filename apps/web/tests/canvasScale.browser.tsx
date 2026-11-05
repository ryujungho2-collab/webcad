import {createRoot} from "react-dom/client";
import {App} from "../src/App";
import {cadDocument} from "../src/state/cadDocument";
import {cadHistory} from "../src/state/history";
import {saveDocumentToCache} from "../src/state/documentFile";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {flexFixture} from "./helpers/canvasFlexFixture";
import {projectKernelMetrics} from "../src/cad/kernelGeometryService";
import {collectArtboardExportItems} from "../src/export/exportModel";
import {encodeSvg} from "../src/export/svgWriter";
import {serializeDocument} from "@agent-webcad/cad-document";
import {planArtboardPdf} from "../src/export/artboardPdf";
import {artboardPngSvg} from "../src/export/artboardPng";
import {renderArtboardPdfPageInWorker} from "../src/export/artboardPngRenderer";
import {encodePdfRasterPages} from "../src/plot/pdfWriter";
import {click,physical,text,input,pause,waitFor} from "./helpers/physicalInput";
import {installBrowserChecks} from "./helpers/browserChecks";
import "../src/ui/tokens.css";import "../src/ui/workstation.css";import "../src/ui/commands.css";import "../src/ui/menu.css";import "../src/ui/explorer.css";import "../src/ui/inspector.css";
const reloadKey="canvas-scale-reload",saved=sessionStorage.getItem(reloadKey);
if(!saved){
 await flexFixture(false);
 for(const [i,id] of ["a","b","c"].entries())await dispatchCadCommand({type:"update-artboard",artboardId:id,origin:[10+i*75,10],size:[70,60]});
 await dispatchCadCommand({type:"create-drafting",id:"label",params:{kind:"text",workPlane:"XY",point:[20,20,0],text:"ROOM 100 mm",height:10,angle:0}});
 await dispatchCadCommand({type:"create-drawing",id:"ellipse",drawing:"ellipse",params:{workPlane:"XY",center:[30,30,0],axisU:[20,0,0],axisV:[0,10,0],startParam:0,sweep:2*Math.PI}});
 await dispatchCadCommand({type:"update-artboard",artboardId:"a",frame:{...cadDocument.artboards!.a.frame!,memberIds:["source","label","ellipse"],denominator:1}});
 saveDocumentToCache();
}
createRoot(document.getElementById("root")!).render(<App/>);
const button=document.getElementById("run")! as HTMLButtonElement,output=document.getElementById("output")!;
const state=()=>{const {revision:_,...d}=cadDocument;return JSON.stringify(d);};
const line=()=>collectArtboardExportItems("a").find(i=>i.type==="polyline")!,label=()=>collectArtboardExportItems("a").find(i=>i.type==="text")!;
const ready=()=>waitFor(()=>!!document.querySelector('[aria-label="Content scale preview"]'),"Scale review");
async function configure(factor="2"){await click("Edit canvas Flex paper");await text("Canvas content scale factor",factor);}
const base64=(bytes:Uint8Array)=>{let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s);};
button.onclick=async()=>{const resumed=saved?JSON.parse(saved):null,lines:string[]=resumed?.lines??[],artifacts:Record<string,string>=resumed?.artifacts??{};
 const check=(ok:unknown,label:string)=>{if(!ok)throw Error(label);lines.push("PASS "+label);output.textContent=lines.join("\n");};
 try{
 await waitFor(()=>!!document.querySelector("canvas")&&!!cadDocument.canvases?.flex);
 if(resumed){check(JSON.stringify([cadDocument.canvases,cadDocument.artboards])===resumed.presentation,"Reload preserves bounds, scale and cumulative paper styling");check(JSON.stringify([cadDocument.objects,cadDocument.features])===resumed.source,"Reload keeps original CAD dimensions and annotations");check(cadHistory.getPastLabels().length===0,"Reload opens with fresh history");(globalThis as any).cadTestArtifacts=artifacts;output.textContent=lines.join("\n")+`\nALL ${lines.length} CHECKS PASSED`;return;}
 await click("2D");await click("Project navigation");await waitFor(()=>!!document.querySelector('[data-canvas-target="flex"]'));await waitFor(()=>projectKernelMetrics().activeTasks===0);
 const before=state(),source=JSON.stringify([cadDocument.objects,cadDocument.features]),stroke=line().polyline.lineWeight!,font=label().text.size!,depth=cadHistory.getPastLabels().length,tasks=projectKernelMetrics().submittedTasks;
 await configure();await click("Review Scale contents");await ready();check(state()===before,"Scale review leaves live placements and CAD sources unchanged");check(document.querySelector('[aria-label="Content scale preview"]')!.textContent!.includes("source dimensions preserved"),"Review identifies presentation scaling and proposed sizes");await click("Cancel canvas edit");check(state()===before,"Cancel discards content scaling");
 await configure();await click("Review Scale contents");await ready();await click("Apply canvas changes");check(cadDocument.artboards!.a.size[0]===140&&cadDocument.artboards!.a.origin[0]===20&&cadDocument.artboards!.a.frame!.denominator===.5,"Uniform scale moves and sizes the frame around canvas origin");check(label().text.size===font*2&&line().polyline.lineWeight===stroke*2,"Text and line weights scale with geometry");check(JSON.stringify([cadDocument.objects,cadDocument.features])===source,"CAD coordinates, radii and annotation source sizes remain unchanged");check(projectKernelMetrics().submittedTasks===tasks,"Presentation scale submits no new native geometry");check(cadHistory.getPastLabels().length===depth+1,"All content changes form one Undo");
 await click("Undo");check(state()===before,"Undo restores the complete pre-scale document");await click("Redo");check(cadDocument.artboards!.a.frame!.paperStrokeScale===2,"Redo restores presentation styling");await click("Undo");
 await configure();await physical(document.querySelector('[aria-label="Keep paper text and strokes"]')!);await click("Review Scale contents");await ready();await click("Apply canvas changes");check(label().text.size===font&&line().polyline.lineWeight===stroke,"Paper-fixed option preserves physical text and stroke sizes");
 await configure("0");await click("Review Scale contents");await waitFor(()=>!!document.querySelector('.canvas-hierarchy [role="alert"]'));check(cadDocument.artboards!.a.size[0]===140,"Invalid factor cannot partially mutate presentation");await click("Cancel canvas edit");
 await physical(document.querySelector('[data-canvas-target="flex"]')!);await configure("0.5");await click("Review Scale contents");await ready();
 document.querySelector('[aria-label="Content scale preview"]')!.scrollIntoView({block:"center"});await pause();
 const shot=async(name:string)=>{button.closest("aside")!.style.visibility="hidden";try{artifacts[name]=(await(await input({type:"screenshot"})).json()).data;}finally{button.closest("aside")!.style.visibility="";}};
 await shot("scale-1440.png");await input({type:"viewport",width:960,height:1000});await pause();document.querySelector('[aria-label="Content scale preview"]')!.scrollIntoView({block:"center"});await pause();check(document.documentElement.scrollWidth<=960,"Scale controls and review fit a 960px workspace");await shot("scale-960.png");await click("Cancel canvas edit");
 const board=cadDocument.artboards!.a,items=collectArtboardExportItems("a"),scene={board,items};artifacts["scale.svg"]=encodeSvg([],{items,viewBox:board,background:board.background});
 const plan=planArtboardPdf([scene],72);if("error" in plan)throw Error(plan.error);const page=plan.pages[0],svg=artboardPngSvg(scene,page);check(svg.includes("ROOM 100 mm")&&svg.includes("<ellipse"),"SVG and PDF input share scaled analytic curves and annotation text");
 const rendered=await renderArtboardPdfPageInWorker(svg,page.width,page.height),jpeg=new Uint8Array(await rendered.blob.arrayBuffer());check(jpeg.length>1000,"PDF worker renders the scaled scene");artifacts["scale-page.jpg"]=base64(jpeg);
 const pdf=encodePdfRasterPages([{widthMm:board.size[0],heightMm:board.size[1],raster:{width:page.width,height:page.height,jpeg}}]);check(new TextDecoder().decode(pdf.slice(0,8)).startsWith("%PDF-"),"PDF writer publishes the same physical page dimensions");artifacts["scale.pdf"]=base64(pdf);artifacts["scale.webcad.json"]=serializeDocument(cadDocument);check(JSON.parse(artifacts["scale.webcad.json"]).version===45,"Portable document declares v45 presentation factors");
 await click("Save document");sessionStorage.setItem(reloadKey,JSON.stringify({lines,artifacts,presentation:JSON.stringify([cadDocument.canvases,cadDocument.artboards]),source}));location.reload();
 }catch(e){(globalThis as any).cadTestArtifacts=artifacts;output.textContent=lines.join("\n")+"\nFAIL: "+(e instanceof Error?e.stack:String(e));}
};
installBrowserChecks(button,output);
