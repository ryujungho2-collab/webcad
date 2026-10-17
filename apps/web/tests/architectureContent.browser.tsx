import {createRoot} from "react-dom/client";
import * as THREE from "three";
import {App} from "../src/App";
import "../src/styles.css";import "../src/ui/tokens.css";import "../src/ui/workstation.css";import "../src/ui/commands.css";import "../src/ui/menu.css";import "../src/ui/explorer.css";import "../src/ui/inspector.css";
import {cadDocument} from "../src/state/cadDocument";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {cadHistory} from "../src/state/history";
import {saveDocumentToCache} from "../src/state/documentFile";
import {serializeDocument,type ComponentContent} from "@agent-webcad/cad-document";
import {measureDocumentObject} from "../src/state/documentQuery";
import {resetTestDocument} from "./helpers/documentHarness";
import {physical,click,text,find,input,waitFor,choose} from "./helpers/physicalInput";
import {installBrowserChecks} from "./helpers/browserChecks";
import {rootUuids} from "./helpers/projectPerformanceProbe";
const renderedFinish=new Map<string,{base:unknown;roughness:number;opacity:number}>(),previous=THREE.Object3D.prototype.updateMatrixWorld;
THREE.Object3D.prototype.updateMatrixWorld=function(force){const material=(this as THREE.Mesh).material as THREE.MeshStandardMaterial|undefined;if(this.userData.cadObjectId&&material?.isMeshStandardMaterial)renderedFinish.set(this.userData.cadObjectId,{base:material.userData.baseColor,roughness:material.roughness,opacity:material.opacity});return previous.call(this,force);};
resetTestDocument();
for(const c of [
 {type:"create-box",id:"source-prototype",width:100,depth:40,height:200},
 {type:"create-drawing",id:"outline",drawing:"rectangle",params:{points:[[0,0,0],[6000,0,0],[6000,4000,0],[0,4000,0]],workPlane:"XY"}},
 {type:"create-drawing",id:"court",drawing:"circle",params:{center:[3000,2000,0],radius:500,workPlane:"XY"}},
 {type:"create-drawing",id:"axis",drawing:"line",params:{points:[[0,0,0],[6000,0,0]],workPlane:"XY"}},
 {type:"create-wall",id:"wall",definition:{mode:"centerline",sourceObjectIds:["axis"],height:2700,thickness:200,baseLevel:0,openings:[{id:"door",kind:"door",side:"left",along:1500,width:900,height:2100,sill:0}]}}
] as const){const r=await dispatchCadCommand(c as Parameters<typeof dispatchCadCommand>[0]);if(!r.ok)throw Error(r.reason);}
saveDocumentToCache();createRoot(document.getElementById("root")!).render(<App/>);
const button=document.getElementById("run") as HTMLButtonElement,output=document.getElementById("output")!,features=()=>Object.values(cadDocument.features),contents=()=>features().filter(f=>f.params.componentContent),state=()=>{const {revision:_,...d}=cadDocument;return JSON.stringify(d);};
async function open(){await physical(document.querySelector(".menu-items summary")!);await click("Floor plan tasks…");const summary=[...document.querySelectorAll("summary")].find(e=>e.textContent==="Content, floors & finishes…")!;if(!summary.parentElement!.hasAttribute("open"))await physical(summary);}
async function select(ids:string[]){if(document.querySelector('[aria-label="Floor plan tasks"]'))await click("Close floor tasks");for(const [i,id] of ids.entries())await physical(document.querySelector(`[data-model-object-id="${id}"] .tree-label`)!,i?2:0);await open();}
async function review(label:string){await click(label);await waitFor(()=>!find("Apply content surface review").disabled||!!document.querySelector('[aria-label="Content and architectural surfaces"] [role="alert"]'));const error=document.querySelector('[aria-label="Content and architectural surfaces"] [role="alert"]');if(error)throw Error(error.textContent??"Review error");}
button.onclick=async()=>{const lines:string[]=[],check=(ok:unknown,label:string)=>{if(!ok)throw Error(label);lines.push("PASS "+label);output.textContent=lines.join("\n");};try{
 await waitFor(()=>!!document.querySelector("canvas"));await select(["source-prototype"]);await text("Content definition name","Door insert");const before=state(),past=cadHistory.getPastLabels().length;await review("Review capture content");check(state()===before&&document.querySelector('[aria-label="Content surface impact"]')?.textContent?.includes("Component definitions"),"Library capture is detached and reviews definition changes");await click("Apply content surface review");await waitFor(()=>Object.keys(cadDocument.componentLibrary??{}).length===1);check(cadHistory.getPastLabels().length===past+1,"Definition capture is one Undo");
 await select(["wall"]);await choose("Content fit",1);for(const axis of ["X","Y","Z"])await text(`Slot padding ${axis}`,"5mm");const original=state();await review("Review place content");await waitFor(()=>[...rootUuids.keys()].some(id=>id.startsWith("wall-review-content-")));check(state()===original,"Opening insertion ghost renders without committing geometry");await click("Cancel content surface review");check(state()===original,"Canceled content insertion preserves wall and document");await review("Review place content");await click("Apply content surface review");await waitFor(()=>contents().length===1);const id=contents()[0].output;
 check(Math.abs((await measureDocumentObject(cadDocument,id)).volume!-890*190*2090)<1,"Actual Worker fills opening with padding and exact solid volume");check(cadDocument.objects[id].layerId==="layer-architecture-fitout","New content belongs to a dedicated architectural work layer");
 await text("Slot padding X","600mm");await click("Review content slot");await waitFor(()=>!!document.querySelector('[aria-label="Content and architectural surfaces"] [role="alert"]'));check(find("Apply content surface review").disabled,"Insufficient slot space blocks Apply");await text("Slot padding X","10mm");await review("Review content slot");await click("Apply content surface review");await waitFor(()=>(contents()[0].params.componentContent as ComponentContent).slot.padding[0]===10);check(Math.abs((await measureDocumentObject(cadDocument,id)).volume!-880*190*2090)<1,"Instance slot edit recomputes fitted content");
 await choose("Solid finish",3);await review("Review apply 3D finish");await click("Apply content surface review");await waitFor(()=>renderedFinish.get(id)?.opacity===.35);check(renderedFinish.get(id)?.base==="#91b9c9"&&renderedFinish.get(id)?.roughness===.1,"Viewport receives actual 3D glass material, not a vector color");
 const attached=state();await review("Review detach content");await click("Apply content surface review");await waitFor(()=>!features().find(f=>f.output===id)?.params.componentContent);check(contents().length===0,"Detach preserves a standalone solid");await click("Undo");check(state()===attached,"Detach Undo restores host and definition relationship");
 await select(["outline","court"]);await review("Review create surface");await click("Apply content surface review");await waitFor(()=>features().some(f=>(f.params.architecturalSlab as any)?.kind==="floor"));const floor=features().find(f=>(f.params.architecturalSlab as any)?.kind==="floor")!;check(Math.abs((await measureDocumentObject(cadDocument,floor.output)).volume!-(24000000-Math.PI*500**2)*150)<.1,"Floor keeps exact courtyard hole and downward thickness");await waitFor(()=>rootUuids.has(floor.output));check(rootUuids.has(floor.output),"Created floor renders in the real viewport");
 await select(["outline","court"]);await choose("Architectural surface kind",1);await text("Surface thickness","100mm");await review("Review create surface");await click("Apply content surface review");await waitFor(()=>features().some(f=>(f.params.architecturalSlab as any)?.kind==="ceiling"));const ceiling=features().find(f=>(f.params.architecturalSlab as any)?.kind==="ceiling")!;check((ceiling.params.bounds as any).min[2]===2700&&(ceiling.params.bounds as any).max[2]===2800,"Ceiling uses explicit bottom level and upward thickness");
 const saved=state(),portable=serializeDocument(cadDocument);await input({type:"key",key:"s",modifiers:2});await input({type:"fileInput",selector:'input[accept=".json,.webcad.json"]',name:'prepared.webcad.json',base64:btoa(unescape(encodeURIComponent(portable)))});await waitFor(()=>cadHistory.getPastLabels().length===0&&contents().length===1);check(state()===saved,"Portable v42 reopen preserves definitions, slots, finishes and both surfaces");
 await click("Close floor tasks");await click("Copilot");await click("Clean / Make face…");check(!!document.querySelector('[aria-label="Content and architectural surfaces"]'),"Copilot shares the same content/surface workflow");
 (globalThis as any).cadTestArtifacts={"fitout.webcad.json":portable};output.textContent=lines.join("\n")+`\nALL ${lines.length} CHECKS PASSED`;
 }catch(e){output.textContent=lines.join("\n")+`\nFAIL: ${e instanceof Error?e.stack:String(e)}`;}};installBrowserChecks(button,output);


