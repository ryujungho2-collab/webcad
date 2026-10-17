import type { SketchPoint } from "@agent-webcad/cad-document";
import { parseAngle, parseLength } from "./units";

export type PolarLocks = { length: number | null; angle: number | null };
export const emptyPolarLocks = (): PolarLocks => ({ length: null, angle: null });
export type PolarInputField = "length" | "angle";
/** A scalar edits the active field; explicit coordinates/polar pairs override locks. */
export function resolvePointInput(text: string, base?: SketchPoint, hover?: SketchPoint, locks = emptyPolarLocks(), field: PolarInputField = "length"): SketchPoint | null {
  if (!base || /[,<@#]/.test(text)) return parsePointEntry(text, base, hover, locks);
  if (!text.trim()) return parsePointEntry("", base, hover, locks);
  const value = field === "angle" ? parseAngle(text) : parseLength(text);
  if (value === null || field === "length" && value < 0) return null;
  return parsePointEntry("", base, hover, { ...locks, [field]: value });
}
export function applyPolarLocks(base: SketchPoint, raw: SketchPoint, locks: PolarLocks): SketchPoint {
  const distance = locks.length ?? Math.hypot(raw[0] - base[0], raw[1] - base[1]);
  const angle = (locks.angle ?? Math.atan2(raw[1] - base[1], raw[0] - base[0]) * 180 / Math.PI) * Math.PI / 180;
  return [base[0] + distance * Math.cos(angle), base[1] + distance * Math.sin(angle)];
}
/** x,y / #x,y are absolute; @x,y and @distance<angle use the acquired base. */
export function parsePointEntry(text: string, base?: SketchPoint, hover?: SketchPoint, locks = emptyPolarLocks()): SketchPoint | null {
  const relative = text.trim().startsWith("@"), absolute = text.trim().startsWith("#"), value = text.trim().replace(/^[@#]/, "");
  if (relative && !base) return null;
  if (value.includes(",")) {
    const parts = value.split(",").map((entry) => parseLength(entry));
    if (parts.length !== 2 || parts.some((entry) => entry === null)) return null;
    const point: SketchPoint = [parts[0]! + (relative ? base![0] : 0), parts[1]! + (relative ? base![1] : 0)];
    return point.every(Number.isFinite) ? point : null;
  }
  if (absolute || relative && !value) return null;
  if (!base) return null;
  if (!value && locks.length === null && locks.angle === null) return null;
  const parts = value.split("<");
  if (parts.length > 2) return null;
  const distance = parts[0] ? parseLength(parts[0]) : locks.length ?? (hover ? Math.hypot(hover[0] - base[0], hover[1] - base[1]) : null);
  const angle = parts.length === 2 ? parseAngle(parts[1]) : locks.angle ?? (hover ? Math.atan2(hover[1] - base[1], hover[0] - base[0]) * 180 / Math.PI : 0);
  if (distance === null || !Number.isFinite(distance) || distance < 0 || angle === null || !Number.isFinite(angle)) return null;
  const point: SketchPoint = [base[0] + distance * Math.cos(angle * Math.PI / 180), base[1] + distance * Math.sin(angle * Math.PI / 180)];
  return point.every(Number.isFinite) ? point : null;
}
