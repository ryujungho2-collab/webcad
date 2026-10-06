import { CadEngine } from "../runtime/CadEngine";
import { buildProfileWire, type ExtrudeProfile } from "./extrude";

/**
 * Lofts a solid through two or more closed section wires. Ruled lofts join
 * sections with straight spans; smooth lofts blend them. Mirrors the
 * extrude cleanup discipline throughout.
 */
export async function loftProfiles(profiles: ExtrudeProfile[], ruled = false): Promise<any> {
  if (!Array.isArray(profiles) || profiles.length < 2) {
    throw new Error("Loft needs at least two profiles.");
  }
  if (profiles.some((profile) => !profile.id || !profile.segments.length)) {
    throw new Error("Invalid loft profile.");
  }
  const oc = (await CadEngine.create()).oc;
  const temporaries: { delete?: () => void }[] = [];
  try {
    const loft = new oc.BRepOffsetAPI_ThruSections(true, ruled, 1e-4);
    temporaries.push(loft);
    for (const profile of profiles) {
      const wireMaker = buildProfileWire(oc, profile, temporaries);
      loft.AddWire(wireMaker.Wire());
    }
    loft.Build(new oc.Message_ProgressRange_1());
    if (typeof loft.IsDone === "function" && !loft.IsDone()) {
      throw new Error("OpenCascade loft failed.");
    }
    return loft.Shape();
  } finally {
    for (const value of temporaries.reverse()) value.delete?.();
  }
}
