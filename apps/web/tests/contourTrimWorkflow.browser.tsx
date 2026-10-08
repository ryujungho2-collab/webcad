import { createRoot } from "react-dom/client";
import { App } from "../src/App";
import "../src/ui/tokens.css"; import "../src/ui/workstation.css"; import "../src/ui/commands.css"; import "../src/ui/menu.css"; import "../src/ui/explorer.css"; import "../src/ui/inspector.css";
import { cadDocument } from "../src/state/cadDocument"; import { cadHistory } from "../src/state/history"; import { dispatchCadCommand } from "../src/state/dispatchCadCommand"; import { saveDocumentToCache } from "../src/state/documentFile"; import { isDocumentCommandPending } from "../src/state/documentCommandQueue"; import { resetTestDocument } from "./helpers/documentHarness"; import { installBrowserChecks } from "./helpers/browserChecks";
import { exactDrawingContour, contourLength } from "../src/features/drawing-editing/geometry/contourEditing";
import { serializeDocument, deserializeDocument } from "@agent-webcad/cad-document";
import type { CadCommand } from "@agent-webcad/cad-commands";
import type { DrawingTopology } from "../src/precision/drawingTopology";
import { buildExtrudeMesh } from "../src/cad/kernelGeometryService";
import { meshVolume } from "./helpers/documentHarness";
resetTestDocument();
for (const command of [
  { type: "create-drawing", id: "open", drawing: "line", name: "Rail", params: { points: [[0, -80, 0], [100, -80, 0]], workPlane: "XY" } },
  { type: "create-drawing", id: "open-cut", drawing: "polyline", name: "Two crossings", params: { points: [[40, -100, 0], [40, -60, 0], [60, -60, 0], [60, -100, 0]], workPlane: "XY" } },
  { type: "create-dimension", id: "open-dim", dimension: "linear", params: { points: [[0, -80], [100, -80]], sourceObjectId: "open", workPlane: "XY", offset: 12 } },
  { type: "create-drawing", id: "closed", drawing: "rectangle", name: "Plate outline", params: { points: [[160, 0, 0], [260, 0, 0], [260, 60, 0], [160, 60, 0]], workPlane: "XY" } },
  { type: "create-drawing", id: "closed-cut", drawing: "line", name: "Corner boundary", params: { points: [[200, 70, 0], [270, 0, 0]], workPlane: "XY" } },
  { type: "create-dimension", id: "closed-dim", dimension: "linear", params: { points: [[160, 0], [260, 0]], sourceObjectId: "closed", sourceSegmentId: "closed:segment:0", workPlane: "XY", offset: 12 } },
  { type: "create-extrude", id: "plate", profileObjectIds: ["closed"], distance: 10 },
] as CadCommand[]) {
  if (command.type === "create-dimension" && command.id === "closed-dim") command.params.sourceSegmentId = (cadDocument.features["feature-closed"].params.topology as DrawingTopology).segments[0].id;
  const r = await dispatchCadCommand(command); if (!r.ok) throw new Error(r.reason);
}
const closedEdge = String(cadDocument.features["feature-closed-dim"].params.sourceSegmentId);
saveDocumentToCache(); createRoot(document.getElementById("root")!).render(<App />);
const button = document.getElementById("run-trim") as HTMLButtonElement, output = document.getElementById("trim-result")!;
const editor = () => document.querySelector<HTMLFormElement>('form[aria-label="Curve workflow"]'), canvas = () => document.querySelector<HTMLCanvasElement>("#root canvas")!;
const feature = (id: string) => Object.values(cadDocument.features).find(f => f.output === id)!, path = (id: string) => exactDrawingContour(cadDocument.objects[id], feature(id));
const pause = () => new Promise<void>(r => setTimeout(r, 30)), state = () => { const { revision: _, ...d } = cadDocument; return JSON.stringify(d); }, history = () => cadHistory.getPastLabels().length, near = (a: number, b: number) => Math.abs(a - b) < .05;
const find = (name: string) => Array.from(document.querySelectorAll<HTMLButtonElement>("#root button")).find(b => (b.getAttribute("aria-label") ?? b.textContent?.trim()) === name);
const wfButton = (name: string) => Array.from(editor()?.querySelectorAll<HTMLButtonElement>("button") ?? []).find(b => b.textContent?.trim() === name)!;
async function waitFor(check: () => boolean) { const deadline = Date.now() + 12000; while (!check()) { if (Date.now() > deadline) throw new Error("UI timeout: " + editor()?.textContent); await pause(); } await pause(); }
async function input(action: Record<string, unknown>) { const run = new URLSearchParams(location.search).get("run"), r = await fetch(`/__browser_input?run=${run}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) }); if (!r.ok) throw new Error(await r.text()); return r; }
const mouse = (type: string, x: number, y: number, modifiers = 0) => input({ type, x, y, modifiers, button: "left", buttons: type === "mouseReleased" ? 0 : 1 });
async function physical(element: Element, modifiers = 0) { if (!element) throw new Error("Missing element"); element.scrollIntoView({ block: "nearest" }); await pause(); const r = element.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2; if (!element.contains(document.elementFromPoint(x, y))) throw new Error("Obscured: " + element.outerHTML.slice(0, 200)); await mouse("mousePressed", x, y, modifiers); await mouse("mouseReleased", x, y, modifiers); await pause(); }
async function click(name: string, workflow = false) { const b = workflow ? wfButton(name) : find(name); if (!b || b.disabled) throw new Error("Missing or disabled " + name); await physical(b); await waitFor(() => !isDocumentCommandPending()); }
async function key(key: string, modifiers = 0) { await input({ type: "key", key, modifiers }); await pause(); }
async function selectObject(id: string) { await physical(document.querySelector(`[data-model-object-id="${id}"] .tree-label`)!); }
async function choose(label: string, value: string) { const el = editor()!.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!; const index = Array.from(el.options).findIndex(o => o.value === value); if (index < 0) throw new Error("Missing option " + label + ": " + value); await physical(el); await key("Home"); for (let i = 0; i < index; i++) await key("ArrowDown"); await key("Enter"); await pause(); }
const ready = () => waitFor(() => !!editor() && !!wfButton("Apply workflow edit") && !wfButton("Apply workflow edit").disabled);
async function pickScreen(p: number[]) { const rect = canvas().getBoundingClientRect(), x = rect.left + p[0], y = rect.top + p[1]; if (document.elementFromPoint(x, y) !== canvas()) throw new Error("Canvas pick hidden by panel"); await mouse("mousePressed", x, y); await mouse("mouseReleased", x, y); await pause(); }
const screenLine = (index: number) => Array.from(document.querySelectorAll<SVGPolylineElement>('[data-curve-workflow-preview] polyline[stroke="#e7b369"]'))[index].getAttribute("points")!.split(" ").map(s => s.split(",").map(Number));
async function screenshot(name: string) { if (!new URLSearchParams(location.search).has("artifacts")) return; document.querySelector<HTMLElement>("body>aside")!.style.visibility = "hidden"; const r = await (await input({ type: "screenshot" })).json(); document.querySelector<HTMLElement>("body>aside")!.style.visibility = ""; ((globalThis as typeof globalThis & { cadTestArtifacts?: Record<string, string> }).cadTestArtifacts ??= {})[name] = r.data; }
button.onclick = async () => {
  button.disabled = true; button.style.pointerEvents = "none"; const lines: string[] = [], check = (ok: unknown, label: string) => { if (!ok) throw new Error(label); lines.push(`PASS: ${label}`); };
  try {
    await waitFor(() => !!canvas()); await click("2D"); await selectObject("open"); await physical(document.getElementById("tools-tab-modify")!); await click("Curve workflow"); await click("Trim", true); await choose("Workflow second curve", "open-cut"); await choose("Workflow trim scope", "interval");
    const initial = state(), initialH = history(); await click("Fit workflow preview", true); await pause(); const rail = screenLine(0);
    await click("Pick target branch", true); await key("Escape"); check(!!editor() && wfButton("Pick target branch").getAttribute("aria-pressed") === "false" && state() === initial && document.activeElement === canvas(), "Escape ends branch picking and retains the workflow and canvas focus");
    await click("Pick target branch", true); await pickScreen(rail[0].map((v, i) => (v + rail.at(-1)![i]) / 2));
    await waitFor(() => !!document.querySelector('[data-curve-workflow-preview] polyline[stroke="#ff7878"]'));
    check(state() === initial && history() === initialH, "A trusted middle pick displays the removed interval without committing");
    check(wfButton("Apply workflow edit").disabled && !!editor()!.querySelector('[aria-label="Reconnect contour references"]'), "Apply waits for an explicit dimension reference");
    await choose("Reference result open-dim open", "0"); await choose("Reference portion open-dim open", "0"); await ready();
    check(!!document.querySelector('[data-curve-workflow-preview] polyline[stroke="#6cb9ff"]'), "The chosen dimension edge is highlighted on the canvas");
    const firstImpact = editor()!.querySelector('[aria-label="Contour reference impact"]')!.textContent!;
    check(firstImpact.includes("100.00 mm → 40.00 mm"), `The reviewed dimension changes from 100 to 40 mm: ${firstImpact}`);
    await screenshot("cad-trim-middle.png"); await click("Cancel workflow", true); await waitFor(() => !editor()); check(state() === initial && history() === initialH && document.activeElement === canvas(), "Cancel discards interval and reference review without changing the document or history");
    await click("Curve workflow"); await click("Trim", true); await choose("Workflow second curve", "open-cut"); await choose("Workflow trim scope", "interval"); await click("Fit workflow preview", true); await pause(); const repeatRail = screenLine(0); await click("Pick target branch", true); await pickScreen(repeatRail[0].map((v, i) => (v + repeatRail.at(-1)![i]) / 2)); await waitFor(() => !!document.querySelector('[data-curve-workflow-preview] polyline[stroke="#ff7878"]')); await choose("Reference result open-dim open", "0"); await choose("Reference portion open-dim open", "0"); await ready();
    await click("Apply workflow edit", true); await waitFor(() => !!wfButton("Reconnect gap and Join result"));
    const [left, right] = cadDocument.rootObjects.filter(id => id.startsWith("contour-"));
    check(near(contourLength(path(left)), 40) && near(contourLength(path(right)), 40) && feature("open-dim").params.sourceObjectId === left && history() === initialH + 1, "Middle Trim creates two exact pieces and routes the dimension in one Undo");
    await click("Reconnect gap and Join result", true); await choose(`Reference result open-dim ${left}`, "0"); await choose(`Reference portion open-dim ${left}`, "span"); await ready();
    check(editor()!.querySelector('[aria-label="Contour reference impact"]')!.textContent!.includes("40.00 mm → 100.00 mm"), "Gap Join reviews the endpoint dimension becoming 100 mm again");
    await click("Apply workflow edit", true); await waitFor(() => !!wfButton("Finish workflow")); const joined = String(feature("open-dim").params.sourceObjectId), joinedState = state();
    check(near(contourLength(path(joined)), 100) && feature("open-dim").inputs[0] === joined && !cadDocument.objects[left] && !cadDocument.objects[right] && history() === initialH + 2, "Explicit gap reconnection joins the pieces and updates the saved reference");
    await click("Finish workflow", true); await click("Undo"); await click("Undo"); check(state() === initial, "Two Undo actions restore original geometry and dimension"); await click("Redo"); await click("Redo"); check(state() === joinedState, "Two Redo actions restore the entire reconnected workflow");
    await selectObject("closed"); await click("Curve workflow"); await click("Trim", true); await choose("Workflow second curve", "closed-cut");
    check(editor()!.querySelector<HTMLSelectElement>('[aria-label="Workflow trim scope"]')!.value === "interval", "A closed target selects bounded interval Trim automatically");
    const beforeClosed = state(), closedH = history(); await click("Fit workflow preview", true); await pause(); const outline = screenLine(0);
    await click("Pick target branch", true); await pickScreen(outline[1].map((v, i) => v + 2 / 3 * (outline[2][i] - v)));
    await waitFor(() => !!document.querySelector('[data-curve-workflow-preview] polyline[stroke="#ff7878"]'));
    await choose("Reference result closed-dim closed", "0"); await choose("Reference portion closed-dim closed", "2"); await choose("Reference result plate closed", "0");
    await waitFor(() => editor()!.textContent!.includes("Cannot regenerate"));
    check(wfButton("Apply workflow edit").disabled && state() === beforeClosed && history() === closedH, "An open solid profile is rejected without leaving stale geometry");
    await physical(editor()!.querySelector('[aria-label="Reconnect trimmed ends"]')!);
    check(wfButton("Apply workflow edit").disabled, "Changing reconnection resets the reference choices for renewed review");
    await choose("Reference result closed-dim closed", "0"); await choose("Reference portion closed-dim closed", "2"); await choose("Reference result plate closed", "0"); await ready();
    const impact = editor()!.querySelector('[aria-label="Contour reference impact"]')!.textContent!;
    check(impact.includes("60000.00 → 47500.00") && impact.includes("100.00 mm → 100.00 mm") && state() === beforeClosed, "The same preview shows reduced volume and the unchanged bottom-edge dimension");
    check(!!document.querySelector('[data-curve-workflow-preview] polyline[stroke="#ff7878"]') && !!document.querySelector('[data-curve-workflow-preview] polyline[stroke="#70dfb2"]') && !!document.querySelector('[data-curve-workflow-preview] polyline[stroke="#6cb9ff"]'), "Removed corner, closed result and retained reference edge are visible together");
    await screenshot("cad-trim-closed.png"); await click("Apply workflow edit", true); await waitFor(() => !!wfButton("Finish workflow")); const result = feature("plate").inputs[0];
    check(path(result).closed && near(meshVolume(await buildExtrudeMesh(feature("plate").params)), 47500) && feature("closed-dim").params.sourceObjectId === result && feature("closed-dim").params.sourceSegmentId === closedEdge && history() === closedH + 1, "Atomic cut/rejoin regenerates the solid and preserves the linked analytic edge");
    await click("Finish workflow", true); const afterClosed = state(); await click("Undo"); check(state() === beforeClosed, "One Undo restores the entire profile/dimension/solid before the closed edit"); await click("Redo"); check(state() === afterClosed, "One Redo restores the entire profile/dimension/solid after the closed edit");
    const reopened = deserializeDocument(serializeDocument(cadDocument)); check(JSON.stringify(reopened) === JSON.stringify(cadDocument), "Saving and reopening preserves all reconnected references and geometry");
    // A public later edit independently verifies the saved relationship after native workflow Apply.
    const t = feature(result).params.topology as DrawingTopology, edit = await dispatchCadCommand({ type: "edit-drawing-control", objectId: result, controlId: t.controls[3].id, point: [280, 0, 0] });
    check(edit.ok && near(meshVolume(await buildExtrudeMesh(feature("plate").params)), 48500) && (feature("closed-dim").params.points as number[][])[1][0] === 280, "Later vertex edits continue to update the saved dimension and live extrusion");
    output.textContent = [...lines, `ALL ${lines.length} CHECKS PASSED`].join("\n");
  } catch (e) { output.textContent = [...lines, `FAIL: ${e instanceof Error ? e.stack : String(e)}`].join("\n"); }
};
installBrowserChecks(button, output);
