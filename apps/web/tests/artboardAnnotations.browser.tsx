import {createRoot} from "react-dom/client";
import {App} from "../src/App";
import "../src/styles.css";import "../src/ui/tokens.css";import "../src/ui/workstation.css";import "../src/ui/commands.css";import "../src/ui/menu.css";import "../src/ui/explorer.css";import "../src/ui/inspector.css";
import {cadDocument} from "../src/state/cadDocument";
import {cadHistory} from "../src/state/history";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {installBrowserChecks} from "./helpers/browserChecks";
import {click,physical,waitFor,text,find} from "./helpers/physicalInput";
createRoot(document.getElementById("root")!).render(<App/>);
const button=document.getElementById("run-board-notes") as HTMLButtonElement,output=document.getElementById("board-notes-result")!;
const state=()=>JSON.stringify([cadDocument,cadHistory.getPastLabels(),cadHistory.getFutureLabels()]);
let download:Promise<Blob>|undefined;
const native=HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click=function(){if(/\.(svg|png|pdf)$/.test(this.download)){download=fetch(this.href).then(r=>r.blob());return;}native.call(this);};
async function menu(name:string){await physical(document.querySelector('.app-menu summary')!);await click(name);}
async function pixels(blob:Blob){const bitmap=await createImageBitmap(blob),canvas=document.createElement("canvas");canvas.width=bitmap.width;canvas.height=bitmap.height;const ctx=canvas.getContext("2d")!;ctx.drawImage(bitmap,0,0);bitmap.close();return ctx.getImageData(0,0,canvas.width,canvas.height);}
function ink(data:ImageData,x0:number,y0:number,x1:number,y1:number){let n=0;for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const i=(y*data.width+x)*4;if(data.data[i]<180&&data.data[i+1]<180&&data.data[i+2]<180)n++;}return n;}
button.onclick=async()=>{button.disabled=true;const lines:string[]=[],check=(ok:unknown,label:string)=>{if(!ok)throw Error(label);lines.push(`PASS: ${label}`);output.textContent=lines.join("\n");};try{
 await waitFor(()=>!!document.querySelector("#root canvas"));await click("New document");await click("Artboards");await click("New artboard");await waitFor(()=>Object.keys(cadDocument.artboards??{}).length===1);const b=Object.values(cadDocument.artboards!)[0];
 check((await dispatchCadCommand({type:"update-artboard",artboardId:b.id,size:[25.4,25.4]})).ok,"Board keeps exact 25.4 mm output bounds");
 check((await dispatchCadCommand({type:"create-drafting",id:"note",params:{kind:"text",workPlane:"XY",point:[12.7,18,0],text:"도면 A",height:4,angle:30,align:"center"}})).ok,"Rotated centred Unicode text is editable CAD artwork");
 check((await dispatchCadCommand({type:"create-dimension",id:"dim",dimension:"linear",params:{workPlane:"XY",points:[[4,3],[21,3]],offset:4,style:{textHeight:3,paperScale:1}}})).ok,"Styled dimension is included without converting its source definition");
 await dispatchCadCommand({type:"set-layer-style",layerId:"layer-default",style:{color:"#000000",lineType:"continuous",lineWeight:.25}});
 await dispatchCadCommand({type:"create-drafting",id:"hidden",params:{kind:"text",workPlane:"XY",point:[1,1,0],text:"HIDDEN",height:3}});await dispatchCadCommand({type:"set-object-visible",objectId:"hidden",visible:false});const before=state();
 await menu("Export “Artboard 1” SVG…");await waitFor(()=>!!download);const svg=await (await download!).text();check(svg.includes("도면 A")&&svg.includes("17.00 mm")&&!svg.includes("HIDDEN"),"Menu SVG export contains visible labels and excludes hidden text");check(svg.includes('rotate(-30 12.7 -18)')&&svg.includes('clip-path="url(#artboard-crop)"'),"SVG retains angle and finite board clip");
 download=undefined;await menu("Export “Artboard 1” PNG…");await waitFor(()=>!!document.querySelector('[data-png-preview-ready="true"]')&&!find("Download artboard PNG").disabled);check(state()===before,"PNG worker preview stays detached from document and History");await text("PNG export scale","2");await waitFor(()=>document.querySelector('[aria-label="PNG output dimensions"]')?.textContent==="192 × 192 px"&&!!document.querySelector('[data-png-preview-ready="true"]'));await click("Download artboard PNG");await waitFor(()=>!!download);const png=await pixels(await download!);check(png.width===192&&png.height===192,"PNG scale changes resolution without changing annotation geometry");check(ink(png,40,15,155,85)>80,"Decoded PNG includes rotated Unicode glyph pixels");check(ink(png,10,105,185,180)>80,"Decoded PNG includes dimension linework and label pixels");
 download=undefined;await menu("Export Artboards PDF…");await waitFor(()=>!!document.querySelector('[data-pdf-preview-ready="true"]')&&!find("Download artboard PDF").disabled);await click("Download artboard PDF");await waitFor(()=>!!download);const bytes=new Uint8Array(await (await download!).arrayBuffer()),pdf=Array.from(bytes,b=>String.fromCharCode(b)).join("");check(pdf.includes("/MediaBox [0 0 72 72]")&&pdf.includes("/Count 1"),"PDF page keeps physical artboard size");const match=/\/Filter \/DCTDecode \/Length (\d+) >>\nstream\n/.exec(pdf)!;const start=match.index+match[0].length,jpeg=bytes.slice(start,start+Number(match[1])),page=await pixels(new Blob([jpeg],{type:"image/jpeg"}));check(ink(page,20,8,78,43)>20&&ink(page,5,52,92,90)>20,"Decoded PDF JPEG contains both Unicode and dimension artwork");check(state()===before,"SVG PNG PDF downloads preserve source geometry and Undo history");
 output.textContent=lines.join("\n")+`\nALL ${lines.length} CHECKS PASSED`;
}catch(e){output.textContent=lines.join("\n")+`\nFAIL: ${e instanceof Error?e.stack:e}`;}};installBrowserChecks(button,output);
