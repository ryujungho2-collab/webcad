import {createRoot} from "react-dom/client";
import {App} from "../src/App";
import "../src/styles.css";import "../src/ui/tokens.css";import "../src/ui/workstation.css";import "../src/ui/commands.css";import "../src/ui/menu.css";import "../src/ui/explorer.css";import "../src/ui/inspector.css";
import {cadDocument} from "../src/state/cadDocument";
import {cadHistory} from "../src/state/history";
import {serializeDocument} from "@agent-webcad/cad-document";
import {saveDocumentToCache} from "../src/state/documentFile";
import {measureDocumentObject} from "../src/state/documentQuery";
import {installEditableLoft} from "./helpers/loftFixture";
import {click,text,choose,waitFor,input,physical} from "./helpers/physicalInput";
import {installBrowserChecks} from "./helpers/browserChecks";
createRoot(document.getElementById("root")!).render(<App/>);
const button=document.getElementById("run-loft") as HTMLButtonElement,output=document.getElementById("loft-result")!;
const canonical=(v:any):any=>Array.isArray(v)?v.map(canonical):v&&typeof v==="object"?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const state=()=>{const{revision:_,...d}=cadDocument;return JSON.stringify(canonical(d));};
const feature=()=>cadDocument.features["feature-editableLoft"];
const applyButton=()=>[...document.querySelectorAll<HTMLButtonElement>('[aria-label="Shared proposal review"] button')].find(b=>b.textContent==="Apply");
const ready=()=>waitFor(()=>!!applyButton()&&!applyButton()!.disabled);
async function host(body:unknown){const r=await fetch(`/__browser_mcp?run=${new URLSearchParams(location.search).get("run")}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const v=await r.json();if(!r.ok)throw Error(v.error);return v;}
async function call(name:string,args:unknown={}){const r=await host({action:"call",name,arguments:args});if(r.isError)throw Error(JSON.stringify(r.structuredContent));return r.structuredContent.result;}
button.onclick=async()=>{button.disabled=true;const checks:string[]=[];const check=(v:unknown,label:string)=>{if(!v)throw Error(label);checks.push("PASS: "+label);output.textContent=checks.join("\n");};try{
 await waitFor(()=>!!document.querySelector("canvas"));const checkpoint=sessionStorage.getItem("loft-edit-reopen");
 if(checkpoint){const saved=JSON.parse(checkpoint);checks.push(...saved.checks);await waitFor(()=>!!feature());check(state()===saved.state,"Reload retains the same loft, live sections and smooth mode");const m=await measureDocumentObject(cadDocument,"editableLoft");check(m.validity==="valid"&&Math.abs(m.volume!-saved.volume)<.01,"Reloaded BRep reproduces verified volume");sessionStorage.removeItem("loft-edit-reopen");(globalThis as any).cadTestArtifacts=saved.artifacts;output.textContent=checks.join("\n")+`\nALL ${checks.length} CHECKS PASSED`;return;}
 await click("New document");await installEditableLoft();cadHistory.clear();await click("3D");await click("Copilot");await choose("Copilot planner",0);await click("Choose tool targets");await text("Find tool target","editableLoft");await click("Use target");
 const before=state(),initial=await measureDocumentObject(cadDocument,"editableLoft");await click("부드러운 곡면으로");await ready();check(state()===before,"Inspector reviews real loft conversion without publishing");
 await click("Apply");await waitFor(()=>feature().params.ruled===false&&!applyButton());const smooth=state(),m=await measureDocumentObject(cadDocument,"editableLoft");check(m.validity==="valid"&&Math.abs(m.volume!-initial.volume!)>100,"Inspector changes the actual three-section BRep curvature");check(cadHistory.getPastLabels().length===1&&feature().inputs.join(",")==="section0,section1,section2","Same object and ordered live source sections survive in one history entry");
 await click("Undo");check(state()===before,"One UI Undo restores the ruled model");await click("Redo");check(state()===smooth,"UI Redo restores the smooth model");
 await text("Copilot prompt","선택한 로프트를 직선 연결로 바꿔줘");await click("Plan");await ready();check(state()===smooth,"Follow-up natural language shares the selected manual object and detached preview");await click("Apply");await waitFor(()=>feature().params.ruled===true&&!applyButton());check(state()===before,"Natural language reverses the manual conversion exactly");
 await click("Enable CAD MCP");await waitFor(()=>!!document.querySelector('[aria-label="CAD MCP client configuration"]'));await host({action:"connect",configuration:JSON.parse((document.querySelector('[aria-label="CAD MCP client configuration"]') as HTMLTextAreaElement).value)});
 const c=await call("cad.context"),r=await call("solid.loft.update",{_context:c.contextId,objectId:"editableLoft",ruled:false});await ready();check(r.status==="pending-review"&&state()===before,"Real stdio MCP client proposes the same edit through the browser review");await click("Apply");await waitFor(()=>feature().params.ruled===false&&!applyButton());check(state()===smooth,"MCP Apply retains the same editable model");await host({action:"close"});
 await choose("Shared CAD tool",13);await choose("Shared loft edit connection",0);await click("Review shared tool");await ready();await click("Apply");await waitFor(()=>feature().params.ruled===true&&!applyButton());check(state()===before,"Human shared form takes over after MCP and restores straight spans");
 await click("부드러운 곡면으로");await ready();await click("Apply");await waitFor(()=>feature().params.ruled===false&&!applyButton());check(state()===smooth,"Inspector remains editable after NL, MCP and shared form handoffs");
 await click("Fit selected geometry");const hover=document.querySelector<HTMLInputElement>('[aria-label="Enable hover distance"]');if(hover?.checked)await physical(hover);await input({type:"key",key:"Escape"});(output.closest("aside") as HTMLElement).hidden=true;const screenshot=await(await input({type:"screenshot"})).json();(output.closest("aside") as HTMLElement).hidden=false;
 const artifacts={"loft.png":screenshot.data,"loft.webcad.json":serializeDocument(cadDocument)};await saveDocumentToCache(cadDocument);sessionStorage.setItem("loft-edit-reopen",JSON.stringify({checks,state:state(),volume:m.volume,artifacts}));location.reload();
 }catch(e){output.textContent=checks.join("\n")+"\nFAIL: "+String(e);}};installBrowserChecks(button,output);
