import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import type { CadDocument } from "@agent-webcad/cad-document";
import { encodePdf, encodePdfRasterPages, MM_TO_PT } from "../src/plot/pdfWriter";
import { planPlot } from "../src/plot/plotPlan";
import { createDrawingTopology } from "../src/precision/drawingTopology";
import { cadDocument } from "../src/state/cadDocument";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { planDimensionFromSelection } from "../src/state/dimensionCommands";
import { cadHistory } from "../src/state/history";

function decode(bytes: Uint8Array): string {
  return new TextDecoder("latin1").decode(bytes);
}

describe("pdf writer", () => {
  test("emits a header, objects and a verifiable xref table", () => {
    const bytes = encodePdf({
      widthMm: 210, heightMm: 297,
      polylines: [{ points: [[10, 10], [20, 10]], closed: false }],
      texts: [{ position: [10, 20], sizeMm: 5, text: "Title (1:2)" }],
    });
    const text = decode(bytes);
    assert.ok(text.startsWith("%PDF-1.4"));
    assert.ok(text.includes("/MediaBox [0 0 595.276 841.89]"));
    assert.ok(text.includes("(Title \\(1:2\\))"));
    // Every xref offset must land on its object header.
    const startxref = Number(text.slice(text.lastIndexOf("startxref") + 9).split("\n")[1]);
    const xrefSection = text.slice(startxref, text.indexOf("trailer"));
    assert.ok(xrefSection.startsWith("xref"));
    const lines = xrefSection.split("\n").slice(3, 8);
    assert.equal(lines.length, 5);
    lines.forEach((line, index) => {
      const offset = Number(line.slice(0, 10));
      assert.equal(text.slice(offset, offset + `${index + 1} 0 obj`.length), `${index + 1} 0 obj`);
    });
    assert.ok(text.trimEnd().endsWith("%%EOF"));
  });

  test("maps paper coordinates and rejects Unicode loss before font rasterization", () => {
    assert.throws(()=>encodePdf({widthMm:100,heightMm:100,polylines:[],texts:[{position:[0,0],sizeMm:5,text:"거실"}]}),/Unicode/);
    const bytes = encodePdf({
      widthMm: 100, heightMm: 100,
      polylines: [{ points: [[0, 0], [10, 0]], closed: false }],
      texts: [{ position: [0, 0], sizeMm: 5, text: "ROOM" }],
    });
    const text = decode(bytes);
    // y=0 maps to the page bottom edge in points.
    assert.ok(text.includes(`0 ${(100 * MM_TO_PT).toFixed(3)} m`));
    assert.ok(text.includes("(ROOM)"));
  });

  test("empty content stays a valid single page", () => {
    const text = decode(encodePdf({ widthMm: 210, heightMm: 297, polylines: [], texts: [] }));
    assert.ok(text.startsWith("%PDF-1.4") && text.trimEnd().endsWith("%%EOF"));
  });

  test("writes ordered mixed-size raster pages with binary JPEG streams and byte-accurate xrefs", () => {
    const bytes = encodePdfRasterPages([
      { widthMm: 25.4, heightMm: 25.4, raster: { width: 96, height: 96, jpeg: Uint8Array.from([0xff, 0xd8, 0x41, 0xff, 0xd9]) } },
      { widthMm: 50.8, heightMm: 25.4, raster: { width: 192, height: 96, jpeg: Uint8Array.from([0xff, 0xd8, 0x42, 0xff, 0xd9]) } },
    ]);
    const text = Array.from(bytes, byte => String.fromCharCode(byte)).join("");
    assert.ok(text.startsWith("%PDF-1.4"));
    assert.ok(text.includes("/Kids [3 0 R 6 0 R] /Count 2"));
    assert.ok(text.includes("/MediaBox [0 0 72 72]"));
    assert.ok(text.includes("/MediaBox [0 0 144 72]"));
    assert.ok(text.includes("/Filter /DCTDecode /Length 5"));
    const startxref = Number(text.slice(text.lastIndexOf("startxref") + 9).split("\n")[1]);
    const xrefSection = text.slice(startxref, text.indexOf("trailer"));
    assert.ok(xrefSection.startsWith("xref\n0 9\n"));
    const lines = xrefSection.split("\n").slice(3, 11);
    assert.equal(lines.length, 8);
    lines.forEach((line, index) => {
      const offset = Number(line.slice(0, 10));
      assert.equal(text.slice(offset, offset + `${index + 1} 0 obj`.length), `${index + 1} 0 obj`);
    });
    assert.ok(text.trimEnd().endsWith("%%EOF"));
  });

  test("raster pages reject empty documents and corrupt image streams", () => {
    assert.throws(() => encodePdfRasterPages([]), /at least one visible artboard/);
    assert.throws(() => encodePdfRasterPages([{ widthMm: 10, heightMm: 10, raster: { width: 1, height: 1, jpeg: new Uint8Array([1,2,3,4]) } }]), /complete JPEG/);
  });
});

describe("plot plan", () => {
  const original = structuredClone(cadDocument);

  function restore(snapshot: CadDocument) {
    cadDocument.id = snapshot.id;
    cadDocument.revision = snapshot.revision;
    cadDocument.objects = structuredClone(snapshot.objects);
    cadDocument.features = structuredClone(snapshot.features);
    cadDocument.layers = structuredClone(snapshot.layers);
    cadDocument.rootObjects = [...snapshot.rootObjects];
    cadDocument.rootLayers = [...snapshot.rootLayers];
  }

  beforeEach(() => {
    restore({
      id: "test-document",
      revision: 0,
      objects: {},
      features: {},
      layers: { "layer-default": { id: "layer-default", name: "Default", visible: true, locked: false, objectIds: [] } },
      rootObjects: [],
      rootLayers: ["layer-default"],
    } as unknown as CadDocument);
    cadHistory.clear();
  });
  afterEach(() => {
    restore(original);
    cadHistory.clear();
  });

  function installLine() {
    const points: [number, number, number][] = [[0, 0, 0], [100, 0, 0]];
    cadDocument.objects.line = {
      id: "line", geometryId: "geometry-line", name: "Line", visible: true, layerId: "layer-default",
      transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    };
    cadDocument.features["feature-line"] = {
      id: "feature-line", type: "drawing", inputs: [], output: "line",
      params: { kind: "line", workPlane: "XY", points, topology: createDrawingTopology("line", { points }, "line") },
    };
    cadDocument.layers["layer-default"].objectIds.push("line");
    cadDocument.rootObjects.push("line");
  }

  test("returns null on an empty plane", () => {
    assert.equal(planPlot("XY", "A4", "landscape", "1:1"), null);
  });

  test("1:2 scale maps 100 mm to 50 mm on paper", () => {
    installLine();
    const plan = planPlot("XY", "A4", "landscape", "1:2");
    assert.ok(plan);
    assert.equal(plan.scaleLabel, "1:2");
    assert.equal(plan.drawings, 1);
    const [a, b] = plan.page.polylines[0].points;
    assert.ok(Math.abs(Math.hypot(b[0] - a[0], b[1] - a[1]) - 50) < 1e-6);
    // Centered horizontally in the A4-landscape printable area.
    const midX = (a[0] + b[0]) / 2;
    assert.ok(Math.abs(midX - 297 / 2) < 1e-6);
  });
  test("explicit scale reports page overflow, and fit preserves the complete drawing", () => {
    installLine();cadDocument.features["feature-line"].params.points=[[0,0,0],[6000,0,0]];
    assert.equal(planPlot("XY","A4","landscape","1:10")!.fitsPaper,false);
    assert.equal(planPlot("XY","A4","landscape","fit")!.fitsPaper,true);
  });

  test("fit reports its effective ratio and includes dimensions", async () => {
    installLine();
    const planned = planDimensionFromSelection(cadDocument, "line");
    assert.ok(planned);
    const created = await dispatchCadCommand({ ...planned!, layerId: "layer-default" });
    assert.equal(created.ok, true);
    const plan = planPlot("XY", "A4", "landscape", "fit");
    assert.ok(plan);
    assert.equal(plan.dimensions, 1);
    assert.ok(plan.scaleLabel.startsWith("fit 1:"));
    assert.ok(plan.page.texts.some((label) => label.text.includes("100.00 mm")));
    assert.ok(plan.page.texts.some((label) => label.text.includes(plan.scaleLabel)));
  });
});
