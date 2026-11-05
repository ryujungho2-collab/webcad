import type { Vec3 } from "../precision/workPlane";

/** One-shot-per-click canvas point picking for panels that live outside the
 * viewport (Drafting text/block placement). The viewport owns hit testing on
 * the active work plane; a panel only receives the resulting world point.
 * The newest request wins; releasing an older one never clears a newer one. */
type PointPickRequest = { onPick: (point: Vec3) => void; hint: string };

let current: PointPickRequest | null = null;
const listeners = new Set<() => void>();
const notify = () => { for (const listener of listeners) listener(); };

export function requestPointPick(onPick: (point: Vec3) => void, hint = "Click the canvas to place"): () => void {
  const request: PointPickRequest = { onPick, hint };
  current = request; notify();
  return () => { if (current === request) { current = null; notify(); } };
}

export function activePointPick(): PointPickRequest | null { return current; }

export function subscribePointPick(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
