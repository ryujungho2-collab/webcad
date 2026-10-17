import { createRoot } from "react-dom/client";
import { App } from "../src/App";
import "../src/ui/tokens.css"; import "../src/ui/workstation.css"; import "../src/ui/commands.css"; import "../src/ui/menu.css"; import "../src/ui/explorer.css"; import "../src/ui/inspector.css";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory } from "../src/state/history";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { saveDocumentToCache } from "../src/state/documentFile";
import { exactDrawingContour } from "../src/features/drawing-editing/geometry/contourEditing";
import { resetTestDocument } from "./helpers/documentHarness";
import { installBrowserChecks } from "./helpers/browserChecks";
import { click, text, waitFor, physical, choose } from "./helpers/physicalInput";
resetTestDocument();
await dispatchCadCommand({ type: "create-drawing", id: "line", name: "Line branch", drawing: "line", params: { workPlane: "XY", points: [[0, 0, 0], [40, 0, 0]] } });
await dispatchCadCommand({ type: "create-drawing", id: "arc", name: "Arc branch", drawing: "arc", params: { workPlane: "XY", center: [0, 0, 0], radius: 10, startAngle: -.2, endAngle: 1.5 * Math.PI } });
const sweep = 1.5 * Math.PI + .2;
await dispatchCadCommand({ type: "create-drawing", id: "mixed", name: "Mixed free arc", drawing: "polyline", params: { workPlane: "XY", points: [[10 * Math.cos(.2), -10 * Math.sin(.2), 0], [0, -10, 0], [-10, -10, 0]], bulges: [Math.tan(sweep / 4), 0], closed: false } });
saveDocumentToCache(); createRoot(document.getElementById("root")!).render(<App />);
const button = document.getElementById("run-chamfer") as HTMLButtonElement, output = document.getElementById("chamfer-result")!;
const feature = (id: string) => Object.values(cadDocument.features).find(f => f.output === id)!;
const path = (id: string) => exactDrawingContour(cadDocument.objects[id], feature(id));
const state = () => { const { revision: _, ...data } = cadDocument; return JSON.stringify(data); };
const editor = () => document.querySelector('form[aria-label="Curve workflow"]');
const submit = () => editor()?.querySelector<HTMLButtonElement>('button[type="submit"]');
const ready = () => waitFor(() => !!submit() && !submit()!.disabled).catch(e=>{throw new Error(`${e.message}\nEDITOR: ${editor()?.textContent}`);});
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
async function select(ids: string[]) {
  for (const [i, id] of ids.entries()) { const row = document.querySelector(`[data-model-object-id="${id}"] .tree-label`); if (!row) throw new Error(`Missing row ${id}`); await physical(row, i ? 2 : 0); }
}
button.onclick = async () => {
  button.disabled = true; const checks: string[] = [], check = (v: unknown, label: string) => { if (!v) throw new Error(label); checks.push(`PASS: ${label}`); output.textContent = checks.join("\n"); };
  try {
    await waitFor(() => !!document.querySelector("#root canvas")); await click("2D"); await physical(document.getElementById("tools-tab-modify")!);
    for (const id of ["arc", "mixed"]) {
      await select(["line", id]); await click("Curve workflow"); await click("Chamfer"); await text("Workflow distance", ".2cm"); await text("Workflow second distance", "3mm"); await ready();
      const before = state(), h = cadHistory.getPastLabels().length, original = structuredClone(feature(id).params);
      check(state() === before && cadHistory.getPastLabels().length === h, `${id} Chamfer review is detached`);
      check(document.querySelectorAll('[data-chamfer-distance]').length === 2 && document.querySelector('[data-arc-setback="true"]'), `${id} displays a straight D1 and a curved arc-length D2 guide`);
      check(editor()?.textContent?.includes("Corner solution") && document.querySelector('[data-chamfer-setbacks]')?.textContent?.includes("arc length"), `${id} offers exact corner contacts and explains arc-length setbacks`);
      await click("Swap D1 / D2"); await ready(); check((document.querySelector('[aria-label="Workflow distance"]') as HTMLInputElement).value === "3mm", `${id} swaps the assigned D1/D2 values`);
      await click("Swap D1 / D2"); await ready(); await text("Workflow second distance", "100mm"); await waitFor(() => !!submit()?.disabled);
      check(state() === before, `${id} consumed arc branch blocks Apply without mutation`);
      await text("Workflow second distance", "bad"); await waitFor(() => !!submit()?.disabled); check(state() === before, `${id} invalid input keeps the document and draft recoverable`);
      await text("Workflow second distance", "3mm"); await ready(); await click("Apply workflow edit"); await waitFor(() => !!editor()?.textContent?.includes("Chamfer applied"));
      const connectorId = cadDocument.rootObjects.find(id => id.startsWith("chamfer-"))!, edge = path(connectorId).segments[0];
      check(near(edge.start[0], 12) && near(edge.start[1], 0) && near(edge.end[0], 10 * Math.cos(.3)) && near(edge.end[1], 10 * Math.sin(.3)), `${id} creates independently calculated line/arc contacts`);
      check(cadHistory.getPastLabels().length === h + 1 && editor()?.textContent?.includes("Join result"), `${id} applies both trims and connector as one history item and offers Join`);
      check(JSON.stringify(feature(id).params.topology) === JSON.stringify(original.topology), `${id} preserves source topology IDs`);
      if (id === "mixed") check(JSON.stringify((feature(id).params.points as number[][]).slice(1)) === JSON.stringify((original.points as number[][]).slice(1)), "Mixed arc keeps its shared vertex and neighboring line unchanged");
      const after = state(); await click("Finish workflow"); await click("Undo"); check(state() === before, `${id} Undo restores the whole source state`); await click("Redo"); check(state() === after, `${id} Redo restores the reviewed exact geometry`); await click("Undo");
    }
    await select(["line", "mixed"]); await click("Curve workflow"); await click("Chamfer"); await text("Workflow distance", "2mm"); await text("Workflow second distance", "3mm"); await ready();
    const cancelBefore = state(); await click("Cancel workflow"); check(state() === cancelBefore, "Cancel discards a mixed end review without changes");
    // A second physical workflow chooses between two bounded intersections.
    await dispatchCadCommand({ type: "edit-drawing-control", objectId: "line", controlId: (feature("line").params.topology as { controls: { id: string }[] }).controls[0].id, point: [-20, 0, 0] });
    await select(["line", "arc"]); await click("Curve workflow"); await click("Chamfer"); await text("Workflow distance", "1mm"); await text("Workflow second distance", "1mm");
    // The default arc pick lies between both crossings and can retain either side.
    await waitFor(() => (document.querySelector('[aria-label="Fillet solution"]') as HTMLSelectElement)?.options.length > 2);
    check(!!submit()?.disabled, "Multiple bounded Chamfer corners require explicit solution selection");
    const multiBefore = state(); await choose("Fillet solution", 1); await ready(); check(state() === multiBefore, "Choosing a corner only rebuilds its detached contact preview");
    await click("Apply workflow edit"); await waitFor(() => !!editor()?.textContent?.includes("Chamfer applied")); check(cadDocument.rootObjects.some(id => id.startsWith("chamfer-")), "Selected bounded corner publishes one exact connector");
    await click("Finish workflow"); await click("Undo"); check(state() === multiBefore, "Selected corner Undo restores both original finite curves");
    output.textContent = checks.join("\n") + `\nALL ${checks.length} CHECKS PASSED`;
  } catch (error) { output.textContent = checks.join("\n") + `\nFAIL: ${error instanceof Error ? error.stack : String(error)}`; }
}; installBrowserChecks(button, output);
