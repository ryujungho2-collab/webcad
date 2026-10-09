import { createRoot } from "react-dom/client";
import { App } from "../src/App";
import "../src/ui/tokens.css"; import "../src/ui/workstation.css"; import "../src/ui/commands.css"; import "../src/ui/menu.css"; import "../src/ui/explorer.css"; import "../src/ui/inspector.css";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory } from "../src/state/history";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { saveDocumentToCache } from "../src/state/documentFile";
import { exactDrawingContour, contourLength } from "../src/features/drawing-editing/geometry/contourEditing";
import { serializeDocument, deserializeDocument } from "@agent-webcad/cad-document";
import { resetTestDocument } from "./helpers/documentHarness";
import { installBrowserChecks } from "./helpers/browserChecks";
import { click, text, waitFor, physical, input, pause } from "./helpers/physicalInput";
resetTestDocument();
for(const [id,name,points] of [["a","Chamfer target",[[0,0,0],[20,0,0]]],["b","Chamfer second",[[0,0,0],[0,20,0]]]] as const){const result=await dispatchCadCommand({type:"create-drawing",id,name,drawing:"line",params:{workPlane:"XY",points}});if(!result.ok)throw new Error(result.reason);}
saveDocumentToCache();createRoot(document.getElementById("root")!).render(<App/>);
const button=document.getElementById("run-chamfer") as HTMLButtonElement,output=document.getElementById("chamfer-result")!;
const editor=()=>document.querySelector<HTMLFormElement>('form[aria-label="Curve workflow"]'),canvas=()=>document.querySelector<HTMLCanvasElement>("#root canvas")!;
const feature=(id:string)=>Object.values(cadDocument.features).find(f=>f.output===id)!,path=(id:string)=>exactDrawingContour(cadDocument.objects[id],feature(id));
const exact=()=>JSON.stringify(cadDocument),semantic=()=>{const {revision:_,...rest}=cadDocument;return JSON.stringify(rest);},past=()=>cadHistory.getPastLabels().length,near=(a:number,b:number)=>Math.abs(a-b)<1e-5;
const apply=()=>editor()?.querySelector<HTMLButtonElement>('button[type="submit"]'),ready=()=>waitFor(()=>!!apply()&&!apply()!.disabled);
async function select(){await physical(document.querySelector('[data-model-object-id="a"] .tree-label')!);await physical(document.querySelector('[data-model-object-id="b"] .tree-label')!,2);}
const field=(name:string)=>editor()!.querySelector<HTMLInputElement>(`[aria-label="${name}"]`)!;
const guides=()=>[...document.querySelectorAll<SVGGElement>('[data-chamfer-distance]')];
function ratio(index:number){const line=guides()[index].querySelector("line")!,d=Math.hypot(Number(line.getAttribute("x2"))-Number(line.getAttribute("x1")),Number(line.getAttribute("y2"))-Number(line.getAttribute("y1")));const source=[...document.querySelectorAll<SVGPolylineElement>('[data-curve-workflow-preview] polyline[stroke="#e7b369"]')][index],p=source.getAttribute("points")!.split(" ").map(s=>s.split(",").map(Number));return d/Math.hypot(p[1][0]-p[0][0],p[1][1]-p[0][1]);}
button.onclick=async()=>{
  button.disabled=true;const checks:string[]=[],check=(v:unknown,s:string)=>{if(!v)throw new Error(s);checks.push(`PASS: ${s}`);output.textContent=checks.join("\n");};
  try{
    await waitFor(()=>!!canvas());await click("2D");await select();await physical(document.getElementById("tools-tab-modify")!);await click("Curve workflow");await click("Chamfer");
    const before=exact(),beforeSemantic=semantic(),h=past(),topology=JSON.stringify([feature("a").params.topology,feature("b").params.topology]);
    await text("Workflow distance","3mm");await text("Workflow second distance",".7cm");await ready();await click("Fit workflow preview");await pause();
    check(editor()!.textContent!.includes("D1: Chamfer target · D2: Chamfer second"),"Review assigns each distance to a named target rather than an unnamed side");
    check(guides().length===2&&near(ratio(0),3/20)&&near(ratio(1),7/20),"Canvas D1/D2 guides show actual supporting-corner setbacks on each source");
    check(exact()===before&&past()===h,"Unit-aware two-distance preview leaves the original document and Undo untouched");
    await click("Swap D1 / D2");await ready();check(field("Workflow distance").value===".7cm"&&field("Workflow second distance").value==="3mm"&&near(ratio(0),7/20)&&near(ratio(1),3/20),"Swap exchanges the reviewed distances and canvas guides without exchanging targets");
    await text("Workflow second distance","20mm");await waitFor(()=>!!apply()?.disabled&&!!editor()?.textContent?.includes("D2 consumes"));
    check(exact()===before&&past()===h,"Oversized D2 names the second retained segment and rejects the entire edit");
    await text("Workflow second distance","nope");await waitFor(()=>!!apply()?.disabled&&field("Workflow second distance").getAttribute("aria-invalid")==="true");
    check(editor()!.textContent!.includes("D2 on the second curve needs"),"Invalid numeric input offers D2-specific recovery while keeping the workflow open");
    await text("Workflow distance","3mm");await text("Workflow second distance","7mm");check(!!apply()?.disabled,"Changing the draft immediately blocks the previous reviewed plan");await ready();
    await click("Use equal distances");await ready();check(field("Workflow second distance").value==="3mm"&&near(ratio(0),ratio(1)),"Equal-distances action restores symmetric chamfer through the same precision/preview path");
    await text("Workflow second distance","7mm");await ready();await click("Cancel workflow");await waitFor(()=>!editor());
    check(exact()===before&&past()===h&&document.activeElement===canvas(),"Cancel removes the guides, preserves source/history and returns canvas focus");
    await click("Curve workflow");await click("Chamfer");await text("Workflow distance","3mm");await text("Workflow second distance","7mm");await ready();
    await dispatchCadCommand({type:"set-layer-locked",layerId:"layer-default",locked:true});await waitFor(()=>!!apply()?.disabled);
    const locked=exact();canvas().focus();await input({type:"key",key:"Enter"});await pause();check(exact()===locked,"Locking a reviewed source blocks canvas Enter and preserves the model");
    await dispatchCadCommand({type:"set-layer-locked",layerId:"layer-default",locked:false});await ready();await click("Fit workflow preview");
    canvas().focus();await input({type:"key",key:"Enter"});await waitFor(()=>!!editor()?.textContent?.includes("Chamfer applied"));
    const connector=cadDocument.rootObjects.find(id=>id.startsWith("chamfer-"))!;
    check(near(path(connector).segments[0].start[0],3)&&near(path(connector).segments[0].end[1],7)&&near(contourLength(path(connector)),Math.sqrt(58)),"Canvas Enter applies exact 3 mm / 7 mm geometry from the reviewed plan");
    check(past()===h+3&&topology===JSON.stringify([feature("a").params.topology,feature("b").params.topology]),"Chamfer uses one Undo in addition to lock/unlock and retains both sources' topology IDs");
    check([...document.querySelectorAll('[data-model-object-id][aria-pressed="true"]')].length===3&&editor()!.textContent!.includes("Join result"),"Apply selects all three result objects and offers Join without reselection");
    await click("Join result");await ready();await click("Apply workflow edit");await waitFor(()=>!!editor()?.textContent?.includes("Join applied"));
    const joined=cadDocument.rootObjects.find(id=>!['a','b',connector].includes(id))!;
    check(!cadDocument.objects.a&&!cadDocument.objects.b&&!cadDocument.objects[connector]&&near(contourLength(path(joined)),30+Math.sqrt(58)),"Result handoff joins the chamfer chain with independently checked exact length");
    check(JSON.stringify(deserializeDocument(serializeDocument(cadDocument)))===exact(),"Joined topology and analytic geometry survive JSON save/reload");
    await click("Finish workflow");const after=semantic();await click("Undo");check(!!cadDocument.objects.a&&!!cadDocument.objects.b&&!!cadDocument.objects[connector],"Undo Join restores the same three reviewed objects");await click("Undo");check(semantic()===beforeSemantic,"Undo Chamfer restores source geometry and topology");await click("Redo");await click("Redo");check(semantic()===after,"Redo restores the exact completed contour and identity");
    output.textContent=[...checks,`ALL ${checks.length} CHECKS PASSED`].join("\n");
  }catch(e){output.textContent=[...checks,`FAIL: ${e instanceof Error?e.stack:String(e)}`].join("\n");}
};
installBrowserChecks(button,output);
