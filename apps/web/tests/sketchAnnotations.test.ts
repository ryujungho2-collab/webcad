import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import type { CadCommand } from "@agent-webcad/cad-commands";
import { cadDocument } from "../src/state/cadDocument";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { cadHistory, undoDocument, redoDocument } from "../src/state/history";
import { layoutSketchAnnotation, parseSketchDimension, sketchAnnotations } from "../src/precision/sketchAnnotations";
import { resetTestDocument, documentState, meshVolume } from "./helpers/documentHarness";
import { buildExtrudeMesh } from "../src/cad/kernelGeometryService";

beforeEach(resetTestDocument);
async function apply(command: CadCommand) { const result = await dispatchCadCommand(command); assert.ok(result.ok, result.reason); return result; }
async function setup(plane: "XY" | "XZ" | "YZ" = "XY") {
  await apply({ type: "create-sketch", id: "sketch", workPlane: plane });
  await apply({ type: "add-sketch-geometry", sketchId: "sketch", geometry: { id: "rect", kind: "rectangle", origin: [20, 10], width: 100, height: 60, angle: Math.PI / 2, cornerIds: ["a", "b", "c", "d"], edgeIds: ["ab", "bc", "cd", "da"] } });
  for (const [id, first, second, value] of [["width", "a", "b", 100], ["height", "a", "d", 60]] as const)
    await apply({ type: "add-sketch-constraint", sketchId: "sketch", constraint: { id, kind: "distance", first: { geometryId: "rect", pointId: first }, second: { geometryId: "rect", pointId: second }, value } });
}
for (const plane of ["XY", "XZ", "YZ"] as const) test(`${plane}: rotated width/height annotations resolve original corners and retain driving identity`, async () => {
  await setup(plane);
  const annotations = sketchAnnotations(cadDocument.sketches!.sketch);
  assert.equal(annotations[0].name, "Width"); assert.equal(annotations[1].name, "Height");
  assert.equal(annotations[0].dimensionId, "dimension:width");
  assert.ok(Math.abs(annotations[0].points[1][0] - 20) < 1e-8);
  assert.equal(annotations[0].points[1][1], 110);
  const screen = layoutSketchAnnotation(annotations[0], ([x, y]) => [x * 4, y * 4])!;
  assert.equal(screen.segments.length, 5);
  assert.ok(screen.anchor.every(Number.isFinite));
  assert.equal(parseSketchDimension(cadDocument.sketches!.sketch.constraints[0], "12cm"), 120);
  assert.equal(parseSketchDimension(cadDocument.sketches!.sketch.constraints[0], "-5mm"), null);
});
test("annotation edit regenerates real solid and preserves annotation IDs through Undo/Redo", async () => {
  await setup(); await apply({ type: "create-extrude", id: "plate", profileObjectIds: ["rect"], distance: 8 });
  const before = documentState(); cadHistory.clear();
  const annotation = sketchAnnotations(cadDocument.sketches!.sketch)[0];
  await apply({ type: "set-sketch-dimension", sketchId: "sketch", constraintId: annotation.constraintId, value: 120 });
  const feature = Object.values(cadDocument.features).find((entry) => entry.output === "plate")!;
  assert.ok(Math.abs(meshVolume(await buildExtrudeMesh(feature.params)) - 120 * 60 * 8) < .01);
  assert.equal(sketchAnnotations(cadDocument.sketches!.sketch)[0].dimensionId, annotation.dimensionId);
  const after = documentState(); assert.ok(undoDocument()); assert.deepEqual(documentState(), before);
  assert.ok(redoDocument()); assert.deepEqual(documentState(), after);
});
test("typed diagnostics locate failed edits and survive a failed batch without document/history changes", async () => {
  await setup(); const before = documentState(), revision = cadDocument.revision, history = cadHistory.getPastLabels();
  const move: CadCommand = { type: "move-sketch-point", sketchId: "sketch", point: { geometryId: "rect", pointId: "c" }, position: [-60, 150] };
  const result = await dispatchCadCommand(move);
  assert.equal(result.ok, false); assert.equal(result.diagnostic?.kind, "sketch-conflict");
  assert.equal(result.diagnostic?.sketchId, "sketch"); assert.ok(result.diagnostic?.constraintIds.includes("width"));
  assert.deepEqual(result.diagnostic?.geometryIds, ["rect"]);
  const batch = await dispatchCadCommand({ type: "batch", commands: [{ type: "create-layer", id: "discard", name: "discard" }, move] });
  assert.equal(batch.diagnostic?.kind, "sketch-conflict");
  assert.deepEqual(documentState(), before); assert.equal(cadDocument.revision, revision); assert.deepEqual(cadHistory.getPastLabels(), history);
});
test("dependent regeneration errors have a distinct typed diagnostic", async () => {
  await setup(); await apply({ type: "create-extrude", id: "plate", profileObjectIds: ["rect"], distance: 8 });
  await apply({ type: "create-layer", id: "output", name: "Output" });
  await apply({ type: "move-object-to-layer", objectId: "plate", layerId: "output" });
  await apply({ type: "set-layer-locked", layerId: "output", locked: true });
  const before = documentState();
  const result = await dispatchCadCommand({ type: "set-sketch-dimension", sketchId: "sketch", constraintId: "width", value: 120 });
  assert.equal(result.ok, false); assert.equal(result.diagnostic?.kind, "regeneration-failed");
  assert.ok(result.diagnostic?.geometryIds.includes("rect")); assert.deepEqual(documentState(), before);
});
test("copied/deleted annotation references never resolve to old geometry", async () => {
  await setup();
  const result = await apply({ type: "duplicate-sketch-geometry", sketchId: "sketch", geometryIds: ["rect"], offset: [200, 0] });
  const copy = sketchAnnotations(cadDocument.sketches!.sketch).filter((entry) => entry.geometryIds.includes(result.createdIds[0]));
  assert.equal(copy.length, 2); assert.ok(copy.every((entry) => entry.dimensionId !== "dimension:width" && entry.constraintId !== "width"));
  await apply({ type: "remove-sketch-geometry", sketchId: "sketch", geometryId: result.createdIds[0] });
  assert.equal(sketchAnnotations(cadDocument.sketches!.sketch).length, 2);
  assert.ok(undoDocument()); assert.equal(sketchAnnotations(cadDocument.sketches!.sketch).length, 4);
});
test("circle/arc size, signed angle and relation glyphs resolve their own persistent targets", async () => {
  await apply({ type: "create-sketch", id: "sketch", workPlane: "YZ" });
  for (const geometry of [
    { id: "circle", kind: "circle" as const, centerId: "center", curveId: "curve", center: [200, 30] as [number, number], radius: 10 },
    { id: "arc", kind: "arc" as const, centerId: "ac", startId: "as", endId: "ae", curveId: "av", center: [250, 30] as [number, number], radius: 20, startAngle: 0, endAngle: Math.PI / 2 },
    { id: "line", kind: "line" as const, startId: "la", endId: "lb", segmentId: "le", start: [0, 0] as [number, number], end: [50, 0] as [number, number] },
    { id: "other", kind: "line" as const, startId: "oa", endId: "ob", segmentId: "oe", start: [0, 0] as [number, number], end: [0, 30] as [number, number] },
  ]) await apply({ type: "add-sketch-geometry", sketchId: "sketch", geometry });
  for (const constraint of [
    { id: "radius", kind: "radius" as const, geometryId: "circle", value: 10 },
    { id: "diameter", kind: "diameter" as const, geometryId: "arc", value: 40 },
    { id: "angle", kind: "angle" as const, firstLineId: "line", secondLineId: "other", value: Math.PI / 2 },
    { id: "horizontal", kind: "horizontal" as const, first: { geometryId: "line", pointId: "la" }, second: { geometryId: "line", pointId: "lb" } },
    { id: "join", kind: "coincident" as const, first: { geometryId: "line", pointId: "la" }, second: { geometryId: "other", pointId: "oa" } },
    { id: "fixed", kind: "fixed-point" as const, point: { geometryId: "circle", pointId: "center" }, value: [200, 30] as [number, number] },
  ]) await apply({ type: "add-sketch-constraint", sketchId: "sketch", constraint });
  const annotations = sketchAnnotations(cadDocument.sketches!.sketch);
  assert.equal(annotations.length, 6); assert.equal(annotations[0].text, "R 10.00 mm"); assert.equal(annotations[1].text, "Ø 40.00 mm");
  assert.equal(annotations[2].text, "90.00°"); assert.deepEqual(annotations[2].geometryIds, ["line", "other"]);
  assert.equal(parseSketchDimension(cadDocument.sketches!.sketch.constraints[2], "-45deg"), -Math.PI / 4);
  assert.equal(annotations[3].dimensionId, undefined); assert.equal(annotations[4].text, "●"); assert.deepEqual(annotations[5].points, [[200, 30]]);
});
