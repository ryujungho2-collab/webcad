import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { test } from "node:test";
import { deserializeDocument, serializeDocument, type CadRasterAsset } from "@agent-webcad/cad-document";
import { cadDocument } from "../src/state/cadDocument";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { applyCadPlan, previewCadCommand } from "../src/state/documentPlans";
import { cadHistory, undoDocument, redoDocument } from "../src/state/history";
import { newScene } from "../src/state/sceneCommands";
import { evaluateScene } from "../src/scenes/sceneEvaluation";
import { documentState, resetTestDocument } from "./helpers/documentHarness";

function asset(red: number, padding = 0): CadRasterAsset {
  const chunk = (type: string, payload: Buffer) => {
    const data = Buffer.concat([Buffer.from(type), payload]); let crc = 0xffffffff;
    for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    const header = Buffer.alloc(4), tail = Buffer.alloc(4); header.writeUInt32BE(payload.length); tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([header, data, tail]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(1); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 6;
  const bytes = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.from([0, red, 0, 255 - red, 255]))), ...(padding ? [chunk("tEXt", Buffer.alloc(padding, 65))] : []), chunk("IEND", Buffer.alloc(0))]);
  const contentHash = createHash("sha256").update(bytes).digest("hex");
  return { id: `asset-${contentHash}`, name: "pixel.png", mimeType: "image/png", width: 1, height: 1, byteLength: bytes.length, dataUrl: `data:image/png;base64,${bytes.toString("base64")}`, contentHash };
}
async function insert(source: CadRasterAsset, id = "image-a") {
  assert.equal((await dispatchCadCommand({ type: "insert-image", id, asset: source, workPlane: "XY", center: [0,0,0], width: 30, height: 20 })).ok, true);
}
const complete = () => JSON.stringify([cadDocument, cadHistory.getPastLabels(), cadHistory.getFutureLabels()]);

test("image source replacement preserves shared placements and Scene identity through detached preview, one Undo, and save/reload", async () => {
  resetTestDocument(); const original = asset(255), replacement = asset(0);
  await insert(original); await insert(original, "image-b");
  await dispatchCadCommand({ type: "update-image", objectId: "image-a", crop: { x: .1, y: .1, width: .8, height: .8 }, mask: "ellipse", opacity: .4, adjustments: { brightness: 10, contrast: 20, saturation: 30 } });
  await dispatchCadCommand({ type: "create-artboard", id: "board", workPlane: "XY", origin: [-20,-20], size: [100,100] });
  const scene = { ...newScene("board", ["image-a"]), id: "scene" };
  assert.equal((await dispatchCadCommand({ type: "upsert-scene", scene })).ok, true);
  cadHistory.clear(); const before = documentState(), feature = structuredClone(cadDocument.features["feature-image-a"]);
  const object = structuredClone(cadDocument.objects["image-a"]), untouched = structuredClone(cadDocument.features["feature-image-b"]);
  const plan = await previewCadCommand({ type: "replace-image-source", objectId: "image-a", asset: replacement });
  assert.equal(plan.result.ok, true, plan.result.reason); assert.deepEqual(documentState(), before);
  assert.equal(plan.impact?.find(row => row.kind === "Image sources")?.created, 1);
  assert.equal((await applyCadPlan(plan.planId)).ok, true); assert.equal(cadHistory.getPastLabels().length, 1);
  assert.deepEqual(cadDocument.objects["image-a"], object);
  assert.deepEqual(cadDocument.features["feature-image-a"], { ...feature, params: { ...feature.params, assetId: replacement.id } });
  assert.deepEqual(cadDocument.features["feature-image-b"], untouched); assert.deepEqual(cadDocument.rasterAssets?.[original.id], original);
  assert.deepEqual(cadDocument.scenes?.scene.objectIds, ["image-a"]);
  assert.ok(evaluateScene(cadDocument, scene, 0).svg.includes(replacement.dataUrl));
  const after = documentState(); assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)), cadDocument);
  assert.ok(undoDocument()); assert.deepEqual(documentState(), before);
  assert.ok(redoDocument()); assert.deepEqual(documentState(), after);
});

test("replacement budgets retained sources after releasing the final old reference, and rejects conflicts/locks/stale plans atomically", async () => {
  resetTestDocument(); const original = asset(255, 1_600_000), replacement = asset(0, 1_600_000);
  await insert(original); cadHistory.clear();
  const plan = await previewCadCommand({ type: "replace-image-source", objectId: "image-a", asset: replacement });
  assert.equal(plan.result.ok, true, "replacement may release the last old source before accounting for quota");
  assert.equal((await applyCadPlan(plan.planId)).ok, true); assert.equal(cadDocument.rasterAssets?.[original.id], undefined);
  assert.ok(undoDocument()); await insert(original, "image-b");
  const before = complete(); const overBudget = await dispatchCadCommand({ type: "replace-image-source", objectId: "image-a", asset: replacement });
  assert.equal(overBudget.ok, false); assert.match(overBudget.reason!, /3 MiB/); assert.equal(complete(), before);
  for (const [key, value] of [["locked", true], ["visible", false]] as const) {
    cadDocument.layers["layer-default"][key] = value;
    const locked = complete(); assert.equal((await dispatchCadCommand({ type: "replace-image-source", objectId: "image-a", asset: asset(0) })).ok, false); assert.equal(complete(), locked);
    cadDocument.layers["layer-default"][key] = !value;
  }
  const stale = await previewCadCommand({ type: "replace-image-source", objectId: "image-a", asset: asset(0) });
  await dispatchCadCommand({ type: "rename-object", objectId: "image-a", name: "changed" });
  const edited = complete(); assert.equal((await applyCadPlan(stale.planId)).ok, false); assert.equal(complete(), edited);
  const conflict = { ...original, width: 2 }; const conflictBefore = complete();
  assert.equal((await dispatchCadCommand({ type: "replace-image-source", objectId: "image-a", asset: conflict })).ok, false); assert.equal(complete(), conflictBefore);
});

test("source replacement and placement edit commit as one reviewed batch; later rejection restores the old source", async () => {
  resetTestDocument(); const original = asset(255), replacement = asset(0); await insert(original); cadHistory.clear();
  const before = documentState();
  const preview = await previewCadCommand({ type: "batch", label: "Replace image source and edit placement", commands: [{ type: "replace-image-source", objectId: "image-a", asset: replacement }, { type: "update-image", objectId: "image-a", width: 50 }] });
  assert.equal(preview.result.ok, true); assert.deepEqual(documentState(), before);
  assert.equal((await applyCadPlan(preview.planId)).ok, true); assert.equal(cadHistory.getPastLabels().length, 1);
  assert.equal(cadDocument.features["feature-image-a"].params.width, 50); assert.equal(cadDocument.features["feature-image-a"].params.assetId, replacement.id);
  assert.ok(undoDocument()); assert.deepEqual(documentState(), before);
  const failedBefore = complete();
  const failed = await dispatchCadCommand({ type: "batch", commands: [{ type: "replace-image-source", objectId: "image-a", asset: replacement }, { type: "update-image", objectId: "missing", width: 50 }] });
  assert.equal(failed.ok, false); assert.equal(complete(), failedBefore);
});
