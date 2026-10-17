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

export function validDimensionStyle(value: unknown): value is CadDimensionStyle {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const style = value as Record<string, unknown>;
  if (Object.keys(style).some(key => !["lengthUnit", "angleUnit", "precision", "textHeight", "arrowSize", "textGap", "paperScale"].includes(key))) return false;
  if (style.lengthUnit !== undefined && !["mm", "cm", "m", "in", "ft"].includes(String(style.lengthUnit))) return false;
  if (style.angleUnit !== undefined && !["deg", "rad"].includes(String(style.angleUnit))) return false;
  if (style.precision !== undefined && (!Number.isInteger(style.precision) || Number(style.precision) < 0 || Number(style.precision) > 6)) return false;
  return ["textHeight", "arrowSize", "textGap", "paperScale"].every(key => style[key] === undefined || typeof style[key] === "number" && Number.isFinite(style[key]) && (key === "textGap" ? style[key] >= 0 : style[key] > 0));
}
