import { constructionInputs, type CadDocument, type CadFeature, type CadObject, type CadPatternInstance, type CadParameterBinding, parameterTargets, parameterTargetKey } from "@agent-webcad/cad-document";
import type { ContourReferenceRoute } from "@agent-webcad/cad-commands";
import type { DrawingTopology } from "../../../precision/drawingTopology";
import { dimensionSourceGeometry } from "../../../precision/dimensionSource";
import { remapAngularReference, resolveAngularSources } from "../../../precision/angularDimensionSource";
import type { AngularDimensionDefinition } from "@agent-webcad/cad-document";
import { resolveDimension } from "../../../precision/dimensionGeometry";
import { WORK_PLANES, worldToPlane } from "../../../precision/workPlane";
import { buildPatternDrawingParams } from "../../../precision/patternGeometry";
import { extractSketchLoops } from "../../../precision/sketchProfiles";
import { hatchLines, validDraftingParams } from "../../../precision/draftingGeometry";
import { getWorldDrawingGeometry } from "../../../precision/worldGeometry";
import { prepareSketchContourReplacement, sketchContourRequirements, type SketchContourRequirement } from "./sketchContourReferences";

import { sceneContourRequirements, reconnectContourScenes, type SceneContourRequirement } from "./contourSceneReferences";

type PatternOrigin = { rootSourceId: string; rootDependentId: string; patternPath: CadPatternInstance[] };
export type ContourReferenceRequirement = {
  dependentId: string; sourceId: string; name: string; referenceSlot?: "first" | "second";
  kind: "dimension" | "profile" | "construction" | "pattern" | "hatch" | "chain" | "binding" | "unsupported";
  dimensionKind?: string; elementKind?: "point" | "segment" | "intersection"; parameter?: string;
  patternId?: string; throughPattern?: PatternOrigin;
} | SketchContourRequirement | SceneContourRequirement;
const patternKey = (id: string) => `pattern-reference:${id}`;

/** Generated identities stay stable, including nested patterns. */
function affectedPatternMembers(document: CadDocument, sourceIds: string[]) {
  const selected = new Set(sourceIds), affected = new Map<string, PatternOrigin>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of Object.values(document.features)) if (f.pattern && !affected.has(f.output)) {
      const p = f.pattern, parent = affected.get(p.sourceId);
      if (selected.has(p.sourceId) || parent) {
        affected.set(f.output, { rootSourceId: parent?.rootSourceId ?? p.sourceId, rootDependentId: parent?.rootDependentId ?? patternKey(p.id), patternPath: [...(parent?.patternPath ?? []), p] }); changed = true;
      }
    }
  }
  return affected;
}
export function contourReferenceRequirements(document: CadDocument, sourceIds: string[]): ContourReferenceRequirement[] {
  const selected = new Set(sourceIds), affected = affectedPatternMembers(document, sourceIds), groups = new Map<string, CadFeature[]>();
  for (const f of Object.values(document.features)) if (f.pattern) groups.set(f.pattern.id, [...(groups.get(f.pattern.id) ?? []), f]);
  const pattern: ContourReferenceRequirement[] = [...groups].flatMap(([id, members]) => members[0].pattern!.sourceObjectIds.filter(sourceId => selected.has(sourceId)).map(sourceId => ({ dependentId: patternKey(id), sourceId, name: `${members[0].pattern!.spec.kind} pattern · ${members.length} instances`, kind: "pattern" as const, patternId: id })));
  const features: ContourReferenceRequirement[] = Object.values(document.features).flatMap((f): ContourReferenceRequirement[] => {
    if (selected.has(f.output) || f.pattern) return [];
    if (f.type === "dimension" && f.params.kind === "angular") {
      const definition = f.params as AngularDimensionDefinition;
      return (["first", "second"] as const).flatMap(referenceSlot => {
        const sourceId = definition[referenceSlot].objectId;
        return selected.has(sourceId) || affected.has(sourceId) ? [{ dependentId: f.output, sourceId, referenceSlot,
          name: `${document.objects[f.output]?.name ?? f.output} · ${referenceSlot} edge · ${document.objects[sourceId]?.name ?? sourceId}`,
          kind: "dimension" as const, dimensionKind: "angular", throughPattern: affected.get(sourceId) }] : [];
      });
    }
    const ids = [...f.inputs, String(f.params.sourceObjectId ?? ""), ...(Array.isArray(f.params.sourceObjectIds) ? f.params.sourceObjectIds.map(String) : [])];
    const refs = new Set(ids.filter(id => selected.has(id) || affected.has(id) && (f.type === "dimension" || !!f.construction)));
    return [...refs].map(sourceId => ({ dependentId: f.output, sourceId, name: `${document.objects[f.output]?.name ?? f.output}${affected.has(sourceId) ? ` · ${document.objects[sourceId]?.name ?? sourceId}` : ""}`,
      kind: f.construction ? "construction" as const : f.type === "dimension" && f.params.sourceObjectId === sourceId && ["linear", "radius", "diameter"].includes(String(f.params.kind)) ? "dimension" as const : ["extrude", "revolve", "loft", "sweep"].includes(f.type) && f.dependencyMode !== "snapshot" ? "profile" as const : f.type === "drafting" && String(f.params.kind) === "hatch" && Array.isArray(f.params.sourceObjectIds) ? "hatch" as const : f.type === "drafting" && String(f.params.kind) === "chain" && typeof f.params.sourceObjectId === "string" ? "chain" as const : "unsupported" as const,
      dimensionKind: f.type === "dimension" ? String(f.params.kind) : undefined,
      elementKind: f.construction ? ["midpoint", "perpendicular-bisector"].includes(f.construction.operation) ? "segment" as const : f.construction.operation === "intersection" ? "intersection" as const : "point" as const : undefined,
      throughPattern: affected.get(sourceId) }));
  });
  const bindings = bindingRequirements(document, sourceIds);
  return [...features, ...pattern, ...bindings, ...sketchContourRequirements(document, sourceIds), ...sceneContourRequirements(document,sourceIds)];
}

function bindingRequirements(document: CadDocument, sourceIds: string[]): ContourReferenceRequirement[] {
  const selected = new Set(sourceIds);
  return Object.values(document.parameterBindings ?? {}).flatMap((b): ContourReferenceRequirement[] => {
    if (b.target.kind !== "feature" || !selected.has(b.target.objectId)) return [];
    return [{ dependentId: b.id, sourceId: b.target.objectId, name: `${document.objects[b.target.objectId]?.name ?? b.target.objectId} · ${b.target.parameter} (${b.id})`, kind: "binding" as const, parameter: b.target.parameter }];
  });
}

/** Stage owner/group metadata and explicit element references before replacement. */
export function reconnectContourReferences(document: CadDocument, sourceIds: string[], outputs: { object: CadObject; feature: CadFeature }[], routes: ContourReferenceRoute[] = []) {
  const requirements = contourReferenceRequirements(document, sourceIds);
  const slot = (r: ContourReferenceRequirement | ContourReferenceRoute) => "referenceSlot" in r ? r.referenceSlot : undefined;
  const matches = (route: ContourReferenceRoute, r: ContourReferenceRequirement) => route.dependentId === r.dependentId && route.sourceId === r.sourceId && slot(route) === slot(r);
  if (routes.length !== requirements.length || requirements.some(r => !routes.some(route => matches(route, r)))) throw new Error("Reconnect every dependent reference to a result before applying. Stale or extra reference mappings are rejected.");
  for (const route of routes) if (route.branch !== undefined) {
    const r = requirements.find(r => r.dependentId === route.dependentId && r.sourceId === route.sourceId);
    if (r?.kind !== "construction" || r.elementKind !== "intersection" || routes.some(other => other.dependentId === route.dependentId && other.branch !== undefined && other.branch !== route.branch)) throw new Error("Choose one consistent branch for each intersection reference.");
  }
  const owned = prepareSketchContourReplacement(document, sourceIds, outputs, routes), edits = new Map(owned.features.map(f => [f.id, f]));
  const stage = { ...document, features: { ...document.features }, objects: { ...document.objects } }, removed = new Set(sourceIds);
  for (const f of Object.values(stage.features)) if (removed.has(f.output)) { delete stage.features[f.id]; delete stage.objects[f.output]; }
  for (const output of outputs) { stage.objects[output.object.id] = output.object; stage.features[output.feature.id] = output.feature; }
  stage.rootObjects = [...document.rootObjects.filter(id=>!removed.has(id)), ...outputs.map(o=>o.object.id)];
  for (const f of owned.features) stage.features[f.id] = f;
  const routeFor = (r: { dependentId: string; sourceId: string; referenceSlot?: "first" | "second" }) => routes.find(route => route.dependentId === r.dependentId && route.sourceId === r.sourceId && route.referenceSlot === r.referenceSlot)!;
  const targetsFor = (route: ContourReferenceRoute) => {
    const targets = route.resultIndices.map(i => outputs[i]);
    if (!targets.length || targets.some(t => !t)) throw new Error("A reference mapping names a result that no longer exists. Review the results again.");
    return targets;
  };
  const checkedGroups = new Set<string>();
  const hatchDependents = new Map<string, { name: string; feature: CadFeature }>();
  const bindingEdits: Record<string, CadParameterBinding> = {};
  for (const r of requirements) if (r.kind === "pattern" && !checkedGroups.has(r.patternId!)) {
    const members = Object.values(document.features).filter(f => f.pattern?.id === r.patternId), recipe = members[0].pattern!, groupRoutes = requirements.filter(q => q.kind === "pattern" && q.patternId === r.patternId);
    const replacements = new Map<string, string>();
    for (const q of groupRoutes) {
      const route = routeFor(q), targets = targetsFor(route);
      if (targets.length !== 1 || route.segmentIndex !== undefined || route.pointIndex !== undefined) throw new Error("Reconnect each authored pattern source to one whole result. Existing instance identities follow that reviewed source.");
      replacements.set(q.sourceId, targets[0].object.id);
    }
    const sources = recipe.sourceObjectIds.map(id => replacements.get(id) ?? id);
    if (new Set(sources).size !== sources.length) throw new Error("Joining multiple sources of the same pattern would merge instance identities. Choose distinct pattern results or edit that pattern group first.");
    for (const member of members) {
      const object = document.objects[member.output]; if (document.layers[object.layerId]?.locked) throw new Error(`Unlock '${object.name}' before reconnecting the whole pattern.`);
      const f = structuredClone(member); f.pattern!.sourceObjectIds = [...sources]; f.pattern!.sourceId = replacements.get(f.pattern!.sourceId) ?? f.pattern!.sourceId; f.inputs = [f.pattern!.sourceId];
      edits.set(f.id, f); stage.features[f.id] = f;
    }
    checkedGroups.add(r.patternId!);
  }
  const affected = affectedPatternMembers(document, sourceIds), evaluated = new Set<string>(), evaluating = new Set<string>(), features = new Map(Object.values(stage.features).map(f => [f.output, f]));
  const evaluatePattern = (id: string) => {
    if (!affected.has(id) || evaluated.has(id)) return;
    if (evaluating.has(id)) throw new Error("Cyclic pattern reconnection."); evaluating.add(id);
    const f = features.get(id)!; evaluatePattern(f.pattern!.sourceId);
    const clone = edits.get(f.id) ?? structuredClone(f); clone.params = buildPatternDrawingParams(stage, clone.pattern!, clone.output, features);
    edits.set(clone.id, clone); features.set(id, clone); stage.features[clone.id] = clone; evaluating.delete(id); evaluated.add(id);
  };
  for (const id of affected.keys()) evaluatePattern(id);
  for (const r of requirements) {
    if (r.kind === "sketch" || r.kind === "pattern" || r.kind === "scene") continue;
    if (r.kind === "unsupported") throw new Error(`'${r.name}' references this contour through an unsupported relationship. Detach or edit that relationship before replacing the contour.`);
    if (r.kind === "binding") {
      const route = routeFor(r);
      if (route.pointIndex !== undefined || route.segmentIndex !== undefined || route.branch !== undefined) throw new Error("Reconnect each variable binding to exactly one result.");
      const targets = targetsFor(route);
      if (targets.length !== 1) throw new Error("Reconnect each variable binding to exactly one result.");
      const t = targets[0], next = { kind: "feature" as const, objectId: t.object.id, parameter: r.parameter! };
      // The reviewed result must provide the same bindable parameter; a changed
      // meaning needs explicit reassignment outside this replacement.
      const bindable = parameterTargets(stage).some(info => parameterTargetKey(info.target) === parameterTargetKey(next));
      if (!bindable) throw new Error(`'${r.name}' drives '${r.parameter}', which the reviewed result no longer provides. Remove or reassign that binding before replacing the contour.`);
      const original = document.parameterBindings?.[r.dependentId];
      if (!original) throw new Error(`The variable binding '${r.dependentId}' no longer exists. Review the references again.`);
      bindingEdits[r.dependentId] = { ...structuredClone(original), target: next };
      continue;
    }
    const route = routeFor(r), original = Object.values(document.features).find(f => f.output === r.dependentId)!;
    if (document.layers[document.objects[original.output].layerId]?.locked) throw new Error(`Unlock '${r.name}' before reconnecting its reference.`);
    let targets = targetsFor(route);
    if (r.throughPattern) {
      const root = routeFor({ dependentId: r.throughPattern.rootDependentId, sourceId: r.throughPattern.rootSourceId });
      if (route.resultIndices.length !== 1 || route.resultIndices[0] !== root.resultIndices[0]) throw new Error("This reference must use the same result as its owning pattern. Review the pattern source and generated reference together.");
      targets = [{ object: stage.objects[r.sourceId], feature: features.get(r.sourceId)! }];
    }
    const f = edits.get(original.id) ?? structuredClone(original); edits.set(f.id, f);
    if (r.kind === "dimension") {
      if (targets.length !== 1 || route.pointIndex !== undefined) throw new Error("Reconnect each dimension to exactly one result.");
      const t = targets[0], topology = t.feature.params.topology as DrawingTopology;
      const segmentId = route.segmentIndex === undefined ? undefined : topology.segments[route.segmentIndex]?.id ?? (route.segmentIndex === 0 ? topology.curves[0]?.id : undefined);
      if (route.segmentIndex !== undefined && !segmentId) throw new Error("Choose an existing result edge for the dimension.");
      if (r.dimensionKind === "angular") {
        if (!segmentId || !r.referenceSlot) throw new Error("Reconnect each angular dimension reference to an explicit straight edge.");
        f.params = remapAngularReference(document, stage, f.params as AngularDimensionDefinition, r.referenceSlot, { objectId: t.object.id, segmentId });
        f.inputs = [...new Set([(f.params as AngularDimensionDefinition).first.objectId, (f.params as AngularDimensionDefinition).second.objectId])];
        continue;
      }
      const geometry = dimensionSourceGeometry(t.object, t.feature, segmentId);
      if (!geometry || (r.dimensionKind === "linear" ? !geometry.points : geometry.radius === undefined)) throw new Error("A linear dimension needs a straight edge or open endpoint span; a radius dimension needs an exact circular edge.");
      const plane = WORK_PLANES[(f.params.workPlane ?? geometry.workPlane) as keyof typeof WORK_PLANES];
      const measured = { ...f.params, ...(geometry.points ? { points: geometry.points.map(p => worldToPlane(p, plane)) } : { center: worldToPlane(geometry.center!, plane), radius: geometry.radius }) };
      if (!resolveDimension(measured)) throw new Error("This reference has zero extent in the dimension's measurement direction. Choose another edge or endpoint span.");
      f.params.sourceObjectId = t.object.id;
      if (segmentId) f.params.sourceSegmentId = segmentId; else delete f.params.sourceSegmentId;
    } else if (r.kind === "construction") {
      if (targets.length !== 1) throw new Error("Reconnect each construction source to one result element.");
      const t = targets[0], topology = t.feature.params.topology as DrawingTopology, definition = f.construction!, before = original.construction!;
      const topologyId = route.pointIndex !== undefined ? topology.controls[route.pointIndex]?.id : route.segmentIndex !== undefined ? topology.segments[route.segmentIndex]?.id ?? (route.segmentIndex === 0 ? topology.curves[0]?.id : undefined) : undefined;
      const span = r.elementKind === "segment" && route.segmentIndex === undefined && route.pointIndex === undefined;
      if (!topologyId && !span) throw new Error("Choose an existing point or edge for the construction.");
      if (!span && (r.elementKind === "point" ? route.pointIndex === undefined : route.segmentIndex === undefined)) throw new Error("Choose the construction's required point or edge, preserving its operation.");
      const element = span ? { span: "endpoints" as const } : { topologyId: topologyId! };
      definition.elements ??= {};
      if (definition.operation === "intersection" && route.branch) definition.branch = route.branch;
      if ("segmentId" in before && before.segmentId === r.sourceId) { (definition as typeof before).segmentId = t.object.id; definition.elements.segment = element; }
      if ("firstId" in before && before.firstId === r.sourceId) { (definition as typeof before).firstId = t.object.id; definition.elements.first = element; }
      if ("secondId" in before && before.secondId === r.sourceId) { (definition as typeof before).secondId = t.object.id; definition.elements.second = element; }
      f.inputs = constructionInputs(definition);
    } else if (r.kind === "hatch") {
      if (route.pointIndex !== undefined || route.segmentIndex !== undefined || route.branch !== undefined) throw new Error("Reconnect each hatch to whole result objects.");
      // One hatch can reference several replaced sources; regions regenerate
      // after every route for it is applied, never on a partial mapping.
      f.params.sourceObjectIds = [...new Set((f.params.sourceObjectIds as string[]).flatMap((id: string) => id === r.sourceId ? targets.map(t => t.object.id) : [id]))];
      hatchDependents.set(r.dependentId, { name: r.name, feature: f });
    } else if (r.kind === "chain") {
      if (targets.length !== 1 || route.pointIndex !== undefined || route.segmentIndex !== undefined || route.branch !== undefined) throw new Error("Reconnect each continuous dimension to exactly one result.");
      const t = targets[0], world = getWorldDrawingGeometry(t.object, t.feature);
      if (!world?.points || world.points.length < 2) throw new Error("A continuous dimension needs a result with measurable points.");
      f.params.sourceObjectId = t.object.id;
      f.params.points = world.points;
      if (!validDraftingParams(f.params)) throw new Error("A continuous dimension cannot follow this result.");
    } else {
      if (route.segmentIndex !== undefined || route.pointIndex !== undefined || original.type !== "extrude" && targets.length !== 1) throw new Error("Reconnect this solid to one complete profile/path; element mappings apply to geometric relationships.");
      if (f.params.sourceObjectId === route.sourceId) f.params.sourceObjectId = targets[0].object.id;
      if (Array.isArray(f.params.sourceObjectIds)) f.params.sourceObjectIds = [...new Set(f.params.sourceObjectIds.flatMap(id => id === route.sourceId ? targets.map(t => t.object.id) : [id]))];
    }
    if (r.kind !== "construction") f.inputs = [...new Set(f.inputs.flatMap(id => id === route.sourceId ? targets.map(t => t.object.id) : [id]))];
  }
  for (const { name, feature } of hatchDependents.values()) {
    const sources = feature.params.sourceObjectIds as string[];
    const loops = extractSketchLoops(stage, sources, { forRegeneration: true });
    if (!loops.ok) throw new Error(`'${name}' cannot hatch the reviewed results: ${loops.reason}`);
    feature.params.regions = loops.loops;
    hatchLines(loops.loops, Number(feature.params.spacing), Number(feature.params.angle));
    stage.features[feature.id] = feature;
  }
  for (const f of edits.values()) if (f.type === "dimension" && f.params.kind === "angular") f.params = resolveAngularSources(stage, f.params as AngularDimensionDefinition);
  return { features: [...edits.values()], sketches: owned.sketches, scenes: reconnectContourScenes(document,stage,sourceIds,outputs.map(o=>o.object.id),routes), bindings: bindingEdits };
}
