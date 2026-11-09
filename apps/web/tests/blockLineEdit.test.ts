import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { deserializeDocument, serializeDocument } from "@agent-webcad/cad-document";
import type { CadCommand } from "@agent-webcad/cad-commands";
import { validateCommand } from "@agent-webcad/cad-commands";
import { blockLineMember, editBlockLineEndpoint } from "../src/precision/blockLineEdit";
import { worldDraftingGeometry } from "../src/precision/draftingGeometry";
import { cadDocument } from "../src/state/cadDocument";
import { applyCadPlan, discardCadPlan, getCadPlanBlockLineEdit, previewCadCommand } from "../src/state/documentPlans";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { cadHistory, redoDocument, undoDocument } from "../src/state/history";
import { openDocumentFile } from "../src/state/documentFile";
import { documentState } from "./helpers/documentHarness";
import { buildBlockLineEditFixture } from "./helpers/blockLineEditFixture";

const block = () => cadDocument.blocks!["fixture-block"];
const edit = (point: [number, number] = [35, 12], memberId = "source-line") =>
  ({ type: "update-block", blockId: "fixture-block", lineEdit: { memberId, endpoint: 1, point } } as const);
const instancePoints = (id: string) => worldDraftingGeometry(cadDocument, cadDocument.objects[id],
  cadDocument.features[`feature-${id}`]).lines[0].points.map(point => point.map(value => Number(value.toFixed(8))));
let independent: string;
beforeEach(async () => { independent = await buildBlockLineEditFixture(); });

test("a reviewed definition edit preserves IDs, overrides, placements, sources and independent copies", async () => {
  const before = documentState(), count = cadHistory.getPastLabels().length;
  const canceled = await previewCadCommand(edit());
  assert.ok(canceled.result.ok, canceled.result.reason);
  assert.deepEqual(getCadPlanBlockLineEdit(canceled.planId), { before: [[0, 0], [20, 0]], after: [[0, 0], [35, 12]] });
  discardCadPlan(canceled.planId);
  assert.deepEqual(documentState(), before);
  const reviewed = await previewCadCommand(edit());
  assert.ok((await applyCadPlan(reviewed.planId)).ok);
  discardCadPlan(reviewed.planId);
  const beforeBlock = before.blocks!["fixture-block"];
  assert.equal(block().members[0].objectId, beforeBlock.members[0].objectId);
  assert.deepEqual(block().members[0].params.topology, beforeBlock.members[0].params.topology);
  assert.deepEqual(block().overrides, beforeBlock.overrides);
  assert.deepEqual(cadDocument.objects, before.objects);
  assert.deepEqual(cadDocument.features, before.features);
  assert.ok(cadDocument.objects[independent]);
  assert.deepEqual(instancePoints("linked-a"), [[100, 0, 0], [135, 12, 0]]);
  assert.deepEqual(instancePoints("linked-b"), [[200, 10, 0], [188, 45, 0]]);
  assert.equal(cadHistory.getPastLabels().length, count + 1);
  const after = documentState(), serialized = serializeDocument(cadDocument);
  assert.deepEqual(deserializeDocument(serialized).blocks, cadDocument.blocks);
  undoDocument();
  assert.deepEqual(documentState(), before);
  redoDocument();
  assert.deepEqual(documentState(), after);
});

test("block-local edits compensate for a rotated and scaled member pivot", () => {
  const definition = structuredClone(block());
  definition.members[0].transform.rotation = [0, 0, 90];
  definition.members[0].transform.scale = [2, 3, 1];
  const line = blockLineMember(definition, "source-line")!;
  const next = editBlockLineEndpoint(definition, { memberId: "source-line", endpoint: 0, point: [7, -15] });
  const revised = blockLineMember(next, "source-line")!;
  for (const [actual, expected] of [[revised.points[0], [7, -15]], [revised.points[1], line.points[1]]] as const) {
    assert.ok(Math.hypot(actual[0] - expected[0], actual[1] - expected[1]) < 1e-8);
  }
  assert.deepEqual(revised.member.transform.rotation, line.member.transform.rotation);
  assert.deepEqual(revised.member.transform.scale, line.member.transform.scale);
});

test("invalid targets, coincident endpoints and mixed update modes reject without changes", async () => {
  const before = serializeDocument(cadDocument), history = cadHistory.getStateToken();
  assert.match((await dispatchCadCommand(edit([0, 0]))).reason!, /distinct/);
  assert.match((await dispatchCadCommand(edit([20, 0]))).reason!, /different endpoint/);
  assert.match((await dispatchCadCommand(edit([35, 12], "gone"))).reason!, /missing/);
  assert.match((await dispatchCadCommand({ ...edit(), blockId: "gone" })).reason!, /no longer exists/);
  assert.equal(validateCommand({ ...edit(), name: "Mixed" } satisfies CadCommand), false);
  const duplicate = structuredClone(block());
  duplicate.members.push(structuredClone(duplicate.members[0]));
  assert.throws(() => editBlockLineEndpoint(duplicate, edit().lineEdit), /ambiguous/);
  assert.equal(serializeDocument(cadDocument), before);
  assert.equal(cadHistory.getStateToken(), history);
});

test("a change or same-ID file reopen invalidates an earlier review", async () => {
  const reviewed = await previewCadCommand(edit());
  assert.ok((await dispatchCadCommand({ type: "update-block", blockId: "fixture-block", name: "Renamed" })).ok);
  assert.match((await applyCadPlan(reviewed.planId)).reason!, /changed/);
  discardCadPlan(reviewed.planId);
  const reopened = await previewCadCommand(edit());
  await openDocumentFile(new File([serializeDocument(cadDocument)], "component.webcad.json"));
  assert.match((await applyCadPlan(reopened.planId)).reason!, /changed/);
  discardCadPlan(reopened.planId);
  assert.deepEqual(blockLineMember(block(), "source-line")?.points, [[0, 0], [20, 0]]);
});
