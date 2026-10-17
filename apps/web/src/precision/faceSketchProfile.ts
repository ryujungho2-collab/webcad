import type { Sketch } from "@agent-webcad/cad-document";
import type { ExtrudeProfile } from "@agent-webcad/cad-kernel";
import { recognizeSketchProfiles } from "./parametricProfiles";
import { sketchPointToWorld } from "./sketchAdapter";

/** A single exact, solved local loop projected through its resolved face frame. */
export function faceSketchExtrusionProfile(sketch: Sketch): { profile: ExtrudeProfile; sourceObjectIds: string[] } | null {
  if (!sketch.facePlaneId || !sketch.faceFrame || sketch.faceStatus !== "resolved") return null;
  const profiles = recognizeSketchProfiles(sketch);
  if (profiles.length !== 1) return null;
  const source = profiles[0];
  const segments: ExtrudeProfile["segments"] = source.boundary.map(segment => segment.kind === "circle"
    ? { kind: "circle", topologyReference: segment.topologyId, center: sketchPointToWorld(sketch, segment.center), radius: segment.radius, normal: [...sketch.faceFrame!.normal], xAxis: [...sketch.faceFrame!.xAxis] }
    : { kind: "line", topologyReference: segment.topologyId, start: sketchPointToWorld(sketch, segment.start), end: sketchPointToWorld(sketch, segment.end) });
  return { profile: { id: source.id, normal: [...sketch.faceFrame.normal], segments }, sourceObjectIds: [...new Set(source.sourceGeometryIds)] };
}
