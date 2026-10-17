export type CadVectorGradient = {
  type: "linear" | "radial";
  stops: { offset: number; color: string }[];
  angle?: number;
  cx?: number;
  cy?: number;
  r?: number;
};

export type CadVectorStyle = {
  stroke: string;
  fill: string | null;
  fillGradient: CadVectorGradient | null;
  opacity: number;
  strokeWidth: number;
};

export const DEFAULT_VECTOR_STYLE: CadVectorStyle = {
  stroke: "#4f8cff",
  fill: null,
  fillGradient: null,
  opacity: 1,
  strokeWidth: 0.25,
};

function validGradientStop(value: unknown): value is { offset: number; color: string } {
  if (typeof value !== "object" || value === null) return false;
  const stop = value as Record<string, unknown>;
  return typeof stop.offset === "number" && Number.isFinite(stop.offset) && stop.offset >= 0 && stop.offset <= 1
    && typeof stop.color === "string" && /^#[0-9a-f]{6}$/i.test(stop.color);
}

export function validVectorGradient(value: unknown): value is CadVectorGradient {
  if (typeof value !== "object" || value === null) return false;
  const gradient = value as Record<string, unknown>;
  if (!["linear", "radial"].includes(String(gradient.type))) return false;
  if (!Array.isArray(gradient.stops) || gradient.stops.length < 2 || gradient.stops.length > 8) return false;
  if (!gradient.stops.every(validGradientStop)) return false;
  if (gradient.type === "linear" && gradient.angle !== undefined && (typeof gradient.angle !== "number" || !Number.isFinite(gradient.angle))) return false;
  if (gradient.type === "radial") {
    const { cx, cy, r } = gradient;
    if (cx !== undefined && (typeof cx !== "number" || !Number.isFinite(cx))) return false;
    if (cy !== undefined && (typeof cy !== "number" || !Number.isFinite(cy))) return false;
    if (r !== undefined && (typeof r !== "number" || !Number.isFinite(r) || r <= 0)) return false;
  }
  return true;
}

export function validVectorStyle(value: unknown): value is CadVectorStyle {
  if (typeof value !== "object" || value === null) return false;
  const style = value as Record<string, unknown>;
  return typeof style.stroke === "string" && /^#[0-9a-f]{6}$/i.test(style.stroke)
    && (style.fill === null || typeof style.fill === "string" && /^#[0-9a-f]{6}$/i.test(style.fill))
    && (style.fillGradient === null || validVectorGradient(style.fillGradient))
    && typeof style.opacity === "number" && Number.isFinite(style.opacity) && style.opacity >= 0 && style.opacity <= 1
    && typeof style.strokeWidth === "number" && Number.isFinite(style.strokeWidth) && style.strokeWidth > 0 && style.strokeWidth <= 20;
}
