// MIT License
// Copyright (c) 2023 Cascade Studio
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

import { CadEngine } from "../runtime/CadEngine";
import type { ExtrudeProfile } from "./extrude";

export type RevolveAxis = {
  origin: [number, number, number];
  direction: [number, number, number];
};

const finitePoint = (point: [number, number, number]) =>
  point.length === 3 && point.every(Number.isFinite);

function validateRevolve(
  profile: ExtrudeProfile,
  axis: RevolveAxis,
  angleRadians: number
) {
  if (!profile.id || !Array.isArray(profile.segments) || !profile.segments.length) {
    throw new Error("Invalid revolve profile.");
  }
  if (!Array.isArray(axis?.origin) || !Array.isArray(axis?.direction)) {
    throw new Error("Invalid revolve axis.");
  }
  if (!finitePoint(axis.origin)) {
    throw new Error("Invalid revolve axis origin.");
  }
  const length = Math.hypot(axis.direction[0], axis.direction[1], axis.direction[2]);
  if (!Number.isFinite(length) || length <= 1e-9) {
    throw new Error("Invalid revolve axis direction.");
  }
  if (!Number.isFinite(angleRadians) || angleRadians <= 1e-9 || angleRadians > Math.PI * 2 + 1e-9) {
    throw new Error("Revolve angle must be within (0, 360] degrees.");
  }
  for (const segment of profile.segments) {
    if (!segment.topologyReference) {
      throw new Error("Extrusion profile contains invalid geometry.");
    }
  }
}

/**
 * Revolves a closed planar profile around an axis into a solid. The wire and
 * face construction mirrors extrudeProfile intentionally (shared helper
 * deferred until both call sites are covered by the same regression net):
 * any divergence between sweep and revolution faces would corrupt downstream
 * features silently.
 */
export async function revolveProfile(
  profile: ExtrudeProfile,
  axis: RevolveAxis,
  angleRadians: number
): Promise<any> {
  validateRevolve(profile, axis, angleRadians);
  const engine = await CadEngine.create();
  const oc = engine.oc;
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
        const axisDef = new oc.gp_Ax2_2(center, normal, xAxis);
        const circle = new oc.gp_Circ_2(axisDef, segment.radius);
        temporaries.push(center, normal, xAxis, axisDef, circle);
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
    const axisLength = Math.hypot(axis.direction[0], axis.direction[1], axis.direction[2]);
    const direction = new oc.gp_Dir_4(axis.direction[0] / axisLength, axis.direction[1] / axisLength, axis.direction[2] / axisLength);
    const location = new oc.gp_Pnt_3(axis.origin[0], axis.origin[1], axis.origin[2]);
    const revolutionAxis = new oc.gp_Ax1_2(location, direction);
    temporaries.push(direction, location, revolutionAxis);
    const revolution = new oc.BRepPrimAPI_MakeRevol_1(faceMaker.Face(), revolutionAxis, angleRadians, true);
    temporaries.push(revolution);
    if (typeof revolution.IsDone === "function" && !revolution.IsDone()) {
      throw new Error("OpenCascade revolution failed.");
    }
    return revolution.Shape();
  } finally {
    for (const value of temporaries.reverse()) value.delete?.();
  }
}
