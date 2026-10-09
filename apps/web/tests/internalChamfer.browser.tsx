import { createRoot } from "react-dom/client";
import { App } from "../src/App";
import "../src/ui/tokens.css";import "../src/ui/workstation.css";import "../src/ui/commands.css";import "../src/ui/menu.css";import "../src/ui/explorer.css";import "../src/ui/inspector.css";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory } from "../src/state/history";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { saveDocumentToCache } from "../src/state/documentFile";
import { serializeDocument,deserializeDocument } from "@agent-webcad/cad-document";
import { buildExtrudeMesh } from "../src/cad/kernelGeometryService";
import type { DrawingTopology } from "../src/precision/drawingTopology";
import { resetTestDocument,meshVolume } from "./helpers/documentHarness";
import { installBrowserChecks } from "./helpers/browserChecks";
import { click,text,physical,input,pause,waitFor } from "./helpers/physicalInput";
resetTestDocument();
const feature=(id="profile")=>Object.values(cadDocument.features).find(f=>f.output===id)!;
await dispatchCadCommand({type:"create-drawing",id:"profile",name:"Corner plate",drawing:"rectangle",params:{workPlane:"XY",points:[[0,0,0],[20,0,0],[20,10,0],[0,10,0]]}});
const topology=structuredClone(feature().params.topology) as DrawingTopology,cornerId=topology.controls[1].id;
await dispatchCadCommand({type:"create-dimension",id:"length",dimension:"linear",params:{sourceObjectId:"profile",sourceSegmentId:topology.segments[0].id,points:[[0,0],[20,0]]}});
await dispatchCadCommand({type:"create-extrude",id:"plate",profileObjectIds:["profile"],distance:5});
saveDocumentToCache();createRoot(document.getElementById("root")!).render(<App/>);
const button=document.getElementById("run-corner") as HTMLButtonElement,output=document.getElementById("corner-result")!;
const editor=()=>document.querySelector<HTMLFormElement>('[aria-label="Corner chamfer editor"]'),canvas=()=>document.querySelector<HTMLCanvasElement>("#root canvas")!;
const submit=()=>editor()?.querySelector<HTMLButtonElement>('button[type="submit"]'),ready=()=>waitFor(()=>!!submit()&&!submit()!.disabled);
const exact=()=>JSON.stringify(cadDocument),semantic=()=>{const {revision:_,...rest}=cadDocument;return JSON.stringify(rest);},past=()=>cadHistory.getPastLabels().length,near=(a:number,b:number)=>Math.abs(a-b)<1e-5;
const guides=()=>[...document.querySelectorAll('[data-corner-setback]')];
const field=(label:string)=>document.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;
const label1="D1 · previous edge",label2="D2 · next edge";
function guideRatio(i:number){const source=document.querySelector<SVGPolylineElement>('[aria-label="Corner chamfer preview"] polyline[stroke="#ffb282"]')!,p=source.getAttribute("points")!.split(" ").map(s=>s.split(",").map(Number)),g=guides()[i].querySelector("line")!;return Math.hypot(Number(g.getAttribute("x2"))-Number(g.getAttribute("x1")),Number(g.getAttribute("y2"))-Number(g.getAttribute("y1")))/Math.hypot(p[i+1][0]-p[i][0],p[i+1][1]-p[i][1]);}
async function start(){
  await physical(document.querySelector('[data-model-object-id="profile"] .tree-label')!);await click("Direct");await click("Fit all geometry");
  await waitFor(()=>!!document.querySelector(`[data-direct-handle="${cornerId}"]`));
  const r=document.querySelector(`[data-direct-handle="${cornerId}"]`)!.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
  if(document.elementFromPoint(x,y)!==canvas())throw new Error("Corner grip is obscured");
  await input({type:"mousePressed",x,y,button:"left",buttons:1});await input({type:"mouseReleased",x,y,button:"left",buttons:0});await pause();
  const chamfer=[...document.querySelectorAll<HTMLButtonElement>('.property-actions button')].find(b=>b.textContent?.trim()==="Chamfer"&&!b.disabled);if(!chamfer)throw new Error("Internal Chamfer not discovered in Properties");await physical(chamfer);await waitFor(()=>!!editor());
}
button.onclick=async()=>{
  button.disabled=true;const checks:string[]=[],check=(ok:unknown,name:string)=>{if(!ok)throw new Error(name);checks.push(`PASS: ${name}`);output.textContent=checks.join("\n");};
  try{
    await waitFor(()=>!!canvas());await click("2D");await start();const before=exact(),beforeSemantic=semantic(),h=past();
    check(editor()!.textContent!.includes("previous edge")&&editor()!.textContent!.includes("next edge"),"Discover Properties Chamfer through a native corner pick with explicit contour-order assignment");
    await text(label1,"3mm");await text(label2,".7cm");await ready();await click("Fit corner preview");await pause();
    check(guides().length===2&&near(guideRatio(0),3/20)&&near(guideRatio(1),7/10)&&document.querySelector('[data-corner-preview-count]')?.getAttribute("data-corner-preview-count")==="1","Exact transient canvas preview independently matches both assigned setback ratios");
    check(exact()===before&&past()===h,"Corner preview and downstream review preserve source bytes and history");
    const review=editor()!.querySelector('[aria-label="Corner chamfer review"]')!;await physical(review.querySelector("details summary")!);
    check(review.textContent!.includes("Dimensions")&&review.textContent!.includes("Extrusions"),"Impact review exposes affected edge dimension and live extrusion");
    await click("Swap corner distances");await ready();check(field(label1).value===".7cm"&&field(label2).value==="3mm","Swap exchanges D1/D2 without changing the retained corner target");
    await text(label2,"10mm");await waitFor(()=>!!submit()?.disabled&&!!editor()?.textContent?.includes("D2 consumes the next edge"));
    check(exact()===before&&past()===h&&editor()!.querySelector('[role="alert"]'),"Consumed next edge reports D2-specific recovery with no partial mutation");
    await text(label2,"oops");await waitFor(()=>field(label2).getAttribute("aria-invalid")==="true"&&!!editor()?.textContent?.includes("D2 needs"));check(!!submit()?.disabled,"Invalid units keep the draft editable and block Apply");
    await text(label1,"3mm");await text(label2,"7mm");check(!!submit()?.disabled,"New draft cannot apply an old plan before review");await ready();
    await click("Equal corner distances");await ready();check(field(label2).value==="3mm","Equal action restores symmetric operation through the same reviewed path");
    await text(label2,"7mm");await ready();await click("Cancel corner edit");await waitFor(()=>!editor());check(exact()===before&&past()===h&&!guides().length&&document.activeElement===canvas(),"Cancel clears review and guides, retains geometry/history and restores focus");
    // Direct remains active after Cancel; turn it off so start() enters it again.
    await click("Direct");await start();await text(label1,"3mm");await text(label2,"7mm");await ready();
    await dispatchCadCommand({type:"set-layer-locked",layerId:"layer-default",locked:true});await waitFor(()=>!!submit()?.disabled&&!!editor()?.textContent?.includes("unlock"));
    const locked=exact();canvas().focus();await input({type:"key",key:"Enter"});await pause();check(exact()===locked&&field(label1).value==="3mm"&&field(label2).value==="7mm","Lock invalidates review while retaining the target and both inputs; canvas Enter cannot mutate");
    await dispatchCadCommand({type:"set-layer-locked",layerId:"layer-default",locked:false});await ready();await click("Fit corner preview");canvas().focus();await input({type:"key",key:"Enter"});await waitFor(()=>!!editor()?.querySelector('[data-command-stage="completed"]'));
    check(JSON.stringify((feature().params.points as number[][]).slice(1,3))==="[[17,0,0],[20,7,0]]","Canvas Enter commits the exact reviewed 3/7 mm internal chamfer");
    check(JSON.stringify(feature("length").params.points)==="[[0,0],[17,0]]"&&near(meshVolume(await buildExtrudeMesh(feature("plate").params)),947.5),"Real Worker solid and edge dimension update with an independent volume oracle");
    check(past()===h+3&&topology.segments.every(s=>(feature().params.topology as DrawingTopology).segments.some(n=>n.id===s.id)),"Chamfer adds one history item and retains previous/next edge reference identities");
    check(document.querySelector('[data-model-object-id="profile"][aria-pressed="true"]')&&editor()!.textContent!.includes("Extrude result"),"Apply selects the edited contour and exposes further CAD actions");
    check(JSON.stringify(deserializeDocument(serializeDocument(cadDocument)))===exact(),"Result, references and live profile survive v14 JSON reload");
    await click("Finish corner edit");const after=semantic();await click("Undo");check(semantic()===beforeSemantic,"One Undo restores the complete pre-chamfer state including dimensions and extrusion");await click("Redo");check(semantic()===after,"Redo restores all reviewed geometry and reference identities");
    output.textContent=[...checks,`ALL ${checks.length} CHECKS PASSED`].join("\n");
  }catch(e){output.textContent=[...checks,`FAIL: ${e instanceof Error?e.stack:String(e)}`].join("\n");}
};installBrowserChecks(button,output);
