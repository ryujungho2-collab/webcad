import { parseAngle, parseLength } from "./units";
import { parsePointEntry } from "./pointInput";
export type ParameterKind = "length" | "angle" | "count" | "coordinate";
export function parameterInput(text: string, kind: ParameterKind, options: { min?: number; minExclusive?: boolean; max?: number; relativeTo?: [number, number] } = {}) {
  const value = kind === "coordinate" ? parsePointEntry(text, options.relativeTo) : kind === "length" ? parseLength(text) : kind === "angle" ? parseAngle(text) : /^\s*\d+\s*$/.test(text) ? Number(text) : null;
  const valid = value !== null && (Array.isArray(value) || Number.isFinite(value) && (kind !== "count" || Number.isSafeInteger(value)) && (options.min === undefined || (options.minExclusive ? value > options.min : value >= options.min)) && (options.max === undefined || value <= options.max));
  return { value: valid ? value : null, valid, hint: kind === "coordinate" ? "U,V · @ΔU,ΔV · distance<angle · mm / cm / m / in" : `${kind === "length" ? "mm / cm / m / in / ft" : kind === "angle" ? "deg / rad" : "Whole number"}${options.min !== undefined ? ` · ${options.minExclusive ? ">" : "≥"} ${options.min}` : ""}${options.max !== undefined ? ` · ≤ ${options.max}` : ""}` };
}
