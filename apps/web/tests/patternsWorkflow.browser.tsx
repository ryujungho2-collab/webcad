import {createRoot} from "react-dom/client";
import {App} from "../src/App";
import "../src/styles.css";
import "../src/ui/tokens.css";
import "../src/ui/workstation.css";
import "../src/ui/commands.css";
import "../src/ui/menu.css";
import "../src/ui/explorer.css";
import "../src/ui/inspector.css";
import {cadDocument} from "../src/state/cadDocument";
import {cadHistory} from "../src/state/history";
import {saveDocumentToCache} from "../src/state/documentFile";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {isDocumentCommandPending} from "../src/state/documentCommandQueue";
import {measureDocumentObject} from "../src/state/documentQuery";
import {documentVersion} from "../src/state/documentSession";
import {serializeDocument,deserializeDocument} from "@agent-webcad/cad-document";
import {encodeDxf} from "../src/interop/dxfWriter";
import {resetTestDocument} from "./helpers/documentHarness";
import {installBrowserChecks} from "./helpers/browserChecks";
resetTestDocument();
await dispatchCadCommand({type:"create-drawing",id:"seed",drawing:"circle",params:{center:[10,10,0],radius:2,workPlane:"XY"}});
await dispatchCadCommand({type:"create-drawing",id:"outline",drawing:"rectangle",params:{points:[[0,0,0],[110,0,0],[110,60,0],[0,60,0]],workPlane:"XY"}});
saveDocumentToCache();createRoot(document.getElementById("root")!).render(<App/>);
const output=document.getElementById("patterns-result")!,button=document.getElementById("run-patterns") as HTMLButtonElement;
const pause=()=>new Promise<void>(resolve=>setTimeout(resolve,35));
const editor=()=>document.querySelector<HTMLFormElement>('[aria-label="Pattern editor"]');
const feature=(id:string)=>Object.values(cadDocument.features).find(f=>f.output===id)!;
const members=(id:string)=>Object.values(cadDocument.features).filter(f=>f.pattern?.id===id);
const state=()=>{const {revision:_,...doc}=cadDocument;return JSON.stringify(doc);},past=()=>cadHistory.getPastLabels().length;
const find=(name:string)=>Array.from(document.querySelectorAll<HTMLButtonElement>("#root button")).find(b=>(b.getAttribute("aria-label")??b.textContent?.trim())===name);
async function waitFor(test:()=>boolean){const deadline=Date.now()+12000;while(!test()){if(Date.now()>deadline)throw new Error("UI timeout: "+editor()?.textContent);await pause();}await pause();}
async function input(action:Record<string,unknown>){const run=new URLSearchParams(location.search).get("run"),r=await fetch(`/__browser_input?run=${run}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(action)});if(!r.ok)throw new Error(await r.text());return r;}
async function physical(element:HTMLElement){const rect=element.getBoundingClientRect(),x=rect.left+rect.width/2,y=rect.top+rect.height/2;if(!element.contains(document.elementFromPoint(x,y)))throw new Error("Obscured control: "+element.outerHTML);await input({type:"mousePressed",x,y,button:"left",buttons:1});await input({type:"mouseReleased",x,y,button:"left",buttons:0});await pause();}
async function click(name:string){const b=find(name);if(!b||b.disabled)throw new Error(`Missing or disabled ${name}`);await physical(b);await waitFor(()=>!isDocumentCommandPending());}
async function field(name:string,value:string){const target=editor()?.querySelector<HTMLInputElement>(`[data-pattern-field="${name}"]`);if(!target)throw new Error("Missing field "+name);await physical(target);await input({type:"key",key:"a",modifiers:2});await input({type:"text",text:value});await pause();}
async function select(id:string){const row=document.querySelector<HTMLElement>(`[data-model-object-id="${id}"] .tree-label`);if(!row)throw new Error("Missing model row "+id);await physical(row);}
async function ready(){await waitFor(()=>Boolean(editor()&&!find("Apply pattern")?.disabled));}
async function screenshot(){if(new URLSearchParams(location.search).get("artifacts")!=="1")return;const data=(await (await input({type:"screenshot"})).json()).data;(globalThis as any).cadTestArtifacts={"cad-patterns-preview.png":data};}
button.onclick=async()=>{
  const lines:string[]=[];const check=(value:boolean,message:string)=>{if(!value)throw new Error(message);lines.push("PASS: "+message);};
  try{
    await waitFor(()=>Boolean(document.querySelector("#root canvas")));await click("2D");await select("seed");document.getElementById("tools-tab-modify")!.click();await pause();const before=state(),initialPast=past();
    await click("Linear Array");await ready();check(state()===before&&past()===initialPast,"Opening a live array previews without modifying the document or history");
    await field("rows","2");await field("u","2cm");await field("v","30mm");await ready();check(document.querySelector('[aria-label="Pattern preview"]')?.getAttribute("data-preview-count")==="5","Native unit input shows five exact generated curves for a 3×2 grid");await click("Fit preview");await pause();const ghosts=Array.from(document.querySelectorAll<SVGPolylineElement>('[aria-label="Pattern preview"] polyline'));const host=document.querySelector('[aria-label="Pattern preview"]')!.getBoundingClientRect();check(ghosts.every(g=>Array.from(g.points).every(p=>p.x>=0&&p.x<=host.width&&p.y>=0&&p.y<=host.height))&&state()===before&&past()===initialPast,"Fit preview brings every proposed instance into view without creating history");await screenshot();
    await click("Apply pattern");await waitFor(()=>!editor());const recipe=Object.values(cadDocument.features).find(f=>f.pattern)!.pattern!,arrayId=recipe.id,id=members(arrayId)[0].output;
    check(members(arrayId).length===5&&members(arrayId).every(f=>f.pattern?.spec.kind==="linear"&&f.pattern.spec.spacing[0]===20),"Apply creates a persisted live grid with the reviewed unit values");check(past()===initialPast+1&&cadDocument.objects.seed.visible,"Grid creation is one Undo and retains the visible original");
    const topology=JSON.stringify(feature(id).params.topology);await click("Edit pattern");await waitFor(()=>Boolean(editor()));check(editor()?.querySelector<HTMLInputElement>('[data-pattern-field="rows"]')?.value==="2"&&Boolean(find("Apply pattern")?.disabled),"Inspector reopens the saved definition from an instance without recording an unchanged edit");await field("columns","4");await field("u","25");await ready();const beforeUpdate=state();await click("Apply pattern");await waitFor(()=>!editor());
    check(members(arrayId).length===7&&JSON.stringify(feature(id).params.topology)===topology,"Changing count and spacing preserves surviving instance and topology references");const updated=state();await click("Undo");check(state()===beforeUpdate,"Array edit Undo restores the whole prior definition and every instance");await click("Redo");check(state()===updated,"Redo restores the complete edited array");
    await select(id);await click("Edit pattern");await waitFor(()=>Boolean(editor()));await field("u","0");await waitFor(()=>Boolean(find("Apply pattern")?.disabled));check(state()===updated&&document.querySelector('[aria-label="Pattern preview"]')?.getAttribute("data-preview-count")==="0","Invalid zero spacing disables Apply and clears stale ghosts without history");await input({type:"key",key:"Escape"});await waitFor(()=>!editor());check(state()===updated,"Escape cancels the array editor without changing saved geometry");
    await select("seed");await click("Mirror");await field("u","5");await field("u2","5");await ready();await click("Apply pattern");await waitFor(()=>!editor());const mirror=Object.values(cadDocument.features).find(f=>f.pattern?.spec.kind==="mirror")!,mirrorId=mirror.pattern!.id;check((mirror.params.center as number[])[0]===0&&cadDocument.objects.seed.visible,"Mirror reflects about its entered axis and preserves the original");
    await select("seed");await click("Radial Array");await field("count","4");await field("angle","90deg");await field("u","3");await field("v","5");await ready();await click("Apply pattern");await waitFor(()=>!editor());const radial=Object.values(cadDocument.features).find(f=>f.pattern?.spec.kind==="radial")!,radialId=radial.pattern!.id;check(members(radialId).length===3&&Math.abs((radial.params.center as number[])[0]+2)<1e-7&&Math.abs((radial.params.center as number[])[1]-12)<1e-7,"Radial placement uses the entered centre and step angle without a duplicate at 360°");
    await select(id);await click("Edit pattern");await waitFor(()=>Boolean(editor()));await field("u","30");await ready();const seedControl=(feature("seed").params.topology as any).controls.find((c:any)=>c.role==="radius").id;
    await dispatchCadCommand({type:"edit-drawing-control",objectId:"seed",controlId:seedControl,point:[13,10,0]});await waitFor(()=>editor()?.dataset.previewGeneration===String(documentVersion().generation)&&Boolean(find("Apply pattern")&&!find("Apply pattern")?.disabled));check(members(arrayId).every(f=>f.params.radius===3)&&members(mirrorId)[0].params.radius===3&&members(radialId).every(f=>f.params.radius===3),"A source radius edit regenerates all three pattern families");check(editor()?.textContent?.includes("8 placements")===true,"The open preview recalculates against the new document version after a source edit");await click("Cancel");
    const encoded=serializeDocument(cadDocument);check(JSON.parse(encoded).version===3&&JSON.stringify(deserializeDocument(encoded))===JSON.stringify(cadDocument),"Saving and reopening preserves complete live definitions and geometry");const dxf=encodeDxf(cadDocument);check((dxf.text.match(/\nCIRCLE\n/g)??[]).length===12&&dxf.skipped===0,"DXF contains twelve editable exact circles from the source and patterns");
    await select(members(mirrorId)[0].output);await click("Delete pattern");check(members(mirrorId).length===0&&Boolean(cadDocument.objects.seed),"Group deletion keeps the original drawing");
    await select(id);await click("Detach pattern");check(members(arrayId).length===0&&Boolean(cadDocument.objects[id]),"Detach retains every curve as an independently editable drawing");await dispatchCadCommand({type:"edit-drawing-control",objectId:"seed",controlId:seedControl,point:[14,10,0]});check(feature(id).params.radius===3&&members(radialId).every(f=>f.params.radius===4),"Detached curves keep their geometry while remaining live patterns follow the source");
    const detachedIds=Object.keys(cadDocument.objects).filter(id=>id.startsWith(arrayId+":"));const extruded=await dispatchCadCommand({type:"create-extrude",id:"plate",profileObjectIds:["outline","seed",...detachedIds],distance:5});check(extruded.ok,"Pattern curves are accepted as real hole profiles by the production Worker");const measure=await measureDocumentObject(cadDocument,"plate");check(measure.validity==="valid"&&Math.abs(measure.volume!-(110*60-Math.PI*(16+7*9))*5)<1e-6,"The actual BRep has the independently calculated repeated-hole volume");
    output.textContent=lines.join("\n")+`\nALL ${lines.length} CHECKS PASSED`;
  }catch(e){output.textContent=lines.join("\n")+`\nFAIL: ${e instanceof Error?e.message:String(e)}`;}
};installBrowserChecks(button,output);
