import { createRoot } from "react-dom/client";
import { App } from "../src/App";
import "../src/ui/tokens.css"; import "../src/ui/workstation.css"; import "../src/ui/commands.css"; import "../src/ui/menu.css"; import "../src/ui/explorer.css"; import "../src/ui/inspector.css";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory } from "../src/state/history";
import { measureDocumentObject } from "../src/state/documentQuery";
import { serializeDocument, deserializeDocument } from "@agent-webcad/cad-document";
import { copilotSolidContract, solidParameterPlan } from "../src/copilot/copilotSolid";
import { click, text, choose, waitFor, physical, input } from "./helpers/physicalInput";
import { installBrowserChecks } from "./helpers/browserChecks";
import { saveDocumentToCache } from "../src/state/documentFile";
import { exportStepBytes } from "../src/export/exportModel";

createRoot(document.getElementById("root")!).render(<App/>);
const button = document.getElementById("run-solid") as HTMLButtonElement, output = document.getElementById("solid-result")!;
const panel = () => document.querySelector('[data-testid="copilot-panel"]')!;
const apply = () => [...panel().querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.trim() === "Apply");
const ready = () => waitFor(() => !!apply() && !apply()!.disabled);
const exact = () => JSON.stringify(cadDocument);
const semantic = () => { const {revision: _, ...rest} = cadDocument; return JSON.stringify(rest); };
const history = () => JSON.stringify([cadHistory.getPastLabels(), cadHistory.getFutureLabels()]);
const alert = () => panel().querySelector('[role="alert"]')?.textContent ?? "";
async function plan(prompt: string) { await text("Copilot prompt", prompt); await click("Plan"); }
const originalFetch = window.fetch.bind(window);
let gatewayCommand: unknown;
window.fetch = async (url, init) => String(url).endsWith("/api/copilot/solid") ? new Response(JSON.stringify({version:1,command:gatewayCommand,summary:["untrusted"]}), {headers:{"Content-Type":"application/json"}}) : originalFetch(url, init);

button.onclick = async () => {
  button.disabled = true;
  const checks: string[] = [], check = (ok: unknown, label: string) => { if (!ok) throw new Error(label); checks.push(`PASS: ${label}`); output.textContent = checks.join("\n"); };
  try {
    await waitFor(() => !!document.querySelector("canvas"));
    const restored = sessionStorage.getItem("copilot-solid-reopen");
    if (restored) {
      const saved = JSON.parse(restored) as {id:string;state:string;checks:string[];step:string};
      checks.push(...saved.checks);
      check(semantic() === saved.state && copilotSolidContract(cadDocument, [saved.id]).plate?.thickness === 6, "Actual page reload restores the cached parametric solid and editable source bindings");
      check(Math.abs((await measureDocumentObject(cadDocument, saved.id)).volume! - (100 * 50 - 36 * Math.PI) * 6) < 0.003, "Reopened model rebuilds to the expected exact solid volume");
      await click("3D"); await click("Copilot"); await click("Model tree"); await physical(document.querySelector(`[data-model-object-id="${saved.id}"] .tree-label`)!); await click("Copilot");
      await click("Fit all geometry");
      const toggle = document.querySelector<HTMLInputElement>('[aria-label="Enable hover distance"]');
      if (toggle?.checked) await physical(toggle);
      (output.closest("aside") as HTMLElement).hidden = true;
      const shot = await (await input({type:"screenshot"})).json() as {data:string};
      (globalThis as typeof globalThis & {cadTestArtifacts?:Record<string,string>}).cadTestArtifacts = {"plate.webcad.json":serializeDocument(cadDocument),"viewport.png":shot.data,"plate.step":saved.step};
      sessionStorage.removeItem("copilot-solid-reopen"); output.textContent = `${checks.join("\n")}\nALL ${checks.length} CHECKS PASSED`; return;
    }
    await click("New document"); await click("3D"); await click("Copilot");
    const before = exact(), labels = history();
    await plan("80x50x4mm 판 모서리 간격 10mm 지름 6mm 구멍 4개"); await ready();
    check(exact() === before && history() === labels, "Real Worker preview keeps the source and history unchanged");
    check(panel().textContent?.includes("Four through holes Ø6 mm") && panel().textContent?.includes("15547.6107 mm³"), "Review shows hole relationships and independently expected volume");
    await click("Clear"); check(exact() === before && history() === labels, "Clear discards the plate preview without publication");
    await click("Plan"); await ready(); const past = cadHistory.getPastLabels().length; await click("Apply");
    await waitFor(() => Object.values(cadDocument.features).some(f => f.type === "extrude"));
    const solid = Object.values(cadDocument.features).find(f => f.type === "extrude")!.output, original = semantic();
    check(cadHistory.getPastLabels().length === past + 1, "Sketch, constraints, bindings and four-hole solid publish as one Undo");
    check(panel().textContent?.includes("Completed on 1 object") && !!panel().querySelector('[aria-label="Editable solid dimensions"]'), "The final solid alone stays selected and exposes follow-up dimensions");
    const dimension = [...panel().querySelectorAll("button")].find(b => b.textContent === "width · 80 mm")!;
    await physical(dimension); check((document.querySelector('[aria-label="Copilot prompt"]') as HTMLInputElement).value === "width 80mm", "A selected dimension drafts an editable follow-up request");
    await plan("폭을 100mm로 바꿔줘"); await ready(); check(semantic() === original, "Width edit is evaluated without changing the committed model");
    await click("Apply"); await waitFor(() => copilotSolidContract(cadDocument, [solid]).plate?.width === 100);
    const sketch = Object.values(cadDocument.sketches!).find(s => s.geometry.some(g => g.kind === "circle"))!;
    const centers = sketch.geometry.filter(g => g.kind === "circle").map(g => g.kind === "circle" ? g.center.map(v => Math.round(v)) : []);
    check(JSON.stringify(centers) === "[[10,10],[90,10],[10,40],[90,40]]", "Changing plate width retains both edge margins of all four holes");
    check(Math.abs((await measureDocumentObject(cadDocument, solid)).volume! - (20000 - 144 * Math.PI)) < 0.003, "Committed Worker BRep volume matches the analytic four-hole plate");
    const edited = semantic(); await click("Undo"); check(semantic() === original, "Undo restores the complete original plate and bindings"); await click("Redo"); check(semantic() === edited, "Redo restores the edited plate without recreating its IDs");
    const saved = serializeDocument(cadDocument), reopened = deserializeDocument(saved);
    check(copilotSolidContract(reopened, [solid]).plate?.width === 100, "Reopening the serialized document retains editable parameters and references");
    await plan("폭을 20mm로 바꿔줘"); await waitFor(() => !!alert()); check(!apply() && semantic() === edited && alert().includes("fit inside"), "Overlapping holes are rejected with a correction and no mutation");
    await choose("Copilot planner", 1); await text("Copilot gateway URL", "/api/copilot/solid");
    const contract = copilotSolidContract(cadDocument, [solid]), thickness = contract.parameters.find(p => p.key.endsWith("_thickness"))!;
    gatewayCommand = solidParameterPlan(contract, thickness.key, 6).command;
    await plan("Change thickness to 6 mm"); await ready(); check(!panel().textContent?.includes("untrusted"), "Gateway edit review derives its actual parameter change locally");
    await click("Apply"); await waitFor(() => copilotSolidContract(cadDocument, [solid]).plate?.thickness === 6);
    check(Math.abs((await measureDocumentObject(cadDocument, solid)).volume! - (100 * 50 - 36 * Math.PI) * 6) < 0.003, "Gateway driver edit regenerates the same selected solid through the real Worker");
    const step = new TextDecoder().decode(await exportStepBytes()); check(step.includes("ISO-10303-21"), "Worker exports the current plate as an actual STEP BRep");
    saveDocumentToCache(); sessionStorage.setItem("copilot-solid-reopen", JSON.stringify({id:solid,state:semantic(),checks,step})); location.reload();
  } catch (error) { output.textContent += `\nFAIL: ${error instanceof Error ? error.stack : String(error)}`; }
};
installBrowserChecks(button, output);
