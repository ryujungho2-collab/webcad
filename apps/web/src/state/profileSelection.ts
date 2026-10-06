import type { CadDocument } from "@agent-webcad/cad-document";

export type ProfileSplit = {
  profiles: string[];
  paths: string[];
  /** Selected ids that are neither (solids, dimensions, locked/hidden, ...). */
  others: string[];
};

/**
 * Splits a drawing selection for profile-based solids. Closed drawings
 * (rectangle/circle/closed polyline) are profile candidates; open drawings
 * (line/arc/open polyline) are sweep-path candidates. Anything else —
 * including hidden or locked members — lands in `others` and disables
 * sweep/loft creation. Sketch-owned projections stay eligible: they carry
 * ordinary drawing geometry.
 */
export function splitProfileSelection(document: CadDocument, ids: readonly string[]): ProfileSplit {
  const profiles: string[] = [];
  const paths: string[] = [];
  const others: string[] = [];
  for (const id of ids) {
    const object = document.objects[id];
    const layer = object ? document.layers[object.layerId] : undefined;
    const feature = Object.values(document.features).find((entry) => entry.output === id);
    if (!object || !feature || feature.type !== "drawing" || feature.params.construction === true || !object.visible || !layer?.visible || layer.locked) {
      others.push(id);
      continue;
    }
    const kind = String(feature.params.kind);
    if (kind === "rectangle" || kind === "circle" || (kind === "polyline" && feature.params.closed === true)) {
      profiles.push(id);
    } else if (kind === "line" || kind === "arc" || kind === "polyline") {
      paths.push(id);
    } else {
      others.push(id);
    }
  }
  return { profiles, paths, others };
}

export function sweepReady(document: CadDocument, ids: readonly string[]): { profile: string; path: string } | null {
  if (ids.length !== 2) return null;
  const split = splitProfileSelection(document, ids);
  if (split.others.length || split.profiles.length !== 1 || split.paths.length !== 1) return null;
  return { profile: split.profiles[0], path: split.paths[0] };
}

export function loftReady(document: CadDocument, ids: readonly string[]): string[] | null {
  if (ids.length < 2) return null;
  const split = splitProfileSelection(document, ids);
  if (split.others.length || split.paths.length || split.profiles.length !== ids.length) return null;
  return split.profiles;
}
