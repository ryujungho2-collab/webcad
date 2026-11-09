import type { Vec3 } from "../precision/workPlane";

/** The world point the active viewport orbits around. New primitives are placed
 * there, on the ground plane, so they appear where the user is looking instead
 * of drifting along +X with every object created. */
let provider: (() => Vec3 | null) | null = null;

export function setViewFocusProvider(next: (() => Vec3 | null) | null): () => void {
  provider = next;
  return () => { if (provider === next) provider = null; };
}

export function viewFocusPoint(): Vec3 | null {
  try {
    const point = provider?.() ?? null;
    return point && point.every(Number.isFinite) ? point : null;
  } catch { return null; }
}
