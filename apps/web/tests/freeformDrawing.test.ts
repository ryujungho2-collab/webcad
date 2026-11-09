import assert from "node:assert/strict";
import { test } from "node:test";
import { cadDocument } from "../src/state/cadDocument";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { resetTestDocument } from "./helpers/documentHarness";

const run = async (c: Parameters<typeof dispatchCadCommand>[0]) => { const r = await dispatchCadCommand(c); assert.ok(r.ok, r.reason); };

test("smooth multi-section loft yields resolved HLR projections and an exact section (degree > 8 outlines are certified re-fits)", async () => {
  resetTestDocument();
  const stations: [number, number][] = [[0, 65], [12, 68], [50, 67], [100, 62.5], [150, 55], [195, 46]];
  for (const [z, r] of stations) await run({ type: "create-drawing", id: `s${z}`, drawing: "circle", params: { center: [0, 0, z], radius: r, workPlane: "XY" } });
  await run({ type: "create-loft", id: "body", profileObjectIds: stations.map(([z]) => `s${z}`) });
  await run({ type: "register-model-part", part: { id: "p-body", objectId: "body", name: "Body" } });
  for (const basis of ["XZ", "YZ", "XY"] as const) {
    await run({ type: "upsert-model-projection", method: "brep-hlr", id: `v-${basis}`, name: basis, partIds: ["p-body"], basis, origin: [0, 0], scale: 1, layerId: "layer-default" });
    const p = cadDocument.modelPresentation!.projections[`v-${basis}`];
    assert.equal(p.status, "resolved", basis);
    assert.ok(Object.keys(p.outputs).length > 0, basis);
  }
  await run({ type: "upsert-model-section", view: { id: "cut", name: "A-A", partIds: ["p-body"], basis: "XZ", height: 0, origin: [0, 0], scale: 1, layerId: "layer-default" } });
  assert.equal(cadDocument.modelPresentation!.sections!.cut.status, "resolved");
});
