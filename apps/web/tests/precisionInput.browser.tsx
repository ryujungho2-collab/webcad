import { createRoot } from "react-dom/client";
import { App } from "../src/App";
import "../src/ui/tokens.css";import "../src/ui/workstation.css";import "../src/ui/commands.css";import "../src/ui/menu.css";import "../src/ui/explorer.css";import "../src/ui/inspector.css";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory } from "../src/state/history";
import { isDocumentCommandPending } from "../src/state/documentCommandQueue";
import { getWorldDrawingGeometry } from "../src/precision/worldGeometry";
import { worldToPlane, WORK_PLANES } from "../src/precision/workPlane";
import { installBrowserChecks } from "./helpers/browserChecks";
import { click,input,physical,pause,waitFor } from "./helpers/physicalInput";
createRoot(document.getElementById("root")!).render(<App/>);
const button=document.getElementById("run-precision") as HTMLButtonElement,output=document.getElementById("precision-result")!;
const canvas=()=>document.querySelector<HTMLCanvasElement>("#root canvas")!, tool=()=>document.querySelector('[data-point-mode]');
const state=()=>{const {revision:_,...rest}=cadDocument;return JSON.stringify(rest);};
const world=(id:string)=>getWorldDrawingGeometry(cadDocument.objects[id],Object.values(cadDocument.features).find(f=>f.output===id)!)!.points!;
async function keys(s:string){for(const key of s)await input({type:"key",key});await pause();}
async function enter(){await input({type:"key",key:"Enter"});await waitFor(()=>!isDocumentCommandPending());}
button.onclick=async()=>{button.disabled=true;button.style.display="none";const checks:string[]=[];const check=(ok:unknown,label:string)=>{if(!ok)throw new Error(label);checks.push(`PASS: ${label}`);};try{
  await waitFor(()=>!!canvas());await click("New document");await click("2D");await physical(document.getElementById("tools-tab-draw")!);
  await click("Line");canvas().focus();await keys("0,0");await enter();await keys("1in");await input({type:"key",key:"Tab"});
  await keys("-");const initial=state(),h=cadHistory.getPastLabels().length;await input({type:"key",key:"Tab"});await pause();
  check(state()===initial&&cadHistory.getPastLabels().length===h&&document.body.innerText.includes("Invalid angle"),"Invalid drawing Tab preserves draft, source and history");
  await input({type:"key",key:"Backspace"});await keys("90deg");await enter();await input({type:"key",key:"Escape"});
  const id=cadDocument.rootObjects[0];check(Math.abs(world(id)[1][0])<1e-9&&world(id)[1][1]===25.4,"Drawing recovery uses 1in length and 90deg active angle");
  await click("Move by points");await keys("0,0");await enter();await keys("2cm");await input({type:"key",key:"Tab"});await keys("90deg");
  const before=state(),history=cadHistory.getPastLabels().length;await enter();await waitFor(()=>!tool());
  check(Math.abs(world(id)[0][0])<1e-9&&Math.abs(world(id)[0][1]-20)<1e-9&&cadHistory.getPastLabels().length===history+1,`Move Enter resolves active angle as degrees and commits once: ${JSON.stringify(world(id))}, history ${history}->${cadHistory.getPastLabels().length}`);
  await click("Undo");check(state()===before,"Undo restores the exact unrounded source");await click("Redo");
  await click("Move by points");await keys("0,0");await enter();await keys("1cm");await input({type:"key",key:"Tab"});await keys("90deg");
  const rect=canvas().getBoundingClientRect();await input({type:"mouseMoved",x:rect.left+rect.width*.6,y:rect.top+rect.height*.6});await pause();
  await input({type:"mousePressed",x:rect.left+rect.width*.6,y:rect.top+rect.height*.6,button:"left",buttons:1});await input({type:"mouseReleased",x:rect.left+rect.width*.6,y:rect.top+rect.height*.6,button:"left",buttons:0});await waitFor(()=>!tool());
  check(Math.abs(world(id)[0][0])<1e-9&&Math.abs(world(id)[0][1]-30)<1e-9,"Move pointer confirmation uses the numeric endpoint after pointer motion");
  await click("Move by points");await keys("0,0");await enter();await keys("1cm");await input({type:"key",key:"Tab"});await keys("oops");
  const bad=state(),badHistory=cadHistory.getPastLabels().length;await enter();check(state()===bad&&cadHistory.getPastLabels().length===badHistory&&!!tool(),"Invalid angle Enter never falls back to length or pointer");
  await input({type:"key",key:"Escape"});await input({type:"key",key:"Escape"});await input({type:"key",key:"Escape"});await waitFor(()=>!tool());
  await physical(document.getElementById("tools-tab-draw")!);await click("Line");canvas().focus();await keys("2cm,3cm");await enter();await keys("@1in<90deg");await enter();await input({type:"key",key:"Escape"});
  const last=world(cadDocument.rootObjects.at(-1)!);check(Math.abs(last[1][0]-20)<1e-9&&Math.abs(last[1][1]-55.4)<1e-9,"Drawing relative polar input shares unit conversion with locks");
  for(const [previous,plane] of [["XY","XZ"],["XZ","YZ"]] as const){
    await click(`Work plane ${previous}`);await physical(document.getElementById("tools-tab-draw")!);await click("Line");canvas().focus();await keys("1cm,2cm");await enter();await keys("@2cm<90deg");await enter();await input({type:"key",key:"Escape"});
    const source=cadDocument.rootObjects.at(-1)!,p=world(source).map(v=>worldToPlane(v,WORK_PLANES[plane]));check(Math.abs(p[1][0]-10)<1e-9&&Math.abs(p[1][1]-40)<1e-9,`${plane} numeric drawing preserves local coordinates and units`);
    await click("Move by points");await keys("0,0");await enter();await keys("1cm");await input({type:"key",key:"Tab"});await keys("90deg");await enter();await waitFor(()=>!tool());
    const moved=worldToPlane(world(source)[0],WORK_PLANES[plane]);check(Math.abs(moved[0]-10)<1e-9&&Math.abs(moved[1]-30)<1e-9,`${plane} numeric Move uses the same plane basis as drawing`);
  }
  await click("Work plane YZ");await physical(document.getElementById("tools-tab-draw")!);await click("Rectangle");canvas().focus();await keys("10,20");await enter();await keys("2cm,1in");
  const box=canvas().getBoundingClientRect();await input({type:"mouseMoved",x:box.left+box.width*.55,y:box.top+box.height*.55});await input({type:"mousePressed",x:box.left+box.width*.55,y:box.top+box.height*.55,button:"left",buttons:1});await input({type:"mouseReleased",x:box.left+box.width*.55,y:box.top+box.height*.55,button:"left",buttons:0});await waitFor(()=>!isDocumentCommandPending());await input({type:"key",key:"Escape"});
  const rectangle=world(cadDocument.rootObjects.at(-1)!);check(rectangle[2][0]===30&&Math.abs(rectangle[2][1]-45.4)<1e-9,"Rectangle pointer confirmation preserves width/height units rather than pointer coordinates");
  await click("Arc");canvas().focus();await keys("0,0");await enter();await keys("1cm<0deg");await enter();await keys("oops<90");const arcBefore=state();await enter();check(state()===arcBefore,"Invalid arc radius cannot silently use the previous radius");
  for(let i=0;i<7;i++)await input({type:"key",key:"Backspace"});await keys("2cm<90deg");await enter();await input({type:"key",key:"Escape"});
  const arcId=cadDocument.rootObjects.at(-1)!,arc=Object.values(cadDocument.features).find(f=>f.output===arcId)!;check(arc.params.radius===20&&Math.abs(Number(arc.params.endAngle)-Math.PI/2)<1e-9,"Arc radius/sweep commit preserves the same draft as preview");
  await click("Copy by points");await keys("0,0");await enter();await keys("1in");await input({type:"key",key:"Tab"});await keys("90deg");await enter();
  const copied=cadDocument.objects[cadDocument.rootObjects.at(-1)!];check(copied.id!==arcId&&Math.abs((copied.transform?.translation[1]??0)-25.4)<1e-9,"Copy shares the length/angle unit resolver with Move");await enter();await waitFor(()=>!tool());
  output.textContent=[...checks,`ALL ${checks.length} CHECKS PASSED`].join("\n");
}catch(e){output.textContent=[...checks,`FAIL: ${e instanceof Error?e.stack:String(e)}`].join("\n");}};
installBrowserChecks(button,output);
