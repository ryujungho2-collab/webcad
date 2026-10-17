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
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { saveDocumentToCache } from "../src/state/documentFile";
import { isDocumentCommandPending } from "../src/state/documentCommandQueue";
import { documentVersion } from "../src/state/documentSession";
import { contourLength, exactDrawingContour } from "../src/features/drawing-editing/geometry/contourEditing";
import { measureDocumentObject } from "../src/state/documentQuery";
import type { DrawingTopology } from "../src/precision/drawingTopology";
import { serializeDocument, deserializeDocument } from "@agent-webcad/cad-document";
import { resetTestDocument } from "./helpers/documentHarness";
import { installBrowserChecks } from "./helpers/browserChecks";
resetTestDocument();
await dispatchCadCommand({ type: "create-drawing", id: "profile", drawing: "rectangle", params: { workPlane: "XY", points: [[0, 0, 0], [100, 0, 0], [100, 60, 0], [0, 60, 0]] } });
await dispatchCadCommand({ type: "create-extrude", id: "solid", profileObjectIds: ["profile"], distance: 8 });
await dispatchCadCommand({ type: "create-drawing", id: "line", drawing: "line", params: { workPlane: "XY", points: [[0, 90, 0], [100, 90, 0]] } });
await dispatchCadCommand({ type: "create-drawing", id: "arc", drawing: "arc", params: { workPlane: "XY", center: [160, 90, 0], radius: 20, startAngle: 0, endAngle: Math.PI / 2 } });
await dispatchCadCommand({ type: "create-dimension", id: "dimension", dimension: "linear", params: { workPlane: "XY", points: [[0, 90], [100, 90]], sourceObjectId: "line", offset: 10 } });
saveDocumentToCache(); createRoot(document.getElementById("root")!).render(<App />);
const output = document.getElementById("basic-edits-result")!, button = document.getElementById("run-basic-edits") as HTMLButtonElement;
const pause = () => new Promise<void>(r => setTimeout(r, 35));
const editor = () => document.querySelector<HTMLFormElement>('[aria-label="Basic drawing editor"]'), canvas = () => document.querySelector<HTMLCanvasElement>("#root canvas")!;
const feature = (id: string) => Object.values(cadDocument.features).find(f => f.output === id)!, path = (id: string) => exactDrawingContour(cadDocument.objects[id], feature(id));
const top = (id: string) => feature(id).params.topology as DrawingTopology;
const state = () => { const { revision: _, ...d } = cadDocument; return JSON.stringify(d); }, past = () => cadHistory.getPastLabels().length, near = (a: number, b: number) => Math.abs(a - b) < 1e-5;
const find = (name: string) => Array.from(document.querySelectorAll<HTMLButtonElement>("#root button")).find(b => (b.getAttribute("aria-label") ?? b.textContent?.trim()) === name);
async function waitFor(test: () => boolean) { const deadline = Date.now() + 12000; while (!test()) { if (Date.now() > deadline) throw new Error("UI timeout: " + editor()?.textContent); await pause(); } await pause(); }
async function input(action: Record<string, unknown>) { const run = new URLSearchParams(location.search).get("run"), r = await fetch(`/__browser_input?run=${run}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) }); if (!r.ok) throw new Error(await r.text()); return r; }
async function physical(element: HTMLElement) { const r = element.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2; if (!element.contains(document.elementFromPoint(x, y))) throw new Error("Obscured control: " + element.outerHTML); await input({ type: "mousePressed", x, y, button: "left", buttons: 1 }); await input({ type: "mouseReleased", x, y, button: "left", buttons: 0 }); await pause(); }
async function click(name: string) { const b = find(name); if (!b || b.disabled) throw new Error("Missing or disabled " + name); await physical(b); await waitFor(() => !isDocumentCommandPending()); }
async function key(key: string, modifiers = 0) { await input({ type: "key", key, modifiers }); await pause(); await waitFor(() => !isDocumentCommandPending()); }
async function field(label: string, value: string) { const el = editor()?.querySelector<HTMLInputElement>(`[aria-label="${label}"]`); if (!el) throw new Error("Missing field " + label); await physical(el); await key("a", 2); await input({ type: "text", text: value }); await pause(); }
async function choose(label: string, index: number) { const el = editor()?.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`); if (!el) throw new Error("Missing selector " + label); await physical(el); await key("Home"); for (let i = 0; i < index; i++) await key("ArrowDown"); await key("Enter"); }
async function select(id: string) { const row = document.querySelector<HTMLElement>(`[data-model-object-id="${id}"] .tree-label`); if (!row) throw new Error("Missing row " + id); await physical(row); }
async function ready() {
  await waitFor(() => Boolean(editor() && find("Apply drawing edit") && !find("Apply drawing edit")?.disabled));
  const after = document.querySelector<SVGPolylineElement>('[data-basic-edit-preview-count] polyline[stroke="#61dcac"][fill="none"]');
  if (!after?.getAttribute("points")?.trim()) throw new Error("Apply became available before the reviewed result was visible on the canvas.");
}
const overlay = () => document.querySelector<SVGSVGElement>('[aria-label="Basic drawing edit preview"]')!;
async function pointer(x: number, y: number, down = false, up = false) { await input({ type: down ? "mousePressed" : up ? "mouseReleased" : "mouseMoved", x, y, button: "left", buttons: up ? 0 : 1 }); await pause(); }
button.onclick = async () => {
  const lines: string[] = []; const check = (value: unknown, message: string) => { if (!value) throw new Error(message); lines.push("PASS: " + message); };
  try {
    await waitFor(() => Boolean(canvas())); await click("2D"); await select("line"); document.getElementById("tools-tab-modify")!.click(); await pause();
    check(!find("Lengthen")?.disabled && !find("Stretch")?.disabled && find("Edit polyline")?.disabled, "Basic edit commands reflect the selected drawing type");
    const initial = state(), initialPast = past(); await click("Lengthen"); await field("Lengthen value", "12cm"); await ready();
    check(state() === initial && past() === initialPast && document.querySelector('[data-basic-edit-preview-count="1"]'), "Lengthen unit input previews geometry and the live dimension without a document mutation");
    await key("Escape"); await waitFor(() => !editor()); check(state() === initial && document.activeElement === canvas(), "Escape cancels precisely and returns keyboard focus to the canvas");
    await click("Lengthen"); await field("Lengthen value", "12cm"); await ready(); canvas().focus(); await key("Enter"); await waitFor(() => !editor());
    check(near(contourLength(path("line")), 120) && JSON.stringify(feature("dimension").params.points) === JSON.stringify([[0, 90], [120, 90]]), "Canvas Enter lengthens to exactly 120 mm and updates its associated dimension");
    check(past() === initialPast + 1, "Lengthen and dependent updates produce one Undo"); const lengthened = state(); await click("Undo"); check(state() === initial, "Undo restores the source and its dimension together"); await click("Redo"); check(state() === lengthened, "Redo retains the reviewed source and dimension IDs");
    await select("line"); await click("Lengthen"); await click("Fit edit preview"); await pause();
    const svg = overlay(), rect = svg.getBoundingClientRect(), start = svg.querySelector<SVGCircleElement>('[data-basic-edit-handle="0"]')!, end = svg.querySelector<SVGCircleElement>('[data-basic-edit-handle="1"]')!, x = rect.left + end.cx.baseVal.value, y = rect.top + end.cy.baseVal.value, extra = (end.cx.baseVal.value - start.cx.baseVal.value) * .25;
    await pointer(x, y, true); await pointer(x + extra, y); await pointer(x + extra, y, false, true); await ready();
    const draggedLength = Number(editor()?.querySelector<HTMLInputElement>('[aria-label="Lengthen value"]')?.value);
    check(Math.abs(draggedLength - 150) <= 120 / Math.abs(end.cx.baseVal.value - start.cx.baseVal.value), "Physical endpoint drag follows the projected pointer within one screen pixel");
    await field("Lengthen value", "150mm"); await ready();
    await click("Apply drawing edit"); await waitFor(() => !editor()); check(near(contourLength(path("line")), 150), "Exact input after dragging keeps the fixed endpoint and follows the preview");
    await select("arc"); const arcBefore = state(), arcPast = past(); await click("Lengthen"); await choose("Lengthen method", 3); await field("Lengthen value", "180deg"); await ready();
    check(editor()?.querySelector('[aria-label="Arc angle and target length"]')?.textContent?.includes("62.8319 mm") && state() === arcBefore && past() === arcPast, "Arc angle input previews the equivalent exact target length without changing CAD");
    await field("Lengthen value", "360deg"); await waitFor(() => Boolean(editor()?.textContent?.includes("full circle")));
    check(find("Apply drawing edit")?.disabled && state() === arcBefore && past() === arcPast, "A full-turn arc is rejected before Apply without changing history");
    await field("Lengthen value", "3.141592653589793rad"); await ready(); await click("Apply drawing edit"); await waitFor(() => !editor());
    check(near(path("arc").segments[0].sweep!, Math.PI) && near((await measureDocumentObject(cadDocument, "arc")).length!, 20 * Math.PI), "Radians input preserves radius and produces the independently measured arc length");
    const arcAfter = state(); await click("Undo"); check(state() === arcBefore, "Angle Lengthen Undo restores the original arc"); await click("Redo"); check(state() === arcAfter, "Angle Lengthen Redo restores the reviewed arc");
    await select("arc"); await click("Lengthen"); await field("Lengthen value", String(10 * Math.PI) + "mm"); await ready();
    check(editor()?.querySelector('[aria-label="Arc angle and target length"]')?.textContent?.includes("90.0000°"), "Target length input reports the corresponding included angle");
    await click("Apply drawing edit"); await waitFor(() => !editor()); check(near((await measureDocumentObject(cadDocument, "arc")).length!, 10 * Math.PI), "Length input and angle input share one analytic arc geometry");
    await select("profile"); await click("Edit polyline"); const originalControls = top("profile").controls.map(c => c.id); await field("Inserted vertex", "5cm,0"); await ready(); await click("Apply drawing edit"); await waitFor(() => !editor());
    check(top("profile").controls.length === 5 && near((await measureDocumentObject(cadDocument, "solid")).volume!, 48000), "Insert vertex retains the exact live solid profile without changing volume");
    await click("Edit polyline"); await choose("Polyline operation", 1); await choose("Polyline reference", 1); await ready(); await click("Apply drawing edit"); await waitFor(() => !editor());
    check(JSON.stringify(top("profile").controls.map(c => c.id)) === JSON.stringify(originalControls), "Delete vertex restores the surviving reference identities");
    const closedState = state(); await click("Edit polyline"); await choose("Polyline operation", 2); await waitFor(() => /not connected|closed loop/.test(editor()?.textContent ?? ""));
    check(find("Apply drawing edit")?.disabled && state() === closedState, "Opening a live extrusion profile explains rejection and preserves all linked objects"); await click("Cancel drawing edit");
    await click("Stretch"); await field("Stretch first corner", "90,-10"); await field("Stretch second corner", "110,70"); await field("Stretch displacement", "2cm,0"); await ready();
    check(state() === closedState && overlay().querySelectorAll('[data-handle-selected="true"]').length === 2, "Crossing-area preview highlights only the two affected right-side vertices");
    await click("Fit edit preview"); await pause();
    if (new URLSearchParams(location.search).get("artifacts") === "1") (globalThis as any).cadTestArtifacts = { "cad-stretch-preview.png": (await (await input({ type: "screenshot" })).json()).data };
    await click("Apply drawing edit"); await waitFor(() => !editor());
    check(near((await measureDocumentObject(cadDocument, "profile")).area!, 7200) && near((await measureDocumentObject(cadDocument, "solid")).volume!, 57600), "Stretch changes width to 120 mm and regenerates the exact 57600 mm³ solid");
    const stretched = state(); await click("Undo"); check(state() === closedState, "Stretch Undo restores the profile and regenerated solid together"); await click("Redo"); check(state() === stretched, "Stretch Redo restores the reviewed geometry");
    await select("profile"); await click("Stretch"); await click("Fit edit preview"); await field("Stretch first corner", "110,-10"); await field("Stretch second corner", "130,70"); await field("Stretch displacement", "-5,0"); await ready();
    await dispatchCadCommand({ type: "rename-object", objectId: "profile", name: "Revised profile" }); await waitFor(() => editor()?.dataset.basicEditGeneration === String(documentVersion().generation) && !find("Apply drawing edit")?.disabled);
    check(editor()?.textContent?.includes("one Undo"), "Source revisions invalidate and recalculate the in-place proposal");
    await click("Fit edit preview"); await pause();
    const areaSvg = overlay(), areaRect = areaSvg.getBoundingClientRect(), outline = areaSvg.querySelector<SVGPolylineElement>('polyline[stroke="#ffb282"]')!, a = outline.points[0], b = outline.points[1], c = outline.points[2];
    const screen = (u: number, v: number) => [areaRect.left + a.x + (b.x - a.x) * u / 120 + (c.x - b.x) * v / 60, areaRect.top + a.y + (b.y - a.y) * u / 120 + (c.y - b.y) * v / 60];
    await click("Pick crossing area"); const firstPoint = screen(110, -10), secondPoint = screen(130, 70); await pointer(firstPoint[0], firstPoint[1], true); await pointer(secondPoint[0], secondPoint[1]); await pointer(secondPoint[0], secondPoint[1], false, true);
    await waitFor(() => overlay().querySelectorAll('[data-handle-selected="true"]').length === 2);
    check(editor()?.textContent?.includes("Canvas step: base"), "Physical crossing-area drag captures only the enclosed vertices and advances to base point");
    await click("Pick base → target"); const basePoint = screen(80, 30), targetPoint = screen(90, 30); await pointer(basePoint[0], basePoint[1], true); await pointer(basePoint[0], basePoint[1], false, true); await pointer(targetPoint[0], targetPoint[1]); await pointer(targetPoint[0], targetPoint[1], true); await pointer(targetPoint[0], targetPoint[1], false, true); await ready();
    const displacement = editor()?.querySelector<HTMLInputElement>('[aria-label="Stretch displacement"]')?.value.split(",").map(Number) ?? [];
    check(Math.abs(displacement[0] - 10) < .5 && Math.abs(displacement[1]) < .5, "Canvas base → target generates the projected displacement for precise adjustment");
    await field("Stretch displacement", "10mm,0"); await ready(); await click("Apply drawing edit"); await waitFor(() => !editor());
    check(near((await measureDocumentObject(cadDocument, "profile")).area!, 7800) && near((await measureDocumentObject(cadDocument, "solid")).volume!, 62400), "Area gesture plus exact displacement applies the same reviewed live result");
    await select("line"); await click("Lengthen");
    await dispatchCadCommand({ type: "delete-object", objectId: "line" }); await waitFor(() => Boolean(editor()?.textContent?.includes("no longer exists")));
    check(find("Apply drawing edit")?.disabled && find("Fit edit preview")?.disabled, "Deleting an active source leaves a clear, cancellable editor rather than crashing the application");
    await click("Cancel drawing edit"); check(JSON.stringify(deserializeDocument(serializeDocument(cadDocument))) === JSON.stringify(cadDocument), "All edits retain exact contours, topology and live links on save/reopen");
    canvas().focus(); await key("Escape"); await click("Stretch");
    check(editor()?.textContent?.includes("2 source(s)"), "Stretch starts without prior selection and includes both finite drawings while excluding solids/annotations"); await click("Cancel drawing edit");
    await key("k", 2); await input({ type: "text", text: "Stretch" }); await pause(); check(document.querySelector('dialog[open]')?.textContent?.includes("Stretch"), "Command palette exposes the same area editing operation"); await key("Escape");
    output.textContent = `${lines.join("\n")}\nALL ${lines.length} CHECKS PASSED`;
  } catch (e) { output.textContent = `${lines.join("\n")}\nFAIL: ${e instanceof Error ? e.stack : String(e)}`; }
};
installBrowserChecks(button, output);
