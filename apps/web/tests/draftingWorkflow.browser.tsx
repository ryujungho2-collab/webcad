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
import { getWorldDrawingGeometry } from "../src/precision/worldGeometry";
import { WORKSPACE_TRANSITION_MS } from "../src/viewport/workspaceTransition";
import { installBrowserChecks } from "./helpers/browserChecks";

createRoot(document.getElementById("root")!).render(<App />);
const button = document.getElementById("run-drafting") as HTMLButtonElement;
const output = document.getElementById("drafting-result")!;
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 20));
const feature = (id: string) => Object.values(cadDocument.features).find((entry) => entry.output === id)!;
const state = () => { const { revision: _, ...state } = cadDocument; return JSON.stringify(state); };
async function waitFor(check: () => boolean) {
  const deadline = Date.now() + 15000;
  while (!check()) { if (Date.now() > deadline) throw new Error("UI condition timed out"); await pause(); }
  await pause();
}
function uiButton(name: string): HTMLButtonElement {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("#root button"));
  const match = buttons.find((button) => (button.getAttribute("aria-label") ?? button.textContent?.trim()) === name);
  if (!match) throw new Error(`Button not found: ${name}`);
  return match;
}
async function click(name: string) { uiButton(name).click(); await pause(); }
async function keys(...values: string[]) {
  for (const key of values) { document.body.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })); await pause(); }
  await waitFor(() => !isDocumentCommandPending());
}
async function shiftKey(key: string) {
  document.body.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey: true, bubbles: true, cancelable: true })); await pause();
}
async function setInput(label: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(`#root input[aria-label="${label}"]`);
  if (!input) throw new Error(`Input not found: ${label}`);
  input.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true })); await pause();
  input.blur(); await waitFor(() => !isDocumentCommandPending());
}

button.onclick = async () => {
  button.disabled = true;
  const lines: string[] = [];
  const check = (condition: unknown, label: string) => { if (!condition) throw new Error(label); lines.push(`PASS: ${label}`); output.textContent = lines.join("\n"); };
  try {
    await waitFor(() => Boolean(document.querySelector("canvas")));
    await click("New document"); await click("2D");
    // Select a tab by role, without bypassing application event handlers.
    (document.getElementById("tools-tab-draw") as HTMLButtonElement).click(); await pause();
    await click("Rectangle"); await keys("0", ",", "0", "Enter", "1", "0", "0", ",", "6", "0", "Enter");
    const originalId = cadDocument.rootObjects[0];
    await keys("2", "0", "0", ",", "0", "Enter", "4", "0", ",", "3", "0", "Enter");
    check(cadDocument.rootObjects.length === 2 && uiButton("Rectangle").getAttribute("aria-pressed") === "true", "First-point coordinates and repeated rectangles work without restarting the tool");
    await keys("0", ",", "0", "Enter", "1", "Escape");
    check(cadDocument.rootObjects.length === 2 && uiButton("Rectangle").getAttribute("aria-pressed") === "true", "First Esc cancels partial input while retaining the drawing tool");
    await keys("Escape");
    await shiftKey("R"); await keys(..."200,0", "Enter", "9", "0", "Enter");
    const rotatedId = cadDocument.rootObjects[1], world = getWorldDrawingGeometry(cadDocument.objects[rotatedId], feature(rotatedId))!;
    const rotatedState = state();
    check(world.planeAligned && Math.abs(world.points![0][0] - 200) < 1e-6 && Math.abs(world.points![0][1]) < 1e-6 && Math.abs(world.points![1][0] - 200) < 1e-6 && Math.abs(world.points![1][1] - 40) < 1e-6, "Shift+R rotates the actual corners around the chosen centre within XY");
    // The live inspector must show the projected area instead of a collapsed profile.
    check(document.querySelector("#root")!.textContent!.includes("1200.00"), "Rotated drawing still reports its 1200 square mm area");
    check(document.querySelector<HTMLInputElement>('[aria-label="Position Z"]')?.disabled && document.querySelector<HTMLInputElement>('[aria-label="Rotation X"]')?.disabled && !document.querySelector<HTMLInputElement>('[aria-label="Rotation Z"]')?.disabled, "2D Inspector permits planar position and rotation axes");
    await click("Undo"); await click("Redo");
    check(state() === rotatedState, "Toolbar Undo/Redo restores the complete planar rotation and geometry");
    (document.getElementById("tools-tab-draw") as HTMLButtonElement).click(); await pause();
    await click("Sketch"); await click("Rectangle"); await keys("0", ",", "0", "Enter", "1", "0", "0", ",", "6", "0", "Enter", "Escape");
    const unconstrained=state(); await click("Width"); await waitFor(()=>!uiButton("Apply constraint").disabled);
    check(state()===unconstrained,"Adding a driving width previews without mutating the sketch"); await click("Apply constraint");
    await click("Height"); await waitFor(()=>!uiButton("Apply constraint").disabled); await click("Apply constraint");
    const sketch = Object.values(cadDocument.sketches!)[0], sketchRect = sketch.geometry[0];
    await keys("m", ..."0,0", "Enter", ..."@20,10", "Enter");
    await shiftKey("R"); await keys(..."20,10", "Enter", ..."90deg", "Enter");
    const moved = cadDocument.sketches![sketch.id].geometry[0];
    check(moved.kind === "rectangle" && Math.abs(moved.angle! - Math.PI / 2) < 1e-8 && moved.origin[0] !== 0 && cadDocument.objects[sketchRect.id].transform!.rotation.every((value) => value === 0), "Sketch M and Shift+R edit source coordinates and preserve identity object transforms");
    await click("Duplicate");
    check(cadDocument.sketches![sketch.id].geometry.length === 2 && cadDocument.sketches![sketch.id].constraints.length === 4, "Sketch Duplicate selects the copy and preserves its internal width/height constraints");
    await setInput("Sketch offset distance", "10mm"); await click("Create offset");
    check(cadDocument.sketches![sketch.id].geometry.length === 3, "Sketch Offset accepts units and creates editable geometry");
    await keys("Delete");
    await click("Finish");
    // Select the original sketch rectangle through the rendered model tree.
    const rows = Array.from(document.querySelectorAll<HTMLElement>(".tree-row-model"));
    const row = rows.find((entry) => entry.textContent?.includes("Sketch Rectangle"));
    if (!row) throw new Error("Sketch rectangle model row not found");
    row.click(); await pause(); await click("Edit Sketch");
    const entityRow = Array.from(document.querySelectorAll<HTMLElement>(".tree-row-model")).find((entry) => entry.textContent?.includes("Sketch Rectangle"))!;
    entityRow.click(); await pause();
    // Delete a constrained copy, then restore the whole document through the real toolbar.
    const beforeDelete = state(); await keys("Delete"); await click("Undo");
    check(state() === beforeDelete, "Deleting constrained sketch geometry cleans relations and Undo restores the entire document");
    await click("Finish");
    Array.from(document.querySelectorAll<HTMLElement>(".tree-row-model")).find((entry) => entry.textContent?.includes("Sketch Rectangle"))!.click(); await pause();
    // Extrude is a ribbon command, so no test-only command dispatch is used.
    (document.getElementById("tools-tab-model") as HTMLButtonElement).click(); await pause(); await click("Extrude");
    const previewState=state(), previewHistory=cadHistory.getPastLabels().length;
    await waitFor(()=>!document.querySelector<HTMLButtonElement>('.extrusion-session button[type="submit"]')?.disabled);
    check(state()===previewState && cadHistory.getPastLabels().length===previewHistory, "Extrusion preview leaves the model and history untouched");
    await click("Cancel extrusion"); check(state()===previewState, "Cancelling extrusion discards the preview without changing geometry");
    document.getElementById("tools-tab-model")!.click(); await pause(); await click("Extrude"); await waitFor(()=>!document.querySelector<HTMLButtonElement>('.extrusion-session button[type="submit"]')?.disabled); await click("Apply extrusion");
    await waitFor(() => Object.values(cadDocument.features).some((entry) => entry.type === "extrude"));
    const solid = Object.values(cadDocument.features).find((entry) => entry.type === "extrude")!;
    check(solid.inputs.includes(sketchRect.id) && solid.dependencyMode === "live", "Actual sketch-to-solid command retains a live dependency through the Worker");
    // Re-enter the sketch via the Explorer, which exposes retained sketch sources.
    Array.from(document.querySelectorAll<HTMLButtonElement>("#root button")).find((entry) => entry.textContent?.includes(sketch.id) && entry.getAttribute("title")?.includes("Edit"))?.click();
    await pause();
    const widthConstraint = cadDocument.sketches![sketch.id].constraints.find((entry) => entry.kind === "distance" && "first" in entry && entry.first.geometryId === sketchRect.id)!;
    await setInput(`Width ${widthConstraint.id}`, "150mm");
    await waitFor(()=>!uiButton("Apply constraint").disabled); await click("Apply constraint");
    const mesh = await buildExtrudeMesh(feature(solid.output).params), bounds = meshPositionsBounds(mesh.positions)!;
    check(Math.abs(bounds.max[1] - bounds.min[1] - 150) < 1e-4 && cadDocument.objects[originalId], "Inspector driving width rebuilds the actual Worker solid to 150 mm without changing unrelated drawings");
    await click("Fit all geometry");
    // Calibrate the actual rendered camera through the normal drawing pointer
    // handlers. Equal screen spans must produce equal orthogonal plane spans.
    // Waiting past the transition catches obsolete frames overwriting Fit.
    await new Promise((resolve) => setTimeout(resolve, WORKSPACE_TRANSITION_MS + 50));
    (document.getElementById("tools-tab-draw") as HTMLButtonElement).click(); await pause();
    if (uiButton("OSNAP").getAttribute("aria-pressed") === "true") await click("OSNAP");
    await click("Line");
    const canvas = document.querySelector("#root canvas") as HTMLCanvasElement, rect = canvas.getBoundingClientRect();
    const pointer = async (x: number, y: number) => {
      canvas.dispatchEvent(new PointerEvent("pointerdown", { clientX: x, clientY: y, button: 0, pointerId: 91, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true }));
      await pause(); await waitFor(() => !isDocumentCommandPending());
    };
    const x = rect.left + 50, y = rect.top + 70, count = cadDocument.sketches![sketch.id].geometry.length;
    await pointer(x, y); await pointer(x + 40, y); await pointer(x, y); await pointer(x, y + 40);
    const calibration = cadDocument.sketches![sketch.id].geometry.slice(count);
    const horizontal = calibration[0], vertical = calibration[1];
    check(horizontal?.kind === "line" && vertical?.kind === "line" && Math.abs(horizontal.end[1] - horizontal.start[1]) < 1e-4 && Math.abs(vertical.end[0] - vertical.start[0]) < 1e-4 && Math.abs(Math.hypot(horizontal.end[0] - horizontal.start[0], horizontal.end[1] - horizontal.start[1]) - Math.hypot(vertical.end[0] - vertical.start[0], vertical.end[1] - vertical.start[1])) < 1e-4, "Fit during a 2D transition keeps the real camera planar with equal horizontal/vertical scale");
    await keys("Escape");
    output.textContent = `${lines.join("\n")}\nALL ${lines.length} CHECKS PASSED · ${cadHistory.getPastLabels().length} history entries`;
  } catch (error) { output.textContent = `${lines.join("\n")}\nFAIL: ${error instanceof Error ? error.message : error}`; }
};
installBrowserChecks(button, output);
