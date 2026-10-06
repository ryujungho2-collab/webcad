import { restoreTestDocument as restore, resetTestDocument, documentState } from "./helpers/documentHarness";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { validateCommand } from "@agent-webcad/cad-commands";
import type { SketchLoop } from "../src/precision/sketchProfiles";
import { APARTMENT_PRESET, HOUSE_PRESET, planBuilding } from "../src/architecture/buildingGenerator";
import { withCopilotLayer } from "../src/copilot/copilotPlan";
import { extractSketchLoops } from "../src/precision/sketchProfiles";
import { cadDocument } from "../src/state/cadDocument";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { cadHistory, undoDocument, redoDocument } from "../src/state/history";

function rectLoop(size: number): SketchLoop {
  const points: [number, number, number][] = [
    [0, 0, 0], [size, 0, 0], [size, size, 0], [0, size, 0],
  ];
  return {
    id: "test-loop",
    workPlane: "XY",
    normal: [0, 0, 1],
    segments: points.map((start, index) => ({
      kind: "line" as const,
      topologyReference: `test/edge:${index}`,
      start,
      end: points[(index + 1) % points.length],
    })),
    sourceObjectIds: ["test"],
    sourceTopologyIds: [],
  };
}

describe("building planner", () => {
  test("house plan validates with deterministic unique ids", () => {
    const planned = planBuilding(rectLoop(6000), HOUSE_PRESET, "test");
    assert.equal(planned.ok, true);
    if (!planned.ok) return;
    assert.equal(validateCommand(planned.command), true);
    assert.ok(planned.summary.length > 5);
    const ids = new Set<string>();
    const collect = (command: unknown) => {
      if (typeof command !== "object" || command === null) return;
      const record = command as Record<string, unknown>;
      if (typeof record.id === "string") {
        assert.ok(!ids.has(record.id), `duplicate id ${record.id}`);
        ids.add(record.id);
      }
      if (record.type === "batch" && Array.isArray(record.commands)) record.commands.forEach(collect);
      if (Array.isArray(record.profileObjectIds)) record.profileObjectIds.forEach((entry) => assert.equal(typeof entry, "string"));
    };
    collect(planned.command);
    assert.ok(ids.size > 10);
  });

  test("apartment preset plans a flat roof with parapet", () => {
    const planned = planBuilding(rectLoop(12000), APARTMENT_PRESET, "test");
    assert.equal(planned.ok, true);
    if (!planned.ok) return;
    assert.equal(validateCommand(planned.command), true);
    assert.ok(planned.summary.some((line) => line.includes("Flat roof")));
  });

  test("rejects arcs, non-XY planes and bad presets", () => {
    const loop = rectLoop(6000);
    const arcLoop: SketchLoop = {
      ...loop,
      segments: [{ kind: "circle", topologyReference: "test/curve:0", center: [0, 0, 0], radius: 100, normal: [0, 0, 1], xAxis: [1, 0, 0] }],
    };
    assert.equal(planBuilding(arcLoop, HOUSE_PRESET, "test").ok, false);
    assert.equal(planBuilding({ ...loop, workPlane: "XZ" }, HOUSE_PRESET, "test").ok, false);
    assert.equal(planBuilding(loop, { ...HOUSE_PRESET, floors: 0 }, "test").ok, false);
    assert.equal(planBuilding(loop, { ...HOUSE_PRESET, wallThickness: 0 }, "test").ok, false);
  });
});

describe("building apply path", () => {
  const original = structuredClone(cadDocument);
  beforeEach(resetTestDocument);
  afterEach(() => { restore(original); cadHistory.clear(); });

  test("one-floor house builds walls, slab, openings and roof as one history entry", async () => {
    const created = await dispatchCadCommand({ type: "create-drawing", id: "footprint", drawing: "rectangle",
      params: { workPlane: "XY", points: [[0, 0, 0], [6000, 0, 0], [6000, 6000, 0], [0, 6000, 0]] } });
    assert.equal(created.ok, true, created.reason);
    const loops = extractSketchLoops(cadDocument, ["footprint"]);
    assert.equal(loops.ok, true);
    if (!loops.ok) assert.fail(loops.reason);
    const planned = planBuilding(loops.loops[0], { ...HOUSE_PRESET, floors: 1 }, "house-test");
    assert.equal(planned.ok, true);
    if (!planned.ok) assert.fail(planned.reason);
    const before = documentState();
    cadHistory.clear();
    const result = await dispatchCadCommand(withCopilotLayer(planned.command, "layer-default"));
    assert.equal(result.ok, true, result.reason);
    assert.equal(cadHistory.getPastLabels().length, 1);
    assert.ok(cadDocument.objects.footprint);
    const features = Object.values(cadDocument.features);
    assert.ok(features.some(feature => feature.type === "extrude"), "walls and roof retain their extrusion sources");
    assert.ok(features.some(feature => feature.type === "boolean" && feature.params.operation === "cut"), "openings are real boolean cuts");
    for (const feature of features.filter(feature => feature.dependencyMode === "live")) {
      assert.ok(feature.inputs.every(id => cadDocument.objects[id]), `live inputs exist for ${feature.output}`);
    }
    const after = documentState();
    assert.ok(undoDocument()); assert.deepEqual(documentState(), before);
    assert.ok(redoDocument()); assert.deepEqual(documentState(), after);
  });
});
