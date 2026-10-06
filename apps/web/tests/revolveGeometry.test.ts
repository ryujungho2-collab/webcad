import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory } from "../src/state/history";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { extractSketchLoops } from "../src/precision/sketchProfiles";
import { buildRevolveMesh } from "../src/cad/kernelGeometryService";
import { assertMeshBounds, meshVolume, resetTestDocument, restoreTestDocument } from "./helpers/documentHarness";

const original = structuredClone(cadDocument);
beforeEach(resetTestDocument);
afterEach(() => { restoreTestDocument(original); cadHistory.clear(); });

test("XZ profile revolution about the local x axis has the specified length and radius", async () => {
  const created = await dispatchCadCommand({ type: "create-drawing", id: "profile", drawing: "rectangle",
    params: { workPlane: "XZ", points: [[20, 0, 0], [30, 0, 0], [30, 0, 10], [20, 0, 10]] } });
  assert.equal(created.ok, true, created.reason);
  const loops = extractSketchLoops(cadDocument, ["profile"]);
  assert.equal(loops.ok, true);
  if (!loops.ok) assert.fail(loops.reason);
  assert.equal(loops.loops.length, 1);
  assert.equal(loops.loops[0].workPlane, "XZ");
  const revolved = await dispatchCadCommand({ type: "create-revolve", id: "wheel", profileObjectIds: ["profile"], axis: "x", angle: 360 });
  assert.equal(revolved.ok, true, revolved.reason);
  const mesh = await buildRevolveMesh(cadDocument.features["feature-wheel"].params);
  assertMeshBounds(mesh, [20, -10, -10], [30, 10, 10], 0.11);
  assert.ok(Math.abs(meshVolume(mesh) / (Math.PI * 10 * 10 * 10) - 1) < 0.02);
});
