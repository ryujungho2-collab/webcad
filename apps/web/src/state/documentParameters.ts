import { parameterTargets,parameterTargetKey,resolveParameterBindings,validateFeatureParameters,type CadDocument,type ParameterTarget } from "@agent-webcad/cad-document";
import { CommandBus,type CadCommand,type CommandDiagnostic } from "@agent-webcad/cad-commands";
import { solveSketch } from "../precision/sketchSolver";
import { sketchGeometryToDrawingParams } from "../precision/sketchAdapter";
import { constraintGeometryIds } from "../precision/sketchEditing";

export class SketchParameterConflictError extends Error {
  constructor(message:string,public diagnostic:CommandDiagnostic){super(message);}
}

export function registerParameterCommandHandlers(bus:CommandBus,document:CadDocument) {
  bus.registerHandler("set-variable",async (command:CadCommand)=>{
    if (command.type !== "set-variable") return;
    const next = {name:command.name,quantity:command.quantity,expression:command.expression.trim()};
    if (JSON.stringify(document.variables?.[command.name]) === JSON.stringify(next)) return {accepted:false,reason:"Variable is unchanged."};
    document.variables ??= {}; document.variables[command.name] = next; document.revision++;
  });
  bus.registerHandler("remove-variable",async (command:CadCommand)=>{
    if (command.type !== "remove-variable" || !document.variables || !Object.hasOwn(document.variables,command.name)) return {accepted:false,reason:"Variable not found."};
    delete document.variables[command.name]; document.revision++;
  });
  bus.registerHandler("set-parameter-binding",async (command:CadCommand)=>{
    if (command.type !== "set-parameter-binding") return;
    if(!parameterTargets(document).some(info=>parameterTargetKey(info.target)===parameterTargetKey(command.target)))return {accepted:false,reason:"Binding target does not exist or is unsupported."};
    const layer=targetLayer(document,command.target);
    if(!layer?.visible||layer.locked)return {accepted:false,reason:"Binding source layer is hidden or locked."};
    const existing = Object.values(document.parameterBindings??{}).find(binding=>parameterTargetKey(binding.target) === parameterTargetKey(command.target));
    if (existing?.expression === command.expression.trim()) return {accepted:false,reason:"Binding is unchanged."};
    const id = existing?.id ?? `binding-${crypto.randomUUID()}`;
    document.parameterBindings ??= {};
    document.parameterBindings[id] = {id,target:structuredClone(command.target),expression:command.expression.trim()}; document.revision++;
  });
  bus.registerHandler("remove-parameter-binding",async (command:CadCommand)=>{
    if (command.type !== "remove-parameter-binding" || !document.parameterBindings?.[command.bindingId]) return {accepted:false,reason:"Binding not found."};
    const layer=targetLayer(document,document.parameterBindings[command.bindingId].target);
    if(!layer?.visible||layer.locked)return {accepted:false,reason:"Binding source layer is hidden or locked."};
    delete document.parameterBindings[command.bindingId]; document.revision++;
  });
}

function targetLayer(document:CadDocument,target:ParameterTarget) {
  return target.kind === "feature" ? document.layers[document.objects[target.objectId]?.layerId] : document.layers[document.sketches?.[target.sketchId]?.layerId??""];
}

/** Resolve all bindings together, then solve each affected sketch once, before dependent rebuilds. */
export function refreshParameterBindings(document:CadDocument,before:CadDocument):Set<string> {
  const available = new Set(parameterTargets(document).map(info=>parameterTargetKey(info.target)));
  // Removing a source/constraint also removes its owned binding in the same transaction.
  for (const [id,binding] of Object.entries(document.parameterBindings??{})) if (!available.has(parameterTargetKey(binding.target)) && before.parameterBindings?.[id] && !available.has(parameterTargetKey(before.parameterBindings[id].target))) delete document.parameterBindings![id];
  const previous = new Map(parameterTargets(before).map(info=>[parameterTargetKey(info.target),info]));
  const affectedSketches = new Set<string>(), changedFeatures = new Set<string>(), rebuild = new Set<string>();
  for (const {binding,info,value} of resolveParameterBindings(document)) {
    const prior = before.parameterBindings?.[binding.id], old = previous.get(parameterTargetKey(binding.target));
    if (prior && JSON.stringify(prior) === JSON.stringify(binding) && old && info.value !== old.value) throw new Error(`${info.label} is driven by '${binding.expression}'. Edit its variables or remove the binding before editing the value.`);
    if (value === info.value) continue;
    const layer = targetLayer(document,binding.target);
    if (!layer?.visible || layer.locked) throw new Error(`Cannot update ${info.label}: source layer is hidden or locked.`);
    const target = binding.target;
    if (target.kind === "feature") {
      const feature = Object.values(document.features).find(feature=>feature.output === target.objectId)!;
      feature.params[target.parameter] = value;
      changedFeatures.add(feature.id);
      if (feature.type !== "primitive" && feature.type !== "drawing") rebuild.add(target.objectId);
    } else {
      const constraint = document.sketches![target.sketchId].constraints.find(constraint=>constraint.id === target.constraintId)!;
      if (constraint.kind === "fixed-point") constraint.value[target.component === "x" ? 0 : 1] = value;
      else if ("value" in constraint && typeof constraint.value === "number") constraint.value = value;
      affectedSketches.add(target.sketchId);
    }
  }
  for (const id of changedFeatures) if (!validateFeatureParameters(document.features[id])) throw new Error(`Invalid driven parameters: ${document.objects[document.features[id].output].name}.`);
  for (const id of affectedSketches) {
    const solved = solveSketch(document.sketches![id]);
    if (!solved.ok) throw new SketchParameterConflictError(`Cannot solve ${id}: ${solved.reason}`,{
      kind:"sketch-conflict",sketchId:id,constraintIds:solved.conflictingConstraintIds,
      geometryIds:[...new Set(document.sketches![id].constraints.filter(c=>solved.conflictingConstraintIds.includes(c.id)).flatMap(constraintGeometryIds))],
    });
    document.sketches![id] = solved.sketch;
    for (const geometry of solved.sketch.geometry) {
      const projection = Object.values(document.features).find(feature=>feature.output === geometry.id);
      if (!projection || projection.params.sketchId !== id) throw new Error(`Missing sketch projection: ${geometry.id}.`);
      projection.params = sketchGeometryToDrawingParams(solved.sketch,geometry);
    }
  }
  return rebuild;
}
