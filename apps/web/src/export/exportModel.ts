import * as THREE from "three";
import type { CadDocument, CadFeature } from "@agent-webcad/cad-document";
import { cadDocument } from "../state/cadDocument";
import { getObjectTransform } from "../precision/objectTransform";
import {
  buildBooleanMesh,
  buildChamferMesh,
  buildExtrudeMesh,
  buildFilletMesh,
  buildLoftMesh,
  buildPrimitiveMesh,
  buildRevolveMesh,
  buildSweepMesh,
  exportStepFile,
  type MeshData,
} from "../cad/kernelGeometryService";
import type { SerializedOperand } from "../cad/kernelProtocol";
import { getWorldDrawingGeometry } from "../precision/worldGeometry";
import { worldToPlane, WORK_PLANES, type WorkPlaneId } from "../precision/workPlane";
import { meshToTriangles, type StlTriangle } from "./stlWriter";
import type { SvgExportItem, SvgImage, SvgPolyline, SvgText } from "./svgWriter";
import { resolveDimension } from "../precision/dimensionGeometry";
import { layerStyle, paperDash } from "../precision/layerStyle";
import { worldDraftingGeometry } from "../precision/draftingGeometry";
import { clipSvgPolylinesToArtboard } from "./artboardSvg";
import type { CadImageNodeParams } from "@agent-webcad/cad-document";

export const EXPORTABLE_SOLID_TYPES = ["primitive", "extrude", "boolean", "fillet", "chamfer", "revolve", "sweep", "loft"];

function isVisible(objectId: string, document: CadDocument = cadDocument): boolean {
  const object = document.objects[objectId];
  const layer = object ? document.layers[object.layerId] : undefined;
  return Boolean(object?.visible && layer?.visible !== false);
}

/** Same builder dispatch as the viewport sync, so export can never disagree with the render. */
function meshForFeature(feature: CadFeature): Promise<MeshData> {
  return feature.type === "boolean"
    ? buildBooleanMesh(feature.params)
    : feature.type === "extrude"
      ? buildExtrudeMesh(feature.params)
      : feature.type === "fillet"
        ? buildFilletMesh(feature.params)
        : feature.type === "chamfer"
          ? buildChamferMesh(feature.params)
          : feature.type === "revolve"
            ? buildRevolveMesh(feature.params)
            : feature.type === "sweep"
              ? buildSweepMesh(feature.params)
              : feature.type === "loft"
                ? buildLoftMesh(feature.params)
                : buildPrimitiveMesh(feature.params);
}

/**
 * Visible solids to STL triangles with the viewport transform baked in
 * (translation + XYZ-euler rotation + scale, same convention as the scene).
 * Drawings and sketches have no volume and are skipped.
 */
export async function collectExportSolids(objectIds?: string[]): Promise<StlTriangle[]> {
  const ids = objectIds?.length ? objectIds : cadDocument.rootObjects;
  const triangles: StlTriangle[] = [];
  for (const id of ids) {
    const object = cadDocument.objects[id];
    const feature = Object.values(cadDocument.features).find((entry) => entry.output === id);
    if (!object || !feature || !EXPORTABLE_SOLID_TYPES.includes(feature.type) || !isVisible(id)) continue;
    const mesh = await meshForFeature(feature);
    const transform = getObjectTransform(object, feature);
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...transform.translation),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(
        THREE.MathUtils.degToRad(transform.rotation[0]),
        THREE.MathUtils.degToRad(transform.rotation[1]),
        THREE.MathUtils.degToRad(transform.rotation[2]),
      )),
      new THREE.Vector3(...transform.scale),
    );
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
    const baked = meshToTriangles(mesh.positions, mesh.indices).map((triangle) => ({
      normal: new THREE.Vector3(...triangle.normal).applyMatrix3(normalMatrix).normalize().toArray() as [number, number, number],
      vertices: triangle.vertices.map((vertex) =>
        new THREE.Vector3(...vertex).applyMatrix4(matrix).toArray() as [number, number, number],
      ) as StlTriangle["vertices"],
    }));
    triangles.push(...baked);
  }
  return triangles;
}

/** Visible drawings on one work plane to 2D polylines (Y-up plane coords). */
export function collectExportDrawings(plane: WorkPlaneId, document: CadDocument = cadDocument): SvgPolyline[] {
  const frame = WORK_PLANES[plane];
  const lines: SvgPolyline[] = [];
  for (const id of document.rootObjects) {
    const object = document.objects[id];
    const feature = Object.values(document.features).find((entry) => entry.output === id);
    if (!object || !feature || !isVisible(id, document)) continue;
    if(feature.type === "drafting" && String(feature.params.workPlane??"XY")===plane) {
      lines.push(...worldDraftingGeometry(document,object,feature).lines.map(line=>({objectId:id,points:line.points.map(p=>worldToPlane(p,frame)),closed:line.closed,color:line.vectorStyle?.stroke??line.style.color,lineWeight:line.vectorStyle?.strokeWidth??line.style.lineWeight,opacity:line.vectorStyle?.opacity,fill:line.vectorStyle?.fill??undefined,dash:paperDash(line.style.lineType)})));continue;
    }
    if(feature.type !== "drawing")continue;
    // A finite output sheet needs an explicit clipping window for unbounded
    // geometry. Never export its short direction definition as a segment.
    if (["infinite-line", "ray", "point"].includes(String(feature.params.kind))) continue;
    const world = getWorldDrawingGeometry(object, feature);
    if (!world?.points?.length || world.workPlane !== plane) continue;
    const vectorStyle = feature.params.vectorStyle && typeof feature.params.vectorStyle === "object" ? feature.params.vectorStyle as { stroke?: string; fill?: string | null; opacity?: number; strokeWidth?: number } : undefined;
    const layer = layerStyle(document.layers[object.layerId]);
    lines.push({
      objectId:id,
      color:vectorStyle?.stroke ?? layer.color,
      lineWeight:vectorStyle?.strokeWidth ?? layer.lineWeight,
      opacity:vectorStyle?.opacity,
      fill:world.closed && typeof vectorStyle?.fill === "string" ? vectorStyle.fill : undefined,
      dash:paperDash(feature.params.construction?"dashed":layer.lineType),
      points: world.points.map((point) => worldToPlane(point, frame)),
      closed: world.closed,
    });
  }
  return lines;
}

/** Active-plane annotations are output graphics; their associative definitions stay in JSON. */
export function collectExportAnnotations(plane: WorkPlaneId, document: CadDocument = cadDocument): { lines: SvgPolyline[]; texts: SvgText[] } {
  const frame = WORK_PLANES[plane], lines: SvgPolyline[] = [], texts: SvgText[] = [];
  for (const id of document.rootObjects) {
    const object = document.objects[id], feature = Object.values(document.features).find(f=>f.output===id);
    if (!object || !feature || feature.type !== "dimension" || feature.params.workPlane !== plane || !isVisible(id,document)) continue;
    const annotation = resolveDimension(feature.params);
    if (!annotation) throw new Error(`Cannot export ${object.name}: repair its annotation or source references first.`);
    const style = layerStyle(document.layers[object.layerId]);
    lines.push(...annotation.segments.map(segment=>({ objectId:id, points:segment.map(p=>worldToPlane(p,frame)), closed:false, color:style.color, lineWeight:style.lineWeight })));
    texts.push({position:worldToPlane(annotation.textPosition,frame),text:annotation.text,color:style.color,size:3.5});
  }
  return { lines, texts };
}

/** Visible drawings clipped to one board's finite plane bounds. */
export function collectArtboardExportDrawings(artboardId: string): SvgPolyline[] {
  const board = cadDocument.artboards?.[artboardId];
  if (!board || !board.visible) throw new Error("Choose a visible artboard before exporting its SVG.");
  return clipSvgPolylinesToArtboard(collectExportDrawings(board.workPlane), board);
}

/** Embedded raster placements on one work plane, expressed in plane coordinates. */
export function collectExportImages(plane: WorkPlaneId, document: CadDocument = cadDocument): SvgImage[] {
  const frame = WORK_PLANES[plane], images: SvgImage[] = [];
  for (const id of document.rootObjects) {
    const object = document.objects[id], feature = Object.values(document.features).find(entry => entry.output === id && entry.type === "image");
    if (!object || !feature || !isVisible(id, document) || feature.params.workPlane !== plane) continue;
    const params = feature.params as unknown as CadImageNodeParams, asset = document.rasterAssets?.[params.assetId];
    if (!asset) throw new Error(`Image source is missing for ${object.name}; repair the image reference before exporting.`);
    const transform = getObjectTransform(object, feature);
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(...transform.translation), new THREE.Quaternion().setFromEuler(new THREE.Euler(...transform.rotation.map(THREE.MathUtils.degToRad) as [number,number,number])), new THREE.Vector3(...transform.scale));
    const corners = [[-params.width/2,-params.height/2],[params.width/2,-params.height/2],[params.width/2,params.height/2],[-params.width/2,params.height/2]].map(([x,y])=>{
      const basis=frame.xAxis.map((value,index)=>value*x+frame.yAxis[index]*y) as [number,number,number];
      return worldToPlane(new THREE.Vector3(...basis).applyMatrix4(matrix).toArray() as [number,number,number],frame);
    });
    const xAxis:[number,number]=[corners[1][0]-corners[0][0],corners[1][1]-corners[0][1]],yAxis:[number,number]=[corners[3][0]-corners[0][0],corners[3][1]-corners[0][1]];
    const width=Math.hypot(...xAxis),height=Math.hypot(...yAxis),dot=xAxis[0]*yAxis[0]+xAxis[1]*yAxis[1];
    if(width<=1e-9||height<=1e-9||Math.abs(dot)>width*height*1e-6)throw new Error(`${object.name} is tilted out of the ${plane} plane and cannot be represented faithfully in SVG.`);
    const center:[number,number]=[(corners[0][0]+corners[1][0]+corners[2][0]+corners[3][0])/4,(corners[0][1]+corners[1][1]+corners[2][1]+corners[3][1])/4];
    images.push({id,href:asset.dataUrl,center,width,height,rotation:Math.atan2(xAxis[1],xAxis[0])*180/Math.PI,crop:structuredClone(params.crop),mask:params.mask??"rect",sourceSize:[asset.width,asset.height],...(params.opacity === undefined ? {} : {opacity:params.opacity}),...(params.adjustments===undefined?{}:{adjustments:structuredClone(params.adjustments)})});
  }
  return images;
}

export function collectArtboardExportImages(artboardId:string):SvgImage[]{
  const board=cadDocument.artboards?.[artboardId];
  if(!board||!board.visible)throw new Error("Choose a visible artboard before exporting its SVG.");
  return collectExportImages(board.workPlane);
}

/**
 * One board scene in document object order. This order is the export stacking
 * contract for vector/raster compositions; unsupported plane annotations fail
 * explicitly rather than disappearing from the raster output.
 */
export function collectArtboardExportItems(artboardId: string): SvgExportItem[] {
  const board = cadDocument.artboards?.[artboardId];
  if (!board || !board.visible) throw new Error("Choose a visible artboard before exporting its artwork.");
  for (const id of cadDocument.rootObjects) {
    const object = cadDocument.objects[id], feature = Object.values(cadDocument.features).find(entry => entry.output === id);
    if (!object || !feature || !isVisible(id)) continue;
    if (feature.type === "dimension" && String(feature.params.workPlane ?? "XY") === board.workPlane) {
      throw new Error(`Cannot export ${object.name}: dimensions are not included in artboard image output yet. Convert it to drawing geometry or remove it, then export again.`);
    }
    if (feature.type === "drawing" && feature.params.workPlane === board.workPlane && ["point", "infinite-line", "ray"].includes(String(feature.params.kind))) {
      throw new Error(`Cannot export ${object.name}: ${String(feature.params.kind)} geometry has no finite artboard representation yet. Convert it to finite drawing geometry or hide it, then export again.`);
    }
    if (feature.type === "drafting" && String(feature.params.workPlane ?? "XY") === board.workPlane) {
      const textCount = worldDraftingGeometry(cadDocument, object, feature).texts.length;
      if (textCount) throw new Error(`Cannot export ${object.name}: drafting text is not included in artboard image output yet. Convert it to supported drawing geometry or remove it, then export again.`);
    }
  }
  const drawings = collectArtboardExportDrawings(artboardId);
  const images = collectArtboardExportImages(artboardId);
  const drawingsByObject = new Map<string, SvgPolyline[]>();
  for (const drawing of drawings) {
    if (!drawing.objectId) continue;
    const group = drawingsByObject.get(drawing.objectId) ?? [];
    group.push(drawing); drawingsByObject.set(drawing.objectId, group);
  }
  const imageByObject = new Map(images.map(image => [image.id, image]));
  const items: SvgExportItem[] = [];
  for (const id of cadDocument.rootObjects) {
    const image = imageByObject.get(id);
    if (image) items.push({ type: "image", image });
    for (const polyline of drawingsByObject.get(id) ?? []) items.push({ type: "polyline", polyline });
  }
  return items;
}

/**
 * Visible solids as kernel operands for STEP transfer. Same solid set and
 * visibility rules as the STL path; the worker rebuilds every shape so the
 * file always matches the render.
 */
export function collectStepSolids(objectIds?: string[]): SerializedOperand[] {
  const ids = objectIds?.length ? objectIds : cadDocument.rootObjects;
  const solids: SerializedOperand[] = [];
  for (const id of ids) {
    const object = cadDocument.objects[id];
    const feature = Object.values(cadDocument.features).find((entry) => entry.output === id);
    if (!object || !feature || !EXPORTABLE_SOLID_TYPES.includes(feature.type) || !isVisible(id)) continue;
    solids.push({
      params: structuredClone(feature.params),
      transform: structuredClone(getObjectTransform(object, feature)),
    });
  }
  return solids;
}

export async function exportStepBytes(objectIds?: string[]): Promise<Uint8Array> {
  const solids = collectStepSolids(objectIds);
  if (!solids.length) {
    throw new Error("STEP export needs at least one visible solid.");
  }
  return exportStepFile(solids);
}

export function downloadFile(data: Uint8Array | string, filename: string, mime: string) {
  const blob = new Blob([data instanceof Uint8Array ? data.buffer as ArrayBuffer : data], { type: mime });
  downloadBlob(blob, filename);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 1_000);
}
