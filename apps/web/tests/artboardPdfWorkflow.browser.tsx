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
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import type { CadRasterAsset } from "@agent-webcad/cad-document";
import { installBrowserChecks } from "./helpers/browserChecks";

createRoot(document.getElementById("root")!).render(<App />);
const button = document.getElementById("run-artboard-pdf") as HTMLButtonElement;
const output = document.getElementById("artboard-pdf-result")!;
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 30));
const state = () => { const { revision: _, ...value } = cadDocument; return JSON.stringify([value, cadHistory.getPastLabels(), cadHistory.getFutureLabels()]); };
function find(name: string) {
  const element = Array.from(document.querySelectorAll<HTMLButtonElement>("#root button")).find(item => (item.getAttribute("aria-label") ?? item.textContent?.trim()) === name);
  if (!element) throw new Error(`Missing control: ${name}`);
  return element;
}
async function input(action: Record<string, unknown>) {
  const run = new URLSearchParams(location.search).get("run"), response = await fetch(`/__browser_input?run=${run}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) });
  if (!response.ok) throw new Error(await response.text());
  return response;
}
async function physical(element: Element) {
  element.scrollIntoView({ block: "center" }); await pause();
  const rect = element.getBoundingClientRect(), x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
  if (!element.contains(document.elementFromPoint(x, y))) throw new Error(`Obscured control: ${element.outerHTML.slice(0, 160)}`);
  await input({ type: "mousePressed", x, y, button: "left", buttons: 1 });
  await input({ type: "mouseReleased", x, y, button: "left", buttons: 0 });
  await pause();
}
async function click(name: string) { const element = find(name); if (element.disabled) throw new Error(`Disabled control: ${name}`); await physical(element); }
async function choose(label: string, value: string) {
  const element = document.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`);
  if (!element) throw new Error(`Missing select: ${label}`);
  await physical(element); await input({ type: "key", key: "Home" });
  const targetIndex = Array.from(element.options).findIndex(option => option.value === value);
  if (targetIndex < 0) throw new Error(`Missing option ${value} in ${label}`);
  for (let index = 0; index < targetIndex; index++) await input({ type: "key", key: "ArrowDown" });
  await input({ type: "key", key: "Enter" }); await pause();
}
async function waitFor(check: () => boolean, label: string) {
  const until = Date.now() + 25000;
  while (!check()) { if (Date.now() > until) throw new Error(`Timed out waiting for ${label}: ${document.querySelector(".artboard-pdf-dialog")?.textContent ?? output.textContent}`); await pause(); }
  await pause();
}
async function makeAsset(): Promise<CadRasterAsset> {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 2;
  const context = canvas.getContext("2d")!, pixels = context.createImageData(2, 2);
  for (let index = 0; index < 4; index++) pixels.data.set([230, 100, 30, 255], index * 4);
  context.putImageData(pixels, 0, 0);
  const dataUrl = canvas.toDataURL("image/png"), bytes = Uint8Array.from(atob(dataUrl.split(",")[1]), char => char.charCodeAt(0));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), contentHash = Array.from(digest, value => value.toString(16).padStart(2, "0")).join("");
  return { id: `asset-${contentHash}`, name: "pdf-fixture.png", mimeType: "image/png", width: 2, height: 2, byteLength: bytes.length, dataUrl, contentHash };
}
async function openPdf() {
  const file = document.querySelector<HTMLDetailsElement>(".app-menu");
  if (!file) throw new Error("Missing File menu");
  await physical(file.querySelector("summary")!);
  await click("Export Artboards PDF…");
  await waitFor(() => Boolean(document.querySelector(".artboard-pdf-dialog")), "artboard PDF dialog");
}
function latin1(bytes: Uint8Array) { return Array.from(bytes, byte => String.fromCharCode(byte)).join(""); }
function colorNear(actual: number[], expected: number[], tolerance: number) { return actual.slice(0, 3).every((value, index) => Math.abs(value - expected[index]) <= tolerance); }

let downloaded: Promise<{ filename: string; blob: Blob }> | undefined;
const nativeAnchorClick = HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click = function() {
  if (this.download.endsWith(".pdf")) {
    const filename = this.download;
    downloaded = fetch(this.href).then(response => response.blob()).then(blob => ({ filename, blob }));
    return;
  }
  nativeAnchorClick.call(this);
};

button.onclick = async () => {
  button.disabled = true; const checks: string[] = [], metrics: Record<string, number> = {};
  const check = (condition: unknown, label: string) => { if (!condition) throw new Error(label); checks.push(`PASS: ${label}`); output.textContent = checks.join("\n"); };
  try {
    await waitFor(() => Boolean(document.querySelector("#root canvas")), "viewport");
    await click("New document");
    check((await dispatchCadCommand({ type: "create-artboard", id: "pdf-square", name: "Square board", workPlane: "XY", origin: [0, 0], size: [25.4, 25.4], background: "#f0d8d0" })).ok, "A small landscape-neutral board with a known page background is created");
    check((await dispatchCadCommand({ type: "create-artboard", id: "pdf-a3", name: "A3 landscape", workPlane: "XY", origin: [0, 0], size: [420, 297], background: "#ffffff" })).ok, "A second board keeps its larger physical size and landscape orientation");
    check((await dispatchCadCommand({ type: "insert-image", id: "pdf-image", asset: await makeAsset(), workPlane: "XY", center: [12.7, 12.7, 0], width: 10, height: 10 })).ok, "Shared raster artwork is present in both visible board page scenes");
    check((await dispatchCadCommand({ type: "update-image", objectId: "pdf-image", mask: "ellipse", opacity: 1 })).ok, "A transparent ellipse-mask corner exercises PDF white-page alpha flattening");
    check((await dispatchCadCommand({ type: "create-drawing", id: "pdf-vector", name: "Green vector patch", drawing: "rectangle", params: { workPlane: "XY", points: [[2, 2, 0], [10, 2, 0], [10, 10, 0], [2, 10, 0]] } })).ok, "A vector drawing is included in the rasterized PDF page content");
    check((await dispatchCadCommand({ type: "set-vector-style", objectId: "pdf-vector", style: { stroke: "#00ff00", fill: "#00ff00", fillGradient: null, opacity: 1, strokeWidth: 0.25 } })).ok, "The vector fill style is applied without replacing CAD geometry");
    const before = state();

    await openPdf();
    check(document.querySelector('[aria-label="PDF page plan"]')?.children.length === 2, "The default scope maps every visible artboard to one ordered PDF page");
    await choose("PDF raster resolution", "300");
    check(Boolean(document.querySelector(".artboard-pdf-dialog [role=alert]")) && find("Download artboard PDF").disabled, "An A3 page that exceeds the pixel budget blocks preview and download");
    await choose("PDF raster resolution", "150");
    await waitFor(() => Boolean(document.querySelector('[data-pdf-preview-ready="true"]')) && !find("Download artboard PDF").disabled, "corrected multi-page PDF preview");
    check(document.querySelector('[aria-label="PDF page 1 Square board"]')?.textContent?.includes("150 × 150 px") && document.querySelector('[aria-label="PDF page 2 A3 landscape"]')?.textContent?.includes("2,480 × 1,754 px"), "Resolution correction retains page order and exact per-board pixel dimensions");
    const ready = document.querySelector<HTMLElement>('[data-pdf-preview-ready="true"]')!;
    metrics.pageCount = Number(ready.dataset.pdfPages); metrics.pdfBytes = Number(ready.dataset.pdfBytes); metrics.decodeMs = Number(ready.dataset.pdfDecodeMs); metrics.renderMs = Number(ready.dataset.pdfRenderMs); metrics.elapsedMs = Number(ready.dataset.pdfElapsedMs); metrics.estimatedPeakBytes = Number(ready.dataset.pdfEstimatedMemoryBytes); metrics.totalPixels = 150 * 150 + 2480 * 1754;
    const dialogBefore = state();
    await click("Download artboard PDF"); const download = await downloaded;
    if (!download) throw new Error("PDF preview did not create a download");
    check(download.blob.type === "application/pdf" && download.filename.endsWith("-artboards.pdf"), "Download produces one PDF file for the visible board set");
    const pdfBytes = new Uint8Array(await download.blob.arrayBuffer()), pdf = latin1(pdfBytes);
    check(pdf.startsWith("%PDF-1.4") && /\/Count 2\b/.test(pdf) && pdf.includes("/MediaBox [0 0 72 72]") && pdf.includes("/MediaBox [0 0 1190.551 841.89]"), "Downloaded PDF contains two pages with exact physical millimetre page bounds");
    if (new URLSearchParams(location.search).get("artifacts") === "1") {
      (globalThis as typeof globalThis & { cadTestArtifacts?: Record<string, string> }).cadTestArtifacts = { "artboard-export.pdf": btoa(Array.from(pdfBytes, byte => String.fromCharCode(byte)).join("")) };
    }
    const imagePattern = /\/Type \/XObject \/Subtype \/Image \/Width (\d+) \/Height (\d+) \/ColorSpace \/DeviceRGB \/BitsPerComponent 8 \/Filter \/DCTDecode \/Length (\d+) >>\nstream\n/g;
    const matches = [...pdf.matchAll(imagePattern)];
    check(matches.length === 2 && matches[0][1] === "150" && matches[0][2] === "150" && matches[1][1] === "2480" && matches[1][2] === "1754", "PDF embeds each page raster at its reviewed dpi and matching board orientation");
    const decodedPages: ImageBitmap[] = [];
    for (const match of matches) {
      const start = match.index! + match[0].length, length = Number(match[3]);
      const jpeg = Uint8Array.from(pdf.slice(start, start + length), character => character.charCodeAt(0));
      const buffer = jpeg.buffer.slice(jpeg.byteOffset, jpeg.byteOffset + jpeg.byteLength) as ArrayBuffer;
      decodedPages.push(await createImageBitmap(new Blob([buffer], { type: "image/jpeg" })));
    }
    check(decodedPages[0].width === 150 && decodedPages[0].height === 150 && decodedPages[1].width === 2480 && decodedPages[1].height === 1754, "Embedded JPEG page streams reopen and decode to the advertised pixel dimensions");
    const sample = (bitmap: ImageBitmap, x: number, y: number) => {
      const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext("2d", { willReadFrequently: true })!; context.drawImage(bitmap, 0, 0);
      return Array.from(context.getImageData(x, y, 1, 1).data);
    };
    check(colorNear(sample(decodedPages[0], 4, 4), [240, 216, 208], 12), "Decoded PDF page preserves the artboard background after raster flattening");
    check(colorNear(sample(decodedPages[0], 75, 75), [230, 100, 30], 24), "Decoded PDF page includes the board's source raster image");
    check(colorNear(sample(decodedPages[0], 48, 48), [240, 216, 208], 20), "Transparent pixels outside the image ellipse retain the artboard background in the opaque PDF page");
    check(colorNear(sample(decodedPages[0], 36, 114), [0, 255, 0], 35), "Decoded PDF page includes the styled vector overlay");
    check(sample(decodedPages[1], 2300, 1200).slice(0, 3).every(channel => channel > 238), "The second board's white background is preserved in its PDF page");
    decodedPages.forEach(bitmap => bitmap.close());
    check(state() === dialogBefore && state() === before, "Rendering and download leave the document and Undo/Redo history unchanged");

    await openPdf(); await choose("PDF artboard scope", "active");
    await waitFor(() => Boolean(document.querySelector('[data-pdf-preview-ready="true"]')) && !find("Download artboard PDF").disabled, "active-board-only PDF preview");
    check(document.querySelector('[aria-label="PDF page plan"]')?.children.length === 1, "Active-board scope produces one page without including other visible boards");
    await click("Cancel PDF export");
    check(state() === before, "Canceling active-board export preserves document and history");
    (globalThis as typeof globalThis & { cadTestMetrics?: unknown }).cadTestMetrics = metrics;
    output.textContent = checks.join("\n") + `\nALL ${checks.length} CHECKS PASSED`;
  } catch (error) { output.textContent = checks.join("\n") + `\nFAIL: ${error instanceof Error ? error.stack : error}`; }
};
installBrowserChecks(button, output);
