export type CadVectorStyle = {
  stroke: string;
  fill: string | null;
  opacity: number;
  strokeWidth: number;
};

export const DEFAULT_VECTOR_STYLE: CadVectorStyle = {
  stroke: "#4f8cff",
  fill: null,
  opacity: 1,
  strokeWidth: 0.25,
};

export function validVectorStyle(value: unknown): value is CadVectorStyle {
  if (typeof value !== "object" || value === null) return false;
  const style = value as Record<string, unknown>;
  return typeof style.stroke === "string" && /^#[0-9a-f]{6}$/i.test(style.stroke)
    && (style.fill === null || typeof style.fill === "string" && /^#[0-9a-f]{6}$/i.test(style.fill))
    && typeof style.opacity === "number" && Number.isFinite(style.opacity) && style.opacity >= 0 && style.opacity <= 1
    && typeof style.strokeWidth === "number" && Number.isFinite(style.strokeWidth) && style.strokeWidth > 0 && style.strokeWidth <= 20;
}
