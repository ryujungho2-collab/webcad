import {modelDrawingStyle} from "../precision/layerStyle";
import {collectFrameStitchScene} from "./frameStitchScene";
import {collectFrameSheetItems} from "./frameSheetScene";
import {frameLinkAnnotations} from "../precision/frameLinks";
import {validDrawingFrame} from "@agent-webcad/cad-document";
import {assertFrameMembers,frameSourceMapping} from "../precision/drawingFrame";
import type {CadArtboard} from "@agent-webcad/cad-document";
import {modelSheetOwnedIds} from "../precision/modelSheet";
import {assertProjectionExport} from "../precision/modelPresentation";
import * as THREE from "three";
import type { CadDocument, CadFeature } from "@agent-webcad/cad-document";
import { cadDocument } from "../state/cadDocument";
import { getObjectTransform } from "../precision/objectTransform";
import {
  buildBooleanMesh,
  buildChamferMesh,
  buildExtrudeMesh,
  buildFilletMesh,
  buildLoftMesh, buildShellMesh,
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
import { drawingLineType, layerStyle, paperDash } from "../precision/layerStyle";
import { worldDraftingGeometry } from "../precision/draftingGeometry";
import { clipSvgPolylinesToArtboard } from "./artboardSvg";
import type { CadImageNodeParams } from "@agent-webcad/cad-document";

export const EXPORTABLE_SOLID_TYPES = ["primitive", "extrude", "boolean", "fillet", "chamfer", "revolve", "sweep", "loft","shell"];

function assertResolvedFaceSource(feature:CadFeature,document:CadDocument,seen=new Set<string>()){
  if(seen.has(feature.id))return;seen.add(feature.id);
  if(feature.type==="shell"&&feature.params.referenceStatus!=="resolved")throw Error(`Cannot export ${feature.output}: Shell removed faces are unresolved. Rebind explicitly.`);
  const sketchId=feature.params.faceSketchId??(feature.params.faceCut as {sketchId?:string}|undefined)?.sketchId;
  if(typeof sketchId==="string"&&document.sketches?.[sketchId]?.faceStatus!=="resolved")throw Error(`Cannot export ${feature.output}: its face sketch source is unresolved. Rebind the intended face first.`);
  if(feature.params.faceHole&&feature.params.faceHoleStatus!=="resolved")throw Error(`Cannot export ${feature.output}: its Hole source face is unresolved. Rebind the intended face first.`);
  for(const id of feature.inputs){const source=Object.values(document.features).find(entry=>entry.output===id);if(source)assertResolvedFaceSource(source,document,seen);}
}

function isVisible(objectId: string, document: CadDocument = cadDocument): boolean {
  const object = document.objects[objectId];
  const layer = object ? document.layers[object.layerId] : undefined;
  return Boolean(object?.visible && layer?.visible !== false);
}

/** Same builder dispatch as the viewport sync, so export can never disagree with the render. */
function meshForFeature(feature: CadFeature): Promise<MeshData> {
  return feature.type === "shell" ? buildShellMesh(feature.params) : feature.type === "boolean"
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
    assertResolvedFaceSource(feature,cadDocument);
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
export function collectExportDrawings(plane: WorkPlaneId, document: CadDocument = cadDocument, objectIds?:string[]): SvgPolyline[] {
  assertProjectionExport(document,objectIds);
  const frame = WORK_PLANES[plane];
  const lines: SvgPolyline[] = [];
  for (const id of objectIds??document.rootObjects) {
    const object = document.objects[id];
    const feature = Object.values(document.features).find((entry) => entry.output === id);
    if (!object || !feature || !isVisible(id, document)) continue;
    if(feature.type === "drafting" && String(feature.params.workPlane??"XY")===plane) {
      lines.push(...worldDraftingGeometry(document,object,feature).lines.map(line=>({objectId:id,holes:line.holes?.map(ring=>ring.map(p=>worldToPlane(p,frame))),...line.spline?{spline:{...line.spline,controlPoints:line.spline.controlPoints.map(p=>[...worldToPlane(p,frame),0] as [number,number,number])},tolerance:.02}:{},points:line.points.map(p=>worldToPlane(p,frame)),closed:line.closed,color:line.vectorStyle?.stroke??line.style.color,lineWeight:line.vectorStyle?.strokeWidth??line.style.lineWeight,opacity:line.vectorStyle?.opacity,fill:line.vectorStyle?.fill??undefined,dash:paperDash(line.style.lineType)})));continue;
    }
    if(feature.type !== "drawing")continue;
    // A finite output sheet needs an explicit clipping window for unbounded
    // geometry. Never export its short direction definition as a segment.
    if (["infinite-line", "ray", "point"].includes(String(feature.params.kind))) continue;
    const world = getWorldDrawingGeometry(object, feature);
    if (!world?.points?.length || world.workPlane !== plane) continue;
    if(world.spline&&!world.planeAligned)throw Error("SVG/PDF needs a spline aligned with the output plane; use exact WCS DXF for spatial curves.");
    const vectorStyle = feature.params.vectorStyle && typeof feature.params.vectorStyle === "object" ? feature.params.vectorStyle as { stroke?: string; fill?: string | null; opacity?: number; strokeWidth?: number } : undefined;
    const layer = modelDrawingStyle(feature.params,layerStyle(document.layers[object.layerId]));
    lines.push({
      objectId:id,
      ...(world.spline?{spline:{...world.spline,controlPoints:world.spline.controlPoints.map(p=>[...worldToPlane(p,frame),0] as [number,number,number])},tolerance:.02}:{}),
      ...(world.ellipse?{ellipse:{...world.ellipse,center:[...worldToPlane(world.ellipse.center,frame),0] as [number,number,number],axisU:[world.ellipse.axisU.reduce((s,v,i)=>s+v*frame.xAxis[i],0),world.ellipse.axisU.reduce((s,v,i)=>s+v*frame.yAxis[i],0),0] as [number,number,number],axisV:[world.ellipse.axisV.reduce((s,v,i)=>s+v*frame.xAxis[i],0),world.ellipse.axisV.reduce((s,v,i)=>s+v*frame.yAxis[i],0),0] as [number,number,number]}}:{}),
      color:vectorStyle?.stroke ?? layer.color,
      lineWeight:vectorStyle?.strokeWidth ?? layer.lineWeight,
      opacity:vectorStyle?.opacity,
      fill:world.closed && typeof vectorStyle?.fill === "string" ? vectorStyle.fill : undefined,
      dash:paperDash(drawingLineType(feature.params.construction,layer)),
      points: world.points.map((point) => worldToPlane(point, frame)),
      closed: world.closed,
    });
  }
  return lines;
}


/** Keep affine glyph transforms when rotation + a scalar height cannot represent them. */
function textBasis(axes: import("../precision/workPlane").Vec3[] | undefined, frame: typeof WORK_PLANES.XY, name: string): Pick<SvgText,"basis"> {
  if(!axes)return {};
  const u=worldToPlane(axes[0],frame),v=worldToPlane(axes[1],frame);
  if(axes.some(axis=>Math.abs(axis.reduce((sum,x,i)=>sum+x*frame.normal[i],0))>1e-6))throw Error(`Cannot export ${name}: text is tilted out of its work plane.`);
  if(Math.abs(u[0]*v[0]+u[1]*v[1])<1e-8&&Math.abs(Math.hypot(...v)-1)<1e-8&&u[0]*v[1]-u[1]*v[0]>0)return {};
  return {basis:[u,v]};
}

/** Active-plane annotations are output graphics; their associative definitions stay in JSON. */
export function collectExportAnnotations(plane: WorkPlaneId, document: CadDocument = cadDocument, objectIds?:string[]): { lines: SvgPolyline[]; texts: SvgText[] } {
  const frame = WORK_PLANES[plane], lines: SvgPolyline[] = [], texts: SvgText[] = [];
  for (const id of objectIds??document.rootObjects) {
    const object = document.objects[id], feature = Object.values(document.features).find(f=>f.output===id);
    if (!object || !feature || String(feature.params.workPlane ?? "XY") !== plane || !isVisible(id,document)) continue;
    if (feature.type === "drafting") {
      texts.push(...worldDraftingGeometry(document,object,feature).texts.map(text=>({objectId:id,position:worldToPlane(text.point,frame),text:text.text,color:text.style.color,size:text.height,angle:text.angle,align:text.align,...textBasis(text.axes,frame,object.name)})));
      continue;
    }
    if (feature.type !== "dimension") continue;
    const annotation = resolveDimension(feature.params);
    if (!annotation) throw new Error(`Cannot export ${object.name}: repair its annotation or source references first.`);
    const style = layerStyle(document.layers[object.layerId]);
    const transform=getObjectTransform(object,feature),matrix=new THREE.Matrix4().compose(new THREE.Vector3(...transform.translation),new THREE.Quaternion().setFromEuler(new THREE.Euler(...transform.rotation.map(THREE.MathUtils.degToRad) as [number,number,number])),new THREE.Vector3(...transform.scale));
    const map=(p:import("../precision/workPlane").Vec3)=>worldToPlane(new THREE.Vector3(...p).applyMatrix4(matrix).toArray() as [number,number,number],frame);
    const linear=new THREE.Matrix3().setFromMatrix4(matrix),u=new THREE.Vector3(...frame.xAxis).applyMatrix3(linear),v=new THREE.Vector3(...frame.yAxis).applyMatrix3(linear),scale=u.length();
    const angle=Math.atan2(u.dot(new THREE.Vector3(...frame.yAxis)),u.dot(new THREE.Vector3(...frame.xAxis)))*180/Math.PI;
    const axes=[u.divideScalar(scale).toArray(),v.divideScalar(scale).toArray()] as [import("../precision/workPlane").Vec3,import("../precision/workPlane").Vec3];
    lines.push(...annotation.segments.map(segment=>({ objectId:id, points:segment.map(map), closed:false, color:style.color, lineWeight:style.lineWeight, dash:paperDash(style.lineType) })));
    texts.push({objectId:id,position:map(annotation.textPosition),text:annotation.text,color:style.color,size:annotation.textHeight*scale,...(angle?{angle}:{}),...textBasis(axes,frame,object.name)});
  }
  return { lines, texts };
}

/** Visible drawings clipped to one board's finite plane bounds. */
export function collectArtboardExportDrawings(artboardId: string): SvgPolyline[] {
  const board = cadDocument.artboards?.[artboardId];
  if (!board || !board.visible) throw new Error("Choose a visible artboard before exporting its SVG.");
  if(board.frameSheet)return collectFrameSheetItems(board,cadDocument,collectFrameExportItems).flatMap(i=>i.type==="polyline"?[i.polyline]:[]);
  if(board.frame)return collectFrameExportItems(board).flatMap(i=>i.type==="polyline"?[i.polyline]:[]);
  const ids=modelSheetOwnedIds(cadDocument,artboardId);return clipSvgPolylinesToArtboard([...collectExportDrawings(board.workPlane,cadDocument,ids), ...collectExportAnnotations(board.workPlane,cadDocument,ids).lines], board);
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
  if(board.frame||board.frameSheet)return [];
  return collectExportImages(board.workPlane);
}

/**
 * One board scene in document object order. This order is the export stacking
 * contract for vector/raster/annotation compositions. Text is clipped by the
 * SVG board clipPath, never discarded merely because its anchor is outside.
 */
export function collectArtboardExportItems(artboardId: string): SvgExportItem[] {
  const board = cadDocument.artboards?.[artboardId];
  if (!board || !board.visible) throw new Error("Choose a visible artboard before exporting its artwork.");
  if(board.frameSheet)return collectFrameSheetItems(board,cadDocument,collectFrameExportItems);
  if(board.frame)return collectFrameExportItems(board);
  const scopedIds=modelSheetOwnedIds(cadDocument,artboardId);
  assertProjectionExport(cadDocument,scopedIds);
  for (const id of scopedIds??cadDocument.rootObjects) {
    const object = cadDocument.objects[id], feature = Object.values(cadDocument.features).find(entry => entry.output === id);
    if (!object || !feature || !isVisible(id)) continue;
    if (feature.type === "drawing" && feature.params.workPlane === board.workPlane && ["point", "infinite-line", "ray"].includes(String(feature.params.kind))) {
      throw new Error(`Cannot export ${object.name}: ${String(feature.params.kind)} geometry has no finite artboard representation yet. Convert it to finite drawing geometry or hide it, then export again.`);
    }
  }
  const annotations = collectExportAnnotations(board.workPlane,cadDocument,scopedIds);
  const drawings = clipSvgPolylinesToArtboard([...collectExportDrawings(board.workPlane,cadDocument,scopedIds), ...annotations.lines], board);
  const images = collectArtboardExportImages(artboardId);
  const textsByObject = new Map<string, SvgText[]>();
  for (const text of annotations.texts) {
    if (!text.objectId) continue;
    const group = textsByObject.get(text.objectId) ?? [];
    group.push(text); textsByObject.set(text.objectId, group);
  }
  const drawingsByObject = new Map<string, SvgPolyline[]>();
  for (const drawing of drawings) {
    if (!drawing.objectId) continue;
    const group = drawingsByObject.get(drawing.objectId) ?? [];
    group.push(drawing); drawingsByObject.set(drawing.objectId, group);
  }
  const imageByObject = new Map(images.map(image => [image.id, image]));
  const items: SvgExportItem[] = [];
  for (const id of scopedIds??cadDocument.rootObjects) {
    const image = imageByObject.get(id);
    if (image) items.push({ type: "image", image });
    for (const polyline of drawingsByObject.get(id) ?? []) items.push({ type: "polyline", polyline });
    for (const text of textsByObject.get(id) ?? []) items.push({ type: "text", text });
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
    assertResolvedFaceSource(feature,cadDocument);
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

/** Presentation-only plane mapping shared by viewport and all frame exports. */
export function collectFrameExportItems(board:CadArtboard,document:CadDocument=cadDocument,sourceDocument:CadDocument=document):SvgExportItem[]{
 if(board.frame?.stitch)return collectFrameStitchScene(board,sourceDocument,collectFrameExportItems).items;
 const frame=board.frame;if(!validDrawingFrame(frame)||!board.origin.every(Number.isFinite)||!board.size.every(v=>Number.isFinite(v)&&v>0))throw Error("Frame requires valid members, finite position, positive size and scale.");
 assertFrameMembers(document,frame.memberIds,board.workPlane);assertProjectionExport(document,frame.memberIds);
 const mapping=frameSourceMapping(document,frame.memberIds),scale=1/(frame.denominator*mapping.scale),p=(v:number[]):[number,number]=>[board.origin[0]+(v[0]-mapping.origin[0]-frame.sourceOrigin[0]*mapping.scale)*scale,board.origin[1]+(v[1]-mapping.origin[1]-frame.sourceOrigin[1]*mapping.scale)*scale];
 const a=collectExportAnnotations(board.workPlane,document,frame.memberIds),lines=[...collectExportDrawings(board.workPlane,document,frame.memberIds),...a.lines].map(l=>({...l,points:l.points.map(p),holes:l.holes?.map(ring=>ring.map(p)),...(l.spline?{spline:{...l.spline,controlPoints:l.spline.controlPoints.map(q=>[...p(q),0] as [number,number,number])}}:{}),...(l.ellipse?{ellipse:{...l.ellipse,center:[...p(l.ellipse.center),0] as [number,number,number],axisU:l.ellipse.axisU.map(v=>v*scale) as [number,number,number],axisV:l.ellipse.axisV.map(v=>v*scale) as [number,number,number]}}:{})}));
 const texts=a.texts.map(t=>({...t,position:p(t.position),size:(t.size??3.5)*scale}));
 const clipped=clipSvgPolylinesToArtboard(lines,board),items:SvgExportItem[]=[];
 for(const id of frame.memberIds){for(const polyline of clipped.filter(l=>l.objectId===id))items.push({type:"polyline",polyline});for(const text of texts.filter(t=>t.objectId===id))items.push({type:"text",text});}
 const refs=frameLinkAnnotations({...document,artboards:{...document.artboards,[board.id]:board}},board);
 for(const line of clipSvgPolylinesToArtboard(refs.lines.map(l=>({...l,color:"#303030",strokeWidth:.25})),board))items.push({type:"polyline",polyline:line});
 for(const text of refs.texts)items.push({type:"text",text:{...text,color:"#303030"}});
 return items;
}
