import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { deserializeDocument, serializeDocument } from "@agent-webcad/cad-document";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory, redoDocument, undoDocument } from "../src/state/history";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { collectExportDrawings } from "../src/export/exportModel";
import { drawingStack } from "../src/precision/drawOrder";
import { encodePdf } from "../src/plot/pdfWriter";
import { planPlot } from "../src/plot/plotPlan";
import { buildDrawOrderFixture } from "./helpers/drawOrderFixture";

const reorder = (direction: "front" | "back" | "hatch-back", objectIds: string[] = []) =>
  dispatchCadCommand({ type: "reorder-drawing", plane: "XY", direction, objectIds });
const stack = () => drawingStack(cadDocument, "XY");
beforeEach(buildDrawOrderFixture);

test("reordering preserves relative order, ownership and dependencies and is one Undo step", async () => {
  const before = structuredClone(cadDocument);
  const token = cadHistory.getPastLabels().length;
  assert.equal((await reorder("front", ["blue", "red"])).ok, true);
  assert.deepEqual(stack(), ["hatch", "red", "blue"]);
  assert.deepEqual(cadDocument.rootObjects, before.rootObjects);
  assert.deepEqual(cadDocument.features, before.features);
  assert.deepEqual(cadDocument.layers, before.layers);
  assert.equal(cadHistory.getPastLabels().length, token + 1);
  const saved = deserializeDocument(serializeDocument(cadDocument));
  assert.deepEqual(drawingStack(saved, "XY"), stack());
  undoDocument();
  assert.deepEqual(stack(), ["red", "blue", "hatch"]);
  redoDocument();
  assert.deepEqual(stack(), ["hatch", "red", "blue"]);
});

test("locked, missing or wrong-plane targets and no-op batches leave the document unchanged", async () => {
  await dispatchCadCommand({ type: "set-layer-locked", layerId: "hatch-layer", locked: true });
  const before = serializeDocument(cadDocument), history = cadHistory.getStateToken();
  assert.equal((await reorder("back", ["hatch", "blue"])).ok, false);
  assert.equal((await reorder("front", ["red", "missing"])).ok, false);
  assert.equal((await reorder("hatch-back")).ok, false);
  assert.equal((await reorder("back", ["red"])).ok, false);
  assert.equal((await dispatchCadCommand({ type: "reorder-drawing", plane: "XZ", direction: "front", objectIds: ["red"] })).ok, false);
  assert.equal(serializeDocument(cadDocument), before);
  assert.equal(cadHistory.getStateToken(), history);
});

test("SVG collection and vector PDF stroke operators follow the shared painter stack", async () => {
  assert.equal((await reorder("hatch-back")).ok, true);
  assert.equal((await reorder("front", ["red"])).ok, true);
  assert.deepEqual([...new Set(collectExportDrawings("XY").map(line => line.objectId))], ["hatch", "blue", "red"]);
  const plot = planPlot("XY", "A4", "landscape", "fit")!;
  assert.deepEqual([...new Set(plot.page.polylines.map(line => line.color))], ["#00bb00", "#2222dd", "#dd2222"]);
  const pdf = new TextDecoder().decode(encodePdf(plot.page));
  const green = pdf.indexOf("0 0.733 0 RG"), blue = pdf.indexOf("0.133 0.133 0.867 RG"), red = pdf.indexOf("0.867 0.133 0.133 RG");
  assert.ok(green >= 0 && green < blue && blue < red, "The encoded PDF stroke operators preserve the stack");
});
