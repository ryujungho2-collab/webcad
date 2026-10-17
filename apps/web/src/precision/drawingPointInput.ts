import type { SketchPoint } from "@agent-webcad/cad-document";
import { emptyPolarLocks, resolvePointInput, type PolarInputField, type PolarLocks } from "./pointInput";
import { parseAngle, parseLength } from "./units";

export type DrawingPointTool = "line" | "polyline" | "rectangle" | "circle" | "arc" | "circle-3point" | "arc-3point";
export type DrawingPointDraft = { point: SketchPoint; arc?: { radius: number; startAngle: number; endAngle: number } };
/** Resolve the same draft for numeric preview, Enter, and pointer confirmation. */
export function resolveDrawingPointInput(tool: DrawingPointTool, text: string, acquired: SketchPoint[], hover?: SketchPoint, locks: PolarLocks = emptyPolarLocks(), field: PolarInputField = "length"): DrawingPointDraft | null {
  const base = acquired.at(-1);
  if (!base) return null;
  const centre = acquired[0];
  if (tool === "rectangle" && !/^[@#]/.test(text.trim()) && /[,x]/i.test(text)) {
    const parts = text.split(/[,x]/i);
    if (parts.length !== 2) return null;
    const width = parseLength(parts[0]), height = parseLength(parts[1]);
    if (width === null || height === null || Math.abs(width) < 1e-9 || Math.abs(height) < 1e-9) return null;
    const point: SketchPoint = [centre[0] + width, centre[1] + height];
    return point.every(Number.isFinite) ? { point } : null;
  }
  if (tool === "arc" && acquired.length === 2 && !text.includes(",") && !/^[@#]/.test(text.trim()) && locks.length === null && locks.angle === null && field === "length") {
    const parts = text.split("<");
    if (parts.length > 2) return null;
    const sweep = parseAngle(parts.at(-1)!);
    const radius = parts.length === 2 && parts[0].trim() ? parseLength(parts[0]) : Math.hypot(base[0] - centre[0], base[1] - centre[1]);
    if (sweep === null || Math.abs(sweep) < 1e-9 || radius === null || radius <= 0) return null;
    const startAngle = Math.atan2(base[1] - centre[1], base[0] - centre[0]), endAngle = startAngle + sweep * Math.PI / 180;
    const point: SketchPoint = [centre[0] + radius * Math.cos(endAngle), centre[1] + radius * Math.sin(endAngle)];
    return point.every(Number.isFinite) ? { point, arc: { radius, startAngle, endAngle } } : null;
  }
  const point = resolvePointInput(text, base, hover, locks, field);
  if (!point) return null;
  if (tool === "rectangle" && (Math.abs(point[0] - centre[0]) < 1e-9 || Math.abs(point[1] - centre[1]) < 1e-9)) return null;
  if ((tool === "circle" || tool === "arc" && acquired.length === 1) && Math.hypot(point[0] - centre[0], point[1] - centre[1]) <= 1e-9) return null;
  if ((tool === "line" || tool === "polyline") && Math.hypot(point[0] - base[0], point[1] - base[1]) <= 1e-9) return null;
  return { point };
}
