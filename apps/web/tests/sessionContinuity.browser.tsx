import { createRoot } from "react-dom/client";
import { App } from "../src/App";
import "../src/styles.css";
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
import { resetTestDocument, restoreTestDocument } from "./helpers/documentHarness";
import { createDrawingTopology } from "../src/precision/drawingTopology";
import { deserializeDocument, serializeDocument } from "@agent-webcad/cad-document";
import { installBrowserChecks } from "./helpers/browserChecks";

resetTestDocument();
const backgroundCount = Number(new URLSearchParams(location.search).get("count") ?? "0");
if (![0, 1000].includes(backgroundCount)) throw new Error("Invalid session fixture size");
await dispatchCadCommand({ type: "create-drawing", id: "seed", name: "Profile", drawing: "rectangle", params: { points: [[0, 0, 0], [100, 0, 0], [100, 60, 0], [0, 60, 0]], workPlane: "XY" } });
// Validated load fixture, outside measured user actions (as in editPerformance).
for (let index = 0; index < backgroundCount; index++) {
  const id = `background-${index}`, points = [[10000 + index * 10, 10000, 0], [10005 + index * 10, 10000, 0]];
  cadDocument.objects[id] = { ...structuredClone(cadDocument.objects.seed), id, geometryId: `geometry-${id}`, name: id };
  cadDocument.features[`feature-${id}`] = { id: `feature-${id}`, type: "drawing", output: id, inputs: [], params: { kind: "line", points, workPlane: "XY", topology: createDrawingTopology("line", { points }) } };
  cadDocument.rootObjects.push(id); cadDocument.layers["layer-default"].objectIds.push(id);
}
restoreTestDocument(deserializeDocument(serializeDocument(cadDocument))); cadHistory.clear();
saveDocumentToCache(); createRoot(document.getElementById("root")!).render(<App />);
const button = document.getElementById("run-session") as HTMLButtonElement, output = document.getElementById("session-result")!;
const state = () => { const { revision: _, ...value } = cadDocument; return JSON.stringify(value); };
const past = () => cadHistory.getPastLabels().length;
const selected = (id: string) => document.querySelector(`[data-model-object-id="${id}"]`)?.getAttribute("aria-pressed") === "true";
const canvas = () => document.querySelector<HTMLCanvasElement>("#root canvas")!;
const editor = (name: string) => document.querySelector<HTMLElement>(`[aria-label="${name} editor"]`);
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 25));
let stage = "boot";
const timings: { operation: string; enterMs: number; undoMs: number; redoMs: number }[] = [];
function find(name: string) {
  const element = Array.from(document.querySelectorAll<HTMLButtonElement>("#root button")).find(b => (b.getAttribute("aria-label") ?? b.textContent?.trim()) === name);
  if (!element || element.disabled) throw new Error(`Missing or disabled control: ${name}`);
  return element;
}
async function input(action: Record<string, unknown>) {
  const response = await fetch(`/__browser_input?run=${new URLSearchParams(location.search).get("run")}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) });
  if (!response.ok) throw new Error(await response.text()); return response;
}
async function physical(element: Element) {
  element.scrollIntoView({ block: "nearest" }); await pause();
  const r = element.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  if (!element.contains(document.elementFromPoint(x, y))) throw new Error(`Obscured control: ${element.outerHTML.slice(0, 160)}`);
  await input({ type: "mousePressed", x, y, button: "left", buttons: 1 }); await input({ type: "mouseReleased", x, y, button: "left", buttons: 0 }); await pause();
}
async function waitFor(check: () => boolean) {
  const end = Date.now() + 12000;
  while (!check()) { if (Date.now() > end) throw new Error(`Session workflow timeout (${stage}, history=${past()}, tools=${Array.from(document.querySelectorAll('#root form[data-cad-editor]')).map(e=>e.getAttribute('aria-label')).join(',')}): ${document.activeElement?.outerHTML.slice(0, 180)}`); await pause(); }
  await pause();
}
async function click(name: string) { await physical(find(name)); await waitFor(() => !isDocumentCommandPending()); }
async function key(key: string, modifiers = 0) { await input({ type: "key", key, modifiers }); await pause(); }
async function select(id: string) { await physical(document.querySelector(`[data-model-object-id="${id}"] .tree-label`)!); await waitFor(() => selected(id)); }
async function patternReady() { await waitFor(() => !!editor("Pattern")?.querySelector('[data-command-stage="ready"]')); }
async function tabTo(element: Element) {
  const input = element.closest("form")?.querySelector('input:not([type="checkbox"]):not(:disabled)');
  if (input) await physical(input);
  for (let index = 0; index < 80 && document.activeElement !== element; index++) await key("Tab");
  if (document.activeElement !== element) throw new Error(`Cannot keyboard-focus ${element.outerHTML.slice(0, 100)}`);
}

button.onclick = async () => {
  button.disabled = true; const checks: string[] = [];
  const check = (ok: unknown, message: string) => { if (!ok) throw new Error(message); checks.push(`PASS: ${message}`); output.textContent = checks.join("\n"); };
  try {
    await waitFor(() => !!canvas()); await click("2D"); await select("seed");
    const before = state(); await click("Duplicate"); const copy = cadDocument.rootObjects.find(id => id !== "seed" && !id.startsWith("background-"))!; const after = state();
    check(past() === 1 && selected(copy), "Duplicate hands off its result selection and records exactly one history entry");
    await physical(document.getElementById("tools-tab-modify")!); await click("Linear Array"); await patternReady(); await click("Fit preview");
    await key("z", 2);
    await waitFor(() => past() === 0 && !editor("Pattern"));
    check(state() === before && selected("seed") && document.activeElement === canvas(), "Undo from a focused preview control discards the session, restores source selection and returns keyboard focus to canvas");
    await key("z", 10); await waitFor(() => past() === 1);
    check(state() === after && selected(copy) && !document.querySelector('[aria-label="Pattern preview"]'), "Ctrl+Shift+Z restores the exact result and selection without reviving transient pattern geometry");
    await click("Linear Array"); await patternReady();
    const spacing = editor("Pattern")!.querySelector<HTMLInputElement>('[data-pattern-field="u"]')!;
    await physical(spacing); await key("a", 2); await input({ type: "text", text: "30mm" }); await key("z", 2);
    await waitFor(() => spacing.value === "20");
    check(past() === 1 && state() === after && !!editor("Pattern"), "Native numeric input Undo restores the field without undoing document geometry or exiting the tool");
    await click("Cancel"); await waitFor(() => !editor("Pattern"));
    check(state() === after && past() === 1 && document.activeElement === canvas(), "Cancel discards the numeric preview with no history entry and returns focus to canvas");

    const historyCycle = async (open: string, selector: string, control: string) => {
      stage = `${open} enter`;
      const started = performance.now(); await click(open); await waitFor(() => !!document.querySelector(selector)); const enterMs = performance.now() - started; await tabTo(find(control));
      stage = `${open} undo`;
      const undoStarted = performance.now(); await key("z", 2); await waitFor(() => past() === 0 && !document.querySelector(selector)); const undoMs = performance.now() - undoStarted;
      check(state() === before && selected("seed") && document.activeElement === canvas(), `${open}: panel Undo closes the draft and restores geometry, source selection and canvas focus`);
      stage = `${open} redo`; const redoStarted = performance.now(); await key("y", 2); await waitFor(() => past() === 1); const redoMs = performance.now() - redoStarted;
      timings.push({ operation: open, enterMs, undoMs, redoMs });
      check(state() === after && selected(copy) && !document.querySelector(selector), `${open}: Redo restores the exact document and result selection without reopening the discarded tool`);
    };
    await historyCycle("Curve workflow", 'form[aria-label="Curve workflow"]', "Cancel workflow");
    await historyCycle("Break", '[aria-label="Contour editor"]', "Cancel contour edit");
    await physical(document.getElementById("tools-tab-draw")!);
    await historyCycle("Construction", '[aria-label="Construction editor"]', "Cancel construction");
    await physical(document.getElementById("tools-tab-model")!);
    await historyCycle("Extrude", ".extrusion-session", "Cancel extrusion");
    check(find("2D").getAttribute("aria-pressed") === "true", "Undo during extrusion restores its previous 2D workspace");
    await physical(document.getElementById("tools-tab-draw")!); await click("Construction"); await waitFor(() => !!editor("Construction"));
    await physical(document.getElementById("tools-tab-model")!); await click("Extrude");
    check(!editor("Construction") && !!document.querySelector(".extrusion-session"), "Starting extrusion replaces construction rather than leaving two interactive previews alive");
    await physical(document.getElementById("tools-tab-draw")!); await click("Line"); await waitFor(() => !document.querySelector(".extrusion-session"));
    check(find("2D").getAttribute("aria-pressed") === "true" && state() === after && past() === 1, "Switching extrusion to drawing cancels the extrusion preview and restores the work plane without mutation");
    await physical(canvas()); await key("z", 2); await waitFor(() => past() === 0);
    check(state() === before && !document.querySelector(".extrusion-session"), "Undo also works during the drawing command and cannot publish its partial input");
    await key("y", 2); await waitFor(() => past() === 1);
    await key("s"); await key("2"); await key("z", 2); await waitFor(() => past() === 0);
    check(state() === before && !document.body.textContent?.includes("SCALE · 2"), "Undo terminates a buffered precision transform before it can be applied");
    await key("y", 2); await waitFor(() => past() === 1);
    await click("Direct"); await waitFor(() => !!document.querySelector('.direct-edit-handles [tabindex="0"]')); await key("Tab");
    check(document.activeElement?.hasAttribute("data-direct-handle"), "Canvas Tab discovers keyboard-accessible direct grips");
    await key("z", 2); await waitFor(() => past() === 0);
    check(state() === before && selected("seed") && document.activeElement === canvas(), "Undo on a focused direct grip restores source selection without trapping keyboard focus");
    await key("y", 2); await waitFor(() => past() === 1);
    check(state() === after && selected(copy) && find("Direct").getAttribute("aria-pressed") === "true", "Direct selection mode survives history navigation and restored result grips remain available");
    // This source survives Undo; its existing reviewed-input recovery must stay.
    await select("seed"); await click("Direct"); await key("Tab"); await key("Enter"); await waitFor(() => !!document.querySelector('[data-testid="direct-edit-review"]'));
    await tabTo(find("Cancel direct edit")); await key("z", 2); await waitFor(() => past() === 0 && document.querySelector<HTMLElement>('[data-testid="direct-edit-review"]')?.dataset.previewStatus === "stale");
    check(state() === before && document.activeElement === canvas() && !document.querySelector('[data-direct-preview-side]') && document.querySelector<HTMLButtonElement>('[data-testid="direct-edit-review"] button[type="submit"]')?.disabled, "Undo from a handle review blocks stale Apply, removes ghosts and retains explicit recovery instead of losing the reviewed context");
    await click("Start a new drag");
    await key("y", 2); await waitFor(() => past() === 1);
    check(state() === after && selected("seed"), "Redo after a discarded direct-edit plan restores the committed document and the user's latest source selection");
    await key("k", 2); await waitFor(() => !!document.querySelector("dialog[open]")); await key("Tab"); await key("z", 2);
    check(state() === after && past() === 1 && !!document.querySelector("dialog[open]"), "A focused modal control retains keyboard scope and cannot accidentally undo document geometry behind the dialog");
    await key("Escape"); await waitFor(() => !document.querySelector("dialog[open]"));
    (globalThis as typeof globalThis & { cadTestMetrics?: unknown }).cadTestMetrics = { backgroundCount, timings, measurement: "Native CDP input to observed React/DOM completion; includes input transport and 25ms polling/settling. Four different operations, not repeated p95, input-to-paint or practitioner task time." };
    output.textContent = checks.join("\n") + `\nALL ${checks.length} CHECKS PASSED`;
  } catch (error) { output.textContent = checks.join("\n") + `\nFAIL: ${error instanceof Error ? error.message : String(error)}`; }
};
installBrowserChecks(button, output);
