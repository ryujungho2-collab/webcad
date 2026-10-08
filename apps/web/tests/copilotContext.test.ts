import assert from "node:assert/strict";
import { test } from "node:test";
import { captureCopilotContext, copilotContextChange, type CopilotContextInputs } from "../src/copilot/copilotContext";
import { cadDocument } from "../src/state/cadDocument";
import { resetTestDocument } from "./helpers/documentHarness";

test("Copilot request context snapshots selection and settings without borrowing mutable arrays", () => {
  resetTestDocument();
  const inputs: CopilotContextInputs = {
    version: { documentId: cadDocument.id, revision: cadDocument.revision, generation: 2 },
    selectionIds: ["selected-a"], workPlane: "XY", layerId: cadDocument.rootLayers[0],
    prompt: "Make a circle", connection: { mode: "gateway", endpoint: "/api/copilot/plan" },
  };
  const saved = captureCopilotContext(cadDocument, inputs);
  inputs.selectionIds[0] = "selected-b";
  inputs.connection.endpoint = "/api/changed";
  assert.deepEqual(saved.selectionIds, ["selected-a"]);
  assert.equal(saved.connection.endpoint, "/api/copilot/plan");
  assert.equal(saved.layerName, cadDocument.layers[saved.layerId].name);
});

test("Copilot context rejects each changed request input but ignores activity navigation", () => {
  const base: CopilotContextInputs = {
    version: { documentId: "drawing", revision: 3, generation: 8 }, selectionIds: ["a", "b"],
    workPlane: "XY", layerId: "layer-a", prompt: "Draw two circles",
    connection: { mode: "gateway", endpoint: "/api/copilot/plan" },
  };
  assert.equal(copilotContextChange(base, structuredClone(base)), undefined);
  assert.match(copilotContextChange(base, { ...base, version: { ...base.version, generation: 9 } })!, /document changed/i);
  assert.match(copilotContextChange(base, { ...base, selectionIds: ["b", "a"] })!, /selection changed/i);
  assert.match(copilotContextChange(base, { ...base, workPlane: "XZ" })!, /work plane changed/i);
  assert.match(copilotContextChange(base, { ...base, layerId: "layer-b" })!, /active layer changed/i);
  assert.match(copilotContextChange(base, { ...base, prompt: "Draw one circle" })!, /prompt changed/i);
  assert.match(copilotContextChange(base, { ...base, connection: { ...base.connection, endpoint: "/api/other" } })!, /planner settings changed/i);
  assert.match(copilotContextChange(base, { ...base, connection: { ...base.connection, mode: "rules" } })!, /planner settings changed/i);
});
