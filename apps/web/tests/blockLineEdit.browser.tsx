import { createRoot } from "react-dom/client";
import { App } from "../src/App";
import "../src/ui/tokens.css";
import "../src/ui/workstation.css";
import "../src/ui/commands.css";
import "../src/ui/menu.css";
import "../src/ui/explorer.css";
import "../src/ui/inspector.css";
import { worldDraftingGeometry } from "../src/precision/draftingGeometry";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory } from "../src/state/history";
import { documentSessionIdentity } from "../src/state/documentSession";
import { installBrowserChecks } from "./helpers/browserChecks";
import { buildBlockLineEditFixture } from "./helpers/blockLineEditFixture";
import { click, find, input, text, waitFor } from "./helpers/physicalInput";
import { documentState } from "./helpers/documentHarness";

const independent = await buildBlockLineEditFixture();
createRoot(document.getElementById("root")!).render(<App recoveryReady />);
const button = document.getElementById("run-block-line-edit") as HTMLButtonElement;
const result = document.getElementById("block-line-edit-result")!;
const panel = () => document.querySelector('[aria-label="Component line editor"]');
const state = () => JSON.stringify(documentState());
const geometry = (id: string) => worldDraftingGeometry(cadDocument, cadDocument.objects[id],
  cadDocument.features[`feature-${id}`]).lines[0].points.map(point => point.map(value => Math.round(value)));

async function review(point: string) {
  await text("Component endpoint coordinates", point);
  await click("Review component line edit");
  await waitFor(() => !find("Apply component line edit").disabled);
}

button.onclick = async () => {
  button.style.display = "none";
  const checks: string[] = [];
  const check = (condition: unknown, label: string) => {
    if (!condition) throw Error(label);
    checks.push(`PASS: ${label}`);
  };
  let download: Promise<string> | undefined;
  const nativeClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.download.endsWith(".webcad.json")) download = fetch(this.href).then(response => response.text());
    else nativeClick.call(this);
  };
  try {
    await waitFor(() => !!document.querySelector("canvas"));
    await click("2D");
    await click("Fit all geometry");
    await click("Components");
    const before = state(), snapshot = documentState();
    const history = cadHistory.getPastLabels().length;
    await click("Edit component line");
    await review("35mm,12mm");
    const preview = panel()?.querySelectorAll('svg[aria-label="Component line before and after"] polyline');
    check(preview?.length === 2 && preview[0].getAttribute("points") !== preview[1].getAttribute("points"),
      "A detached preview compares the original and proposed definition line");
    check(state() === before && cadHistory.getPastLabels().length === history, "Review leaves document and History untouched");
    await click("Cancel component line edit");
    check(!panel() && state() === before && cadHistory.getPastLabels().length === history, "Cancel closes the editor without publishing");

    await click("Edit component line");
    await review("35mm,12mm");
    await click("Undo");
    await waitFor(() => !cadDocument.objects[independent]);
    check(find("Apply component line edit").disabled, "A document change disables an older reviewed plan");
    await click("Redo");
    await waitFor(() => !!cadDocument.objects[independent]);
    check(state() === before && find("Apply component line edit").disabled, "Returning to identical geometry still requires fresh review");
    await click("Review component line edit");
    await waitFor(() => !find("Apply component line edit").disabled);
    const screenshot = (await (await input({ type: "screenshot" })).json() as { data: string }).data;
    await click("Apply component line edit");
    await waitFor(() => !panel());
    check(cadHistory.getPastLabels().length === history + 1, "Apply publishes the definition as one History entry");
    check(JSON.stringify(geometry("linked-a")) === "[[100,0,0],[135,12,0]]" &&
      JSON.stringify(geometry("linked-b")) === "[[200,10,0],[188,45,0]]", "Both linked placements resolve the new endpoint in their own transforms");
    check(JSON.stringify(cadDocument.objects) === JSON.stringify(snapshot.objects) &&
      JSON.stringify(cadDocument.features) === JSON.stringify(snapshot.features) &&
      JSON.stringify(cadDocument.blocks?.["fixture-block"].overrides) === JSON.stringify(snapshot.blocks?.["fixture-block"].overrides),
      "Placements, original drawing, independent copy and member override survive Apply");
    await waitFor(() => performance.getEntriesByName("agent-webcad:viewport-sync").some(entry => {
      const detail = (entry as PerformanceMeasure).detail;
      return detail?.documentRevision === cadDocument.revision && detail.remeshedCount >= 2;
    }), "Linked instances did not refresh in the viewport");
    check(true, "Viewport rebuilds linked instance geometry after the definition changes");

    const after = state();
    await click("Undo");
    await waitFor(() => state() === before);
    check(state() === before, "Undo restores the definition and both live placements");
    await click("Redo");
    await waitFor(() => state() === after);
    check(state() === after, "Redo restores the reviewed definition");

    await click("Download file");
    await waitFor(() => !!download);
    const payload = await download!, identity = documentSessionIdentity();
    const bytes = new TextEncoder().encode(payload);
    await input({ type: "fileInput", selector: 'input[accept=".json,.webcad.json"]', name: "prepared.webcad.json",
      base64: btoa(String.fromCharCode(...bytes)) });
    await waitFor(() => documentSessionIdentity() !== identity);
    check(state() === after && JSON.stringify(geometry("linked-b")) === "[[200,10,0],[188,45,0]]",
      "Native download and reopen preserve the edited definition, overrides and placements");
    (globalThis as typeof globalThis & { cadTestArtifacts?: Record<string, string> }).cadTestArtifacts = {
      "component-line-review.png": screenshot,
    };
    result.textContent = [...checks, `ALL ${checks.length} CHECKS PASSED`].join("\n");
  } catch (error) {
    result.textContent = [...checks, `FAIL: ${error instanceof Error ? error.stack : String(error)}`].join("\n");
  } finally {
    HTMLAnchorElement.prototype.click = nativeClick;
  }
};
installBrowserChecks(button, result);
