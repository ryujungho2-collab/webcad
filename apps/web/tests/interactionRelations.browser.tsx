import {createRoot} from "react-dom/client";
import {App} from "../src/App";
import "../src/ui/tokens.css";import "../src/ui/workstation.css";import "../src/ui/commands.css";import "../src/ui/menu.css";import "../src/ui/explorer.css";import "../src/ui/inspector.css";
import {cadDocument} from "../src/state/cadDocument";
import {cadHistory} from "../src/state/history";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {saveDocumentToCache} from "../src/state/documentFile";
import {isDocumentCommandPending} from "../src/state/documentCommandQueue";
import {contourReferenceRequirements} from "../src/features/drawing-editing/commands/contourReferences";
import {serializeDocument,deserializeDocument} from "@agent-webcad/cad-document";
import {assertConstructionEvaluation} from "../src/precision/constructionGeometry";
import {resetTestDocument} from "./helpers/documentHarness";
import {installBrowserChecks} from "./helpers/browserChecks";
import type {CadCommand} from "@agent-webcad/cad-commands";
resetTestDocument();
const commands:CadCommand[]=[
 {type:"create-sketch",id:"sketch",workPlane:"XY"},
 {type:"add-sketch-geometry",sketchId:"sketch",geometry:{id:"source",kind:"line",start:[0,0],end:[100,0],startId:"a",endId:"b",segmentId:"ab"}},
 {type:"add-sketch-constraint",sketchId:"sketch",constraint:{id:"length",kind:"distance",first:{geometryId:"source",pointId:"a"},second:{geometryId:"source",pointId:"b"},value:100}},
 {type:"add-sketch-constraint",sketchId:"sketch",constraint:{id:"fixed",kind:"fixed-point",point:{geometryId:"source",pointId:"a"},value:[0,0]}},
 {type:"create-drawing",id:"boundary",drawing:"polyline",name:"Two crossings",params:{points:[[40,-20,0],[40,20,0],[60,20,0],[60,-20,0]],workPlane:"XY"}},
 {type:"create-drawing",id:"O",drawing:"circle",params:{center:[50,0,0],radius:80,workPlane:"XY"}},
 {type:"create-construction",id:"M",definition:{operation:"midpoint",segmentId:"source"},workPlane:"XY"},
 {type:"create-construction",id:"L",definition:{operation:"perpendicular-bisector",segmentId:"source",midpointId:"M"},workPlane:"XY"},
 {type:"create-construction",id:"P",definition:{operation:"intersection",firstId:"L",secondId:"O",branch:"positive"},workPlane:"XY"},
 {type:"create-pattern",id:"array",sourceObjectIds:["source"],spec:{kind:"linear",workPlane:"XY",columns:2,rows:1,spacing:[150,0]}},
 {type:"create-pattern",id:"nested",sourceObjectIds:["array:source:r0:c1"],spec:{kind:"linear",workPlane:"XY",columns:1,rows:2,spacing:[0,100]}},
 {type:"create-dimension",id:"child-dim",dimension:"linear",params:{sourceObjectId:"nested:array:source:r0:c1:r1:c0",workPlane:"XY",points:[[150,100],[250,100]],offset:10}},
];
for(const c of commands){const r=await dispatchCadCommand(c);if(!r.ok)throw new Error(r.reason);}
saveDocumentToCache();createRoot(document.getElementById("root")!).render(<App/>);
const button=document.getElementById("run-relations") as HTMLButtonElement,output=document.getElementById("relations-result")!;
const editor=()=>document.querySelector<HTMLFormElement>('[aria-label="Curve workflow"]'),canvas=()=>document.querySelector<HTMLCanvasElement>("#root canvas")!;
const feature=(id:string)=>Object.values(cadDocument.features).find(f=>f.output===id)!;
const pause=()=>new Promise<void>(r=>setTimeout(r,25)),state=()=>{const{revision:_,...d}=cadDocument;return JSON.stringify(d);};
const find=(name:string,scope:ParentNode=document)=>Array.from(scope.querySelectorAll<HTMLButtonElement>("button")).find(b=>(b.getAttribute("aria-label")??b.textContent?.trim())===name);
const field=(label:string)=>Array.from(document.querySelectorAll<HTMLInputElement|HTMLSelectElement>("input,select")).find(e=>e.getAttribute("aria-label")===label)!;
async function waitFor(check:()=>boolean){const end=Date.now()+14000;while(!check()){if(Date.now()>end)throw new Error("Timeout: "+editor()?.textContent);await pause();}await pause();}
async function input(action:Record<string,unknown>){const run=new URLSearchParams(location.search).get("run"),r=await fetch(`/__browser_input?run=${run}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(action)});if(!r.ok)throw new Error(await r.text());return r;}
const key=(key:string,modifiers=0)=>input({type:"key",key,modifiers});
async function point(x:number,y:number){await input({type:"mousePressed",x,y,button:"left",buttons:1});await input({type:"mouseReleased",x,y,button:"left",buttons:0});await pause();}
async function physical(e:Element){if(!e)throw new Error("Missing control");e.scrollIntoView({block:"nearest"});await pause();const r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;if(!e.contains(document.elementFromPoint(x,y)))throw new Error("Obscured "+e.outerHTML.slice(0,180));await point(x,y);}
async function click(name:string,workflow=false){const b=find(name,workflow?editor()!:document);if(!b||b.disabled)throw new Error("Missing/disabled "+name);await physical(b);await waitFor(()=>!isDocumentCommandPending());}
async function choose(label:string,value:string){const s=field(label) as HTMLSelectElement,index=Array.from(s.options).findIndex(o=>o.value===value);if(index<0)throw new Error("No choice "+label+" "+value);await physical(s);await key("Home");for(let i=0;i<index;i++)await key("ArrowDown");await key("Enter");await pause();}
async function text(label:string,value:string){await physical(field(label));await key("a",2);await input({type:"text",text:value});await pause();}
const ready=()=>waitFor(()=>!!find("Apply workflow edit",editor()!)&&!find("Apply workflow edit",editor()!)!.disabled);
async function route(ids:string[],join=false,bad=false){for(const r of contourReferenceRequirements(cadDocument,ids)){
  const second=r.kind==="sketch"&&r.slot==="second";
  await choose(`Reference result ${r.dependentId} ${r.sourceId}`,!join&&second&&!bad?"1":"0");
  if(r.kind==="sketch")await choose(`Reference portion ${r.dependentId} ${r.sourceId}`,`point:${second?(join?3:1):0}`);
  else if(r.kind==="construction"||r.kind==="dimension")await choose(`Reference portion ${r.dependentId} ${r.sourceId}`,join?"span":"0");
}}
button.onclick=async()=>{button.disabled=true;button.style.pointerEvents="none";const checks:string[]=[],check=(value:unknown,label:string)=>{if(!value)throw new Error(label);checks.push("PASS: "+label);};
 try{
  await waitFor(()=>!!canvas());await click("2D");await physical(document.querySelector('[data-model-object-id="source"] .tree-label')!);
  await key("k",2);await waitFor(()=>!!field("Search commands"));await text("Search commands","Curve workflow");await key("Enter");await waitFor(()=>!!editor());
  check((field("Workflow target") as HTMLSelectElement).value==="source","Command search discovers a relationship-aware tool and retains a finished sketch target");
  await click("Trim",true);await choose("Workflow second curve","boundary");check((field("Workflow trim scope") as HTMLSelectElement).value==="interval","Sketch targets enter bounded Trim with explicit references");
  const before=state(),past=cadHistory.getPastLabels().length;
  await click("Fit workflow preview",true);await pause();const line=document.querySelector<SVGPolylineElement>('[data-curve-workflow-preview] polyline[stroke="#e7b369"]')!,a=line.points.getItem(0),b=line.points.getItem(line.points.numberOfItems-1),rect=canvas().getBoundingClientRect();
  await click("Pick target branch",true);await point(rect.left+(a.x+b.x)/2,rect.top+(a.y+b.y)/2);await waitFor(()=>!!document.querySelector('[stroke="#ff7878"]'));
  check(find("Apply workflow edit",editor()!)!.disabled&&state()===before,"Missing references block Apply while the removed interval remains visible");
  await route(["source"],false,true);await waitFor(()=>editor()!.textContent!.includes("conflicts with the reviewed contour"));check(state()===before&&cadHistory.getPastLabels().length===past,"Incompatible endpoint assignment names the constraint and leaves the document byte-equivalent");
  const second=contourReferenceRequirements(cadDocument,["source"]).find(r=>r.kind==="sketch"&&r.slot==="second")!;
  await choose(`Reference result ${second.dependentId} source`,"1");await choose(`Reference portion ${second.dependentId} source`,"point:1");await ready();
  check(!!document.querySelector('[data-curve-workflow-preview] circle[stroke="#6cb9ff"]')&&editor()!.textContent!.includes("0 unresolved"),"Explicit endpoints are highlighted and every relationship is resolved before Apply");
  const details=Array.from(editor()!.querySelectorAll("summary")).find(e=>e.textContent?.includes("affected objects"))!;await physical(details);
  check(editor()!.textContent!.includes("Pattern instances")&&editor()!.textContent!.includes("Constructions")&&editor()!.textContent!.includes("Sketch projections"),"Impact review includes source projections, construction chain and all nested pattern instances");
  await click("Apply workflow edit",true);await waitFor(()=>!!find("Reconnect gap and Join result",editor()!));const ids=cadDocument.sketches!.sketch.geometry.map(g=>g.id);
  check(ids.length===2&&(feature("M").params.points as number[][])[0][0]===20&&cadHistory.getPastLabels().length===past+1,"One Apply trims owned geometry and recalculates the connected construction and pattern graph");
  await click("Reconnect gap and Join result",true);await route(ids,true);await ready();await click("Apply workflow edit",true);await waitFor(()=>!!find("Finish workflow",editor()!));const joined=state();
  check(cadDocument.sketches!.sketch.geometry.length===1&&(feature("M").params.points as number[][])[0][0]===50&&feature("child-dim").params.sourceObjectId==="nested:array:source:r0:c1:r1:c0","Join restores whole-span intent while preserving generated instance identity");
  check(!!find("Edit Sketch",editor()!),"Result handoff exposes Edit Sketch on the new owned contour");
  await click("Finish workflow",true);await click("Undo");await click("Undo");check(state()===before,"Undo restores the whole original relationship graph");await click("Redo");await click("Redo");check(state()===joined,"Redo restores every reconnected reference and topology");
  const loaded=deserializeDocument(serializeDocument(cadDocument));assertConstructionEvaluation(loaded);check(JSON.stringify(loaded)===JSON.stringify(cadDocument),"Versioned JSON restores the graph, identities and evaluated construction caches");
  await physical(document.querySelector(`[data-model-object-id="${cadDocument.sketches!.sketch.geometry[0].id}"] .tree-label`)!);await click("Edit Sketch");await text("Distance length","12cm");await physical(document.querySelector('[data-testid="sketch-inspector"] .inspector-header')!);
  await waitFor(()=>!!find("Apply constraint")&&!find("Apply constraint")!.disabled);check(state()===joined&&!!document.querySelector('[aria-label="Edit Sketch review"][data-command-stage="ready"]'),"Inspector unit input uses the same ready/review grammar without early mutation");
  await text("Distance length","invalid");check((!find("Apply constraint")||find("Apply constraint")!.disabled)&&state()===joined,"Changing a reviewed driving value blocks the old plan before another preview");
  await text("Distance length","12cm");await physical(document.querySelector('[data-testid="sketch-inspector"] .inspector-header')!);await waitFor(()=>!!find("Apply constraint")&&!find("Apply constraint")!.disabled);
  await click("Apply constraint");check(cadDocument.sketches!.sketch.constraints.some(c=>c.id==="length"&&"value"in c&&c.value===120),"The reconnected driving dimension remains editable after result handoff");
  const context=async()=>{const r=canvas().getBoundingClientRect(),x=r.right-20,y=r.bottom-20;await input({type:"mousePressed",x,y,button:"right",buttons:2});await input({type:"mouseReleased",x,y,button:"right",buttons:0});await waitFor(()=>!!document.querySelector('.cad-context-menu'));};
  await context();let item=Array.from(document.querySelectorAll<HTMLButtonElement>('.cad-context-menu button')).find(b=>b.textContent?.startsWith("Construction"))!;
  check(item.disabled&&item.title.includes("Finish the active sketch")&&!!item.getAttribute("aria-description"),"Context workflow explains why an active sketch blocks Construction instead of silently rejecting entry");await key("Escape");
  await key("k",2);await waitFor(()=>!!field("Search commands"));await text("Search commands","Finish sketch");await key("Enter");await waitFor(()=>!document.querySelector('[data-testid="sketch-inspector"]'));
  await dispatchCadCommand({type:"set-layer-locked",layerId:"layer-default",locked:true});await context();item=Array.from(document.querySelectorAll<HTMLButtonElement>('.cad-context-menu button')).find(b=>b.textContent?.startsWith("Linear Array"))!;
  const box=item.getBoundingClientRect();check(item.disabled&&item.title.includes("unlock")&&item.contains(document.elementFromPoint(box.left+box.width/2,box.top+box.height/2)),"Locked-layer workflow shows its recovery reason inside a visible context menu at the canvas edge");await key("Escape");
  output.textContent=checks.join("\n")+`\nALL ${checks.length} CHECKS PASSED`;
 }catch(e){output.textContent=checks.join("\n")+`\nFAIL: ${e instanceof Error?e.stack:String(e)}`;}
};installBrowserChecks(button,output);
