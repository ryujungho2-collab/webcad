import type { CadDocument } from "@agent-webcad/cad-document";
import type { CommandBus, CadCommand } from "@agent-webcad/cad-commands";
import { dimensionSourceGeometry } from "../precision/dimensionSource";
import { resolveAngularSources } from "../precision/angularDimensionSource";
import type { AngularDimensionDefinition } from "@agent-webcad/cad-document";
import { DEFAULT_LINEAR_DIMENSION_PRESET, dimensionStylePresetKey, MAX_DIMENSION_STYLE_PRESETS,
  validLinearDimensionPresetStyle } from "@agent-webcad/cad-document";
import { dimensionStyle } from "../precision/dimensionGeometry";

/** Annotation mutations belong to dimensions, independently of contour tools. */
export function registerDimensionCommandHandlers(commandBus: CommandBus, document: CadDocument) {
  const featureForObject = (id: string) => Object.values(document.features).find(f => f.output === id);
  const editableObject = (id: string) => {
    const object = document.objects[id], layer = object && document.layers[object.layerId];
    return object && layer?.visible && !layer.locked ? object : undefined;
  };
  const editableLinearDimension = (id: string) => {
    const feature = featureForObject(id);
    if (!editableObject(id)?.visible || feature?.type !== "dimension" || feature.params.kind !== "linear") {
      throw Error("Select visible linear dimensions on unlocked layers.");
    }
    return feature;
  };
  const presetNamed = (name: string) => {
    const key = dimensionStylePresetKey(name);
    return document.dimensionStylePresets?.find(preset => dimensionStylePresetKey(preset.name) === key);
  };
  commandBus.registerHandler("save-dimension-style-preset", command => {
    if (command.type !== "save-dimension-style-preset") return;
    const source = editableLinearDimension(command.objectId);
    const name = command.name.trim();
    if (presetNamed(name)) throw Error("A dimension style already uses this name.");
    if ((document.dimensionStylePresets?.length ?? 0) >= MAX_DIMENSION_STYLE_PRESETS) {
      throw Error("This document has reached its dimension style preset limit.");
    }
    const style = dimensionStyle(source.params);
    const defaults = DEFAULT_LINEAR_DIMENSION_PRESET;
    const snapshot = {
      lengthUnit: style.lengthUnit ?? defaults.lengthUnit,
      precision: style.precision ?? defaults.precision,
      textHeight: style.textHeight ?? defaults.textHeight,
      arrowSize: style.arrowSize ?? defaults.arrowSize,
    };
    if (!validLinearDimensionPresetStyle(snapshot)) throw Error("The source dimension has unsupported display settings.");
    (document.dimensionStylePresets ??= []).push({ name, style: snapshot });
    document.revision++;
  });

  commandBus.registerHandler("apply-dimension-style-preset", command => {
    if (command.type !== "apply-dimension-style-preset") return;
    const preset = presetNamed(command.name);
    if (!preset) throw Error("This dimension style preset is missing.");
    // Resolve all targets first, so a stale or locked selection cannot partly apply.
    const targets = [...new Set(command.objectIds)].map(editableLinearDimension);
    let changed = false;
    for (const feature of targets) {
      const previous = dimensionStyle(feature.params);
      const style = { ...previous, ...preset.style };
      if (JSON.stringify(style) === JSON.stringify(previous)) continue;
      feature.params = { ...feature.params, style };
      changed = true;
    }
    if (changed) document.revision++;
    return { accepted: true };
  });
  commandBus.registerHandler("create-dimension", async (command: CadCommand) => {
    if (command.type !== "create-dimension") return;
    const layerId = command.layerId ?? "layer-default";
    const layer = document.layers[layerId];
    if (!layer || !layer.visible || layer.locked) return;
    const id = command.id ?? `dimension-${crypto.randomUUID()}`;
    const featureId = `feature-${id}`;
    if (document.objects[id] || document.features[featureId]) return;
    const kind = command.dimension;
    const params: Record<string, unknown> = kind === "angular" ? resolveAngularSources(document, command.params as AngularDimensionDefinition, true) : structuredClone(command.params);
    if (kind === "diameter" && typeof params.sourceObjectId === "string") {
      const source = editableObject(params.sourceObjectId), sourceFeature = featureForObject(params.sourceObjectId);
      if (!source?.visible || !sourceFeature || !dimensionSourceGeometry(source, sourceFeature, typeof params.sourceSegmentId === "string" ? params.sourceSegmentId : undefined)?.radius) return;
    }
    document.objects[id] = {
      id,
      geometryId: `geometry-${id}`,
      name: kind === "angular" ? "Angular Dimension" : kind === "linear" ? "Linear Dimension" : kind === "diameter" ? "Diameter Dimension" : "Radius Dimension",
      visible: true,
      layerId,
      transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    };
    document.features[featureId] = {
      id: featureId,
      type: "dimension",
      inputs: kind === "angular" ? [...new Set([(params as AngularDimensionDefinition).first.objectId, (params as AngularDimensionDefinition).second.objectId])] : typeof params.sourceObjectId === "string" ? [params.sourceObjectId] : [],
      output: id,
      params: { ...params, kind },
    };
    document.rootObjects.push(id);
    layer.objectIds.push(id);
    document.revision += 1;
    return id;
  });

  commandBus.registerHandler("update-dimension", async (command: CadCommand) => {
    if (command.type !== "update-dimension") return;
    const object = editableObject(command.objectId);
    const feature = featureForObject(command.objectId);
    if (!object?.visible || !feature || feature.type !== "dimension") return;
    const patch = command.params;
    if (feature.params.kind === "angular") {
      if (Object.keys(patch).some(k => !["first", "second", "branch", "radius", "text", "style"].includes(k))) throw new Error("Edit the angular dimension's references, angle region, radius, text or style.");
      const next = resolveAngularSources(document, { ...feature.params, ...patch } as AngularDimensionDefinition, true);
      if (JSON.stringify(next) === JSON.stringify(feature.params)) return;
      feature.params = next;
      feature.inputs = [...new Set([next.first.objectId, next.second.objectId])];
      document.revision++;
      return;
    }
    if (Object.keys(patch).some(k => ["first", "second", "branch", "radius"].includes(k))) throw new Error("These parameters require an angular dimension.");
    const next = { ...feature.params };
    let changed = false;
    for (const key of ["orientation", "offset", "angle", "text", "style"] as const) {
      if (!(key in patch)) continue;
      const value = key === "text" && patch[key] === "" ? null : patch[key];
      if (JSON.stringify(next[key]) !== JSON.stringify(value)) {
        next[key] = value as never;
        changed = true;
      }
    }
    if (!changed) return;
    feature.params = next;
    document.revision += 1;
  });
}
