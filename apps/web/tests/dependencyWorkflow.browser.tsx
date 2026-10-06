import { createRoot } from "react-dom/client";
import { App } from "../src/App";
import "../src/ui/tokens.css";
import "../src/ui/workstation.css";
import "../src/ui/commands.css";
import "../src/ui/menu.css";
import "../src/ui/explorer.css";
import "../src/ui/inspector.css";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory } from "../src/state/history";
import { saveDocumentToCache } from "../src/state/documentFile";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { isDocumentCommandPending } from "../src/state/documentCommandQueue";
import { queryCadDocument } from "../src/state/documentQuery";
import { sketchPoint } from "../src/precision/sketchSolver";
import { resetTestDocument } from "./helpers/documentHarness";
import { createConstrainedChain } from "./helpers/constrainedChain";
import { installBrowserChecks } from "./helpers/browserChecks";

resetTestDocument();
await createConstrainedChain(async command => { const result = await dispatchCadCommand(command); if (!result.ok) throw new Error(result.reason); });
saveDocumentToCache(); createRoot(document.getElementById("root")!).render(<App />);
const button = document.getElementById("run-dependencies") as HTMLButtonElement, output = document.getElementById("dependency-result")!;
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 30));
const state = () => { const { revision: _, ...value } = cadDocument; return JSON.stringify(value); };
const history = () => cadHistory.getPastLabels().length;
const editor = () => document.querySelector<HTMLElement>('[data-testid="direct-edit-review"]');
const find = (name: string) => Array.from(document.querySelectorAll<HTMLButtonElement>("#root button")).find(b => (b.getAttribute("aria-label") ?? b.textContent?.trim()) === name);
async function waitFor(check: () => boolean) { const deadline = Date.now() + 15000; while (!check()) { if (Date.now() > deadline) throw new Error("UI condition timed out: " + editor()?.textContent); await pause(); } await pause(); }
async function click(name: string) { const target = find(name); if (!target || target.disabled) throw new Error(`Missing or disabled ${name}`); target.click(); await pause(); await waitFor(() => !isDocumentCommandPending()); }
async function input(action: Record<string, unknown>) { const run = new URLSearchParams(location.search).get("run"), response = await fetch(`/__browser_input?run=${run}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) }); if (!response.ok) throw new Error(await response.text()); return response; }
const mouse = (type: string, x: number, y: number) => input({ type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1 });
async function physical(element: Element) { element.scrollIntoView({ block: "nearest" }); await pause(); const r = element.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2; if (!element.contains(document.elementFromPoint(x, y))) throw new Error("Control obscured: " + element.outerHTML.slice(0, 200)); await mouse("mousePressed", x, y); await mouse("mouseReleased", x, y); await pause(); }
async function key(key: string, modifiers = 0) { await input({ type: "key", key, modifiers }); await pause(); }
async function field(axis: string, value: string) { const target = document.querySelector<HTMLInputElement>(`[aria-label="Direct target ${axis}"]`)!; await physical(target); await key("a", 2); await input({ type: "text", text: value }); await pause(); }
async function ready() { await waitFor(() => editor()?.dataset.previewStatus === "ready"); await waitFor(() => Boolean(document.querySelector('[data-preview-side="after"][data-preview-geometry="bc"]'))); }
async function handle(id: string) { await waitFor(() => Boolean(document.querySelector(`[data-direct-handle="${id}"]`))); const r = document.querySelector(`[data-direct-handle="${id}"]`)!.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2] as [number, number]; }
async function screenshot() { if (!new URLSearchParams(location.search).has("artifacts")) return; document.querySelector<HTMLElement>("body>aside")!.style.visibility = "hidden"; const result = await (await input({ type: "screenshot" })).json(); document.querySelector<HTMLElement>("body>aside")!.style.visibility = ""; ((globalThis as typeof globalThis & { cadTestArtifacts?: Record<string, string> }).cadTestArtifacts ??= {})["cad-connected-constraints.png"] = result.data; }
const near = (a: number, b: number) => Math.abs(a - b) < 1e-5;
const chainPoints = () => { const geometry = cadDocument.sketches!.chain.geometry; return [sketchPoint(geometry[0], "a")!, sketchPoint(geometry[0], "b1")!, sketchPoint(geometry[1], "b2")!, sketchPoint(geometry[1], "c")!]; };
function validChain() { const [a, b, b2, c] = chainPoints(); return near(a[0], 10) && near(a[1], 20) && near(Math.hypot(b[0] - a[0], b[1] - a[1]), 50) && near(Math.hypot(c[0] - b2[0], c[1] - b2[1]), 30) && near(Math.hypot(b[0] - b2[0], b[1] - b2[1]), 0) && near(((b[0] - a[0]) * (c[0] - b2[0]) + (b[1] - a[1]) * (c[1] - b2[1])) / 1500, 0); }

button.onclick = async () => {
  button.disabled = true; const lines: string[] = [], check = (ok: unknown, label: string) => { if (!ok) throw new Error(label); lines.push(`PASS: ${label}`); output.textContent = lines.join("\n"); };
  try {
    await waitFor(() => Boolean(document.querySelector("#root canvas")));
    const edit = Array.from(document.querySelectorAll<HTMLButtonElement>("#root button")).find(b => b.title.startsWith("Edit chain"))!; edit.click(); await pause();
    await physical(document.querySelector('[data-model-object-id="ab"] .tree-label')!); await click("Hide Explorer"); await click("Hide Properties"); await click("Fit all geometry"); await new Promise(r => setTimeout(r, 350)); await click("Direct");
    const a = await handle("a"), b = await handle("b1"), scale = (b[0] - a[0]) / 50, before = state(), past = history();
    check(cadDocument.sketches!.chain.constraints.length === 4, "Fixture stores distinct AB=50, BC=30, perpendicular angle and joint relations");
    const end: [number, number] = [a[0] + 10 * scale, a[1] - 20 * scale];
    if (document.elementFromPoint(...a) !== document.querySelector("#root canvas")) throw new Error("Endpoint obscured");
    await mouse("mousePressed", ...a); await mouse("mouseMoved", ...end); await pause(); await mouse("mouseReleased", ...end); await waitFor(() => Boolean(editor()));
    const intent = document.querySelector<HTMLSelectElement>('[aria-label="Direct edit intent"]')!;
    await physical(intent); await key("Home"); await key("ArrowDown"); await key("ArrowDown"); await key("Enter"); await ready();
    await field("X", "10mm"); await field("Y", "20mm"); await ready();
    check(intent.value === "connected" && editor()?.textContent?.includes("Other unfixed vertices may move") && state() === before && history() === past, "Connected intent is explicit and trusted precision input remains a detached proposal");
    const ab = document.querySelector<SVGPolylineElement>('[data-preview-side="after"][data-preview-geometry="ab"]')!, bc = document.querySelector<SVGPolylineElement>('[data-preview-side="after"][data-preview-geometry="bc"]')!;
    const p = ab.points.getItem(0), q = ab.points.getItem(1), r = bc.points.getItem(0), s = bc.points.getItem(1);
    const canvasMeasures = [Math.hypot(q.x - p.x, q.y - p.y) / scale, Math.hypot(s.x - r.x, s.y - r.y) / scale, Math.hypot(q.x - r.x, q.y - r.y), ((q.x - p.x) * (s.x - r.x) + (q.y - p.y) * (s.y - r.y)) / (1500 * scale * scale)];
    check(Math.abs(canvasMeasures[0] - 50) < .01 && Math.abs(canvasMeasures[1] - 30) < .01 && canvasMeasures[2] < .15 && Math.abs(canvasMeasures[3]) < .001, "Both green canvas lines independently retain 50 mm, 30 mm, their shared joint and a right angle: " + canvasMeasures.map(n => n.toFixed(6)).join(", "));
    check(document.querySelector('[data-impact-constraint="ab-50"]')?.getAttribute("data-relation-status") === "maintained" && document.querySelector('[data-impact-constraint="bc-30"]')?.getAttribute("data-relation-status") === "maintained" && document.querySelector('[data-impact-constraint="right-angle"]')?.getAttribute("data-relation-status") === "maintained", "Impact review explains all three retained dimensions and relations before Apply");
    await screenshot(); await physical(find("Apply direct edit")!); await waitFor(() => !editor() && !isDocumentCommandPending());
    check(validChain() && cadDocument.sketches!.chain.constraints.length === 4 && history() === past + 1, "Apply moves A exactly to (10,20), lets B/C follow and retains every saved constraint as one Undo step");
    const after = state(); await click("Undo"); check(state() === before, "Undo restores every source coordinate and all simultaneous constraints"); await click("Redo"); check(state() === after && validChain(), "Redo reproduces the reviewed chain without solver drift");
    await click("Finish"); await click("Show Explorer"); await click("Show Properties"); await physical(document.querySelector('[data-model-object-id="ab"] .tree-label')!);
    const dependencyButton = Array.from(document.querySelectorAll<HTMLButtonElement>("#root button.property-section-trigger")).find(b => b.querySelector('.property-section-title')?.textContent === "Dependencies")!; await physical(dependencyButton);
    const explanation = document.querySelector<HTMLElement>('[aria-label="Object dependency explanation"]')!;
    check(explanation.offsetHeight > 0 && explanation.textContent?.includes("Solved by sketch") && explanation.textContent?.includes("4 simultaneous constraints") && explanation.textContent?.includes("ab-50") && explanation.textContent?.includes("right-angle"), "Inspector explains the actual saved solve group and its individual equations");
    const query = await queryCadDocument(["ab"]); check(query.objects[0].dependencies!.affected.some(n => n.sourceId === "bc") && query.dependencyGraph.solveGroups[0].constraints.length === 4 && state() === after && history() === past + 1, "The same read-only query exposes potential connected effects for automation without mutating history");
    output.textContent = lines.join("\n") + `\nALL ${lines.length} CHECKS PASSED`;
  } catch (cause) { output.textContent = lines.join("\n") + `\nFAIL: ${cause instanceof Error ? cause.message : cause}`; }
};
installBrowserChecks(button, output);
