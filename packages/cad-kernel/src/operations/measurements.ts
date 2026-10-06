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

// Relative integration precision is independent of linear/angle modeling tolerances.
const PROPERTY_RELATIVE_TOLERANCE = 1e-10;
function assertIntegrationTolerance(value: number) {
  if (!Number.isFinite(value) || value <= 0 || value > 1e-3) throw new Error("Invalid BRep integration tolerance.");
}

export async function volume(shape: any, relativeTolerance = PROPERTY_RELATIVE_TOLERANCE): Promise<number> {
  assertIntegrationTolerance(relativeTolerance);
  const engine = await CadEngine.create();
  const oc = engine.oc;

  const props = new oc.GProp_GProps_1();

  try {
    oc.BRepGProp.VolumeProperties_2(shape, props, relativeTolerance, false, false);
    return props.Mass();
  } finally { props.delete(); }
}

export async function surfaceArea(shape: any, relativeTolerance = PROPERTY_RELATIVE_TOLERANCE): Promise<number> {
  assertIntegrationTolerance(relativeTolerance);
  const engine = await CadEngine.create();
  const oc = engine.oc;

  const props = new oc.GProp_GProps_1();

  try {
    oc.BRepGProp.SurfaceProperties_2(shape, props, relativeTolerance, false);
    return props.Mass();
  } finally { props.delete(); }
}

/** Uses analytic BRep properties and optimal bounds, never render triangles. */
export async function inspectShape(shape: any, relativeTolerance = PROPERTY_RELATIVE_TOLERANCE) {
  assertIntegrationTolerance(relativeTolerance);
  const { oc: instance } = await CadEngine.create();
  // The shipped runtime exposes these APIs although its generated declaration is incomplete.
  const oc = instance as unknown as Record<string, any>;
  if (!shape || shape.IsNull()) throw new Error("Cannot measure an empty shape.");
  const checker = new oc.BRepCheck_Analyzer(shape, true, false);
  const box = new oc.Bnd_Box_1();
  let min: any, max: any;
  try {
    const validity = checker.IsValid_2() ? "valid" as const : "invalid" as const;
    oc.BRepBndLib.AddOptimal(shape, box, false, false);
    if (box.IsVoid() || box.IsOpen()) throw new Error("Shape has no finite bounds.");
    min = box.CornerMin(); max = box.CornerMax();
    const bounds = { min: [min.X(), min.Y(), min.Z()] as [number, number, number],
      max: [max.X(), max.Y(), max.Z()] as [number, number, number] };
    const measuredVolume = Math.abs(await volume(shape, relativeTolerance));
    const area = Math.abs(await surfaceArea(shape, relativeTolerance));
    if (![measuredVolume, area, ...bounds.min, ...bounds.max].every(Number.isFinite)) throw new Error("Non-finite BRep measurement.");
    return { basis: "brep" as const, lengthUnit: "mm" as const, volume: measuredVolume, area, bounds, validity };
  } finally { max?.delete(); min?.delete(); box.delete(); checker.delete(); }
}
