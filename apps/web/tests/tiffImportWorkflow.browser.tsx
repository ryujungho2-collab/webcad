import { createRoot } from "react-dom/client";
import { App } from "../src/App";
import { cadDocument } from "../src/state/cadDocument";
import { serializeDocument, deserializeDocument } from "@agent-webcad/cad-document";
import { installBrowserChecks } from "./helpers/browserChecks";
import { rgbTiffFixture } from "./helpers/tiffFixture";
import { decodeTiffToPng } from "../src/integrations/photopea/tiffImport";
import "../src/ui/tokens.css";
import "../src/ui/workstation.css";
import "../src/ui/commands.css";
import "../src/ui/menu.css";
import "../src/ui/explorer.css";
import "../src/ui/inspector.css";

createRoot(document.getElementById("root")!).render(<App />);
const button = document.getElementById("run-tiff") as HTMLButtonElement;
const output = document.getElementById("tiff-result")!;
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 30));
async function waitFor(check: () => boolean) {
  const end = Date.now() + 20000;
  while (!check()) { if (Date.now() > end) throw new Error(`TIFF workflow timed out: ${document.body.innerText.slice(-600)}`); await pause(); }
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
  await input({ type: "mouseReleased", x, y, button: "left", buttons: 0 });
  await pause();
}
function find(name: string) {
  const item = Array.from(document.querySelectorAll<HTMLButtonElement>("#root button")).find(element => (element.getAttribute("aria-label") ?? element.textContent?.trim()) === name);
  if (!item) throw new Error(`Missing control: ${name}`);
  return item;
}
async function upload(name: string, bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  await input({ type: "fileInput", selector: 'input[aria-label="Import image file"]', name, base64: btoa(binary) });
}
async function pixels(dataUrl: string): Promise<number[]> {
  const image = new Image(); image.src = dataUrl; await image.decode();
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 2;
  const context = canvas.getContext("2d")!; context.drawImage(image, 0, 0);
  return Array.from(context.getImageData(0, 0, 2, 2).data);
}
button.onclick = async () => {
  button.disabled = true;
  const checks: string[] = [];
  const check = (condition: unknown, label: string) => { if (!condition) throw new Error(label); checks.push(`PASS: ${label}`); output.textContent = checks.join("\n"); };
  try {
    await waitFor(() => !!document.querySelector("#root canvas"));
    await physical(find("New document"));
    await physical(document.querySelector<HTMLSummaryElement>(".app-menu summary")!);
    await physical(find("Import Image…"));
    const inputElement = document.querySelector<HTMLInputElement>('input[aria-label="Import image file"]')!;
    check(inputElement.accept.includes(".tif"), "The image chooser discovers TIFF alongside existing raster formats");
    await upload("image-test.tif", rgbTiffFixture());
    await waitFor(() => Object.values(cadDocument.features).some(feature => feature.type === "image"));
    const feature = Object.values(cadDocument.features).find(entry => entry.type === "image")!;
    const asset = cadDocument.rasterAssets?.[String(feature.params.assetId)];
    check(!!asset && asset.mimeType === "image/png" && asset.width === 2 && asset.height === 2 && asset.dataUrl.startsWith("data:image/png;base64,"), "TIFF is converted into a canonical PNG image placement");
    check(JSON.stringify(await pixels(asset!.dataUrl)) === JSON.stringify([255,0,0,255, 0,255,0,255, 0,0,255,255, 255,255,255,255]), "Imported TIFF pixels retain their colors after PNG conversion");
    check(document.querySelector(".cad-tool-readout")?.textContent?.includes("TIFF metadata is not retained"), "The import result explains its TIFF conversion loss");
    const saved = serializeDocument(cadDocument), reloaded = deserializeDocument(saved);
    check(reloaded.rasterAssets?.[asset!.id]?.dataUrl === asset!.dataUrl && reloaded.features[feature.id]?.output === feature.output, "Save/reload keeps the normalized image source and placement identity");
    await physical(find("Undo"));
    await waitFor(() => !cadDocument.features[feature.id]);
    check(!cadDocument.rasterAssets?.[asset!.id], "Undo removes the placement and last raster source together");
    await physical(find("Redo"));
    await waitFor(() => !!cadDocument.features[feature.id]);
    check(cadDocument.rasterAssets?.[asset!.id]?.dataUrl === asset!.dataUrl, "Redo restores the same normalized source bytes");
    const before = JSON.stringify(cadDocument);
    const unsupported = rgbTiffFixture(); new DataView(unsupported.buffer).setUint16(54, 99, true);
    await upload("image-bad.tif", unsupported);
    await waitFor(() => !!document.querySelector(".cad-tool-readout")?.textContent?.includes("compression is unsupported"));
    check(JSON.stringify(cadDocument) === before, "Decoder rejects unsupported compression with no document mutation");
    const multiPage = rgbTiffFixture(); new DataView(multiPage.buffer).setUint32(130, 140, true);
    await upload("image-test.tif", multiPage);
    await waitFor(() => !!document.querySelector(".cad-tool-readout")?.textContent?.includes("Multi-page TIFF"));
    check(JSON.stringify(cadDocument) === before, "Unsupported multi-page TIFF reports a remedy and leaves the document byte-equivalent");
    const controller = new AbortController(), cancelled = decodeTiffToPng(rgbTiffFixture(), controller.signal);
    controller.abort();
    try { await cancelled; throw new Error("Cancelled TIFF unexpectedly decoded"); }
    catch (error) { check(error instanceof DOMException && error.name === "AbortError" && JSON.stringify(cadDocument) === before, "Cancelling TIFF decoding terminates the worker and yields no partial document result"); }
    output.textContent = checks.join("\n") + `\nALL ${checks.length} CHECKS PASSED`;
  } catch (error) { output.textContent = `FAIL: ${error instanceof Error ? error.stack ?? error.message : String(error)}`; }
};
installBrowserChecks(button, output);
