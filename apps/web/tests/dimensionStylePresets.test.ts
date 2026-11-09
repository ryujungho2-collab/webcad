import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { deserializeDocument, serializeDocument } from "@agent-webcad/cad-document";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory, redoDocument, undoDocument } from "../src/state/history";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { openDocumentFile } from "../src/state/documentFile";
import { collectExportAnnotations, collectExportDrawings } from "../src/export/exportModel";
import { planPlot } from "../src/plot/plotPlan";
import { encodePdf } from "../src/plot/pdfWriter";
import { resolveDimension } from "../src/precision/dimensionGeometry";
import { documentState } from "./helpers/documentHarness";
import { buildDimensionStyleFixture, fixtureStyle, fixturePresetName } from "./helpers/dimensionStyleFixture";

const save = (objectId = "source", name = fixturePresetName) => dispatchCadCommand({ type: "save-dimension-style-preset", objectId, name });
const apply = (objectIds: string[], name = fixturePresetName) => dispatchCadCommand({ type: "apply-dimension-style-preset", objectIds, name });
const target = (id: string) => cadDocument.features[`feature-${id}`];
beforeEach(buildDimensionStyleFixture);

test("saving snapshots only display fields and applying copies to multiple dimensions in one History step", async () => {
  const initial = documentState();
  const before = structuredClone(target("a"));
  const measured = resolveDimension(before.params)!.value;
  assert.equal((await save("source", " Shop drawing ")).ok, true);
  assert.deepEqual(cadDocument.dimensionStylePresets, [{ name: fixturePresetName, style: fixtureStyle }]);
  assert.deepEqual(cadDocument.features, initial.features);
  undoDocument();
  assert.deepEqual(documentState(), initial);
  redoDocument();
  const saved = documentState();
  const count = cadHistory.getPastLabels().length;
  assert.equal((await apply(["a", "b", "a"])).ok, true);
  assert.equal(cadHistory.getPastLabels().length, count + 1);
  for (const id of ["a", "b"]) {
    const expected = structuredClone(saved.features[`feature-${id}`]);
    expected.params.style = { textGap: 2.25, ...fixtureStyle };
    assert.deepEqual(target(id), expected);
  }
  assert.equal(resolveDimension(target("a").params)!.value, measured);
  assert.deepEqual(cadDocument.objects, saved.objects);
  assert.deepEqual(cadDocument.sketches, saved.sketches);
  assert.deepEqual(cadDocument.features["feature-line-a"], saved.features["feature-line-a"]);
  assert.equal((await apply(["a", "b"])).changed, false);
  assert.equal(cadHistory.getPastLabels().length, count + 1);
  undoDocument();
  assert.deepEqual(documentState(), saved);
  redoDocument();
  assert.deepEqual(target("a").params.style, { textGap: 2.25, ...fixtureStyle });
});

test("name collisions, unsupported sources and a locked member cannot partially change the document", async () => {
  assert.equal((await save()).ok, true);
  await dispatchCadCommand({ type: "set-layer-locked", layerId: "second-layer", locked: true });
  const before = serializeDocument(cadDocument), history = cadHistory.getStateToken();
  assert.match((await save("a", " SHOP DRAWING ")).reason!, /already uses/);
  await assert.rejects(() => save("a", "  "), /Invalid CAD command/);
  assert.match((await save("line-a")).reason!, /linear dimensions/);
  assert.match((await apply(["a", "b"])).reason!, /unlocked/);
  assert.match((await apply(["a", "missing"])).reason!, /linear dimensions/);
  assert.match((await apply(["a"], "Unknown")).reason!, /missing/);
  assert.equal(serializeDocument(cadDocument), before);
  assert.equal(cadHistory.getStateToken(), history);
});

test("files retain presets without a version bump and reject corrupt records; opening an older file clears presets", async () => {
  const legacy = serializeDocument(cadDocument);
  assert.equal((await save()).ok, true);
  assert.equal((await apply(["a"])).ok, true);
  const data = serializeDocument(cadDocument);
  assert.equal(JSON.parse(data).version, JSON.parse(legacy).version);
  assert.deepEqual(deserializeDocument(data).dimensionStylePresets, cadDocument.dimensionStylePresets);
  for (const corrupt of [
    [{ name: fixturePresetName, style: { ...fixtureStyle, precision: 99 } }],
    [{ name: fixturePresetName, style: fixtureStyle }, { name: "shop drawing", style: fixtureStyle }],
    [{ name: fixturePresetName, style: { ...fixtureStyle, textHeight: 0 } }],
  ]) {
    const file = JSON.parse(data);
    file.document.dimensionStylePresets = corrupt;
    assert.throws(() => deserializeDocument(JSON.stringify(file)), /dimension style presets/);
  }
  await openDocumentFile(new File([legacy], "legacy.webcad.json"));
  assert.equal(cadDocument.dimensionStylePresets, undefined);
  await openDocumentFile(new File([data], "presets.webcad.json"));
  assert.deepEqual(cadDocument.dimensionStylePresets, [{ name: fixturePresetName, style: fixtureStyle }]);
});

test("unit, precision, text height and arrow size reach SVG and vector PDF via dimension resolution", async () => {
  const before = resolveDimension(target("a").params)!;
  assert.equal((await save()).ok, true);
  assert.equal((await apply(["a"])).ok, true);
  const after = resolveDimension(target("a").params)!;
  assert.equal(after.value, before.value);
  assert.equal(after.textHeight, 6);
  assert.match(after.text, /^3[.,]013 cm$/);
  assert.deepEqual(after.segments.slice(0, 3), before.segments.slice(0, 3));
  assert.notDeepEqual(after.segments.slice(3), before.segments.slice(3));
  const svg = collectExportAnnotations("XY");
  assert.equal(svg.texts.find(text => text.objectId === "a")!.size, 6);
  assert.equal(svg.texts.find(text => text.objectId === "a")!.text, after.text);
  assert.deepEqual(svg.lines.filter(line => line.objectId === "a").map(line => line.points),
    after.segments.map(segment => segment.map(point => point.slice(0, 2))));
  const plot = planPlot("XY", "A4", "landscape", "1:1")!;
  const pdf = new TextDecoder().decode(encodePdf(plot.page));
  assert.equal(plot.page.texts.filter(label => label.text === after.text && label.sizeMm === 6).length, 1);
  assert.match(pdf, /\/F1 17\.008 Tf/);
  assert.ok(pdf.includes(`(${after.text}) Tj`));
  const firstTargetArrow = collectExportDrawings("XY").length + resolveDimension(target("source").params)!.segments.length + 3;
  const [start, end] = plot.page.polylines[firstTargetArrow].points;
  const arrowLength = Math.hypot(start[0] - end[0], start[1] - end[1]);
  assert.ok(Math.abs(arrowLength - Math.hypot(...after.segments[3][0].map((v, i) => v - after.segments[3][1][i]))) < 1e-8);
});
