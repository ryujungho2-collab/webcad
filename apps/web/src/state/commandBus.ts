import {registerArchitectureContentCommands} from "./architectureContentCommands";
import {registerFloorPlanCommands} from "./floorPlanCommands";
import {registerArchitectureWallCommands} from "./architectureWallCommands";
import {registerFrameStitchCommands} from "./frameStitchCommands";
import {registerFrameSheetCommands} from "./frameSheetCommands";
import {registerFrameLinkCommands} from "./frameLinkCommands";
import {registerWorkspaceSectionCommands} from "./workspaceSectionCommands";
import {registerModelSheetSetCommands} from "./modelSheetSetCommands";
import {registerModelSheetCommands} from "./modelSheetCommands";
import {registerModelNoteCommands} from "./modelNoteCommands";
import {registerModelDrawingCommands} from "./modelDrawingCommands";
import {explodedDisplayOffset,hasExplodedDisplay} from "../precision/modelPresentation";
import {registerModelPresentationCommands} from "./modelPresentationCommands";
import {registerCadPilotCommands} from "./cadPilotCommands";
import { registerExchangeCommands } from "./exchangeCommands";
import { registerSceneCommands } from "./sceneCommands";
import { registerModelViewCommands, isModelViewOnlyCommand } from "./modelViewCommands";
import { registerWorkPlaneCommands } from "./workPlaneCommands";
import { registerFaceSketchCommands } from "./faceSketchCommands";
import { registerFaceCutCommands } from "./faceCutCommands";
import {registerShellCommands} from "./shellCommands";
import { registerFaceHoleCommands } from "./faceHoleCommands";
import { refreshFaceSketches } from "./faceSketchRefresh";
import { validateSceneGraph } from "@agent-webcad/cad-document";
import {
  CommandBus,
  type CadCommand,
} from "@agent-webcad/cad-commands";

import type { CadDocument } from "@agent-webcad/cad-document";
import {validatePatternGroups, validateConstructionGraph} from "@agent-webcad/cad-document";
import {registerPatternCommandHandlers} from "./patternCommands";
import { registerDrawingEditingCommands } from "../features/drawing-editing/registerCommands";
import { registerConstructionCommands } from "./constructionCommands";
import {registerRegularPolygonCommands} from "./regularPolygonCommands";
import {registerEndpointRadiusArcCommands} from "./endpointRadiusArcCommands";
import {registerThreePointCurveCommands} from "./threePointCurveCommands";
import { FeatureRegenerationError, regenerateDependentFeatures } from "./featureRegeneration";
import { getObjectTransform } from "../precision/objectTransform";
import { registerDimensionCommandHandlers } from "./registerDimensionCommandHandlers";
import { registerSketchCommandHandlers } from "./registerSketchCommandHandlers";
import { createDrawingTopology } from "../precision/drawingTopology";
import { extractSketchLoops, extrusionProfileParams } from "../precision/sketchProfiles";
import { getWorldDrawingGeometry } from "../precision/worldGeometry";
import { buildBooleanMesh, buildChamferMesh, buildExtrudeMesh, buildFilletMesh, buildLoftMesh, buildRevolveMesh, buildSweepMesh, meshPositionsBounds, validateBooleanOperation, validateChamferOperation, validateExtrudeOperation, validateFilletOperation, validateLoftOperation, validateRevolveOperation, validateSweepOperation } from "../cad/kernelGeometryService";
import { WORK_PLANES } from "../precision/workPlane";
import { registerDraftingCommandHandlers } from "./registerDraftingCommandHandlers";
import { refreshDrafting } from "../precision/draftingGeometry";
import { registerParameterCommandHandlers,refreshParameterBindings,SketchParameterConflictError } from "./documentParameters";
import { registerArtboardCommandHandlers } from "./artboardCommands";
import { registerVectorCommandHandlers } from "./vectorCommands";
import { registerImageCommandHandlers } from "./imageCommands";

/** Handlers bind to a transaction-owned document, never the live UI document. */
export function createDocumentCommandExecutor(cadDocument: CadDocument) {
const commandBus = new CommandBus();
registerFloorPlanCommands(commandBus,cadDocument);
registerArchitectureWallCommands(commandBus,cadDocument);
registerArchitectureContentCommands(commandBus,cadDocument);
registerDraftingCommandHandlers(commandBus,cadDocument);
registerParameterCommandHandlers(commandBus,cadDocument);
registerPatternCommandHandlers(commandBus,cadDocument);
registerDrawingEditingCommands(commandBus,cadDocument);
registerDimensionCommandHandlers(commandBus,cadDocument);
registerConstructionCommands(commandBus,cadDocument);
registerThreePointCurveCommands(commandBus,cadDocument);
registerEndpointRadiusArcCommands(commandBus,cadDocument);
registerCadPilotCommands(commandBus,cadDocument);
registerRegularPolygonCommands(commandBus,cadDocument);
registerArtboardCommandHandlers(commandBus,cadDocument);
registerWorkspaceSectionCommands(commandBus,cadDocument);
registerFrameLinkCommands(commandBus,cadDocument);
registerFrameSheetCommands(commandBus,cadDocument);
registerFrameStitchCommands(commandBus,cadDocument);
registerSceneCommands(commandBus,cadDocument);
registerModelViewCommands(commandBus,cadDocument);
registerModelPresentationCommands(commandBus,cadDocument);
  registerModelDrawingCommands(commandBus,cadDocument);
  registerModelNoteCommands(commandBus,cadDocument);
  registerModelSheetCommands(commandBus,cadDocument);
  registerModelSheetSetCommands(commandBus,cadDocument);
registerWorkPlaneCommands(commandBus,cadDocument);
registerFaceSketchCommands(commandBus,cadDocument);
registerFaceCutCommands(commandBus,cadDocument);
registerFaceHoleCommands(commandBus,cadDocument);
registerShellCommands(commandBus,cadDocument);
registerExchangeCommands(commandBus,cadDocument);
registerVectorCommandHandlers(commandBus,cadDocument);
registerImageCommandHandlers(commandBus,cadDocument);

function assertEditableCommandTargets(command: CadCommand) {
  const fields=command as unknown as Record<string,unknown>;
  const modelIds=[fields.objectId,fields.targetId,...(Array.isArray(fields.objectIds)?fields.objectIds:[])].filter((id):id is string=>typeof id==="string");
  if(modelIds.some(id=>Object.values(cadDocument.features).some(f=>f.output===id&&f.params.componentContent))&&!["rename-object","set-object-visible","move-object-to-layer","delete-object","update-component-content","detach-component-content","set-solid-finish","define-component-content","register-model-part","create-dimension","create-drafting"].includes(command.type))throw Error("Edit content through its slot or detach it before direct geometry edits.");
  if(modelIds.some(id=>Object.values(cadDocument.features).some(f=>f.output===id&&f.params.architecturalSlab))&&["update-extrude","scale-object","duplicate-object"].includes(command.type))throw Error("Edit floor/ceiling level and thickness through Architectural surfaces.");
  if(["update-extrude","scale-object","duplicate-object"].includes(command.type)&&modelIds.some(id=>Object.values(cadDocument.features).some(f=>f.output===id&&f.params.architecturalWall)))throw Error("Edit architectural walls through Wall dimensions; copy their source to make another independent host.");
  if(!["rename-object","set-object-visible","move-object-to-layer","delete-object","create-drafting","create-dimension"].includes(command.type)&&modelIds.some(id=>Object.values(cadDocument.features).some(f=>f.output===id&&f.params.kind==="face")))throw Error("Planar faces follow their boundary sources. Edit the sources to transform the face.");
  if(hasExplodedDisplay(cadDocument)&&["move-object","rotate-object","scale-object"].includes(command.type)&&modelIds.some(id=>explodedDisplayOffset(cadDocument,id).some(v=>v!==0)))throw Error("Assemble the display before direct transforms, or use explicit part placement in Assembly and drawings.");
  if(!["rename-object","create-dimension","create-drafting"].includes(command.type)&&modelIds.some(id=>Object.values(cadDocument.features).some(f=>f.output===id&&(f.params.modelProjection||f.params.modelSection||f.params.modelSectionPresentation))))throw Error("This is a model-associated outline. Edit/rebind its derived view or its source part.");
  if(command.type!=="rename-object"&&modelIds.some(id=>Object.values(cadDocument.features).some(f=>f.output===id&&typeof f.params.modelSheet==="string"&&cadDocument.modelPresentation?.sheets?.[f.params.modelSheet]?.publication)))throw Error("Edit owned frame fields/geometry through the published sheet set.");
  if(command.type==="update-artboard"&&["origin","size","workPlane"].some(k=>fields[k]!==undefined)&&Object.values(cadDocument.modelPresentation?.sheets??{}).some(s=>s.artboardId===fields.artboardId&&s.publication))throw Error("Edit published paper bounds through the sheet set.");
  const ids=[fields.objectId,fields.targetId].filter((v):v is string=>typeof v==="string");
  if(!["rename-object","set-object-visible","move-object-to-layer","duplicate-object","create-dimension","create-drafting"].includes(command.type)&&ids.some(id=>Object.values(cadDocument.features).some(f=>f.output===id&&f.pattern)))throw new Error("Edit the pattern or its source, or detach the pattern before editing an individual instance.");
  if (!['rename-object','set-object-visible','move-object-to-layer','delete-object','update-construction'].includes(command.type) && [...ids, ...(Array.isArray(fields.objectIds) ? fields.objectIds : [])].some(id => Object.values(cadDocument.features).some(f => f.output === id && f.construction))) throw new Error("This object is defined by a construction. Edit its sources; its derived coordinates cannot be overwritten.");
}

async function dispatchWithRegeneration(command: CadCommand): Promise<unknown> {
  assertEditableCommandTargets(command);
  const before = structuredClone(cadDocument);
  const raw = await commandBus.dispatch(command);
  if (command.type !== "batch" && !isModelViewOnlyCommand(command) && cadDocument.revision !== before.revision) {
    try { validateSceneGraph(cadDocument); validatePatternGroups(cadDocument); validateConstructionGraph(cadDocument); const rebuild=refreshParameterBindings(cadDocument,before); await refreshFaceSketches(cadDocument,before); refreshDrafting(cadDocument,before); await regenerateDependentFeatures(cadDocument, before,rebuild); if(await refreshFaceSketches(cadDocument,before))await regenerateDependentFeatures(cadDocument,before); refreshDrafting(cadDocument,before); }
    catch (error) { if(error instanceof SketchParameterConflictError || error instanceof FeatureRegenerationError)throw error;
      throw new FeatureRegenerationError(error instanceof Error ? error.message : "Regeneration failed.",
      Object.values(cadDocument.features).filter((feature) => JSON.stringify(feature) !== JSON.stringify(before.features[feature.id])).map((feature) => feature.output)); }
  }
  return raw;
}

function restoreDocumentSnapshot(snapshot: typeof cadDocument) {
  cadDocument.id = snapshot.id;
  cadDocument.objects = structuredClone(snapshot.objects);
  cadDocument.features = structuredClone(snapshot.features);
  cadDocument.sketches = structuredClone(snapshot.sketches);
  if(snapshot.componentLibrary)cadDocument.componentLibrary=structuredClone(snapshot.componentLibrary);else delete cadDocument.componentLibrary;
  if(snapshot.blocks) cadDocument.blocks = structuredClone(snapshot.blocks); else delete cadDocument.blocks;
  if(snapshot.variables) cadDocument.variables = structuredClone(snapshot.variables); else delete cadDocument.variables;
  if(snapshot.parameterBindings) cadDocument.parameterBindings = structuredClone(snapshot.parameterBindings); else delete cadDocument.parameterBindings;
  if(snapshot.frameLinks) cadDocument.frameLinks = structuredClone(snapshot.frameLinks); else delete cadDocument.frameLinks;
  if(snapshot.workspaceSections) cadDocument.workspaceSections = structuredClone(snapshot.workspaceSections); else delete cadDocument.workspaceSections;
  if(snapshot.artboards) cadDocument.artboards = structuredClone(snapshot.artboards); else delete cadDocument.artboards;
  if(snapshot.scenes) cadDocument.scenes = structuredClone(snapshot.scenes); else delete cadDocument.scenes;
  if(snapshot.exchangeImports) cadDocument.exchangeImports = structuredClone(snapshot.exchangeImports); else delete cadDocument.exchangeImports;
  if(snapshot.modelViews) cadDocument.modelViews = structuredClone(snapshot.modelViews); else delete cadDocument.modelViews;
  if(snapshot.modelPresentation) cadDocument.modelPresentation=structuredClone(snapshot.modelPresentation); else delete cadDocument.modelPresentation;
  if(snapshot.workPlanes) cadDocument.workPlanes = structuredClone(snapshot.workPlanes); else delete cadDocument.workPlanes;
  if(snapshot.rasterAssets) cadDocument.rasterAssets = structuredClone(snapshot.rasterAssets); else delete cadDocument.rasterAssets;
  cadDocument.layers = structuredClone(snapshot.layers);
  cadDocument.rootObjects = [...snapshot.rootObjects];
  cadDocument.rootLayers = [...snapshot.rootLayers];
  cadDocument.revision = snapshot.revision;
}

commandBus.registerHandler("batch", async (command: CadCommand) => {
  if (command.type !== "batch") return;
  // Batches are the transaction boundary. Nested batches are rejected so a
  // child cannot create an independent commit/history boundary.
  if (command.commands.some((entry) => (entry as CadCommand).type === "batch")) {
    return { accepted: false, reason: "Nested batches are not supported." };
  }
  const snapshot = structuredClone(cadDocument);
  const results: unknown[] = [];
  // Coupled driver edits must solve/rebuild the final values together. An
  // intermediate width/height can invalidate a profile that the final pair preserves.
    const coupledDrivers=command.commands.every(entry=>["set-variable","remove-variable","set-parameter-binding","remove-parameter-binding","set-sketch-dimension","remove-sketch-constraint"].includes(entry.type));
    // Exploded profile edges can share an endpoint. Review the final geometry
    // together, rather than rejecting a temporarily open loop mid-transaction.
    const coupledGeometry=command.commands.length>1&&command.commands.every(entry=>["edit-drawing-control","move-object","rotate-object","scale-object","update-primitive","update-extrude","set-object-visible"].includes(entry.type));
  try {
    for (const entry of command.commands) {
      const beforeRevision = cadDocument.revision;
        if(coupledGeometry)assertEditableCommandTargets(entry);
        const result = await (coupledDrivers||coupledGeometry?commandBus.dispatch(entry):dispatchWithRegeneration(entry));
      // Handlers signal a rejected/no-op command by leaving revision intact.
      // A batch containing one such child must not leak earlier mutations.
      if (cadDocument.revision === beforeRevision) {
        restoreDocumentSnapshot(snapshot);
        return { accepted: false, reason: (result as { reason?: string } | undefined)?.reason ?? `Command rejected: ${entry.type}`, diagnostic: (result as { diagnostic?: unknown } | undefined)?.diagnostic };
      }
      results.push(result);
    }
      if(coupledDrivers){const rebuild=refreshParameterBindings(cadDocument,snapshot);await refreshFaceSketches(cadDocument,snapshot);refreshDrafting(cadDocument,snapshot);await regenerateDependentFeatures(cadDocument,snapshot,rebuild);if(await refreshFaceSketches(cadDocument,snapshot))await regenerateDependentFeatures(cadDocument,snapshot);}
      if(coupledGeometry){validateSceneGraph(cadDocument);validatePatternGroups(cadDocument);validateConstructionGraph(cadDocument);const rebuild=refreshParameterBindings(cadDocument,snapshot);await refreshFaceSketches(cadDocument,snapshot);refreshDrafting(cadDocument,snapshot);await regenerateDependentFeatures(cadDocument,snapshot,rebuild);if(await refreshFaceSketches(cadDocument,snapshot))await regenerateDependentFeatures(cadDocument,snapshot);refreshDrafting(cadDocument,snapshot);}
  } catch (error) {
    restoreDocumentSnapshot(snapshot);
    return { accepted: false, reason: error instanceof Error ? error.message : "Batch rejected.", diagnostic: error instanceof SketchParameterConflictError ? error.diagnostic : error instanceof FeatureRegenerationError ? { kind: "regeneration-failed", constraintIds: [], geometryIds: error.geometryIds } : undefined };
  }
  return { accepted: true, results };
});

commandBus.registerHandler(
  "create-layer",
  async (command: CadCommand) => {
    if (command.type !== "create-layer") {
      return;
    }

    const id =
      command.id ??
      `layer-${crypto.randomUUID()}`;

    if (cadDocument.layers[id]) {
      return;
    }

    const requestedName = command.name?.trim();

    cadDocument.layers[id] = {
      id,
      name:
        requestedName ||
        `Layer ${cadDocument.rootLayers.length + 1}`,
      visible: true,
      locked: false,
      objectIds: [],
    };

    cadDocument.rootLayers.push(id);
    cadDocument.revision += 1;

    return id;
  }
);

commandBus.registerHandler(
  "rename-layer",
  async (command: CadCommand) => {
    if (command.type !== "rename-layer") {
      return;
    }

    const layer =
      cadDocument.layers[command.layerId];

    if (!layer) {
      return;
    }

    const name =
      command.name.trim();

    if (!name || name === layer.name) {
      return;
    }

    layer.name = name;
    cadDocument.revision += 1;
  }
);

commandBus.registerHandler(
  "set-layer-visible",
  async (command: CadCommand) => {
    if (command.type !== "set-layer-visible") {
      return;
    }

    const layer =
      cadDocument.layers[command.layerId];

    if (!layer || layer.visible === command.visible) {
      return;
    }

    layer.visible =
      command.visible;

    cadDocument.revision += 1;
  }
);

commandBus.registerHandler(
  "set-layer-locked",
  async (command: CadCommand) => {
    if (command.type !== "set-layer-locked") {
      return;
    }

    const layer =
      cadDocument.layers[command.layerId];

    if (!layer || layer.locked === command.locked) {
      return;
    }

    layer.locked =
      command.locked;

    cadDocument.revision += 1;
  }
);

commandBus.registerHandler(
  "move-object-to-layer",
  async (command: CadCommand) => {
    if (
      command.type !==
      "move-object-to-layer"
    ) {
      return;
    }

    const object =
      cadDocument.objects[
        command.objectId
      ];

    const targetLayer =
      cadDocument.layers[
        command.layerId
      ];

    const sourceLayer = object
      ? cadDocument.layers[object.layerId]
      : undefined;

    if (
      !object ||
      !targetLayer ||
      object.layerId === targetLayer.id ||
      sourceLayer?.locked ||
      Boolean(Object.values(cadDocument.features).find((feature) => feature.output === command.objectId)?.params.sketchId) ||
      targetLayer.locked
    ) {
      return;
    }

    /*
     * Remove ONLY this object
     * from every layer.
     *
     * This also repairs stale /
     * duplicated layer membership.
     */
    for (
      const layer
      of Object.values(
        cadDocument.layers
      )
    ) {
      layer.objectIds =
        layer.objectIds.filter(
          (objectId) =>
            objectId !== object.id
        );
    }

    object.layerId =
      targetLayer.id;

    targetLayer.objectIds.push(
      object.id
    );

    cadDocument.revision += 1;
  }
);

commandBus.registerHandler(
  "set-object-visible",
  async (command: CadCommand) => {
    if (command.type !== "set-object-visible") {
      return;
    }

    const object =
      cadDocument.objects[
        command.objectId
      ];
    const layer = object ? cadDocument.layers[object.layerId] : undefined;

    if (!object || layer?.locked || object.visible === command.visible) {
      return;
    }

    object.visible =
      command.visible;

    cadDocument.revision += 1;
  }
);

commandBus.registerHandler(
  "isolate-object",
  async (command: CadCommand) => {
    if (command.type !== "isolate-object" || !cadDocument.objects[command.objectId]) return;
    const target = cadDocument.objects[command.objectId];
    const targetLayer = cadDocument.layers[target.layerId];
    if (targetLayer?.locked || Object.values(cadDocument.objects).some((object) => {
      const layer = cadDocument.layers[object.layerId];
      return object.visible !== (object.id === command.objectId) && layer?.locked;
    })) return;
    let changed = false;
    for (const object of Object.values(cadDocument.objects)) {
      const visible = object.id === command.objectId;
      if (object.visible !== visible) {
        object.visible = visible;
        changed = true;
      }
    }
    if (changed) cadDocument.revision += 1;
  },
);

commandBus.registerHandler(
  "show-all-objects",
  async (command: CadCommand) => {
    if (command.type !== "show-all-objects") return;
    const objects = cadDocument.rootObjects.map(id => cadDocument.objects[id]).filter(Boolean);
    if (objects.some((object) => {
      const layer = cadDocument.layers[object.layerId];
      return !object.visible && layer?.locked;
    })) return;
    let changed = false;
    for (const object of objects) {
      if (!object.visible) {
        object.visible = true;
        changed = true;
      }
    }
    if (changed) cadDocument.revision += 1;
  },
);

commandBus.registerHandler(
  "rename-object",
  async (command: CadCommand) => {
    if (command.type !== "rename-object") {
      return;
    }

    const object = cadDocument.objects[command.objectId];
    const name = command.name.trim();
    const layer = object ? cadDocument.layers[object.layerId] : undefined;

    if (!object || !name || object.name === name || layer?.locked) {
      return;
    }

    object.name = name;
    cadDocument.revision += 1;
  }
);

commandBus.registerHandler(
  "update-box",
  async (command: CadCommand) => {
    if (command.type !== "update-box") {
      return;
    }

    const feature = Object.values(cadDocument.features).find(
      (entry) => entry.output === command.objectId
    );
    const object = cadDocument.objects[command.objectId];
    const layer = object ? cadDocument.layers[object.layerId] : undefined;

    const values = [command.width, command.depth, command.height];
    const currentValues = feature
      ? [feature.params.width, feature.params.depth, feature.params.height].map(Number)
      : [];

    if (
      !feature ||
      feature.type !== "primitive" ||
      !object ||
      layer?.locked ||
      values.some((value) => !Number.isFinite(value)) ||
      command.width <= 0 ||
      command.depth <= 0 ||
      command.height <= 0 ||
      values.every((value, index) => value === currentValues[index])
    ) {
      return;
    }

    feature.params = {
      ...feature.params,
      width: command.width,
      depth: command.depth,
      height: command.height,
    };

    cadDocument.revision += 1;
  }
);

function findFeatureForObject(objectId: string) {
  return Object.values(cadDocument.features).find(
    (feature) => feature.output === objectId,
  );
}

function getEditableObject(objectId: string) {
  const object = cadDocument.objects[objectId];
  const layer = object ? cadDocument.layers[object.layerId] : undefined;
  return object && !layer?.locked && !findFeatureForObject(objectId)?.params.sketchId ? object : undefined;
}

function primitiveKind(feature: { params: Record<string, unknown> }) {
  return typeof feature.params.kind === "string" ? feature.params.kind : "box";
}

function isValidPrimitiveParams(kind: string, params: Record<string, number>) {
  const valid = (key: string) => Number.isFinite(params[key]) && params[key] > 0;
  if (kind === "box") return valid("width") && valid("depth") && valid("height");
  if (kind === "cylinder") return valid("radius") && valid("height");
  if (kind === "sphere") return valid("radius");
  if (kind === "cone") return valid("radius1") && valid("radius2") && valid("height");
  if (kind === "torus") return valid("majorRadius") && valid("minorRadius") && params.majorRadius > params.minorRadius;
  return false;
}

registerSketchCommandHandlers(commandBus, cadDocument);

commandBus.registerHandler(
  "create-primitive",
  async (command: CadCommand) => {
    if (command.type !== "create-primitive" || !isValidPrimitiveParams(command.primitive, command.params)) return;
    const id = command.id ?? `${command.primitive}-${crypto.randomUUID()}`;
    const featureId = `feature-${id}`;
    const layerId = command.layerId ?? "layer-default";
    const layer = cadDocument.layers[layerId];
    if (cadDocument.objects[id] || cadDocument.features[featureId] || !layer || layer.locked) return;
    cadDocument.objects[id] = {
      id, geometryId: `geometry-${id}`, name: command.primitive[0].toUpperCase() + command.primitive.slice(1), visible: true, layerId,
      transform: { translation: [...(command.position ?? [0, 0, 0])], rotation: [0, 0, 0], scale: [1, 1, 1] },
    };
    cadDocument.features[featureId] = { id: featureId, type: "primitive", inputs: [], output: id, params: { kind: command.primitive, ...command.params } };
    cadDocument.rootObjects.push(id); layer.objectIds.push(id); cadDocument.revision += 1;
    return id;
  },
);

commandBus.registerHandler("create-extrude", async (command: CadCommand) => {
  if (command.type !== "create-extrude") return;
  const loopResult = extractSketchLoops(cadDocument, command.profileObjectIds);
  if (!loopResult.ok || !loopResult.loops.length) return;
  const profiles = command.profileRegionIds?loopResult.loops.filter(loop=>command.profileRegionIds!.includes(loop.id)):loopResult.loops;
  if(!profiles.length||command.profileRegionIds?.some(id=>!profiles.some(loop=>loop.id===id)))throw Error("Selected profile region changed. Review again.");
  const layerId = command.layerId ?? cadDocument.objects[command.profileObjectIds[0]]?.layerId ?? "layer-default";
  const layer = cadDocument.layers[layerId];
  const id = command.id ?? `extrude-${crypto.randomUUID()}`;
  const featureId = `feature-${id}`;
  if (!layer || layer.locked || cadDocument.objects[id] || cadDocument.features[featureId]) return;
  const params:Record<string,unknown> = { kind: "extrude", distance: command.distance, ...extrusionProfileParams(profiles),...(command.profileRegionIds?{profileRegionIds:command.profileRegionIds}:{}) };
  try {
    await validateExtrudeOperation(params);
    params.bounds = meshPositionsBounds((await buildExtrudeMesh(params)).positions);
  } catch {
    return;
  }
  cadDocument.objects[id] = {
    id,
    geometryId: `geometry-${id}`,
    name: "Extrude",
    visible: true,
    layerId,
    transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
  };
  cadDocument.features[featureId] = {
    id: featureId,
    type: "extrude",
    dependencyMode: "live",
    inputs: [...new Set(profiles.flatMap(profile => profile.sourceObjectIds))],
    output: id,
    params,
  };
  cadDocument.rootObjects.push(id);
  layer.objectIds.push(id);
  cadDocument.revision += 1;
  return id;
});

commandBus.registerHandler("update-extrude", async (command: CadCommand) => {
  if (command.type !== "update-extrude") return;
  const object = getEditableObject(command.objectId);
  const feature = findFeatureForObject(command.objectId);
  if (!object || !feature || feature.type !== "extrude" || Number(feature.params.distance) === command.distance) return;
  const params:Record<string,unknown> = { ...structuredClone(feature.params), distance: command.distance };
  try {
    await validateExtrudeOperation(params);
    params.bounds = meshPositionsBounds((await buildExtrudeMesh(params)).positions);
  } catch {
    return;
  }
  feature.params = params;
  cadDocument.revision += 1;
});

commandBus.registerHandler("create-revolve", async (command: CadCommand) => {
  if (command.type !== "create-revolve") return;
  const loopResult = extractSketchLoops(cadDocument, command.profileObjectIds);
  if (!loopResult.ok || loopResult.loops.length !== 1 || loopResult.loops[0].holes?.length) return;
  const profile = loopResult.loops[0];
  const angle = command.angle ?? 360;
  if (!(angle > 0) || angle > 360) return;
  const plane = WORK_PLANES[profile.workPlane];
  const direction = command.axis === "y" ? plane.yAxis : plane.xAxis;
  const layerId = command.layerId ?? cadDocument.objects[command.profileObjectIds[0]]?.layerId ?? "layer-default";
  const layer = cadDocument.layers[layerId];
  const id = command.id ?? `revolve-${crypto.randomUUID()}`;
  const featureId = `feature-${id}`;
  if (!layer || layer.locked || cadDocument.objects[id] || cadDocument.features[featureId]) return;
  const params = {
    kind: "revolve",
    angle,
    axis: command.axis,
    axisOrigin: [...plane.origin] as [number, number, number],
    axisDirection: [...direction] as [number, number, number],
    profile: structuredClone(profile),
  };
  try {
    await validateRevolveOperation(params);
  } catch {
    return;
  }
  const mesh = await buildRevolveMesh(params);
  const bounds = meshPositionsBounds(mesh.positions);
  cadDocument.objects[id] = {
    id,
    geometryId: `geometry-${id}`,
    name: "Revolve",
    visible: true,
    layerId,
    transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
  };
  cadDocument.features[featureId] = {
    id: featureId,
    type: "revolve",
    dependencyMode: "live",
    inputs: [...profile.sourceObjectIds],
    output: id,
    params: bounds ? { ...params, bounds } : params,
  };
  cadDocument.rootObjects.push(id);
  layer.objectIds.push(id);
  cadDocument.revision += 1;
  return id;
});

commandBus.registerHandler("create-sweep", async (command: CadCommand) => {
  if (command.type !== "create-sweep") return;
  const loopResult = extractSketchLoops(cadDocument, command.profileObjectIds);
  if (!loopResult.ok || loopResult.loops.length !== 1 || loopResult.loops[0].holes?.length) return;
  const profile = loopResult.loops[0];
  const pathObject = cadDocument.objects[command.pathObjectId];
  const pathFeature = findFeatureForObject(command.pathObjectId);
  const pathLayer = pathObject ? cadDocument.layers[pathObject.layerId] : undefined;
  if (!pathObject || !pathFeature || pathFeature.type !== "drawing" || !pathObject.visible || !pathLayer?.visible || pathLayer.locked) return;
  const pathKind = String(pathFeature.params.kind);
  if (!["line", "polyline", "arc", "circle"].includes(pathKind)) return;
  const pathWorld = getWorldDrawingGeometry(pathObject, pathFeature);
  const spine = pathWorld?.points?.filter((point, index, points) =>
    index === 0 || Math.hypot(point[0] - points[index - 1][0], point[1] - points[index - 1][1], point[2] - points[index - 1][2]) > 1e-9);
  if (!spine || spine.length < 2) return;
  const layerId = command.layerId ?? cadDocument.objects[command.profileObjectIds[0]]?.layerId ?? "layer-default";
  const layer = cadDocument.layers[layerId];
  const id = command.id ?? `sweep-${crypto.randomUUID()}`;
  const featureId = `feature-${id}`;
  if (!layer || layer.locked || cadDocument.objects[id] || cadDocument.features[featureId]) return;
  const params = { kind: "sweep", profile: structuredClone(profile), spine: structuredClone(spine) };
  try {
    await validateSweepOperation(params);
  } catch {
    return;
  }
  const mesh = await buildSweepMesh(params);
  const bounds = meshPositionsBounds(mesh.positions);
  cadDocument.objects[id] = {
    id,
    geometryId: `geometry-${id}`,
    name: "Sweep",
    visible: true,
    layerId,
    transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
  };
  cadDocument.features[featureId] = {
    id: featureId,
    type: "sweep",
    dependencyMode: "live",
    inputs: [...profile.sourceObjectIds, command.pathObjectId],
    output: id,
    params: bounds ? { ...params, bounds } : params,
  };
  cadDocument.rootObjects.push(id);
  layer.objectIds.push(id);
  cadDocument.revision += 1;
  return id;
});

commandBus.registerHandler("create-loft", async (command: CadCommand) => {
  if (command.type !== "create-loft") return;
  // Loft sections live on different planes by design, while extractSketchLoops
  // requires one coplanar set. Extract each section separately so every
  // profile keeps full loop validation (closed, non-branching, non-zero area).
  const profiles = [];
  for (const profileId of command.profileObjectIds) {
    const section = extractSketchLoops(cadDocument, [profileId]);
    if (!section.ok || section.loops.length !== 1 || section.loops[0].holes?.length) return;
    profiles.push(section.loops[0]);
  }
  if (profiles.length < 2) return;
  const ruled = command.ruled === true;
  const layerId = command.layerId ?? cadDocument.objects[command.profileObjectIds[0]]?.layerId ?? "layer-default";
  const layer = cadDocument.layers[layerId];
  const id = command.id ?? `loft-${crypto.randomUUID()}`;
  const featureId = `feature-${id}`;
  if (!layer || layer.locked || cadDocument.objects[id] || cadDocument.features[featureId]) return;
  const params = { kind: "loft", ruled, profiles: structuredClone(profiles) };
  try {
    await validateLoftOperation(params);
  } catch {
    return;
  }
  const mesh = await buildLoftMesh(params);
  const bounds = meshPositionsBounds(mesh.positions);
  // Sections keep their own loop metadata (workPlane, source ids); only the
  // kernel profile shape is stored. Source drawings stay in the document.
  cadDocument.objects[id] = {
    id,
    geometryId: `geometry-${id}`,
    name: "Loft",
    visible: true,
    layerId,
    transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
  };
  cadDocument.features[featureId] = {
    id: featureId,
    type: "loft",
    dependencyMode: "live",
    inputs: [...command.profileObjectIds],
    output: id,
    params: bounds ? { ...params, bounds } : params,
  };
  cadDocument.rootObjects.push(id);
  layer.objectIds.push(id);
  cadDocument.revision += 1;
  return id;
});

commandBus.registerHandler("update-revolve", async (command: CadCommand) => {
  if (command.type !== "update-revolve") return;
  const object = getEditableObject(command.objectId);
  const feature = findFeatureForObject(command.objectId);
  if (!object || !feature || feature.type !== "revolve" || Number(feature.params.angle) === command.angle) return;
  const params = { ...structuredClone(feature.params), angle: command.angle };
  try {
    await validateRevolveOperation(params);
  } catch {
    return;
  }
  const mesh = await buildRevolveMesh(params);
  const bounds = meshPositionsBounds(mesh.positions);
  feature.params = bounds ? { ...params, bounds } : params;
  cadDocument.revision += 1;
});

commandBus.registerHandler(
  "update-primitive",
  async (command: CadCommand) => {
    if (command.type !== "update-primitive") return;
    const object = getEditableObject(command.objectId);
    const feature = findFeatureForObject(command.objectId);
    if (!object || !feature || feature.type !== "primitive") return;
    const kind = primitiveKind(feature);
    if (!isValidPrimitiveParams(kind, command.params)) return;
    const current = Object.fromEntries(Object.entries(feature.params).filter(([key]) => key !== "kind"));
    if (JSON.stringify(current) === JSON.stringify(command.params)) return;
    feature.params = { kind, ...command.params };
    cadDocument.revision += 1;
  },
);

commandBus.registerHandler(
  "move-object",
  async (command: CadCommand) => {
    if (command.type !== "move-object") return;
    const object = getEditableObject(command.objectId);
    if (!object) return;
    const current = getObjectTransform(object, findFeatureForObject(object.id));
    if (command.translation.every((value, index) => value === current.translation[index])) return;
    object.transform = { ...current, translation: [...command.translation] };
    cadDocument.revision += 1;
  },
);

commandBus.registerHandler(
  "rotate-object",
  async (command: CadCommand) => {
    if (command.type !== "rotate-object") return;
    const object = getEditableObject(command.objectId);
    if (!object) return;
    const current = getObjectTransform(object, findFeatureForObject(object.id));
    if (command.rotation.every((value, index) => value === current.rotation[index])) return;
    object.transform = { ...current, rotation: [...command.rotation] };
    cadDocument.revision += 1;
  },
);

commandBus.registerHandler(
  "scale-object",
  async (command: CadCommand) => {
    if (command.type !== "scale-object") return;
    const object = getEditableObject(command.objectId);
    if (!object) return;
    const current = getObjectTransform(object, findFeatureForObject(object.id));
    if (command.scale.every((value, index) => value === current.scale[index])) return;
    object.transform = { ...current, scale: [...command.scale] };
    cadDocument.revision += 1;
  },
);

commandBus.registerHandler(
  "delete-layer",
  async (command: CadCommand) => {
    if (command.type !== "delete-layer") {
      return;
    }

    if (
      command.layerId ===
      "layer-default"
    ) {
      return;
    }

    const layer =
      cadDocument.layers[
        command.layerId
      ];

    const defaultLayer =
      cadDocument.layers[
        "layer-default"
      ];

    if (
      !layer ||
      !defaultLayer ||
      layer.locked ||
      defaultLayer.locked
    ) {
      return;
    }

    /*
     * Deleting a layer does NOT delete
     * its CAD objects.
     *
     * Move them to Default instead.
     */
    for (
      const objectId
      of layer.objectIds
    ) {
      const object =
        cadDocument.objects[
          objectId
        ];

      if (!object) {
        continue;
      }

      object.layerId =
        "layer-default";

      if (
        !defaultLayer.objectIds.includes(
          objectId
        )
      ) {
        defaultLayer.objectIds.push(
          objectId
        );
      }
    }

    // Sketches are document-owned entities even before their viewport adapter
    // is enabled. Keep their layer references valid when a layer is removed.
    for (const sketch of Object.values(cadDocument.sketches ?? {})) {
      if (sketch.layerId === command.layerId) sketch.layerId = "layer-default";
    }
    for(const block of Object.values(cadDocument.blocks??{}))for(const member of block.members)if(member.layerId===command.layerId)member.layerId="layer-default";

    delete cadDocument.layers[
      command.layerId
    ];

    cadDocument.rootLayers =
      cadDocument.rootLayers.filter(
        (id) =>
          id !== command.layerId
      );

    cadDocument.revision += 1;
  }
);

commandBus.registerHandler(
  "create-box",
  async (command: CadCommand) => {
    if (command.type !== "create-box") {
      return;
    }

    const id =
      command.id ??
      `box-${crypto.randomUUID()}`;

    const layerId =
      command.layerId ??
      "layer-default";

    const layer = cadDocument.layers[layerId];
    const dimensions = [command.width, command.depth, command.height];
    const featureId = `feature-${id}`;

    if (
      cadDocument.objects[id] ||
      cadDocument.features[featureId] ||
      !layer ||
      layer.locked ||
      dimensions.some((value) => !Number.isFinite(value) || value <= 0) ||
      command.position?.some((value) => !Number.isFinite(value))
    ) {
      return;
    }

    cadDocument.objects[id] = {
      id,
      geometryId: `geometry-${id}`,
      name: "Box",
      visible: true,
      layerId,
      transform: {
        translation: [...(command.position ?? [0, 0, 0])],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
    };

    cadDocument.features[
      featureId
    ] = {
      id: featureId,
      type: "primitive",
      inputs: [],
      output: id,
      params: {
        width: command.width,
        depth: command.depth,
        height: command.height,
      },
    };

    cadDocument.rootObjects.push(id);
    layer.objectIds.push(id);
    cadDocument.revision += 1;

    return id;
  }
);

commandBus.registerHandler(
  "delete-object",
  async (command: CadCommand) => {
    if (command.type !== "delete-object") {
      return;
    }

    const object =
      cadDocument.objects[
        command.objectId
      ];

    if (!object) {
      return;
    }

    if (findFeatureForObject(object.id)?.params.sketchId) return;
    const releasedInputs = [...(findFeatureForObject(object.id)?.inputs ?? [])];
    const removedFeature = findFeatureForObject(object.id);
    const releasedAssetId = removedFeature?.type === "image" ? String(removedFeature.params.assetId) : undefined;

    const layer =
      cadDocument.layers[
        object.layerId
      ];

    if (layer?.locked) {
      return;
    }

    if (layer) {
      layer.objectIds =
        layer.objectIds.filter(
          (id) =>
            id !== object.id
        );
    }

    cadDocument.rootObjects =
      cadDocument.rootObjects.filter(
        (id) =>
          id !== object.id
      );

    for (
      const [
        featureId,
        feature,
      ]
      of Object.entries(
        cadDocument.features
      )
    ) {
      if (
        feature.output ===
        object.id
      ) {
        delete cadDocument.features[
          featureId
        ];
      }
    }

    delete cadDocument.objects[
      object.id
    ];

    if (releasedAssetId && !Object.values(cadDocument.componentLibrary??{}).some(d=>d.type==="image"&&d.params.assetId===releasedAssetId) && !Object.values(cadDocument.features).some(feature => feature.type === "image" && feature.params.assetId === releasedAssetId)) {
      delete cadDocument.rasterAssets?.[releasedAssetId];
      if (cadDocument.rasterAssets && !Object.keys(cadDocument.rasterAssets).length) delete cadDocument.rasterAssets;
    }

    for (const id of releasedInputs) {
      const source = cadDocument.objects[id];
      const stillUsed = Object.values(cadDocument.features).some(feature => feature.dependencyMode !== "snapshot" && feature.inputs.includes(id));
      if (source && !stillUsed && !cadDocument.rootObjects.includes(id)) {
        if (cadDocument.layers[source.layerId]?.locked) throw new Error(`Cannot restore source ${id}: layer is locked.`);
        source.visible = true;
        cadDocument.rootObjects.push(id);
      }
    }

    cadDocument.revision += 1;
  }
);

commandBus.registerHandler(
  "duplicate-object",
  async (command: CadCommand) => {
    if (command.type !== "duplicate-object") {
      return;
    }

    const source =
      cadDocument.objects[
        command.objectId
      ];

    if (!source) {
      return;
    }

    const sourceLayer = cadDocument.layers[source.layerId];

    if (!sourceLayer || sourceLayer.locked) {
      return;
    }

    const sourceFeature =
      Object.values(
        cadDocument.features
      ).find(
        (feature) =>
          feature.output ===
          source.id
      );

    if (!sourceFeature) {
      return;
    }

    // Sketch geometry is owned by its sketch. A standalone duplicate must not
    // retain the ownership marker or it would be mistaken for a projection.
    if (sourceFeature.params.sketchId) return;

    const id =
      `copy-${crypto.randomUUID()}`;

    const featureId =
      `feature-${id}`;

    const params = structuredClone(sourceFeature.params);
    const sourceTransform = getObjectTransform(source, sourceFeature);
    const offset = command.offset ?? [10, 0, 0];

    // A duplicate is a new topological entity. Reusing the source IDs makes
    // overlapping Direct Select candidates indistinguishable and would let a
    // future constraint reference accidentally address the wrong copy.
    if (sourceFeature.type === "drawing") {
      const kind = String(params.kind ?? "drawing");
      params.topology = createDrawingTopology(kind, params, id);
    }

    cadDocument.objects[id] = {
      id,
      geometryId:
        `geometry-${id}`,
      name:
        `${source.name} Copy`,
      visible:
        source.visible,
      layerId:
        source.layerId,
      transform: {
        ...sourceTransform,
        translation: [
          sourceTransform.translation[0] + offset[0],
          sourceTransform.translation[1] + offset[1],
          sourceTransform.translation[2] + offset[2],
        ],
      },
    };

    cadDocument.features[
      featureId
    ] = {
      ...structuredClone(
        sourceFeature
      ),
      id: featureId,
      output: id,
      params,
      dependencyMode: "snapshot",
      inputs: [],
    };

    delete cadDocument.features[featureId].pattern;
    cadDocument.rootObjects.push(
      id
    );

    sourceLayer.objectIds.push(
      id
    );

    cadDocument.revision += 1;

    return id;
  }
);

commandBus.registerHandler(
  "boolean-operation",
  async (command: CadCommand) => {
    if (command.type !== "boolean-operation") return;
    const target = cadDocument.objects[command.target];
    const tool = cadDocument.objects[command.tool];
    const targetFeature = findFeatureForObject(command.target);
    const toolFeature = findFeatureForObject(command.tool);
    const targetLayer = target ? cadDocument.layers[target.layerId] : undefined;
    const toolLayer = tool ? cadDocument.layers[tool.layerId] : undefined;
    // Booleans compose over primitives, extrusions, and prior boolean results.
    // Drawings and sketches have no solid volume and are rejected here, before
    // any kernel work starts.
    const solidKinds = ["primitive", "extrude", "boolean", "fillet", "chamfer", "revolve", "sweep", "loft","shell"];
    if (!target || !tool || !targetFeature || !toolFeature || !solidKinds.includes(targetFeature.type) || !solidKinds.includes(toolFeature.type) || targetLayer?.locked || toolLayer?.locked) return;
    // Operand placement applies translation and rotation only: a scaled
    // operand would silently cut the wrong shape, so reject scaled operands
    // rather than producing corrupted geometry.
    for (const [object, feature] of [[target, targetFeature], [tool, toolFeature]] as const) {
      const scale = getObjectTransform(object, feature).scale;
      if (!scale.every((value) => Math.abs(value - 1) <= 1e-9)) return;
    }
    const id = command.id ?? `boolean-${crypto.randomUUID()}`;
    const featureId = `feature-${id}`;
    if (command.id && (cadDocument.objects[id] || cadDocument.features[featureId])) return;
    const operands = [target, tool].map((object, index) => ({
      params: structuredClone((index === 0 ? targetFeature : toolFeature).params),
      transform: structuredClone(getObjectTransform(object, index === 0 ? targetFeature : toolFeature)),
    }));
    try {
      await validateBooleanOperation({ operation: command.operation, operands });
    } catch {
      // Kernel validation is authoritative at the command boundary. UI
      // preflight remains an optional responsiveness optimization only.
      return;
    }
    // Exact kernel bounds make composed results behave in align, selection
    // bounds and group pivots. The mesh call below is a cache hit on the
    // validation above, so no kernel work is repeated.
    const boundsMesh = await buildBooleanMesh({ operation: command.operation, operands });
    const bounds = meshPositionsBounds(boundsMesh.positions);
    for (const object of [target, tool]) retainSource(object.id);
    cadDocument.objects[id] = { id, geometryId: `geometry-${id}`, name: `${command.operation[0].toUpperCase()}${command.operation.slice(1)}`, visible: true, layerId: target.layerId, transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } };
    cadDocument.features[featureId] = { id: featureId, type: "boolean", dependencyMode: "live", inputs: [target.id, tool.id], output: id, params: bounds ? { operation: command.operation, operands, bounds } : { operation: command.operation, operands } };
    cadDocument.rootObjects.push(id); targetLayer?.objectIds.push(id); cadDocument.revision += 1;
    return id;
  },
);

commandBus.registerHandler(
  "fillet",
  async (command: CadCommand) => {
    if (command.type !== "fillet") return;
    const target = cadDocument.objects[command.target];
    const targetFeature = findFeatureForObject(command.target);
    const targetLayer = target ? cadDocument.layers[target.layerId] : undefined;
    // Selective fillet consumes one solid (primitive, extrusion, prior
    // boolean or prior fillet) and produces a new filleted body. Drawings
    // have no solid volume and are rejected before any kernel work starts.
    const solidKinds = ["primitive", "extrude", "boolean", "fillet", "chamfer", "revolve", "sweep", "loft","shell"];
    if (!target || !targetFeature || !solidKinds.includes(targetFeature.type) || !target.visible || !targetLayer?.visible || targetLayer?.locked) return;
    if (!Array.isArray(command.edges) || !command.edges.length) return;
    if (!Number.isFinite(command.radius) || command.radius <= 0) return;
    const transform = getObjectTransform(target, targetFeature);
    if (!transform.scale.every((value) => Math.abs(value - 1) <= 1e-9)) return;
    const params = {
      kind: "fillet",
      radius: command.radius,
      edgeKeys: [...new Set(command.edges)],
      source: { params: structuredClone(targetFeature.params), transform: structuredClone(transform) },
    };
    try {
      await validateFilletOperation(params);
    } catch {
      // Unresolvable references and impossible radii reject atomically.
      return;
    }
    const mesh = await buildFilletMesh(params);
    const bounds = meshPositionsBounds(mesh.positions);
    const id = `fillet-${crypto.randomUUID()}`;
    const featureId = `feature-${id}`;
    retainSource(target.id);
    cadDocument.objects[id] = { id, geometryId: `geometry-${id}`, name: "Fillet", visible: true, layerId: target.layerId, transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } };
    cadDocument.features[featureId] = { id: featureId, type: "fillet", dependencyMode: "live", inputs: [target.id], output: id, params: bounds ? { ...params, bounds } : params };
    cadDocument.rootObjects.push(id); targetLayer?.objectIds.push(id); cadDocument.revision += 1;
    return id;
  },
);

commandBus.registerHandler(
  "chamfer",
  async (command: CadCommand) => {
    if (command.type !== "chamfer") return;
    const target = cadDocument.objects[command.target];
    const targetFeature = findFeatureForObject(command.target);
    const targetLayer = target ? cadDocument.layers[target.layerId] : undefined;
    // Selective symmetric chamfer, mirroring the fillet handler: one solid
    // in (primitive, extrusion, prior boolean, fillet or chamfer), one new
    // chamfered body out. Drawings have no solid volume and are rejected
    // before any kernel work starts.
    const solidKinds = ["primitive", "extrude", "boolean", "fillet", "chamfer", "revolve", "sweep", "loft","shell"];
    if (!target || !targetFeature || !solidKinds.includes(targetFeature.type) || !target.visible || !targetLayer?.visible || targetLayer?.locked) return;
    if (!Array.isArray(command.edges) || !command.edges.length) return;
    if (!Number.isFinite(command.distance) || command.distance <= 0) return;
    const transform = getObjectTransform(target, targetFeature);
    if (!transform.scale.every((value) => Math.abs(value - 1) <= 1e-9)) return;
    const params = {
      kind: "chamfer",
      distance: command.distance,
      edgeKeys: [...new Set(command.edges)],
      source: { params: structuredClone(targetFeature.params), transform: structuredClone(transform) },
    };
    try {
      await validateChamferOperation(params);
    } catch {
      // Unresolvable references and impossible distances reject atomically.
      return;
    }
    const mesh = await buildChamferMesh(params);
    const bounds = meshPositionsBounds(mesh.positions);
    const id = `chamfer-${crypto.randomUUID()}`;
    const featureId = `feature-${id}`;
    retainSource(target.id);
    cadDocument.objects[id] = { id, geometryId: `geometry-${id}`, name: "Chamfer", visible: true, layerId: target.layerId, transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } };
    cadDocument.features[featureId] = { id: featureId, type: "chamfer", dependencyMode: "live", inputs: [target.id], output: id, params: bounds ? { ...params, bounds } : params };
    cadDocument.rootObjects.push(id); targetLayer?.objectIds.push(id); cadDocument.revision += 1;
    return id;
  },
);

function retainSource(id: string) {
  cadDocument.objects[id].visible = false;
  cadDocument.rootObjects = cadDocument.rootObjects.filter(objectId => objectId !== id);
}

return dispatchWithRegeneration;
}


