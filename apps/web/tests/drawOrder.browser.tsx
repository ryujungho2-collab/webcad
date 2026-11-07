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
import { buildDrawOrderFixture } from "./helpers/drawOrderFixture";
import { click, input, physical, waitFor } from "./helpers/physicalInput";

await buildDrawOrderFixture();
createRoot(document.getElementById("root")!).render(<App recoveryReady />);

const button = document.getElementById("run-draw-order") as HTMLButtonElement;
const result = document.getElementById("draw-order-result")!;
const row = (id: string) => document.querySelector<HTMLElement>(`[data-model-object-id="${id}"]`)!;
const canvas = () => document.querySelector<HTMLCanvasElement>("#root canvas")!;
const nativeClick = HTMLAnchorElement.prototype.click;
let download: Promise<string> | undefined;
HTMLAnchorElement.prototype.click = function () {
  if (this.download.endsWith(".svg") || this.download.endsWith(".webcad.json")) {
    download = fetch(this.href).then(response => response.text());
  } else nativeClick.call(this);
};

async function action(direction: string, objectId?: string) {
  if (objectId) await physical(row(objectId));
  canvas().focus();
  await input({ type: "key", key: "k", modifiers: 2 });
  const item = () => document.getElementById(`palette-drawing-order-${direction}`);
  await waitFor(() => !!item());
  const revision = cadDocument.revision;
  await physical(item()!);
  await waitFor(() => cadDocument.revision > revision, `Drawing order ${direction} was not applied`);
  await settleDrawing();
}

async function settleDrawing() {
  await waitFor(() => performance.getEntriesByName("agent-webcad:viewport-sync").some(entry =>
    (entry as PerformanceMeasure).detail?.documentRevision === cadDocument.revision));
  canvas().focus();
  await input({ type: "key", key: "Escape" });
  await waitFor(() => !document.querySelector('[data-model-object-id][aria-pressed="true"]'));
}

async function svgColors() {
  download = undefined;
  await physical(document.querySelector(".app-menu summary")!);
  await click("Export SVG…");
  await waitFor(() => !!download, "SVG download missing");
  const svg = new DOMParser().parseFromString(await download!, "image/svg+xml");
  return [...new Set(Array.from(svg.querySelectorAll("[stroke]"), element => element.getAttribute("stroke"))
    .filter(color => ["#dd2222", "#2222dd", "#00bb00"].includes(color ?? "")))].join(",");
}

button.onclick = async () => {
  button.style.display = "none";
  const checks: string[] = [];
  const check = (condition: unknown, label: string) => {
    if (!condition) throw Error(label);
    checks.push(`PASS: ${label}`);
  };
  try {
    await waitFor(() => !!row("red") && !!canvas());
    await click("2D");
    await click("Fit all geometry");
    await physical(row("red"));
    await click("Direct");
    const controls = (cadDocument.features["feature-red"].params.topology as { controls: { id: string }[] }).controls;
    const grip = (i: number) => document.querySelector(`[data-direct-handle="${controls[i].id}"]`);
    await waitFor(() => !!grip(0) && !!grip(1) && !!grip(3));
    const center = (i: number) => {
      const bounds = grip(i)!.getBoundingClientRect();
      return [bounds.left + bounds.width / 2, bounds.top + bounds.height / 2];
    };
    const a = center(0), b = center(1), c = center(3);
    const screen = (x: number, y: number) => a.map((v, i) => v + (b[i] - v) * x / 80 + (c[i] - v) * y / 40);
    await click("Object");
    canvas().focus();
    await input({ type: "key", key: "Escape" });
    const history = cadHistory.getPastLabels().length;
    const roots = JSON.stringify(cadDocument.rootObjects);

    async function overlapPixels() {
      const { data } = await (await input({ type: "screenshot" })).json() as { data: string };
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
      const [left, top] = screen(36, 30), [right, bottom] = screen(64, 10);
      const width = Math.max(1, Math.round(right - left)), height = Math.max(1, Math.round(bottom - top));
      const target = document.createElement("canvas");
      target.width = width; target.height = height;
      const context = target.getContext("2d")!;
      context.drawImage(bitmap, -left, -top); bitmap.close();
      const pixels = context.getImageData(0, 0, width, height).data;
      let red = 0, blue = 0, green = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const [r, g, b] = pixels.subarray(i, i + 3);
        if (r > g + 70 && r > b + 70) red++;
        if (b > r + 70 && b > g + 70) blue++;
        if (g > r + 70 && g > b + 70) green++;
      }
      return { red, blue, green, count: width * height, data };
    }

    const initial = await overlapPixels();
    check(initial.blue > initial.count / 2 && initial.green > 0, "Actual pixels show blue fill with green hatch in front");
    await action("hatch-back");
    const behind = await overlapPixels();
    check(behind.blue > behind.count * 0.9 && behind.green === 0, "Hatch-back hides the hatch behind overlapping opaque vectors");
    check(await svgColors() === "#00bb00,#dd2222,#2222dd", "Downloaded SVG paints hatch behind both vectors");

    await action("front", "red");
    const front = await overlapPixels();
    check(front.red > front.count * 0.9 && front.green === 0, "Bring to front changes the overlap pixels to red");
    check(await svgColors() === "#00bb00,#2222dd,#dd2222", "Downloaded SVG paints the same red vector last");
    await action("back", "red");
    const back = await overlapPixels();
    check(back.blue > back.count * 0.9, "Send to back restores the blue overlap");
    check(cadHistory.getPastLabels().length === history + 3 && JSON.stringify(cadDocument.rootObjects) === roots,
      "Three commands create three undo entries and preserve root slots");

    await click("Undo");
    await waitFor(() => (cadDocument.objects.red.drawOrder ?? 0) > 0);
    await settleDrawing();
    check((await overlapPixels()).red > front.count * 0.9, "Undo restores red in front");
    await click("Redo");
    await waitFor(() => (cadDocument.objects.red.drawOrder ?? 0) < 0);
    await settleDrawing();
    check((await overlapPixels()).blue > back.count * 0.9, "Redo restores blue in front");
    download = undefined;
    await click("Download file");
    await waitFor(() => !!download, "Native download missing");
    const saved = await download!, session = documentSessionIdentity();
    await input({ type: "fileInput", selector: 'input[accept=".json,.webcad.json"]', name: "prepared.webcad.json", base64: btoa(unescape(encodeURIComponent(saved))) });
    await waitFor(() => documentSessionIdentity() !== session);
    check(cadDocument.objects.red.drawOrder! < cadDocument.objects.hatch.drawOrder! &&
      await svgColors() === "#dd2222,#00bb00,#2222dd", "Native reopen preserves painter priorities and the SVG order");
    (globalThis as typeof globalThis & { cadTestArtifacts?: Record<string, string> }).cadTestArtifacts = {
      "red-in-front.png": front.data,
    };
    result.textContent = [...checks, `ALL ${checks.length} CHECKS PASSED`].join("\n");
  } catch (error) {
    result.textContent = [...checks, `FAIL: ${error instanceof Error ? error.stack : String(error)}`].join("\n");
  } finally {
    HTMLAnchorElement.prototype.click = nativeClick;
  }
};
installBrowserChecks(button, result);
