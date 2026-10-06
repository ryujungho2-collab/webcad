import { CadEngine } from "../runtime/CadEngine";
import { buildProfileWire, type ExtrudeProfile } from "./extrude";

export type SweepSpine = [number, number, number][];

const finitePoint = (point: [number, number, number]) =>
  point.length === 3 && point.every(Number.isFinite);

function validateSweep(profile: ExtrudeProfile, spine: SweepSpine) {
  if (!profile.id || !profile.segments.length || profile.segments.some((segment) => !segment.topologyReference)) {
    throw new Error("Invalid sweep profile.");
  }
  if (!Array.isArray(spine) || spine.length < 2 || !spine.every(finitePoint)) {
    throw new Error("Sweep spine needs at least two finite points.");
  }
  for (let index = 1; index < spine.length; index += 1) {
    const dx = spine[index][0] - spine[index - 1][0];
    const dy = spine[index][1] - spine[index - 1][1];
    const dz = spine[index][2] - spine[index - 1][2];
    if (Math.hypot(dx, dy, dz) <= 1e-9) {
      throw new Error("Sweep spine contains a zero-length span.");
    }
  }
}

function spineIsStraight(spine: SweepSpine): boolean {
  const [ax, ay, az] = [
    spine[1][0] - spine[0][0],
    spine[1][1] - spine[0][1],
    spine[1][2] - spine[0][2],
  ];
  const base = Math.hypot(ax, ay, az);
  if (base <= 1e-9) return false;
  return spine.every((point, index) => {
    if (index < 2) return true;
    const [bx, by, bz] = [point[0] - spine[0][0], point[1] - spine[0][1], point[2] - spine[0][2]];
    const cross = Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
    return cross <= 1e-9 * base * Math.hypot(bx, by, bz);
  });
}

/**
 * Sweeps a closed profile along an open spine into a solid. Straight spines
 * use a fixed-orientation mode (Frenet frames are undefined without
 * curvature); curved spines use Frenet frames. Mirrors the extrude
 * cleanup discipline: the returned shape outlives every temporary.
 */
export async function sweepProfile(profile: ExtrudeProfile, spine: SweepSpine): Promise<any> {
  validateSweep(profile, spine);
  const oc = (await CadEngine.create()).oc;
  const temporaries: { delete?: () => void }[] = [];
  try {
    const spineMaker = new oc.BRepBuilderAPI_MakeWire_1();
    temporaries.push(spineMaker);
    for (let index = 1; index < spine.length; index += 1) {
      const start = new oc.gp_Pnt_3(...spine[index - 1]);
      const end = new oc.gp_Pnt_3(...spine[index]);
      temporaries.push(start, end);
      const edgeMaker = new oc.BRepBuilderAPI_MakeEdge_3(start, end);
      temporaries.push(edgeMaker);
      if (!edgeMaker.IsDone()) throw new Error("OpenCascade rejected sweep spine span.");
      spineMaker.Add_1(edgeMaker.Edge());
    }
    if (!spineMaker.IsDone()) throw new Error("OpenCascade could not form the sweep spine wire.");
    const profileWire = buildProfileWire(oc, profile, temporaries);
    const shell = new oc.BRepOffsetAPI_MakePipeShell(spineMaker.Wire());
    temporaries.push(shell);
    if (spineIsStraight(spine)) {
      const location = new oc.gp_Pnt_3(...spine[0]);
      const direction = new oc.gp_Dir_4(profile.normal[0], profile.normal[1], profile.normal[2]);
      const [nx, ny, nz] = profile.normal;
      const helper: [number, number, number] = Math.abs(nz) < 0.9 ? [0, 0, 1] : [1, 0, 0];
      const xdir = new oc.gp_Dir_4(
        ny * helper[2] - nz * helper[1],
        nz * helper[0] - nx * helper[2],
        nx * helper[1] - ny * helper[0],
      );
      const fixed = new oc.gp_Ax2_2(location, direction, xdir);
      temporaries.push(location, direction, xdir, fixed);
      shell.SetMode_2(fixed);
    } else {
      shell.SetMode_1(true);
    }
    shell.Add_1(profileWire.Wire(), false, false);
    if (!shell.IsReady()) throw new Error("OpenCascade sweep setup failed.");
    shell.Build(new oc.Message_ProgressRange_1());
    if (!shell.MakeSolid()) throw new Error("OpenCascade sweep could not close a solid.");
    return shell.Shape();
  } finally {
    for (const value of temporaries.reverse()) value.delete?.();
  }
}
