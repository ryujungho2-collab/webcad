import { createRoot } from "react-dom/client";
import { App } from "../src/App";
import "../src/ui/tokens.css"; import "../src/ui/workstation.css"; import "../src/ui/commands.css"; import "../src/ui/menu.css"; import "../src/ui/explorer.css"; import "../src/ui/inspector.css";
import { cadDocument } from "../src/state/cadDocument"; import { cadHistory } from "../src/state/history"; import { dispatchCadCommand } from "../src/state/dispatchCadCommand"; import { saveDocumentToCache } from "../src/state/documentFile"; import { isDocumentCommandPending } from "../src/state/documentCommandQueue"; import { resetTestDocument } from "./helpers/documentHarness"; import { installBrowserChecks } from "./helpers/browserChecks";
import { exactDrawingContour, contourLength } from "../src/features/drawing-editing/geometry/contourEditing";
import { serializeDocument, deserializeDocument } from "@agent-webcad/cad-document";
resetTestDocument();
for (const command of [
  { type: "create-drawing", id: "d", drawing: "polyline", name: "D outline", params: { workPlane: "XY", points: [[0, -10, 0], [0, 10, 0], [-20, 10, 0], [-20, -10, 0]], closed: true, bulges: [1, 0, 0, 0] } },
  { type: "create-drawing", id: "a", drawing: "line", name: "Corner A", params: { workPlane: "XY", points: [[40, 0, 0], [60, 0, 0]] } },
  { type: "create-drawing", id: "b", drawing: "line", name: "Corner B", params: { workPlane: "XY", points: [[40, 0, 0], [40, 20, 0]] } },
  { type: "create-drawing", id: "mixed", drawing: "polyline", name: "Curved open path", params: { workPlane: "XY", points: [[90, -10, 0], [90, 0, 0], [80, 10, 0]], bulges: [0, Math.tan(Math.PI / 8)] } },
  { type: "create-drawing", id: "boundary", drawing: "line", name: "Boundary", params: { workPlane: "XY", points: [[85, 0, 0], [85, 20, 0]] } },
] as const) { const result = await dispatchCadCommand(command); if (!result.ok) throw new Error(result.reason); }
saveDocumentToCache(); createRoot(document.getElementById("root")!).render(<App />);
const button = document.getElementById("run-curves") as HTMLButtonElement, output = document.getElementById("curves-result")!;
const editor = () => document.querySelector<HTMLFormElement>('form[aria-label="Curve workflow"]'), canvas = () => document.querySelector<HTMLCanvasElement>("#root canvas")!;
const feature = (id: string) => Object.values(cadDocument.features).find(f => f.output === id)!, path = (id: string) => exactDrawingContour(cadDocument.objects[id], feature(id));
const pause = () => new Promise<void>(r => setTimeout(r, 30)), state = () => { const { revision: _, ...d } = cadDocument; return JSON.stringify(d); }, history = () => cadHistory.getPastLabels().length, near = (a: number, b: number) => Math.abs(a - b) < 1e-5;
const find = (name: string) => Array.from(document.querySelectorAll<HTMLButtonElement>("#root button")).find(b => (b.getAttribute("aria-label") ?? b.textContent?.trim()) === name);
const wfButton = (name: string) => Array.from(editor()?.querySelectorAll<HTMLButtonElement>("button") ?? []).find(b => b.textContent?.trim() === name)!;
async function waitFor(check: () => boolean) { const deadline = Date.now() + 12000; while (!check()) { if (Date.now() > deadline) throw new Error("UI timeout: " + editor()?.textContent); await pause(); } await pause(); }
async function input(action: Record<string, unknown>) { const run = new URLSearchParams(location.search).get("run"), r = await fetch(`/__browser_input?run=${run}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) }); if (!r.ok) throw new Error(await r.text()); return r; }
const mouse = (type: string, x: number, y: number, modifiers = 0) => input({ type, x, y, modifiers, button: "left", buttons: type === "mouseReleased" ? 0 : 1 });
async function physical(element: Element, modifiers = 0) { if (!element) throw new Error("Missing element"); element.scrollIntoView({ block: "nearest" }); await pause(); const r = element.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2; if (!element.contains(document.elementFromPoint(x, y))) throw new Error("Obscured: " + element.outerHTML.slice(0, 200)); await mouse("mousePressed", x, y, modifiers); await mouse("mouseReleased", x, y, modifiers); await pause(); }
async function click(name: string, workflow = false) { const b = workflow ? wfButton(name) : find(name); if (!b || b.disabled) throw new Error("Missing or disabled " + name); await physical(b); await waitFor(() => !isDocumentCommandPending()); }
async function key(key: string, modifiers = 0) { await input({ type: "key", key, modifiers }); await pause(); }
async function field(value: string) { await waitFor(() => !!editor()?.querySelector('[aria-label="Workflow distance"]')); await physical(editor()!.querySelector('[aria-label="Workflow distance"]')!); await key("a", 2); await input({ type: "text", text: value }); await pause(); }
async function selectObjects(...ids: string[]) { for (let i = 0; i < ids.length; i++) await physical(document.querySelector(`[data-model-object-id="${ids[i]}"] .tree-label`)!, i ? 2 : 0); }
async function choose(label: string, id: string) { const el = editor()!.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!; const index = Array.from(el.options).findIndex(o => o.value === id); if (index < 0) throw new Error("Missing target option " + id); await physical(el); await key("Home"); for (let i = 0; i < index; i++) await key("ArrowDown"); await key("Enter"); await pause(); }
const ready = () => waitFor(() => !!editor() && !!wfButton("Apply workflow edit") && !wfButton("Apply workflow edit").disabled);
async function pickScreen(p: number[]) { const rect = canvas().getBoundingClientRect(), x = rect.left + p[0], y = rect.top + p[1]; if (document.elementFromPoint(x, y) !== canvas()) throw new Error("Canvas pick hidden by panel"); await mouse("mousePressed", x, y); await mouse("mouseReleased", x, y); await pause(); }
const screenLine = (index: number) => Array.from(document.querySelectorAll<SVGPolylineElement>('[data-curve-workflow-preview] polyline[stroke="#e7b369"]'))[index].getAttribute("points")!.split(" ").map(s => s.split(",").map(Number));
async function screenshot(name: string) { if (!new URLSearchParams(location.search).has("artifacts")) return; document.querySelector<HTMLElement>("body>aside")!.style.visibility = "hidden"; const r = await (await input({ type: "screenshot" })).json(); document.querySelector<HTMLElement>("body>aside")!.style.visibility = ""; ((globalThis as typeof globalThis & { cadTestArtifacts?: Record<string, string> }).cadTestArtifacts ??= {})[name] = r.data; }
button.onclick = async () => {
  button.disabled = true; const lines: string[] = [], check = (ok: unknown, label: string) => { if (!ok) throw new Error(label); lines.push(`PASS: ${label}`); };
  try {
    await waitFor(() => !!canvas()); await click("2D"); await selectObjects("d"); await physical(document.getElementById("tools-tab-modify")!); await click("Curve workflow"); await field("2mm"); await ready();
    const initial = state(), initialH = history(); await click("Fit workflow preview", true);
    check(document.querySelectorAll('[data-curve-workflow-preview] polyline').length === 1 && state() === initial && history() === initialH, "Curved Offset previews an exact result without mutating the document");
    await screenshot("cad-curve-offset.png"); await key("Escape"); await waitFor(() => !editor());
    check(state() === initial && history() === initialH && document.activeElement === canvas(), "Escape cancels workflow and restores canvas focus");
    await click("Curve workflow"); await field("2mm"); await ready(); await click("Apply workflow edit", true); await waitFor(() => !!wfButton("Offset result"));
    const dOffset = cadDocument.rootObjects.find(id => id.startsWith("offset-"))!, offsetState = state();
    check(near(path(dOffset).segments[0].radius!, 8) && history() === initialH + 1, "Apply preserves curved offset radius and creates one Undo");
    check(editor() && !wfButton("Apply workflow edit") && wfButton("Extrude result"), "Result remains selected in a persistent workflow with context-aware Extrude");
    canvas().focus(); await key("Enter"); check(state() === offsetState && history() === initialH + 1, "Enter on an applied result cannot duplicate the operation");
    await click("Offset result", true); await ready();
    check(editor()!.querySelector<HTMLSelectElement>('[aria-label="Workflow target"]')!.value === dOffset && editor()!.querySelector<HTMLInputElement>('[aria-label="Workflow distance"]')!.value === "2mm", "Next Offset uses the result and retains precision input");
    await field("50mm"); await waitFor(() => wfButton("Apply workflow edit").disabled && !editor()!.textContent!.includes("Preparing exact")); check(state() === offsetState && history() === initialH + 1, "Invalid collapsed offset cannot change sources or history"); await click("Cancel workflow", true);
    await selectObjects("a", "b"); await click("Curve workflow"); await click("Fillet", true); await field(".3cm"); await ready();
    const beforeCorner = state(), cornerH = history(), topology = JSON.stringify([feature("a").params.topology, feature("b").params.topology]);
    await click("Fit workflow preview", true); await pause(); const a = screenLine(0), b = screenLine(1);
    await click("Pick target branch", true); await pickScreen(a[0].map((v, i) => v + .6 * (a[1][i] - v))); await ready();
    await click("Pick second branch", true); await pickScreen(b[0].map((v, i) => v + .6 * (b[1][i] - v))); await ready();
    check(state() === beforeCorner && history() === cornerH && document.querySelectorAll('[data-curve-workflow-preview] circle').length === 2, "Trusted canvas picks choose retained branches without committing geometry");
    check(document.querySelectorAll('[data-curve-workflow-preview] polyline').length === 5, "Both edited sources and the connecting arc share one before/after canvas preview"); await screenshot("cad-curve-fillet.png");
    canvas().focus(); await key("Enter"); await waitFor(() => !!wfButton("Join result"));
    const connector = cadDocument.rootObjects.find(id => id.startsWith("fillet-"))!;
    check(near(path(connector).segments[0].radius!, 3) && history() === cornerH + 1 && topology === JSON.stringify([feature("a").params.topology, feature("b").params.topology]), "Fillet applies both sources and exact arc in one Undo, keeping topology references");
    await click("Join result", true); await ready(); await click("Apply workflow edit", true); await waitFor(() => !!wfButton("Offset result"));
    const joined = cadDocument.rootObjects.find(id => feature(id).params.kind === "polyline" && !["d", "mixed", dOffset].includes(id))!;
    check(!cadDocument.objects.a && !cadDocument.objects.b && !cadDocument.objects[connector] && near(contourLength(path(joined)), 34 + 1.5 * Math.PI), "Join result consumes the selected three-part fillet chain without reselection");
    await click("Offset result", true); await field("1mm"); await ready(); await click("Apply workflow edit", true); await waitFor(() => !!wfButton("Pattern result"));
    const lastOffset = cadDocument.rootObjects.filter(id => id.startsWith("offset-")).at(-1)!;
    check(path(lastOffset).segments.some(s => s.kind === "arc" && near(s.radius!, 4)), "Joined Fillet arcs continue through exact curved Offset");
    await click("Pattern result", true); await waitFor(() => !!document.querySelector('[aria-label="Pattern editor"]'));
    await waitFor(() => !!find("Apply pattern") && !find("Apply pattern")!.disabled);
    await click("Apply pattern"); await waitFor(() => !document.querySelector('[aria-label="Pattern editor"]'));
    const instances = Object.values(cadDocument.features).filter(f => f.pattern);
    check(!editor() && instances.length === 2 && instances.every(f => f.pattern!.sourceId === lastOffset && f.pattern!.sourceObjectIds.length === 1), "Workflow hands the exact selected result to Pattern and creates its two live instances without reselection");
    await click("Undo"); await click("Undo"); check(!cadDocument.objects[lastOffset] && cadDocument.objects[joined] && !Object.values(cadDocument.features).some(f => f.pattern), "Undo reverses Pattern and the last curve stage separately"); await click("Redo"); check(!!cadDocument.objects[lastOffset], "Redo restores the same orchestrated result identity");
    check(JSON.stringify(deserializeDocument(serializeDocument(cadDocument))) === JSON.stringify(cadDocument), "All analytic results and references survive document reopening");
    await selectObjects("mixed", "boundary"); await click("Curve workflow"); await click("Trim", true);
    check(wfButton("Apply workflow edit").disabled, "Trim requires a picked portion before applying");
    await choose("Workflow target", "mixed"); await choose("Workflow second curve", "boundary");
    await click("Fit workflow preview", true); await click("Pick target branch", true); await key("Escape"); check(editor() && wfButton("Pick target branch").getAttribute("aria-pressed") === "false", "Escape exits branch picking while retaining the workflow");
    const poly = screenLine(0), start = poly[0], joint = poly[1], scale = (joint[1] - start[1]) / 10;
    const target = [joint[0] + (10 * Math.cos(5 * Math.PI / 12) - 10) * -scale, joint[1] + 10 * Math.sin(5 * Math.PI / 12) * scale];
    const beforeTrim = state(), trimH = history();
    await click("Pick target branch", true); await pickScreen(target); await ready();
    check(state() === beforeTrim && history() === trimH, "Curved Trim projects a trusted pixel pick onto the analytic arc and reviews before committing");
    await click("Apply workflow edit", true); await waitFor(() => !!wfButton("Extend result"));
    check(near(path("mixed").segments[1].radius!, 10) && near(path("mixed").segments[1].sweep!, Math.PI / 3) && history() === trimH + 1, "Workflow Trim preserves the arc center/radius and commits one Undo");
    await click("Finish workflow", true);
    output.textContent = [...lines, `ALL ${lines.length} CHECKS PASSED`].join("\n");
  } catch (e) { await screenshot("cad-curve-fillet.png"); output.textContent = [...lines, `FAIL: ${e instanceof Error ? e.stack : String(e)}`].join("\n"); }
};
installBrowserChecks(button, output);
