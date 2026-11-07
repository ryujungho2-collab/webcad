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
import { documentSessionIdentity } from "../src/state/documentSession";
import { installBrowserChecks } from "./helpers/browserChecks";
import { buildDimensionStyleFixture, fixturePresetName, fixtureStyle } from "./helpers/dimensionStyleFixture";
import { click, input, physical, text, waitFor } from "./helpers/physicalInput";

await buildDimensionStyleFixture();
createRoot(document.getElementById("root")!).render(<App recoveryReady />);
const button = document.getElementById("run-dimension-style-presets") as HTMLButtonElement;
const output = document.getElementById("dimension-style-presets-result")!;
const row = (id: string) => document.querySelector<HTMLElement>(`[data-model-object-id="${id}"]`)!;
const dimension = (id: string) => cadDocument.features[`feature-${id}`];
const hasStyle = (id: string) => {
  const style = dimension(id)?.params.style as Record<string, unknown> | undefined;
  return Object.entries(fixtureStyle).every(([key, value]) => style?.[key] === value);
};
const presetSelect = () => document.querySelector<HTMLSelectElement>('[aria-label="Saved dimension style"]');

button.onclick = async () => {
  button.style.display = "none";
  const checks: string[] = [];
  const check = (condition: unknown, label: string) => {
    if (!condition) throw Error(label);
    checks.push(`PASS: ${label}`);
  };
  const nativeClick = HTMLAnchorElement.prototype.click;
  let download: Promise<string> | undefined;
  HTMLAnchorElement.prototype.click = function () {
    if (this.download.endsWith(".svg") || this.download.endsWith(".webcad.json")) {
      download = fetch(this.href).then(response => response.text());
    } else nativeClick.call(this);
  };
  try {
    await waitFor(() => !!row("source") && !!document.querySelector("canvas"));
    await click("2D");
    await click("Fit all geometry");
    await physical(row("source"));
    const targets = ["a", "b"];
    const before = targets.map(id => structuredClone(dimension(id)));
    const history = cadHistory.getPastLabels().length;
    await text("Dimension style preset name", fixturePresetName);
    await click("Save dimension style");
    await waitFor(() => presetSelect()?.value === fixturePresetName);
    check(cadHistory.getPastLabels().length === history + 1, "Saving from the Inspector records one preset and one History entry");
    await physical(row("a"));
    await physical(row("b"), 8);
    check(targets.every(id => row(id).getAttribute("aria-pressed") === "true"), "Two linear dimensions are selected in Explorer");
    await click("Apply dimension style");
    await waitFor(() => targets.every(hasStyle));
    check(cadHistory.getPastLabels().length === history + 2, "Applying to both dimensions records one additional History entry");
    check(targets.every((id, i) => {
      const expected = structuredClone(before[i]);
      expected.params.style = { textGap: 2.25, ...fixtureStyle };
      return JSON.stringify(dimension(id)) === JSON.stringify(expected);
    }), "Only the four preset display fields changed, preserving measured points, links, gap and offset");

    await click("Undo");
    await waitFor(() => targets.every(id => !hasStyle(id)));
    check(targets.every((id, i) => JSON.stringify(dimension(id)) === JSON.stringify(before[i])), "One Undo restores both annotations");
    await click("Redo");
    await waitFor(() => targets.every(hasStyle));
    check(targets.every(hasStyle), "One Redo reapplies the preset to both dimensions");
    await physical(row("a"));
    await waitFor(() => !!document.querySelector('[aria-label="Dimension length unit"]'));
    check((document.querySelector('[aria-label="Dimension length unit"]') as HTMLSelectElement).value === "cm" &&
      /3[.,]013 cm/.test(document.body.innerText), "Inspector displays the new unit and precision after Redo");
    await waitFor(() => performance.getEntriesByName("agent-webcad:viewport-sync").some(entry =>
      (entry as PerformanceMeasure).detail?.documentRevision === cadDocument.revision));
    const screenshot = (await (await input({ type: "screenshot" })).json() as { data: string }).data;

    await physical(document.querySelector(".app-menu summary")!);
    await click("Export SVG…");
    await waitFor(() => !!download);
    const svg = new DOMParser().parseFromString(await download!, "image/svg+xml");
    check(Array.from(svg.querySelectorAll("text")).some(label => label.getAttribute("font-size") === "6" &&
      /^3[.,]013 cm$/.test(label.textContent ?? "")), "Downloaded SVG contains the formatted length and preset text height");
    download = undefined;
    await click("Download file");
    await waitFor(() => !!download);
    const saved = await download!, session = documentSessionIdentity();
    const bytes = new TextEncoder().encode(saved);
    await input({ type: "fileInput", selector: 'input[accept=".json,.webcad.json"]', name: "prepared.webcad.json",
      base64: btoa(String.fromCharCode(...bytes)) });
    await waitFor(() => documentSessionIdentity() !== session);
    check(targets.every(hasStyle) && cadDocument.dimensionStylePresets?.[0].name === fixturePresetName,
      "Native download and reopen retain the preset and applied styles");
    await waitFor(() => !!row("a")?.getBoundingClientRect().width);
    await physical(row("a"));
    await waitFor(() => presetSelect()?.value === fixturePresetName);
    check(presetSelect()?.value === fixturePresetName, "Reopened preset remains available in the Inspector");
    (globalThis as typeof globalThis & { cadTestArtifacts?: Record<string, string> }).cadTestArtifacts = {
      "dimension-style-preset.png": screenshot,
    };
    output.textContent = [...checks, `ALL ${checks.length} CHECKS PASSED`].join("\n");
  } catch (error) {
    output.textContent = [...checks, `FAIL: ${error instanceof Error ? error.stack : String(error)}`].join("\n");
  } finally {
    HTMLAnchorElement.prototype.click = nativeClick;
  }
};
installBrowserChecks(button, output);
