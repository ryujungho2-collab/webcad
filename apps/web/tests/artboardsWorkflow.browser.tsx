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
import { isDocumentCommandPending } from "../src/state/documentCommandQueue";
import { DOCUMENT_CACHE_KEY } from "../src/state/documentRecovery";
import { deserializeDocument, serializeDocument } from "@agent-webcad/cad-document";
import { installBrowserChecks } from "./helpers/browserChecks";

createRoot(document.getElementById("root")!).render(<App />);
const button = document.getElementById("run-artboards") as HTMLButtonElement;
const output = document.getElementById("artboards-result")!;
const panel = () => document.querySelector<HTMLElement>('[data-testid="artboards-panel"]')!;
const review = () => panel()?.querySelector<HTMLElement>('[aria-label="Edit Artboard review"]');
const state = () => { const { revision: _, ...value } = cadDocument; return JSON.stringify(value); };
const completeState = () => JSON.stringify([cadDocument, cadHistory.getPastLabels(), cadHistory.getFutureLabels()]);
let capturedSvg: Promise<{ filename: string; text: string }> | undefined;
const nativeAnchorClick = HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click = function() {
  if (this.download.endsWith(".svg")) {
    const filename = this.download;
    const href = this.href;
    capturedSvg = fetch(href).then(response => response.text()).then(text => ({ filename, text }));
    return;
  }
  nativeAnchorClick.call(this);
};
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 25));
function find(name: string) {
  const value = Array.from(document.querySelectorAll<HTMLButtonElement>("#root button")).find(element => (element.getAttribute("aria-label") ?? element.textContent?.trim()) === name);
  if (!value) throw new Error(`Missing control: ${name}`);
  return value;
}
function field(name: string) { return document.querySelector<HTMLInputElement>(`[aria-label="${name}"]`)!; }
async function waitFor(check: () => boolean) {
  const end = Date.now() + 14000;
  while (!check()) { if (Date.now() > end) throw new Error(`Artboard workflow timed out: ${panel()?.textContent}`); await pause(); }
  await pause();
}
async function input(action: Record<string, unknown>) {
  const run = new URLSearchParams(location.search).get("run");
  const response = await fetch(`/__browser_input?run=${run}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) });
  if (!response.ok) throw new Error(await response.text());
  return response;
}
async function physical(element: Element) {
  element.scrollIntoView({ block: "nearest" }); await pause();
  const box = element.getBoundingClientRect(), x = box.left + box.width / 2, y = box.top + box.height / 2;
  if (!element.contains(document.elementFromPoint(x, y))) throw new Error(`Obscured control: ${element.outerHTML.slice(0, 160)}`);
  await input({ type: "mousePressed", x, y, button: "left", buttons: 1 });
  await input({ type: "mouseReleased", x, y, button: "left", buttons: 0 });
  await pause();
}
async function clickCanvasAt(x: number, y: number) {
  await input({ type: "mousePressed", x, y, button: "left", buttons: 1 });
  await input({ type: "mouseReleased", x, y, button: "left", buttons: 0 });
  await pause();
}
async function click(name: string) {
  const element = find(name); if (element.disabled) throw new Error(`Disabled control: ${name}`);
  await physical(element); await waitFor(() => !isDocumentCommandPending());
}
async function text(name: string, value: string) {
  await physical(field(name)); await input({ type: "key", key: "a", modifiers: 2 });
  await input(value ? { type: "text", text: value } : { type: "key", key: "Backspace" }); await pause();
}
async function choosePlane(value: "XY" | "XZ" | "YZ") {
  await physical(field("Artboard plane")); await input({ type: "key", key: "Home" });
  for (let index = 0; index < ["XY", "XZ", "YZ"].indexOf(value); index++) await input({ type: "key", key: "ArrowDown" });
  await input({ type: "key", key: "Enter" }); await pause();
}
async function ready() { await waitFor(() => review()?.dataset.commandStage === "ready" && !find("Apply artboard").disabled); }
const reloadKey = "g0-artboards-reload";
button.onclick = async () => {
  button.disabled = true;
  const resumed = sessionStorage.getItem(reloadKey);
  const restart = resumed ? JSON.parse(resumed) as { checks: string[]; expected: string; id: string } : undefined;
  const checks = restart?.checks ?? [];
  const check = (value: unknown, label: string) => { if (!value) throw new Error(label); checks.push(`PASS: ${label}`); output.textContent = checks.join("\n"); };
  try {
    await waitFor(() => !!document.querySelector("#root canvas"));
    if (restart) {
      check(state() === restart.expected && cadHistory.getPastLabels().length === 0, "Reload restores the complete artboard document with a fresh history session");
      await click("Artboards");
      await waitFor(() => field("Artboard name")?.value === "Drawing A");
      check(cadDocument.artboards?.[restart.id].size[0] === 420 && field("Artboard plane").value === "XZ", "Recovered artboards retain identity, units, plane and editable panel values");
      await text("Artboard height", "30cm"); await ready();
      await physical(review()!.querySelector("summary")!);
      if (new URLSearchParams(location.search).get("artifacts") === "1") {
        const screenshot = await input({ type: "screenshot" }); const result = await screenshot.json() as { data: string };
        (globalThis as typeof globalThis & { cadTestArtifacts?: Record<string, string> }).cadTestArtifacts = { "cad-artboards-review.png": result.data };
      }
      await click("Cancel artboard edit");
      check(state() === restart.expected && cadHistory.getPastLabels().length === 0, "A reloaded board supports detached review and Cancel without history mutation");
      sessionStorage.removeItem(reloadKey);
      output.textContent = checks.join("\n") + `\nALL ${checks.length} CHECKS PASSED`; return;
    }
    await click("New document"); await click("Artboards");
    check(!!panel() && panel().textContent?.includes("No artboards yet"), "Artboards are discoverable from the common activity bar");
    await click("New artboard");
    const id = Object.keys(cadDocument.artboards!)[0];
    await waitFor(() => field("Artboard name")?.value === "Artboard 1");
    const original = state(), initialHistory = cadHistory.getPastLabels().length;
    check(cadDocument.artboards?.[id].size[0] === 297 && initialHistory === 1 && find("Apply artboard").disabled, "New selects the board and creates exactly one undo with no spurious Apply");
    await text("Artboard origin X", "");
    check(field("Artboard origin X").getAttribute("aria-invalid") === "true" && find("Apply artboard").disabled && review()?.textContent?.includes("finite origin"), "Blank origin is rejected with recovery guidance instead of becoming zero");
    check(state() === original && cadHistory.getPastLabels().length === initialHistory, "Invalid input leaves document and history untouched");
    await text("Artboard origin X", "2cm"); await text("Artboard origin Y", "-10mm");
    await text("Artboard width", "42cm"); await text("Artboard height", "29.7cm");
    await text("Artboard name", "Drawing A"); await choosePlane("XZ"); await ready();
    check(state() === original && cadHistory.getPastLabels().length === initialHistory && panel().querySelector('[data-artboard-preview]')?.textContent?.includes("420 × 297 mm"), "Unit input prepares a detached review with exact output units while preserving the source");
    await physical(review()!.querySelector("summary")!);
    check(review()?.textContent?.includes("1 affected artboards") && review()?.textContent?.includes("1 updated"), "Impact review names the board and separates geometry from artboard changes");
    check(["Apply artboard", "Cancel artboard edit", "Delete artboard"].every(name => { const element = find(name), box = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)); }), "Expanded review leaves Apply, Cancel and Delete physically reachable without scrolling to the footer");
    await text("Artboard width", "0");
    check(find("Apply artboard").disabled && field("Artboard width").getAttribute("aria-invalid") === "true" && review()?.dataset.commandStage === "invalid" && state() === original, "Editing a ready value immediately blocks the old plan and explains the allowed range");
    await text("Artboard width", "42cm"); await ready(); await click("Apply artboard");
    const applied = state();
    check(JSON.stringify(cadDocument.artboards?.[id].origin) === "[20,-10]" && JSON.stringify(cadDocument.artboards?.[id].size) === "[420,297]" && cadDocument.artboards?.[id].workPlane === "XZ" && cadHistory.getPastLabels().length === initialHistory + 1, "Apply publishes the reviewed millimeter values and plane in one undo");
    await click("Undo"); check(state() === original, "Undo restores all board fields");
    await click("Redo"); check(state() === applied && field("Artboard width").value === "420", "Redo restores board identity and synchronizes panel inputs");
    await text("Artboard name", "Discard this"); await ready();
    const beforeCancel = completeState(); await click("Cancel artboard edit");
    check(completeState() === beforeCancel && field("Artboard name").value === "Drawing A" && find("Apply artboard").disabled, "Cancel restores the source draft without document, revision or history mutation");
    await text("Artboard width", "42cm"); await waitFor(() => !!review()?.textContent?.includes("unchanged"));
    check(find("Apply artboard").disabled && state() === applied && cadHistory.getPastLabels().length === initialHistory + 1, "Equivalent unit input explains the no-op and creates no history entry");
    await click("Cancel artboard edit");
    await click("Artboard locked"); const locked = completeState();
    await text("Artboard width", "100mm");
    check(find("Apply artboard").disabled && find("Delete artboard").disabled && review()?.textContent?.includes("Unlock") && completeState() === locked, "Locked edits stay in context, explain Unlock, and disable Apply and Delete without mutation");
    await click("Cancel artboard edit");
    await text("Artboard name", "Protected sheet"); await ready(); await click("Apply artboard");
    check(cadDocument.artboards?.[id].locked && cadDocument.artboards?.[id].name === "Protected sheet", "A locked frame still permits safe name metadata edits");
    await text("Artboard name", "Drawing A"); await ready(); await click("Apply artboard");
    await click("Artboard locked");
    await click("Artboard visible"); check(cadDocument.artboards?.[id].visible === false, "Hide changes board visibility without changing geometry");
    await click("Undo"); check(cadDocument.artboards?.[id].visible === true, "Visibility changes use the same undo history");
    await click("New artboard");
    const second = Object.keys(cadDocument.artboards!).find(value => value !== id)!;
    await waitFor(() => field("Artboard name")?.value === "Artboard 2");
    await text("Artboard name", "Icon B"); await text("Artboard origin X", "500mm"); await choosePlane("XZ"); await ready(); await click("Apply artboard");
    await physical(Array.from(panel().querySelectorAll<HTMLElement>('[role="option"]')).find(value => value.textContent?.includes("Drawing A"))!);
    check(document.querySelector('[aria-label="Active artboard Drawing A"]')?.textContent?.includes("Drawing A") && document.querySelector(".viewport-label")?.textContent?.includes("XZ plane"), "Activating a frame synchronizes the canvas label, CAD work plane, and orthographic workspace");
    await physical(document.querySelector<HTMLSummaryElement>('.app-menu summary')!);
    await click('Export “Drawing A” SVG…');
    const exported = await capturedSvg;
    check(!!exported && exported.filename.endsWith("-Drawing-A.svg") && exported.text.includes('viewBox="20 -287 420 297"') && exported.text.includes('fill="#ffffff"'), "The File menu exports the active board as an exact-size SVG page with its saved background");
    await click("Fit visible artboards");
    const canvas = document.querySelector<HTMLCanvasElement>("canvas")!, canvasRect = canvas.getBoundingClientRect();
    const halfHeight = Math.hypot(777, 297) / 2 * 1.25;
    await clickCanvasAt(canvasRect.left + canvasRect.width / 2 + 240 * canvasRect.height / (2 * halfHeight), canvasRect.top + canvasRect.height / 2 + 33.5 * canvasRect.height / (2 * halfHeight));
    await waitFor(() => document.querySelector('[aria-label="Active artboard Icon B"]') !== null);
    check(field("Artboard name").value === "Icon B" && document.querySelector(".viewport-label")?.textContent?.includes("XZ plane"), "Clicking an empty visible artboard frame activates its own board without flattening the CAD plane");
    await physical(Array.from(panel().querySelectorAll<HTMLElement>('[role="option"]')).find(value => value.textContent?.includes("Drawing A"))!);
    check(field("Artboard name").value === "Drawing A" && field("Artboard width").value === "420", "Selecting another board reuses its stored draft rather than leaking previous input");
    await physical(Array.from(panel().querySelectorAll<HTMLElement>('[role="option"]')).find(value => value.textContent?.includes("Icon B"))!);
    await click("Delete artboard");
    check(!cadDocument.artboards?.[second] && field("Artboard name").value === "Drawing A", "Deleting one board selects the remaining board without losing it");
    const beforeLastDelete = state(); await click("Delete artboard");
    check(cadDocument.artboards === undefined && panel().textContent?.includes("No artboards yet") && JSON.parse(serializeDocument(cadDocument)).version === 1, "Deleting the last board removes the optional collection and returns to the legacy file format");
    await click("Undo"); check(state() === beforeLastDelete && field("Artboard name").value === "Drawing A", "Undo of last deletion restores the board and panel selection");
    await click("Redo"); check(cadDocument.artboards === undefined && !field("Artboard name"), "Redo of last deletion clears the panel and optional collection again");
    await click("Undo"); await click("Save document");
    const saved = localStorage.getItem(DOCUMENT_CACHE_KEY)!;
    const loaded = deserializeDocument(saved); const { revision: _, ...loadedState } = loaded;
    check(JSON.parse(saved).version === 7 && JSON.stringify(loadedState) === state(), "Save through the shared UI preserves the full v7 artboard document");
    sessionStorage.setItem(reloadKey, JSON.stringify({ checks, expected: state(), id })); location.reload();
  } catch (error) { output.textContent = checks.join("\n") + `\nFAIL: ${error instanceof Error ? error.stack : error}`; }
};
installBrowserChecks(button, output);
