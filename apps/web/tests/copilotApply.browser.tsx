import { createRoot } from "react-dom/client";
import { App } from "../src/App";
import "../src/ui/tokens.css"; import "../src/ui/workstation.css"; import "../src/ui/commands.css"; import "../src/ui/menu.css"; import "../src/ui/explorer.css"; import "../src/ui/inspector.css";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory } from "../src/state/history";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { enqueueDocumentCommand, isDocumentCommandPending } from "../src/state/documentCommandQueue";
import { previewCadCommand, discardCadPlan } from "../src/state/documentPlans";
import { installBrowserChecks } from "./helpers/browserChecks";
import { click, find, text, choose, waitFor, pause, physical } from "./helpers/physicalInput";

createRoot(document.getElementById("root")!).render(<App />);
const button = document.getElementById("run-apply") as HTMLButtonElement, output = document.getElementById("apply-result")!;
const circle = (id: string, layerId?: string) => ({ type: "create-drawing", id, layerId, drawing: "circle", params: { workPlane: "XY", center: [0,0,0], radius: 12 } });
let command: unknown = circle("first"), unhandled = 0;
window.addEventListener("unhandledrejection", () => { unhandled++; });
const originalFetch = window.fetch.bind(window);
window.fetch = async (url, init) => String(url).endsWith("/api/copilot/apply")
  ? new Response(JSON.stringify({ version: 1, summary: ["Reviewed creation"], command }), { headers: { "Content-Type": "application/json" } })
  : originalFetch(url, init);
const exact = () => JSON.stringify(cadDocument);
const semantic = () => { const { revision: _, ...rest } = cadDocument; return JSON.stringify(rest); };
const history = () => JSON.stringify({ past: cadHistory.getPastLabels(), future: cadHistory.getFutureLabels() });
const apply = () => [...document.querySelectorAll<HTMLButtonElement>('[data-testid="copilot-panel"] button')].find(b => b.textContent?.trim() === "Apply");
const ready = () => waitFor(() => !!apply() && !apply()!.disabled);
const idle = () => waitFor(() => !isDocumentCommandPending());
const alert = () => document.querySelector('[data-testid="copilot-panel"] [role="alert"]')?.textContent ?? "";
async function plan(prompt: string) { await text("Copilot prompt", prompt); await click("Plan"); }
function holdQueue() {
  let release!: () => void;
  const pending = enqueueDocumentCommand(() => new Promise<void>(resolve => { release = resolve; }));
  return { pending, release: () => release() };
}

button.onclick = async () => {
  button.disabled = true;
  const checks: string[] = [], check = (ok: unknown, label: string) => { if (!ok) throw new Error(label); checks.push(`PASS: ${label}`); output.textContent = checks.join("\n"); };
  try {
    await waitFor(() => !!document.querySelector("canvas")); await click("New document");
    await dispatchCadCommand({ type: "create-layer", id: "other" });
    await click("Copilot"); await choose("Copilot planner", 1); await text("Copilot gateway URL", "/api/copilot/apply");
    const start = exact(), labels = history();
    command = circle("wrong-layer", "other"); await plan("Explicit wrong layer"); await waitFor(() => alert().includes("outside the reviewed active layer"));
    check(!apply() && exact() === start && history() === labels, "A gateway output outside the reviewed active layer is rejected before mutation");
    check(alert().includes("Select that layer or correct the proposal"), "Layer mismatch names a recovery action and preserves the prompt");

    command = circle("cancelled", "layer-default"); await plan("Cancel queued Apply"); await ready();
    const queued = holdQueue(); await pause(); const control = apply()!; await physical(control); await physical(control);
    check(control.disabled && !!find("Cancel apply") && exact() === start, "Repeated native Apply input is disabled while the reviewed transaction waits");
    await click("Cancel apply"); queued.release(); await queued.pending; await idle();
    check(!cadDocument.objects.cancelled && exact() === start && history() === labels && !apply(), "Cancel Apply before publication leaves document and history byte-equivalent");
    check((document.querySelector('[aria-label="Copilot prompt"]') as HTMLInputElement).value === "Cancel queued Apply", "Cancel keeps the editable prompt for retry");

    command = circle("superseded"); await click("Plan"); await ready();
    const superseded = holdQueue(); await pause(); await click("Apply");
    command = circle("replacement"); await plan("Replacement request"); await ready();
    superseded.release(); await superseded.pending; await idle();
    check(!cadDocument.objects.superseded && !apply()!.disabled && alert() === "", "Old Apply completion cannot erase the replacement request or enable an old plan");
    await click("Apply"); await waitFor(() => !!cadDocument.objects.replacement); const created = semantic();
    check(cadHistory.getPastLabels().length === JSON.parse(labels).past.length + 1 && cadDocument.objects.replacement.layerId === "layer-default", "Replacement proposal commits once on the reviewed layer");
    check(document.querySelector('[aria-label="Copilot result"]')?.textContent?.includes("1 object") && document.querySelector('[aria-label="Copilot review"]')?.getAttribute("data-command-stage") === "completed", "Success hands the selected result to the common completed interaction");
    await click("Inspect result"); check(document.querySelector('[data-model-object-id="replacement"]')?.getAttribute("aria-pressed") === "true", "Inspect result opens the model tree with the exact created object selected");
    await click("Undo"); check(semantic() === JSON.stringify(JSON.parse(start), (key, value) => key === "revision" ? undefined : value), "Undo restores the complete document before the winning proposal");
    await click("Redo"); check(semantic() === created && document.querySelector('[data-model-object-id="replacement"]')?.getAttribute("aria-pressed") === "true", "Redo restores the reviewed geometry and result selection");

    await click("Copilot"); command = circle("old-selection"); await plan("Selection race"); await ready(); const selectionBefore = exact(), selectionHistory = history();
    const selectionQueue = holdQueue(); await pause(); await click("Apply"); await click("Model tree");
    await physical(document.querySelector('[data-model-object-id="replacement"] .tree-label')!, 2); await click("Copilot");
    await waitFor(() => alert().includes("selection changed")); selectionQueue.release(); await selectionQueue.pending; await idle();
    check(exact() === selectionBefore && history() === selectionHistory && !apply(), "Selection change during queued Apply invalidates it with no publication");

    command = circle("before-manual-edit"); await plan("Document race"); await ready();
    const documentQueue = holdQueue(); await pause();
    const manual = dispatchCadCommand({ type: "rename-object", objectId: "replacement", name: "Manual change" });
    await click("Apply"); documentQueue.release(); await documentQueue.pending; await manual; await idle();
    check(!cadDocument.objects["before-manual-edit"] && cadDocument.objects.replacement.name === "Manual change", "An earlier queued manual edit wins without being overwritten by Copilot");
    check(alert().includes("document changed") && !apply(), "Publication failure leaves a visible replan explanation and no stale Apply");

    await click("Layers"); await click("Lock Default"); await idle(); await click("Copilot"); const locked = exact(), lockedHistory = history();
    command = circle("locked-output"); await plan("Locked output"); await waitFor(() => !!alert());
    check(!apply() || apply()!.disabled, "Locked active layer uses the common disabled Apply decision");
    check(exact() === locked && history() === lockedHistory && document.querySelector('[aria-label="Copilot review"]')?.textContent?.includes("Unlock"), "Locked layer preserves the document and shows how to recover");
    await click("Layers"); await click("Unlock Default"); await idle(); await click("Copilot"); await click("Plan"); await ready();
    check(!apply()!.disabled, "Unlock and replan recover the same prompt through detached review"); await click("Clear");

    command = { type: "batch", commands: [circle("partial"), circle("replacement")] };
    const beforeBatch = exact(), batchHistory = history(); await plan("Partially failed batch"); await waitFor(() => alert().includes("rejected"));
    check((!apply() || apply()!.disabled) && exact() === beforeBatch && history() === batchHistory, "A valid first creation and rejected second member cannot leak partial geometry or history"); await click("Clear");

    command = circle("expired"); await plan("Expired review"); await ready();
    const beforeExpiry = exact(), expiryHistory = history(), filler: string[] = [];
    // Exercise the real bounded plan cache, without changing the document.
    for (let i = 0; i < 17; i++) filler.push((await previewCadCommand(circle(`cache-${i}`))).planId);
    await click("Apply"); await waitFor(() => alert().includes("expired")); filler.forEach(discardCadPlan);
    check(!apply() && exact() === beforeExpiry && history() === expiryHistory, "An expired reviewed plan reports recovery without document or history mutation");
    check((document.querySelector('[aria-label="Copilot prompt"]') as HTMLInputElement).value === "Expired review" && !find("Plan").disabled, "Expired review preserves the prompt and allows a fresh Plan");

    await click("2D"); await physical(document.getElementById("tools-tab-draw")!); await click("Sketch"); await idle(); await click("Copilot");
    command = circle("outside-sketch"); const sketchBefore = exact(), sketchHistory = history(); await plan("Active sketch"); await waitFor(() => !!apply());
    check(apply()!.disabled && document.querySelector('[aria-label="Copilot review"]')?.textContent?.includes("Finish the active sketch"), "Active Sketch prevents a detached Copilot creation from applying outside its editing session");
    check(exact() === sketchBefore && history() === sketchHistory, "Blocked Sketch Apply preserves its document and history"); await click("Clear"); await click("Finish");
    await choose("Copilot planner", 0); const rulesBefore = semantic(), rulesHistory = cadHistory.getPastLabels().length;
    await plan("radius 4 circle"); await ready(); await click("Apply"); await waitFor(() => !!document.querySelector('[aria-label="Copilot result"]'));
    check(cadHistory.getPastLabels().length === rulesHistory + 1 && Object.values(cadDocument.features).some(f => f.type === "drawing" && f.params.radius === 4), "Local rules use the same reviewed single Apply transaction as gateway mode");
    const rulesAfter = semantic(); await click("Undo"); check(semantic() === rulesBefore, "Local rule Undo restores its full baseline"); await click("Redo"); check(semantic() === rulesAfter, "Local rule Redo restores the exact result");
    check(unhandled === 0, "Cancelled, stale and failed Apply paths have no unhandled asynchronous errors");
    output.textContent = checks.join("\n") + `\nALL ${checks.length} CHECKS PASSED`;
  } catch (error) { output.textContent = checks.join("\n") + `\nFAIL: ${error instanceof Error ? error.stack : error}`; }
};
installBrowserChecks(button, output);
