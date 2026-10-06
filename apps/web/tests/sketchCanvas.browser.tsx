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
import { buildExtrudeMesh, meshPositionsBounds } from "../src/cad/kernelGeometryService";
import { isDocumentCommandPending } from "../src/state/documentCommandQueue";
import { installBrowserChecks } from "./helpers/browserChecks";

createRoot(document.getElementById("root")!).render(<App />);
const button = document.getElementById("run-sketch") as HTMLButtonElement, output = document.getElementById("sketch-result")!;
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 30));
const state = () => { const { revision: _, ...state } = cadDocument; return JSON.stringify(state); };
async function waitFor(check: () => boolean) { const deadline = Date.now() + 15000; while (!check()) { if (Date.now() > deadline) throw new Error("UI condition timed out"); await pause(); } await pause(); }
async function click(name: string) {
  if(name==="Apply constraint")await waitFor(()=>Boolean(document.querySelector('[data-command-stage="ready"]')));
  if(name==="Apply")await waitFor(()=>document.querySelector('.sketch-dimension-editor')?.getAttribute('data-preview-status')==="ready");
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>("#root button")).find((button) => (button.getAttribute("aria-label") ?? button.textContent?.trim()) === name);
  if (!button) throw new Error(`Button missing: ${name}`); button.click(); await pause(); await waitFor(() => !isDocumentCommandPending());
}
async function keys(...values: string[]) { for (const key of values) { document.body.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })); await pause(); } await waitFor(() => !isDocumentCommandPending()); }
function input() { return document.querySelector<HTMLInputElement>('[aria-label="Canvas dimension value"]')!; }
async function typeValue(value: string) { const target = input(); target.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(target, value); target.dispatchEvent(new Event("input", { bubbles: true })); await pause(); }
async function canvasWidth() { await waitFor(() => Boolean(document.querySelector('[data-dimension-id="dimension:' + width().id + '"]'))); await click(`Canvas Width ${width().id}`); }
const sketch = () => Object.values(cadDocument.sketches!)[0];
const width = () => sketch().constraints.find((entry) => entry.kind === "distance")!;

button.onclick = async () => {
  button.disabled = true; const lines: string[] = [];
  const check = (condition: unknown, label: string) => { if (!condition) throw new Error(label); lines.push(`PASS: ${label}`); output.textContent = lines.join("\n"); };
  try {
    await waitFor(() => Boolean(document.querySelector("#root canvas")));
    await click("New document"); await click("2D"); document.getElementById("tools-tab-draw")!.click(); await pause();
    await click("Sketch"); await click("Rectangle"); await keys("0", ",", "0", "Enter", "1", "0", "0", ",", "6", "0", "Enter", "Escape");
    await click("Width"); await click("Apply constraint"); await click("Height"); await click("Apply constraint"); await click("Fit all geometry"); await new Promise((resolve) => setTimeout(resolve, 400));
    const beforeSelect = state(), history = cadHistory.getPastLabels().length;
    await canvasWidth();
    check(document.activeElement === input() && state() === beforeSelect && history === cadHistory.getPastLabels().length, "Canvas label opens a focused editor without mutating the document/history");
    await typeValue("12cm"); input().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); await pause();
    check(!input() && state() === beforeSelect && uiPressed("Rectangle") !== "true", "Esc cancels the dimension draft without drawing or transforming");
    await canvasWidth(); await typeValue("oops"); await waitFor(()=>Boolean(document.querySelector('.sketch-dimension-editor [role="alert"]')));
    check(Boolean(document.querySelector('.sketch-dimension-editor [role="alert"]')) && state() === beforeSelect, "Invalid units leave the model unchanged and explain the input error");
    await typeValue("12cm"); await click("Apply");
    check(width().kind === "distance" && width().value === 120 && !input() && cadHistory.getPastLabels().length === history + 1, "Canvas unit input commits one driving edit");
    const afterEdit = state(); await click("Undo"); check(state() === beforeSelect, "Undo restores the complete pre-edit document");
    await click("Redo"); check(state() === afterEdit, "Redo restores geometry and driving value together");
    await canvasWidth(); await click("Cancel");
    const polyline = document.querySelector<SVGPolylineElement>('[data-highlight-geometry]')!;
    const corner = polyline.points.getItem(2), canvas = document.querySelector<HTMLCanvasElement>("#root canvas")!, rect = canvas.getBoundingClientRect();
    await click("Direct");
    const revision = cadDocument.revision, beforeDrag = state(), dragHistory = cadHistory.getPastLabels().length;
    const pointer = (type: string, x: number, y: number) => canvas.dispatchEvent(new PointerEvent(type, { clientX: rect.left + x, clientY: rect.top + y, button: 0, buttons: type === "pointerup" ? 0 : 1, pointerId: 77, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true }));
    pointer("pointerdown", corner.x, corner.y); pointer("pointermove", corner.x + 40, corner.y - 20); pointer("pointerup", corner.x + 40, corner.y - 20);
    await waitFor(() => Boolean(document.querySelector('[aria-label="Direct edit intent"]')));
    const intent=document.querySelector<HTMLSelectElement>('[aria-label="Direct edit intent"]')!;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value")!.set!.call(intent,"geometry");intent.dispatchEvent(new Event("change",{bubbles:true}));
    await waitFor(() => !isDocumentCommandPending()); await waitFor(() => Boolean(document.querySelector(".sketch-annotation.conflict")));
    check(state() === beforeDrag && cadDocument.revision === revision && cadHistory.getPastLabels().length === dragHistory && document.querySelector('[data-highlight-geometry].conflict'), "Actual rejected corner drag identifies constraint/geometry and preserves document/history");
    await click("Object"); await click("Finish");
    Array.from(document.querySelectorAll<HTMLElement>(".tree-row-model")).find((entry) => entry.textContent?.includes("Sketch Rectangle"))!.click(); await pause();
    document.getElementById("tools-tab-model")!.click(); await pause(); await click("Extrude");
    await waitFor(()=>!document.querySelector<HTMLButtonElement>('.extrusion-session button[type="submit"]')?.disabled); await click("Apply extrusion");
    const solid = Object.values(cadDocument.features).find((entry) => entry.type === "extrude")!;
    const edit = Array.from(document.querySelectorAll<HTMLButtonElement>("#root button")).find((entry) => entry.textContent?.includes(sketch().id) && entry.title.includes("Edit"));
    edit!.click(); await pause(); await canvasWidth(); await typeValue("150mm"); await click("Apply");
    const mesh = await buildExtrudeMesh(cadDocument.features[solid.id].params), bounds = meshPositionsBounds(mesh.positions)!;
    check(Math.abs(bounds.max[0] - bounds.min[0] - 150) < 1e-4, "Canvas dimension edit regenerates the real Worker solid");
    await click("Undo"); check(width().kind === "distance" && width().value === 120, "Solid-linked canvas edit remains one Undo step");
    await click("Redo"); await canvasWidth(); await click("Remove constraint");
    check(!sketch().constraints.some((entry) => entry.id === widthId) && !document.querySelector(`[data-constraint-id="${widthId}"]`), "Constraint removal clears its canvas annotation and references");
    await click("Undo"); await canvasWidth(); check(Boolean(input()), "Undo restores an editable canvas dimension with the original identity"); await click("Cancel");
    output.textContent = `${lines.join("\n")}\nALL ${lines.length} CHECKS PASSED`;
  } catch (error) { output.textContent = `${lines.join("\n")}\nFAIL: ${error instanceof Error ? error.message : error}`; }
};
let widthId = "";
function uiPressed(name: string) { return Array.from(document.querySelectorAll<HTMLButtonElement>("#root button")).find((button) => button.textContent?.trim() === name)?.getAttribute("aria-pressed"); }
// Capture the stable original ID after it exists, without issuing document commands.
const identity = setInterval(() => { if (cadDocument.sketches && Object.values(cadDocument.sketches)[0]?.constraints.length) { widthId = width().id; clearInterval(identity); } }, 20);
installBrowserChecks(button, output);
