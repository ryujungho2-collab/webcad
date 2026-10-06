import type { CadDocument } from "./CadDocument";
import { featureContract } from "./FeatureContract";
import { assertExpressionQuantity,evaluateExpression,evaluateVariables,type VariableQuantity } from "./Expressions";

export type ParameterTarget =
  | { kind:"feature"; objectId:string; parameter:string }
  | { kind:"sketch-constraint"; sketchId:string; constraintId:string; component?:"x"|"y" };
export type CadParameterBinding = { id:string; target:ParameterTarget; expression:string };
export type ParameterTargetInfo = { target:ParameterTarget; label:string; quantity:VariableQuantity; unit:"mm"|"rad"|"deg"|""; value:number };
export const parameterTargetKey = (target:ParameterTarget) => target.kind === "feature"
  ? JSON.stringify([target.kind,target.objectId,target.parameter]) : JSON.stringify([target.kind,target.sketchId,target.constraintId,target.component??null]);

export function validParameterTarget(target: unknown): target is ParameterTarget {
  if (!target || typeof target !== "object" || Array.isArray(target)) return false;
  const t = target as Record<string,unknown>, string = (value:unknown) => typeof value === "string" && value.length > 0;
  if (t.kind === "feature") return string(t.objectId) && string(t.parameter);
  return t.kind === "sketch-constraint" && string(t.sketchId) && string(t.constraintId) && (t.component === undefined || t.component === "x" || t.component === "y");
}

/** Enumerates only numeric, authoritative source values; derived projections are excluded. */
export function parameterTargets(document:CadDocument): ParameterTargetInfo[] {
  const targets:ParameterTargetInfo[] = [];
  for (const feature of Object.values(document.features)) {
    if (feature.params.sketchId || feature.pattern) continue;
    for (const field of featureContract(feature).parameters) {
      if (!["length","angle","count"].includes(field.quantity) || typeof feature.params[field.key] !== "number") continue;
      targets.push({target:{kind:"feature",objectId:feature.output,parameter:field.key},label:`${document.objects[feature.output]?.name ?? feature.output} · ${field.key}`,quantity:field.quantity === "count" ? "scalar" : field.quantity as VariableQuantity,unit:field.unit??"",value:Number(feature.params[field.key])});
    }
  }
  for (const sketch of Object.values(document.sketches??{})) for (const constraint of sketch.constraints) {
    if (constraint.kind === "fixed-point") for (const component of ["x","y"] as const) targets.push({target:{kind:"sketch-constraint",sketchId:sketch.id,constraintId:constraint.id,component},label:`${sketch.id} · ${constraint.id}.${component}`,quantity:"length",unit:"mm",value:constraint.value[component === "x" ? 0 : 1]});
    else if (["distance","radius","diameter","angle"].includes(constraint.kind) && "value" in constraint && typeof constraint.value === "number") targets.push({target:{kind:"sketch-constraint",sketchId:sketch.id,constraintId:constraint.id},label:`${sketch.id} · ${constraint.id} (${constraint.kind})`,quantity:constraint.kind === "angle" ? "angle" : "length",unit:constraint.kind === "angle" ? "rad" : "mm",value:constraint.value});
  }
  return targets;
}

export function resolveParameterBindings(document:CadDocument) {
  const variables = evaluateVariables(document.variables), targets = new Map(parameterTargets(document).map(target=>[parameterTargetKey(target.target),target]));
  const bindings = document.parameterBindings??{};
  if (!bindings || typeof bindings !== "object" || Array.isArray(bindings) || Object.keys(bindings).length > 2048) throw new Error("Invalid parameter binding collection (maximum 2048).");
  const occupied = new Set<string>();
  return Object.entries(bindings).map(([id,binding])=>{
    if (!binding || binding.id !== id || !validParameterTarget(binding.target)) throw new Error(`Invalid parameter binding: ${id}.`);
    const key = parameterTargetKey(binding.target), info = targets.get(key);
    if (!info) throw new Error(`Binding target does not exist or is unsupported: ${id}.`);
    if (occupied.has(key)) throw new Error(`Duplicate binding target: ${id}.`);
    occupied.add(key);
    const {result,dependencies} = evaluateExpression(binding.expression,name=>{
      if (!Object.hasOwn(variables,name)) throw new Error(`Unknown variable: ${name}.`);
      const value = variables[name];return {value:value.value,length:value.quantity === "length" ? 1 : 0,angle:value.quantity === "angle" ? 1 : 0};
    });
    assertExpressionQuantity(result,info.quantity);
    const value = info.unit === "deg" ? result.value*180/Math.PI : result.value;
    if (!Number.isFinite(value)) throw new Error(`Non-finite parameter result: ${id}.`);
    return {binding,info,value,dependencies};
  });
}
