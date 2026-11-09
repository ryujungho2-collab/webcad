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
  let phase="initialization";
  try {
    const loft = new oc.BRepOffsetAPI_ThruSections(true, ruled, 1e-4);
    temporaries.push(loft);
    const spline=profiles[0].segments[0];
    if(spline.kind==="spline"&&profiles.every(p=>p.segments.length===1&&p.segments[0].kind==="spline"&&p.segments[0].degree===spline.degree&&JSON.stringify(p.segments[0].knots)===JSON.stringify(spline.knots)))loft.CheckCompatibility(false);
    for (const profile of profiles) {
      phase=`section wire ${profile.id}`;
      const wireMaker = buildProfileWire(oc, profile, temporaries);
      const wire=wireMaker.Wire();temporaries.push(wire);loft.AddWire(wire);
    }
    phase="surface construction";
    const progress=new oc.Message_ProgressRange_1();temporaries.push(progress);loft.Build(progress);
    if (typeof loft.IsDone === "function" && !loft.IsDone()) {
      throw new Error("OpenCascade loft failed.");
    }
    return loft.Shape();
  } catch(error){throw Error(`Loft ${phase}: ${error instanceof Error?error.message:String(error)}`);} finally {
    for (const value of temporaries.reverse()) value.delete?.();
  }
}
