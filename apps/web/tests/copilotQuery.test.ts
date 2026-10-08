import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import type { CadCommand } from "@agent-webcad/cad-commands";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory } from "../src/state/history";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { queryCadDocument } from "../src/state/documentQuery";
import { documentVersion, notifyDocumentChanged } from "../src/state/documentSession";
import { readCopilotSelection, copilotQueryContextChange, COPILOT_QUERY_LIMITS } from "../src/copilot/copilotQuery";
import { resetTestDocument } from "./helpers/documentHarness";
import { createConstrainedChain } from "./helpers/constrainedChain";

beforeEach(resetTestDocument);
async function apply(command: CadCommand) { const result = await dispatchCadCommand(command); assert.ok(result.ok, result.reason); return result; }
const feature = (id: string) => Object.values(cadDocument.features).find(f => f.output === id)!;
const history = () => JSON.stringify({ past: cadHistory.getPastLabels(), future: cadHistory.getFutureLabels() });
const near = (a: number, b: number) => assert.ok(Math.abs(a-b) < 1e-7, `${a} ≈ ${b}`);
const circle = (id: string): CadCommand => ({ type: "create-drawing", id, drawing: "circle", params: { center: [0,0,0], radius: 10, workPlane: "XY" } });

test("Copilot reads only explicit targets, with exact units, locks and detached relationships without mutation", async () => {
  await apply(circle("circle"));
  await apply({ type: "create-drawing", id: "profile", drawing: "rectangle", params: { points: [[0,0,0],[10,0,0],[10,6,0],[0,6,0]], workPlane: "XY" } });
  await apply({ type: "create-extrude", id: "solid", profileObjectIds: ["profile"], distance: 8 });
  await createConstrainedChain(apply);
  await apply({ type: "set-layer-locked", layerId: "layer-default", locked: true });
  const before = JSON.stringify(cadDocument), labels = history();
  const result = await readCopilotSelection(["circle","solid","ab","circle"]);
  assert.deepEqual(result.objects.map(o => o.id), ["circle","solid","ab"]);
  assert.deepEqual(result.units, { length: "mm", area: "mm²", volume: "mm³", sketchAngle: "rad", rotation: "deg" });
  near(result.objects[0].measurement!.length!, 20*Math.PI); near(result.objects[0].measurement!.area!, 100*Math.PI);
  near(result.objects[1].measurement!.volume!, 480);
  assert.equal(result.objects[1].measurement!.basis, "brep");
  assert.ok(result.objects[1].sources.some(s => s.id === "profile" && s.relation === "live-input"));
  assert.equal(result.objects[2].solveGroups[0].constraintCount, 4);
  assert.ok(result.objects[2].affected.some(s => s.id === "bc"));
  assert.ok(result.objects.every(o => !o.editable && o.layer?.locked && o.editabilityReasons.some(r => r.includes("locked"))));
  assert.equal(result.byteLength, new TextEncoder().encode(JSON.stringify(result)).byteLength);
  const json = JSON.stringify(result);
  assert.ok(!json.includes('"params"') && !json.includes('"dependencyGraph"') && !json.includes('"parameterBindings"'));
  result.objects[1].sources[0].name = "Untrusted edit"; result.objects[0].measurement!.area = 0;
  assert.equal(JSON.stringify(cadDocument), before); assert.equal(history(), labels);
});

test("missing targets, missing references, annotations and unsupported measurements retain individual recovery", async () => {
  await apply(circle("ellipse"));
  cadDocument.objects.ellipse.transform = { translation: [0,0,0], rotation: [0,0,0], scale: [2,1,1] };
  await apply({ type: "create-drawing", id: "line", drawing: "line", params: { points: [[0,0,0],[30,40,0]], workPlane: "XY" } });
  await apply({ type: "create-dimension", id: "dim", dimension: "linear", params: { points: [[0,0],[30,40]], sourceObjectId: "line" } });
  feature("line").inputs = ["lost-source"];
  const before = JSON.stringify(cadDocument), labels = history();
  const result = await readCopilotSelection(["gone","ellipse","line","dim"]);
  assert.match(result.objects[0].error!, /does not exist/); assert.match(result.objects[0].recovery!, /Select an existing/);
  assert.match(result.objects[1].error!, /nonuniformly/); assert.match(result.objects[1].recovery!, /transform/);
  assert.equal(result.objects[1].measurement, undefined);
  near(result.objects[2].measurement!.length!, 50);
  assert.ok(result.objects[2].sources.some(s => s.id === "lost-source" && s.missing));
  assert.match(result.objects[2].recovery!, /reconnect/);
  assert.equal(result.objects[3].measurement, undefined); assert.match(result.objects[3].measurementNote!, /no exact/);
  assert.ok(result.objects[3].sources.some(s => s.id === "line" && s.relation === "annotation-source"));
  assert.equal(JSON.stringify(cadDocument), before); assert.equal(history(), labels);
});

test("bounded Query rejects empty, excessive or invalid selections before reading and excludes image payloads", async () => {
  let calls = 0;
  const reader: typeof queryCadDocument = async (...args) => { calls++; return queryCadDocument(...args); };
  await assert.rejects(readCopilotSelection([], { reader }), /Select an object/);
  await assert.rejects(readCopilotSelection(Array.from({length:51}, (_,i) => `id-${i}`), { reader }), /at most 50/);
  await assert.rejects(readCopilotSelection(["x".repeat(201)], { reader }), /identity/);
  await assert.rejects(readCopilotSelection(["a"], { reader, timeoutMs: Infinity }), /deadline/);
  assert.equal(calls, 0);
  await apply(circle("circle"));
  // Raster pixels cannot be cloned or exposed by a geometry/relationship read.
  const poison = new Proxy({}, { ownKeys() { throw new Error("Raster payload was traversed"); } });
  cadDocument.rasterAssets = poison as typeof cadDocument.rasterAssets;
  const result = await readCopilotSelection(["circle"], { reader });
  assert.equal(calls, 1); assert.equal(result.objects.length, 1); assert.ok(!JSON.stringify(result).includes("raster"));
});

test("relationship lists show their full count while bounding labels, identities and payload", async () => {
  await apply(circle("root"));
  const root = feature("root");
  for (let i=0; i<25; i++) {
    const id = `source-${i}`;
    cadDocument.objects[id] = { ...structuredClone(cadDocument.objects.root), id, name: "한".repeat(250) };
    cadDocument.features[`feature-${id}`] = { ...structuredClone(root), id: `feature-${id}`, output: id, inputs: [] };
    root.inputs.push(id);
  }
  cadDocument.objects.root.name = "한".repeat(250);
  const result = await readCopilotSelection(["root"]);
  assert.equal(result.objects[0].sourceCount, 25); assert.equal(result.objects[0].sources.length, 20);
  assert.equal(result.objects[0].name.length, 200); assert.equal(result.labelsShortened, true);
  assert.equal(result.objects[0].sources[0].id, "source-0"); assert.ok(result.byteLength <= COPILOT_QUERY_LIMITS.bytes);
  const raw = await queryCadDocument(["root"]);
  // Deterministic oversized DTO, using the same actual read model; no selected target may silently disappear.
  const oversized: typeof queryCadDocument = async () => ({ ...raw, objects: Array.from({length:50}, (_,i) => ({ ...raw.objects[0], id: `copy-${i}` })) });
  await assert.rejects(readCopilotSelection(["root"], { reader: oversized }), /64 KiB.*fewer objects/);
});

test("Cancel detaches a pending read immediately and late completion cannot mutate document or history", async () => {
  await apply(circle("circle")); const raw = await queryCadDocument(["circle"]);
  const before = JSON.stringify(cadDocument), labels = history(), controller = new AbortController();
  let release!: (value: typeof raw) => void, signal: AbortSignal | undefined;
  const pending = readCopilotSelection(["circle"], { signal: controller.signal, reader: async (_,options) => { signal=options?.signal; return new Promise(resolve => { release=resolve; }); } });
  controller.abort(new Error("Cancelled by user"));
  await assert.rejects(pending, /Cancelled by user/); assert.equal(signal?.aborted, true);
  release(raw); await Promise.resolve();
  assert.equal(JSON.stringify(cadDocument), before); assert.equal(history(), labels);
  let called=false;
  await assert.rejects(readCopilotSelection(["circle"], { signal: controller.signal, reader: async () => { called=true; return raw; } }), /Cancelled by user/);
  assert.equal(called, false);
});

test("deadline and document version reject late reads with actionable recovery", async () => {
  await apply(circle("circle")); const raw = await queryCadDocument(["circle"]);
  const before = JSON.stringify(cadDocument), labels = history();
  await assert.rejects(readCopilotSelection(["circle"], { timeoutMs: 5, reader: () => new Promise(() => {}) }), /timed out.*fewer objects/);
  await assert.rejects(readCopilotSelection(["circle"], { reader: async () => { notifyDocumentChanged(); return raw; } }), /document changed/);
  const latest = await queryCadDocument(["circle"]);
  await assert.rejects(readCopilotSelection(["circle"], { reader: async () => ({ ...latest, stale: true }) }), /document changed/);
  assert.equal(JSON.stringify(cadDocument), before); assert.equal(history(), labels);
});

test("context ties results to ordered selection and document generation, including same identity/revision reload", () => {
  const version = documentVersion(), saved = { version, selectionIds: ["a","b"] };
  assert.equal(copilotQueryContextChange(saved, { version, selectionIds: ["a","b"] }), undefined);
  assert.match(copilotQueryContextChange(saved, { version, selectionIds: ["b","a"] })!, /selection changed/);
  assert.match(copilotQueryContextChange(saved, { version: {...version,revision:version.revision+1}, selectionIds: ["a","b"] })!, /document changed/);
  notifyDocumentChanged();
  assert.match(copilotQueryContextChange(saved, { version: documentVersion(), selectionIds: ["a","b"] })!, /document changed/);
});
