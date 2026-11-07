/** Presentation settings shared by linear, radial, diameter, angular and chain dimensions. */
export type CadDimensionStyle = {
  lengthUnit?: "mm" | "cm" | "m" | "in" | "ft";
  angleUnit?: "deg" | "rad";
  precision?: number;
  textHeight?: number;
  arrowSize?: number;
  textGap?: number;
  paperScale?: number;
};

export type LinearDimensionPresetStyle = Required<Pick<CadDimensionStyle,
  "lengthUnit" | "precision" | "textHeight" | "arrowSize">>;

export type CadDimensionStylePreset = { name: string; style: LinearDimensionPresetStyle };

export const DEFAULT_LINEAR_DIMENSION_PRESET: Readonly<LinearDimensionPresetStyle> = {
  lengthUnit: "mm", precision: 2, textHeight: 4, arrowSize: 3,
};
export const MAX_DIMENSION_STYLE_PRESETS = 100;

export function dimensionStylePresetKey(name: string) {
  return name.trim().normalize("NFKC").toLowerCase();
}

export function validDimensionStylePresetName(name: unknown): name is string {
  return typeof name === "string" && name.trim().length > 0 && name.length <= 80 && !/\p{Cc}/u.test(name);
}

export function validLinearDimensionPresetStyle(style: unknown): style is LinearDimensionPresetStyle {
  if (!validDimensionStyle(style) || Object.keys(style).length !== 4) return false;
  return typeof style.lengthUnit === "string" && style.precision !== undefined &&
    style.textHeight !== undefined && style.textHeight >= 0.01 && style.textHeight <= 10000 &&
    style.arrowSize !== undefined && style.arrowSize >= 0.01 && style.arrowSize <= 10000;
}

export function validDimensionStylePresets(value: unknown): value is CadDimensionStylePreset[] {
  if (!Array.isArray(value) || value.length > MAX_DIMENSION_STYLE_PRESETS) return false;
  const names = new Set<string>();
  for (const preset of value) {
    if (!preset || typeof preset !== "object" || Array.isArray(preset) || Object.keys(preset).length !== 2 ||
        !validDimensionStylePresetName(preset.name) || preset.name !== preset.name.trim() ||
        !validLinearDimensionPresetStyle(preset.style)) return false;
    const key = dimensionStylePresetKey(preset.name);
    if (names.has(key)) return false;
    names.add(key);
  }
  return true;
}

export function validDimensionStyle(value: unknown): value is CadDimensionStyle {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const style = value as Record<string, unknown>;
  if (Object.keys(style).some(key => !["lengthUnit", "angleUnit", "precision", "textHeight", "arrowSize", "textGap", "paperScale"].includes(key))) return false;
  if (style.lengthUnit !== undefined && !["mm", "cm", "m", "in", "ft"].includes(String(style.lengthUnit))) return false;
  if (style.angleUnit !== undefined && !["deg", "rad"].includes(String(style.angleUnit))) return false;
  if (style.precision !== undefined && (!Number.isInteger(style.precision) || Number(style.precision) < 0 || Number(style.precision) > 6)) return false;
  return ["textHeight", "arrowSize", "textGap", "paperScale"].every(key => style[key] === undefined || typeof style[key] === "number" && Number.isFinite(style[key]) && (key === "textGap" ? style[key] >= 0 : style[key] > 0));
}
