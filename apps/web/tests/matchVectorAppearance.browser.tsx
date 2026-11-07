import { createRoot } from "react-dom/client";
import type { CadCommand } from "@agent-webcad/cad-commands";
import { serializeDocument } from "@agent-webcad/cad-document";
import { App } from "../src/App";
import "../src/ui/tokens.css";
import "../src/ui/workstation.css";
import "../src/ui/commands.css";
import "../src/ui/menu.css";
import "../src/ui/explorer.css";
import "../src/ui/inspector.css";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory } from "../src/state/history";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { collectExportDrawings } from "../src/export/exportModel";
import { resetTestDocument } from "./helpers/documentHarness";
import { installBrowserChecks } from "./helpers/browserChecks";
import { click, find, input, physical, waitFor } from "./helpers/physicalInput";

resetTestDocument();
async function execute(command: CadCommand) {
  const result = await dispatchCadCommand(command);
  if (!result.ok) throw Error(result.reason);
}
await execute({ type: "create-layer", id: "blue", name: "Blue source" });
await execute({ type: "create-layer", id: "locked", name: "Locked targets" });
await execute({ type: "set-layer-style", layerId: "blue", style: { color: "#1234ab", lineType: "continuous", lineWeight: 0.8 } });
await execute({ type: "set-layer-style", layerId: "layer-default", style: { color: "#bb2222", lineType: "continuous", lineWeight: 0.5 } });
for (const [id, layerId, x] of [["source", "blue", 0], ["a", "layer-default", 20], ["b", "layer-default", 40], ["locked", "locked", 60]] as const) {
  await execute({ type: "create-drawing", id, layerId, drawing: "rectangle", params: {
    workPlane: "XY", points: [[x, 0, 0], [x + 10, 0, 0], [x + 10, 8, 0], [x, 8, 0]],
  } });
}
await execute({ type: "set-layer-locked", layerId: "locked", locked: true });
createRoot(document.getElementById("root")!).render(<App recoveryReady />);

const button = document.getElementById("run-match-vector-appearance") as HTMLButtonElement;
const result = document.getElementById("match-vector-appearance-result")!;
const source = () => document.querySelector<HTMLElement>('[data-model-object-id="source"]');
const dialog = () => document.querySelector('dialog[aria-label="Match vector appearance"][open]');
const stored = (id: string) => cadDocument.features[`feature-${id}`].params.vectorStyle;
const pick = (id: string) => physical(document.querySelector(`[aria-label="Match target ${id}"]`)!);

async function openMatch() {
  await physical(source()!);
  document.querySelector<HTMLCanvasElement>("canvas")!.focus();
  await input({ type: "key", key: "k", modifiers: 2 });
  await waitFor(() => !!document.getElementById("palette-match-vector-appearance"));
  await physical(document.getElementById("palette-match-vector-appearance")!);
  await waitFor(() => !!dialog());
}

button.onclick = async () => {
  button.style.display = "none";
  const checks: string[] = [];
  const check = (condition: unknown, label: string) => {
    if (!condition) throw Error(label);
    checks.push(`PASS: ${label}`);
  };
  try {
    await waitFor(() => !!source() && !!document.querySelector("canvas"));
    await click("2D");
    const before = serializeDocument(cadDocument);
    const history = cadHistory.getPastLabels().length;
    await openMatch();
    await pick("a");
    await click("Preview appearance match");
    await waitFor(() => !find("Apply appearance match").disabled);
    check(dialog()?.querySelector('[aria-label="Appearance changes"]')?.textContent?.includes("#bb2222 → #1234ab"), "Preview shows target stroke changing to inherited source blue");
    await click("Cancel appearance match");
    await waitFor(() => !dialog());
    check(serializeDocument(cadDocument) === before && cadHistory.getPastLabels().length === history, "Cancel leaves document and History untouched");

    await openMatch();
    await pick("a");
    await pick("locked");
    await click("Preview appearance match");
    await waitFor(() => !!dialog()?.querySelector('[role="alert"]')?.textContent?.includes("locked layer"));
    check(find("Apply appearance match").disabled && serializeDocument(cadDocument) === before, "Locked target blocks the entire selection");
    await pick("locked");
    await pick("b");
    await click("Preview appearance match");
    await waitFor(() => !find("Apply appearance match").disabled);
    check(serializeDocument(cadDocument) === before, "Reviewing two targets still leaves the document untouched");
    await click("Apply appearance match");
    await waitFor(() => !dialog());
    check(["a", "b"].every(id => JSON.stringify(stored(id)) === '{"stroke":"#1234ab"}' && cadDocument.objects[id].layerId === "layer-default")
      && stored("source") === undefined && stored("locked") === undefined, "Apply copies only stroke to two targets and preserves layers and other objects");
    const output = collectExportDrawings("XY").filter(item => ["a", "b"].includes(item.objectId));
    check(output.length === 2 && output.every(item => item.color === "#1234ab" && item.lineWeight === 0.5),
      "Output shows copied stroke and unchanged target layer width");
    check(cadHistory.getPastLabels().length === history + 1, "Apply creates one History entry");
    await click("Undo");
    await waitFor(() => stored("a") === undefined && stored("b") === undefined);
    check(stored("a") === undefined && stored("b") === undefined, "One Undo restores both targets");
    await click("Redo");
    await waitFor(() => !!stored("a") && !!stored("b"));
    check(!!stored("a") && !!stored("b"), "Redo restores both overrides");
    result.textContent = [...checks, `ALL ${checks.length} CHECKS PASSED`].join("\n");
  } catch (error) {
    result.textContent = [...checks, `FAIL: ${error instanceof Error ? error.stack : String(error)}`].join("\n");
  }
};
installBrowserChecks(button, result);
