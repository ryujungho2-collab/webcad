import { CadEngine } from "../runtime/CadEngine";

export type ExtrudeProfileSegment =
  | {
      kind: "line";
      topologyReference: string;
      start: [number, number, number];
      end: [number, number, number];
    }
  | {
      kind: "arc";
      topologyReference: string;
      start: [number, number, number];
      mid: [number, number, number];
      end: [number, number, number];
    }
  | {
      kind: "circle";
      topologyReference: string;
      center: [number, number, number];
      radius: number;
      normal: [number, number, number];
      xAxis: [number, number, number];
    };

export type ExtrudeProfile = {
  id: string;
  normal: [number, number, number];
  segments: ExtrudeProfileSegment[];
};

const finitePoint = (point: [number, number, number]) =>
  point.length === 3 && point.every(Number.isFinite);

function validateProfile(profile: ExtrudeProfile, distance: number) {
  if (!profile.id || !finitePoint(profile.normal) || !Number.isFinite(distance) || Math.abs(distance) <= 1e-9) {
    throw new Error("Invalid extrusion profile or distance.");
  }
  if (!profile.segments.length || profile.segments.some((segment) => {
    if (!segment.topologyReference) return true;
    if (segment.kind === "line") return !finitePoint(segment.start) || !finitePoint(segment.end);
    if (segment.kind === "arc") return !finitePoint(segment.start) || !finitePoint(segment.mid) || !finitePoint(segment.end);
    return !finitePoint(segment.center) || !finitePoint(segment.normal) || !finitePoint(segment.xAxis) || !Number.isFinite(segment.radius) || segment.radius <= 1e-9;
  })) {
    throw new Error("Extrusion profile contains invalid geometry.");
  }
}

/** Builds an exact planar face and sweeps it with OpenCascade. */
export async function extrudeProfile(profile: ExtrudeProfile, distance: number): Promise<any> {
  validateProfile(profile, distance);
  const oc = (await CadEngine.create()).oc;
  const wireMaker = new oc.BRepBuilderAPI_MakeWire_1();
  const temporaries: { delete?: () => void }[] = [wireMaker];
  try {
    for (const segment of profile.segments) {
      let edgeMaker: any;
      if (segment.kind === "line") {
        const start = new oc.gp_Pnt_3(...segment.start);
        const end = new oc.gp_Pnt_3(...segment.end);
        temporaries.push(start, end);
        edgeMaker = new oc.BRepBuilderAPI_MakeEdge_3(start, end);
      } else if (segment.kind === "arc") {
        const start = new oc.gp_Pnt_3(...segment.start);
        const mid = new oc.gp_Pnt_3(...segment.mid);
        const end = new oc.gp_Pnt_3(...segment.end);
        const arcMaker = new oc.GC_MakeArcOfCircle_4(start, mid, end);
        const trimmed = arcMaker.Value();
        const curve = new oc.Handle_Geom_Curve_2(trimmed.get());
        temporaries.push(start, mid, end, arcMaker, trimmed, curve);
        edgeMaker = new oc.BRepBuilderAPI_MakeEdge_24(curve);
      } else {
        const center = new oc.gp_Pnt_3(...segment.center);
        const normal = new oc.gp_Dir_4(...segment.normal);
        const xAxis = new oc.gp_Dir_4(...segment.xAxis);
        const axis = new oc.gp_Ax2_2(center, normal, xAxis);
        const circle = new oc.gp_Circ_2(axis, segment.radius);
        temporaries.push(center, normal, xAxis, axis, circle);
        edgeMaker = new oc.BRepBuilderAPI_MakeEdge_8(circle);
      }
      temporaries.push(edgeMaker);
      if (!edgeMaker.IsDone()) throw new Error(`OpenCascade rejected profile edge ${segment.topologyReference}.`);
      wireMaker.Add_1(edgeMaker.Edge());
    }
    if (!wireMaker.IsDone()) throw new Error("OpenCascade could not form a closed profile wire.");
    const faceMaker = new oc.BRepBuilderAPI_MakeFace_15(wireMaker.Wire(), true);
    temporaries.push(faceMaker);
    if (!faceMaker.IsDone()) throw new Error("OpenCascade could not form a planar profile face.");
    const vector = new oc.gp_Vec_4(
      profile.normal[0] * distance,
      profile.normal[1] * distance,
      profile.normal[2] * distance,
    );
    const prism = new oc.BRepPrimAPI_MakePrism_1(faceMaker.Face(), vector, true, true);
    temporaries.push(vector, prism);
    if (!prism.IsDone()) throw new Error("OpenCascade extrusion failed.");
    return prism.Shape();
  } finally {
    for (const value of temporaries.reverse()) value.delete?.();
  }
}
