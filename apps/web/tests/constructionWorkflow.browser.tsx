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
import { saveDocumentToCache, loadDocumentFromCache } from "../src/state/documentFile";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { isDocumentCommandPending } from "../src/state/documentCommandQueue";
import { queryCadDocument } from "../src/state/documentQuery";
import { resetTestDocument } from "./helpers/documentHarness";
import { installBrowserChecks } from "./helpers/browserChecks";

resetTestDocument();
for (const [id, x] of [["A", 0], ["B", 100]] as const) await dispatchCadCommand({ type: "create-drawing", id, name: id, drawing: "point", params: { points: [[x, 0, 0]], workPlane: "XY", construction: true } });
await dispatchCadCommand({ type: "create-drawing", id: "O", name: "O", drawing: "circle", params: { center: [50, 0, 0], radius: 80, workPlane: "XY", construction: true } });
saveDocumentToCache(); let root = createRoot(document.getElementById("root")!); root.render(<App />);
const button = document.getElementById("run-construction") as HTMLButtonElement, output = document.getElementById("construction-result")!;
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 25));
const state = () => { const { revision: _, ...value } = cadDocument; return JSON.stringify(value); };
const history = () => cadHistory.getPastLabels().length;
const feature = (id: string) => Object.values(cadDocument.features).find(f => f.output === id)!;
const point = (id: string) => (feature(id).params.points as number[][])[0];
const tool = () => document.querySelector<HTMLElement>('[aria-label="Construction editor"]');
const review = () => document.querySelector<HTMLElement>('[data-testid="direct-edit-review"]');
const find = (name: string) => Array.from(document.querySelectorAll<HTMLButtonElement>("#root button")).find(b => (b.getAttribute("aria-label") ?? b.textContent?.trim()) === name);
async function waitFor(check: () => boolean) { const deadline = Date.now() + 12000; while (!check()) { if (Date.now() > deadline) throw new Error("UI condition timed out: " + (tool()?.textContent ?? review()?.textContent)); await pause(); } await pause(); }
async function input(action: Record<string, unknown>) { const run = new URLSearchParams(location.search).get("run"), response = await fetch(`/__browser_input?run=${run}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) }); if (!response.ok) throw new Error(await response.text()); return response; }
const mouse = (type: string, x: number, y: number) => input({ type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1 });
async function physical(element: Element) { element.scrollIntoView({ block: "nearest" }); await pause(); const r = element.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2; if (!element.contains(document.elementFromPoint(x, y))) throw new Error("Control obscured: " + element.outerHTML.slice(0, 200)); await mouse("mousePressed", x, y); await mouse("mouseReleased", x, y); await pause(); }
async function click(name: string) { const target = find(name); if (!target || target.disabled) throw new Error(`Missing or disabled ${name}`); target.click(); await pause(); await waitFor(() => !isDocumentCommandPending()); }
async function key(key: string, modifiers = 0) { await input({ type: "key", key, modifiers }); await pause(); }
async function field(label: string, value: string) { const target = document.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!; await physical(target); await key("a", 2); await input({ type: "text", text: value }); await pause(); }
async function select(label: string, value: string) { const target = document.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!; const index = Array.from(target.options).findIndex(o => o.value === value); if (index < 0) throw new Error(`Missing option ${label} = ${value}`); await physical(target); await key("Home"); for (let i = 0; i < index; i++) await key("ArrowDown"); await key("Enter"); await waitFor(() => target.value === value); }
async function ready() { await waitFor(() => tool()?.dataset.constructionStatus === "ready"); }
async function create(operation: string, name: string, sources?: [string, string?], coordinates?: [string, string?]) {
  await click("Construction"); await waitFor(() => Boolean(tool()));
  await select("Construction operation", operation); await field("Construction name", name);
  if (sources) { await select("First construction source", sources[0]); if (sources[1]) await select("Second construction source", sources[1]); }
  if (coordinates) { await field("First construction coordinate", coordinates[0]); if (coordinates[1]) await field("Second construction coordinate", coordinates[1]); }
  await ready(); return () => apply(name);
}
async function apply(name: string) { await physical(find("Apply construction")!); await waitFor(() => !tool() && !isDocumentCommandPending()); return Object.values(cadDocument.objects).find(o => o.name === name)!.id; }
async function handle(id: string) { const control = (feature(id).params.topology as { controls: { id: string }[] }).controls[0].id; await waitFor(() => Boolean(document.querySelector(`[data-direct-handle="${control}"]`))); const r = document.querySelector(`[data-direct-handle="${control}"]`)!.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2] as [number, number]; }
async function screenshot(name: string) { if (!new URLSearchParams(location.search).has("artifacts")) return; document.querySelector<HTMLElement>("body>aside")!.style.visibility = "hidden"; const result = await (await input({ type: "screenshot" })).json(); document.querySelector<HTMLElement>("body>aside")!.style.visibility = ""; ((globalThis as typeof globalThis & { cadTestArtifacts?: Record<string, string> }).cadTestArtifacts ??= {})[name] = result.data; }
const near = (a: number, b: number) => Math.abs(a - b) < 1e-5;

button.onclick = async () => {
  button.disabled = true; const lines: string[] = [], check = (ok: unknown, label: string) => { if (!ok) throw new Error(label); lines.push(`PASS: ${label}`); output.textContent = lines.join("\n"); };
  try {
    await waitFor(() => Boolean(document.querySelector("#root canvas"))); await click("2D"); await click("Fit all geometry"); await new Promise(r => setTimeout(r, 300));
    const original = state(), initialHistory = history();
    const finishC = await create("point", "C", undefined, ["2.5cm,30mm"]);
    check(state() === original && history() === initialHistory && document.querySelector('[data-construction-result-point]'), "Independent point preview accepts units without changing document or history");
    const C = await finishC(); check(near(point(C)[0], 25) && near(point(C)[1], 30) && feature(C).params.kind === "point", "Apply creates an exact independent point and editable vertex");
    const finishE = await create("infinite-line", "E", undefined, ["-70,-40", "@1,0"]); const E = await finishE();
    const finishR = await create("ray", "R", undefined, ["-70,-50", "@1,0"]); const R = await finishR();
    check(feature(E).params.kind === "infinite-line" && feature(R).params.kind === "ray" && near((feature(E).params.points as number[][])[1][0], -69), "Independent infinite line and ray keep short origin/through definitions; relative entry is exact");
    const finishAB = await create("segment", "AB", ["A", "B"]); const AB = await finishAB();
    const finishM = await create("midpoint", "M", [AB]);
    const midpointPreview = document.querySelector<SVGCircleElement>('[data-construction-result-point]')!, midpointPixels = [Number(midpointPreview.getAttribute("cx")), Number(midpointPreview.getAttribute("cy"))];
    await select("First construction source", ""); const initialCanvas = document.querySelector<HTMLCanvasElement>("#root canvas")!.getBoundingClientRect();
    await mouse("mousePressed", initialCanvas.left + midpointPixels[0], initialCanvas.top + midpointPixels[1]); await mouse("mouseReleased", initialCanvas.left + midpointPixels[0], initialCanvas.top + midpointPixels[1]); await ready();
    check(document.querySelector<HTMLSelectElement>('[aria-label="First construction source"]')!.value === AB, "Canvas picking binds the saved segment itself as the midpoint source");
    const M = await finishM();
    const finishL = await create("perpendicular-bisector", "L", [AB, M]); const L = await finishL();
    const finishP = await create("intersection", "P", [L, "O"]);
    check(tool()?.textContent?.includes("branch=positive") && tool()?.textContent?.includes("follows source edits automatically"), "Intersection preview exposes its persisted branch and automatic source relationship");
    const pointPreview = document.querySelector<SVGCircleElement>('[data-construction-result-point]')!, initialScale = (midpointPixels[1] - Number(pointPreview.getAttribute("cy"))) / 80, initialOrigin = [midpointPixels[0] - 50 * initialScale, midpointPixels[1]];
    await screenshot("cad-construction-preview.png"); const P = await finishP();
    const finishQ = await create("intersection", "Q", [L, "O"]); await select("Intersection branch", "negative"); await ready(); const Q = await finishQ();
    check(near(point(M)[0], 50) && near(point(P)[0], 50) && near(point(P)[1], 80) && near(point(Q)[1], -80), "UI builds segment → midpoint → bisector → both circle intersections with independent expected coordinates");
    check(feature(AB).inputs.join(",") === "A,B" && feature(M).inputs[0] === AB && feature(L).inputs.join(",") === `${AB},${M}` && feature(P).construction?.operation === "intersection", "The entire UI-created construction chain saves actual typed inputs, not coincident coordinates");
    const initialPick = async (x: number, y: number) => { const r = document.querySelector<HTMLCanvasElement>("#root canvas")!.getBoundingClientRect(); await mouse("mousePressed", r.left + initialOrigin[0] + x * initialScale, r.top + initialOrigin[1] - y * initialScale); await mouse("mouseReleased", r.left + initialOrigin[0] + x * initialScale, r.top + initialOrigin[1] - y * initialScale); await pause(); };
    await initialPick(-100, -40); check(document.querySelector(`[data-model-object-id="${E}"]`)?.getAttribute("aria-pressed") === "true", "Rendered infinite line remains selectable beyond its short through definition in the negative direction");
    await initialPick(-20, -50); check(document.querySelector(`[data-model-object-id="${R}"]`)?.getAttribute("aria-pressed") === "true", "Rendered ray is selectable well beyond its through point in the forward direction");
    await initialPick(-100, -50); check(document.querySelector(`[data-model-object-id="${R}"]`)?.getAttribute("aria-pressed") === "false", "A ray has no selectable extension behind its origin");
    await click("Fit all geometry"); await new Promise(r => setTimeout(r, 100)); await click("Direct");
    await physical(document.querySelector('[data-model-object-id="A"] .tree-label')!); await click("Hide Explorer"); await click("Hide Properties"); await click("Fit all geometry"); await new Promise(r => setTimeout(r, 150));
    const a = await handle("A"), scale = 3; const before = state(), past = history(), topology = JSON.stringify(Object.values(cadDocument.features).map(f => f.params.topology));
    check(document.elementFromPoint(...a) === document.querySelector("#root canvas"), "Independent point is a reachable screen-sized canvas grip");
    await mouse("mousePressed", ...a); await mouse("mouseMoved", a[0] + 20 * scale, a[1]); await mouse("mouseReleased", a[0] + 20 * scale, a[1]); await waitFor(() => Boolean(review()));
    await field("Direct target X", "20mm"); await field("Direct target Y", "0mm"); await waitFor(() => review()?.dataset.previewStatus === "ready");
    await waitFor(() => Boolean(document.querySelector(`[data-construction-edit-object="${P}"][data-construction-edit-side="after"] circle`)));
    check(state() === before && history() === past && document.querySelector(`[data-construction-impact="${M}"]`) && document.querySelector(`[data-construction-impact="${P}"]`), "Point drag shows the solved construction cascade and saved formulas before a single Apply");
    const viewport = document.querySelector('.cad-viewport')!.getBoundingClientRect(), start = a[0] - viewport.left;
    const afterM = document.querySelector<SVGCircleElement>(`[data-construction-edit-object="${M}"][data-construction-edit-side="after"] circle`)!, afterP = document.querySelector<SVGCircleElement>(`[data-construction-edit-object="${P}"][data-construction-edit-side="after"] circle`)!, afterQ = document.querySelector<SVGCircleElement>(`[data-construction-edit-object="${Q}"][data-construction-edit-side="after"] circle`)!;
    const pxScale = (Number(afterM.getAttribute("cx")) - start) / 60;
    check(Math.abs(Number(afterM.getAttribute("cx")) - Number(afterP.getAttribute("cx"))) < .1 && Math.abs((Number(afterQ.getAttribute("cy")) - Number(afterP.getAttribute("cy"))) / pxScale - 2 * Math.sqrt(6300)) < .2, "Actual green canvas markers form the expected x=60 bisector and signed circle intersections");
    await screenshot("cad-construction-cascade.png"); await physical(find("Apply direct edit")!); await waitFor(() => !review() && !isDocumentCommandPending());
    check(near(point("A")[0], 20) && near(point(M)[0], 60) && near(point(P)[1], Math.sqrt(6300)) && near(point(Q)[1], -Math.sqrt(6300)) && history() === past + 1, "One Apply edits A and automatically regenerates every construction to precise coordinates");
    check(JSON.stringify(Object.values(cadDocument.features).map(f => f.params.topology)) === topology, "Cascade retains object and topology identities instead of replacing references");
    const after = state(); await click("Undo"); check(state() === before, "Undo restores all source and derived coordinates together"); await click("Redo"); check(state() === after, "Redo reproduces the whole reviewed chain");
    await click("Hide construction"); check(state() === after && history() === past + 1 && find("Show construction"), "One global visibility switch hides construction without altering saved geometry or history");
    await mouse("mousePressed", viewport.left + start + 60 * pxScale, viewport.top + Number(afterP.getAttribute("cy"))); await mouse("mouseReleased", viewport.left + start + 60 * pxScale, viewport.top + Number(afterP.getAttribute("cy"))); await pause();
    check(document.querySelector(`[data-model-object-id="${P}"]`)?.getAttribute("aria-pressed") === "true", "Final intersection point stays visibly selectable while construction sources are hidden");
    await click("Show construction"); await click("Object"); await click("Show Explorer"); await click("Show Properties"); await physical(document.querySelector(`[data-model-object-id="${P}"] .tree-label`)!);
    const transformInputs = Array.from(document.querySelectorAll<HTMLInputElement>('.transform-axis-grid input'));
    check(transformInputs.length > 0 && transformInputs.every(input => input.disabled) && !document.querySelector<HTMLInputElement>('.property-toggle')!.disabled && !document.querySelector<HTMLButtonElement>('.inspector-object-actions .danger-button')!.disabled, "Derived point coordinates are read-only while ordinary visibility and deletion remain available");
    const dependencyButton = Array.from(document.querySelectorAll<HTMLButtonElement>("#root button.property-section-trigger")).find(b => b.querySelector('.property-section-title')?.textContent === "Dependencies")!; await physical(dependencyButton);
    const explanation = document.querySelector<HTMLElement>('[aria-label="Object dependency explanation"]')!;
    check(explanation.offsetHeight > 0 && explanation.textContent?.includes("branch=positive") && explanation.textContent?.includes("Derived coordinates follow automatically"), "Inspector explains why the intersection is there and directs editing to its sources");
    const query = await queryCadDocument([P]); check(query.objects[0].dependencies!.upstream.some(n => n.sourceId === "A") && query.objects[0].dependencies!.object!.operation.includes("branch=positive"), "Automation reads the same stored graph and branch as the canvas inspector");
    saveDocumentToCache(); root.unmount(); resetTestDocument(); check(loadDocumentFromCache() && state() === after && feature(P).construction?.operation === "intersection", "Production recovery reopens schema v4 with all identities, definitions and evaluated coordinates");
    root = createRoot(document.getElementById("root")!); root.render(<App />); await waitFor(() => Boolean(document.querySelector("#root canvas")));
    const result = await dispatchCadCommand({ type: "move-object", objectId: "A", translation: [10, 0, 0] });
    check(result.ok && near(point(M)[0], 65) && near(point(P)[1], Math.sqrt(6400 - 225)), "The reopened graph remains live when its independent source changes again");
    const valid = state(), validPast = history(); const blocked = await dispatchCadCommand({ type: "move-object", objectId: "A", translation: [300, 0, 0] });
    check(!blocked.ok && state() === valid && history() === validPast, "An edit eliminating the circle intersections rejects atomically after reopen");
    output.textContent = lines.join("\n") + `\nALL ${lines.length} CHECKS PASSED`;
  } catch (cause) { output.textContent = lines.join("\n") + `\nFAIL: ${cause instanceof Error ? cause.message : cause}`; }
};
installBrowserChecks(button, output);
