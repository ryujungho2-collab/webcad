/** Per-browser preference for how much empty space Fit leaves around geometry. */
export type FitMargin = "roomy" | "balanced" | "tight";
export const FIT_MARGINS: readonly { id: FitMargin; label: string; hint: string }[] = [
  { id: "roomy", label: "Roomy", hint: "Generous space around the geometry (default)" },
  { id: "balanced", label: "Balanced", hint: "Fills more of the view, clear of canvas buttons" },
  { id: "tight", label: "Tight", hint: "Fills the view as far as the canvas buttons allow" },
];
/** Pixel padding per side for the projected-rectangle fit. Roomy general fits use the bounding sphere instead. */
export const FIT_PADDING: Record<FitMargin, { x: number; top: number; bottom: number }> = {
  roomy: { x: 80, top: 150, bottom: 120 },
  balanced: { x: 60, top: 130, bottom: 100 },
  tight: { x: 40, top: 110, bottom: 80 },
};
const KEY = "agent-webcad-fit-margin";
const listeners = new Set<() => void>();
let current: FitMargin = (() => {
  try { const value = globalThis.localStorage?.getItem(KEY); return value === "balanced" || value === "tight" ? value : "roomy"; } catch { return "roomy"; }
})();
export function getFitMargin(): FitMargin { return current; }
export function setFitMargin(value: FitMargin) {
  if (value === current) return;
  current = value;
  try { globalThis.localStorage?.setItem(KEY, value); } catch { /* The choice still applies for this session. */ }
  for (const listener of listeners) listener();
}
export function subscribeFitMargin(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
