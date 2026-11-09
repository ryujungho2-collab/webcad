import {parsePlateCreation,splitPlatePreservation} from "./platePrompt";
import { evaluateVariables, featureContract, resolveParameterBindings, validateFeatureParameters, type CadDocument } from "@agent-webcad/cad-document";
import { validateCommand, type CadCommand } from "@agent-webcad/cad-commands";
import type { CopilotPlan, CopilotPlanResult } from "./copilotPlan";
import { mountingPlatePlan, PLATE_FIELDS, validateMountingPlate, type MountingPlateSpec } from "./mountingPlate";

export type SolidParameter = { key: string; value: number; command: Extract<CadCommand, { type: "update-primitive" | "update-extrude" | "set-variable" }> };
export type CopilotSolidContract = { units: "mm"; targetId?: string; name?: string; primitive?: string; parameters: SolidParameter[]; disabledReason?: string; plate?: MountingPlateSpec; plateVariables?: Record<string, string> };
const numericLength = /^(?:\d+(?:\.\d*)?|\.\d+)\s*(?:mm|cm|m)$/;

/** Only selected source parameters and unshared length drivers of that source are exposed. */
export function copilotSolidContract(document: CadDocument, selection: string[]): CopilotSolidContract {
  const base: CopilotSolidContract = { units: "mm", parameters: [] };
  const reject = (disabledReason: string) => ({ ...base, disabledReason });
  if (selection.length !== 1) return reject("Select one solid to change its dimensions.");
  const id = selection[0], object = document.objects[id], index = new Map(Object.values(document.features).map(f => [f.output, f]));
  const feature = index.get(id), layer = object && document.layers[object.layerId];
  if (!object || !feature || featureContract(feature).representation !== "brep" || feature.pattern || feature.params.componentContent || feature.params.architecturalWall || feature.params.architecturalSlab)
    return reject("Select a supported solid source, rather than a drawing, pattern member or architectural component.");
  if (!object.visible || !layer?.visible || layer.locked) return reject("Show and unlock the selected solid and its layer first.");
  const ancestors = new Set<string>();
  const visit = (objectId: string) => { if (ancestors.has(objectId)) return; ancestors.add(objectId); index.get(objectId)?.inputs.forEach(visit); };
  visit(id);
  const sketches = new Set([...ancestors].map(key => index.get(key)?.params.sketchId).filter((key): key is string => typeof key === "string"));
  const inScope = (target: import("@agent-webcad/cad-document").ParameterTarget) => target.kind === "feature" ? ancestors.has(target.objectId) : sketches.has(target.sketchId);
  const parameters: SolidParameter[] = [];
  try {
    const values = evaluateVariables(document.variables), bindings = resolveParameterBindings(document);
    const depends = (names: string[], name: string, seen = new Set<string>()): boolean => names.some(key => {
      if (key === name) return true;
      if (seen.has(key)) return false; seen.add(key);
      return depends(values[key]?.dependencies ?? [], name, seen);
    });
    for (const [name, value] of Object.entries(values)) {
      if (value.quantity !== "length" || value.dependencies.length || !numericLength.test(document.variables![name].expression.trim())) continue;
      const uses = bindings.filter(binding => depends(binding.dependencies, name));
      if (!uses.length || uses.some(binding => !inScope(binding.binding.target))) continue;
      const editable = uses.every(({ binding }) => {
        const target = binding.target;
        const sourceLayer = target.kind === "feature" ? document.layers[document.objects[target.objectId]?.layerId] : document.layers[document.sketches?.[target.sketchId]?.layerId ?? ""];
        return sourceLayer?.visible && !sourceLayer.locked;
      });
      if (editable) parameters.push({ key: name, value: value.value, command: { type: "set-variable", name, quantity: "length", expression: `${value.value}mm` } });
    }
    const bound = new Set(bindings.filter(b => b.binding.target.kind === "feature" && b.binding.target.objectId === id).map(b => (b.binding.target as { parameter: string }).parameter));
    const fields = featureContract(feature).parameters.filter(field => field.quantity === "length" && typeof feature.params[field.key] === "number");
    const primitiveParams = Object.fromEntries(fields.map(field => [field.key, Number(feature.params[field.key])]));
    for (const field of fields) {
      if (bound.has(field.key)) continue;
      if (feature.type === "primitive") parameters.push({ key: field.key, value: Number(feature.params[field.key]), command: { type: "update-primitive", objectId: id, params: primitiveParams } });
      if (feature.type === "extrude" && field.key === "distance") parameters.push({ key: "distance", value: Number(feature.params.distance), command: { type: "update-extrude", objectId: id, distance: Number(feature.params.distance) } });
    }
    const match = /^plate_([a-f0-9]{32})_solid$/.exec(id);
    if (match) {
      const prefix = `plate_${match[1]}_`, plate = {} as MountingPlateSpec, plateVariables: Record<string, string> = {};
      for (const key of PLATE_FIELDS) { const entry = parameters.find(p => p.key === prefix + key); if (!entry) return reject("The plate's driving variables are shared, locked or unavailable. Inspect its source before editing."); plate[key] = entry.value; plateVariables[key] = entry.key; }
      validateMountingPlate(plate);
      return { units: "mm", targetId: id, name: object.name.slice(0, 200), parameters, plate, plateVariables };
    }
  } catch { return reject("The solid's parameter bindings are unresolved. Inspect and repair its variables first."); }
  if (parameters.length > 32) return reject("This solid exposes more than 32 driving dimensions. Inspect a smaller source before editing.");
  return parameters.length ? { units: "mm", targetId: id, name: object.name.slice(0, 200), ...feature.type === "primitive" ? {primitive: String(feature.params.kind ?? "box")} : {}, parameters } : reject("This solid has no supported editable length parameters. Select its source or inspect its bindings.");
}

export function solidParameterPlan(contract: CopilotSolidContract, key: string, value: number): CopilotPlan {
  if (!contract.targetId) throw new Error(contract.disabledReason ?? "Select one solid first.");
  const parameter = contract.parameters.find(p => p.key === key);
  if (!parameter || !Number.isFinite(value) || value < 0.01 || value > 10000) throw new Error("Choose an advertised solid parameter and a length between 0.01 and 10000 mm.");
  if (value === parameter.value) throw new Error("The dimension is unchanged. Enter a different value.");
  if (contract.plate && contract.plateVariables) {
    const field = PLATE_FIELDS.find(field => contract.plateVariables![field] === key);
    if (field) validateMountingPlate({ ...contract.plate, [field]: value });
  }
  const source = parameter.command;
  const command = source.type === "set-variable" ? { ...source, expression: `${value}mm` } : source.type === "update-extrude" ? { ...source, distance: value } : { ...source, params: { ...source.params, [key]: value } };
  if (!validateCommand(command)) throw new Error("Invalid solid dimension.");
  if (command.type === "update-primitive" && !validateFeatureParameters({ id: "check", type: "primitive", output: contract.targetId, inputs: [], params: { kind: contract.primitive, ...command.params } })) throw new Error("The requested dimensions do not form a valid primitive.");
  return { command, summary: [`${contract.name}: ${key.replace(/^plate_[a-f0-9]{32}_/, "")} ${parameter.value} → ${value} mm. Review dependent geometry and measurements before applying.`], ghosts: [], resultObjectIds: [contract.targetId] };
}

/** Gateway edit commands must be exactly one locally advertised scalar change. */
export function validateCopilotSolidCommand(command: CadCommand, contract?: CopilotSolidContract): CopilotPlan {
  if (!contract?.targetId) throw new Error(contract?.disabledReason ?? "Solid editing requires the captured edit selection.");
  for (const parameter of contract.parameters) {
    let value: number | undefined;
    if (command.type === "set-variable" && parameter.command.type === "set-variable" && command.name === parameter.command.name && command.quantity === "length" && /^\d+(?:\.\d+)?mm$/.test(command.expression)) value = Number(command.expression.slice(0, -2));
    if (command.type === "update-extrude" && parameter.command.type === "update-extrude" && command.objectId === contract.targetId) value = command.distance;
    if (command.type === "update-primitive" && parameter.command.type === "update-primitive" && command.objectId === contract.targetId) value = command.params[parameter.key];
    if (value === undefined || value === parameter.value) continue;
    const plan = solidParameterPlan(contract, parameter.key, value);
    // Structural equality ignores JSON property order, while rejecting extra fields and simultaneous edits.
    const expected = plan.command;
    if (command.type !== expected.type || Object.keys(command).sort().join() !== Object.keys(expected).sort().join()) continue;
    if (command.type === "update-primitive" && expected.type === "update-primitive") {
      if (Object.keys(command.params).sort().join() !== Object.keys(expected.params).sort().join() || Object.keys(expected.params).some(key => command.params[key] !== expected.params[key])) continue;
    } else if (Object.entries(expected).some(([key, value]) => command[key as keyof typeof command] !== value)) continue;
    return plan;
  }
  throw new Error("The proposal is outside the selected solid's advertised parameters. Change one dimension and Plan again.");
}

const aliases: Record<string, string[]> = { width: ["폭", "가로", "width"], depth: ["깊이", "세로", "depth"], thickness: ["두께", "thickness"], height: ["높이", "height"], margin: ["모서리 간격", "여백", "margin"], holeDiameter: ["구멍 지름", "hole diameter", "holediameter"], radius: ["반지름", "radius"], distance: ["돌출 거리", "돌출 높이", "distance"], radius1: ["radius1"], radius2: ["radius2"], majorRadius: ["majorradius"], minorRadius: ["minorradius"] };
const mm = (value: string, unit = "mm") => Number(value) * (unit === "cm" ? 10 : unit === "m" ? 1000 : 1);

export function planSolidPrompt(input: string, document?: CadDocument, selection: string[] = []): CopilotPlanResult | undefined {
  const text=input.trim().toLowerCase(),preserve=splitPlatePreservation(text);
  const normalized=preserve?preserve.edit:text;
  if(!preserve)try {const spec=parsePlateCreation(normalized);if(spec)return {ok:true,plan:mountingPlatePlan(spec)};}
  catch(error){return {ok:false,reason:(error as Error).message};}
  const edit = normalized.match(/^(?:선택한\s*(?:판|모델|객체|솔리드)의?\s*)?(.+?)(?:을|를)?\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)?\s*(?:로|으로|to)?\s*(?:바꿔줘|변경해줘|설정해줘|바꿔주세요|늘려줘|줄여줘|변경|설정|change|set)?[.!]?$/);
  if (!edit) return undefined;
  const name = edit[1].replace(/(?:을|를|만)$/, "").trim();
  const alias = Object.keys(aliases).find(key => aliases[key].includes(name));
  const contract = document ? copilotSolidContract(document, selection) : undefined;
  const candidates = contract?.parameters.filter(parameter => parameter.key.toLowerCase() === name || alias && (parameter.key === alias || parameter.key.endsWith(`_${alias}`) || alias === "thickness" && parameter.key === "distance")) ?? [];
  if (!alias && !candidates.length) return undefined;
  try {
    if (!contract) throw new Error("Select one solid to change its dimensions.");
    if (candidates.length !== 1) throw new Error(contract.disabledReason ?? "This dimension is unavailable or ambiguous. Inspect the selected solid's parameters first.");
    if(preserve&&(!contract.plate||Math.abs(contract.plate.margin-preserve.marginMm)>1e-9))throw Error("The requested preserved margin differs from the selected plate. Change its margin explicitly first.");
    if(preserve&&!/_(?:width|depth|thickness)$/.test(candidates[0].key))throw Error("Preserving hole margins is supported for plate width, depth or thickness edits.");
    const next=mm(edit[2],edit[3]);
    if(normalized.includes("늘려줘")&&next<candidates[0].value||normalized.includes("줄여줘")&&next>candidates[0].value)throw Error("The requested value conflicts with increase/decrease. Use an explicit change to the intended dimension.");
    const plan=solidParameterPlan(contract,candidates[0].key,next);
    if(preserve)plan.summary.push(`All four hole centers retain ${preserve.marginMm} mm from both adjacent edges through the existing parameter bindings.`);
    return {ok:true,plan};
  } catch (error) { return { ok: false, reason: (error as Error).message }; }
}
