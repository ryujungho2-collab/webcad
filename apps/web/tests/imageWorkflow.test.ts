import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { test } from "node:test";
import { applyImageAdjustmentsToSrgb, deserializeDocument, serializeDocument, validImageAdjustments, type CadRasterAsset } from "@agent-webcad/cad-document";
import { cadDocument } from "../src/state/cadDocument";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { applyCadPlan, previewCadCommand } from "../src/state/documentPlans";
import { redoDocument, undoDocument, cadHistory } from "../src/state/history";
import { documentState, resetTestDocument } from "./helpers/documentHarness";
import { DOCUMENT_BACKUP_KEY, DOCUMENT_CACHE_KEY, DOCUMENT_RASTER_ASSET_PREFIX, readRecoveryCheckpoint, writeRecoveryCheckpoint } from "../src/state/documentRecovery";
import { encodeSvg } from "../src/export/svgWriter";
import { planAlignment } from "../src/state/selectionCommands";
import { getObjectWorldBounds } from "../src/precision/worldBounds";
import { configureImageAdjustmentMaterial, imageGeometry, updateImageSceneCrop } from "../src/viewport/imageRenderer";
import { cropFromImageCropHandle, imageCropBoundaryPoints } from "../src/viewport/imageCropGeometry";
import { artboardPngSvg, planArtboardPng } from "../src/export/artboardPng";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p7sAAAAASUVORK5CYII=";
function testAsset(name = "pixel.png"): CadRasterAsset {
  const bytes = Buffer.from(PNG, "base64"), contentHash = createHash("sha256").update(bytes).digest("hex");
  return { id: `asset-${contentHash}`, name, mimeType: "image/png", width: 1, height: 1, byteLength: bytes.length, dataUrl: `data:image/png;base64,${PNG}`, contentHash };
}
const insert = (asset = testAsset(), id = "image-a") => ({ type: "insert-image" as const, id, asset, workPlane: "XY" as const, center: [25, 30, 0] as [number, number, number], width: 100, height: 50 });

test("artboard PNG sizing is deterministic and rejects output that exceeds pixel, axis, or estimated memory budgets", () => {
  const source = testAsset();
  const image = { type: "image" as const, image: { id: "image-a", href: source.dataUrl, center: [0,0] as [number,number], width: 10, height: 10, rotation: 0, crop: { x: 0, y: 0, width: 1, height: 1 }, sourceSize: [4000,4000] as [number,number] } };
  const plan = planArtboardPng([25.4,25.4],1,[image,image]);
  assert.equal("error" in plan, false);
  if ("error" in plan) return;
  assert.deepEqual([plan.width,plan.height,plan.pixels],[96,96,9216]);
  assert.equal(plan.estimatedPeakBytes, 9216 * 12 + 4000 * 4000 * 4, "two placements of one embedded source count one decoded source allocation");
  assert.match((planArtboardPng([210,297],16) as {error:string}).error,/per side/);
  assert.match((planArtboardPng([1000,1000],1) as {error:string}).error,/working memory/);
  assert.match((planArtboardPng([25.4,25.4],0) as {error:string}).error,/Scale must/);
});

test("artboard PNG SVG records exact pixel dimensions and respects mixed raster/vector stacking", () => {
  const asset = testAsset();
  const scene = { board: { id:"board", name:"Square", origin:[0,0] as [number,number], size:[25.4,25.4] as [number,number], workPlane:"XY" as const, background:"#ffffff" }, items:[
    { type:"polyline" as const, polyline:{ points:[[1,1],[2,2]] as [number,number][], closed:false } },
    { type:"image" as const, image:{ id:"image-a",href:asset.dataUrl,center:[5,5] as [number,number],width:4,height:4,rotation:0,crop:{x:.25,y:.25,width:.5,height:.5},mask:"ellipse" as const,opacity:.5,adjustments:{brightness:0,contrast:0,saturation:100},sourceSize:[1,1] as [number,number] } },
    { type:"polyline" as const, polyline:{ points:[[3,3],[4,4]] as [number,number][], closed:false } },
  ] };
  const svg = artboardPngSvg(scene,{width:96,height:96});
  assert.match(svg,/width="96px" height="96px"/);
  assert.match(svg,/viewBox="0 -25\.4 25\.4 25\.4"/);
  assert.ok(svg.indexOf("<polyline") < svg.indexOf("<image") && svg.indexOf("<image") < svg.lastIndexOf("<polyline"), "raster and vector bodies preserve their document object order");
  assert.match(svg,/feColorMatrix/); assert.match(svg,/<ellipse/); assert.match(svg,/opacity="0\.5"/); assert.match(svg,/artboard-crop/);
});
function memoryStorage() {
  const data = new Map<string,string>();
  return { data, getItem: (key:string) => data.get(key) ?? null, setItem: (key:string,value:string) => { data.set(key,value); }, removeItem: (key:string) => { data.delete(key); } };
}

test("image source is immutable, placements share the asset, and image edits are one reviewed undoable transaction", async () => {
  resetTestDocument(); const asset = testAsset();
  const before = documentState();
  const preview = await previewCadCommand(insert(asset));
  assert.equal(preview.result.ok, true);
  assert.equal(preview.impact?.find(row => row.kind === "Images")?.after, 1);
  assert.deepEqual(documentState(), before, "placement preview must not mutate the source document");
  assert.equal((await applyCadPlan(preview.planId)).ok, true);
  assert.deepEqual(cadDocument.rasterAssets?.[asset.id], asset);
  assert.equal(JSON.parse(serializeDocument(cadDocument)).version, 8);
  const reloaded = deserializeDocument(serializeDocument(cadDocument));
  assert.deepEqual(reloaded.rasterAssets?.[asset.id], asset);
  assert.deepEqual(reloaded.features["feature-image-a"].params.crop, { x: 0, y: 0, width: 1, height: 1 });

  const secondAsset = testAsset("renamed-same-source.png");
  assert.equal((await dispatchCadCommand(insert(secondAsset, "image-b"))).ok, true);
  assert.equal(Object.keys(cadDocument.rasterAssets ?? {}).length, 1, "matching content identities should share one source");
  const afterInsert = documentState(); cadHistory.clear();
  const crop = { x: 0.1, y: 0.2, width: 0.7, height: 0.6 };
  const edit = await previewCadCommand({ type: "update-image", objectId: "image-a", width: 80, height: 45, crop });
  assert.equal(edit.result.ok, true); assert.deepEqual(documentState(), afterInsert);
  assert.equal((await applyCadPlan(edit.planId)).ok, true);
  assert.equal(cadDocument.features["feature-image-a"].params.width, 80);
  assert.deepEqual(cadDocument.features["feature-image-a"].params.crop, crop);
  assert.deepEqual(cadDocument.rasterAssets?.[asset.id], asset, "crop must not overwrite source pixels");
  const afterEdit = documentState();
  assert.ok(undoDocument()); assert.deepEqual(documentState(), afterInsert);
  assert.ok(redoDocument()); assert.deepEqual(documentState(), afterEdit);
  assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)), cadDocument);
});

test("locked layers and broken image references reject atomically; shared source is released after the last placement", async () => {
  resetTestDocument(); const asset = testAsset();
  assert.equal((await dispatchCadCommand(insert(asset))).ok, true);
  assert.equal((await dispatchCadCommand(insert(asset, "image-b"))).ok, true);
  cadDocument.layers["layer-default"].locked = true;
  cadHistory.clear(); const before = documentState(), history = cadHistory.getPastLabels();
  const rejected = await previewCadCommand({ type: "update-image", objectId: "image-a", crop: { x: 0, y: 0, width: 1, height: 1 } });
  assert.equal(rejected.result.ok, false); assert.equal((await applyCadPlan(rejected.planId)).changed, false);
  assert.deepEqual(documentState(), before); assert.deepEqual(cadHistory.getPastLabels(), history);
  cadDocument.layers["layer-default"].locked = false;
  assert.equal((await dispatchCadCommand({ type: "delete-object", objectId: "image-a" })).ok, true);
  assert.ok(cadDocument.rasterAssets?.[asset.id]);
  assert.equal((await dispatchCadCommand({ type: "delete-object", objectId: "image-b" })).ok, true);
  assert.equal(cadDocument.rasterAssets, undefined);
  assert.ok(undoDocument()); assert.deepEqual(cadDocument.rasterAssets?.[asset.id], asset);

  const broken = structuredClone(cadDocument); delete broken.rasterAssets;
  assert.throws(() => deserializeDocument(serializeDocument(broken)), /image asset reference/);
});

test("image duplicate, exact transform, alignment, persistence, and last-reference cleanup use shared object commands", async () => {
  resetTestDocument(); const asset = testAsset();
  assert.equal((await dispatchCadCommand(insert(asset))).ok, true);
  const original = structuredClone(cadDocument.features["feature-image-a"]);
  const originalTransform = structuredClone(cadDocument.objects["image-a"].transform);
  cadHistory.clear();

  const duplicate = await dispatchCadCommand({ type: "duplicate-object", objectId: "image-a", offset: [30, 10, 0] });
  assert.equal(duplicate.ok, true);
  const copyId = duplicate.createdIds[0];
  assert.ok(copyId);
  const copyFeature = Object.values(cadDocument.features).find(feature => feature.output === copyId)!;
  assert.notEqual(copyId, "image-a");
  assert.notEqual(copyFeature.id, original.id);
  assert.equal(copyFeature.type, "image");
  assert.equal(copyFeature.params.assetId, asset.id);
  assert.deepEqual(cadDocument.rasterAssets?.[asset.id], asset);
  assert.deepEqual(cadDocument.objects[copyId].transform?.translation, [55, 40, 0]);

  assert.equal((await dispatchCadCommand({ type: "move-object", objectId: copyId, translation: [80, 40, 0] })).ok, true);
  assert.equal((await dispatchCadCommand({ type: "rotate-object", objectId: copyId, rotation: [0, 0, 35] })).ok, true);
  assert.equal((await dispatchCadCommand({ type: "scale-object", objectId: copyId, scale: [1.5, 1.5, 1] })).ok, true);
  assert.deepEqual(cadDocument.objects["image-a"].transform, originalTransform, "transforming a placement must not change its source object");

  const alignment = planAlignment(cadDocument, ["image-a", copyId], "left", "XY");
  assert.ok(alignment?.length);
  assert.equal((await dispatchCadCommand({ type: "batch", label: "Align image placements", commands: alignment })).ok, true);
  const sourceBounds = getObjectWorldBounds(cadDocument, "image-a")!, copyBounds = getObjectWorldBounds(cadDocument, copyId)!;
  assert.ok(Math.abs(sourceBounds.min[0] - copyBounds.min[0]) < 1e-8, "image frame bounds participate in shared align calculations");

  const sourcePixels = structuredClone(cadDocument.rasterAssets?.[asset.id]);
  assert.equal((await dispatchCadCommand({ type: "update-image", objectId: copyId, width: 80, height: 45, crop: { x: .1, y: .2, width: .8, height: .7 } })).ok, true);
  assert.deepEqual(cadDocument.features[original.id].params, original.params, "copy size/crop stays independent");
  assert.deepEqual(cadDocument.rasterAssets?.[asset.id], sourcePixels, "all placement edits preserve source pixels");
  assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)), cadDocument);

  assert.equal((await dispatchCadCommand({ type: "delete-object", objectId: "image-a" })).ok, true);
  assert.ok(cadDocument.rasterAssets?.[asset.id], "deleting the original keeps the source while a duplicate references it");
  assert.equal((await dispatchCadCommand({ type: "delete-object", objectId: copyId })).ok, true);
  assert.equal(cadDocument.rasterAssets, undefined, "deleting the last duplicate releases the shared source");
  assert.ok(undoDocument()); assert.deepEqual(cadDocument.rasterAssets?.[asset.id], asset);
});

test("image recovery keeps portable sources self-contained but stores recovery bytes once outside current and backup copies", async () => {
  resetTestDocument(); const cache = memoryStorage();
  writeRecoveryCheckpoint(cache, structuredClone(cadDocument));
  const asset = testAsset(); assert.equal((await dispatchCadCommand(insert(asset))).ok, true);
  const imageDocument = structuredClone(cadDocument); writeRecoveryCheckpoint(cache, imageDocument);
  const next = structuredClone(imageDocument); next.id = "second-image-doc"; writeRecoveryCheckpoint(cache, next);
  const current = cache.data.get(DOCUMENT_CACHE_KEY)!, backup = cache.data.get(DOCUMENT_BACKUP_KEY)!;
  assert.equal(JSON.parse(current).format, "agent-webcad-recovery");
  assert.equal(current.includes(asset.dataUrl), false); assert.equal(backup.includes(asset.dataUrl), false);
  assert.ok(cache.data.get(`${DOCUMENT_RASTER_ASSET_PREFIX}${asset.id}`));
  assert.deepEqual(readRecoveryCheckpoint(cache)?.document.rasterAssets?.[asset.id], asset);
  cache.data.set(DOCUMENT_CACHE_KEY, "damaged");
  const recovered = readRecoveryCheckpoint(cache)!;
  assert.equal(recovered.recovered, true); assert.equal(recovered.document.id, imageDocument.id);
  assert.deepEqual(recovered.document.rasterAssets?.[asset.id], asset);
});

test("SVG keeps the original embedded image and applies non-destructive crop inside the artboard clip", () => {
  const asset = testAsset();
  const svg = encodeSvg([], { viewBox: { origin: [0,0], size: [100,100] }, images: [{ id: "image-a", href: asset.dataUrl, center: [50,50], width: 80, height: 40, rotation: 0, crop: { x: .1, y: .2, width: .7, height: .6 } }] });
  assert.match(svg, /<image /); assert.match(svg, /data:image\/png;base64,/); assert.match(svg, /artboard-crop/); assert.match(svg, /raster-crop-0/);
  assert.match(svg, /width="114\.286" height="66\.667"/);
});

test("ellipse image mask previews as a non-destructive clip, survives v9 save, and exports as SVG geometry", async () => {
  resetTestDocument(); const asset = testAsset();
  assert.equal((await dispatchCadCommand(insert(asset))).ok, true);
  const before = documentState();
  const preview = await previewCadCommand({ type: "update-image", objectId: "image-a", mask: "ellipse" });
  assert.equal(preview.result.ok, true);
  assert.deepEqual(documentState(), before, "mask preview must not mutate the document or source asset");
  assert.equal((await applyCadPlan(preview.planId)).ok, true);
  assert.equal(cadDocument.features["feature-image-a"].params.mask, "ellipse");
  assert.deepEqual(cadDocument.rasterAssets?.[asset.id], asset);

  const serialized = serializeDocument(cadDocument);
  assert.equal(JSON.parse(serialized).version, 9);
  assert.deepEqual(deserializeDocument(serialized), cadDocument);
  assert.throws(() => deserializeDocument(JSON.stringify({ ...JSON.parse(serialized), version: 8 })), /version 9/);
  const svg = encodeSvg([], { viewBox: { origin: [0,0], size: [100,100] }, images: [{ id: "image-a", href: asset.dataUrl, center: [50,50], width: 80, height: 40, rotation: 0, crop: { x: .1, y: .2, width: .7, height: .6 }, mask: "ellipse" }] });
  assert.match(svg, /<ellipse cx="50" cy="-50" rx="40" ry="20" \/>/);
  assert.match(svg, /raster-crop-0/);

  const material = new THREE.MeshBasicMaterial({ map: new THREE.Texture() });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(80, 40), material);
  mesh.userData.imageMask = "rect"; mesh.userData.imageWidth = 80; mesh.userData.imageHeight = 40;
  updateImageSceneCrop(mesh, { x: .1, y: .2, width: .7, height: .6 }, "ellipse", .4);
  assert.equal(mesh.geometry.type, "CircleGeometry", "the canvas preview clips the image instead of baking or flattening the source");
  assert.deepEqual([material.map!.repeat.x, material.map!.repeat.y], [.7, .6]);
  assert.equal(material.opacity, .4, "the live image preview applies opacity on the placement material");
  updateImageSceneCrop(mesh, { x: 0, y: 0, width: 1, height: 1 }, "rect", 1);
  assert.equal(mesh.geometry.type, "PlaneGeometry", "cancel restores the saved rectangular clip geometry");
  assert.equal(material.opacity, 1, "cancel restores the saved opacity");
  mesh.geometry.dispose(); material.dispose(); material.map!.dispose();
});

test("image opacity is a reviewed placement edit, stays atomic, persists in v10, and exports to SVG", async () => {
  resetTestDocument(); const asset = testAsset();
  assert.equal((await dispatchCadCommand(insert(asset))).ok, true);
  assert.equal((await dispatchCadCommand({ type: "update-image", objectId: "image-a", mask: "ellipse" })).ok, true);
  const before = documentState(); cadHistory.clear();
  const preview = await previewCadCommand({ type: "update-image", objectId: "image-a", opacity: .4 });
  assert.equal(preview.result.ok, true);
  assert.deepEqual(documentState(), before, "opacity preview must not mutate placement or source bytes");
  assert.equal((await applyCadPlan(preview.planId)).ok, true);
  assert.equal(cadDocument.features["feature-image-a"].params.opacity, .4);
  assert.deepEqual(cadDocument.rasterAssets?.[asset.id], asset, "opacity changes must preserve original source pixels");
  const serialized = serializeDocument(cadDocument);
  assert.equal(JSON.parse(serialized).version, 10);
  assert.deepEqual(deserializeDocument(serialized), cadDocument);
  assert.throws(() => deserializeDocument(JSON.stringify({ ...JSON.parse(serialized), version: 9 })), /version 10/);
  const svg = encodeSvg([], { viewBox: { origin: [0,0], size: [100,100] }, images: [{ id: "image-a", href: asset.dataUrl, center: [50,50], width: 80, height: 40, rotation: 0, crop: { x: 0, y: 0, width: 1, height: 1 }, mask: "ellipse", opacity: .4 }] });
  assert.match(svg, /<image [^>]* opacity="0\.4"/);
  const after = documentState();
  assert.ok(undoDocument()); assert.deepEqual(documentState(), before);
  assert.ok(redoDocument()); assert.deepEqual(documentState(), after);
});

test("image color adjustments are bounded, deterministic, and applied by the canvas shader", () => {
  assert.equal(validImageAdjustments({ brightness: -100, contrast: 100, saturation: 0 }), true);
  assert.equal(validImageAdjustments({ brightness: 101, contrast: 0, saturation: 0 }), false);
  assert.equal(validImageAdjustments({ brightness: 0, contrast: Number.NaN, saturation: 0 }), false);
  assert.deepEqual(applyImageAdjustmentsToSrgb([.2, .4, .6], { brightness: 0, contrast: 0, saturation: 0 }), [.2, .4, .6]);
  const gray = applyImageAdjustmentsToSrgb([.2, .4, .6], { brightness: 0, contrast: 0, saturation: -100 });
  assert.ok(gray.every(channel => Math.abs(channel - .37192) < 1e-12), "full desaturation uses the defined linear sRGB luminance weights");
  assert.deepEqual(applyImageAdjustmentsToSrgb([.2, .4, .6], { brightness: 100, contrast: 0, saturation: 0 }), [1, 1, 1]);

  const material = new THREE.MeshBasicMaterial({ map: new THREE.Texture() });
  configureImageAdjustmentMaterial(material, { brightness: 20, contrast: 25, saturation: 50 });
  const shader = { uniforms: {}, fragmentShader: "#include <common>\nvoid main() {\n#include <map_fragment>\n}" };
  material.onBeforeCompile(shader as never, {} as never);
  assert.match(shader.fragmentShader, /cadImageSrgb = cadImageToSrgb/);
  assert.match(shader.fragmentShader, /cadImageSaturation/);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), material);
  const texture = material.map!, source = texture.source, uploadVersion = texture.version;
  Object.assign(mesh.userData, { imageMask: "rect", imageWidth: 10, imageHeight: 5 });
  updateImageSceneCrop(mesh, { x: .1, y: .2, width: .6, height: .5 }, "rect", .7, false, { brightness: -15, contrast: 30, saturation: -40 });
  const uniforms = material.userData.cadImageAdjustmentUniforms as Record<string, { value: number }>;
  assert.deepEqual([uniforms.cadImageBrightness.value, uniforms.cadImageContrast.value, uniforms.cadImageSaturation.value], [-.15, .3, -.4], "live preview updates uniforms without rebuilding the source texture");
  assert.equal(material.map, texture, "preview retains the placement texture identity");
  assert.equal(material.map!.source, source, "preview retains shared source pixels");
  assert.equal(material.map!.version, uploadVersion, "UV, opacity and color changes must not request another pixel upload");
  assert.deepEqual(texture.repeat.toArray(), [.6, .5]);
  assert.ok(Math.abs(texture.offset.y - .3) < 1e-12);
  assert.equal(texture.offset.x, .1); assert.equal(material.opacity, .7);
  mesh.geometry.dispose(); material.dispose(); material.map?.dispose();
});

test("per-placement color adjustment previews atomically, saves as v11, survives SVG and history, and leaves shared source pixels intact", async () => {
  resetTestDocument(); const asset = testAsset();
  assert.equal((await dispatchCadCommand(insert(asset))).ok, true);
  assert.equal((await dispatchCadCommand(insert(asset, "image-b"))).ok, true);
  const before = documentState(), source = structuredClone(cadDocument.rasterAssets?.[asset.id]); cadHistory.clear();
  const adjustments = { brightness: 20, contrast: 25, saturation: 50 };
  const preview = await previewCadCommand({ type: "update-image", objectId: "image-a", adjustments });
  assert.equal(preview.result.ok, true); assert.deepEqual(documentState(), before, "color preview must remain detached");
  assert.equal((await applyCadPlan(preview.planId)).ok, true);
  assert.deepEqual(cadDocument.features["feature-image-a"].params.adjustments, adjustments);
  assert.equal(cadDocument.features["feature-image-b"].params.adjustments, undefined, "same-source placements keep independent edits");
  assert.deepEqual(cadDocument.rasterAssets?.[asset.id], source);
  await assert.rejects(dispatchCadCommand({ type: "update-image", objectId: "image-a", adjustments: { brightness: 0, contrast: 101, saturation: 0 } }), /Invalid CAD command payload/);
  assert.deepEqual(cadDocument.features["feature-image-a"].params.adjustments, adjustments, "invalid values cannot partially change the document");

  const serialized = serializeDocument(cadDocument);
  assert.equal(JSON.parse(serialized).version, 11);
  assert.deepEqual(deserializeDocument(serialized), cadDocument);
  assert.throws(() => deserializeDocument(JSON.stringify({ ...JSON.parse(serialized), version: 10 })), /version 11/);
  const svg = encodeSvg([], { viewBox: { origin: [0,0], size: [100,100] }, images: [{ id: "image-a", href: source!.dataUrl, center: [50,50], width: 80, height: 40, rotation: 0, crop: { x: .1, y: .2, width: .7, height: .6 }, mask: "ellipse", opacity: .4, adjustments }] });
  assert.match(svg, /<filter id="raster-adjustment-0" color-interpolation-filters="sRGB">/);
  assert.match(svg, /<feFuncR type="linear" slope="1\.25" intercept="0\.125"/);
  assert.match(svg, /<feColorMatrix type="saturate" values="1\.5"/);

  const after = documentState(); assert.ok(undoDocument()); assert.deepEqual(documentState(), before);
  assert.ok(redoDocument()); assert.deepEqual(documentState(), after);
  assert.deepEqual(cadDocument.rasterAssets?.[asset.id], source);
});

test("canvas crop handle math edits the same normalized crop and clamps to a visible source pixel", () => {
  const crop = { x: .1, y: .15, width: .7, height: .8 };
  const bounds = imageCropBoundaryPoints(crop, 100, 60);
  assert.equal(bounds.handles.right.x, 30); assert.ok(Math.abs(bounds.handles.right.y + 3) < 1e-12);
  const right = cropFromImageCropHandle(crop, "right", { x: 20, y: 0 }, 100, 60, 128, 128);
  assert.deepEqual(right, { x: .1, y: .15, width: .6, height: .8 }, "edge drag changes only the corresponding source inset");
  const corner = cropFromImageCropHandle(crop, "bottom-right", { x: 25, y: -21 }, 100, 60, 128, 128);
  assert.deepEqual(corner, { x: .1, y: .15, width: .65, height: .7 }, "corner drag updates both crop axes in the same parameter model");
  const clamped = cropFromImageCropHandle(crop, "left", { x: 30, y: 0 }, 100, 60, 128, 128);
  assert.ok(clamped.width >= 1 / 128 && clamped.height === crop.height, "a crop edge cannot cross the opposite edge or remove the last source pixel");
});
