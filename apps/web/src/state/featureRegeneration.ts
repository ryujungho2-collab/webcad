import {rebuildContent,rebuildSlab} from "./architectureContentCommands";
import type { CadDocument, CadFeature } from "@agent-webcad/cad-document";
import type { SerializedOperand } from "../cad/kernelProtocol";
import {
  buildBooleanMesh, buildChamferMesh, buildExtrudeMesh, buildFilletMesh,
  buildLoftMesh, buildShellMesh, buildRevolveMesh, buildSweepMesh, inspectSolid, meshPositionsBounds,
} from "../cad/kernelGeometryService";
import { extractSketchLoops, extrusionProfileParams } from "../precision/sketchProfiles";
import { getWorldDrawingGeometry } from "../precision/worldGeometry";
import { WORK_PLANES } from "../precision/workPlane";
import { getObjectTransform } from "../precision/objectTransform";
import {buildPatternDrawingParams} from "../precision/patternGeometry";
import { evaluateConstruction } from "../precision/constructionGeometry";
import { faceSketchExtrusionProfile } from "../precision/faceSketchProfile";
import { faceCutParams, type FaceCutDefinition } from "./faceCutCommands";
import {faceHoleParams,type FaceHoleDefinition} from "./faceHoleCommands";
import {resolveStoredWorkPlane} from "./attachedWorkPlane";
import {shellFaceStatus,shellParams} from "./shellCommands";
import {architectureWallParams} from "./architectureWallCommands";

const DERIVED_TYPES = new Set(["extrude", "revolve", "sweep", "loft", "shell", "boolean", "fillet", "chamfer"]);

export class FeatureRegenerationError extends Error {
  constructor(message: string, public geometryIds: string[]) { super(message); }
}

/** Legacy consumed operands are snapshots: missing history cannot be invented.
 * Legacy profile features with intact sources can still regenerate. */
export function liveFeatureInputs(feature: CadFeature, document: CadDocument, before = document): string[] {
  if(feature.params.componentContent)return feature.inputs;
  if(feature.pattern || feature.construction)return feature.inputs;
  if (!DERIVED_TYPES.has(feature.type) || feature.dependencyMode === "snapshot") return [];
  if (feature.dependencyMode === "live") return feature.inputs;
  const hasSources = (candidate: CadDocument) => feature.inputs.every(id =>
    candidate.objects[id] && Object.values(candidate.features).some(entry => entry.output === id));
  return feature.inputs.length && (hasSources(document) || hasSources(before)) ? feature.inputs : [];
}

function geometrySignature(document: CadDocument, feature: CadFeature) {
  const object = document.objects[feature.output];
  const { bounds: _,solidFinish: __,componentContent: ___, ...params } = feature.params;
  return JSON.stringify([feature.type, params, object && getObjectTransform(object, feature)]);
}

/** Rebuild only affected dependents, in source order, on a detached document.
 * All changes share the initiating command's transaction and history entry. */
export async function regenerateDependentFeatures(document: CadDocument, before: CadDocument, rebuildObjectIds:ReadonlySet<string> = new Set()): Promise<void> {
  const features = new Map<string, CadFeature>();
  for (const feature of Object.values(document.features)) {
    if (features.has(feature.output)) throw new Error(`Ambiguous feature output: ${feature.output}`);
    features.set(feature.output, feature);
  }
  const previous = new Map(Object.values(before.features).map(feature => [feature.output, feature]));
  const ordered: CadFeature[] = [];
  const visited = new Set<string>(), visiting = new Set<string>();
  const inputs = new Map<string, string[]>();
  const visit = (feature: CadFeature) => {
    if (visiting.has(feature.output)) throw new Error(`Cyclic feature dependency: ${feature.output}`);
    if (visited.has(feature.output)) return;
    visiting.add(feature.output);
    const sources = liveFeatureInputs(feature, document, before);
    inputs.set(feature.output, sources);
    for (const id of sources) {
      const source = features.get(id);
      if (!source || !document.objects[id]) throw new Error(`Missing source input ${id} required by ${feature.output}. Delete dependent features first.`);
      visit(source);
    }
    visiting.delete(feature.output);
    visited.add(feature.output);
    ordered.push(feature);
  };
  for (const feature of features.values()) visit(feature);

  const dirty = new Set<string>();
  for (const feature of ordered) {
    const old = previous.get(feature.output);
    const sources = inputs.get(feature.output)!;
    const hole=feature.params.faceHole as FaceHoleDefinition|undefined;
    const planeChanged=hole&&JSON.stringify(before.workPlanes?.[hole.planeId])!==JSON.stringify(document.workPlanes?.[hole.planeId]);
    if (old && (sources.some(id => dirty.has(id)) || rebuildObjectIds.has(feature.output) || planeChanged)) {
      const object = document.objects[feature.output];
      if (!object || !document.layers[object.layerId]) throw new Error(`Missing output object or layer: ${feature.output}`);
      if (document.layers[object.layerId].locked) throw new FeatureRegenerationError(`Cannot regenerate ${feature.output}: output layer is locked.`,[feature.output,...sources]);
      try {
        feature.params = await rebuildParams(document, feature, features,sources.length > 0);
        if(sources.length)feature.dependencyMode = "live";
      } catch (error) {
        throw new FeatureRegenerationError(`Cannot regenerate ${feature.type} ${feature.output}: ${error instanceof Error ? error.message : String(error)}`,
          [...new Set([feature.output,...sources,...(error instanceof FeatureRegenerationError?error.geometryIds:[])])]);
      }
    }
    if (!old || geometrySignature(document, feature) !== geometrySignature(before, old)) dirty.add(feature.output);
  }
}

async function rebuildParams(document: CadDocument, feature: CadFeature, features: Map<string, CadFeature>, refreshInputs=true): Promise<Record<string, unknown>> {
  if(feature.params.componentContent)return rebuildContent(document,feature);
  if(feature.params.architecturalSlab)return rebuildSlab(document,feature.params.architecturalSlab as import("@agent-webcad/cad-document").ArchitecturalSlab,feature.params.solidFinish);
  if(feature.params.architecturalWall){const definition=feature.params.architecturalWall as import("@agent-webcad/cad-document").ArchitectureWall;feature.type=definition.openings.length?"boolean":"extrude";return {...await architectureWallParams(document,definition),...feature.params.solidFinish?{solidFinish:feature.params.solidFinish}:{}};}
  if (feature.construction) return { ...feature.params, ...evaluateConstruction(document, feature.construction, feature.params.workPlane as import("../precision/workPlane").WorkPlaneId, features) };
  if(feature.pattern)return buildPatternDrawingParams(document,feature.pattern,feature.output,features);
  let params = structuredClone(feature.params);
  const profile = (ids: string[]) => {
    const result = extractSketchLoops(document, ids, { forRegeneration: true });
    if (!result.ok) throw new Error(result.reason);
    if (result.loops.length !== 1) throw new Error("Exactly one closed source profile is required.");
    if (result.loops[0].holes?.length) throw new Error("This operation requires a profile without holes.");
    return result.loops[0];
  };
  const operand = (id: string): SerializedOperand => {
    const source = features.get(id)!, object = document.objects[id];
    if (!source || !object || !["primitive", ...DERIVED_TYPES].includes(source.type)) throw new Error(`Input ${id} is not a solid.`);
    const transform = getObjectTransform(object, source);
    if (!transform.scale.every(value => Math.abs(value - 1) <= 1e-9)) throw new Error(`Scaled source solid ${id} is not supported.`);
    return { params: structuredClone(source.params), transform: structuredClone(transform) };
  };
  if (refreshInputs && feature.type === "extrude") {
    if(typeof params.faceSketchId==="string"){
      const sketch=document.sketches?.[params.faceSketchId],result=sketch&&faceSketchExtrusionProfile(sketch);
      if(!result)throw Error(`Face sketch ${params.faceSketchId} is unresolved or has no single closed profile.`);
      if(JSON.stringify(result.sourceObjectIds.sort())!==JSON.stringify([...feature.inputs].sort()))throw Error("Face sketch profile ownership changed; recreate the extrusion.");
      params.profile=result.profile;delete params.profiles;
    }else{
      const result = extractSketchLoops(document, feature.inputs, { forRegeneration: true });
      if (!result.ok) throw new Error(result.reason);
      delete params.profile; delete params.profiles;
      const ids=params.profileRegionIds as string[]|undefined,loops=ids?result.loops.filter(loop=>ids.includes(loop.id)):result.loops;
      if(!loops.length||ids?.some(id=>!loops.some(loop=>loop.id===id)))throw Error("Extrusion region ownership changed. Recreate the affected extrusion.");
      Object.assign(params, extrusionProfileParams(loops));
    }
  } else if (refreshInputs && feature.type === "revolve") {
    const loop = profile(feature.inputs);
    params.profile = loop;
    if (feature.type === "revolve") {
      const plane = WORK_PLANES[loop.workPlane];
      if (params.axis === "x" || params.axis === "y") {
        params.axisOrigin = [...plane.origin];
        params.axisDirection = [...(params.axis === "y" ? plane.yAxis : plane.xAxis)];
      }
    }
  } else if (refreshInputs && feature.type === "sweep") {
    params.profile = profile(feature.inputs.slice(0, -1));
    const pathId = feature.inputs.at(-1)!;
    const object = document.objects[pathId], path = features.get(pathId)!;
    if (!object || path?.type !== "drawing" || !["line", "polyline", "arc", "circle"].includes(String(path.params.kind))) throw new Error("Sweep path must remain a drawing curve.");
    const points = getWorldDrawingGeometry(object, path)?.points;
    const spine = points?.filter((point, index) => index === 0 || Math.hypot(...point.map((value, axis) => value - points[index - 1][axis])) > 1e-9);
    if (!spine || spine.length < 2) throw new Error("Sweep path is degenerate.");
    params.spine = spine;
  } else if (refreshInputs && feature.type === "loft") {
    if (feature.inputs.length < 2) throw new Error("Loft requires at least two sections.");
    params.profiles = feature.inputs.map(id => profile([id]));
  } else if (refreshInputs && feature.type === "boolean") {
    if(params.faceHole){
      const hole=params.faceHole as FaceHoleDefinition,plane=document.workPlanes?.[hole.planeId];
      if(hole.targetId!==feature.inputs[0]||!plane?.source||plane.source.objectId!==hole.targetId)throw Error("Hole source ownership changed.");
      const resolution=await resolveStoredWorkPlane(document,plane);
      if(resolution.status!=="resolved")return {...params,faceHoleStatus:resolution.status};
      params=await faceHoleParams(document,hole,features.get(hole.targetId)!);
    }else if(params.faceCut){
      const cut=params.faceCut as FaceCutDefinition,sketch=document.sketches?.[cut.sketchId];
      if(cut.targetId!==feature.inputs[0])throw Error("Face cut source ownership changed.");
      // Preserve the last reviewable shape until the user explicitly rebinds the face.
      if(sketch?.faceStatus!=="resolved")return params;
      const profile=faceSketchExtrusionProfile(sketch);
      if(!profile||JSON.stringify(profile.sourceObjectIds.sort())!==JSON.stringify(feature.inputs.slice(1).sort()))throw Error("Face cut profile ownership changed; recreate the cut.");
      params=await faceCutParams(document,cut,features.get(cut.targetId)!);
    }else{
      if (feature.inputs.length !== 2) throw new Error("Boolean requires two source solids.");
      params.operands = feature.inputs.map(operand);
    }
  } else if(refreshInputs && feature.type==="shell") {
    if(feature.inputs.length!==1)throw Error("Shell requires one source solid.");
    const source=features.get(feature.inputs[0])!,keys=params.faceKeys as string[];
    const status=await shellFaceStatus(source,keys);
    if(status!=="resolved")return {...params,referenceStatus:status};
    return shellParams(document,source,Number(params.thickness),keys);
  } else if(refreshInputs) {
    if (feature.inputs.length !== 1) throw new Error("Edge treatment requires one source solid.");
    params.source = operand(feature.inputs[0]);
  }
  const build = {
    extrude: buildExtrudeMesh, revolve: buildRevolveMesh, sweep: buildSweepMesh,
    shell: buildShellMesh, loft: buildLoftMesh, boolean: buildBooleanMesh, fillet: buildFilletMesh, chamfer: buildChamferMesh,
  }[feature.type as "shell" | "extrude" | "revolve" | "sweep" | "loft" | "boolean" | "fillet" | "chamfer"];
  const mesh = await build(params, true);
  if(feature.type==="boolean"&&(params.faceCut||params.faceHole)){
    const operands=params.operands as SerializedOperand[];
    const [source,result]=await Promise.all([inspectSolid(operands[0]),inspectSolid({params})]);
    if(source.volume===undefined||result.volume===undefined||result.validity==="invalid"||result.volume<=1e-9||result.volume>=source.volume-Math.max(1e-6,source.volume*1e-8))throw Error("Face cut no longer removes a measurable volume or leaves a valid solid.");
  }
  const bounds = meshPositionsBounds(mesh.positions);
  if (!bounds || !mesh.indices.length) throw new Error("Regenerated solid is empty or has invalid bounds.");
  params = { ...params, bounds };
  return params;
}


