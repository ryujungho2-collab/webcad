import { createRoot } from "react-dom/client";
import { serializeDocument } from "@agent-webcad/cad-document";
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
import { resetTestDocument } from "./helpers/documentHarness";
import { installBrowserChecks } from "./helpers/browserChecks";

resetTestDocument();
for (const [id, y] of [["seed", 0], ["peer", 100]] as const) await dispatchCadCommand({ type: "create-drawing", id, name: id, drawing: "rectangle", params: { points: [[0, y, 0], [50, y, 0], [50, y + 30, 0], [0, y + 30, 0]], workPlane: "XY" } });
saveDocumentToCache(); createRoot(document.getElementById("root")!).render(<App />);
const button = document.getElementById("run-history") as HTMLButtonElement, output = document.getElementById("history-result")!;
const state = () => { const { revision: _, ...value } = cadDocument; return JSON.stringify(value); };
const selected = () => Array.from(document.querySelectorAll('[data-model-object-id][aria-pressed="true"]')).map(e => e.getAttribute("data-model-object-id")!);
const canvas = () => document.querySelector<HTMLCanvasElement>("#root canvas")!;
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 20));
let stage = "startup";
function find(name: string) {
  const element = Array.from(document.querySelectorAll<HTMLButtonElement>("#root button")).find(b => (b.getAttribute("aria-label") ?? b.textContent?.trim()) === name);
  if (!element || element.disabled) throw new Error(`Missing or disabled ${name}`); return element;
}
async function input(action: Record<string, unknown>) {
  const response = await fetch(`/__browser_input?run=${new URLSearchParams(location.search).get("run")}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) });
  if (!response.ok) throw new Error(await response.text());
}
async function physical(element: Element, modifiers = 0) {
  element.scrollIntoView({ block: "nearest" }); await pause();
  const r = element.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  if (!element.contains(document.elementFromPoint(x, y))) throw new Error(`Obscured ${element.outerHTML.slice(0, 120)}`);
  await input({ type: "mousePressed", x, y, button: "left", buttons: 1, modifiers }); await input({ type: "mouseReleased", x, y, button: "left", buttons: 0, modifiers }); await pause();
}
async function waitFor(check: () => boolean) {
  const deadline = Date.now() + 12000;
  while (!check()) { if (Date.now() > deadline) throw new Error(`${stage}: timeout; selected=${selected().join(",")}`); await pause(); } await pause();
}
async function click(name: string) { await physical(find(name)); await waitFor(() => !isDocumentCommandPending()); }
async function key(key: string, modifiers = 0) { await input({ type: "key", key, modifiers }); await pause(); }
async function select(id: string, additive = false) { await physical(document.querySelector(`[data-model-object-id="${id}"] .tree-label`)!, additive ? 2 : 0); }
async function history(keyName: "z" | "y") { const revision = cadDocument.revision; await key(keyName, 2); await waitFor(() => cadDocument.revision > revision); }
async function duplicate() {
  const count = cadDocument.rootObjects.length; await key("d", 2); await waitFor(() => cadDocument.rootObjects.length > count && !isDocumentCommandPending()); return cadDocument.rootObjects.at(-1)!;
}

button.onclick = async () => {
  button.disabled = true; const checks: string[] = [];
  const check = (ok: unknown, label: string) => { if (!ok) throw new Error(`${stage}: ${label}; selected=${selected().join(",")}`); checks.push(`PASS: ${label}`); output.textContent = checks.join("\n"); };
  try {
    await waitFor(() => !!canvas()); await click("2D"); await select("seed");
    const ids = ["seed"], states = new Map<number, string>();
    for (let step = 1; step <= 105; step++) {
      stage = `duplicate ${step}`; ids.push(await duplicate());
      if (selected().join() !== ids[step]) throw new Error(`Duplicate did not hand off result ${step}`);
      if (step >= 103) states.set(step, state());
    }
    check(cadHistory.getPastLabels().length === 100, "105 native duplicates respect the bounded 100-entry history");
    stage = "first Undo after eviction"; await history("z");
    check(state() === states.get(104) && selected().join() === ids[104], "Undo after eviction restores the immediate predecessor's document and selected result");
    stage = "second Undo after eviction"; await history("z");
    check(state() === states.get(103) && selected().join() === ids[103], "Consecutive Undo follows the surviving history states rather than old depth slots");
    await history("y"); check(state() === states.get(104) && selected().join() === ids[104], "Redo restores the first surviving result selection");
    await history("y"); check(state() === states.get(105) && selected().join() === ids[105], "Redo restores the latest complete document and selection at the cap");
    stage = "branch after Undo"; await history("z"); await history("z"); await select("peer");
    const branch = await duplicate(), branchState = state();
    check(!cadHistory.canRedo() && !cadDocument.objects[ids[104]] && !cadDocument.objects[ids[105]], "Editing after Undo discards the former future without retaining its objects");
    await history("z");
    check(state() === states.get(103) && selected().join() === "peer", "Branch Undo restores the source selected after history navigation");
    await select("seed"); await history("y");
    check(state() === branchState && selected().join() === branch, "Branch Redo restores its own result instead of the old same-depth selection");
    await history("z");
    check(selected().join() === "seed", "Revisiting a state remembers the latest selection made before Redo");
    await history("y");

    stage = "multiple selection"; await select("seed"); await select("peer", true);
    const multiBefore = state(); await duplicate();
    const results = cadDocument.rootObjects.slice(-2), multiAfter = state();
    const isSelected = (expected: string[]) => selected().slice().sort().join() === expected.slice().sort().join();
    const primary = (id: string) => document.querySelector(".status-selection")?.getAttribute("title")?.startsWith(`Primary: ${cadDocument.objects[id].name} · ${id}`);
    check(isSelected(results) && primary(results[1]), "Batch Duplicate hands off both new objects and the primary result");
    await history("z");
    check(state() === multiBefore && isSelected(["seed", "peer"]) && primary("peer"), "One Undo restores the full multi-selection, primary object and pre-batch document");
    await history("y");
    check(state() === multiAfter && isSelected(results) && primary(results[1]), "One Redo restores the complete batch and primary result selection");

    stage = "topology selection and Explode"; await select("seed"); await click("Fit selected geometry"); await click("Direct");
    await waitFor(() => !!document.querySelector('.direct-edit-handles [tabindex="0"]')); await key("Tab");
    const topologyId = document.activeElement?.getAttribute("data-direct-handle");
    check(!!topologyId, "Native Tab reaches a semantic topology grip");
    await key("Enter"); await waitFor(() => !!document.querySelector('[data-testid="direct-edit-review"]')); await click("Cancel direct edit");
    const hasRef = () => Array.from(document.querySelectorAll(".property-row code")).some(el => el.textContent === topologyId);
    check(hasRef(), "Grip selection exposes the selected reference in Properties");
    const topologyBefore = state(); await physical(document.getElementById("tools-tab-modify")!); await click("Explode");
    await waitFor(() => Array.from(document.querySelectorAll<HTMLButtonElement>("#root button")).some(b => b.textContent === "Apply contour edit" && !b.disabled));
    await click("Apply contour edit"); await waitFor(() => !cadDocument.objects.seed);
    const exploded = selected(), topologyAfter = state();
    check(exploded.length === 4 && !hasRef(), "Explode replaces the rectangle with four selected edges and clears the old grip reference");
    await history("z");
    check(state() === topologyBefore && selected().join() === "seed" && hasRef(), "Undo restores the original topology and exact grip reference together");
    await history("y");
    check(state() === topologyAfter && isSelected(exploded) && !hasRef(), "Redo restores generated topology and result selection without a dangling source reference");

    stage = "hidden selection"; await select("peer"); const visibleState = state(); await key("h");
    await waitFor(() => !cadDocument.objects.peer.visible);
    check(!selected().includes("peer"), "Hiding the source removes it from the active selection");
    const hiddenState = state(); await history("z");
    check(state() === visibleState && selected().join() === "peer", "Undo Hide restores the visible source selection");
    await history("y");
    check(state() === hiddenState && !selected().includes("peer"), "Redo Hide filters the hidden source from restored selection");
    await history("z");

    stage = "same document reload";
    const saved = serializeDocument(cadDocument), savedState = state(), savedId = cadDocument.id, oldToken = cadHistory.getStateToken();
    // File-picker fixture drives App's real file-input handler; editing above uses native CDP input.
    const fileInput = document.querySelector<HTMLInputElement>('#root input[accept=".json,.webcad.json"]')!;
    const transfer = new DataTransfer(); transfer.items.add(new File([saved], "same.webcad.json", { type: "application/json" }));
    fileInput.files = transfer.files; fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    await waitFor(() => cadHistory.getStateToken() !== oldToken);
    check(cadDocument.id === savedId && state() === savedState && !selected().length && !cadHistory.canUndo() && !cadHistory.canRedo(), "Opening the same document clears history and selection while preserving saved geometry");
    await select("peer"); const reopenedCopy = await duplicate(); await history("z");
    check(state() === savedState && selected().join() === "peer" && !hasRef(), "A new Undo after same-ID reload cannot inherit a previous session's topology selection");
    await history("y");
    check(selected().join() === reopenedCopy && document.activeElement === canvas(), "Reloaded session Redo restores its own result and canvas keyboard focus");
    output.textContent = checks.join("\n") + `\nALL ${checks.length} CHECKS PASSED`;
  } catch (error) { output.textContent = checks.join("\n") + `\nFAIL: ${error instanceof Error ? error.message : String(error)}`; }
};
installBrowserChecks(button, output);
