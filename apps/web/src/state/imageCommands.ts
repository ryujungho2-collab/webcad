import type { CadCommand, CommandBus } from "@agent-webcad/cad-commands";
import { MAX_DOCUMENT_RASTER_BYTES, validRasterAsset, validImageNodeParams, type CadDocument } from "@agent-webcad/cad-document";

export function registerImageCommandHandlers(bus: CommandBus, document: CadDocument) {
  bus.registerHandler("reorder-image", command => {
    if (command.type !== "reorder-image") return;
    const object = document.objects[command.objectId];
    const feature = Object.values(document.features).find(f => f.output === command.objectId && f.type === "image");
    const layer = object && document.layers[object.layerId];
    if (!object || !feature || !layer || layer.locked || !layer.visible || !object.visible) return { accepted: false, reason: "Select a visible image on an unlocked layer." };
    const images = document.rootObjects.filter(id => Object.values(document.features).some(f => f.output === id && f.type === "image" && f.params.workPlane === feature.params.workPlane));
    const index = images.indexOf(command.objectId);
    const target = command.direction === "front" ? images.length - 1 : command.direction === "back" ? 0 : command.direction === "forward" ? Math.min(images.length - 1, index + 1) : Math.max(0, index - 1);
    if (index < 0 || index === target) return { accepted: false, reason: "Image is already at this stacking boundary." };
    images.splice(index, 1); images.splice(target, 0, command.objectId);
    const imageIds = new Set(images); let cursor = 0;
    document.rootObjects = document.rootObjects.map(id => imageIds.has(id) ? images[cursor++] : id);
    document.revision++;
  });
  bus.registerHandler("replace-image-source", command => {
    if (command.type !== "replace-image-source") return;
    const object = document.objects[command.objectId];
    const feature = Object.values(document.features).find(entry => entry.output === command.objectId && entry.type === "image");
    if (!object || !feature) return { accepted: false, reason: "Select an image placement to replace its source." };
    const layer = document.layers[object.layerId];
    if (!layer || layer.locked || !layer.visible || !object.visible) return { accepted: false, reason: "Unlock and show the image and its layer before replacing its source." };
    if (!validRasterAsset(command.asset)) return { accepted: false, reason: "The replacement source is invalid or exceeds the supported file limits." };
    const oldId = String(feature.params.assetId), old = document.rasterAssets?.[oldId];
    if (!old) return { accepted: false, reason: "The current image source is missing. Restore the document before replacing it." };
    const prior = document.rasterAssets?.[command.asset.id];
    if (prior && (prior.contentHash !== command.asset.contentHash || prior.mimeType !== command.asset.mimeType || prior.width !== command.asset.width || prior.height !== command.asset.height || prior.byteLength !== command.asset.byteLength || prior.dataUrl !== command.asset.dataUrl)) return { accepted: false, reason: "An asset with this content identity has conflicting source data." };
    if (oldId === command.asset.id) return { accepted: false, reason: "This is already the current source. Choose a different image." };
    const keepOld = Object.values(document.componentLibrary??{}).some(d=>d.type==="image"&&d.params.assetId===oldId)||Object.values(document.features).some(entry => entry !== feature && entry.type === "image" && entry.params.assetId === oldId);
    const retained = Object.values(document.rasterAssets ?? {}).reduce((sum, asset) => sum + asset.byteLength, 0);
    if (retained - (keepOld ? 0 : old.byteLength) + (prior ? 0 : command.asset.byteLength) > MAX_DOCUMENT_RASTER_BYTES) return { accepted: false, reason: "The document image limit is 3 MiB. Use a smaller replacement or remove other image placements." };
    document.rasterAssets![command.asset.id] = prior ?? structuredClone(command.asset);
    feature.params = { ...feature.params, assetId: command.asset.id };
    if (!keepOld) delete document.rasterAssets![oldId];
    document.revision++;
  });

  bus.registerHandler("insert-image", command => {
    if (command.type !== "insert-image") return;
    const id = command.id ?? `image-${crypto.randomUUID()}`;
    const featureId = `feature-${id}`;
    const layerId = command.layerId ?? "layer-default";
    const layer = document.layers[layerId];
    if (document.objects[id] || document.features[featureId]) return { accepted: false, reason: "An image already uses this ID. Import it again to create a separate placement." };
    if (!layer || layer.locked) return { accepted: false, reason: "Choose an unlocked layer before placing an image." };
    if (!validRasterAsset(command.asset)) return { accepted: false, reason: "The image source is invalid or exceeds the supported file limits." };
    const prior = document.rasterAssets?.[command.asset.id];
    if (prior && (prior.contentHash !== command.asset.contentHash || prior.mimeType !== command.asset.mimeType || prior.width !== command.asset.width || prior.height !== command.asset.height || prior.byteLength !== command.asset.byteLength || prior.dataUrl !== command.asset.dataUrl)) return { accepted: false, reason: "An asset with this content identity has conflicting source data." };
    const retained = Object.values(document.rasterAssets ?? {}).reduce((sum, asset) => sum + asset.byteLength, 0);
    if (!prior && retained + command.asset.byteLength > MAX_DOCUMENT_RASTER_BYTES) return { accepted: false, reason: "The document image limit is 3 MiB. Remove unused image placements or use a smaller source." };
    const params = { kind: "image", assetId: command.asset.id, workPlane: command.workPlane, width: command.width, height: command.height, crop: { x: 0, y: 0, width: 1, height: 1 } };
    if (!validImageNodeParams(params)) return { accepted: false, reason: "Image size or placement is outside the supported range." };
    document.rasterAssets ??= {};
    document.rasterAssets[command.asset.id] = prior ?? structuredClone(command.asset);
    document.objects[id] = { id, geometryId: `geometry-${id}`, name: command.asset.name.replace(/\.[^.]+$/, "") || "Image", visible: true, layerId, transform: { translation: [...command.center], rotation: [0, 0, 0], scale: [1, 1, 1] } };
    document.features[featureId] = { id: featureId, type: "image", inputs: [], output: id, params };
    document.rootObjects.push(id);
    layer.objectIds.push(id);
    document.revision++;
    return id;
  });

  bus.registerHandler("update-image", command => {
    if (command.type !== "update-image") return;
    const object = document.objects[command.objectId];
    const feature = Object.values(document.features).find(entry => entry.output === command.objectId && entry.type === "image");
    if (!object || !feature) return { accepted: false, reason: "Select an image placement to edit its size or crop." };
    const layer = document.layers[object.layerId];
    if (layer?.locked || !object.visible || layer?.visible === false) return { accepted: false, reason: "The image or its layer is hidden or locked. Make it visible and unlock the layer before editing." };
    const next = { ...feature.params, ...(command.width === undefined ? {} : { width: command.width }), ...(command.height === undefined ? {} : { height: command.height }), ...(command.crop === undefined ? {} : { crop: structuredClone(command.crop) }), ...(command.mask === undefined ? {} : { mask: command.mask }), ...(command.opacity === undefined ? {} : { opacity: command.opacity }), ...(command.adjustments === undefined ? {} : { adjustments: structuredClone(command.adjustments) }) };
    if (!validImageNodeParams(next)) return { accepted: false, reason: "The crop must stay inside the source image and retain a visible area." };
    if (JSON.stringify(next) === JSON.stringify(feature.params)) return { accepted: false, reason: "Image is unchanged. Edit its placement before applying." };
    feature.params = next;
    document.revision++;
  });
}

