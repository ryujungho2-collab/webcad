import type { CadCommand } from "@agent-webcad/cad-commands";
import type { SketchConstraint } from "@agent-webcad/cad-document";

/** Independent length and angle relationships, rather than a rigid rectangle. */
export async function createConstrainedChain(apply: (command: CadCommand) => Promise<unknown>) {
  const ref = (geometryId: string, pointId: string) => ({ geometryId, pointId });
  await apply({ type: "create-sketch", id: "chain", workPlane: "XY" });
  await apply({ type: "add-sketch-geometry", sketchId: "chain", geometry: { id: "ab", kind: "line", startId: "a", endId: "b1", segmentId: "ab-edge", start: [0, 0], end: [50, 0] } });
  await apply({ type: "add-sketch-geometry", sketchId: "chain", geometry: { id: "bc", kind: "line", startId: "b2", endId: "c", segmentId: "bc-edge", start: [50, 0], end: [50, 30] } });
  const constraints: SketchConstraint[] = [
    { id: "join-b", kind: "coincident", first: ref("ab", "b1"), second: ref("bc", "b2") },
    { id: "ab-50", kind: "distance", first: ref("ab", "a"), second: ref("ab", "b1"), value: 50 },
    { id: "bc-30", kind: "distance", first: ref("bc", "b2"), second: ref("bc", "c"), value: 30 },
    { id: "right-angle", kind: "angle", firstLineId: "ab", secondLineId: "bc", value: Math.PI / 2 },
  ];
  for (const constraint of constraints) await apply({ type: "add-sketch-constraint", sketchId: "chain", constraint });
}
