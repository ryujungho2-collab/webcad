import { restoreTestDocument as restore, resetTestDocument, documentState, assertMeshBounds } from "./helpers/documentHarness";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { validateCommand } from "@agent-webcad/cad-commands";
import { planCopilotCommand, withCopilotLayer, type CopilotGhost } from "../src/copilot/copilotPlan";
import { cadDocument } from "../src/state/cadDocument";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { cadHistory, undoDocument, redoDocument } from "../src/state/history";
import { buildExtrudeMesh } from "../src/cad/kernelGeometryService";

function primitiveGhosts(result: { ok: true; plan: { ghosts: CopilotGhost[] } }) {
  const ghosts = result.plan.ghosts.filter((ghost): ghost is Extract<CopilotGhost, { kind: "primitive" }> => ghost.kind === "primitive");
  assert.equal(ghosts.length, result.plan.ghosts.length);
  return ghosts;
}

describe("copilot rule planner", () => {
  test("parses Korean box dimensions with count", () => {
    const result = planCopilotCommand("100x50x30 박스 3개");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const ghosts = primitiveGhosts(result);
    assert.equal(ghosts.length, 3);
    assert.deepEqual(ghosts[0].params, { width: 100, depth: 50, height: 30 });
    assert.deepEqual(ghosts[2].position, [40, 0, 0]);
    assert.equal(result.plan.command.type, "batch");
    assert.ok(validateCommand(result.plan.command));
    assert.equal(result.plan.summary.length, 3);
  });

  test("parses English box shorthand", () => {
    const result = planCopilotCommand("10x10x10 box x3");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const ghosts = primitiveGhosts(result);
    assert.equal(ghosts.length, 3);
    assert.deepEqual(ghosts[0].params, { width: 10, depth: 10, height: 10 });
  });

  test("single cylinder keeps a single create command", () => {
    const result = planCopilotCommand("반지름 5 높이 20 원기둥");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.plan.command.type, "create-primitive");
    const ghosts = primitiveGhosts(result);
    assert.deepEqual(ghosts[0].params, { radius: 5, height: 20 });
    assert.equal(ghosts.length, 1);
  });

  test("diameter halves into radius", () => {
    const result = planCopilotCommand("지름 10 구");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(primitiveGhosts(result)[0].params, { radius: 5 });
  });

  test("custom spacing applies along X", () => {
    const result = planCopilotCommand("박스 2개 간격 50");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(primitiveGhosts(result)[1].position, [50, 0, 0]);
  });

  test("defaults apply when dimensions are absent", () => {
    const result = planCopilotCommand("박스 만들어줘");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(primitiveGhosts(result)[0].params, { width: 10, depth: 10, height: 10 });
  });

  test("unknown shape rejects with a hint", () => {
    const result = planCopilotCommand("나선 계단 만들어줘");
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.reason, /box\/cylinder/);
  });

  test("empty prompt rejects", () => {
    assert.equal(planCopilotCommand("   ").ok, false);
  });

  test("every planned command validates", () => {
    for (const input of ["박스", "원기둥 2개", "sphere", "토러스 3개 간격 30", "50x20x10 상자", "100x50 사각형", "반지름 10 원 돌출 15", "100x50 rectangle extrude 20"]) {
      const result = planCopilotCommand(input);
      assert.equal(result.ok, true, input);
      if (result.ok) assert.equal(validateCommand(result.plan.command), true);
    }
  });

  test("rectangle profile plans one drawing without extrude", () => {
    const result = planCopilotCommand("100x50 사각형");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.plan.command.type, "create-drawing");
    assert.equal(result.plan.ghosts.length, 1);
    const ghost = result.plan.ghosts[0];
    assert.equal(ghost.kind, "drawing");
    if (ghost.kind !== "drawing") return;
    assert.equal(ghost.drawing, "rectangle");
    assert.equal(ghost.params.workPlane, "XY");
    assert.equal((ghost.params.points as unknown[]).length, 4);
  });

  test("rectangle extrude plans linked drawing+extrude batch", () => {
    const result = planCopilotCommand("100x50 사각형 돌출 20");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.plan.command.type, "batch");
    assert.equal(result.plan.ghosts.length, 2);
    const [drawingGhost, extrudeGhost] = result.plan.ghosts;
    assert.equal(drawingGhost.kind, "drawing");
    assert.equal(extrudeGhost.kind, "extrude");
    if (extrudeGhost.kind !== "extrude") return;
    assert.equal(extrudeGhost.distance, 20);
    assert.equal(extrudeGhost.profile.segments.length, 4);
    // Batch links extrude to the planner-assigned profile id.
    const command = result.plan.command;
    assert.equal(command.type, "batch");
    if (command.type !== "batch") return;
    const drawing = command.commands[0];
    const extrude = command.commands[1];
    assert.equal(drawing.type, "create-drawing");
    assert.equal(extrude.type, "create-extrude");
    if (drawing.type !== "create-drawing" || extrude.type !== "create-extrude") return;
    assert.deepEqual(extrude.profileObjectIds, [drawing.id]);
    assert.equal(extrude.distance, 20);
  });

  test("circle extrude respects work plane and radius", () => {
    const result = planCopilotCommand("XZ 평면에 지름 20 원 돌출 15");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const drawingGhost = result.plan.ghosts[0];
    assert.equal(drawingGhost.kind, "drawing");
    if (drawingGhost.kind !== "drawing") return;
    assert.equal(drawingGhost.params.workPlane, "XZ");
    assert.equal(drawingGhost.params.radius, 10);
    const extrudeGhost = result.plan.ghosts[1];
    assert.ok(extrudeGhost.kind === "extrude" && extrudeGhost.distance === 15);
  });

  test("solid primitive with extrude keyword rejects with guidance", () => {
    const result = planCopilotCommand("박스 돌출 20");
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.reason, /already a solid/);
  });

  test("circle without radius rejects", () => {
    // “원” alone carries no number: the bare-number fallback needs exactly one.
    assert.equal(planCopilotCommand("원 돌출").ok, false);
  });

  test("layer injection binds the active layer without touching params", () => {
    const single = planCopilotCommand("박스");
    assert.equal(single.ok, true);
    if (!single.ok) return;
    const bound = withCopilotLayer(single.plan.command, "layer-a");
    assert.equal(validateCommand(bound), true);
    assert.equal((bound as { layerId?: string }).layerId, "layer-a");

    const batch = planCopilotCommand("박스 2개");
    assert.equal(batch.ok, true);
    if (!batch.ok) return;
    const boundBatch = withCopilotLayer(batch.plan.command, "layer-b");
    assert.equal(validateCommand(boundBatch), true);
    assert.ok(
      boundBatch.type === "batch" &&
      boundBatch.commands.every((entry) => (entry as { layerId?: string }).layerId === "layer-b"),
    );
  });
});

describe("copilot extrude apply path", () => {
  const original = structuredClone(cadDocument);
  beforeEach(resetTestDocument);
  afterEach(() => { restore(original); cadHistory.clear(); });

  test("ghost and committed rectangle extrusion both have the requested dimensions", async () => {
    const planned = planCopilotCommand("100x50 사각형 돌출 20");
    assert.equal(planned.ok, true);
    if (!planned.ok) assert.fail(planned.reason);
    const ghost = planned.plan.ghosts.find(entry => entry.kind === "extrude");
    assert.ok(ghost && ghost.kind === "extrude");
    assertMeshBounds(await buildExtrudeMesh({ kind: "extrude", profile: ghost.profile, distance: ghost.distance }), [0, 0, 0], [100, 50, 20]);
    const before = documentState();
    const result = await dispatchCadCommand(withCopilotLayer(planned.plan.command, "layer-default"));
    assert.equal(result.ok, true, result.reason);
    assert.equal(result.createdIds.length, 2);
    assert.equal(cadHistory.getPastLabels().length, 1);
    const solid = Object.values(cadDocument.features).find(feature => feature.type === "extrude")!;
    assertMeshBounds(await buildExtrudeMesh(solid.params), [0, 0, 0], [100, 50, 20]);
    assert.ok(solid.inputs.every(id => cadDocument.objects[id]));
    const after = documentState();
    assert.ok(undoDocument()); assert.deepEqual(documentState(), before);
    assert.ok(redoDocument()); assert.deepEqual(documentState(), after);
  });

  test("circle extrusion applies on the requested plane as one complete transaction", async () => {
    const planned = planCopilotCommand("XZ 평면에 지름 20 원 돌출 15");
    assert.equal(planned.ok, true);
    if (!planned.ok) assert.fail(planned.reason);
    const result = await dispatchCadCommand(withCopilotLayer(planned.plan.command, "layer-default"));
    assert.equal(result.ok, true, result.reason);
    assert.equal(result.createdIds.length, 2);
    assert.ok(result.createdIds.every(id => cadDocument.objects[id]?.visible));
    assert.equal(cadHistory.getPastLabels().length, 1);
    const solid = Object.values(cadDocument.features).find(feature => feature.type === "extrude")!;
    const profile = solid.params.profile as { workPlane: string; segments: { radius: number }[] };
    assert.equal(profile.workPlane, "XZ");
    assert.equal(profile.segments[0].radius, 10);
    assertMeshBounds(await buildExtrudeMesh(solid.params), [-10, -15, -10], [10, 0, 10], 0.11);
  });
});
