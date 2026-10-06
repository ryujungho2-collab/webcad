import { validateSceneGraph } from "./Scene";
import type {
  CadDocument,
} from "./CadDocument";
import {validateFeatureParameters} from "./FeatureContract";
import {resolveParameterBindings} from "./Parameters";
import {CAD_PRECISION,linearToleranceAt} from "./Precision";
import {validatePatternGroups} from "./Pattern";
import { validateConstructionGraph } from "./Construction";
import { EXTENDED_SKETCH_RELATIONS, sketchConstraintGeometryIds, validSketchConstraint } from "./SketchRelations";
import { MAX_DOCUMENT_RASTER_BYTES, validRasterAsset } from "./RasterAsset";
import { validImageNodeParams } from "./ImageNode";

type SerializedCadFile = {
  format: "agent-webcad";
  version: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;
  document: CadDocument;
};

const hasElementReferences = (document: CadDocument) => Object.values(document.features ?? {}).some(f => f?.construction?.elements !== undefined) || Object.values(document.sketches ?? {}).some(s => Array.isArray(s.constraints) && s.constraints.some(c => c.kind === "angle" && (c.firstSegmentId !== undefined || c.secondSegmentId !== undefined)));
const hasArtboards = (document: CadDocument) => document.artboards !== undefined;
const hasDiameterAnnotations=(document:CadDocument)=>Object.values(document.features??{}).some(f=>f?.type==="dimension"&&f.params?.kind==="diameter");
const hasRasterAssets = (document: CadDocument) => document.rasterAssets !== undefined || Object.values(document.features).some(feature => feature?.type === "image");
const hasImageMasks = (document: CadDocument) => Object.values(document.features).some(feature => feature?.type === "image" && feature.params.mask === "ellipse");
const hasImageAdjustments = (document: CadDocument) => Object.values(document.features).some(feature => feature?.type === "image" && typeof feature.params.opacity === "number" && feature.params.opacity < 1);
const hasImageColorAdjustments = (document: CadDocument) => Object.values(document.features).some(feature => {
  if (feature?.type !== "image" || !feature.params.adjustments || typeof feature.params.adjustments !== "object") return false;
  return Object.values(feature.params.adjustments as Record<string, unknown>).some(value => typeof value === "number" && value !== 0);
});

export function serializeDocument(
  document: CadDocument
): string {
  const file: SerializedCadFile = {
    format: "agent-webcad",
    // Older readers must reject files whose driving relationships they cannot preserve.
    version: hasDiameterAnnotations(document) ? 13 : document.scenes !== undefined ? 12 : hasImageColorAdjustments(document) ? 11 : hasImageAdjustments(document) ? 10 : hasImageMasks(document) ? 9 : hasRasterAssets(document) ? 8 : hasArtboards(document) ? 7 : hasElementReferences(document) ? 6 : Object.values(document.sketches??{}).some(s=>s.constraints.some(c=>(EXTENDED_SKETCH_RELATIONS as readonly string[]).includes(c.kind))) ? 5 : Object.values(document.features).some(f=>f.construction || ["point","infinite-line","ray"].includes(String(f.params.kind))) ? 4 : Object.values(document.features).some(f=>f.pattern)?3:document.variables !== undefined || document.parameterBindings !== undefined ? 2 : 1,
    document,
  };

  return JSON.stringify(
    file,
    null,
    2
  );
}

export function deserializeDocument(
  data: string
): CadDocument {
  const parsed =
    JSON.parse(data) as unknown;

  if (
    typeof parsed !== "object" ||
    parsed === null
  ) {
    throw new Error(
      "Invalid CAD file."
    );
  }

  const file =
    parsed as Partial<SerializedCadFile>;

  if (
    file.format !==
      "agent-webcad" ||
      (file.version !== 1 && file.version !== 2 && file.version !== 3 && file.version !== 4 && file.version !== 5 && file.version !== 6 && file.version !== 7 && file.version !== 8 && file.version !== 9 && file.version !== 10 && file.version !== 11 && file.version !== 12 && file.version !== 13) ||
    !file.document
  ) {
    throw new Error(
      "Unsupported CAD file format."
    );
  }

  const document =
    file.document;
  if(file.version! < 3&&Object.values(document.features??{}).some(f=>f?.pattern))throw new Error("Live patterns require CAD file version 3.");
  if(file.version! < 4&&Object.values(document.features??{}).some(f=>f?.construction || ["point","infinite-line","ray"].includes(String(f?.params?.kind))))throw new Error("Construction geometry requires CAD file version 4.");
  if(file.version! < 5&&Object.values(document.sketches??{}).some(s=>Array.isArray(s.constraints)&&s.constraints.some(c=>(EXTENDED_SKETCH_RELATIONS as readonly string[]).includes(c.kind))))throw new Error("Extended sketch relations require CAD file version 5.");
  if(file.version! < 6 && hasElementReferences(document))throw new Error("Topology relationship references require CAD file version 6.");
  if(file.version! < 7 && hasArtboards(document))throw new Error("Artboards require CAD file version 7.");
  if(file.version! < 8 && hasRasterAssets(document))throw new Error("Embedded image assets require CAD file version 8.");
  if(file.version! < 9 && hasImageMasks(document))throw new Error("Non-rectangular image masks require CAD file version 9.");
  if(file.version! < 10 && hasImageAdjustments(document))throw new Error("Non-default image opacity requires CAD file version 10.");
  if(file.version! < 11 && hasImageColorAdjustments(document))throw new Error("Non-default image color adjustments require CAD file version 11.");

  if(file.version! < 12 && document.scenes !== undefined)throw new Error("Scenes require CAD file version 12.");
  if(file.version! < 13 && hasDiameterAnnotations(document))throw new Error("Diameter annotations require CAD file version 13.");
  validateDocumentStructure(document);
  migrateDrawingTopology(document);
  return document;
}

export function validateDocumentStructure(document:CadDocument){
  validateSceneGraph(document);
  const record=(v:unknown):v is Record<string,any>=>typeof v==="object"&&v!==null&&!Array.isArray(v);
  const strings=(v:unknown):v is string[]=>Array.isArray(v)&&v.every(x=>typeof x==="string"&&x.length>0);
  const fail=(reason:string):never=>{throw new Error(`Invalid CAD document: ${reason}`);};
  if(!record(document)||typeof document.id!=="string"||!document.id||!Number.isSafeInteger(document.revision)||document.revision<0||
    !record(document.objects)||!record(document.features)||!record(document.layers)||!strings(document.rootObjects)||!strings(document.rootLayers))fail("structure");
  for(const [id,layer] of Object.entries(document.layers))if(!record(layer)||layer.id!==id||typeof layer.name!=="string"||typeof layer.visible!=="boolean"||typeof layer.locked!=="boolean"||!strings(layer.objectIds))fail(`layer ${id}`);
  for(const [id,object] of Object.entries(document.objects)){
    if(!record(object)||object.id!==id||typeof object.geometryId!=="string"||typeof object.name!=="string"||typeof object.visible!=="boolean"||!document.layers[object.layerId])fail(`object ${id}`);
    if(object.transform){
      for(const key of ["translation","rotation","scale"] as const){const v=object.transform[key];
        if(key==="scale"&&typeof v==="number"&&Number.isFinite(v)&&v>0){object.transform.scale=[v,v,v];continue;}
        if(!Array.isArray(v)||v.length!==3||!v.every(Number.isFinite)||key==="scale"&&v.some(n=>n<=0))fail(`transform ${id}`);
      }
    }
  }
  const types=["primitive","drawing","drafting","dimension","extrude","sweep","loft","transform","boolean","fillet","chamfer","revolve","image"];
  for(const [id,feature] of Object.entries(document.features))if(!record(feature)||feature.id!==id||!types.includes(feature.type)||!record(feature.params)||!strings(feature.inputs)||!document.objects[feature.output]||!validateFeatureParameters(feature))fail(`feature ${id}`);
  for(const id of document.rootObjects)if(!document.objects[id])fail(`root object ${id}`);
  for(const id of document.rootLayers)if(!document.layers[id])fail(`root layer ${id}`);
  if(document.rasterAssets!==undefined&&!record(document.rasterAssets))fail("raster asset collection");
  let rasterBytes=0;
  for(const [id,asset] of Object.entries(document.rasterAssets??{})){
    if(!validRasterAsset(asset)||asset.id!==id)fail(`raster asset ${id}`);
    rasterBytes+=asset.byteLength;
  }
  if(rasterBytes>MAX_DOCUMENT_RASTER_BYTES)fail("raster asset byte limit");
  for(const feature of Object.values(document.features))if(feature.type==="image"){
    if(!validImageNodeParams(feature.params)||!document.rasterAssets?.[String(feature.params.assetId)])fail(`image asset reference ${feature.id}`);
  }
  for (const feature of Object.values(document.features)) if (feature.type === "dimension" && feature.params.kind === "diameter") {
    const p = feature.params;
    if (!Array.isArray(p.center) || p.center.length !== 2 || !p.center.every(Number.isFinite) ||
        typeof p.radius !== "number" || !Number.isFinite(p.radius) || p.radius <= 0 ||
        p.angle !== undefined && (typeof p.angle !== "number" || !Number.isFinite(p.angle)) ||
        p.workPlane !== undefined && !["XY", "XZ", "YZ"].includes(String(p.workPlane)) ||
        p.sourceObjectId !== undefined && (typeof p.sourceObjectId !== "string" || !document.objects[p.sourceObjectId])) {
      fail(`diameter annotation ${feature.id}`);
    }
  }
  validatePatternGroups(document);
  validateConstructionGraph(document);
  if(document.sketches!==undefined&&!record(document.sketches))fail("sketch collection");
  if(document.blocks!==undefined&&!record(document.blocks))fail("block collection");
  for(const [id,block] of Object.entries(document.blocks??{})){
    if(!record(block)||block.id!==id||typeof block.name!=="string"||!block.name.trim()||!["XY","XZ","YZ"].includes(block.workPlane)||!Array.isArray(block.members)||!block.members.length)fail(`component ${id}`);
    for(const member of block.members){
      if(!record(member)||!["drawing","drafting"].includes(member.type)||!record(member.params)||typeof member.params.kind!=="string"||!document.layers[member.layerId]||!record(member.transform))fail(`component member ${id}`);
      for(const key of ["translation","rotation","scale"] as const)if(!Array.isArray(member.transform[key])||member.transform[key].length!==3||!member.transform[key].every(Number.isFinite)||key==="scale"&&member.transform[key].some((n:number)=>n<=0))fail(`component transform ${id}`);
      if(member.params.kind==="block"&&(!document.blocks?.[String(member.params.blockId)]||member.type!=="drafting"))fail(`nested component ${id}`);
    }
  }
  const visiting=new Set<string>(),visited=new Set<string>();
  const visitBlock=(id:string)=>{
    if(visiting.has(id))fail(`component cycle ${id}`);
    if(visited.has(id))return;
    visiting.add(id);
    for(const member of document.blocks?.[id]?.members??[])if(member.type==="drafting"&&member.params.kind==="block")visitBlock(String(member.params.blockId));
    visiting.delete(id);visited.add(id);
  };
  for(const id of Object.keys(document.blocks??{}))visitBlock(id);
  if(document.artboards!==undefined&&!record(document.artboards))fail("artboard collection");
  for(const [id,board] of Object.entries(document.artboards??{}))if(!record(board)||board.id!==id||typeof board.name!=="string"||!["XY","XZ","YZ"].includes(board.workPlane)||!Array.isArray(board.origin)||board.origin.length!==2||!board.origin.every(Number.isFinite)||!Array.isArray(board.size)||board.size.length!==2||!board.size.every(Number.isFinite)||board.size[0]<=0||board.size[1]<=0||typeof board.background!=="string"||!/^#[0-9a-f]{6}$/i.test(board.background)||typeof board.visible!=="boolean"||typeof board.locked!=="boolean")fail(`artboard ${id}`);
  for(const [id,sketch] of Object.entries(document.sketches??{}))if(!record(sketch)||sketch.id!==id||!["XY","XZ","YZ"].includes(sketch.workPlane)||!document.layers[sketch.layerId]||!Array.isArray(sketch.geometry)||!Array.isArray(sketch.constraints)||!Array.isArray(sketch.dimensions)||!record(sketch.solveState))fail(`sketch ${id}`);
  for(const sketch of Object.values(document.sketches??{}))for(const c of sketch.constraints)if(!validSketchConstraint(c)||!sketchConstraintGeometryIds(c).every(id=>sketch.geometry.some(g=>g.id===id)))fail(`sketch relation ${c?.id??"unknown"}`);
  for(const {info,value} of resolveParameterBindings(document)){
    if(!Number.isFinite(info.value))fail(`driven parameter ${info.label}`);
    const roundoff=CAD_PRECISION.coordinateRoundoffFactor*Number.EPSILON*Math.max(1,Math.abs(value),Math.abs(info.value));
    const tolerance=info.quantity==="length"?linearToleranceAt(value,info.value):info.quantity==="angle"?Math.max(roundoff,CAD_PRECISION.angularTolerance*(info.unit==="deg"?180/Math.PI:1)):roundoff;
    if(Math.abs(info.value-value)>tolerance)fail(`driven parameter ${info.label}`);
  }
}

/**
 * Add stable topology references to drawings saved before topology metadata
 * existed. IDs are derived from the feature id and semantic role/index, so an
 * old file can be opened, edited, saved and reopened without changing refs.
 */
function migrateDrawingTopology(document: CadDocument) {
  for (const feature of Object.values(document.features)) {
    if (feature.type !== "drawing") continue;
    const params = feature.params as Record<string, unknown>;
    const existing = params.topology as { version?: number } | undefined;
    if (existing?.version === 1) continue;
    const kind = String(params.kind ?? "drawing");
    const controls: { id: string; role: string; index?: number }[] = [];
    const segments: { id: string; startControlId: string; endControlId: string }[] = [];
    const curves: { id: string; kind: string }[] = [];
    const control = (role: string, index?: number) => {
      const suffix = index === undefined ? role : `${role}-${index}`;
      const entry = { id: `${feature.id}:control:${suffix}`, role, ...(index === undefined ? {} : { index }) };
      controls.push(entry);
      return entry.id;
    };
    if (Array.isArray(params.points)) {
      (params.points as unknown[]).forEach((_, index) => control("vertex", index));
      const closed = kind === "rectangle" || params.closed === true;
      for (let index = 0; index < controls.length - 1; index += 1) {
        segments.push({ id: `${feature.id}:segment:${index}`, startControlId: controls[index].id, endControlId: controls[index + 1].id });
      }
      if (closed && controls.length > 2) segments.push({ id: `${feature.id}:segment:${controls.length - 1}`, startControlId: controls.at(-1)!.id, endControlId: controls[0].id });
    } else if (kind === "circle") {
      control("center"); control("radius"); curves.push({ id: `${feature.id}:curve:circle`, kind: "circle" });
    } else if (kind === "arc") {
      control("center"); control("start"); control("end"); curves.push({ id: `${feature.id}:curve:arc`, kind: "arc" });
    }
    params.topology = { version: 1, controls, segments, curves };
  }
}
