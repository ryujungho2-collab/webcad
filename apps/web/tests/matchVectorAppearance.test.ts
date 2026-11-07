import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { validateCommand, type CadCommand } from "@agent-webcad/cad-commands";
import { DEFAULT_VECTOR_STYLE, deserializeDocument, serializeDocument } from "@agent-webcad/cad-document";
import { cadDocument } from "../src/state/cadDocument";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { applyCadPlan, discardCadPlan, previewCadCommand } from "../src/state/documentPlans";
import { cadHistory, redoDocument, undoDocument } from "../src/state/history";
import { planMatchVectorAppearance } from "../src/state/matchVectorAppearance";
import { collectExportDrawings } from "../src/export/exportModel";
import { resetTestDocument } from "./helpers/documentHarness";

async function execute(command: CadCommand) {
  const result = await dispatchCadCommand(command);
  assert.ok(result.ok, result.reason);
}

beforeEach(async () => {
  resetTestDocument();
  await execute({ type: "create-layer", id: "blue" });
  await execute({ type: "set-layer-style", layerId: "blue", style: { color: "#1234ab", lineType: "continuous", lineWeight: 0.8 } });
  await execute({ type: "set-layer-style", layerId: "layer-default", style: { color: "#bb2222", lineType: "continuous", lineWeight: 0.5 } });
  for (const [id, layerId, x] of [["source", "blue", 0], ["a", "layer-default", 20], ["b", "layer-default", 40]] as const) {
    await execute({ type: "create-drawing", id, layerId, drawing: "rectangle", params: {
      workPlane: "XY", points: [[x, 0, 0], [x + 10, 0, 0], [x + 10, 8, 0], [x, 8, 0]],
    } });
  }
});

const storedStyle = (id: string) => cadDocument.features[`feature-${id}`].params.vectorStyle;
const output = (id: string) => collectExportDrawings("XY").find(entry => entry.objectId === id);

test("copies an inherited stroke to multiple targets in one Undo and leaves unchecked width inherited", async () => {
  const before = serializeDocument(cadDocument);
  const history = cadHistory.getPastLabels().length;
  const plan = planMatchVectorAppearance(cadDocument, "source", ["a", "b", "a"], ["stroke"]);
  const preview = await previewCadCommand(plan.command);
  assert.ok(preview.result.ok, preview.result.reason);
  assert.equal(serializeDocument(cadDocument), before);
  assert.ok((await applyCadPlan(preview.planId)).ok);
  assert.equal(cadHistory.getPastLabels().length, history + 1);
  for (const id of ["a", "b"]) {
    assert.deepEqual(storedStyle(id), { stroke: "#1234ab" });
    assert.equal(cadDocument.objects[id].layerId, "layer-default");
    assert.equal(output(id)?.color, "#1234ab");
    assert.equal(output(id)?.lineWeight, 0.5);
  }
  assert.equal(storedStyle("source"), undefined);
  const saved = deserializeDocument(serializeDocument(cadDocument));
  assert.deepEqual(saved.features["feature-a"].params.vectorStyle, { stroke: "#1234ab" });
  undoDocument();
  assert.equal(storedStyle("a"), undefined);
  assert.equal(storedStyle("b"), undefined);
  redoDocument();
  assert.equal(output("a")?.color, "#1234ab");
  await execute({ type: "set-layer-style", layerId: "layer-default", style: { color: "#bb2222", lineType: "continuous", lineWeight: 1.2 } });
  assert.equal(output("a")?.lineWeight, 1.2);
  discardCadPlan(preview.planId);
});

test("solid fill, opacity and width merge with existing explicit stroke and replace only the selected fill group", async () => {
  await execute({ type: "set-vector-style", objectId: "source", style: {
    ...DEFAULT_VECTOR_STYLE, fill: "#abcdef", opacity: 0.4, strokeWidth: 1.3,
  } });
  await execute({ type: "set-vector-style", objectId: "a", style: {
    ...DEFAULT_VECTOR_STYLE, stroke: "#0a0b0c", fillGradient: {
      type: "linear", stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }],
    },
  } });
  const { command } = planMatchVectorAppearance(cadDocument, "source", ["a"], ["fill", "opacity", "strokeWidth"]);
  const preview = await previewCadCommand(command);
  assert.ok(preview.result.ok, preview.result.reason);
  assert.ok((await applyCadPlan(preview.planId)).ok);
  assert.deepEqual(storedStyle("a"), { stroke: "#0a0b0c", fill: "#abcdef", fillGradient: null, opacity: 0.4, strokeWidth: 1.3 });
  discardCadPlan(preview.planId);
});

test("rejects locked or unsupported targets and rolls back a mixed native batch", async () => {
  await execute({ type: "move-object-to-layer", objectId: "b", layerId: "blue" });
  const { command } = planMatchVectorAppearance(cadDocument, "source", ["a", "b"], ["stroke"]);
  await execute({ type: "set-layer-locked", layerId: "blue", locked: true });
  const before = serializeDocument(cadDocument);
  assert.throws(() => planMatchVectorAppearance(cadDocument, "source", ["a", "b"], ["stroke"]), /locked/);
  assert.throws(() => planMatchVectorAppearance(cadDocument, "source", ["a", "missing"], ["stroke"]), /missing/);
  const preview = await previewCadCommand(command);
  assert.equal(preview.result.ok, false);
  assert.equal(serializeDocument(cadDocument), before);
  assert.equal(storedStyle("a"), undefined);
  discardCadPlan(preview.planId);
  assert.equal(validateCommand({ type: "set-vector-style", objectId: "a", merge: true, style: { opacity: 2 } }), false);
  assert.equal(validateCommand({ type: "set-vector-style", objectId: "a", style: { stroke: "#123456" } }), false);
});

test("rejects non-XY targets and open outlines for Fill before creating a batch", async () => {
  await execute({ type: "create-drawing", id: "other-plane", drawing: "line",
    params: { workPlane: "XZ", points: [[0, 0, 0], [10, 0, 10]] } });
  await execute({ type: "create-drawing", id: "open-outline", drawing: "line",
    params: { workPlane: "XY", points: [[0, 0, 0], [10, 10, 0]] } });
  assert.throws(() => planMatchVectorAppearance(cadDocument, "source", ["a", "other-plane"], ["stroke"]), /not a supported native XY drawing/);
  assert.throws(() => planMatchVectorAppearance(cadDocument, "source", ["a", "open-outline"], ["fill"]), /closed outline/);
});

test("a document edit after Preview rejects the entire Apply", async () => {
  const { command } = planMatchVectorAppearance(cadDocument, "source", ["a", "b"], ["stroke"]);
  const preview = await previewCadCommand(command);
  await execute({ type: "set-layer-style", layerId: "blue", style: { color: "#eeaa00", lineType: "continuous", lineWeight: 0.8 } });
  const before = serializeDocument(cadDocument);
  const result = await applyCadPlan(preview.planId);
  assert.equal(result.ok, false);
  assert.match(result.reason ?? "", /document changed/i);
  assert.equal(serializeDocument(cadDocument), before);
  discardCadPlan(preview.planId);
});
