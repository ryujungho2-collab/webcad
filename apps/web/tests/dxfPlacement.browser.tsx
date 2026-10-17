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
import {saveDocumentToCache} from "../src/state/documentFile";
import {worldDraftingGeometry} from "../src/precision/draftingGeometry";
import {parseDxf} from "../src/interop/dxfParser";
import {serializeDocument,deserializeDocument} from "@agent-webcad/cad-document";
import {resetTestDocument} from "./helpers/documentHarness";
import {installBrowserChecks} from "./helpers/browserChecks";
import {click,input,physical,find,waitFor} from "./helpers/physicalInput";
resetTestDocument();saveDocumentToCache();createRoot(document.getElementById("root")!).render(<App/>);
const fixture=[0,"SECTION",2,"HEADER",9,"$INSUNITS",70,5,0,"ENDSEC",0,"SECTION",2,"BLOCKS",
 0,"BLOCK",2,"Parent",10,1,20,2,30,3,0,"INSERT",2,"Child",10,4,20,5,30,6,50,27,210,0,220,1,230,0,0,"ENDBLK",
 0,"BLOCK",2,"Child",10,1,20,2,30,3,0,"LINE",10,1,20,2,30,3,11,2,21,4,31,6,0,"TEXT",1,"Nested",40,1,10,1,20,2,30,3,230,-1,0,"ENDBLK",0,"ENDSEC",0,"SECTION",2,"ENTITIES",
 0,"INSERT",2,"Parent",10,2,20,3,30,7,41,-2,42,3,43,4,50,37,210,1,220,2,230,3,
 0,"TEXT",1,"Tilted",40,2,10,2,20,3,30,7,50,35,210,1,220,2,230,3,0,"ENDSEC",0,"EOF"].join("\n")+"\n";
const button=document.getElementById("run-dxf") as HTMLButtonElement,output=document.getElementById("dxf-result")!,state=()=>{const {revision:_,...d}=cadDocument;return JSON.stringify(d);},roots=()=>cadDocument.rootObjects.filter(id=>cadDocument.objects[id].visible),geometry=(id:string)=>worldDraftingGeometry(cadDocument,cadDocument.objects[id],Object.values(cadDocument.features).find(f=>f.output===id)!);
let download:Promise<string>|undefined;const nativeClick=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download.endsWith(".dxf")){download=fetch(this.href).then(r=>r.text());return;}nativeClick.call(this);};
const file=(text:string)=>input({type:"fileInput",selector:'input[aria-label="Import DXF file"]',name:"drawing-test.dxf",base64:btoa(text)}),menu=async(name:string)=>{await physical(document.querySelector('.app-menu summary')!);await click(name);},ready=()=>waitFor(()=>!!document.querySelector('[aria-label="Apply DXF import"]')&&!find("Apply DXF import").disabled);
button.onclick=async()=>{button.disabled=true;const lines:string[]=[],check=(v:unknown,s:string)=>{if(!v)throw Error(s);lines.push(`PASS: ${s}`);output.textContent=lines.join("\n");};try{
 await waitFor(()=>!!document.querySelector('canvas'));await click("New document");await click("3D");const before=state(),history=cadHistory.getPastLabels().length;
 await menu("Import DXF…");await file(fixture);await ready();check(document.querySelector('[aria-label="DXF OCS placement"]')?.textContent?.includes("2 oriented"),"Import Review identifies TEXT and INSERT OCS placements");check(!document.querySelector('[aria-label="DXF exclusions"]'),"Supported nested OCS geometry needs no loss acknowledgement");const svg=document.querySelector<HTMLImageElement>('[alt="DXF geometry preview"]');check(svg&&decodeURIComponent(svg.src).includes("Nested")&&decodeURIComponent(svg.src).includes("Tilted"),"Detached Review includes nested and tilted text projections");check(state()===before&&cadHistory.getPastLabels().length===history,"Review does not publish hidden members or block definitions");await click("Apply DXF import");await waitFor(()=>roots().length===2);check(Object.keys(cadDocument.blocks??{}).length===2,"Apply resolves forward nested definitions");const [instance,text]=roots(),first=geometry(instance),label=geometry(text);check(first.lines.length===1&&first.texts[0].text==="Nested"&&label.texts[0].text==="Tilted","Viewport geometry contains nested lines and both labels");check(cadDocument.objects[instance].transform!.scale[0]===-2,"Reflected INSERT scale remains part of its actual placement");check(cadHistory.getPastLabels().length===history+1,"Nested definitions, members and placements are one Undo");const after=state();await click("Undo");check(state()===before,"Undo removes the entire imported hierarchy");await click("Redo");check(state()===after,"Redo restores the same hierarchy and placement");check(JSON.stringify(deserializeDocument(serializeDocument(cadDocument)))===JSON.stringify(cadDocument),"Portable JSON supports signed component placement");
 await menu("Export DXF…");await click("Download reviewed DXF");await waitFor(()=>!!download);const exported=await download!,parsed=parseDxf(exported);if(parsed.entities.length!==2)throw Error("Unexpected export roots: "+JSON.stringify(parsed.entities)+"; roots "+JSON.stringify(roots()));check(parsed.entities.some(e=>e.kind==="text"&&e.normal)&&parsed.entities.some(e=>e.kind==="insert"&&e.normal)&&Object.keys(parsed.blocks).length===2,"Actual download carries TEXT/INSERT normals and nested BLOCK definitions");await file(exported);await ready();await click("Apply DXF import");await waitFor(()=>roots().length===4);const second=geometry(roots()[2]);check(first.lines[0].points.every((p,j)=>p.every((v,k)=>Math.abs(v-second.lines[0].points[j][k])<1e-6))&&first.texts[0].point.every((v,k)=>Math.abs(v-second.texts[0].point[k])<1e-6),"Downloaded DXF reimport preserves nested world positions");check(state()!==after,"Reimport creates an independent instance hierarchy");await click("Undo");check(state()===after,"Reimport Undo preserves the original hierarchy");
 output.textContent=lines.join("\n")+`\nALL ${lines.length} CHECKS PASSED`;
 }catch(cause){output.textContent=lines.join("\n")+`\nFAIL: ${cause instanceof Error?cause.stack:String(cause)}`;}};installBrowserChecks(button,output);
