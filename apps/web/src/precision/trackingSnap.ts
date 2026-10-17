import { planeToWorld, worldToPlane, type Vec3, type WorkPlane } from "./workPlane";

/** Acquired object-snap points are transient editor state, never CAD features. */
export type TrackingAnchor = { point: Vec3; objectId: string; topologyReference?: string; source: string };
export type TrackingAxis = "horizontal" | "vertical";
export type TrackingCandidate = { point: Vec3; axis: TrackingAxis | "intersection"; sources: string[]; distancePx: number };

export function trackingCandidates(raw: Vec3, anchors: TrackingAnchor[], plane: WorkPlane, project: (point: Vec3) => [number, number], tolerancePx: number, lock: TrackingAxis | null = null): TrackingCandidate[] {
  const cursor = project(raw), local = worldToPlane(raw, plane);
  const at = (point: [number, number]) => planeToWorld(point, plane);
  const candidates: TrackingCandidate[] = [];
  const add = (point: Vec3, axis: TrackingCandidate["axis"], sources: string[]) => {
    const screen = project(point), distancePx = Math.hypot(screen[0] - cursor[0], screen[1] - cursor[1]);
    if (Number.isFinite(distancePx) && distancePx <= tolerancePx) candidates.push({point, axis, sources, distancePx});
  };
  const localAnchors = anchors.map(anchor => ({...anchor, local:worldToPlane(anchor.point, plane)}));
  if (!lock && localAnchors.length > 1) for (const horizontal of localAnchors) for (const vertical of localAnchors) {
    if (horizontal === vertical) continue;
    add(at([vertical.local[0], horizontal.local[1]]), "intersection", [horizontal.source, vertical.source]);
  }
  for (const anchor of localAnchors) {
    if (lock !== "vertical") add(at([local[0], anchor.local[1]]), "horizontal", [anchor.source]);
    if (lock !== "horizontal") add(at([anchor.local[0], local[1]]), "vertical", [anchor.source]);
  }
  const unique = new Map<string, TrackingCandidate>();
  for (const candidate of candidates) {
    const key = candidate.point.map(value=>value.toFixed(7)).join(",");
    const previous = unique.get(key);
    if (!previous || (candidate.axis === "intersection" && previous.axis !== "intersection")) unique.set(key,candidate);
  }
  return [...unique.values()].sort((a,b)=>Number(b.axis==="intersection")-Number(a.axis==="intersection") || a.distancePx-b.distancePx || a.sources.join("|").localeCompare(b.sources.join("|")));
}
