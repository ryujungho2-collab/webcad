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
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { getWorldDrawingGeometry } from "../src/precision/worldGeometry";
import { installBrowserChecks } from "./helpers/browserChecks";

createRoot(document.getElementById("root")!).render(<App />);
const button = document.getElementById("run-experience") as HTMLButtonElement, output = document.getElementById("experience-result")!;
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 30));
const state = () => { const { revision: _, ...document } = cadDocument; return JSON.stringify(document); };
const history = () => cadHistory.getPastLabels().length;
const status = () => document.querySelector<HTMLElement>("[data-point-stage]");
const canvas = () => document.querySelector<HTMLCanvasElement>("#root canvas")!;
const world = (id: string) => getWorldDrawingGeometry(cadDocument.objects[id], Object.values(cadDocument.features).find(f => f.output === id)!)!;
async function waitFor(check: () => boolean) {
  const deadline = Date.now() + 15000;
  while (!check()) { if (Date.now() > deadline) throw new Error("CAD experience condition timed out"); await pause(); }
  await pause();
}
function uiButton(name: string) {
  const match = Array.from(document.querySelectorAll<HTMLButtonElement>("#root button")).find(b => (b.getAttribute("aria-label") ?? b.textContent?.trim()) === name);
  if (!match) throw new Error(`Missing button: ${name}`); return match;
}
async function click(name: string) { uiButton(name).click(); await pause(); await waitFor(() => !isDocumentCommandPending()); }
async function key(key: string, options: KeyboardEventInit = {}, target: EventTarget = document.activeElement ?? document.body) {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options }));
  await pause(); await waitFor(() => !isDocumentCommandPending());
}
async function type(value: string) { for (const character of value) await key(character); }
async function point(value: string) { await type(value); await key("Enter"); }
function previewPoints() {
  const path = document.querySelector<SVGPolylineElement>(".point-transform-preview polyline");
  if (!path || path.points.numberOfItems < 2) throw new Error("Expected a line preview");
  return Array.from({ length: path.points.numberOfItems }, (_, i) => { const p = path.points.getItem(i); return [p.x, p.y]; });
}
const baseScreen = () => {
  const marker = document.querySelector<SVGCircleElement>(".point-base-marker")!;
  return [marker.cx.baseVal.value, marker.cy.baseVal.value];
};
async function mouse(type: string, x: number, y: number, extra: Record<string, unknown> = {}) {
  const rect = canvas().getBoundingClientRect(), run = new URLSearchParams(location.search).get("run");
  const response = await fetch(`/__browser_input?run=${run}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, x: rect.left + x, y: rect.top + y, ...extra }) });
  if (!response.ok) throw new Error(await response.text()); await pause();
  await waitFor(() => !isDocumentCommandPending());
}
const close = (a: number, b: number) => Math.abs(a - b) < 1e-5;
button.onclick = async () => {
  button.disabled = true; const lines: string[] = [];
  const check = (condition: unknown, label: string) => { if (!condition) throw new Error(label); lines.push(`PASS: ${label}`); output.textContent = lines.join("\n"); };
  try {
    await waitFor(() => Boolean(canvas())); await click("New document"); await click("2D");
    document.getElementById("tools-tab-draw")!.click(); await pause();
    await key("r"); await point("0,0"); await point("100,60"); await key("Escape");
    const firstRectangle = cadDocument.rootObjects[0], beforeSecond = history();
    await key("r"); await point("200,0"); await point("40,30"); await key("Escape");
    check(cadDocument.rootObjects.length === 2 && history() === beforeSecond + 1 && cadDocument.objects[firstRectangle].transform!.rotation.every(v => v === 0), "R draws another rectangle while the previous rectangle remains selected");

    await click("New document"); await click("Line"); await point("0,0"); await point("100,0"); await key("Escape");
    const original = cadDocument.rootObjects[0], originalState = state(), originalHistory = history();
    uiButton("Copy by points").focus(); await click("Copy by points");
    check(document.activeElement === canvas() && status()?.dataset.pointStage === "base", "Starting from a focused toolbar button returns keyboard input to the canvas");
    await point("0,0"); await type("@300,0");
    check(state() === originalState && history() === originalHistory && document.querySelector(".point-transform-preview polyline"), "Typed target previews the copy without mutating the document or history");
    await key("Enter");
    const firstCopy = cadDocument.rootObjects[1];
    check(close(world(firstCopy).points![0][0], 300) && status()?.dataset.pointStage === "target" && history() === originalHistory + 1, "First copy keeps the command and base point ready for another placement");
    await point("@600,0");
    const secondCopy = cadDocument.rootObjects[2];
    check(close(world(secondCopy).points![0][0], 600) && close(world(original).points![0][0], 0) && history() === originalHistory + 2, "Repeated relative copies use the original source/base, without cumulative drift");
    const copiedState = state(); await type("@0,0"); await key("Enter");
    check(state() === copiedState && history() === originalHistory + 2 && status()?.textContent?.includes("unchanged"), "A zero displacement explains the rejection and preserves the active session/history");
    await key("Escape");
    check(status()?.dataset.pointStage === "target", "Esc clears rejected target input while retaining the chosen base");

    document.getElementById("tools-tab-view")!.click(); await pause(); await click("Fit");
    await waitFor(() => previewPoints()[1][0] < canvas().clientWidth - 10 && previewPoints()[0][0] > 0);
    const fitted = previewPoints(), firstEndpoint = [fitted[0][0] - 2 * (fitted[1][0] - fitted[0][0]), fitted[0][1]];
    check(state() === copiedState && status()?.dataset.pointStage === "target", "Fit all exposes distant copies without resetting the chosen source/base");
    await mouse("mouseMoved", firstEndpoint[0] + 1, firstEndpoint[1] + 1);
    check(document.querySelector('[data-point-snap="endpoint"]'), "Newly placed copies immediately participate in visible endpoint snapping");
    await key("Alt");
    check(!document.querySelector("[data-point-snap]") && status()?.textContent?.includes("Snap suppressed"), "Holding Alt temporarily suppresses object snapping without ending the copy");
    canvas().dispatchEvent(new KeyboardEvent("keyup", { key: "Alt", bubbles: true })); await pause();
    check(document.querySelector('[data-point-snap="endpoint"]'), "Releasing Alt restores the same snap candidate without moving the mouse");
    await key("F3");
    check(!document.querySelector("[data-point-snap]") && status()?.textContent?.includes("Snap off"), "F3 switches object snap off during an active point operation");
    await key("F3");
    await mouse("mousePressed", firstEndpoint[0] + 1, firstEndpoint[1] + 1, { button: "left", buttons: 1 });
    await mouse("mouseReleased", firstEndpoint[0] + 1, firstEndpoint[1] + 1, { button: "left" });
    const thirdCopy = cadDocument.rootObjects[3];
    check(close(world(thirdCopy).points![0][0], 400) && close(world(thirdCopy).points![0][1], 0) && history() === originalHistory + 3 && status()?.dataset.pointStage === "target" && document.querySelector(".point-transform-preview polyline"), "A trusted pointer click places the copy exactly and preserves the repeat session, source/base and preview");

    const navState = state(), navHistory = history(), pathBefore = previewPoints();
    const length = (p: number[][]) => Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1]);
    await mouse("mouseWheel", canvas().clientWidth / 2, canvas().clientHeight / 2, { deltaY: -120, modifiers: 2 });
    await waitFor(() => Math.abs(length(previewPoints()) - length(pathBefore)) > .5);
    check(state() === navState && history() === navHistory && status()?.dataset.pointStage === "target", "Ctrl+wheel zoom remains active and reprojects the copy preview without committing it");
    const baseBefore = baseScreen(), x = canvas().clientWidth / 2, y = canvas().clientHeight / 2;
    await mouse("mousePressed", x, y, { button: "middle", buttons: 4 });
    await mouse("mouseMoved", x + 70, y + 40, { button: "middle", buttons: 4 });
    await mouse("mouseReleased", x + 70, y + 40, { button: "middle" });
    await waitFor(() => Math.hypot(baseScreen()[0] - baseBefore[0], baseScreen()[1] - baseBefore[1]) > 5);
    check(state() === navState && history() === navHistory && status()?.dataset.pointStage === "target", "Trusted middle-mouse pan moves the view/base marker and leaves the operation intact");
    await key("Enter");
    check(!status() && state() === navState && history() === navHistory, "Empty Enter finishes repeated Copy without creating another object/history entry");
    await key("z", { ctrlKey: true });
    check(cadDocument.rootObjects.length === 3 && !cadDocument.objects[thirdCopy] && close(world(secondCopy).points![0][0], 600), "One Undo removes only the last placement and retains earlier copies");
    await key("z", { ctrlKey: true, shiftKey: true });
    check(state() === navState, "Redo restores all copied object identities and the complete document");
    document.querySelector<HTMLElement>(`[data-model-object-id="${thirdCopy}"]`)!.click(); await pause();

    await key("m"); await point("0,0"); await type("40"); await key("Escape");
    check(status()?.dataset.pointStage === "target" && state() === navState, "M starts a base/target Move and Esc clears its input while preserving the base");
    await key("Escape"); check(status()?.dataset.pointStage === "base", "The next Esc returns to choosing the base point");
    await key("Escape"); check(!status() && state() === navState && history() === navHistory, "The final Esc exits Move without altering the document or history");
    await key("R", { shiftKey: true }); await point("400,0"); await point("90deg");
    check(close(world(thirdCopy).points![0][0], 400) && close(world(thirdCopy).points![1][0], 400) && close(world(thirdCopy).points![1][1], 100), "Shift+R rotates around the explicit centre and leaves the drawing planar");
    await key("C", { shiftKey: true }); await point("0,0"); await point("@100,0");
    check(status()?.dataset.pointMode === "copy" && cadDocument.rootObjects.length === 5, "Shift+C starts repeated point Copy without changing the Circle shortcut");
    await key("z", { ctrlKey: true });
    check(!status() && cadDocument.rootObjects.length === 4 && close(world(thirdCopy).points![1][1], 100), "Ctrl+Z during repeated Copy cancels the session and undoes exactly its last placement");

    document.querySelector<HTMLElement>(`[data-model-object-id="${thirdCopy}"]`)!.click();await pause();await key("C",{shiftKey:true});await point("0,0");
    const externalBefore=state();await dispatchCadCommand({type:"set-object-visible",objectId:original,visible:false});await waitFor(()=>!status());
    await click("Undo");
    check(state()===externalBefore&&!status(),"An external document change still cancels repeated Copy; Undo restores the document without reviving a stale session");

    document.getElementById("tools-tab-draw")!.click(); await pause();
    await click("Sketch"); await click("Rectangle"); await point("0,0"); await point("100,60"); await key("Escape"); await click("Width"); await waitFor(()=>!!document.querySelector('[data-command-stage="ready"]')); await click("Apply constraint"); await click("Height"); await waitFor(()=>!!document.querySelector('[data-command-stage="ready"]')); await click("Apply constraint");
    const sketch = () => Object.values(cadDocument.sketches!)[0], source = sketch().geometry[0], relationCount = sketch().constraints.length;
    await key("C", { shiftKey: true }); await point("0,0"); await point("@200,0"); await point("@400,0");
    check(sketch().geometry.length === 3 && sketch().constraints.length === relationCount * 3 && sketch().geometry[0].id === source.id, "Repeated sketch copies preserve each copy's internal width/height relations and source identity");
    const sketchState = state(); await click("Finish copy"); await click("Undo"); await click("Redo");
    check(state() === sketchState, "Sketch repeated Copy preserves complete geometry/constraint identities through Undo/Redo");
    output.textContent = `${lines.join("\n")}\nALL ${lines.length} CHECKS PASSED`;
  } catch (error) { output.textContent = `${lines.join("\n")}\nFAIL: ${error instanceof Error ? error.message : error}`; }
};
installBrowserChecks(button, output);
