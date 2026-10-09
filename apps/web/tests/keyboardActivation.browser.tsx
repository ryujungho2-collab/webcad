import { createRoot } from "react-dom/client";
import { App } from "../src/App";
import "../src/ui/tokens.css";import "../src/ui/workstation.css";import "../src/ui/commands.css";import "../src/ui/menu.css";import "../src/ui/explorer.css";import "../src/ui/inspector.css";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory } from "../src/state/history";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { saveDocumentToCache } from "../src/state/documentFile";
import { isDocumentCommandPending } from "../src/state/documentCommandQueue";
import { resetTestDocument } from "./helpers/documentHarness";
import { installBrowserChecks } from "./helpers/browserChecks";
import { click,find,input,physical,pause,text,waitFor } from "./helpers/physicalInput";
import type { CadCommand } from "@agent-webcad/cad-commands";
resetTestDocument();
async function apply(c:CadCommand){const r=await dispatchCadCommand(c);if(!r.ok)throw new Error(r.reason);}
await apply({type:"create-drawing",id:"line",name:"Keyboard line",drawing:"line",params:{workPlane:"XY",points:[[0,0,0],[10,0,0]]}});
await apply({type:"define-block",id:"symbol",name:"Keyboard symbol",objectIds:["line"],base:[0,0,0]});
await apply({type:"insert-block",id:"component",blockId:"symbol",position:[25,0,0]});cadDocument.objects.component.name="Keyboard component";
await apply({type:"create-pattern",id:"recipe",sourceObjectIds:["line"],spec:{kind:"linear",workPlane:"XY",columns:2,rows:1,spacing:[20,20]}});
const member=Object.values(cadDocument.features).find(f=>f.pattern)!.output;cadDocument.objects[member].name="Keyboard pattern member";
await apply({type:"create-sketch",id:"keyboard-sketch",workPlane:"XY"});
await apply({type:"add-sketch-geometry",sketchId:"keyboard-sketch",geometry:{id:"sketch-circle",kind:"circle",center:[0,15],radius:3,centerId:"sc",curveId:"circle-curve"}});
await apply({type:"add-sketch-constraint",sketchId:"keyboard-sketch",constraint:{id:"circle-radius",kind:"radius",geometryId:"sketch-circle",value:3}});
await apply({type:"create-layer",id:"locked",name:"Locked"});await apply({type:"create-drawing",id:"locked-line",name:"Keyboard locked",drawing:"line",layerId:"locked",params:{workPlane:"XY",points:[[0,25,0],[10,25,0]]}});await apply({type:"set-layer-locked",layerId:"locked",locked:true});
saveDocumentToCache();createRoot(document.getElementById("root")!).render(<App/>);
const button=document.getElementById("run-activation") as HTMLButtonElement,output=document.getElementById("activation-result")!;
const canvas=()=>document.querySelector<HTMLCanvasElement>("#root canvas")!,row=(id:string)=>document.querySelector<HTMLElement>(`[data-model-object-id="${id}"]`)!,pointTool=()=>document.querySelector<HTMLElement>('[data-point-mode]'),review=()=>document.querySelector<HTMLElement>('[data-testid="direct-edit-review"]');
const semantic=()=>{const {revision:_,...rest}=cadDocument;return JSON.stringify(rest);},past=()=>cadHistory.getPastLabels().length;
async function keys(value:string){for(const key of value)await input({type:"key",key});await pause();}
async function enter(element:HTMLElement,key="Enter"){element.scrollIntoView({block:"center"});element.focus();await input({type:"key",key});await waitFor(()=>!isDocumentCommandPending());}
button.onclick=async()=>{
  button.disabled=true;const checks:string[]=[],check=(ok:unknown,name:string)=>{if(!ok)throw new Error(name);checks.push(`PASS: ${name}`);output.textContent=checks.join("\n");};
  try{
    await waitFor(()=>!!canvas());await click("2D");await physical(row("line").querySelector(".tree-label")!);await click("Move by points");await keys("0,0");await input({type:"key",key:"Enter"});await keys("2,0");await input({type:"key",key:"Enter"});await waitFor(()=>!pointTool());
    const moved=semantic(),h=past();await enter(find("Hide Keyboard line"));
    check(!cadDocument.objects.line.visible&&past()===h+1,"Enter on nested Explorer visibility activates that button once instead of selecting the row or repeating Move");
    await enter(find("Show Keyboard line")," ");check(cadDocument.objects.line.visible&&!pointTool()&&past()===h+2,"Space activates Show once while preserving the last canvas command");
    await enter(row("line"));
    await enter(find("Direct"));await waitFor(()=>find("Direct").getAttribute("aria-pressed")==="true");check(!pointTool(),"Enter on ribbon Direct activates selection mode rather than repeating the previous Move");
    await enter(find("Object")," ");check(find("Object").getAttribute("aria-pressed")==="true"&&!pointTool(),"Space on ribbon Object uses its native activation and does not start a drawing operation");
    // A canvas Enter still repeats the saved point command.
    canvas().focus();await input({type:"key",key:"Enter"});await waitFor(()=>pointTool()?.dataset.pointStage==="base");check(semantic()===moved,"Canvas Enter retains CAD command repeat after button activation");
    await enter(find("Fit all geometry"));check(pointTool()?.dataset.pointStage==="base"&&semantic()===moved&&past()===h+2,"Focused Fit Enter during an active Move preserves its base stage and history instead of accepting a point");canvas().focus();
    await keys("0,0");await input({type:"key",key:"Enter"});await keys("3,0");await input({type:"key",key:"Enter"});await waitFor(()=>!pointTool());const repeated=semantic();check(past()===h+3&&cadDocument.objects.line.transform?.translation[0]===5,"Repeated native precision Move applies exactly once to the selected line");
    const hide=find("Hide Keyboard line");hide.focus();await input({type:"key",key:"z",modifiers:2});await waitFor(()=>!isDocumentCommandPending());check(semantic()===moved,"Ctrl+Z on a nontext control keeps document history ownership");await input({type:"key",key:"y",modifiers:2});await waitFor(()=>!isDocumentCommandPending());check(semantic()===repeated,"Ctrl+Y restores the repeated Move with stable selection and geometry");
    for(const [id,name] of [["component","Keyboard component"],[member,"Keyboard pattern member"],["sketch-circle",cadDocument.objects["sketch-circle"].name]]){
      const before=semantic(),n=past();await enter(find(`Hide ${name}`));check(!cadDocument.objects[id].visible&&past()===n+1,`Enter activates visibility for ${id} without editing its definition or repeating a transform`);
      await enter(find(`Show ${name}`)," ");check(cadDocument.objects[id].visible&&semantic()===before,`Space restores visibility and all references for ${id}`);
    }
    const locked=semantic(),n=past();await enter(find("Hide Keyboard locked"));check(semantic()===locked&&past()===n&&!pointTool(),"Locked target activation preserves document/history and does not fall through to a repeated command");
    // Row-owned keyboard selection remains available for overlapping source/member geometry.
    await enter(row("component"));check(row("component").getAttribute("aria-pressed")==="true"&&!pointTool(),"Role-button row Enter still selects a component independently of overlapping pattern geometry");
    const componentStart=cadDocument.objects.component.transform?.translation[0] ?? 25,definition=JSON.stringify(cadDocument.blocks!.symbol);await click("Move by points");await keys("0,0");await input({type:"key",key:"Enter"});await keys("4,0");await input({type:"key",key:"Enter"});await waitFor(()=>!pointTool());check(cadDocument.objects.component.transform?.translation[0]===componentStart+4&&JSON.stringify(cadDocument.blocks!.symbol)===definition,"Component numeric Move updates its placement without changing the definition");
    // Text editors keep native keys; a keyboard grip uses its own reviewed form.
    await enter(row("sketch-circle"));await click("Direct");await click("Fit all geometry");await waitFor(()=>!!document.querySelector('[data-direct-handle="sketch-circle:radius:0"]'));
    const grip=document.querySelector<SVGRectElement>('[data-direct-handle="sketch-circle:radius:0"]')!;grip.focus();await input({type:"key",key:"Enter"});await waitFor(()=>!!review());
    await text("Direct target X","5mm");await waitFor(()=>review()?.dataset.previewStatus==="ready");const source=semantic(),g=past();
    await text("Direct target X","oops");await input({type:"key",key:"Enter"});await pause();check(semantic()===source&&past()===g&&review()?.dataset.previewStatus==="blocked"&&review()?.querySelector('[role="alert"]'),"Enter inside an invalid numeric grip draft preserves source/history and form ownership");
    await text("Direct target X","5mm");await waitFor(()=>review()?.dataset.previewStatus==="ready");await input({type:"key",key:"Enter"});await waitFor(()=>!review());const radius=cadDocument.sketches!["keyboard-sketch"].constraints.find(c=>c.id==="circle-radius");check(radius?.kind==="radius"&&radius.value===5&&past()===g+1,"Numeric grip Enter applies the exact 5 mm sketch driver once through its own form");
    await input({type:"key",key:"Enter"});await waitFor(()=>!!review());await text("Direct target X","6mm");await waitFor(()=>review()?.dataset.previewStatus==="ready");const beforeEsc=semantic();await input({type:"key",key:"Escape"});await waitFor(()=>!review());check(semantic()===beforeEsc&&document.activeElement?.getAttribute("data-direct-handle")==="sketch-circle:radius:0","Grip Esc cancels the proposal and returns keyboard focus for another edit");
    output.textContent=[...checks,`ALL ${checks.length} CHECKS PASSED`].join("\n");
  }catch(e){output.textContent=[...checks,`FAIL: ${e instanceof Error?e.stack:String(e)}`,`Review: ${review()?.outerHTML ?? "closed"}`].join("\n");}
};installBrowserChecks(button,output);
