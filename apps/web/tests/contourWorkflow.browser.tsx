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
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {saveDocumentToCache} from "../src/state/documentFile";
import {documentVersion} from "../src/state/documentSession";
import {isDocumentCommandPending} from "../src/state/documentCommandQueue";
import {measureDocumentObject} from "../src/state/documentQuery";
import {exactDrawingContour,contourLength} from "../src/features/drawing-editing/geometry/contourEditing";
import {serializeDocument,deserializeDocument} from "@agent-webcad/cad-document";
import {resetTestDocument} from "./helpers/documentHarness";
import {installBrowserChecks} from "./helpers/browserChecks";
resetTestDocument();
await dispatchCadCommand({type:"create-drawing",id:"outline",drawing:"polyline",params:{workPlane:"XY",points:[[0,0,0],[80,0,0],[100,20,0],[100,60,0],[0,60,0]],bulges:[0,Math.tan(Math.PI/8),0,0,0],closed:true}});
saveDocumentToCache();createRoot(document.getElementById("root")!).render(<App/>);
const output=document.getElementById("contours-result")!,button=document.getElementById("run-contours") as HTMLButtonElement;
const pause=()=>new Promise<void>(r=>setTimeout(r,35));
const editor=()=>document.querySelector<HTMLFormElement>('[aria-label="Contour editor"]'),canvas=()=>document.querySelector<HTMLCanvasElement>("#root canvas")!;
const feature=(id:string)=>Object.values(cadDocument.features).find(f=>f.output===id)!,path=(id:string)=>exactDrawingContour(cadDocument.objects[id],feature(id));
const state=()=>{const {revision:_,...d}=cadDocument;return JSON.stringify(d);},past=()=>cadHistory.getPastLabels().length,near=(a:number,b:number)=>Math.abs(a-b)<1e-6;
const find=(name:string)=>Array.from(document.querySelectorAll<HTMLButtonElement>("#root button")).find(b=>(b.getAttribute("aria-label")??b.textContent?.trim())===name);
async function waitFor(test:()=>boolean){const deadline=Date.now()+12000;while(!test()){if(Date.now()>deadline)throw new Error("UI timeout: "+editor()?.textContent);await pause();}await pause();}
async function input(action:Record<string,unknown>){const run=new URLSearchParams(location.search).get("run"),r=await fetch(`/__browser_input?run=${run}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(action)});if(!r.ok)throw new Error(await r.text());return r;}
async function physical(element:HTMLElement){const r=element.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;if(!element.contains(document.elementFromPoint(x,y)))throw new Error("Obscured control: "+element.outerHTML);await input({type:"mousePressed",x,y,button:"left",buttons:1});await input({type:"mouseReleased",x,y,button:"left",buttons:0});await pause();}
async function click(name:string){const b=find(name);if(!b||b.disabled)throw new Error("Missing or disabled "+name);await physical(b);await waitFor(()=>!isDocumentCommandPending());}
async function key(key:string,modifiers=0){await input({type:"key",key,modifiers});await pause();await waitFor(()=>!isDocumentCommandPending());}
async function field(label:string,value:string){const el=editor()?.querySelector<HTMLInputElement>(`[aria-label="${label}"]`);if(!el)throw new Error("Missing field "+label);await physical(el);await key("a",2);await input({type:"text",text:value});await pause();}
async function select(id:string){const row=document.querySelector<HTMLElement>(`[data-model-object-id="${id}"] .tree-label`);if(!row)throw new Error("Missing row "+id);await physical(row);}
async function ready(){await waitFor(()=>Boolean(editor()&&!find("Apply contour edit")?.disabled));}
async function operation(value:"gap"|"split"){const el=editor()?.querySelector<HTMLSelectElement>('[aria-label="Break operation"]');if(!el)throw new Error("Missing operation selector");await physical(el);await key(value==="gap"?"ArrowDown":"ArrowUp");await key("Enter");}
button.onclick=async()=>{
  const lines:string[]=[];const check=(value:unknown,message:string)=>{if(!value)throw new Error(message);lines.push("PASS: "+message);};
  try{
    await waitFor(()=>Boolean(canvas()));await click("2D");await select("outline");document.getElementById("tools-tab-modify")!.click();await pause();
    check(find("Join")?.disabled&&!find("Explode")?.disabled&&!find("Break")?.disabled,"Closed contour selection exposes supported composition commands");
    const initial=state(),initialPast=past();await click("Explode");await ready();
    check(state()===initial&&past()===initialPast&&document.querySelector('[data-contour-preview-count="5"]'),"Explode previews five analytic pieces without mutating sources/history");
    await key("Escape");await waitFor(()=>!editor());check(state()===initial&&past()===initialPast&&document.activeElement===canvas(),"Canvas Escape cancels and returns focus without changing the document");
    await click("Explode");await ready();await click("Apply contour edit");await waitFor(()=>!editor());
    const pieces=[...cadDocument.rootObjects],arc=pieces.find(id=>feature(id).params.kind==="arc")!;
    check(pieces.length===5&&near(Number(feature(arc).params.radius),20)&&near(Number(feature(arc).params.endAngle)-Number(feature(arc).params.startAngle),Math.PI/2),"Native Apply separates an exact quarter-circle without facets");
    check(past()===initialPast+1&&document.activeElement===canvas(),"Apply is one Undo and returns to canvas input");
    const exploded=state();await click("Undo");check(state()===initial,"Explode Undo restores geometry, layer membership and topology");await click("Redo");check(state()===exploded,"Explode Redo restores the same piece identities");
    canvas().focus();await key("a",2);await click("Join");await ready();
    check(state()===exploded&&document.querySelector('[data-contour-preview-count="1"]'),"Ctrl+A and Join preview one exact closed contour");await click("Fit contour preview");await pause();
    if(new URLSearchParams(location.search).get("artifacts")==="1")(globalThis as any).cadTestArtifacts={"cad-contour-preview.png":(await(await input({type:"screenshot"})).json()).data};
    canvas().focus();await key("Enter");await waitFor(()=>!editor());
    const joined=cadDocument.rootObjects[0],joinedState=state(),joinedPast=past(),measurement=await measureDocumentObject(cadDocument,joined);
    check(cadDocument.rootObjects.length===1&&path(joined).closed&&near(measurement.area!,5600+100*Math.PI)&&near(measurement.length!,280+10*Math.PI),"Canvas Enter applies Join with independently calculated area/perimeter");
    check(JSON.stringify(deserializeDocument(serializeDocument(cadDocument)))===JSON.stringify(cadDocument),"Exact curves/topology survive native document serialization");
    await click("Break");await operation("gap");await field("First break point","5cm,0");await field("Second break point","@2cm,0");await ready();
    check(state()===joinedState&&past()===joinedPast,"Break accepts units and a relative second point without changing the original");await click("Apply contour edit");await waitFor(()=>!editor());
    const opened=cadDocument.rootObjects[0],openedState=state();
    check(!path(opened).closed&&near(contourLength(path(opened)),260+10*Math.PI)&&near(path(opened).segments[0].start[0],70)&&near(path(opened).segments.at(-1)!.end[0],50),"Break removes precisely 20 mm on the requested side");
    await click("Undo");check(state()===joinedState,"Gap Undo restores the joined contour");await click("Redo");check(state()===openedState,"Gap Redo restores the reviewed result and IDs");
    await select(opened);canvas().focus();await key("Enter");await waitFor(()=>Boolean(editor()));
    check(editor()?.textContent?.includes("Break contour"),"Idle Enter repeats the last contour command on the current selection");
    await field("First break point","30,0.01");await waitFor(()=>Boolean(editor()?.textContent?.includes("not on the contour")));
    check(find("Apply contour edit")?.disabled&&state()===openedState,"Off-curve coordinates explain rejection without silently snapping");
    await field("First break point","30,0");await ready();await dispatchCadCommand({type:"rename-object",objectId:opened,name:"Revised source"});
    await waitFor(()=>editor()?.dataset.contourGeneration===String(documentVersion().generation)&&Boolean(find("Apply contour edit")&&!find("Apply contour edit")?.disabled));
    check(editor()?.textContent?.includes("one Undo"),"Source changes invalidate and recalculate the proposal before Apply");
    await click("Fit contour preview");await click("Pick first point");
    const svg=document.querySelector<SVGElement>('[aria-label="Contour edit preview"]')!,ghost=svg.querySelector<SVGPolylineElement>('polyline[stroke="#61dcac"]')!,rect=svg.getBoundingClientRect();
    const candidate=Array.from(ghost.points).find(p=>p.x>360&&p.x<rect.width-30&&p.y>100&&p.y<rect.height-70);if(!candidate)throw new Error("No visible curve outside the editor");
    const oldValue=editor()?.querySelector<HTMLInputElement>('[aria-label="First break point"]')?.value,x=rect.left+candidate.x,y=rect.top+candidate.y;
    await input({type:"mouseMoved",x,y});await input({type:"mousePressed",x,y,button:"left",buttons:1});await input({type:"mouseReleased",x,y,button:"left",buttons:0});await pause();
    check(editor()?.querySelector<HTMLInputElement>('[aria-label="First break point"]')?.value!==oldValue,"Physical canvas picking fills exact coordinates on the analytic curve");
    await key("Escape");await waitFor(()=>!editor());await select(opened);
    await dispatchCadCommand({type:"create-dimension",id:"linked-dim",dimension:"linear",params:{workPlane:"XY",points:[[0,0],[100,0]],orientation:"aligned",offset:-5,sourceObjectId:opened}});
    await click("Break");await field("First break point","30,0");await waitFor(()=>Boolean(editor()?.textContent?.includes("references the selected contour")));
    check(find("Apply contour edit")?.disabled&&feature("linked-dim").params.sourceObjectId===opened,"Canvas explains dimension protection rather than severing its link");
    await click("Cancel contour edit");await key("k",2);await input({type:"text",text:"Break contour"});await pause();check(document.querySelector('dialog[open]')?.textContent?.includes("Break contour"),"Command palette exposes the same composition operation");await key("Escape");
    output.textContent=`${lines.join("\n")}\nALL ${lines.length} CHECKS PASSED`;
  }catch(e){output.textContent=`${lines.join("\n")}\nFAIL: ${e instanceof Error?e.stack:String(e)}`;}
};
installBrowserChecks(button,output);
