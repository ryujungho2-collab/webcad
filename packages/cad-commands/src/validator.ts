import {validComponentContent,validSolidFinish,validArchitecturalSlab,contentId} from "@agent-webcad/cad-document";
import {validSpline,validArchitectureWall,validWallOpening} from "@agent-webcad/cad-document";
import {validStitchTarget,validStitchSeam} from "@agent-webcad/cad-document";
import {validFrameLink} from "@agent-webcad/cad-document";
import {validWorkspaceSection} from "@agent-webcad/cad-document";
import {validDrawingFrame} from "@agent-webcad/cad-document";
import {validEllipse} from "@agent-webcad/cad-document";
import {validModelClip,validModelSection,validModelSheet} from "@agent-webcad/cad-document";
import {validModelPart,validExplodedView} from "@agent-webcad/cad-document";
import { validExchangeImport } from "@agent-webcad/cad-document";
import { validScene, validAngularDefinition, validAngularReference, validAngularBranch, validModelView, validModelViewId, validDimensionStyle, validCadWorkPlane, validWorkPlaneFaceSource, validWorkPlaneId } from "@agent-webcad/cad-document";
import type { CadCommand } from "./commands";
import {validVectorStyle,validVariableName,validParameterTarget,validPatternSpec,patternSlots,MAX_PATTERN_OUTPUTS,validRasterAsset,validImageNodeParams} from "@agent-webcad/cad-document";
import { validConstructionDefinition, validSketchConstraint } from "@agent-webcad/cad-document";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isVector3(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every(isFiniteNumber);
}

function isVector2(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 && value.every(isFiniteNumber);
}

function isSketchPointRef(value: unknown) {
  return isRecord(value) && isString(value.geometryId) && isString(value.pointId);
}

function isSketchGeometry(value: unknown) {
  if (!isRecord(value) || !isString(value.id) || (value.construction !== undefined && typeof value.construction !== "boolean") || (value.kind === "rectangle" && value.angle !== undefined && !isFiniteNumber(value.angle))) return false;
  if (value.kind === "line") return isString(value.startId) && isString(value.endId) && isString(value.segmentId) && isVector2(value.start) && isVector2(value.end);
  if (value.kind === "polyline") return Array.isArray(value.vertices) && value.vertices.length >= 2 && value.vertices.every((entry) => isRecord(entry) && isString(entry.id) && isVector2(entry.point)) && Array.isArray(value.segmentIds) && value.segmentIds.every(isString) && typeof value.closed === "boolean" && (value.bulges === undefined || Array.isArray(value.bulges) && value.bulges.length === value.segmentIds.length && value.bulges.every((b:unknown)=>isFiniteNumber(b)&&Math.abs(b)<1e6));
  if (value.kind === "rectangle") return Array.isArray(value.cornerIds) && value.cornerIds.length === 4 && value.cornerIds.every(isString) && Array.isArray(value.edgeIds) && value.edgeIds.length === 4 && value.edgeIds.every(isString) && isVector2(value.origin) && isFiniteNumber(value.width) && isFiniteNumber(value.height);
  if (value.kind === "circle") return isString(value.centerId) && isString(value.curveId) && isVector2(value.center) && isFiniteNumber(value.radius);
  if (value.kind === "arc") return isString(value.centerId) && isString(value.startId) && isString(value.endId) && isString(value.curveId) && isVector2(value.center) && isFiniteNumber(value.radius) && isFiniteNumber(value.startAngle) && isFiniteNumber(value.endAngle);
  return false;
}

function isSketchConstraint(value: unknown) {
  return validSketchConstraint(value);
}

function isVector3Array(value: unknown, minimum: number) {
  return Array.isArray(value) && value.length >= minimum && value.every(isVector3);
}

function referenceRoutes(value: unknown) {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length > 4096) return false;
  const keys = new Set<string>();
  return value.every(r => {
    if (!isRecord(r) || !isString(r.dependentId) || !isString(r.sourceId) || !Array.isArray(r.resultIndices) || !r.resultIndices.length || r.resultIndices.length > 4096 || !r.resultIndices.every(i => Number.isInteger(i) && i >= 0 && i < 4096) || new Set(r.resultIndices).size !== r.resultIndices.length || (r.segmentIndex !== undefined && (!Number.isInteger(r.segmentIndex) || Number(r.segmentIndex) < 0))) return false;
    if (r.pointIndex !== undefined && (!Number.isInteger(r.pointIndex) || Number(r.pointIndex) < 0 || r.segmentIndex !== undefined)) return false;
    if (r.branch !== undefined && r.branch !== "positive" && r.branch !== "negative") return false;
    if (r.referenceSlot !== undefined && r.referenceSlot !== "first" && r.referenceSlot !== "second") return false;
    const key = JSON.stringify([r.dependentId, r.sourceId, r.referenceSlot]); if (keys.has(key)) return false; keys.add(key); return true;
  });
}

function isDrawingParams(kind: unknown, params: unknown) {
  if (!isRecord(params) || typeof kind !== "string") return false;
  if (params.kind !== undefined && params.kind !== kind) return false;
  if (params.workPlane !== undefined && !["XY", "XZ", "YZ"].includes(String(params.workPlane))) return false;
  if (params.bulges !== undefined && (!Array.isArray(params.bulges) || !params.bulges.every(isFiniteNumber))) return false;
  if (params.construction !== undefined && typeof params.construction !== "boolean") return false;
  if (kind === "point") return Array.isArray(params.points) && params.points.length === 1 && params.points.every(isVector3);
  if (kind === "infinite-line" || kind === "ray") {
    if (!Array.isArray(params.points) || params.points.length !== 2 || !params.points.every(isVector3)) return false;
    const points = params.points as number[][];
    return Math.hypot(...points[1].map((v,i)=>v-points[0][i])) > 1e-6;
  }
  if (kind === "line") return Array.isArray(params.points) && isVector3Array(params.points, 2) && params.points.length === 2;
  if (kind === "polyline") return isVector3Array(params.points, 2);
  if (kind === "rectangle") return Array.isArray(params.points) && isVector3Array(params.points, 4) && params.points.length === 4;
  if(kind==="spline")return validSpline(params);
  if(kind==="ellipse"||kind==="elliptic-arc")return validEllipse(params)&&((kind==="ellipse")===(Math.abs(Math.abs(Number(params.sweep))-2*Math.PI)<1e-9));
  if (kind === "circle") return isVector3(params.center) && isFiniteNumber(params.radius) && params.radius > 0;
  if (kind === "arc") return isVector3(params.center) && isFiniteNumber(params.radius) && params.radius > 0 && isFiniteNumber(params.startAngle) && isFiniteNumber(params.endAngle) && params.startAngle !== params.endAngle;
  return false;
}

function isDimensionParams(kind: unknown, params: unknown) {
  if (!isRecord(params) || typeof kind !== "string") return false;
  if (params.workPlane !== undefined && !["XY", "XZ", "YZ"].includes(String(params.workPlane))) return false;
  if (params.text !== undefined && params.text !== null && typeof params.text !== "string") return false;
  if (params.style !== undefined && !validDimensionStyle(params.style)) return false;
  if (params.sourceObjectId !== undefined && typeof params.sourceObjectId !== "string") return false;
  if (params.sourceSegmentId !== undefined && !isString(params.sourceSegmentId)) return false;
  if (kind === "linear") {
    if (!Array.isArray(params.points) || params.points.length !== 2 || !params.points.every(isVector2)) return false;
    const [a, b] = params.points as [number, number][];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) <= 1e-9) return false;
    if (params.orientation !== undefined && !["aligned", "horizontal", "vertical"].includes(String(params.orientation))) return false;
    return params.offset === undefined || isFiniteNumber(params.offset);
  }
  if (kind === "radius" || kind === "diameter") {
    if (!isVector2(params.center)) return false;
    if (!(isFiniteNumber(params.radius) && params.radius > 0)) return false;
    return params.angle === undefined || isFiniteNumber(params.angle);
  }
  return false;
}

export function validateCommand(command: unknown): command is CadCommand {
  if (!isRecord(command) || !isString(command.type)) {
    return false;
  }

  switch (command.type) {
    case "define-component-content":return contentId(command.id)&&isString(command.name)&&command.name.trim().length>0&&command.name.length<=200&&contentId(command.objectId);
    case "delete-component-content":return contentId(command.definitionId);
    case "place-component-content":return validComponentContent(command.content)&&(command.id===undefined||contentId(command.id))&&(command.layerId===undefined||contentId(command.layerId));
    case "update-component-content":return contentId(command.objectId)&&validComponentContent(command.content);
    case "detach-component-content":return contentId(command.objectId);
    case "create-architectural-slab":return validArchitecturalSlab(command.definition)&&(command.finish===undefined||validSolidFinish(command.finish))&&(command.id===undefined||contentId(command.id))&&(command.layerId===undefined||contentId(command.layerId));
    case "update-architectural-slab":return contentId(command.objectId)&&typeof command.level==="number"&&Number.isFinite(command.level)&&Math.abs(command.level)<=1e9&&typeof command.thickness==="number"&&Number.isFinite(command.thickness)&&command.thickness>1e-6&&command.thickness<=1e9;
    case "set-solid-finish":return contentId(command.objectId)&&(command.finish===null||validSolidFinish(command.finish));
    case "create-wall":return validArchitectureWall(command.definition)&&(command.id===undefined||isString(command.id))&&(command.layerId===undefined||isString(command.layerId));
    case "update-wall":return isString(command.objectId)&&isFiniteNumber(command.height)&&Math.abs(command.height)>1e-6&&isFiniteNumber(command.thickness)&&command.thickness>1e-6&&isFiniteNumber(command.baseLevel);
    case "upsert-wall-opening":return isString(command.objectId)&&validWallOpening(command.opening);
    case "delete-wall-opening":return isString(command.objectId)&&isString(command.openingId);
    case "refresh-wall-drawings":return isString(command.objectId);
    case "purge-unused": return Array.isArray(command.blockIds)&&command.blockIds.every(isString)&&Array.isArray(command.layerIds)&&command.layerIds.every(isString)&&command.blockIds.length+command.layerIds.length>0&&new Set(command.blockIds).size===command.blockIds.length&&new Set(command.layerIds).size===command.layerIds.length;
    case "record-dxf-source": return Array.isArray(command.objectIds)&&command.objectIds.length>0&&command.objectIds.every(isString)&&isRecord(command.receipt)&&isString(command.receipt.sourceName)&&isString(command.receipt.sourceTag)&&isFiniteNumber(command.receipt.unitMm)&&command.receipt.unitMm>0&&isVector3(command.receipt.originMm)&&Array.isArray(command.receipt.layers)&&command.receipt.layers.every(isString);
    case "detach-frame-stitch": return isString(command.artboardId);
    case "upsert-frame-stitch": return isString(command.id)&&isString(command.name)&&isVector2(command.origin)&&isString(command.anchorId)&&Array.isArray(command.targets)&&command.targets.length>=1&&command.targets.length<=15&&command.targets.every(validStitchTarget)&&(command.anchorSeam===undefined||validStitchSeam(command.anchorSeam))&&["model","points"].includes(String(command.mode))&&isFiniteNumber(command.tolerance)&&command.tolerance>=1e-6&&command.tolerance<=1&&["keep","first"].includes(String(command.duplicates));
    case "delete-frame-sheet-set": return isString(command.setId);
    case "layout-frame-sheet-set": return isString(command.id)&&command.id.trim().length>0&&command.id.length<=200&&isString(command.name)&&command.name.trim().length>0&&command.name.length<=200&&[command.frameIds,command.sectionIds,command.fixedFrameIds].every(v=>Array.isArray(v)&&v.length<=1000&&v.every(isString)&&new Set(v).size===v.length)&&(Array.isArray(command.frameIds)&&Array.isArray(command.sectionIds)&&(command.frameIds.length+command.sectionIds.length)>0)&&Array.isArray(command.denominators)&&command.denominators.length>0&&command.denominators.length<=16&&command.denominators.every(v=>isFiniteNumber(v)&&v>0)&&isVector2(command.origin)&&isVector2(command.size)&&command.size.every(v=>v>0)&&isFiniteNumber(command.margin)&&command.margin>=1&&isFiniteNumber(command.gap)&&command.gap>=0&&isFiniteNumber(command.maxPages)&&Number.isInteger(command.maxPages)&&command.maxPages>=1&&command.maxPages<=16&&["none","orthographic"].includes(String(command.alignment))&&["standard","compact"].includes(String(command.template))&&isRecord(command.fields)&&["drawingName","author","revision"].every(k=>typeof (command.fields as Record<string,unknown>)[k]==="string"&&String((command.fields as Record<string,unknown>)[k]).length<=80)&&String(command.fields.drawingName).trim().length>0;
    case "record-exchange-import": return validExchangeImport(command.receipt);
    case "register-model-part": return validModelPart(command.part);
    case "place-model-part": return isString(command.partId)&&isVector3(command.translation)&&isVector3(command.rotation);
    case "remove-model-part": return isString(command.partId);
    case "upsert-exploded-view": return validExplodedView(command.view);
    case "activate-exploded-view": return command.viewId===null||isString(command.viewId);
    case "delete-exploded-view": return isString(command.viewId);
    case "delete-model-projection": return isString(command.projectionId);
    case "upsert-model-projection": return (command.hiddenLines===undefined||command.hiddenLines==="omit")&& (command.direction===undefined||command.direction==="opposite")&& (command.method===undefined||command.method==="brep-hlr")&&isString(command.id)&&isString(command.name)&&command.name.trim().length>0&&command.name.length<=200&&Array.isArray(command.partIds)&&command.partIds.length>0&&command.partIds.every(isString)&&new Set(command.partIds).size===command.partIds.length&&["XY","XZ","YZ"].includes(String(command.basis))&&isVector2(command.origin)&&isFiniteNumber(command.scale)&&command.scale>0&&isString(command.layerId);
    case "upsert-model-view": return validModelView(command.view);
    case "delete-model-view": return validModelViewId(command.viewId);
    case "upsert-scene": return validScene(command.scene);
    case "delete-scene": return isString(command.sceneId);
    case "upsert-frame-link": return validFrameLink(command.link);
    case "delete-frame-link": return isString(command.linkId);
    case "layout-frame-links": return isString(command.frameId)&&(command.translation===undefined||isVector2(command.translation));
    case "upsert-workspace-section": return validWorkspaceSection(command.section);
    case "delete-workspace-section": return isString(command.sectionId);
    case "create-artboard": return (command.frame === undefined || validDrawingFrame(command.frame)) && (command.id === undefined || isString(command.id)) && (command.name === undefined || isString(command.name)) && ["XY","XZ","YZ"].includes(String(command.workPlane)) && isVector2(command.origin) && isVector2(command.size) && command.size[0] > 0 && command.size[1] > 0 && (command.background === undefined || typeof command.background === "string" && /^#[0-9a-f]{6}$/i.test(command.background)) && (command.backgroundOpacity === undefined || typeof command.backgroundOpacity === "number" && Number.isFinite(command.backgroundOpacity) && command.backgroundOpacity >= 0 && command.backgroundOpacity <= 1) && (command.showGrid === undefined || typeof command.showGrid === "boolean");
    case "update-artboard": return (command.frame === undefined || validDrawingFrame(command.frame)) && isString(command.artboardId) && (command.name === undefined || isString(command.name)) && (command.workPlane === undefined || ["XY","XZ","YZ"].includes(String(command.workPlane))) && (command.origin === undefined || isVector2(command.origin)) && (command.size === undefined || isVector2(command.size) && command.size[0] > 0 && command.size[1] > 0) && (command.background === undefined || typeof command.background === "string" && /^#[0-9a-f]{6}$/i.test(command.background)) && (command.backgroundOpacity === undefined || typeof command.backgroundOpacity === "number" && Number.isFinite(command.backgroundOpacity) && command.backgroundOpacity >= 0 && command.backgroundOpacity <= 1) && (command.showGrid === undefined || typeof command.showGrid === "boolean") && (command.visible === undefined || typeof command.visible === "boolean") && (command.locked === undefined || typeof command.locked === "boolean");
    case "delete-artboard": return isString(command.artboardId);
    case "insert-image": return (command.id === undefined || isString(command.id)) && (command.layerId === undefined || isString(command.layerId)) && validRasterAsset(command.asset) && ["XY", "XZ", "YZ"].includes(String(command.workPlane)) && isVector3(command.center) && validImageNodeParams({ kind: "image", assetId: command.asset.id, workPlane: command.workPlane, width: command.width, height: command.height, crop: { x: 0, y: 0, width: 1, height: 1 } });
    case "replace-image-source": return isString(command.objectId) && validRasterAsset(command.asset);
    case "update-image": return isString(command.objectId) && (command.width === undefined || isFiniteNumber(command.width) && command.width > 0 && command.width <= 1_000_000) && (command.height === undefined || isFiniteNumber(command.height) && command.height > 0 && command.height <= 1_000_000) && (command.crop === undefined || validImageNodeParams({ kind: "image", assetId: "asset", workPlane: "XY", width: 1, height: 1, crop: command.crop })) && (command.adjustments === undefined || validImageNodeParams({ kind: "image", assetId: "asset", workPlane: "XY", width: 1, height: 1, crop: { x: 0, y: 0, width: 1, height: 1 }, adjustments: command.adjustments }));
    case "update-construction": return isString(command.objectId) && validConstructionDefinition(command.definition);
    case "create-construction": return validConstructionDefinition(command.definition) && ["XY","XZ","YZ"].includes(String(command.workPlane)) && (command.id === undefined || isString(command.id)) && (command.name === undefined || isString(command.name)) && (command.layerId === undefined || isString(command.layerId)) && (command.construction === undefined || typeof command.construction === "boolean");
    case "edit-polyline": return isString(command.objectId) && (command.operation === "insert" ? isString(command.segmentId) && isVector3(command.point) : command.operation === "delete" ? isString(command.controlId) : command.operation === "to-arc" ? isString(command.segmentId) && isFiniteNumber(command.bulge) && Math.abs(command.bulge)>1e-9 && Math.abs(command.bulge)<1e6 : command.operation === "to-line" ? isString(command.segmentId) : command.operation === "open" || command.operation === "close") && referenceRoutes(command.referenceRoutes);
    case "lengthen-drawing": return isString(command.objectId) && ["start", "end"].includes(String(command.endpoint)) && ["total", "delta", "percent", "angle"].includes(String(command.mode)) && isFiniteNumber(command.value) && (command.mode === "delta" || command.value > 0);
    case "stretch-drawings": return Array.isArray(command.objectIds) && command.objectIds.length > 0 && command.objectIds.length <= 4096 && command.objectIds.every(isString) && new Set(command.objectIds).size === command.objectIds.length && ["XY", "XZ", "YZ"].includes(String(command.workPlane)) && isVector3(command.first) && isVector3(command.second) && isVector3(command.delta);
    case "join-drawings":
      return Array.isArray(command.objectIds) && command.objectIds.length >= (Array.isArray(command.bridges) && command.bridges.length ? 1 : 2) && command.objectIds.length <= 256 && command.objectIds.every(isString) && new Set(command.objectIds).size === command.objectIds.length && (command.id === undefined || isString(command.id)) && referenceRoutes(command.referenceRoutes) && (command.bridges === undefined || Array.isArray(command.bridges) && command.bridges.length <= 256 && command.bridges.every(b => isRecord(b) && command.objectIds instanceof Array && command.objectIds.includes(b.fromId) && command.objectIds.includes(b.toId) && ["start", "end"].includes(String(b.fromEnd)) && ["start", "end"].includes(String(b.toEnd)) && (b.fromId !== b.toId || b.fromEnd !== b.toEnd)));
    case "explode-drawings": return Array.isArray(command.objectIds) && command.objectIds.length >= 1 && command.objectIds.length <= 256 && command.objectIds.every(isString) && new Set(command.objectIds).size === command.objectIds.length && (command.id === undefined || isString(command.id)) && referenceRoutes(command.referenceRoutes);
    case "trim-contour": return isString(command.objectId) && Array.isArray(command.cutterIds) && command.cutterIds.length > 0 && command.cutterIds.length <= 256 && command.cutterIds.every(isString) && !command.cutterIds.includes(command.objectId) && new Set(command.cutterIds).size === command.cutterIds.length && isVector3(command.pickPoint) && (command.rejoin === undefined || typeof command.rejoin === "boolean") && referenceRoutes(command.referenceRoutes);
    case "break-drawing": return isString(command.objectId) && isVector3(command.firstPoint) && (command.secondPoint === undefined || isVector3(command.secondPoint)) && referenceRoutes(command.referenceRoutes) && (command.keepResultIndices === undefined || Array.isArray(command.keepResultIndices) && command.keepResultIndices.length > 0 && command.keepResultIndices.length <= 2 && command.keepResultIndices.every(i => Number.isInteger(i) && i >= 0 && i < 2) && new Set(command.keepResultIndices).size === command.keepResultIndices.length);
    case "convert-contour-edge": return isString(command.objectId) && Number.isInteger(command.segmentIndex) && (command.segmentIndex as number) >= 0 && ["line", "arc"].includes(String(command.target)) && (command.radius === undefined || isFiniteNumber(command.radius)) && (command.side === undefined || ["left", "right"].includes(String(command.side))) && referenceRoutes(command.referenceRoutes);
    case "create-pattern": return Array.isArray(command.sourceObjectIds) && command.sourceObjectIds.length > 0 && command.sourceObjectIds.length <= 32 && command.sourceObjectIds.every(isString) && new Set(command.sourceObjectIds).size === command.sourceObjectIds.length && validPatternSpec(command.spec) && command.sourceObjectIds.length * (patternSlots(command.spec)-1) <= MAX_PATTERN_OUTPUTS && (command.id === undefined || isString(command.id)) && (command.layerId === undefined || isString(command.layerId));
    case "update-pattern": return isString(command.patternId) && validPatternSpec(command.spec);
    case "detach-pattern": case "delete-pattern": return isString(command.patternId);
    case "set-variable": return validVariableName(command.name) && ["length","angle","scalar"].includes(String(command.quantity)) && typeof command.expression === "string" && command.expression.trim().length > 0 && command.expression.length <= 512;
    case "remove-variable": return validVariableName(command.name);
    case "set-parameter-binding": return validParameterTarget(command.target) && typeof command.expression === "string" && command.expression.trim().length > 0 && command.expression.length <= 512;
    case "remove-parameter-binding": return isString(command.bindingId);
    case "set-layer-style":
      return isString(command.layerId) && isRecord(command.style) && /^#[0-9a-f]{6}$/i.test(String(command.style.color)) && ["continuous","dashed","center"].includes(String(command.style.lineType)) && isFiniteNumber(command.style.lineWeight) && command.style.lineWeight > 0 && command.style.lineWeight <= 2;
    case "set-vector-style": return isString(command.objectId) && validVectorStyle(command.style);
    case "set-model-clipping": return validModelClip(command.clipping);
    case "upsert-model-section": return isRecord(command.view)&&validModelSection({...command.view,status:"resolved",outputs:{}});
    case "delete-model-section": return isString(command.viewId);
    case "delete-model-sheet-set": return typeof command.setId==="string"&&command.setId.length>0;
    case "layout-model-sheet-set": return validateCommand({...command,type:"auto-layout-model-sheet"})&&typeof command.maxPages==="number"&&isFiniteNumber(command.maxPages)&&Number.isInteger(command.maxPages)&&command.maxPages>=1&&command.maxPages<=16&&["none","orthographic"].includes(String(command.alignment))&&["standard","compact"].includes(String(command.template))&&typeof command.margin==="number"&&command.margin>=1&&typeof command.fields==="object"&&command.fields!==null&&["drawingName","author","revision"].every(k=>typeof (command.fields as Record<string,unknown>)[k]==="string"&&String((command.fields as Record<string,unknown>)[k]).length<=80)&&String((command.fields as Record<string,unknown>).drawingName).trim().length>0;
    case "auto-layout-model-sheet": return [command.id,command.name,command.artboardId].every(v=>typeof v==="string"&&v.trim().length>0&&v.length<=200)&&Array.isArray(command.viewIds)&&command.viewIds.length>0&&command.viewIds.length<=64&&command.viewIds.every(v=>typeof v==="string"&&v.length>0)&&new Set(command.viewIds).size===command.viewIds.length&&Array.isArray(command.fixedViewIds)&&new Set(command.fixedViewIds).size===command.fixedViewIds.length&&command.fixedViewIds.every(id=>(command.viewIds as unknown[]).includes(id))&&Array.isArray(command.denominators)&&command.denominators.length>0&&command.denominators.length<=12&&command.denominators.every(v=>typeof v==="number"&&Number.isFinite(v)&&v>0)&&Array.isArray(command.origin)&&command.origin.length===2&&command.origin.every(Number.isFinite)&&Array.isArray(command.size)&&command.size.length===2&&command.size.every(v=>typeof v==="number"&&Number.isFinite(v)&&v>0)&&typeof command.margin==="number"&&Number.isFinite(command.margin)&&command.margin>=0&&typeof command.gap==="number"&&Number.isFinite(command.gap)&&command.gap>=0;
    case "upsert-model-sheet": return validModelSheet({...command,titleId:"title",artboardId:command.artboardId})&&Array.isArray(command.origin)&&command.origin.length===2&&command.origin.every(Number.isFinite)&&Array.isArray(command.size)&&command.size.length===2&&command.size.every(v=>typeof v==="number"&&Number.isFinite(v)&&v>0);
    case "delete-model-sheet": return isString(command.sheetId);
    case "upsert-model-dimension": return isString(command.id)&&isString(command.sourceObjectId)&&(command.segmentId===undefined||isString(command.segmentId))&&["linear","radius","diameter"].includes(String(command.dimension))&&isFiniteNumber(command.offset)&&isFiniteNumber(command.angle)&&["horizontal","vertical","aligned"].includes(String(command.orientation))&&isFiniteNumber(command.height)&&command.height>0&&isString(command.layerId);
    case "upsert-model-note": return isString(command.id)&&isString(command.sourceObjectId)&&["center","start","end"].includes(String(command.anchor))&&["live","snapshot"].includes(String(command.mode))&&["text","length","diameter","area"].includes(String(command.quantity))&&typeof command.text==="string"&&command.text.length<=4000&&Array.isArray(command.point)&&command.point.length===2&&command.point.every(Number.isFinite)&&typeof command.height==="number"&&Number.isFinite(command.height)&&command.height>0&&isString(command.layerId);
    case "create-drafting":
      return isRecord(command.params) && ["face","text","chain","hatch","floor-plan","leader"].includes(String(command.params.kind)) && (command.id === undefined || isString(command.id)) && (command.layerId === undefined || isString(command.layerId));
    case "update-drafting": return isString(command.objectId) && isRecord(command.params);
    case "define-block": return isString(command.id) && isString(command.name) && Array.isArray(command.objectIds) && command.objectIds.length > 0 && command.objectIds.every(isString) && isVector3(command.base);
    case "update-block": return isString(command.blockId) && (command.name === undefined || isString(command.name)) && (command.objectIds === undefined && command.base === undefined || Array.isArray(command.objectIds) && command.objectIds.length > 0 && command.objectIds.every(isString) && isVector3(command.base)) && (command.name !== undefined || command.objectIds !== undefined);
    case "set-block-override": return isString(command.blockId) && isString(command.objectId) && (command.vectorStyle === undefined || validVectorStyle(command.vectorStyle)) && (command.clear === undefined || typeof command.clear === "boolean");
    case "insert-block": return isString(command.blockId) && (command.scale===undefined||isVector3(command.scale)&&command.scale.every(value=>Math.abs(value)>1e-12)) && isVector3(command.position) && (command.angle === undefined || isFiniteNumber(command.angle)) && (command.id === undefined || isString(command.id)) && (command.layerId === undefined || isString(command.layerId));
    case "explode-block": return isString(command.objectId) && (command.recursive === undefined || typeof command.recursive === "boolean");
    case "create-sketch": return isString(command.id) && ["XY", "XZ", "YZ"].includes(String(command.workPlane)) && (command.layerId === undefined || isString(command.layerId));
    case "create-face-sketch": return isString(command.id) && validWorkPlaneId(command.planeId) && (command.layerId === undefined || isString(command.layerId));
    case "create-face-extrude": return isString(command.sketchId) && isFiniteNumber(command.distance) && Math.abs(command.distance)>1e-9 && (command.id === undefined || isString(command.id)) && (command.layerId === undefined || isString(command.layerId));
    case "create-face-cut": return isString(command.sketchId) && isString(command.targetId) && isFiniteNumber(command.distance) && Math.abs(command.distance)>1e-9 && (command.through === undefined || typeof command.through === "boolean") && (command.id === undefined || isString(command.id));
    case "create-shell":
    case "update-shell": return isString(command.type==="create-shell"?command.targetId:command.objectId) && isFiniteNumber(command.thickness) && command.thickness>1e-6 && Array.isArray(command.faceKeys) && command.faceKeys.length>0 && command.faceKeys.every(isString) && new Set(command.faceKeys).size===command.faceKeys.length && (command.type!=="create-shell"||command.id===undefined||isString(command.id));
    case "create-face-hole": return validWorkPlaneId(command.planeId) && isVector2(command.center) && isFiniteNumber(command.diameter) && command.diameter>1e-9 && isFiniteNumber(command.depth) && command.depth>1e-9 && (command.through===undefined||typeof command.through==="boolean") && (command.id===undefined||isString(command.id));
    case "update-face-hole": return isString(command.objectId) && isVector2(command.center) && isFiniteNumber(command.diameter) && command.diameter>1e-9 && isFiniteNumber(command.depth) && command.depth>1e-9 && (command.through===undefined||typeof command.through==="boolean");
    case "upsert-work-plane": return validCadWorkPlane(command.plane) && command.plane.source === undefined;
    case "attach-work-plane-face": return validWorkPlaneId(command.id) && isString(command.name) && command.name.length<=80 && validWorkPlaneFaceSource(command.source);
    case "rebind-work-plane-face": return validWorkPlaneId(command.planeId) && validWorkPlaneFaceSource(command.source);
    case "delete-work-plane": return validWorkPlaneId(command.planeId);
    case "add-sketch-geometry": return isString(command.sketchId) && isSketchGeometry(command.geometry) && (command.constraints === undefined || Array.isArray(command.constraints) && command.constraints.every(isSketchConstraint));
    case "set-sketch-construction": return isString(command.sketchId) && Array.isArray(command.geometryIds) && command.geometryIds.length > 0 && command.geometryIds.every(isString) && typeof command.construction === "boolean";
    case "remove-sketch-geometry": return isString(command.sketchId) && isString(command.geometryId);
    case "add-sketch-constraint": return isString(command.sketchId) && isSketchConstraint(command.constraint);
    case "remove-sketch-constraint": return isString(command.sketchId) && isString(command.constraintId);
    case "set-sketch-dimension": return isString(command.sketchId) && isString(command.constraintId) && isFiniteNumber(command.value);
    case "move-sketch-point": return isString(command.sketchId) && isSketchPointRef(command.point) && isVector2(command.position) && (command.behavior === undefined || ["grip", "solve-connected"].includes(String(command.behavior)));
    case "move-sketch-segment": return isString(command.sketchId) && isString(command.geometryId) && isString(command.segmentId) && isVector2(command.delta);
    case "transform-sketch-geometry": return isString(command.sketchId) && Array.isArray(command.geometryIds) && command.geometryIds.length > 0 && command.geometryIds.every(isString) && new Set(command.geometryIds).size === command.geometryIds.length && isVector2(command.translation) && isVector2(command.center) && isFiniteNumber(command.angle) && isFiniteNumber(command.scale) && command.scale > 0;
    case "duplicate-sketch-geometry": return isString(command.sketchId) && Array.isArray(command.geometryIds) && command.geometryIds.length > 0 && command.geometryIds.every(isString) && new Set(command.geometryIds).size === command.geometryIds.length && isVector2(command.offset);
    case "offset-sketch-geometry": return isString(command.sketchId) && isString(command.geometryId) && isFiniteNumber(command.distance) && command.distance > 0 && (command.side === undefined || command.side === "left" || command.side === "right");
    case "trim-sketch-geometry":
    case "extend-sketch-geometry": return isString(command.sketchId) && isString(command.targetId) && isString(command.cutterId) && command.targetId !== command.cutterId && isVector3(command.pickPoint);
    case "batch":
      return (command.label === undefined || (isString(command.label) && command.label.trim().length > 0)) &&
        Array.isArray(command.commands) && command.commands.length > 0 && command.commands.every((entry) => validateCommand(entry) && entry.type !== "batch");
    case "create-regular-polygon": return isVector2(command.center) && isFiniteNumber(command.sides) && Number.isInteger(command.sides) && command.sides>=3 && command.sides<=128 && isFiniteNumber(command.radius) && command.radius>0 && ["inscribed","circumscribed"].includes(String(command.radiusMode)) && isFiniteNumber(command.rotation) && ["XY","XZ","YZ"].includes(String(command.workPlane)) && (command.sketchId===undefined||isString(command.sketchId)) && (command.layerId===undefined||isString(command.layerId)) && (command.id===undefined||isString(command.id));
    case "create-start-tangent-arc": return Array.isArray(command.points)&&command.points.length===2&&command.points.every(isVector3)&&isFiniteNumber(command.tangentAngle)&&["XY","XZ","YZ"].includes(String(command.workPlane))&&(command.sketchId===undefined||isString(command.sketchId))&&(command.layerId===undefined||isString(command.layerId))&&(command.id===undefined||isString(command.id));
    case "create-two-line-tangent-circle": return Array.isArray(command.objectIds)&&command.objectIds.length===2&&command.objectIds.every(isString)&&command.objectIds[0]!==command.objectIds[1]&&isFiniteNumber(command.radius)&&command.radius>0&&isString(command.branch)&&(command.extend===undefined||typeof command.extend==="boolean")&&["XY","XZ","YZ"].includes(String(command.workPlane))&&(command.sketchId===undefined||isString(command.sketchId))&&(command.layerId===undefined||isString(command.layerId))&&(command.id===undefined||isString(command.id));
    case "paste-drawing-snapshot": return isString(command.sourceDocumentId)&&isVector3(command.delta)&&Array.isArray(command.members)&&command.members.length>0&&command.members.length<=64&&command.members.every(m=>isRecord(m)&&isString(m.name)&&isString(m.layerId)&&isRecord(m.params)&&isRecord(m.transform)&&isVector3(m.transform.translation)&&isVector3(m.transform.rotation)&&isVector3(m.transform.scale)&&m.transform.scale.every(v=>v>0));
    case "create-ucs-drawing": return isString(command.planeId)&&["line","circle"].includes(String(command.drawing))&&Array.isArray(command.points)&&command.points.length===2&&command.points.every(isVector2)&&(command.drawing!=="circle"||isFiniteNumber(command.radius)&&command.radius>0)&&(command.layerId===undefined||isString(command.layerId))&&(command.id===undefined||isString(command.id));
    case "move-in-ucs": return isString(command.planeId)&&Array.isArray(command.objectIds)&&command.objectIds.length>0&&command.objectIds.every(isString)&&new Set(command.objectIds).size===command.objectIds.length&&isVector3(command.delta)&&command.delta.some(v=>v!==0);
    case "create-endpoint-radius-arc": return Array.isArray(command.points) && command.points.length===2 && command.points.every(isVector3) && isFiniteNumber(command.radius) && command.radius>0 && ["left","right"].includes(String(command.centreSide)) && ["cw","ccw"].includes(String(command.direction)) && ["XY","XZ","YZ"].includes(String(command.workPlane)) && (command.sketchId===undefined||isString(command.sketchId)) && (command.layerId===undefined||isString(command.layerId)) && (command.id===undefined||isString(command.id));
    case "create-three-point-curve": return ["circle","arc"].includes(String(command.drawing)) && Array.isArray(command.points) && command.points.length===3 && command.points.every(isVector3) && ["XY","XZ","YZ"].includes(String(command.workPlane)) && (command.sketchId===undefined||isString(command.sketchId)) && (command.layerId===undefined||isString(command.layerId)) && (command.id===undefined||isString(command.id));
    case "update-spline": return isString(command.objectId)&&validSpline(command.spline);
    case "update-ellipse": return isString(command.objectId)&&validEllipse(command.ellipse);
    case "create-drawing":
      return ["spline","ellipse","elliptic-arc","line", "polyline", "rectangle", "circle", "arc", "point", "infinite-line", "ray"].includes(String(command.drawing)) &&
        isDrawingParams(command.drawing, command.params) &&
        (command.name === undefined || isString(command.name)) &&
        (command.id === undefined || isString(command.id)) &&
        (command.layerId === undefined || isString(command.layerId));
    case "create-dimension":
      return (command.dimension === "angular" ? validAngularDefinition(command.params) && Object.keys(command.params).every(k => ["first", "second", "branch", "radius", "text", "style"].includes(k)) :
        (command.dimension === "linear" || command.dimension === "radius" || command.dimension === "diameter") && isDimensionParams(command.dimension, command.params)) &&
        (command.id === undefined || isString(command.id)) &&
        (command.layerId === undefined || isString(command.layerId));
    case "update-dimension":
      return isString(command.objectId) && isRecord(command.params) &&
        Object.keys(command.params).every((key) =>
          ["orientation", "offset", "angle", "text", "radius", "branch", "first", "second", "style"].includes(key)) &&
        (command.params.style === undefined || validDimensionStyle(command.params.style)) &&
        (command.params.radius === undefined || isFiniteNumber(command.params.radius) && command.params.radius > 0) &&
        (command.params.branch === undefined || validAngularBranch(command.params.branch)) &&
        (command.params.first === undefined || validAngularReference(command.params.first)) &&
        (command.params.second === undefined || validAngularReference(command.params.second)) &&
        (command.params.orientation === undefined || ["aligned", "horizontal", "vertical"].includes(String(command.params.orientation))) &&
        (command.params.offset === undefined || isFiniteNumber(command.params.offset)) &&
        (command.params.angle === undefined || isFiniteNumber(command.params.angle)) &&
        (command.params.text === undefined || command.params.text === null || typeof command.params.text === "string");
    case "edit-drawing-control":
      return isString(command.objectId) && isString(command.controlId) && isVector3(command.point);
    case "edit-drawing-segment":
      return isString(command.objectId) && isString(command.segmentId) && isVector3(command.delta);
    case "connect-drawings":
      return isString(command.firstId) && isString(command.secondId) && command.firstId !== command.secondId &&
        isVector3(command.firstPoint) && isVector3(command.secondPoint) &&
        (command.treatment === "fillet" || command.treatment === "chamfer") &&
        isFiniteNumber(command.distance) && command.distance > 1e-9 &&
        (command.secondDistance === undefined || command.treatment === "chamfer" && isFiniteNumber(command.secondDistance) && command.secondDistance > 1e-9) &&
        (command.solutionIndex === undefined || Number.isInteger(command.solutionIndex) && Number(command.solutionIndex) >= 0 && Number(command.solutionIndex) < 8) &&
        (command.id === undefined || isString(command.id));
    case "edit-drawing-corner":
      return isString(command.objectId) && isString(command.controlId) &&
        (command.treatment === "fillet" || command.treatment === "chamfer") &&
        isFiniteNumber(command.distance) && command.distance > 1e-9 &&
        (command.secondDistance === undefined || command.treatment === "chamfer" && isFiniteNumber(command.secondDistance) && command.secondDistance > 1e-9) &&
        (command.solutionIndex === undefined || Number.isInteger(command.solutionIndex) && Number(command.solutionIndex)>=0 && Number(command.solutionIndex)<8) &&
        (command.distanceSpace === undefined || command.distanceSpace === "world");
    case "close-drawing-profile":
      return isString(command.objectId);
    case "create-extrude":
      return (command.profileRegionIds===undefined||Array.isArray(command.profileRegionIds)&&command.profileRegionIds.length>0&&command.profileRegionIds.every(isString))&&Array.isArray(command.profileObjectIds) && command.profileObjectIds.length > 0 &&
        new Set(command.profileObjectIds).size === command.profileObjectIds.length &&
        command.profileObjectIds.every(isString) && isFiniteNumber(command.distance) && Math.abs(command.distance) > 1e-9 &&
        (command.layerId === undefined || isString(command.layerId)) && (command.id === undefined || isString(command.id));
    case "update-extrude":
      return isString(command.objectId) && isFiniteNumber(command.distance) && Math.abs(command.distance) > 1e-9;
    case "create-revolve":
      return Array.isArray(command.profileObjectIds) && command.profileObjectIds.length > 0 &&
        new Set(command.profileObjectIds).size === command.profileObjectIds.length &&
        command.profileObjectIds.every(isString) &&
        (command.axis === "x" || command.axis === "y") &&
        (command.angle === undefined || (isFiniteNumber(command.angle) && command.angle > 0 && command.angle <= 360)) &&
        (command.layerId === undefined || isString(command.layerId)) && (command.id === undefined || isString(command.id));
    case "create-sweep":
      return Array.isArray(command.profileObjectIds) && command.profileObjectIds.length > 0 &&
        new Set(command.profileObjectIds).size === command.profileObjectIds.length &&
        command.profileObjectIds.every(isString) &&
        isString(command.pathObjectId) && !command.profileObjectIds.includes(command.pathObjectId as string) &&
        (command.layerId === undefined || isString(command.layerId)) && (command.id === undefined || isString(command.id));
    case "create-loft":
      return Array.isArray(command.profileObjectIds) && command.profileObjectIds.length >= 2 &&
        new Set(command.profileObjectIds).size === command.profileObjectIds.length &&
        command.profileObjectIds.every(isString) &&
        (command.ruled === undefined || typeof command.ruled === "boolean") &&
        (command.layerId === undefined || isString(command.layerId)) && (command.id === undefined || isString(command.id));
    case "update-revolve":
      return isString(command.objectId) && isFiniteNumber(command.angle) && command.angle > 0 && command.angle <= 360;
    case "offset-drawing":
      return isString(command.objectId) && isFiniteNumber(command.distance) && command.distance > 1e-9 &&
        (command.side === undefined || command.side === "left" || command.side === "right");
    case "trim-drawing":
    case "extend-drawing":
      return isString(command.targetId) && isString(command.cutterId) && command.targetId !== command.cutterId && isVector3(command.pickPoint);
    case "create-primitive":
      return isString(command.primitive) && ["box", "cylinder", "sphere", "cone", "torus"].includes(command.primitive as string) &&
        isRecord(command.params) && Object.values(command.params).every((value) => isFiniteNumber(value) && value > 0) &&
        (command.id === undefined || isString(command.id)) &&
        (command.layerId === undefined || isString(command.layerId)) &&
        (command.position === undefined || isVector3(command.position));
    case "create-box":
      return (
        isFiniteNumber(command.width) && command.width > 0 &&
        isFiniteNumber(command.depth) && command.depth > 0 &&
        isFiniteNumber(command.height) && command.height > 0 &&
        (command.id === undefined || isString(command.id)) &&
        (command.layerId === undefined || isString(command.layerId)) &&
        (command.position === undefined || isVector3(command.position))
      );
    case "boolean-cut":
      return isString(command.target) && isString(command.tool);
    case "boolean-operation":
      return isString(command.operation) && ["union", "cut", "intersect"].includes(command.operation) && isString(command.target) && isString(command.tool) && command.target !== command.tool &&
        (command.id === undefined || isString(command.id));
    case "fillet":
      return (
        isString(command.target) &&
        Array.isArray(command.edges) &&
        command.edges.every(isString) &&
        isFiniteNumber(command.radius) &&
        command.radius > 0
      );
    case "chamfer":
      return (
        isString(command.target) &&
        Array.isArray(command.edges) &&
        command.edges.every(isString) &&
        isFiniteNumber(command.distance) &&
        command.distance > 0
      );
    case "create-layer":
      return (
        (command.id === undefined || isString(command.id)) &&
        (command.name === undefined || isString(command.name))
      );
    case "rename-layer":
      return isString(command.layerId) && isString(command.name);
    case "set-layer-visible":
      return isString(command.layerId) && typeof command.visible === "boolean";
    case "set-layer-locked":
      return isString(command.layerId) && typeof command.locked === "boolean";
    case "delete-layer":
      return isString(command.layerId);
    case "move-object-to-layer":
      return isString(command.objectId) && isString(command.layerId);
    case "set-object-visible":
      return isString(command.objectId) && typeof command.visible === "boolean";
    case "isolate-object":
      return isString(command.objectId);
    case "show-all-objects":
      return true;
    case "rename-object":
      return isString(command.objectId) && isString(command.name);
    case "update-box":
      return (
        isString(command.objectId) &&
        isFiniteNumber(command.width) && command.width > 0 &&
        isFiniteNumber(command.depth) && command.depth > 0 &&
        isFiniteNumber(command.height) && command.height > 0
      );
    case "update-primitive":
      return isString(command.objectId) && isRecord(command.params) && Object.values(command.params).every((value) => isFiniteNumber(value) && value > 0);
    case "move-object":
      return isString(command.objectId) && isVector3(command.translation);
    case "rotate-object":
      return isString(command.objectId) && isVector3(command.rotation);
    case "scale-object":
      return isString(command.objectId) && isVector3(command.scale) && command.scale.every((value) => value > 0);
    case "delete-object":
      return isString(command.objectId);
    case "duplicate-object":
      return isString(command.objectId) && (command.offset === undefined || isVector3(command.offset));
    default:
      return false;
  }
}
