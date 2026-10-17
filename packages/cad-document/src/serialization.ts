import {validateArchitectureContent} from "./ArchitectureContent";
import {validSpline} from "./Spline";
import {validateFrameStitches} from "./FrameStitch";
import {validateFrameSheets} from "./FrameSheet";
import {validateFrameLinks} from "./FrameLink";
import {validateWorkspaceSections} from "./WorkspaceSection";
import {validDrawingFrame} from "./DrawingFrame";
import {validEllipse} from "./Ellipse";
import {validateModelPresentation} from "./ModelPresentation";
import {sketchCircularGeometry} from "./SketchCurves";
import { validateExchangeImports } from "./ExchangeFixture";
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
import { validateAngularReferences } from "./AngularDimension";
import { validateModelViews } from "./ModelView";
import { validWorkPlaneFrame, validateCadWorkPlanes } from "./WorkPlane";

type SerializedCadFile = {
  format: "agent-webcad";
  version: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29 | 30 | 31 | 32 | 33 | 34 | 35 | 36 | 37 | 38 | 39 | 40 | 41 | 42;
  document: CadDocument;
};

const hasElementReferences = (document: CadDocument) => Object.values(document.features ?? {}).some(f => f?.construction?.elements !== undefined) || Object.values(document.sketches ?? {}).some(s => Array.isArray(s.constraints) && s.constraints.some(c => c.kind === "angle" && (c.firstSegmentId !== undefined || c.secondSegmentId !== undefined)));
const hasArtboards = (document: CadDocument) => document.artboards !== undefined;
const hasDiameterAnnotations=(document:CadDocument)=>Object.values(document.features??{}).some(f=>f?.type==="dimension"&&f.params?.kind==="diameter");
const hasAngularAnnotations=(document:CadDocument)=>Object.values(document.features??{}).some(f=>f?.type==="dimension"&&f.params?.kind==="angular");
const hasMixedSketches=(document:CadDocument)=>Object.values(document.sketches??{}).some(s=>s.geometry.some(g=>g.kind==="polyline"&&g.bulges?.some(b=>b!==0))||s.constraints.some(c=>["segmentId","curveSegmentId","firstCurveSegmentId","secondCurveSegmentId"].some(k=>k in c&&!["angle"].includes(c.kind))));
const hasBoundedArcRelations=(document:CadDocument)=>Object.values(document.sketches??{}).some(sketch=>Array.isArray(sketch?.constraints)&&Array.isArray(sketch?.geometry)&&sketch.constraints.some(c=>c.kind==="point-on-arc" || c.kind==="tangent-line"&&sketch.geometry.some(g=>g.id===c.curveId&&g.kind==="arc") || c.kind==="tangent-circles"&&sketch.geometry.some(g=>(g.id===c.firstCurveId||g.id===c.secondCurveId)&&g.kind==="arc")));
const hasFaceHoles=(document:CadDocument)=>Object.values(document.features??{}).some(feature=>feature?.params?.faceHole!==undefined);
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
    version: document.componentLibrary!==undefined||Object.values(document.features).some(f=>f.params.architecturalSlab||f.params.componentContent||f.params.solidFinish) ? 42 : Object.values(document.features).some(f=>f.params.architecturalWall!==undefined) ? 41 : Object.values(document.features).some(f=>f.params.kind==="face"||f.params.profileRegionIds!==undefined) ? 40 : Object.values(document.features).some(f=>f.params.kind==="spline")||Object.values(document.blocks??{}).some(b=>b.members.some(m=>m.params.kind==="spline")) ? 39 : Object.values(document.modelPresentation?.projections??{}).some(v=>v.hiddenLines!==undefined) ? 38 : Object.values(document.modelPresentation?.projections??{}).some(v=>v.direction!==undefined) ? 37 : Object.values(document.modelPresentation?.projections??{}).some(v=>v.edgePolicy!==undefined||Object.values(v.outputs).some(e=>["ellipse","elliptic-arc"].includes(e.kind)))||Object.values(document.modelPresentation?.sections??{}).some(v=>Object.values(v.decorations??{}).some(e=>["ellipse","elliptic-arc"].includes(e.kind))) ? 36 : Object.values(document.modelPresentation?.sections??{}).some(v=>Object.values(v.outputs).some(e=>["ellipse","elliptic-arc"].includes(e.kind))) ? 35 : Object.values(document.modelPresentation?.sections??{}).some(v=>v.presentation!==undefined||v.decorations!==undefined) ? 34 : Object.values(document.modelPresentation?.projections??{}).some(v=>v.method==="brep-hlr") ? 33 : Object.values(document.artboards??{}).some(b=>b.frame?.stitch!==undefined) ? 32 : Object.values(document.artboards??{}).some(b=>b.frameSheet!==undefined) ? 31 : document.frameLinks !== undefined ? 30 : document.workspaceSections !== undefined ? 29 : Object.values(document.artboards??{}).some(b=>b.frame!==undefined) ? 28 : Object.values(document.features).some(f=>["ellipse","elliptic-arc"].includes(String(f.params.kind)))||Object.values(document.blocks??{}).some(b=>b.members.some(m=>["ellipse","elliptic-arc"].includes(String(m.params.kind)))) ? 27 : Object.values(document.modelPresentation?.sheets??{}).some(s=>s.publication) ? 26 : (Object.values(document.features).some(f=>f.params.modelNote||f.params.modelDrawingReference)||document.modelPresentation&&(document.modelPresentation.sections!==undefined||document.modelPresentation.clipping!==undefined||document.modelPresentation.sheets!==undefined)) ? 25 : document.modelPresentation!==undefined ? 24 : hasMixedSketches(document) ? 23 : Object.values(document.features).some(f=>f.construction?.operation==="intersection"&&f.construction.branchBasis==="center-line") ? 22 : Object.values(document.features).some(f=>f.type==="shell") ? 21 : hasFaceHoles(document) ? 20 : Object.values(document.sketches??{}).some(s=>s.facePlaneId) ? 19 : document.workPlanes !== undefined ? 18 : hasBoundedArcRelations(document) ? 17 : document.exchangeImports !== undefined ? 16 : document.modelViews !== undefined ? 15 : hasAngularAnnotations(document) ? 14 : hasDiameterAnnotations(document) ? 13 : document.scenes !== undefined ? 12 : hasImageColorAdjustments(document) ? 11 : hasImageAdjustments(document) ? 10 : hasImageMasks(document) ? 9 : hasRasterAssets(document) ? 8 : hasArtboards(document) ? 7 : hasElementReferences(document) ? 6 : Object.values(document.sketches??{}).some(s=>s.constraints.some(c=>(EXTENDED_SKETCH_RELATIONS as readonly string[]).includes(c.kind))) ? 5 : Object.values(document.features).some(f=>f.construction || ["point","infinite-line","ray"].includes(String(f.params.kind))) ? 4 : Object.values(document.features).some(f=>f.pattern)?3:document.variables !== undefined || document.parameterBindings !== undefined ? 2 : 1,
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
      (file.version !== 1 && file.version !== 2 && file.version !== 3 && file.version !== 4 && file.version !== 5 && file.version !== 6 && file.version !== 7 && file.version !== 8 && file.version !== 9 && file.version !== 10 && file.version !== 11 && file.version !== 12 && file.version !== 13 && file.version !== 14 && file.version !== 15 && file.version !== 16 && file.version !== 17 && file.version !== 18 && file.version !== 19 && file.version !== 20 && file.version !== 21 && file.version !== 22 && file.version !== 23 && file.version !== 24 && file.version !== 25 && file.version !== 26 && file.version !== 27 && file.version !== 28 && file.version !== 29 && file.version !== 30 && file.version !== 31 && file.version !== 32 && file.version !== 33 && file.version !== 34 && file.version !== 35 && file.version !== 36 && file.version !== 37 && file.version !== 38 && file.version !== 39 && file.version !== 40 && file.version !== 41 && file.version !== 42) ||
    !file.document
  ) {
    throw new Error(
      "Unsupported CAD file format."
    );
  }

  const document =
    file.document;
  if(file.version!<42&&(document.componentLibrary!==undefined||Object.values(document.features).some(f=>f.params.architecturalSlab||f.params.componentContent||f.params.solidFinish)))throw Error("Architectural content requires CAD file version 42.");
  validateArchitectureContent(document);
  for(const def of Object.values(document.componentLibrary??{}))if(!validateFeatureParameters({id:def.id,output:def.id,type:def.type,params:def.params,inputs:[],dependencyMode:"snapshot"}))throw Error(`Invalid component definition geometry: ${def.id}`);
  if(file.version! < 30&&document.frameLinks!==undefined)throw Error("Frame links require CAD file version 30.");
  if(file.version! < 31&&Object.values(document.artboards??{}).some(b=>b.frameSheet!==undefined))throw Error("Frame sheets require CAD file version 31.");
  if(file.version! < 32&&Object.values(document.artboards??{}).some(b=>b.frame?.stitch!==undefined))throw Error("Continuous frames require CAD file version 32.");
  validateFrameStitches(document);
  validateFrameSheets(document);
  validateFrameLinks(document);
  if(file.version! < 29&&document.workspaceSections!==undefined)throw Error("Workspace sections require CAD file version 29.");
  validateWorkspaceSections(document);
  if(file.version! < 28&&Object.values(document.artboards??{}).some(b=>b.frame!==undefined))throw Error("Drawing frames require CAD file version 28.");
  if(file.version!<41&&Object.values(document.features).some(f=>f.params.architecturalWall!==undefined))throw Error("Architectural walls and openings require CAD file version 41.");
  if(file.version!<40&&Object.values(document.features).some(f=>f.params.kind==="face"||f.params.profileRegionIds!==undefined))throw Error("Planar faces and selected extrusion regions require CAD file version 40.");
  if(file.version!<39&&(Object.values(document.features).some(f=>f.params.kind==="spline")||Object.values(document.blocks??{}).some(b=>b.members.some(m=>m.params.kind==="spline"))))throw Error("Spline/NURBS require CAD file version 39.");
  if(file.version! < 27&&(Object.values(document.features).some(f=>["ellipse","elliptic-arc"].includes(String(f.params.kind)))||Object.values(document.blocks??{}).some(b=>b.members.some(m=>["ellipse","elliptic-arc"].includes(String(m.params.kind))))))throw Error("Ellipses require CAD file version 27.");
  if(file.version! < 26&&Object.values(document.modelPresentation?.sheets??{}).some(s=>s.publication))throw Error("Published sheet sets require CAD file version 26.");
  if(file.version! < 25&&(Object.values(document.features??{}).some(f=>f.params.modelNote||f.params.modelDrawingReference)||document.modelPresentation&&(document.modelPresentation.sections!==undefined||document.modelPresentation.clipping!==undefined||document.modelPresentation.sheets!==undefined)))throw Error("Model sections/sheets/clipping require CAD file version 25.");
  if(file.version! < 24&&document.modelPresentation!==undefined)throw Error("Model presentation requires CAD file version 24.");
  if(file.version! < 23&&hasMixedSketches(document))throw Error("Mixed sketch arcs require CAD file version 23.");
  if(file.version! < 22&&Object.values(document.features??{}).some(f=>f?.construction?.operation==="intersection"&&f.construction.branchBasis==="center-line"))throw new Error("Circular intersection branch basis requires CAD file version 22.");
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
  if(file.version! < 14 && hasAngularAnnotations(document))throw new Error("Angular annotations require CAD file version 14.");
  if(file.version! < 15 && document.modelViews !== undefined)throw new Error("Model views require CAD file version 15.");
  if(file.version! < 16 && document.exchangeImports !== undefined)throw new Error("Exchange receipts require CAD file version 16.");
  if(file.version! < 17 && hasBoundedArcRelations(document))throw new Error("Bounded arc sketch relations require CAD file version 17.");
  if(file.version! < 18 && document.workPlanes !== undefined)throw new Error("User work planes require CAD file version 18.");
  if(file.version! < 19 && Object.values(document.sketches??{}).some(s=>s.facePlaneId))throw new Error("Face sketches require CAD file version 19.");
  if(file.version! < 20 && hasFaceHoles(document))throw new Error("Face holes require CAD file version 20.");
  if(file.version! < 21 && Object.values(document.features??{}).some(f=>f.type==="shell"))throw Error("Shell requires CAD file version 21.");
  if(file.version!<33&&Object.values(document.modelPresentation?.projections??{}).some(v=>v.method=== "brep-hlr"))throw Error("BRep HLR projections require CAD file version 33.");
  if(file.version!<38&&Object.values(document.modelPresentation?.projections??{}).some(v=>v.hiddenLines!==undefined))throw Error("Projection hidden-edge display requires CAD file version 38.");
  if(file.version!<37&&Object.values(document.modelPresentation?.projections??{}).some(v=>v.direction!==undefined))throw Error("Opposite projection direction requires CAD file version 37.");
  if(file.version!<36&&(Object.values(document.modelPresentation?.projections??{}).some(v=>v.edgePolicy!==undefined||Object.values(v.outputs).some(e=>["ellipse","elliptic-arc"].includes(e.kind)))||Object.values(document.modelPresentation?.sections??{}).some(v=>Object.values(v.decorations??{}).some(e=>["ellipse","elliptic-arc"].includes(e.kind)))))throw Error("Conic HLR/policy requires CAD file version 36.");
  if(file.version!<35&&Object.values(document.modelPresentation?.sections??{}).some(v=>Object.values(v.outputs).some(e=>["ellipse","elliptic-arc"].includes(e.kind))))throw Error("Ellipse sections require CAD file version 35.");
  if(file.version!<34&&Object.values(document.modelPresentation?.sections??{}).some(v=>v.presentation!==undefined||v.decorations!==undefined))throw Error("Architectural sections require CAD file version 34.");
  validateDocumentStructure(document);
  migrateDrawingTopology(document);
  return document;
}

export function validateDocumentStructure(document:CadDocument){
  validateModelPresentation(document?.modelPresentation);
  validateCadWorkPlanes(document?.workPlanes);
  validateModelViews(document?.modelViews);
  validateExchangeImports(document?.exchangeImports);
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
      // DXF INSERT has signed scale factors. Keep this exception limited to
      // component placements; primitive/model scale keeps its positive contract.
      const signedScale=Object.values(document.features).some(f=>f.output===id&&f.type==="drafting"&&f.params.kind==="block");
      for(const key of ["translation","rotation","scale"] as const){const v=object.transform[key];
        if(key==="scale"&&typeof v==="number"&&Number.isFinite(v)&&v>0){object.transform.scale=[v,v,v];continue;}
        if(!Array.isArray(v)||v.length!==3||!v.every(Number.isFinite)||key==="scale"&&v.some(n=>signedScale?Math.abs(n)<=1e-12:n<=0))fail(`transform ${id}`);
      }
    }
  }
  const types=["primitive","drawing","drafting","dimension","extrude","sweep","loft","shell","transform","boolean","fillet","chamfer","revolve","image"];
  for(const [id,feature] of Object.entries(document.features))if(!record(feature)||feature.id!==id||!types.includes(feature.type)||!record(feature.params)||!strings(feature.inputs)||!document.objects[feature.output]||!validateFeatureParameters(feature))fail(`feature ${id}`);
  const outputFeatures=new Map(Object.values(document.features).map(f=>[f.output,f]));
  const openingIds=new Set<string>();for(const f of Object.values(document.features))if(f.params.architecturalWall){const wall=f.params.architecturalWall as import("./ArchitectureWall").ArchitectureWall;if(wall.sourceObjectIds.some(id=>!document.objects[id]||!['drawing','drafting'].includes(outputFeatures.get(id)?.type??'')))fail(`wall source ${f.output}`);for(const opening of wall.openings){if(openingIds.has(opening.id))fail(`duplicate wall opening ${opening.id}`);openingIds.add(opening.id);}if(document.objects[f.output].transform?.scale.some(v=>v!==1))fail(`scaled architectural wall ${f.output}`);}
  for(const feature of Object.values(document.features))if(feature.params.kind==="face"&&(feature.inputs.some(id=>!document.objects[id]||outputFeatures.get(id)?.type!=="drawing")||new Set(feature.inputs).size!==feature.inputs.length))fail(`planar face sources ${feature.output}`);
  for(const feature of Object.values(document.features))if(feature.params.kind==="face"){const transform=document.objects[feature.output].transform;if(!transform||transform.translation.some(v=>v!==0)||transform.rotation.some(v=>v!==0)||transform.scale.some(v=>v!==1))fail(`planar face follows source placement ${feature.output}`);}
  if(outputFeatures.size!==Object.keys(document.features).length)fail("duplicate feature output");
  const outputOwners=new Set<string>();for(const view of Object.values(document.modelPresentation?.projections??{})){if(!view.method&&(Object.keys(view.outputs).length!==view.partIds.length||view.partIds.some(id=>!view.outputs[id])))fail(`projection mapping ${view.id}`);for(const [partId,entry] of Object.entries(view.outputs)){const f=outputFeatures.get(entry.objectId);if(outputOwners.has(entry.objectId)||!f||f.type!=="drawing"||f.params.modelProjection!==view.id||f.params.sourcePartId!==(entry.partId??partId)||f.params.kind!==entry.kind||f.params.projectionStatus!==view.status||JSON.stringify(f.params.sourceEdges)!==JSON.stringify(entry.sourceEdges))fail(`projection ownership ${view.id}`);outputOwners.add(entry.objectId);}}

  for(const view of Object.values(document.modelPresentation?.projections??{}))if(view.edgePolicy)for(const e of Object.values(view.outputs)){const f=outputFeatures.get(e.objectId);if(f?.params.projectionEdgePolicy!==view.edgePolicy||!["sharp","outline"].includes(String(f.params.projectionEdgeClass)))fail(`projection edge policy ${view.id}`);}
  for(const view of Object.values(document.modelPresentation?.sections??{}))for(const [key,e] of Object.entries(view.outputs)){const f=outputFeatures.get(e.objectId);if(outputOwners.has(e.objectId)||e.sourceKey!==key||!f||f.type!=="drawing"||f.params.modelSection!==view.id||f.params.sourceKey!==key||f.params.kind!==e.kind||f.params.projectionStatus!==view.status||!view.partIds.includes(String(f.params.sourcePartId)))fail(`section ownership ${view.id}`);outputOwners.add(e.objectId);}
  for(const view of Object.values(document.modelPresentation?.sections??{}))for(const [key,e] of Object.entries(view.decorations??{})){const f=outputFeatures.get(e.objectId),o=document.objects[e.objectId];if(outputOwners.has(e.objectId)||!o||o.layerId!==view.layerId||!f||f.type!==(e.kind==="text"?"drafting":"drawing")||f.params.kind!==e.kind||f.params.modelSectionPresentation!==view.id||f.params.presentationKey!==key||f.params.sectionRole!==e.role||f.params.projectionStatus!==view.status)fail(`section presentation ownership ${view.id}`);outputOwners.add(e.objectId);}
  for(const f of Object.values(document.features))if(f.params.modelSectionPresentation&&!outputOwners.has(f.output))fail(`orphan section presentation ${f.output}`);
  for(const sheet of Object.values(document.modelPresentation?.sheets??{})){const board=document.artboards?.[sheet.artboardId],title=outputFeatures.get(sheet.titleId);if(!board||board.workPlane!=="XY"||title?.params.modelSheet!==sheet.id)fail(`sheet ownership ${sheet.id}`);for(const id of sheet.publication?.frameIds??[]){const frame=outputFeatures.get(id);if(!document.objects[id]||frame?.params.modelSheet!==sheet.id)fail(`sheet frame ownership ${id}`);}for(const [id,origin] of Object.entries(sheet.placements)){const view=document.modelPresentation!.projections[id]??document.modelPresentation!.sections?.[id];if(!view||view.scale!==1/sheet.denominator||JSON.stringify(view.origin)!==JSON.stringify(origin))fail(`sheet placement ${id}`);}}
  for(const feature of Object.values(document.features))if(feature.params.faceHole){const hole=feature.params.faceHole as {planeId:string;targetId:string};if(!document.workPlanes?.[hole.planeId]?.source||document.workPlanes[hole.planeId].source?.objectId!==hole.targetId||!document.objects[hole.targetId])fail(`face hole ${feature.id}`);}
  for(const f of Object.values(document.features))if(f.type==="shell"&&f.dependencyMode!=="snapshot"&&!document.objects[f.inputs[0]])fail(`Shell source ${f.id}`);
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
  validateAngularReferences(document);
  validatePatternGroups(document);
  validateConstructionGraph(document);
  if(document.sketches!==undefined&&!record(document.sketches))fail("sketch collection");
  if(document.blocks!==undefined&&!record(document.blocks))fail("block collection");
  for(const [id,block] of Object.entries(document.blocks??{})){
    if(!record(block)||block.id!==id||typeof block.name!=="string"||!block.name.trim()||!["XY","XZ","YZ"].includes(block.workPlane)||!Array.isArray(block.members)||!block.members.length)fail(`component ${id}`);
    for(const member of block.members){
      if(member.params?.kind==="spline"&&!validSpline(member.params))fail(`spline component member ${id}`);
      if(["ellipse","elliptic-arc"].includes(String(member.params?.kind))&&!validEllipse(member.params))fail(`ellipse component member ${id}`);
       if(!record(member)||!["drawing","drafting"].includes(member.type)||member.objectId!==undefined&&(typeof member.objectId!=="string"||!member.objectId)||!record(member.params)||typeof member.params.kind!=="string"||!document.layers[member.layerId]||!record(member.transform))fail(`component member ${id}`);
      for(const key of ["translation","rotation","scale"] as const)if(!Array.isArray(member.transform[key])||member.transform[key].length!==3||!member.transform[key].every(Number.isFinite)||key==="scale"&&member.transform[key].some((n:number)=>member.type==="drafting"&&member.params.kind==="block"?Math.abs(n)<=1e-12:n<=0))fail(`component transform ${id}`);
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
  for(const board of Object.values(document.artboards??{}))if(board.frame!==undefined&&!validDrawingFrame(board.frame))fail("drawing frame");
  for(const [id,board] of Object.entries(document.artboards??{}))if(!record(board)||board.id!==id||typeof board.name!=="string"||!["XY","XZ","YZ"].includes(board.workPlane)||!Array.isArray(board.origin)||board.origin.length!==2||!board.origin.every(Number.isFinite)||!Array.isArray(board.size)||board.size.length!==2||!board.size.every(Number.isFinite)||board.size[0]<=0||board.size[1]<=0||typeof board.background!=="string"||!/^#[0-9a-f]{6}$/i.test(board.background)||typeof board.backgroundOpacity!=="number"||!Number.isFinite(board.backgroundOpacity)||board.backgroundOpacity<0||board.backgroundOpacity>1||typeof board.showGrid!=="boolean"||typeof board.visible!=="boolean"||typeof board.locked!=="boolean")fail(`artboard ${id}`);
  for(const [id,sketch] of Object.entries(document.sketches??{}))if(!record(sketch)||sketch.id!==id||!["XY","XZ","YZ"].includes(sketch.workPlane)||!document.layers[sketch.layerId]||!Array.isArray(sketch.geometry)||!Array.isArray(sketch.constraints)||!Array.isArray(sketch.dimensions)||!record(sketch.solveState))fail(`sketch ${id}`);
  for(const sketch of Object.values(document.sketches??{}))if(sketch.facePlaneId!==undefined&&(!document.workPlanes?.[sketch.facePlaneId]?.source||!validWorkPlaneFrame(sketch.faceFrame)||!["resolved","missing","ambiguous","non-planar","unsupported"].includes(sketch.faceStatus??"")))fail(`face sketch ${sketch.id}`);
  for(const sketch of Object.values(document.sketches??{}))for(const g of sketch.geometry)if(g.kind==="polyline"&&g.bulges!==undefined&&(!Array.isArray(g.bulges)||g.bulges.length!==g.segmentIds.length||g.bulges.some((b,i)=>!Number.isFinite(b)||Math.abs(b)>=1e6||b!==0&&!sketchCircularGeometry(g,g.segmentIds[i]))))fail(`mixed sketch geometry ${g.id}`);
  for(const sketch of Object.values(document.sketches??{}))for(const c of sketch.constraints)if(!validSketchConstraint(c)||!sketchConstraintGeometryIds(c).every(id=>sketch.geometry.some(g=>g.id===id)))fail(`sketch relation ${c?.id??"unknown"}`);
  for(const sketch of Object.values(document.sketches??{}))for(const c of sketch.constraints){
    const curve=(id:string,segmentId?:string)=>sketchCircularGeometry(sketch.geometry.find(g=>g.id===id),segmentId);
    const bounded=(g:typeof sketch.geometry[number]|null|undefined)=>g?.kind!=="arc"||Number.isFinite(g.startAngle)&&Number.isFinite(g.endAngle)&&Math.abs(g.endAngle-g.startAngle)>CAD_PRECISION.angularTolerance&&Math.abs(g.endAngle-g.startAngle)<Math.PI*2-CAD_PRECISION.angularTolerance;
    if((c.kind==="radius"||c.kind==="diameter")&&!curve(c.geometryId,c.segmentId))fail(`circular dimension ${c.id}`);
    if("firstCurveId" in c&&(!curve(c.firstCurveId,c.firstCurveSegmentId)||!curve(c.secondCurveId,c.secondCurveSegmentId)))fail(`circular relation ${c.id}`);
    if(c.kind==="tangent-line"&&!curve(c.curveId,c.curveSegmentId))fail(`circular tangent ${c.id}`);
    if(c.kind==="point-on-arc"&&(curve(c.curveId,c.curveSegmentId)?.kind!=="arc"||!bounded(curve(c.curveId,c.curveSegmentId))))fail(`bounded arc relation ${c.id}`);
    if(c.kind==="tangent-line"&&curve(c.curveId,c.curveSegmentId)?.kind==="arc"&&!bounded(curve(c.curveId,c.curveSegmentId)))fail(`bounded arc relation ${c.id}`);
    if(c.kind==="tangent-circles"&&[curve(c.firstCurveId,c.firstCurveSegmentId),curve(c.secondCurveId,c.secondCurveSegmentId)].some(g=>g?.kind==="arc"&&!bounded(g)))fail(`bounded arc relation ${c.id}`);
  }
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
    } else if(kind==="spline"){(feature.params.controlPoints as number[][]).forEach((_,i)=>controls.push({id:`${feature.id}:pole:${i}`,role:"pole",index:i}));curves.push({id:`${feature.id}:curve:spline`,kind});
    } else if(kind==="ellipse"||kind==="elliptic-arc"){control("center");control("axis-u");control("axis-v");if(kind==="elliptic-arc"){control("start");control("end");}curves.push({id:`${feature.id}:curve:ellipse`,kind});
    } else if (kind === "circle") {
      control("center"); control("radius"); curves.push({ id: `${feature.id}:curve:circle`, kind: "circle" });
    } else if (kind === "arc") {
      control("center"); control("start"); control("end"); curves.push({ id: `${feature.id}:curve:arc`, kind: "arc" });
    }
    params.topology = { version: 1, controls, segments, curves };
  }
}


