import { createRoot } from "react-dom/client";
import { App } from "../src/App";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory } from "../src/state/history";
import { isDocumentCommandPending } from "../src/state/documentCommandQueue";
import { serializeDocument, deserializeDocument } from "@agent-webcad/cad-document";
import { collectExportImages } from "../src/export/exportModel";
import { imageTextureResourceStats } from "../src/viewport/imageTextureResources";
import { installBrowserChecks } from "./helpers/browserChecks";
import { rgbTiffFixture } from "./helpers/tiffFixture";
import "../src/ui/tokens.css";
import "../src/ui/workstation.css";
import "../src/ui/commands.css";
import "../src/ui/menu.css";
import "../src/ui/explorer.css";
import "../src/ui/inspector.css";

createRoot(document.getElementById("root")!).render(<App />);
const button = document.getElementById("run-source") as HTMLButtonElement, output = document.getElementById("source-result")!;
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 30));
const state = () => { const { revision: _, ...value } = cadDocument; return JSON.stringify(value); };
const review = () => document.querySelector<HTMLElement>('[aria-label="Edit image size and crop review"]');
async function waitFor(check: () => boolean) {
  const end = Date.now() + 20000;
  while (!check()) { if (Date.now() > end) throw new Error(`Image source workflow timed out: ${review()?.textContent ?? document.body.innerText.slice(-600)}`); await pause(); }
  await pause();
}
async function input(action: Record<string, unknown>) {
  const run = new URLSearchParams(location.search).get("run");
  const response = await fetch(`/__browser_input?run=${run}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) });
  if (!response.ok) throw new Error(await response.text());
}
async function physical(element: Element) {
  element.scrollIntoView({ block: "center" }); await pause();
  const box = element.getBoundingClientRect(), x = box.left + box.width / 2, y = box.top + box.height / 2;
  if (!element.contains(document.elementFromPoint(x, y))) throw new Error(`Obscured control: ${element.outerHTML.slice(0, 180)}`);
  await input({ type: "mousePressed", x, y, button: "left", buttons: 1 });
  await input({ type: "mouseReleased", x, y, button: "left", buttons: 0 }); await pause();
}
function find(name: string) {
  const item = Array.from(document.querySelectorAll<HTMLButtonElement>("#root button")).find(element => (element.getAttribute("aria-label") ?? element.textContent?.trim()) === name);
  if (!item) throw new Error(`Missing control: ${name}`); return item;
}
async function click(name: string) { const item = find(name); if (item.disabled) throw new Error(`Disabled control: ${name}`); await physical(item); await waitFor(() => !isDocumentCommandPending()); }
async function text(name: string, value: string) {
  await physical(document.querySelector<HTMLInputElement>(`[aria-label="${name}"]`)!);
  await input({ type: "key", key: "a", modifiers: 2 });
  await input(value ? { type: "text", text: value } : { type: "key", key: "Backspace" }); await pause();
}
async function upload(replacement: boolean) {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 16;
  const context = canvas.getContext("2d")!; context.fillStyle = replacement ? "#0000ff" : "#ff0000"; context.fillRect(0,0,16,16);
  await input({ type: "fileInput", selector: `input[aria-label="${replacement ? "Replace image source file" : "Import image file"}"]`, name: replacement ? "image-replacement.png" : "image-test.png", base64: canvas.toDataURL("image/png").split(",")[1] });
}
async function ready() { await waitFor(() => review()?.dataset.commandStage === "ready" && !find("Apply image edit").disabled); }
button.onclick = async () => {
  button.disabled = true; const checks: string[] = [];
  const check = (condition: unknown, label: string) => { if (!condition) throw new Error(label); checks.push(`PASS: ${label}`); output.textContent = checks.join("\n"); };
  try {
    await waitFor(() => !!document.querySelector("#root canvas")); await click("New document");
    await physical(document.querySelector<HTMLSummaryElement>(".app-menu summary")!); await click("Import Image…"); await upload(false);
    await waitFor(() => Object.values(cadDocument.features).some(feature => feature.type === "image") && !!document.querySelector('[aria-label="Image width"]'));
    const original = Object.values(cadDocument.features).find(feature => feature.type === "image")!, originalId = String(original.params.assetId);
    await click("Duplicate"); await waitFor(() => Object.values(cadDocument.features).filter(feature => feature.type === "image").length === 2);
    const copy = Object.values(cadDocument.features).find(feature => feature.type === "image" && feature.output !== original.output)!;
    const object = structuredClone(cadDocument.objects[copy.output]), before = state(), history = cadHistory.getPastLabels().length;
    await click("Replace image source"); await upload(true); await ready();
    check(state() === before && cadHistory.getPastLabels().length === history, "File source preview keeps document and history unchanged");
    check(document.querySelector<HTMLImageElement>('[alt="Proposed image source"]')?.src !== cadDocument.rasterAssets![originalId].dataUrl, "The panel shows current and proposed source images");
    await waitFor(() => imageTextureResourceStats().sources === 2);
    check(imageTextureResourceStats().placements === 2, "Canvas preview replaces one texture lease without adding a document placement");
    await text("Image width", "");
    check(find("Apply image edit").disabled && review()?.dataset.commandStage === "invalid" && state() === before, "Invalid precise input disables the reviewed source plan without mutation");
    await click("Cancel image edit"); await waitFor(() => imageTextureResourceStats().sources === 1);
    check(state() === before && !document.querySelector('[aria-label="Image source replacement preview"]'), "Cancel restores the original canvas source and releases replacement resources");
    await click("Replace image source"); await upload(true); await text("Image width", "80mm"); await ready();
    check(review()?.textContent?.includes("Image sources") && state() === before, "Common impact review includes source changes and combined placement edits");
    await click("Apply image edit"); await waitFor(() => String(cadDocument.features[copy.id].params.assetId) !== originalId);
    const changed = cadDocument.features[copy.id], replacementId = String(changed.params.assetId), after = state();
    check(changed.params.width === 80 && cadHistory.getPastLabels().length === history + 1, "Source and precise width apply together as one history transaction");
    check(JSON.stringify(cadDocument.objects[copy.output]) === JSON.stringify(object) && cadDocument.features[original.id].params.assetId === originalId && !!cadDocument.rasterAssets?.[originalId], "Replacement preserves object identity and the other shared-source placement");
    const saved = deserializeDocument(serializeDocument(cadDocument));
    check(saved.features[copy.id].params.assetId === replacementId && saved.rasterAssets?.[replacementId]?.dataUrl === cadDocument.rasterAssets?.[replacementId]?.dataUrl, "Portable save/reload retains both source identities and their placements");
    const exported = collectExportImages("XY");
    check(exported.some(image => image.href === cadDocument.rasterAssets![replacementId].dataUrl) && exported.some(image => image.href === cadDocument.rasterAssets![originalId].dataUrl), "Existing output queries hand off both source images correctly");
    await click("Undo"); check(state() === before, "Undo restores source references and placement in one step");
    await click("Redo"); check(state() === after, "Redo restores the exact source replacement and width");
    await click("Replace image source"); await upload(true);
    await waitFor(() => review()?.dataset.commandStage === "invalid");
    check(find("Apply image edit").disabled && review()?.textContent?.includes("already the current source") && state() === after, "Choosing the current source explains recovery and blocks a no-op transaction");
    await click("Cancel image edit");
    await click("Replace image source");
    await input({ type: "fileInput", selector: 'input[aria-label="Replace image source file"]', name: "image-test.tif", base64: btoa(String.fromCharCode(...rgbTiffFixture())) });
    await ready();
    check(state() === after && document.querySelector('[aria-label="Image source replacement preview"]')?.textContent?.includes("TIFF metadata is not retained"), "TIFF replacement uses the shared decoder and shows conversion loss before Apply");
    await click("Apply image edit");
    const tiffAsset = cadDocument.rasterAssets![String(cadDocument.features[copy.id].params.assetId)];
    check(tiffAsset.mimeType === "image/png" && tiffAsset.width === 2 && cadDocument.features[copy.id].params.width === 80 && cadDocument.objects[copy.output].geometryId === object.geometryId, "TIFF output hands off to the same image identity and preserves its exact placement width");
    await click("Undo"); check(state() === after, "Undo TIFF replacement restores the previous PNG source and placement");
    output.textContent = checks.join("\n") + `\nALL ${checks.length} CHECKS PASSED`;
  } catch (error) { output.textContent = checks.join("\n") + `\nFAIL: ${error instanceof Error ? error.stack ?? error.message : String(error)}`; }
};
installBrowserChecks(button, output);
