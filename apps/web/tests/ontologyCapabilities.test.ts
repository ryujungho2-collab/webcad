import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeEach, test } from "node:test";
import { CommandBus, type CadCommand } from "@agent-webcad/cad-commands";
import { CAD_TOOLS, type CadToolCall } from "../src/copilot/cadToolContract";
import { createCadToolSession } from "../src/copilot/cadToolSession";
import { copilotSolidContract } from "../src/copilot/copilotSolid";
import { createPaletteCommands } from "../src/commands/paletteCommands";
import type { AppShellProps } from "../src/app/AppShell";
import { routeCadShortcut, routeHistoryShortcut, type CadShortcutContext } from "../src/input/shortcutRouter";
import { cadDocument } from "../src/state/cadDocument";
import { clipboardPasteCommand, copyDrawingClipboard } from "../src/state/cadPilotCommands";
import { createDocumentCommandExecutor } from "../src/state/commandBus";
import { planDimensionFromSelection } from "../src/state/dimensionCommands";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { applyCadPlan, discardCadPlan, previewCadCommand } from "../src/state/documentPlans";
import { redoDocument, undoDocument } from "../src/state/history";
import {
  AUTOCAD_SHORTCUT_MAPPINGS, CAPABILITIES, CAPABILITY_UPDATES, candidateCapabilitiesForObject, capabilityInventory, documentObjectBridge, getCapability,
  type CapabilityRecord,
} from "../src/ontology/capabilities";
import { documentState, resetTestDocument } from "./helpers/documentHarness";

const root = resolve(import.meta.dirname, "../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const record = (id: string) => getCapability(id)!;
const call = (name: CadToolCall["name"], args: Record<string, unknown>): CadToolCall => ({ id: crypto.randomUUID(), name, arguments: args });
const ctx = (selectionIds: string[] = []) => ({ document: cadDocument, selectionIds, layerId: "layer-default", workPlane: "XY" as const });
const leafTypes = (command: CadCommand): string[] => command.type === "batch" ? command.commands.flatMap(leafTypes) : [command.type];
const assertCovered = (capability: CapabilityRecord, command: CadCommand) => {
  for (const type of leafTypes(command)) assert.ok((capability.commandTypes as string[]).includes(type), `${capability.id} does not list emitted command ${type}`);
};
const apply = async (command: CadCommand) => { const result = await dispatchCadCommand(command); assert.ok(result.ok, result.reason); return result; };
const line = (id: string, points: number[][] = [[0, 0, 0], [10, 0, 0]]): CadCommand =>
  ({ type: "create-drawing", id, drawing: "line", params: { workPlane: "XY", points }, layerId: "layer-default" });
const rectangle = (id: string): CadCommand =>
  ({ type: "create-drawing", id, drawing: "rectangle", params: { workPlane: "XY", points: [[0, 0, 0], [40, 0, 0], [40, 20, 0], [0, 20, 0]], closed: true }, layerId: "layer-default" });

beforeEach(resetTestDocument);

// ── 1. The 120-item mapping reproduces the source table exactly ──────────────

test("120 AutoCAD items: numbering, inputs and verdicts match AUTOCAD-SHORTCUT-COVERAGE-2026-11-05.md", () => {
  const verdicts: Record<string, string> = { "같은 조작": "same-input", "다른 조작": "different-input", "부분 지원": "partial", "미확인": "unconfirmed" };
  const rows = [...read("docs/verification/AUTOCAD-SHORTCUT-COVERAGE-2026-11-05.md").matchAll(/^\| (\d{3}) \| `([^`]+)` \| ([^|]+?) \|/gm)]
    .map(match => ({ no: Number(match[1]), input: match[2], verdict: verdicts[match[3].trim()] }));
  assert.equal(rows.length, 120);
  assert.deepEqual(AUTOCAD_SHORTCUT_MAPPINGS.map(item => item.no), Array.from({ length: 120 }, (_, i) => i + 1));
  for (const row of rows) {
    const item = AUTOCAD_SHORTCUT_MAPPINGS[row.no - 1];
    assert.equal(item.autocadInput, row.input, `item ${row.no} input`);
    assert.equal(item.verdict, row.verdict, `item ${row.no} verdict`);
  }
  const totals = capabilityInventory().summary.shortcutVerdicts;
  assert.deepEqual(totals, { "same-input": 16, "different-input": 50, partial: 31, unconfirmed: 23 });
});

test("capability records are unique, every item resolves, and only dated capability updates advance beyond the historical audit", () => {
  assert.equal(new Set(CAPABILITIES.map(c => c.id)).size, CAPABILITIES.length);
  for (const item of AUTOCAD_SHORTCUT_MAPPINGS) {
    assert.ok(item.capabilityIds.length, `item ${item.no} has no capability`);
    for (const id of item.capabilityIds) assert.ok(getCapability(id), `item ${item.no} → unknown ${id}`);
    if (item.verdict === "unconfirmed") for (const id of item.capabilityIds) {
      if ([97, 98].includes(item.no)) { assert.equal(id, "layer-isolate"); assert.equal(record(id).support, "supported"); }
      else if (item.no === 38) { assert.equal(id, "match-properties"); assert.equal(record(id).support, "supported"); }
      else if (item.no === 89) { assert.equal(id, "general-draw-order"); assert.equal(record(id).support, "supported"); }
      else if (item.no === 106) { assert.equal(id, "block-editor-session"); assert.equal(record(id).support, "partial"); }
      else assert.equal(record(id).support, "unconfirmed", `item ${item.no} must not be promoted`);
    }
  }
  const used = new Set(AUTOCAD_SHORTCUT_MAPPINGS.flatMap(item => item.capabilityIds));
  const extra = CAPABILITIES.filter(c => !used.has(c.id)).map(c => c.id).sort();
  assert.deepEqual(extra, ["driving-dimension-edit", "extrude", "profile-extrude-relations"], "only explicitly scoped capabilities sit outside the 120 items");
});

test("executor, command and support fields are mutually consistent", () => {
  for (const c of CAPABILITIES) {
    if (c.executor === "command-bus") assert.ok(c.commandTypes.length, `${c.id}: command-bus without command types`);
    if (c.executor === "history" || c.executor === "read-only" || c.executor === "none") assert.deepEqual(c.commandTypes, [], `${c.id}: ${c.executor} lists commands`);
    if (c.executor === "none") { assert.deepEqual(c.mcpTools, [], c.id); assert.ok(["unconfirmed", "unsupported"].includes(c.support), c.id); }
    if (c.support === "unconfirmed") assert.deepEqual([c.commandTypes, c.mcpTools], [[], []], `${c.id}: unconfirmed capability claims an execution path`);
  }
});

test("profile and Extrude relationship inspection declares only its implemented read paths", () => {
  const capability = record("profile-extrude-relations");
  assert.equal(capability.kind, "inspection");
  assert.equal(capability.executor, "read-only");
  assert.equal(capability.support, "supported");
  assert.deepEqual(capability.commandTypes, []);
  assert.deepEqual(capability.mcpTools, []);
  assert.ok(capability.ui.surfaces.some(surface => surface.includes("Download relation JSON")));
});

// ── 2. Every reference resolves against the authoritative contracts ──────────

test("every command type is accepted by validateCommand's switch and has a registered CommandBus handler", () => {
  const validator = read("packages/cad-commands/src/validator.ts");
  const registered = new Set<string>();
  const original = CommandBus.prototype.registerHandler;
  CommandBus.prototype.registerHandler = function (type, handler) { registered.add(type); return original.call(this, type, handler); };
  try { createDocumentCommandExecutor(structuredClone(cadDocument)); } finally { CommandBus.prototype.registerHandler = original; }
  for (const type of new Set(CAPABILITIES.flatMap(c => c.commandTypes))) {
    assert.match(validator, new RegExp(`case ["']${type}["']`), `validator has no case for ${type}`);
    assert.ok(registered.has(type), `no CommandBus handler registered for ${type}`);
  }
});

test("MCP tools exist in CAD_TOOLS and their readOnly flag matches the capability kind", () => {
  for (const c of CAPABILITIES) for (const tool of c.mcpTools) {
    assert.ok(Object.hasOwn(CAD_TOOLS, tool), `${c.id}: unknown tool ${tool}`);
    if (c.kind === "inspection") assert.equal(CAD_TOOLS[tool].readOnly, true, `${c.id}: ${tool} must be read-only`);
    if (c.kind === "document-edit") assert.equal(CAD_TOOLS[tool].readOnly, false, `${c.id}: ${tool} must be a modeling tool`);
  }
  assert.ok(!Object.keys(CAD_TOOLS).some(name => /undo|redo/i.test(name)), "Undo/Redo stay outside the MCP contract");
});

test("palette IDs exist in createPaletteCommands and shortcut actions are reachable through the routers", () => {
  const props = new Proxy({ selectedObjectIds: ["x"], workspaceMode: "2d", canCreateBox: true, canUndo: true, canRedo: true } as Record<string, unknown>,
    { get: (target, key) => typeof key === "string" && !(key in target) && /^on[A-Z]/.test(key) ? () => {} : target[key as string] }) as unknown as AppShellProps;
  const palette = new Set(createPaletteCommands(props, { toggleExplorer() {}, toggleProperties() {}, inspectSelection() {}, openActivity() {} }).map(c => c.id));
  for (const c of CAPABILITIES) for (const id of c.ui.paletteIds) assert.ok(palette.has(id), `${c.id}: palette ${id} missing`);
  const open: CadShortcutContext = { workspaceMode: "2d", hasSelection: true, selectionEditable: true, activeLayerLocked: false, canOffset: true, canTrim: true, canExtrude: true };
  const reachable = new Set<string>();
  for (const key of "abcdefghijklmnopqrstuvwxyz") for (const shiftKey of [false, true]) {
    const action = routeCadShortcut(key, open, { shiftKey });
    if (action) reachable.add(action);
  }
  const history = (key: string, shiftKey = false) => routeHistoryShortcut({ key, ctrlKey: true, metaKey: false, altKey: false, shiftKey, defaultPrevented: false });
  for (const action of [history("z"), history("y"), history("z", true)]) if (action) reachable.add(action);
  for (const c of CAPABILITIES) for (const action of c.ui.shortcutActions) assert.ok(reachable.has(action), `${c.id}: action ${action} unreachable`);
});

test("evidence and prior-verification files exist and contain their symbols", () => {
  for (const c of CAPABILITIES) {
    for (const e of c.evidence) {
      assert.ok(existsSync(resolve(root, e.file)), `${c.id}: missing ${e.file}`);
      if (e.symbol) assert.ok(read(e.file).includes(e.symbol), `${c.id}: ${e.file} lacks ${e.symbol}`);
    }
    for (const p of c.priorVerification) assert.ok(existsSync(resolve(root, p.file)), `${c.id}: missing ${p.file}`);
  }
});

// ── 3. Representative capabilities: the real contracts, run on in-memory documents ──

test("2D create: key route, UI command and MCP plan all use create-drawing; invalid input is rejected", async () => {
  const capability = record("draw-2d-curve");
  const context: CadShortcutContext = { workspaceMode: "2d", hasSelection: false, selectionEditable: false, activeLayerLocked: false, canOffset: false, canTrim: false, canExtrude: false };
  assert.equal(routeCadShortcut("l", context), "line");
  assert.equal(routeCadShortcut("l", { ...context, activeLayerLocked: true }), null, "locked active layer blocks drawing keys");
  assert.equal(routeCadShortcut("l", { ...context, workspaceMode: "3d" }), null, "drawing keys are 2D only");

  const before = documentState();
  const preview = await previewCadCommand(line("ui-line"));
  assert.ok(preview.result.ok, preview.result.reason);
  assert.deepEqual(documentState(), before, "Preview never publishes");
  discardCadPlan(preview.planId);

  const plan = await createCadToolSession(ctx()).plan([call("curve.polyline", { id: "mcp-line", plane: "XY", points: [[0, 0, 0], [5, 5, 0]], closed: false })]);
  assertCovered(capability, plan.command);
  const mcpPreview = await previewCadCommand(plan.command);
  assert.ok(mcpPreview.result.ok, mcpPreview.result.reason);
  discardCadPlan(mcpPreview.planId);
  await assert.rejects(createCadToolSession(ctx()).plan([call("curve.polyline", { id: "bent", plane: "XY", points: [[0, 0, 0], [1, 0, 1]], closed: false })]), /plane/);
});

test("move: UI move-object and MCP scene.objects; unselected existing objects are refused", async () => {
  const capability = record("move");
  await apply(line("a"));
  const preview = await previewCadCommand({ type: "move-object", objectId: "a", translation: [5, 0, 0] });
  assert.ok(preview.result.ok, preview.result.reason);
  discardCadPlan(preview.planId);
  const plan = await createCadToolSession(ctx(["a"])).plan([call("scene.objects", { objects: [{ objectId: "a", delta: [0, 7, 0] }], layerId: "layer-default", visible: true })]);
  assertCovered(capability, plan.command);
  const review = await previewCadCommand(plan.command);
  assert.ok(review.result.ok, review.result.reason);
  assert.ok((await applyCadPlan(review.planId)).ok);
  assert.equal(cadDocument.objects.a.transform?.translation[1], 7);
  await assert.rejects(createCadToolSession(ctx([])).plan([call("scene.objects", { objects: [{ objectId: "a", delta: [1, 0, 0] }], layerId: "layer-default", visible: true })]));
});

test("base-point copy/paste: independent drawings only, same document only, independent results", async () => {
  const capability = record("base-point-clipboard");
  await apply(line("src", [[0, 0, 0], [10, 0, 0]]));
  await apply(line("other", [[0, 5, 0], [10, 5, 0]]));

  const dependent = structuredClone(cadDocument);
  Object.values(dependent.features).find(f => f.output === "src")!.inputs = ["other"];
  assert.throws(() => copyDrawingClipboard(dependent, ["src"], [0, 0, 0]), /independent finite drawings/);
  const sketchOwned = structuredClone(cadDocument);
  Object.values(sketchOwned.features).find(f => f.output === "src")!.params.sketchId = "s";
  assert.throws(() => copyDrawingClipboard(sketchOwned, ["src"], [0, 0, 0]), /independent finite drawings/);
  assert.throws(() => copyDrawingClipboard(cadDocument, [], [0, 0, 0]), /1–64/);

  copyDrawingClipboard(cadDocument, ["src"], [0, 0, 0]);
  assert.throws(() => clipboardPasteCommand({ ...structuredClone(cadDocument), id: "another-document" }, [0, 0, 0]), /same document/);
  const foreign = { ...clipboardPasteCommand(cadDocument, [100, 0, 0]), sourceDocumentId: "another-document" } as CadCommand;
  const refused = await previewCadCommand(foreign);
  assert.equal(refused.result.ok, false, "the handler also enforces the source document");

  const paste = clipboardPasteCommand(cadDocument, [100, 0, 0]);
  assertCovered(capability, paste);
  const before = structuredClone(cadDocument.features);
  const review = await previewCadCommand(paste);
  assert.ok(review.result.ok, review.result.reason);
  assert.ok((await applyCadPlan(review.planId)).ok);
  const created = Object.keys(cadDocument.objects).filter(id => id.startsWith("paste-"));
  assert.equal(created.length, 1);
  const copy = Object.values(cadDocument.features).find(f => f.output === created[0])!;
  assert.deepEqual(copy.inputs, [], "pasted drawing is independent");
  assert.equal(cadDocument.objects[created[0]].transform?.translation[0], 100);
  assert.deepEqual(Object.values(cadDocument.features).filter(f => f.output === "src"), Object.values(before).filter(f => f.output === "src"), "source untouched");
});

test("dimension change: annotation create-dimension and driving solid.parameter stay inside their declared commands", async () => {
  await apply(line("measured", [[0, 0, 0], [30, 0, 0]]));
  const annotation = planDimensionFromSelection(cadDocument, "measured");
  assert.ok(annotation);
  assertCovered(record("dimension-annotation"), annotation as CadCommand);
  const review = await previewCadCommand(annotation as CadCommand);
  assert.ok(review.result.ok, review.result.reason);
  discardCadPlan(review.planId);

  const box = await createCadToolSession(ctx()).plan([call("solid.primitive", { id: "box", primitive: "box", params: { width: 10, depth: 10, height: 10 }, position: [0, 0, 0] })]);
  const boxReview = await previewCadCommand(box.command);
  assert.ok((await applyCadPlan(boxReview.planId)).ok);
  const parameter = copilotSolidContract(cadDocument, ["box"]).parameters[0];
  assert.ok(parameter, "box exposes a driving parameter");
  const plan = await createCadToolSession(ctx(["box"])).plan([call("solid.parameter", { key: parameter.key, value: parameter.value + 5 })]);
  assertCovered(record("driving-dimension-edit"), plan.command);
  const edit = await previewCadCommand(plan.command);
  assert.ok(edit.result.ok, edit.result.reason);
  discardCadPlan(edit.planId);
  await assert.rejects(createCadToolSession(ctx(["box"])).plan([call("solid.parameter", { key: parameter.key, value: parameter.value })]), /unchanged/);
});

test("extrude: E route, MCP solid.extrude to create-extrude with a valid BRep; an open profile is refused", async () => {
  const capability = record("extrude");
  assert.equal(routeCadShortcut("e", { workspaceMode: "2d", hasSelection: true, selectionEditable: true, activeLayerLocked: false, canOffset: false, canTrim: false, canExtrude: true }), "extrude");
  assert.equal(routeCadShortcut("e", { workspaceMode: "2d", hasSelection: true, selectionEditable: true, activeLayerLocked: false, canOffset: false, canTrim: false, canExtrude: false }), null);
  await apply(rectangle("profile"));
  const plan = await createCadToolSession(ctx(["profile"])).plan([call("solid.extrude", { id: "body", profileObjectIds: ["profile"], distance: 8 })]);
  assertCovered(capability, plan.command);
  const review = await previewCadCommand(plan.command);
  assert.ok(review.result.ok, review.result.reason);
  assert.ok((await applyCadPlan(review.planId)).ok);
  assert.equal(Object.values(cadDocument.features).find(f => f.output === "body")?.type, "extrude");
  await apply(line("open"));
  // The planner accepts an open profile; the create-extrude handler rejects it at Preview.
  const open = await createCadToolSession(ctx(["open"])).plan([call("solid.extrude", { id: "bad", profileObjectIds: ["open"], distance: 8 })]);
  const refused = await previewCadCommand(open.command);
  assert.equal(refused.result.ok, false);
  assert.match(String(refused.result.reason), /closed loop/);
  assert.equal(cadDocument.objects.bad, undefined);
});

test("undo/redo: keyboard routes and History restore a published command; no command type is involved", async () => {
  assert.equal(routeHistoryShortcut({ key: "z", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, defaultPrevented: false }), "undo");
  assert.equal(routeHistoryShortcut({ key: "y", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, defaultPrevented: false }), "redo");
  assert.equal(routeHistoryShortcut({ key: "z", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, defaultPrevented: false }), null);
  const before = documentState();
  await apply(line("undone"));
  assert.ok(undoDocument());
  assert.equal(cadDocument.objects.undone, undefined);
  assert.deepEqual(documentState().objects, before.objects);
  assert.ok(redoDocument());
  assert.ok(cadDocument.objects.undone);
  assert.deepEqual(record("undo").commandTypes, []);
});

// ── 4. Object bridge and serialized inventory ─────────────────────────────────

test("object bridge classifies stored objects and returns candidate capabilities only by declared target kinds", async () => {
  await apply(line("l1"));
  await apply(rectangle("r1"));
  const bridge = documentObjectBridge(cadDocument);
  assert.deepEqual(bridge.targetKindsOf("l1"), ["analytic-curve:line"]);
  const forLine = candidateCapabilitiesForObject(bridge, "l1").map(c => c.id);
  for (const id of ["draw-2d-curve", "move", "base-point-clipboard", "trim"]) assert.ok(forLine.includes(id), id);
  assert.ok(!forLine.includes("explode"), "explode is declared for polylines/rectangles/blocks, not lines");
  assert.ok(candidateCapabilitiesForObject(bridge, "r1").some(c => c.id === "explode"));
  assert.deepEqual(bridge.targetKindsOf("missing"), []);
});

test("docs/verification/WEBCAD-CAPABILITY-INVENTORY.json equals the module inventory", () => {
  const path = "docs/verification/WEBCAD-CAPABILITY-INVENTORY.json";
  assert.ok(existsSync(resolve(root, path)), `${path} missing`);
  assert.deepEqual(JSON.parse(read(path)), JSON.parse(JSON.stringify(capabilityInventory())));
});

test("ontology module imports no UI, state or kernel code at runtime", () => {
  const directory = resolve(root, "apps/web/src/ontology/capabilities");
  for (const file of readdirSync(directory).filter(name => name.endsWith(".ts") && statSync(join(directory, name)).isFile())) {
    const source = readFileSync(join(directory, file), "utf8");
    for (const match of source.matchAll(/^import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/gm)) {
      const [, typeOnly, specifier] = match;
      if (typeOnly) continue;
      assert.ok(specifier === "@agent-webcad/cad-document" || specifier.startsWith("./"), `${file} has runtime import ${specifier}`);
    }
  }
});

test("dated layer isolation promotion has exact scope and real UI/test evidence", () => {
  assert.equal(CAPABILITY_UPDATES.length, 4);
  const update=CAPABILITY_UPDATES[0];
  assert.deepEqual({...update, evidence:undefined}, {date:"2026-11-07", capabilityId:"layer-isolate",baselineItems:[97,98],from:"unconfirmed",to:"supported",evidence:undefined});
  for(const file of update.evidence) assert.ok(existsSync(resolve(root,file)),file);
  assert.equal(record(update.capabilityId).executor,"ui-state");
  assert.deepEqual(record(update.capabilityId).commandTypes,[]);
  assert.deepEqual(record(update.capabilityId).mcpTools,[]);
  assert.deepEqual(record(update.capabilityId).ui.paletteIds,["layer-isolate"]);
  assert.ok(read("apps/web/src/explorer/views/LayersPanel.tsx").includes('onClick={onIsolate}'));
  assert.ok(read("apps/web/src/App.tsx").includes('onIsolateLayers={handleIsolateLayers}'));
  assert.ok(read("apps/web/tests/layerIsolation.browser.tsx").includes('click("Isolate selected layers")'));
  assert.equal(capabilityInventory().shortcutBaselineDate,"2026-11-05");
});


test("dated appearance promotion preserves the historical 038 verdict", () => {
  const update = CAPABILITY_UPDATES[1];
  assert.equal(update.capabilityId, "match-properties");
  assert.deepEqual(update.baselineItems, [38]);
  assert.equal(update.from, "unconfirmed");
  assert.equal(update.to, "supported");
  assert.equal(AUTOCAD_SHORTCUT_MAPPINGS.find(item => item.no === 38)?.verdict, "unconfirmed");
  const capability = record(update.capabilityId);
  assert.equal(capability.executor, "command-bus");
  assert.deepEqual(capability.commandTypes, ["set-vector-style"]);
  assert.deepEqual(capability.ui.paletteIds, ["match-vector-appearance"]);
  for (const file of update.evidence) assert.ok(existsSync(resolve(root, file)), file);
});

test("drawing order promotion preserves the historical image-only mapping and hatch verdict", () => {
  const update = CAPABILITY_UPDATES[2];
  assert.equal(update.capabilityId, "general-draw-order");
  assert.deepEqual(update.baselineItems, [87, 89]);
  assert.equal(update.to, "supported");
  assert.equal(AUTOCAD_SHORTCUT_MAPPINGS.find(item => item.no === 87)?.verdict, "partial");
  assert.deepEqual(AUTOCAD_SHORTCUT_MAPPINGS.find(item => item.no === 87)?.capabilityIds, ["image-draw-order"]);
  assert.equal(AUTOCAD_SHORTCUT_MAPPINGS.find(item => item.no === 89)?.verdict, "unconfirmed");
  const capability = record(update.capabilityId);
  assert.equal(capability.support, "supported");
  assert.deepEqual(capability.commandTypes, ["reorder-drawing"]);
  assert.deepEqual(capability.ui.paletteIds, ["drawing-order-front", "drawing-order-back", "drawing-order-hatch-back"]);
  for (const file of update.evidence) assert.ok(existsSync(resolve(root, file)), file);
});

test("linear dimension style presets extend the dimension edit capability without rewriting item 032", () => {
  const baseline = AUTOCAD_SHORTCUT_MAPPINGS.find(item => item.no === 32);
  assert.equal(baseline?.verdict, "partial");
  assert.deepEqual(baseline?.capabilityIds, ["dimension-edit"]);
  const capability = record("dimension-edit");
  assert.deepEqual(capability.commandTypes, ["update-dimension", "save-dimension-style-preset", "apply-dimension-style-preset"]);
  assert.deepEqual(capability.mcpTools, []);
  assert.ok(capability.ui.surfaces.includes("Properties → Dimension styles"));
});

test("component line editing keeps 105 and 106 audit verdicts and records the partial session scope", () => {
  const update = CAPABILITY_UPDATES[3];
  assert.equal(update.capabilityId, "block-editor-session");
  assert.deepEqual(update.baselineItems, [105, 106]);
  assert.equal(update.from, "unconfirmed");
  assert.equal(update.to, "partial");
  assert.equal(AUTOCAD_SHORTCUT_MAPPINGS.find(item => item.no === 105)?.verdict, "partial");
  assert.equal(AUTOCAD_SHORTCUT_MAPPINGS.find(item => item.no === 106)?.verdict, "unconfirmed");
  assert.equal(record("block-editor-session").executor, "ui-state");
  assert.deepEqual(record("block-update").commandTypes, ["update-block"]);
  for (const file of update.evidence) assert.ok(existsSync(resolve(root, file)), file);
});
