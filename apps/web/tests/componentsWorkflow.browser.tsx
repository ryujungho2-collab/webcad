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
import { serializeDocument, deserializeDocument } from "@agent-webcad/cad-document";
import { worldDraftingGeometry } from "../src/precision/draftingGeometry";
import { installBrowserChecks } from "./helpers/browserChecks";

createRoot(document.getElementById("root")!).render(<App />);
const button = document.getElementById("run-components") as HTMLButtonElement;
const output = document.getElementById("components-result")!;
const checks: string[] = [];
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 25));
const state = () => { const { revision: _, ...value } = cadDocument; return JSON.stringify(value); };
const instances = () => Object.values(cadDocument.features).filter(feature => feature.type === "drafting" && feature.params.kind === "block");
const geometry = (id: string) => {
  const feature = Object.values(cadDocument.features).find(entry => entry.output === id)!;
  return worldDraftingGeometry(cadDocument, cadDocument.objects[id], feature);
};
async function waitFor(check: () => boolean, message = "Component workflow timed out") {
  const end = Date.now() + 14000;
  while (!check()) { if (Date.now() > end) throw new Error(message); await pause(); }
  await pause();
}
function buttonByName(name: string) {
  const found = Array.from(document.querySelectorAll<HTMLButtonElement>("#root button")).find(element => (element.getAttribute("aria-label") ?? element.textContent?.trim()) === name);
  if (!found) throw new Error(`Missing button: ${name}`);
  return found;
}
async function click(name: string) {
  const control = buttonByName(name);
  if (control.disabled) throw new Error(`Disabled button: ${name}`);
  control.click(); await pause(); await waitFor(() => !isDocumentCommandPending());
}
async function keys(...values: string[]) {
  for (const key of values) { document.body.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })); await pause(); }
  await waitFor(() => !isDocumentCommandPending());
}
async function setInput(label: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(`#root input[aria-label="${label}"]`);
  if (!input) throw new Error(`Missing input: ${label}`);
  input.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true })); await pause(); input.blur();
}
async function applyReady(label: string) {
  await waitFor(() => {
    const review = document.querySelector<HTMLElement>('[aria-label="Create Component review"], [aria-label="Update Component Definition review"]');
    return review?.dataset.commandStage === "ready" && !buttonByName(label).disabled;
  });
  await click(label);
}
function check(value: unknown, label: string, checks = workflowChecks) {
  if (!value) throw new Error(label);
  checks.push(`PASS: ${label}`); output.textContent = checks.join("\n");
}

const workflowChecks = checks;

button.onclick = async () => {
  button.disabled = true;
  checks.length = 0;
  try {
    await waitFor(() => Boolean(document.querySelector("canvas")));
    await click("New document"); await click("2D"); await waitFor(() => document.querySelector(".viewport-label")?.textContent?.includes("XY plane") === true);
    document.getElementById("tools-tab-draw")!.click(); await pause(); await click("Rectangle");
    await keys("0", ",", "0", "Enter", "5", "0", ",", "3", "0", "Enter", "Escape");
    check(cadDocument.rootObjects.length === 1, "A real drawing command creates the source symbol before component authoring");
    const modelRow = Array.from(document.querySelectorAll<HTMLElement>(".tree-row-model")).find(row => row.textContent?.includes("Rectangle"));
    if (!modelRow) throw new Error("Source drawing is missing from the model tree");
    modelRow.click(); await pause();
    const definitionBefore = state(), historyBefore = cadHistory.getPastLabels().length;
    await click("Components"); await click("Create component from selection");
    await setInput("Component name", "Window mark");
    await waitFor(() => !buttonByName("Apply component change").disabled);
    check(!cadDocument.blocks && state() === definitionBefore && cadHistory.getPastLabels().length === historyBefore, "Component definition is reviewed without mutating the document or history");
    await click("Apply component change");
    const componentId = Object.keys(cadDocument.blocks ?? {})[0];
    check(cadDocument.blocks?.[componentId].name === "Window mark" && cadHistory.getPastLabels().length === historyBefore + 1, "Apply creates one named definition and one undo step");
    await click("Insert component");
    check(document.querySelector<HTMLSelectElement>('[aria-label="Drafting operation"]')?.value === "insert-block" && document.querySelector<HTMLSelectElement>('[aria-label="Block definition"]')?.value === componentId, "Insert hands the selected definition directly into the precision placement workflow");
    await setInput("Drafting point", "100mm,200mm"); await waitFor(() => !buttonByName("Apply drafting").disabled); await click("Apply drafting");
    const firstId = instances()[0]?.output;
    check(!!firstId && geometry(firstId).lines[0].points.length === 4, "Placed instance resolves the source drawing into live component geometry");
    await click("Insert component"); await setInput("Drafting point", "250mm,200mm");
    await waitFor(() => !buttonByName("Apply drafting").disabled); await click("Apply drafting");
    const stableIds = instances().map(feature => feature.output).sort();
    const initialX = stableIds.map(id => geometry(id).lines[0].points[0][0]).sort((a,b) => a-b);
    check(stableIds.length === 2 && Math.abs(initialX[1] - initialX[0] - 150) < 1e-6, "Two positioned instances keep distinct identities and placements");
    document.getElementById("tools-tab-draw")!.click(); await pause(); await click("Rectangle");
    await keys("1", "0", "0", ",", "1", "0", "0", "Enter", "8", "0", ",", "4", "0", "Enter", "Escape");
    await click("Model tree");
    const drawings = Array.from(document.querySelectorAll<HTMLElement>(".tree-row-model")).filter(row => row.textContent?.includes("Rectangle"));
    if (drawings.length < 2) throw new Error("Updated source drawing is missing from the model tree");
    drawings.at(-1)!.click(); await pause(); await click("Components");
    const vectorFill = document.querySelector<HTMLInputElement>('[aria-label="Vector fill enabled"]');
    if (!vectorFill) throw new Error("Selected drawing does not expose vector appearance controls");
    const styleBefore = state(), styleHistory = cadHistory.getPastLabels().length;
    vectorFill.click(); await pause();
    const fillColor = document.querySelector<HTMLInputElement>('[aria-label="Vector fill"]')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(fillColor, "#ffcc00");
    fillColor.dispatchEvent(new Event("change", { bubbles: true })); await pause();
    await waitFor(() => !buttonByName("Apply vector appearance").disabled);
    check(state() === styleBefore && cadHistory.getPastLabels().length === styleHistory, "Fill styling is reviewed from the selected drawing without early document mutation");
    await click("Apply vector appearance");
    const styledSourceId = drawings.at(-1)!.getAttribute("data-model-object-id")!;
    const styledSource = Object.values(cadDocument.features).find(feature => feature.output === styledSourceId)!;
    check((styledSource.params.vectorStyle as { fill?: string } | undefined)?.fill === "#ffcc00", "The vector appearance editor applies a persistent fill to the source path");
    const componentRow = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="components-panel"] [role="option"]')).find(row => row.textContent?.includes("Window mark"));
    if (!componentRow) throw new Error("Component definition row is missing");
    componentRow.click(); await pause(); await click("Update component from selection");
    const beforeUpdate = state(), historyAtPreview = cadHistory.getPastLabels().length;
    check(state() === beforeUpdate && cadHistory.getPastLabels().length === historyAtPreview, "Definition replacement previews without changing either existing instance");
    await applyReady("Apply component change");
    const updated = state(), updatedLengths = stableIds.map(id => geometry(id).lines[0].points[1][0] - geometry(id).lines[0].points[0][0]);
    check(updatedLengths.every(length => Math.abs(length - 80) < 1e-6) && instances().map(feature => feature.output).sort().join() === stableIds.join(), `Updating one definition refreshes every existing instance while preserving instance IDs (lengths=${JSON.stringify(updatedLengths)}, source=${JSON.stringify(cadDocument.blocks?.[componentId].members[0].params.points)})`);
    const saved = serializeDocument(cadDocument), loaded = deserializeDocument(saved);
    check(JSON.stringify(loaded.blocks) === JSON.stringify(cadDocument.blocks) && Object.keys(loaded.objects).length === Object.keys(cadDocument.objects).length, "Save/reload preserves the definition graph and placed instance identities");
    await click("Undo"); check(state() !== updated && stableIds.every(id => Math.abs(geometry(id).lines[0].points[1][0] - geometry(id).lines[0].points[0][0] - 50) < 1e-6), "Undo restores the previous definition and regenerates both placements");
    await click("Redo"); check(state() === updated && stableIds.every(id => Math.abs(geometry(id).lines[0].points[1][0] - geometry(id).lines[0].points[0][0] - 80) < 1e-6), "Redo reapplies the definition and regenerates both placements");
    output.textContent = `${checks.join("\n")}\nALL ${checks.length} CHECKS PASSED`;
  } catch (error) { output.textContent = `${checks.join("\n")}\nFAIL: ${error instanceof Error ? error.stack : error}`; }
};
installBrowserChecks(button, output);
